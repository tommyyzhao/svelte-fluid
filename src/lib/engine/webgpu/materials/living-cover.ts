import { materialShader, materialRenderPipeline } from './cache.js';
import type { LiquidExperiment, LiquidInput } from './types.js';

/** Private authored boundary motion, not a fluid solver.
 * The compact polar map and its derivative below are derived directly:
 * (r,theta)->(r,theta+a*f(r)); inverse changes a's sign, det(J)=1.
 * Aperture and reveal use the map only for their boundaries. The original
 * photograph is always sampled at fixed coordinates.
 * https://www.w3.org/TR/WGSL/#texturesamplegrad-builtin specifies gradients;
 * https://pbr-book.org/4ed/Textures_and_Materials/Image_Texture explains why
 * source footprints and prefiltering matter. Retrieved 2026-09-13.
 */
export const COVER_MODES = Array.from({ length: 6 }, (_, i) => ({ x: 0.3 + i % 3 * 0.2, y: i < 3 ? 0.3 : 0.7, radius: 0.285 }));
export type CoverVariant = 'aperture' | 'reveal';
export interface CoverState { amplitude: Float64Array; velocity: Float64Array }
export function createCoverState(): CoverState { return { amplitude: new Float64Array(6), velocity: new Float64Array(6) }; }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Exact bounded-support map, plus column-major analytic 2x2 Jacobian. */
export function mapCoverPoint(point: readonly [number, number], amplitude: ArrayLike<number>, inverse = true) {
	if (!point.every(Number.isFinite) || amplitude.length !== 6 || Array.from(amplitude).some((a) => !Number.isFinite(a) || Math.abs(a) > 0.6)) throw new Error('Cover map requires six finite bounded amplitudes.');
	let [x, y] = point, xx = 1, xy = 0, yx = 0, yy = 1;
	for (let index = 0; index < 6; index++) {
		const i = inverse ? 5 - index : index, mode = COVER_MODES[i], qx = x - mode.x, qy = y - mode.y;
		const s = (qx * qx + qy * qy) / mode.radius ** 2;
		if (s >= 1) continue;
		const a = amplitude[i] * (inverse ? -1 : 1), t = 1 - s, angle = a * t ** 3, c = Math.cos(angle), sin = Math.sin(angle);
		const gx = -6 * a * t * t * qx / mode.radius ** 2, gy = -6 * a * t * t * qy / mode.radius ** 2;
		const ax = xx - qy * (gx * xx + gy * yx), ay = yx + qx * (gx * xx + gy * yx);
		const bx = xy - qy * (gx * xy + gy * yy), by = yy + qx * (gx * xy + gy * yy);
		xx = c * ax - sin * ay; yx = sin * ax + c * ay; xy = c * bx - sin * by; yy = sin * bx + c * by;
		x = mode.x + c * qx - sin * qy; y = mode.y + sin * qx + c * qy;
	}
	return { point: [x, y] as const, jacobian: [xx, yx, xy, yy] as const, determinant: xx * yy - xy * yx };
}

/** Small damped modal response. Caps bound both strain and history cost. */
export function advanceCover(state: CoverState, dt: number, input: LiquidInput) {
	if (!Number.isFinite(dt) || dt <= 0) return;
	const h = Math.min(dt, 1 / 120), active = input.active && [input.x, input.y, input.vx, input.vy].every(Number.isFinite);
	const vx = active ? clamp(input.vx, -3, 3) : 0, vy = active ? clamp(input.vy, -3, 3) : 0;
	for (let i = 0; i < 6; i++) {
		const mode = COVER_MODES[i], x = (active ? input.x : 0.5) - mode.x, y = (active ? input.y : 0.5) - mode.y;
		const weight = Math.exp(-(x * x + y * y) / 0.11), torque = (x * vy - y * vx) * weight * 170;
		state.velocity[i] = (state.velocity[i] + h * (torque - 64 * state.amplitude[i])) * Math.exp(-9 * h);
		state.amplitude[i] += h * state.velocity[i];
		if (Math.abs(state.amplitude[i]) > 0.6) { state.amplitude[i] = clamp(state.amplitude[i], -0.6, 0.6); state.velocity[i] = 0; }
		if (!active && Math.abs(state.amplitude[i]) < 1e-6 && Math.abs(state.velocity[i]) < 1e-6) { state.amplitude[i] = 0; state.velocity[i] = 0; }
	}
	const sum = state.amplitude.reduce((total, a) => total + Math.abs(a), 0);
	if (sum > 1.8) for (let i = 0; i < 6; i++) { state.amplitude[i] *= 1.8 / sum; state.velocity[i] *= 1.8 / sum; }
}

export function coverImageBytes(width: number, height: number) {
	if (![width, height].every((n) => Number.isInteger(n) && n > 0 && n <= 8192)) throw new Error('Cover image requires finite supported dimensions.');
	let bytes = 0, levels = 0;
	while (true) { bytes += width * height * 4; levels++; if (width === 1 && height === 1) break; width = Math.max(1, width >> 1); height = Math.max(1, height >> 1); }
	return { bytes, levels };
}

/** Explicit fetch guarantees an origin-clean decoded image; no DOM capture. */
export async function loadCoverImage(src: string, signal?: AbortSignal): Promise<ImageBitmap> {
	const response = await fetch(src, { mode: 'cors', credentials: 'same-origin', signal });
	if (!response.ok || response.type === 'opaque') throw new Error(`Cover image could not be loaded origin-clean (${response.status}).`);
	const bitmap = await createImageBitmap(await response.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
	if (signal?.aborted) { bitmap.close(); throw new Error('Cover image load cancelled.'); }
	return bitmap;
}

const VERTEX = /* wgsl */ `
struct Vertex { @builtin(position) clip: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) i: u32) -> Vertex {
	let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3))[i];
	return Vertex(vec4f(p,0,1),p*vec2f(0.5,-0.5)+0.5);
}`;
const SOURCE = VERTEX + /* wgsl */ `
struct Params { display: vec4f, settings: vec4f, modes: array<vec4f,6> };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var photo: texture_2d<f32>;
@group(0) @binding(2) var filtered: sampler;
struct Mapping { uv: vec2f, dx: vec2f, dy: vec2f };
fn rotate(v: vec2f, c: f32, s: f32) -> vec2f { return vec2f(c*v.x-s*v.y,s*v.x+c*v.y); }
fn mapping(uv: vec2f) -> Mapping {
	var out=Mapping(uv,vec2f(1.0/params.display.x,0),vec2f(0,1.0/params.display.y));
	if (params.display.w>0.5) {
		// Deliberately cheap comparison: collapse spatial memory to one scalar
		// sinusoidal ripple. Jacobian determinant >= 1 - .04*pi > 0.
		var a=0.0; for (var i=0u;i<6u;i++) { a+=params.modes[i].w*select(-1.0,1.0,i<3u); }
		a=clamp(a/1.8,-1.0,1.0)*0.04;
		let sx=sin(3.14159265*uv.x); let cy=cos(6.28318531*uv.y); let sy=sin(6.28318531*uv.y);
		out.uv.x += a*sx*sy;
		out.dx.x *= 1.0+a*3.14159265*cos(3.14159265*uv.x)*sy;
		out.dy.x = a*sx*6.28318531*cy/params.display.y;
		return out;
	}
	for (var index=0u;index<6u;index++) {
		let m=params.modes[5u-index]; let q=out.uv-m.xy; let r2=m.z*m.z; let s=dot(q,q)/r2;
		if (s<1.0) {
			let t=1.0-s; let a=-m.w; let angle=a*t*t*t; let c=cos(angle); let sn=sin(angle);
			let gradient=-6.0*a*t*t*q/r2; let perpendicular=vec2f(-q.y,q.x);
			out.dx=rotate(out.dx+perpendicular*dot(gradient,out.dx),c,sn);
			out.dy=rotate(out.dy+perpendicular*dot(gradient,out.dy),c,sn);
			out.uv=m.xy+rotate(q,c,sn);
		}
	}
	return out;
}
fn sinc(x: f32) -> f32 { if(abs(x)<0.0001){return 1.0;}return sin(x)/x; }
fn testPattern(uv: vec2f, dx: vec2f, dy: vec2f) -> vec3f {
	let frequency=6.28318531*96.0;
	// cos(x)*cos(y) has diagonal Fourier components. Filter each component;
	// multiplying independently filtered axes is wrong under a sheared map.
	let plus=cos((uv.x+uv.y)*frequency)*sinc((dx.x+dx.y)*frequency*0.5)*sinc((dy.x+dy.y)*frequency*0.5);
	let minus=cos((uv.x-uv.y)*frequency)*sinc((dx.x-dx.y)*frequency*0.5)*sinc((dy.x-dy.y)*frequency*0.5);
	let fine=0.55+0.2*(plus+minus);
	let band=0.5+0.5*cos(uv.y*6.28318531*6.0);
	return vec3f(fine)*mix(vec3f(0.6,0.77,0.89),vec3f(0.98,0.56,0.30),band*0.35);
}
fn rounded(p: vec2f) -> f32 { let q=abs(p-0.5)-vec2f(0.34); return length(max(q,vec2f(0)))+min(max(q.x,q.y),0.0)-0.055; }
fn encode(linear: vec3f) -> vec3f { return select(1.055*pow(max(linear,vec3f(0)),vec3f(1.0/2.4))-0.055,12.92*linear,linear<=vec3f(0.0031308)); }
@fragment fn fragment(in: Vertex) -> @location(0) vec4f {
	let m=mapping(in.uv); let variant=params.display.z;
	// The map moves only the boundary; the photograph underneath stays still.
	let q=in.uv; let dx=vec2f(1.0/params.display.x,0); let dy=vec2f(0,1.0/params.display.y);
	let scale=params.settings.zw; let source=(q-0.5)*scale+vec2f(0.5,0.475);
	var color=textureSampleGrad(photo,filtered,source,dx*scale,dy*scale).rgb;
	if(params.settings.y>0.5){ color=testPattern(q,dx,dy); }
	var alpha=1.0;
	if (variant<1.5) {
		let distance=rounded(m.uv);let pixel=max(fwidth(distance),0.000001);
		alpha=1.0-smoothstep(-pixel*0.5,pixel*0.5,distance);
		let rimCoordinate=(distance+0.0025)/max(0.0025,pixel); let rim=exp(-rimCoordinate*rimCoordinate);
		let tilt=normalize(vec3f(m.dx.y*params.display.x,m.dy.x*params.display.y,1));
		color+=vec3f(0.45,0.56,0.61)*rim*(0.12+0.4*abs(tilt.x-tilt.y));
	}
	else {
		let front=params.settings.x*1.1-0.05;let distance=m.uv.x-front;let pixel=max(abs(m.dx.x)+abs(m.dy.x),0.000001);
		alpha=1.0-smoothstep(-pixel,pixel,distance);
		let rimCoordinate=distance/max(0.004,pixel); let rim=exp(-rimCoordinate*rimCoordinate)*sin(params.settings.x*3.14159265);
		color+=vec3f(0.10,0.13,0.14)*rim;
	}
	return vec4f(encode(color)*alpha,alpha);
}`;
const MIP_SOURCE = VERTEX + /* wgsl */ `
@group(0) @binding(0) var previous: texture_2d<f32>;
@group(0) @binding(1) var filtered: sampler;
@fragment fn fragment(in: Vertex) -> @location(0) vec4f { return textureSampleLevel(previous,filtered,in.uv,0); }
`;

export interface LivingCoverExperiment extends LiquidExperiment {
	readonly settled: boolean;
	setVariant(variant: CoverVariant): void;
	setBaseline(enabled: boolean): void;
	setDiagnostic(enabled: boolean): void;
	setReveal(revealed: boolean, immediate?: boolean): void;
	setAmplitudes(amplitude: readonly number[]): void;
	clearMotion(): void;
}

export async function createLivingCover(device: GPUDevice, format: GPUTextureFormat, image: ImageBitmap): Promise<LivingCoverExperiment> {
	const sourceWidth = image.width, sourceHeight = image.height;
	const info = coverImageBytes(image.width, image.height);
	if (image.width > device.limits.maxTextureDimension2D || image.height > device.limits.maxTextureDimension2D || info.bytes > 192 * 1024 * 1024) throw new Error('Original cover image exceeds its explicit source budget. No downsampled replacement was made.');
	const module = await materialShader(device, { label: 'Responsive boundary and fixed native photograph', code: SOURCE });
	const pipeline = await materialRenderPipeline(device, { label: 'Wet aperture / finite reveal and fixed photograph', layout: 'auto', vertex: { module, entryPoint: 'vertex' }, fragment: { module, entryPoint: 'fragment', targets: [{ format }] } });
	const mipModule = await materialShader(device, { label: 'Original image / linear-light mip reduction', code: MIP_SOURCE });
	const mipPipeline = await materialRenderPipeline(device, { layout: 'auto', vertex: { module: mipModule, entryPoint: 'vertex' }, fragment: { module: mipModule, entryPoint: 'fragment', targets: [{ format: 'rgba8unorm-srgb' }] } });
	let photo: GPUTexture | undefined, uniform: GPUBuffer | undefined;
	try {
		photo = device.createTexture({ label: 'Immutable original cover and prefiltered mips', size: [image.width, image.height], format: 'rgba8unorm-srgb', mipLevelCount: info.levels, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
		device.queue.copyExternalImageToTexture({ source: image }, { texture: photo }, [image.width, image.height]);
		const sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: 8 });
		const mipSampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
		const encoder = device.createCommandEncoder({ label: 'One-time original photograph prefilter' });
		for (let level = 1; level < info.levels; level++) {
			const group = device.createBindGroup({ layout: mipPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: photo.createView({ baseMipLevel: level - 1, mipLevelCount: 1 }) }, { binding: 1, resource: mipSampler }] });
			const pass = encoder.beginRenderPass({ colorAttachments: [{ view: photo.createView({ baseMipLevel: level, mipLevelCount: 1 }), loadOp: 'clear', storeOp: 'store' }] });
			pass.setPipeline(mipPipeline); pass.setBindGroup(0, group); pass.draw(3); pass.end();
		}
		device.queue.submit([encoder.finish()]);
		uniform = device.createBuffer({ label: 'Six modal amplitudes and cover presentation', size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
		const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: photo.createView() }, { binding: 2, resource: sampler }] });
		const source = photo, params = uniform, data = new Float32Array(32), state = createCoverState();
		data[2] = 1;
		const sourceAspect = image.width / image.height;
		// Authored Arles crop: vertical source range .025… .925 removes the
		// wider bottom paper margin. The crop scale multiplies gradients too.
		data[6] = Math.min(1, 1 / sourceAspect) * 0.9; data[7] = Math.min(1, sourceAspect) * 0.9;
		let width = 0, height = 0, dirty = true, disposed = false, reveal = 0, target = 0, renders = 0;
		const clearMotion = () => { state.amplitude.fill(0); state.velocity.fill(0); dirty = true; };
		return {
			memoryBytes: 128 + info.bytes,
			get settled() { return state.amplitude.every((a) => a === 0) && state.velocity.every((v) => v === 0) && reveal === target; },
			resize(w, h) { if (disposed || w === width && h === height) return; if (![w, h].every((n) => Number.isInteger(n) && n > 0 && n <= device.limits.maxTextureDimension2D) || w * h > 16777216 || info.bytes + w * h * 4 > 256 * 1024 * 1024) throw new Error('Native cover exceeds its explicit image/output budget. No lower-resolution substitution was made.'); width = w; height = h; data[0] = w; data[1] = h; dirty = true; },
			setVariant(variant) { const code = { aperture: 1, reveal: 2 }[variant]; if (code === undefined) throw new Error('Unknown cover variant.'); data[2] = code; dirty = true; },
			setBaseline(enabled) { data[3] = Number(enabled); dirty = true; },
			setDiagnostic(enabled) { data[5] = Number(enabled); dirty = true; },
			setReveal(revealed, immediate = false) {
				const next = Number(revealed);
				if (next !== target && !immediate) {
					// One authored impulse accompanies a committed reveal. Repeated
					// setter calls do not pump energy; pointer sweeps can catch its tail.
					const direction = next > target ? 1 : -1;
					for (let i = 0; i < 6; i++) state.velocity[i] += direction * (i < 3 ? -1 : 1) * (5 - i % 3);
				}
				target = next; if (immediate) reveal = target; dirty = true;
			},
			setAmplitudes(amplitudes) { mapCoverPoint([0.5, 0.5], amplitudes); if (amplitudes.reduce((sum, a) => sum + Math.abs(a), 0) > 1.800001) throw new Error('Cover total twist exceeds 1.8 radians.'); state.amplitude.set(amplitudes); state.velocity.fill(0); dirty = true; },
			clearMotion,
			reset() { clearMotion(); target = reveal = 0; dirty = true; },
			step(_encoder, dt, input) {
				if (disposed || !Number.isFinite(dt) || dt <= 0) return;
				advanceCover(state, dt, input);
				const delta = target - reveal; reveal += Math.sign(delta) * Math.min(Math.abs(delta), Math.min(dt, 1 / 120) * 1.25);
				dirty = true;
			},
			render(encoder, view) {
				if (disposed) return; if (!width || !height) throw new Error('Size the cover before rendering.');
				if (dirty) { data[4] = reveal; COVER_MODES.forEach((mode, i) => data.set([mode.x, mode.y, mode.radius, state.amplitude[i]], 8 + i * 4)); device.queue.writeBuffer(params, 0, data); dirty = false; }
				const pass = encoder.beginRenderPass({ label: 'Native living image / one filtered source sample', colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
				pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.draw(3); pass.end(); renders++;
			},
			async inspect() { return { finite: state.amplitude.every(Number.isFinite) && state.velocity.every(Number.isFinite), mass: 0, initialMass: 0, min: Math.min(...state.amplitude), max: Math.max(...state.amplitude), kinetic: state.velocity.reduce((sum, v) => sum + v * v, 0), details: { width, height, sourceWidth, sourceHeight, sourceBytes: info.bytes, mipLevels: info.levels, uniformBytes: 128, outputBytes: width * height * 4, reveal, revealTarget: target, variant: data[2], baseline: data[3], diagnostic: data[5], renders, ...Object.fromEntries(Array.from(state.amplitude, (a, i) => ['a' + i, a])) } }; },
			dispose() { if (!disposed) { disposed = true; source.destroy(); params.destroy(); } }
		};
	} catch (error) { photo?.destroy(); uniform?.destroy(); throw error; }
}
