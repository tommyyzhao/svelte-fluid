import type { LiquidExperiment, LiquidInput } from './types.js';
import { coverImageBytes } from './living-cover.js';

/** A prescribed circular circulation, not pressure-projected flow around an
 * arbitrary SVG, a transported photograph, or a Navier–Stokes solver.
 * Derived here: (r,theta)->(r,theta+A*g(r)) preserves area and has the exact
 * inverse A->-A. Both the photo AND its derivative are identity inside/outside
 * the annulus; the separate DOM medallion is not hiding a deformed interior. */
export const ANNULAR_INNER = 0.19;
export const ANNULAR_OUTER = 0.44;
export const ANNULAR_ANGLE = 0.32;
const GAP = ANNULAR_OUTER - ANNULAR_INNER;
export const ANNULAR_SHEAR_BOUND = ANNULAR_OUTER * ANNULAR_ANGLE * 16 * Math.sqrt(3) / (9 * GAP);
export const ANNULAR_STRETCH_BOUND = (Math.sqrt(ANNULAR_SHEAR_BOUND ** 2 + 4) + ANNULAR_SHEAR_BOUND) / 2;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export function annularProfile(r: number) {
	if (r <= ANNULAR_INNER || r >= ANNULAR_OUTER) return { value: 0, derivative: 0 };
	const u = (r - ANNULAR_INNER) / GAP, v = 1 - u;
	return { value: 16 * u * u * v * v, derivative: 32 * u * v * (1 - 2 * u) / GAP };
}
export function mapAnnularPoint(point: readonly [number, number], amplitude: number, inverse = true) {
	if (!point.every(Number.isFinite) || !Number.isFinite(amplitude) || Math.abs(amplitude) > ANNULAR_ANGLE + 1e-10) throw new Error('Annular map requires finite points and its bounded angle.');
	const qx = point[0] - 0.5, qy = point[1] - 0.5, r = Math.hypot(qx, qy), profile = annularProfile(r);
	if (!profile.value || !amplitude) return { point, jacobian: [1, 0, 0, 1] as const, determinant: 1 };
	const a = amplitude * (inverse ? -1 : 1), angle = a * profile.value, c = Math.cos(angle), s = Math.sin(angle), k = a * profile.derivative / r;
	const gx = k * qx, gy = k * qy, ax = 1 - qy * gx, ay = qx * gx, bx = -qy * gy, by = 1 + qx * gy;
	const xx = c * ax - s * ay, yx = s * ax + c * ay, xy = c * bx - s * by, yy = s * bx + c * by;
	return { point: [0.5 + c * qx - s * qy, 0.5 + s * qx + c * qy] as const, jacobian: [xx, yx, xy, yy] as const, determinant: xx * yy - xy * yx };
}
export interface AnnularState { angle: number; held: boolean }
export function advanceAnnular(state: AnnularState, dt: number, input: LiquidInput, aspect = 1) {
	if (!Number.isFinite(dt) || dt <= 0) return;
	const sx = Math.max(1, aspect), sy = Math.max(1, 1 / aspect), qx = (input.x - 0.5) * sx, qy = (input.y - 0.5) * sy;
	const vx = input.vx * sx, vy = input.vy * sy, radius = Math.hypot(qx, qy);
	const moving = input.active && [qx, qy, vx, vy].every(Number.isFinite) && Math.hypot(vx, vy) > 1e-5;
	if (moving) state.held = false;
	if (state.held) return;
	const target = moving ? clamp((qx * vy - qy * vx) / Math.max(radius * radius, 0.01) * 0.12, -ANNULAR_ANGLE, ANNULAR_ANGLE) * annularProfile(radius).value : 0;
	state.angle += (target - state.angle) * (1 - Math.exp(-10 * Math.min(dt, 1 / 30)));
	if (!target && Math.abs(state.angle) < 1e-6) state.angle = 0;
}
const VERTEX = /* wgsl */ `
struct Vertex { @builtin(position) clip:vec4f, @location(0) uv:vec2f };
@vertex fn vertex(@builtin(vertex_index) i:u32)->Vertex {
	let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3))[i]; return Vertex(vec4f(p,0,1),p*vec2f(.5,-.5)+.5);
}`;
const SOURCE = VERTEX + /* wgsl */ `
struct Params { display:vec4f,crop:vec4f };
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var photo:texture_2d<f32>;
@group(0) @binding(2) var filtered:sampler;
fn rotate(v:vec2f,c:f32,s:f32)->vec2f{return vec2f(c*v.x-s*v.y,s*v.x+c*v.y);}
fn sinc(x:f32)->f32{if(abs(x)<.0001){return 1.0;}return sin(x)/x;}
fn encode(v:vec3f)->vec3f{return select(1.055*pow(max(v,vec3f(0)),vec3f(1.0/2.4))-.055,12.92*v,v<=vec3f(.0031308));}
@fragment fn fragment(v:Vertex)->@location(0) vec4f {
	let edge=min(p.display.x,p.display.y); let metric=p.display.xy/edge;
	var q=(v.uv-.5)*metric; var dx=vec2f(1.0/edge,0); var dy=vec2f(0,1.0/edge); let r=length(q);
	if(r>${ANNULAR_INNER} && r<${ANNULAR_OUTER} && p.display.z!=0.0){
		let u=(r-${ANNULAR_INNER})/${GAP};let w=1.0-u;let angle=-p.display.z*16.0*u*u*w*w;
		let gradient=-p.display.z*32.0*u*w*(1.0-2.0*u)/${GAP}*q/r;
		let tangent=vec2f(-q.y,q.x);let c=cos(angle);let s=sin(angle);
		dx=rotate(dx+tangent*dot(gradient,dx),c,s);dy=rotate(dy+tangent*dot(gradient,dy),c,s);q=rotate(q,c,s);
	}
	let uv=q/metric+.5;dx=dx/metric;dy=dy/metric;
	var color=textureSampleGrad(photo,filtered,(uv-.5)*p.crop.xy+p.crop.zw,dx*p.crop.xy,dy*p.crop.xy).rgb;
	if(p.display.w>.5){
		let f=6.28318531*96.0;
		let a=cos((uv.x+uv.y)*f)*sinc((dx.x+dx.y)*f*.5)*sinc((dy.x+dy.y)*f*.5);
		let b=cos((uv.x-uv.y)*f)*sinc((dx.x-dx.y)*f*.5)*sinc((dy.x-dy.y)*f*.5);
		color=vec3f(.55+.2*(a+b))*vec3f(.78,.85,.9);
	}
	return vec4f(encode(color),1);
}`;
const MIP_SOURCE = VERTEX + /* wgsl */ `
@group(0) @binding(0) var previous:texture_2d<f32>;
@group(0) @binding(1) var filtered:sampler;
@fragment fn fragment(v:Vertex)->@location(0) vec4f{return textureSampleLevel(previous,filtered,v.uv,0);}`;
export interface AnnularFlowExperiment extends LiquidExperiment {
	readonly settled: boolean;
	hold(direction: -1 | 1): void;
	finish(): void;
	setDiagnostic(enabled: boolean): void;
	setStill(enabled: boolean): void;
}
export async function createAnnularFlow(device: GPUDevice, format: GPUTextureFormat, image: ImageBitmap): Promise<AnnularFlowExperiment> {
	const sourceWidth = image.width, sourceHeight = image.height, info = coverImageBytes(sourceWidth, sourceHeight), uniformBytes = 32;
	if (sourceWidth > device.limits.maxTextureDimension2D || sourceHeight > device.limits.maxTextureDimension2D || info.bytes > 192 * 1024 * 1024) throw new Error('Original annular photograph exceeds its source budget. No smaller replacement was made.');
	const module = device.createShaderModule({ label: 'Analytic annular inverse and native gradients', code: SOURCE });
	const errors = (await module.getCompilationInfo()).messages.filter((message) => message.type === 'error');
	if (errors.length) throw new Error(errors.map((message) => message.message).join('\n'));
	const pipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module, entryPoint: 'vertex' }, fragment: { module, entryPoint: 'fragment', targets: [{ format }] } });
	const mipModule = device.createShaderModule({ code: MIP_SOURCE });
	const mipPipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: mipModule, entryPoint: 'vertex' }, fragment: { module: mipModule, entryPoint: 'fragment', targets: [{ format: 'rgba8unorm-srgb' }] } });
	let photo: GPUTexture | undefined, uniform: GPUBuffer | undefined, scopesOpen = true;
	device.pushErrorScope('out-of-memory'); device.pushErrorScope('validation');
	try {
		photo = device.createTexture({ label: 'Original annular photo / linear-light mips', size: [sourceWidth, sourceHeight], format: 'rgba8unorm-srgb', mipLevelCount: info.levels, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
		device.queue.copyExternalImageToTexture({ source: image }, { texture: photo }, [sourceWidth, sourceHeight]);
		const sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: 8 }), mipSampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
		const encoder = device.createCommandEncoder();
		// Same verified native-source upload as the earlier image studies. This
		// is linear-light bilinear NPOT reduction, not exact area integration.
		for (let level = 1; level < info.levels; level++) {
			const group = device.createBindGroup({ layout: mipPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: photo.createView({ baseMipLevel: level - 1, mipLevelCount: 1 }) }, { binding: 1, resource: mipSampler }] });
			const pass = encoder.beginRenderPass({ colorAttachments: [{ view: photo.createView({ baseMipLevel: level, mipLevelCount: 1 }), loadOp: 'clear', storeOp: 'store' }] });
			pass.setPipeline(mipPipeline); pass.setBindGroup(0, group); pass.draw(3); pass.end();
		}
		device.queue.submit([encoder.finish()]);
		uniform = device.createBuffer({ size: uniformBytes, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
		const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: photo.createView() }, { binding: 2, resource: sampler }] });
		await device.queue.onSubmittedWorkDone();
		const validation = device.popErrorScope(), allocation = device.popErrorScope(); scopesOpen = false;
		const [invalid, outOfMemory] = await Promise.all([validation, allocation]);
		if (invalid || outOfMemory) throw new Error(`Annular photograph upload failed: ${(invalid || outOfMemory)!.message}`);
		const source = photo, params = uniform, data = new Float32Array(8), state: AnnularState = { angle: 0, held: false };
		let width = 0, height = 0, disposed = false, dirty = true, renders = 0, still = false;
		return {
			memoryBytes: info.bytes + uniformBytes,
			get settled() { return state.held || state.angle === 0; },
			resize(w, h) {
				if (disposed || w === width && h === height) return;
				if (![w, h].every((n) => Number.isInteger(n) && n > 0 && n <= device.limits.maxTextureDimension2D) || w * h > 16777216 || info.bytes + uniformBytes + w * h * 4 > 256 * 1024 * 1024) throw new Error('Native annular image exceeds its explicit output budget. No lower-resolution substitute was made.');
				width = w; height = h; data[0] = w; data[1] = h;
				const ratio = w / h / (sourceWidth / sourceHeight); data.set([Math.min(1, ratio) * .9, Math.min(1, 1 / ratio) * .9, .5, .475], 4); dirty = true;
			},
			hold(direction) { state.angle = ANNULAR_ANGLE * direction; state.held = true; dirty = true; },
			finish() { if (!state.held) { state.angle = 0; dirty = true; } },
			reset() { state.angle = 0; state.held = false; dirty = true; },
			setDiagnostic(enabled) { data[3] = Number(enabled); dirty = true; }, setStill(enabled) { still = enabled; dirty = true; },
			step(_encoder, dt, input) { if (disposed) return; advanceAnnular(state, dt, input, width / height); dirty = true; },
			render(encoder, view) {
				if (disposed) return; if (!width || !height) throw new Error('Size the annular image before rendering.');
				if (dirty) { data[2] = still ? 0 : state.angle; device.queue.writeBuffer(params, 0, data); dirty = false; }
				const pass = encoder.beginRenderPass({ label: 'One annular image circulation', colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store' }] });
				pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.draw(3); pass.end(); renders++;
			},
			async inspect() { return { finite: Number.isFinite(state.angle), mass: 0, initialMass: 0, min: Math.min(0, state.angle), max: Math.max(0, state.angle), kinetic: state.angle ** 2, details: { width, height, sourceWidth, sourceHeight, sourceBytes: info.bytes, uniformBytes, outputBytes: width * height * 4, angle: state.angle, held: Number(state.held), still: Number(still), diagnostic: data[3], inner: ANNULAR_INNER, outer: ANNULAR_OUTER, stretchBound: ANNULAR_STRETCH_BOUND, anisotropyBound: ANNULAR_STRETCH_BOUND ** 2, renders } }; },
			dispose() { if (!disposed) { disposed = true; source.destroy(); params.destroy(); } }
		};
	} catch (error) { photo?.destroy(); uniform?.destroy(); if (scopesOpen) { const validation = device.popErrorScope(), allocation = device.popErrorScope(); await Promise.all([validation, allocation]); } throw error; }
}
