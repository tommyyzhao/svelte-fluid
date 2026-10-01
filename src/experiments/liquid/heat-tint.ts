import type { LiquidExperiment, LiquidInput, LiquidSnapshot } from './types.js';

export interface HeatTintExperiment extends LiquidExperiment {
	/** Finish cooling immediately without erasing accumulated oxide. */
	cool(): void;
}

const WIDTH = 192, HEIGHT = 112, CELLS = WIDTH * HEIGHT;
const ASPECT = WIDTH / HEIGHT;
const MAX_OXIDE_NM = 360;

// Motivation, not calibration: Kim et al., Color of Copper/Copper Oxide (2021),
// https://arxiv.org/abs/2107.07175. Real color includes complex dielectric
// absorption and Fresnel reflection; this tiny model retains optical-path phase
// at three wavelengths only. It is not a predictive metal/alloy model.

const computeSource = /* wgsl */ `
struct Input { pointer: vec4f, timing: vec4f };
@group(0) @binding(0) var<storage,read> source: array<vec2f>;
@group(0) @binding(1) var<storage,read_write> destination: array<vec2f>;
@group(0) @binding(2) var field: texture_storage_2d<rgba16float,write>;
@group(0) @binding(3) var<uniform> input: Input;
fn temperature(x: i32,y: i32) -> f32 {
	return source[u32(clamp(y,0,${HEIGHT - 1}))*${WIDTH}u+u32(clamp(x,0,${WIDTH - 1}))].x;
}
@compute @workgroup_size(8,8)
fn advance(@builtin(global_invocation_id) id: vec3u) {
	if (id.x >= ${WIDTH}u || id.y >= ${HEIGHT}u) { return; }
	let index = id.y*${WIDTH}u+id.x;
	let previous = source[index];
	var heat = 0.0;
	var oxide = previous.y;
	if (input.timing.y == 0.0) {
		let dt = input.timing.x;
		// Positive local heat diffusion plus exponential cooling to ambient.
		let a = min(0.00022*${HEIGHT * HEIGHT}.0*dt,0.24);
		let x = i32(id.x); let y = i32(id.y);
		let diffused = (1.0-4.0*a)*previous.x + a*(temperature(x-1,y)+temperature(x+1,y)+temperature(x,y-1)+temperature(x,y+1));
		let uv = (vec2f(id.xy)+0.5)/vec2f(${WIDTH}.0,${HEIGHT}.0);
		let distance = (uv-input.pointer.xy)*vec2f(${ASPECT},1.0);
		let footprint = exp(-dot(distance,distance)/(2.0*0.043*0.043));
		let cooled = diffused*exp(-2.1*dt);
		heat = 1.0-(1.0-cooled)*exp(-input.pointer.z*footprint*dt);
		// Illustrative thermal activation, followed by bounded parabolic growth.
		// Temperature and oxide scales organize the response; no alloy is calibrated.
		let kelvin = 300.0+900.0*heat;
		let activation = exp(-6000.0*(1.0/kelvin-1.0/1200.0));
		if (heat>0.04) {
			let growth = 0.95*activation;
			oxide = min(1.0,sqrt(previous.y*previous.y + (1.0-previous.y*previous.y)*(1.0-exp(-growth*dt))));
		}
	}
	destination[index] = vec2f(heat,oxide);
	textureStore(field,vec2i(id.xy),vec4f(heat,oxide,0,1));
}
`;

const renderSource = /* wgsl */ `
@group(0) @binding(0) var field: texture_2d<f32>;
@group(0) @binding(1) var fieldSampler: sampler;
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) index: u32) -> Vertex {
	let points = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
	var out: Vertex;
	out.position = vec4f(points[index],0,1);
	out.uv = points[index]*vec2f(0.5,-0.5)+0.5;
	return out;
}
@fragment fn fragment(in: Vertex) -> @location(0) vec4f {
	let state = textureSample(field,fieldSampler,in.uv).xy;
	let uv = (in.uv-0.5)*vec2f(${ASPECT},1.0);
	let view = normalize(vec3f(-uv,2.8));
	let filmCosine = sqrt(1.0-(1.0-view.z*view.z)/(2.2*2.2));
	let thickness = state.y*${MAX_OXIDE_NM}.0;
	// Three representative wavelengths, not an arbitrary animated hue wheel.
	// The interference phase follows optical path length through the oxide.
	let phase = 12.5663706*2.2*thickness*filmCosine/vec3f(650.0,550.0,450.0);
	let reflectance = 0.46+0.40*cos(phase);
	let keyOffset = uv+vec2f(0.35,0.5);
	let ribbonOffset = uv.x-0.4+uv.y*0.65;
	let key = exp(-dot(keyOffset*vec2f(1.8,3.0),keyOffset));
	let ribbon = exp(-12.0*ribbonOffset*ribbonOffset);
	let light = 0.33+0.48*key+0.19*ribbon;
	let bare = vec3f(0.52,0.55,0.59)*light;
	let coating = reflectance*vec3f(0.79,0.85,0.95)*light;
	var color = mix(bare,coating,1.0-exp(-thickness/11.0));
	// Temporary heat is distinct from the lasting optical film.
	color += vec3f(0.14,0.034,0.004)*pow(state.x,4.0);
	let edge = smoothstep(0.0,0.022,min(min(in.uv.x,1.0-in.uv.x),min(in.uv.y,1.0-in.uv.y)));
	color *= 0.88+0.12*edge;
	return vec4f(pow(max(color,vec3f(0)),vec3f(1.0/2.2)),1.0);
}
`;

async function checkedShader(device: GPUDevice,code: string,label: string) {
	const module = device.createShaderModule({ code,label });
	const errors = (await module.getCompilationInfo()).messages.filter((entry) => entry.type === 'error');
	if (errors.length) throw new Error(`${label}: ${errors.map((entry) => entry.message).join('\n')}`);
	return module;
}

export async function createHeatTint(device: GPUDevice,format: GPUTextureFormat): Promise<HeatTintExperiment> {
	const [computeModule,renderModule] = await Promise.all([
		checkedShader(device,computeSource,'Heat diffusion and oxide history'),
		checkedShader(device,renderSource,'Oxide optical path color')
	]);
	const compute = await device.createComputePipelineAsync({ layout: 'auto',compute: { module: computeModule,entryPoint: 'advance' } });
	const render = await device.createRenderPipelineAsync({ layout: 'auto',
		vertex: { module: renderModule,entryPoint: 'vertex' },
		fragment: { module: renderModule,entryPoint: 'fragment',targets: [{ format }] },primitive: { topology: 'triangle-list' }
	});
	const state = [0,1].map(() => device.createBuffer({ size: CELLS*8,
		usage: GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST }));
	const uniforms = [0,1].map(() => device.createBuffer({ size: 32,usage: GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST }));
	device.queue.writeBuffer(uniforms[1],0,new Float32Array([0,0,0,0,0,1,0,0]));
	const field = device.createTexture({ size: [WIDTH,HEIGHT],format: 'rgba16float',
		usage: GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST });
	const fieldView = field.createView();
	const groups = uniforms.map((uniform) => state.map((source,index) => device.createBindGroup({ layout: compute.getBindGroupLayout(0),entries: [
		{ binding: 0,resource: { buffer: source } },{ binding: 1,resource: { buffer: state[1-index] } },
		{ binding: 2,resource: fieldView },{ binding: 3,resource: { buffer: uniform } }
	] })));
	const renderGroup = device.createBindGroup({ layout: render.getBindGroupLayout(0),entries: [
		{ binding: 0,resource: fieldView },{ binding: 1,resource: device.createSampler({ minFilter: 'linear',magFilter: 'linear' }) }
	] });
	let current = 0,pendingCool = false,disposed = false;
	function dispatch(encoder: GPUCommandEncoder,cooling = false) {
		const pass = encoder.beginComputePass({ label: cooling ? 'Finish cooling, retain history' : 'Heat and oxidation' });
		pass.setPipeline(compute); pass.setBindGroup(0,groups[cooling ? 1 : 0][current]);
		pass.dispatchWorkgroups(Math.ceil(WIDTH/8),Math.ceil(HEIGHT/8)); pass.end(); current = 1-current;
	}
	function finishCooling(encoder: GPUCommandEncoder) { if (pendingCool) { dispatch(encoder,true); pendingCool = false; } }
	return {
		memoryBytes: CELLS*24+64,
		resize() { /* Simulation and retained marks are independent of display pixels. */ },
		cool() { if (!disposed) pendingCool = true; },
		reset() {
			if (disposed) return;
			for (const buffer of state) device.queue.writeBuffer(buffer,0,new Float32Array(CELLS*2));
			device.queue.writeTexture({ texture: field },new Uint16Array(CELLS*4),{ bytesPerRow: WIDTH*8 },[WIDTH,HEIGHT]);
			current = 0; pendingCool = false;
		},
		step(encoder: GPUCommandEncoder,dt: number,input: LiquidInput) {
			if (disposed || !Number.isFinite(dt) || dt<=0) return;
			finishCooling(encoder);
			const speed = Math.hypot(input.vx*ASPECT,input.vy);
			const power = input.active ? 72*Math.min(1,speed/0.25) : 0;
			device.queue.writeBuffer(uniforms[0],0,new Float32Array([input.x,input.y,power,0,Math.min(dt,1/30),0,0,0]));
			dispatch(encoder);
		},
		render(encoder: GPUCommandEncoder,target: GPUTextureView) {
			if (disposed) return;
			finishCooling(encoder);
			const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target,loadOp: 'clear',storeOp: 'store',
				clearValue: { r: 0.3,g: 0.3,b: 0.3,a: 1 } }] });
			pass.setPipeline(render); pass.setBindGroup(0,renderGroup); pass.draw(3); pass.end();
		},
		async inspect(): Promise<LiquidSnapshot> {
			if (disposed) throw new Error('Heat tint has been disposed.');
			const staging = device.createBuffer({ size: CELLS*8,usage: GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ });
			try {
				const encoder = device.createCommandEncoder(); finishCooling(encoder);
				encoder.copyBufferToBuffer(state[current],0,staging,0,CELLS*8); device.queue.submit([encoder.finish()]);
				await staging.mapAsync(GPUMapMode.READ);
				const values = new Float32Array(staging.getMappedRange());
				let finite = true,heat = 0,oxide = 0,maxHeat = 0,maxOxide = 0,min = 1;
				for (let i=0;i<CELLS;i++) {
					const t = values[i*2],d = values[i*2+1]; finite &&= Number.isFinite(t)&&Number.isFinite(d);
					heat += t; oxide += d; maxHeat = Math.max(maxHeat,t); maxOxide = Math.max(maxOxide,d); min = Math.min(min,t,d);
				}
				return { finite,mass: oxide,initialMass: 0,min,max: Math.max(maxHeat,maxOxide),kinetic: 0,
					details: { meanHeat: heat/CELLS,maxHeat,meanOxideNm: oxide/CELLS*MAX_OXIDE_NM,
						maxOxideNm: maxOxide*MAX_OXIDE_NM,oxideHistory: oxide } };
			} finally { staging.destroy(); }
		},
		dispose() {
			if (disposed) return; disposed = true;
			state.forEach((buffer) => buffer.destroy()); uniforms.forEach((buffer) => buffer.destroy()); field.destroy();
		}
	};
}
