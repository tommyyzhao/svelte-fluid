import type { LiquidExperiment, LiquidInput, LiquidSnapshot } from './types.js';

/** A topology study, not mercury physics: anchored particles + an implicit surface. */
export interface MercuryOptions {
	/** Width of the additive density target, independently of display resolution. */
	gridSize?: number;
	particleCount?: number;
}

const ASPECT = 2.2;
const STRIDE = 8;
const DEFAULT_PARTICLES = 1800;
const DEFAULT_GRID = 768;
const RADIUS = 0.034;

function particles(count: number): Float32Array<ArrayBuffer> {
	const canvas = new OffscreenCanvas(1100, 500);
	const context = canvas.getContext('2d');
	if (!context) throw new Error('The mercury study needs a 2D canvas to seed its lettering.');
	context.font = '900 360px Arial, sans-serif';
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	context.fillStyle = '#fff';
	context.fillText('MELT', 550, 255, 975);
	const data = context.getImageData(0, 0, 1100, 500).data;
	const lattice = (spacing: number) => {
		const points: Array<[number, number]> = [];
		for (let row = 0, y = 10; y < 490; row++, y += spacing * Math.sqrt(3) / 2) {
			for (let x = 10 + (row % 2) * spacing / 2; x < 1090; x += spacing) {
				if (data[(Math.round(y) * 1100 + Math.round(x)) * 4 + 3] > 220) points.push([x, y]);
			}
		}
		return points;
	};
	// A regular hexagonal rest lattice matters: random point density creates
	// arbitrary holes and a gravelly normal field before anything even moves.
	let lower = 1; let upper = 60; let candidates: Array<[number, number]> = [];
	for (let iteration = 0; iteration < 14; iteration++) {
		const spacing = (lower + upper) / 2;
		const proposal = lattice(spacing);
		if (proposal.length >= count) { lower = spacing; candidates = proposal; }
		else upper = spacing;
	}
	if (!candidates.length) throw new Error('Could not rasterize the mercury glyph.');
	let seed = 0x19f17;
	const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
	const state = new Float32Array(count * STRIDE);
	for (let index = 0; index < count; index++) {
		const point = candidates[Math.floor((index + 0.5) * candidates.length / count)];
		const x = (point[0] / 1100 - 0.5) * ASPECT;
		const y = point[1] / 500 - 0.5;
		state.set([x, y, 0, 0, x, y, random(), 0], index * STRIDE);
	}
	return state;
}

function computeSource(count: number): string {
	return /* wgsl */ `
struct Particle { position: vec2f, velocity: vec2f, anchor: vec2f, seed: f32, pad: f32 };
struct Parameters { pointer: vec4f, settings: vec4f };
@group(0) @binding(0) var<storage,read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: Parameters;
@compute @workgroup_size(64)
fn update(@builtin(global_invocation_id) id: vec3u) {
	if (id.x >= ${count}u) { return; }
	var p = particles[id.x];
	let dt = params.settings.x;
	let distance = p.position-params.pointer.xy;
	let influence = exp(-dot(distance,distance)/(2.0*0.105*0.105))*params.settings.y;
	let restForce = (p.anchor-p.position)*(3.5+3.0*p.seed);
	p.velocity += restForce*dt;
	p.velocity *= exp(-2.6*dt);
	// The moving pointer acts as a local drag field. There is no hidden click,
	// emitter, teleportation, density constraint, or particle-particle force.
	p.velocity = mix(p.velocity,params.pointer.zw*1.6,1.0-exp(-28.0*influence*dt));
	let speed = length(p.velocity);
	if (speed > 3.8) { p.velocity *= 3.8/speed; }
	p.position += p.velocity*dt;
	let lo = vec2f(-1.08,-0.47);
	let hi = vec2f(1.08,0.47);
	if (p.position.x < lo.x || p.position.x > hi.x) { p.velocity.x *= -0.25; }
	if (p.position.y < lo.y || p.position.y > hi.y) { p.velocity.y *= -0.25; }
	p.position = clamp(p.position,lo,hi);
	particles[id.x] = p;
}
`;
}

const DENSITY_SOURCE = /* wgsl */ `
struct Particle { position: vec2f, velocity: vec2f, anchor: vec2f, seed: f32, pad: f32 };
@group(0) @binding(0) var<storage,read> particles: array<Particle>;
struct Vertex { @builtin(position) position: vec4f, @location(0) local: vec2f };
@vertex fn vertex(@builtin(vertex_index) vertexId: u32,@builtin(instance_index) instance: u32) -> Vertex {
	let corners = array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1));
	let local = corners[vertexId];
	let center = particles[instance].position;
	let position = center+local*${RADIUS};
	var out: Vertex;
	out.position = vec4f(position*vec2f(${2 / ASPECT},-2.0),0,1);
	out.local = local;
	return out;
}
@fragment fn fragment(in: Vertex) -> @location(0) f32 {
	let r2 = dot(in.local,in.local);
	let weight = exp(-3.8*r2)*(1.0-smoothstep(0.80,1.0,r2));
	return weight;
}
`;

const DISPLAY_SOURCE = /* wgsl */ `
@group(0) @binding(0) var density: texture_2d<f32>;
@group(0) @binding(2) var<uniform> presentation: vec4f;
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) id: u32) -> Vertex {
	let positions = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
	var out: Vertex;
	out.position = vec4f(positions[id],0,1);
	out.uv = positions[id]*vec2f(0.5,-0.5)+0.5;
	return out;
}
fn cubic(f: f32) -> vec4f {
	let f2 = f*f; let f3 = f2*f; let one = 1.0-f;
	return vec4f(one*one*one,3.0*f3-6.0*f2+4.0,-3.0*f3+3.0*f2+3.0*f+1.0,f3)/6.0;
}
fn cubicDerivative(f: f32) -> vec4f {
	return vec4f(-0.5*(1.0-f)*(1.0-f),1.5*f*f-2.0*f,-1.5*f*f+f+0.5,0.5*f*f);
}
// One positive C2 reconstruction supplies both coverage and exact derivatives.
// Differencing several bilinear samples produced mirror-normal kinks at texel
// boundaries. Cubic B-splines do not overshoot into negative particle density.
fn reconstruct(uv: vec2f) -> vec3f {
	let size = vec2i(textureDimensions(density));
	let p = uv*vec2f(size)-0.5;
	let base = vec2i(floor(p))-1; let f = fract(p);
	let wx = cubic(f.x); let wy = cubic(f.y);
	let dx = cubicDerivative(f.x); let dy = cubicDerivative(f.y);
	var result = vec3f(0.0);
	for (var y = 0; y < 4; y++) {
		for (var x = 0; x < 4; x++) {
			let q = clamp(base+vec2i(x,y),vec2i(0),size-1);
			let value = textureLoad(density,q,0).r;
			result += value*vec3f(wx[x]*wy[y],dx[x]*wy[y],wx[x]*dy[y]);
		}
	}
	return result*vec3f(1.0,vec2f(size)/vec2f(${ASPECT},1.0));
}
fn studio(direction: vec3f) -> vec3f {
	// Mirror reflections can cross a whole light strip inside one display
	// pixel. Integrate that footprint instead of exposing subpixel glitter.
	let footprint = 0.5*fwidth(direction);
	let vertical = smoothstep(-0.35,0.8,direction.y);
	var color = mix(vec3f(0.006,0.009,0.018),vec3f(0.36,0.43,0.54),vertical);
	let broad = smoothstep(0.36-footprint.y,0.41+footprint.y,direction.y)*(1.0-smoothstep(0.72-footprint.y,0.78+footprint.y,direction.y));
	color += broad*vec3f(1.6,1.65,1.7);
	let strip = (1.0-smoothstep(0.055-footprint.x,0.085+footprint.x,abs(direction.x+0.40))) * smoothstep(-0.5,0.2,direction.z);
	color += strip*vec3f(2.5,2.55,2.6);
	let blue = (1.0-smoothstep(0.15,0.35,abs(direction.x-0.65)))*(1.0-smoothstep(0.25,0.65,abs(direction.y+0.2)));
	return color+blue*vec3f(0.03,0.15,1.1);
}
@fragment fn fragment(in: Vertex) -> @location(0) vec4f {
	let p = (in.uv-0.5)*presentation.xy+0.5;
	let field = reconstruct(p);
	let value = field.x;
	// Optical relief saturates inside a thick pool. Shading every tiny lattice
	// density fluctuation as a mirror normal falsely made smooth metal glitter.
	let optical = clamp((value-0.2)/1.35,0.0,1.0);
	let gradient = field.yz*(6.0*optical*(1.0-optical)/1.35);
	let threshold = 0.52;
	let edgeWidth = max(fwidth(value)*0.65,0.0001);
	let alpha = smoothstep(threshold-edgeWidth,threshold+edgeWidth,value);
	let normal = normalize(vec3f(-gradient.x*0.0172,gradient.y*0.0172,0.22));
	let incident = normalize(vec3f((p-0.5)*vec2f(${ASPECT},-1.0)*1.4,-1.0));
	let reflected = reflect(incident,normal);
	var metal = studio(reflected);
	let rim = 1.0-abs(normal.z);
	metal += pow(rim,3.0)*vec3f(0.15,0.21,0.32);
	metal = metal/(metal+vec3f(0.6));
	metal = pow(max(metal,vec3f(0)),vec3f(1.0/2.2));
	let inside = step(0.0,p.x)*step(p.x,1.0)*step(0.0,p.y)*step(p.y,1.0);
	return vec4f(metal*alpha*inside,alpha*inside);
}
`;

export async function createMercury(device: GPUDevice, format: GPUTextureFormat, options: MercuryOptions = {}): Promise<LiquidExperiment> {
	const count = Math.max(64, Math.min(12000, Math.round(options.particleCount ?? DEFAULT_PARTICLES)));
	const gridWidth = Math.max(64, Math.min(1536, Math.round(options.gridSize ?? DEFAULT_GRID)));
	if (!Number.isFinite(count) || !Number.isFinite(gridWidth)) throw new Error('Mercury resolution must be finite.');
	const gridHeight = Math.round(gridWidth / ASPECT);
	const initial = particles(count);
	const state = device.createBuffer({ label: 'mercury anchored particles', size: initial.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
	const uniforms = device.createBuffer({ label: 'mercury interaction', size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
	const presentation = device.createBuffer({ label: 'mercury display', size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
	const density = device.createTexture({ label: 'mercury additive density', size: [gridWidth, gridHeight], format: 'r16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
	const densityView = density.createView();
	try {
	const compute = await device.createComputePipelineAsync({ label: 'mercury anchors', layout: 'auto', compute: { module: device.createShaderModule({ code: computeSource(count) }), entryPoint: 'update' } });
	const densityModule = device.createShaderModule({ code: DENSITY_SOURCE });
	const accumulation = await device.createRenderPipelineAsync({ label: 'mercury density splats', layout: 'auto', vertex: { module: densityModule, entryPoint: 'vertex' }, fragment: { module: densityModule, entryPoint: 'fragment', targets: [{ format: 'r16float', blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } } }] }, primitive: { topology: 'triangle-list' } });
	const displayModule = device.createShaderModule({ code: DISPLAY_SOURCE });
	const display = await device.createRenderPipelineAsync({ label: 'mercury implicit chrome', layout: 'auto', vertex: { module: displayModule, entryPoint: 'vertex' }, fragment: { module: displayModule, entryPoint: 'fragment', targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
	const computeBindings = device.createBindGroup({ layout: compute.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: state } }, { binding: 1, resource: { buffer: uniforms } }] });
	const densityBindings = device.createBindGroup({ layout: accumulation.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: state } }] });
	const displayBindings = device.createBindGroup({ layout: display.getBindGroupLayout(0), entries: [{ binding: 0, resource: densityView }, { binding: 2, resource: { buffer: presentation } }] });
	let scaleX = 1;
	let scaleY = 1;
	let disposed = false;
	const reset = () => { if (!disposed) device.queue.writeBuffer(state, 0, initial); };
	const resize = (width: number, height: number) => {
		const ratio = Math.max(1, width) / Math.max(1, height);
		scaleX = Math.max(1, ratio / ASPECT);
		scaleY = Math.max(1, ASPECT / ratio);
		device.queue.writeBuffer(presentation, 0, new Float32Array([scaleX, scaleY, 0, 0]));
	};
	reset();
	resize(1100, 500);
	return {
		memoryBytes: initial.byteLength + 48 + gridWidth * gridHeight * 2,
		resize,
		reset,
		step(encoder: GPUCommandEncoder, dt: number, input: LiquidInput) {
			const active = input.active && Math.hypot(input.vx, input.vy) > 0.002;
			device.queue.writeBuffer(uniforms, 0, new Float32Array([(input.x - 0.5) * ASPECT * scaleX, (input.y - 0.5) * scaleY, input.vx * ASPECT * scaleX, input.vy * scaleY, Math.max(0, Math.min(1 / 30, dt)), active ? 1 : 0, 0, 0]));
			const pass = encoder.beginComputePass({ label: 'mercury motion' });
			pass.setPipeline(compute); pass.setBindGroup(0, computeBindings); pass.dispatchWorkgroups(Math.ceil(count / 64)); pass.end();
		},
		render(encoder, target) {
			const splats = encoder.beginRenderPass({ label: 'mercury accumulate', colorAttachments: [{ view: densityView, clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' }] });
			splats.setPipeline(accumulation); splats.setBindGroup(0, densityBindings); splats.draw(6, count); splats.end();
			const pass = encoder.beginRenderPass({ label: 'mercury shade', colorAttachments: [{ view: target, clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' }] });
			pass.setPipeline(display); pass.setBindGroup(0, displayBindings); pass.draw(3); pass.end();
		},
		async inspect(): Promise<LiquidSnapshot> {
			const readback = device.createBuffer({ size: initial.byteLength, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
			try {
				const encoder = device.createCommandEncoder(); encoder.copyBufferToBuffer(state, 0, readback, 0, initial.byteLength); device.queue.submit([encoder.finish()]);
				await readback.mapAsync(GPUMapMode.READ);
				const values = new Float32Array(readback.getMappedRange());
				let finite = true; let sumDisplacement = 0; let squaredDisplacement = 0; let maxDisplacement = 0; let maxSpeed = 0; let kinetic = 0;
				for (let i = 0; i < count; i++) {
					const offset = i * STRIDE;
					for (let j = 0; j < STRIDE; j++) finite &&= Number.isFinite(values[offset + j]);
					const displacement = Math.hypot(values[offset] - initial[offset], values[offset + 1] - initial[offset + 1]);
					const speed = Math.hypot(values[offset + 2], values[offset + 3]);
					sumDisplacement += displacement; squaredDisplacement += displacement * displacement; maxDisplacement = Math.max(maxDisplacement, displacement); maxSpeed = Math.max(maxSpeed, speed); kinetic += speed * speed;
				}
				return { finite, mass: count, initialMass: count, min: 0, max: maxDisplacement, kinetic: kinetic / count, details: { particleCount: count, densityWidth: gridWidth, densityHeight: gridHeight, meanDisplacement: sumDisplacement / count, rmsDisplacement: Math.sqrt(squaredDisplacement / count), maxDisplacement, maxSpeed } };
			} finally { readback.destroy(); }
		},
		dispose() { if (disposed) return; disposed = true; state.destroy(); uniforms.destroy(); presentation.destroy(); density.destroy(); }
	};
	} catch (error) {
		state.destroy(); uniforms.destroy(); presentation.destroy(); density.destroy();
		throw error;
	}
}
