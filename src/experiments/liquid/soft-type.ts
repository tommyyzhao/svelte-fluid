import { createFilm, type FilmOptions } from './film.js';
import type { LiquidExperiment, LiquidInput, LiquidSnapshot } from './types.js';
import { presentationSize } from './presentation-size.js';

export interface SoftTypeExperiment extends LiquidExperiment {
	tryPull(x: number, y: number): void;
	updateEnamelProfile(profile: NonNullable<FilmOptions['enamel']>): Promise<void>;
}

// A bounded, damped image deformation. The field moves the entire rendered
// material including its silhouette; it is not a volume-preserving soft body.
const GRID_WIDTH = 128;
const STIFFNESS = 150;
const DAMPING = 21;
const RADIUS = 0.2;
const MAX_PULL = 0.09;

function deformationShader(width: number, height: number, aspect: number) {
	return /* wgsl */ `
struct Input { anchor: vec4f, motion: vec4f };
@group(0) @binding(0) var<storage, read_write> state: array<vec4f>;
@group(0) @binding(1) var deformation: texture_storage_2d<rgba16float,write>;
@group(0) @binding(2) var<uniform> input: Input;
@compute @workgroup_size(8,8)
fn advance(@builtin(global_invocation_id) id: vec3u) {
	if (id.x >= ${width}u || id.y >= ${height}u) { return; }
	let index = id.y*${width}u+id.x;
	let uv = (vec2f(id.xy)+0.5)/vec2f(${width}.0,${height}.0);
	let offset = (uv-input.anchor.xy)*vec2f(${aspect},1.0);
	let weight = exp(-dot(offset,offset)/(2.0*${RADIUS}*${RADIUS}));
	// A rounded local press spreads the image radially; a drag adds a pull.
	let restOffset = weight*(input.motion.xy + offset*0.32*input.anchor.z);
	let previous = state[index];
	let dt = input.anchor.w;
	let velocity = (previous.zw + ${STIFFNESS}.0*dt*(restOffset-previous.xy))/(1.0+${DAMPING}.0*dt);
	let displacement = previous.xy + dt*velocity;
	state[index] = vec4f(displacement,velocity);
	textureStore(deformation,vec2i(id.xy),vec4f(displacement,velocity));
}
`;
}

function warpShader(aspect: number) {
	return /* wgsl */ `
@group(0) @binding(0) var material: texture_2d<f32>;
@group(0) @binding(1) var deformation: texture_2d<f32>;
@group(0) @binding(2) var imageSampler: sampler;
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) index: u32) -> Vertex {
	let points = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
	var out: Vertex;
	out.position = vec4f(points[index],0,1);
	out.uv = points[index]*vec2f(0.5,-0.5)+0.5;
	return out;
}
@fragment fn fragment(in: Vertex) -> @location(0) vec4f {
	// Invert y=x+d(x), rather than cutting a translated patch from the image.
	// The broad, bounded deformation stays locally invertible in normal use.
	var source = in.uv;
	for (var i=0; i<5; i++) {
		let offset = textureSampleLevel(deformation,imageSampler,source,0).xy/vec2f(${aspect},1.0);
		source = in.uv-offset;
	}
	if (any(source<vec2f(0)) || any(source>vec2f(1))) { return vec4f(0); }
	return textureSampleLevel(material,imageSampler,source,0);
}
`;
}

async function shader(device: GPUDevice, code: string, label: string) {
	const module = device.createShaderModule({ code, label });
	const errors = (await module.getCompilationInfo()).messages.filter((entry) => entry.type === 'error');
	if (errors.length) throw new Error(`${label}: ${errors.map((entry) => entry.message).join('\n')}`);
	return module;
}

export async function createSoftType(device: GPUDevice, format: GPUTextureFormat, options: FilmOptions): Promise<SoftTypeExperiment> {
	const aspect = (options.width ?? 160)/(options.height ?? 112);
	const gridHeight = Math.max(24,Math.round(GRID_WIDTH/aspect));
	const cells = GRID_WIDTH*gridHeight;
	const [computeModule,renderModule] = await Promise.all([
		shader(device,deformationShader(GRID_WIDTH,gridHeight,aspect),'Soft type damped displacement'),
		shader(device,warpShader(aspect),'Soft type complete silhouette warp')
	]);
	const compute = await device.createComputePipelineAsync({ layout: 'auto', compute: { module: computeModule, entryPoint: 'advance' } });
	const render = await device.createRenderPipelineAsync({ layout: 'auto',
		vertex: { module: renderModule, entryPoint: 'vertex' },
		fragment: { module: renderModule, entryPoint: 'fragment', targets: [{ format }] },
		primitive: { topology: 'triangle-list' }
	});
	const film = await createFilm(device,format,{ ...options, transparent: true });
	const state = device.createBuffer({ size: cells*16, usage: GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC });
	const inputBuffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST });
	const deformation = device.createTexture({ size: [GRID_WIDTH,gridHeight], format: 'rgba16float',
		usage: GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST });
	const computeGroup = device.createBindGroup({ layout: compute.getBindGroupLayout(0), entries: [
		{ binding: 0, resource: { buffer: state } }, { binding: 1, resource: deformation.createView() },
		{ binding: 2, resource: { buffer: inputBuffer } }
	] });
	const sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
	let material: GPUTexture | undefined, materialView: GPUTextureView, renderGroup: GPUBindGroup;
	let width = 0, height = 0, dirty = true, disposed = false;
	let anchorX = 0.5, anchorY = 0.5, pullX = 0, pullY = 0;
	let demoTime = 0, demoX = 0.5, demoY = 0.5;
	// Repeated steps in one command submission use the same captured uniforms.
	let captureEncoder: GPUCommandEncoder | undefined;
	let captured: Float32Array<ArrayBuffer>;

	function resize(nextWidth: number,nextHeight: number) {
		if (disposed) return;
		const native = presentationSize(nextWidth,nextHeight,1,device.limits.maxTextureDimension2D);
		if (width === native.width && height === native.height) return;
		let candidate: GPUTexture | undefined;
		device.pushErrorScope('validation'); device.pushErrorScope('out-of-memory');
		try {
			candidate = device.createTexture({ label: 'Soft type native material source', size: [native.width,native.height], format,
				usage: GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING });
			const view = candidate.createView();
			const group = device.createBindGroup({ layout: render.getBindGroupLayout(0), entries: [
				{ binding: 0, resource: view }, { binding: 1, resource: deformation.createView() },
				{ binding: 2, resource: sampler }
			] });
			const previous = material;
			material = candidate; materialView = view; renderGroup = group;
			width = native.width; height = native.height;
			previous?.destroy();
		} catch (error) { candidate?.destroy(); throw error; }
		finally {
			void Promise.all([device.popErrorScope(), device.popErrorScope()]).then((errors) => {
				const error = errors.find((entry) => entry !== null);
				// The synchronous resize contract cannot return a late GPU rejection.
				// Forward it to the existing session's terminal fallback boundary.
				if (error && !disposed) device.dispatchEvent(new GPUUncapturedErrorEvent('uncapturederror', { error }));
			});
		}
		film.resize(width,height); dirty = true;
	}

	return {
		get memoryBytes() { return film.memoryBytes+cells*24+32+width*height*4; },
		resize,
		async updateEnamelProfile(profile) {
			if (disposed) return;
			await film.updateEnamelProfile(profile);
			if (!disposed) dirty = true;
		},
		tryPull(x: number,y: number) {
			if (disposed) return;
			demoX = x; demoY = y; demoTime = 1.65;
		},
		reset() {
			if (disposed) return;
			device.queue.writeBuffer(state,0,new Float32Array(cells*4));
			device.queue.writeTexture({ texture: deformation },new Uint16Array(cells*4),
				{ bytesPerRow: GRID_WIDTH*8 },[GRID_WIDTH,gridHeight]);
			pullX = pullY = demoTime = 0; captureEncoder = undefined;
			film.reset(); dirty = true;
		},
		step(encoder: GPUCommandEncoder,dt: number,input: LiquidInput) {
			if (disposed || !Number.isFinite(dt) || dt <= 0) return;
			const stepDt = Math.min(dt,1/60);
			if (captureEncoder !== encoder) {
				captureEncoder = encoder;
				let press = Math.max(0,Math.min(1,input.press ?? 0));
				// Local velocity, never an accumulating pointer-enter anchor. Motion
				// bends the contour; a still pointer leaves no target displacement.
				anchorX = input.x; anchorY = input.y;
				pullX = input.active ? input.vx*aspect*0.11 : 0;
				pullY = input.active ? input.vy*0.11 : 0;
				if (demoTime > 0) {
					const progress = 1-demoTime/1.65;
					const amount = Math.sin(Math.min(1,progress/0.68)*Math.PI/2);
					anchorX = demoX; anchorY = demoY;
					pullX = progress < 0.72 ? MAX_PULL*amount : 0;
					pullY = progress < 0.72 ? -MAX_PULL*0.45*amount : 0;
					press = progress < 0.72 ? 0.55 : 0;
				}
				const magnitude = Math.hypot(pullX,pullY);
				if (magnitude > MAX_PULL) { pullX *= MAX_PULL/magnitude; pullY *= MAX_PULL/magnitude; }
				captured = new Float32Array([anchorX,anchorY,press,stepDt,pullX,pullY,0,0]);
				device.queue.writeBuffer(inputBuffer,0,captured);
			}
			demoTime = Math.max(0,demoTime-stepDt);
			const pass = encoder.beginComputePass({ label: 'Soft type damped outline displacement' });
			pass.setPipeline(compute); pass.setBindGroup(0,computeGroup);
			pass.dispatchWorkgroups(Math.ceil(GRID_WIDTH/8),Math.ceil(gridHeight/8)); pass.end();
		},
		render(encoder: GPUCommandEncoder,target: GPUTextureView) {
			if (disposed) return;
			if (!material) throw new Error('Resize soft type to its presentation dimensions before rendering.');
			if (dirty) { film.render(encoder,materialView); dirty = false; }
			const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store',
				clearValue: { r: 0,g: 0,b: 0,a: 0 } }] });
			pass.setPipeline(render); pass.setBindGroup(0,renderGroup); pass.draw(3); pass.end();
		},
		async inspect(): Promise<LiquidSnapshot> {
			if (disposed) throw new Error('Soft type has been disposed.');
			const readback = device.createBuffer({ size: cells*16, usage: GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ });
			try {
				const encoder = device.createCommandEncoder();
				encoder.copyBufferToBuffer(state,0,readback,0,cells*16); device.queue.submit([encoder.finish()]);
				await readback.mapAsync(GPUMapMode.READ);
				const values = new Float32Array(readback.getMappedRange());
				let finite = true, energy = 0, velocitySquared = 0, peak = 0, jacobian = 1;
				for (let i=0;i<cells;i++) {
					const offset = i*4;
					for (let c=0;c<4;c++) finite &&= Number.isFinite(values[offset+c]);
					const magnitude2 = values[offset]**2+values[offset+1]**2;
					velocitySquared += values[offset+2]**2+values[offset+3]**2;
					energy += magnitude2; peak = Math.max(peak,Math.sqrt(magnitude2));
					if (i%GRID_WIDTH+1<GRID_WIDTH && Math.floor(i/GRID_WIDTH)+1<gridHeight) {
						const dx = (values[offset+4]-values[offset])*GRID_WIDTH/aspect;
						const dy = (values[offset+GRID_WIDTH*4+1]-values[offset+1])*gridHeight;
						const crossX = (values[offset+GRID_WIDTH*4]-values[offset])*gridHeight;
						const crossY = (values[offset+5]-values[offset+1])*GRID_WIDTH/aspect;
						jacobian = Math.min(jacobian,(1+dx)*(1+dy)-crossX*crossY);
					}
				}
				return { finite,mass: 0,initialMass: 0,min: 0,max: peak,kinetic: velocitySquared/cells,
					details: { displacementRms: Math.sqrt(energy/cells),maxDisplacement: peak,minJacobian: jacobian,
						gridWidth: GRID_WIDTH,gridHeight } };
			} finally { readback.destroy(); }
		},
		dispose() {
			if (disposed) return;
			disposed = true; film.dispose(); state.destroy(); inputBuffer.destroy(); deformation.destroy(); material?.destroy();
		}
	};
}
