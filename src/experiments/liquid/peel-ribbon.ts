import type { LiquidExperiment } from './types.js';

export const RIBBON_SEGMENTS = 96;
const MAX_ANGLE = Math.PI * 5 / 12;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** A bounded 2.5D ribbon, not a general thin-shell or adhesive-fracture solver. */
export class RibbonGeometry {
	readonly angles = new Float64Array(RIBBON_SEGMENTS);
	readonly target = new Float64Array(RIBBON_SEGMENTS);
	readonly rest = new Float64Array(RIBBON_SEGMENTS);
	readonly points = new Float32Array((RIBBON_SEGMENTS + 1) * 4);
	peel = 0.62;
	lift = 0.8;
	crease = -1;
	boundary = 0;
	version = 0;
	constructor() { this.set(this.peel, this.lift, true); }
	set(peel: number, lift: number, still = false) {
		if (!Number.isFinite(peel) || peel < 0 || peel > 0.82 || !Number.isFinite(lift) || lift < 0 || lift > 1) throw new Error('Ribbon controls must stay inside the declared peel/lift bounds.');
		this.peel = peel; this.lift = lift; this.solve();
		// Newly attached material is exactly on the plane, never eased through it.
		this.angles.fill(0, 0, this.boundary + 1);
		if (still) this.finish(); else this.vertices();
	}
	remember() {
		if (this.boundary >= RIBBON_SEGMENTS - 4) return false;
		this.rest.fill(0); this.crease = this.boundary + Math.floor((RIBBON_SEGMENTS - 1 - this.boundary) * 0.5);
		this.rest[this.crease] = 0.9; this.solve(); return true;
	}
	clearMemory() { this.rest.fill(0); this.crease = -1; this.solve(); }
	finish() { this.angles.set(this.target); this.vertices(); }
	step(dt: number) {
		if (!Number.isFinite(dt) || dt < 0 || dt > 1) throw new Error('Invalid ribbon timestep.');
		const retained = Math.exp(-14 * dt);
		for (let i = 0; i < RIBBON_SEGMENTS; i++) this.angles[i] = this.target[i] + (this.angles[i] - this.target[i]) * retained;
		if (this.remaining < 1e-12) this.angles.set(this.target);
		this.vertices();
	}
	private solve() {
		const count = RIBBON_SEGMENTS, end = count - 1;
		this.boundary = Math.min(end, Math.floor(count * (1 - this.peel)));
		this.target.fill(0); if (this.boundary === end) return;
		const free = end - this.boundary, angle = this.lift * 1.3;
		for (let i = this.boundary + 1; i < count; i++) this.target[i] = angle * (i - this.boundary) / free;
		// Minimize squared turning-angle error relative to stored rest curvature,
		// plus a weak distributed lifting term. Root and tip angles are prescribed.
		// Projected coordinates enforce nonpenetration/monotonicity by construction.
		for (let sweep = 0; sweep < 160; sweep++) {
			for (let i = this.boundary + 1; i < end; i++) {
				const preferred = angle * (i - this.boundary) / free;
				this.target[i] = clamp((this.target[i - 1] + this.target[i + 1] + this.rest[i] - this.rest[i + 1] + 0.008 * preferred) / 2.008, 0, MAX_ANGLE);
			}
		}
	}
	private vertices() {
		let x = 0, height = 0;
		for (let i = 0; i <= RIBBON_SEGMENTS; i++) {
			const angle = this.angles[Math.min(i, RIBBON_SEGMENTS - 1)];
			const offset = i * 4;
			this.points[offset] = x; this.points[offset + 1] = height; this.points[offset + 2] = angle; this.points[offset + 3] = i / RIBBON_SEGMENTS;
			if (i < RIBBON_SEGMENTS) { x += Math.cos(angle) / RIBBON_SEGMENTS; height += Math.sin(angle) / RIBBON_SEGMENTS; }
		}
		this.version++;
	}
	get remaining() { let sum = 0; for (let i = 0; i < RIBBON_SEGMENTS; i++) sum += (this.target[i] - this.angles[i]) ** 2; return sum; }
}

export interface PeelRibbonModel extends LiquidExperiment {
	set(peel: number, lift: number, still?: boolean): void;
	remember(still?: boolean): boolean;
	clearMemory(still?: boolean): void;
	finish(): void;
}

const SHADER = /* wgsl */ `
struct Params { size:vec2f, padding:vec2f };
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var<storage,read> points:array<vec4f>;
struct Vertex { @builtin(position) position:vec4f, @location(0) side:f32, @location(1) material:f32, @location(2) angle:f32, @location(3) height:f32 };
@vertex fn vertex(@builtin(vertex_index) id:u32,@builtin(instance_index) layer:u32)->Vertex {
	let corners=array<vec2f,6>(vec2f(0,-1),vec2f(1,-1),vec2f(0,1),vec2f(0,1),vec2f(1,-1),vec2f(1,1));
	let c=corners[id%6u]; let index=id/6u+u32(c.x); let point=points[index];
	let shadow=layer==0u; let halfWidth=0.145*p.size.y;
	let shadeOffset=select(-0.58*point.y*p.size.y,0.03*point.y*p.size.y,shadow);
	let fringe=select(1.5,7.0+point.y*18.0,shadow);
	var x=(0.12+0.76*point.x)*p.size.x;
	if(index==0u){x-=1.5;} if(index==96u){x+=1.5;}
	let y=0.67*p.size.y+shadeOffset+c.y*(halfWidth+fringe);
	var out:Vertex; out.position=vec4f(vec2f(x,y)/p.size*vec2f(2,-2)+vec2f(-1,1),0,1);
	out.side=c.y*(1.0+fringe/halfWidth); out.material=point.w; out.angle=point.z; out.height=select(point.y,-1.0-point.y,shadow); return out;
}
@fragment fn fragment(in:Vertex)->@location(0) vec4f {
	let aa=max(fwidth(in.side),0.001); let cap=max(fwidth(in.material),0.0001);
	if(in.height<0.0){let blur=0.045+(-1.0-in.height)*0.14;let alpha=(1.0-smoothstep(1.0-blur,1.0+blur,abs(in.side)))*0.13;return vec4f(vec3f(0.18,0.21,0.12)*alpha,alpha);}
	let coverage=(1.0-smoothstep(1.0-aa*0.5,1.0+aa*0.5,abs(in.side)))*smoothstep(0.0,cap,in.material)*(1.0-smoothstep(1.0-cap,1.0,in.material));
	let normal=vec3f(-sin(in.angle),0,cos(in.angle)); let light=normalize(vec3f(-0.5,-0.2,0.9));
	let diffuse=0.4+0.6*max(0.0,dot(normal,light));
	let band=1.0-smoothstep(0.012,0.018,abs(abs(in.side)-0.76));
	let pin=1.0-smoothstep(0.0015,0.0035,abs(fract(in.material*16.0)-0.5));
	let base=mix(vec3f(0.80,0.58,0.32),vec3f(0.45,0.29,0.14),band*0.5+pin*0.13);
	let rim=pow(max(0.0,1.0-abs(dot(normal,vec3f(0,0.5,0.866)))),3.0);
	let color=base*diffuse+vec3f(0.40,0.29,0.15)*rim;
	return vec4f(color*coverage,coverage);
}`;

export async function createPeelRibbon(device: GPUDevice, format: GPUTextureFormat): Promise<PeelRibbonModel> {
	const geometry = new RibbonGeometry(), module = device.createShaderModule({ code: SHADER, label: 'Bounded rest-curvature ribbon' });
	const pipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module, entryPoint: 'vertex' }, fragment: { module, entryPoint: 'fragment', targets: [{ format, blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } }] } });
	const uniform = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
	const vertices = device.createBuffer({ size: geometry.points.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
	const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: vertices } }] });
	const size = new Float32Array([1, 1, 0, 0]); let disposed = false, renders = 0, uploaded = -1, uploads = 0;
	const model: PeelRibbonModel = {
		memoryBytes: 16 + geometry.points.byteLength,
		resize(width, height) {
			if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > device.limits.maxTextureDimension2D || height > device.limits.maxTextureDimension2D || width * height > 16_777_216) throw new Error('Native ribbon size exceeds the explicit allocation limit; no downsampling was used.');
			size[0] = width; size[1] = height;
		},
		set(peel, lift, still = false) { geometry.set(peel, lift, still); },
		remember(still = false) { const changed = geometry.remember(); if (still) geometry.finish(); return changed; },
		clearMemory(still = false) { geometry.clearMemory(); if (still) geometry.finish(); },
		finish() { geometry.finish(); },
		reset() { geometry.clearMemory(); geometry.set(0.62, 0.8, true); },
		step(_encoder, dt) { if (!disposed) geometry.step(dt); },
		render(encoder, target) {
			if (disposed) return;
			device.queue.writeBuffer(uniform, 0, size);
			if (uploaded !== geometry.version) { device.queue.writeBuffer(vertices, 0, geometry.points as Float32Array<ArrayBuffer>); uploaded = geometry.version; uploads++; }
			const pass = encoder.beginRenderPass({ label: 'Native ribbon geometry and ground shadow', colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
			pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.draw(RIBBON_SEGMENTS * 6, 2); pass.end(); renders++;
		},
		async inspect() { return { finite: geometry.points.every(Number.isFinite), mass: 0, initialMass: 0, min: 0, max: geometry.points.at(-3)!, kinetic: geometry.remaining, details: { peel: geometry.peel, lift: geometry.lift, crease: geometry.crease, boundary: geometry.boundary, tipX: geometry.points.at(-4)!, tipHeight: geometry.points.at(-3)!, shape: geometry.points.reduce((sum, value, i) => sum + value * (i + 1), 0), segments: RIBBON_SEGMENTS, length: 1, width: size[0], height: size[1], renders, uploads, stateBytes: model.memoryBytes, cpuStateBytes: geometry.angles.byteLength + geometry.target.byteLength + geometry.rest.byteLength + geometry.points.byteLength, outputBytes: size[0] * size[1] * 4 } }; },
		dispose() { if (disposed) return; disposed = true; uniform.destroy(); vertices.destroy(); }
	};
	return model;
}
