import { materialShader, materialRenderPipeline } from './cache.js';
import type { LiquidExperiment, LiquidInput } from './types.js';
import { advanceCover, COVER_MODES, coverImageBytes, createCoverState } from './living-cover.js';

/** Private authored image wake, NOT a point-vortex/PFM/LFM fluid solver.
 * Opposite-signed vortex pairs motivate local translation:
 * https://ocw.mit.edu/courses/12-804-large-scale-flow-dynamics-lab-fall-2009/resources/mit12_804f09_pointvor/
 * Our compact polar maps are derived directly, not copied from that source.
 * (r,theta)->(r,theta+a(1-r²/R²)^3) has an exact inverse and det(J)=1.
 * https://www.w3.org/TR/WGSL/#texturesamplegrad-builtin and
 * https://pbr-book.org/4ed/Textures_and_Materials/Image_Texture govern native
 * source footprints. Retrieved 2026-09-13. Sampling the immutable original is
 * already the production baseline; the experiment is LOCAL retained response.
 */
// One packet per maximum support radius, not two nearly redundant packets.
// The diagonal-sized budget admits any one straight stroke across the square;
// arbitrary long loops remain explicitly bounded, never silently evicted.
export const WAKE_SPACING = 0.13;
export const WAKE_CAPACITY = Math.ceil(Math.SQRT2 / WAKE_SPACING) + 1;
export const WAKE_LIFETIME = 3;
const PACKET_ANGLE = 0.2;
const FIRST_PACKET_DISTANCE = 0.015;
export const WAKE_ANGLE_BUDGET = WAKE_CAPACITY * 2 * PACKET_ANGLE;
/** Private matched-renderer admission control, not another production backend. */
export type WakeAdmission = 'sparse' | 'dense-baseline';
export interface WakePacket { x: number; y: number; tx: number; ty: number; radius: number; age: number }
export interface WakeMode { x: number; y: number; radius: number; angle: number }
export interface WakeState {
	readonly spacing: number;
	readonly capacity: number;
	packets: WakePacket[];
	last: readonly [number, number] | null;
	distance: number;
	accepted: number;
	rejected: number;
}
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const smooth = (n: number) => { const x = clamp(n, 0, 1); return x * x * (3 - 2 * x); };
export function createWakeState(admission: WakeAdmission = 'sparse'): WakeState {
	const spacing = admission === 'dense-baseline' ? 0.065 : WAKE_SPACING;
	return { spacing, capacity: admission === 'dense-baseline' ? 8 : WAKE_CAPACITY,
		packets: [], last: null, distance: spacing - FIRST_PACKET_DISTANCE, accepted: 0, rejected: 0 };
}
/** End transient input without erasing retained packets or an in-host arc-length
 * remainder. The wrapper calls breakWakeStroke on a REAL exit/layout change. */
export function endWakeInput(state: WakeState) { state.last = null; }
export function breakWakeStroke(state: WakeState) { state.last = null; state.distance = state.spacing - FIRST_PACKET_DISTANCE; }
export function primeWakeInput(state: WakeState, x: number, y: number) {
	// Do not overwrite an unconsumed endpoint when several DOM events arrive
	// before one animation frame; the clock likewise retains their total delta.
	if (!state.last && [x, y].every(Number.isFinite)) state.last = [clamp(x, 0, 1), clamp(y, 0, 1)];
}
export function wakeEnvelope(age: number): number {
	// Every twist owns its .2rad budget. Adding a distant packet must NOT
	// globally rescale old wakes; that would be hidden nonlocal coupling.
	return age <= 0 || age >= WAKE_LIFETIME ? 0 : PACKET_ANGLE * smooth(age / 0.065) * Math.exp(-0.6 * Math.max(0, age - 0.065)) * smooth((WAKE_LIFETIME - age) / 0.3);
}
function stamp(state: WakeState, x: number, y: number, tx: number, ty: number) {
	// The entire pair, including its small authored drift, remains inside the
	// square. Near an edge the physical footprint shrinks, never stretches.
	const radius = Math.min(0.13, Math.min(x, y, 1 - x, 1 - y) / 1.51);
	if (radius < 0.008) return;
	if (state.packets.length >= state.capacity) { state.rejected++; return; }
	state.packets.push({ x, y, tx, ty, radius, age: 0 }); state.accepted++;
}
/** Consume a changed endpoint ONCE, not once per repeated fixed-clock substep.
 * Arc-length spacing is independent of native pixels and pointer event rate. */
export function advanceWake(state: WakeState, dt: number, input: LiquidInput) {
	if (!Number.isFinite(dt) || dt <= 0) return;
	const h = Math.min(dt, 1 / 120);
	for (let i = state.packets.length - 1; i >= 0; i--) { state.packets[i].age += h; if (state.packets[i].age >= WAKE_LIFETIME) state.packets.splice(i, 1); }
	if (!input.active || ![input.x, input.y].every(Number.isFinite)) { state.last = null; return; }
	const next: readonly [number, number] = [clamp(input.x, 0, 1), clamp(input.y, 0, 1)], previous = state.last; state.last = next;
	if (!previous) return;
	const dx = next[0] - previous[0], dy = next[1] - previous[1], length = Math.hypot(dx, dy);
	if (length < 1e-9) return;
	const tx = dx / length, ty = dy / length, spacing = state.spacing;
	// Count from total arc length, rather than comparing independently rounded
	// endpoints in a loop. Otherwise an exact spacing boundary can lose a
	// packet under subdivision, then modulo can erase the owed remainder too.
	const total = state.distance + length, placements = Math.floor((total + 1e-12) / spacing);
	for (let i = 0; i < placements; i++) {
		const position = Math.min(length, spacing - state.distance + i * spacing);
		stamp(state, previous[0] + tx * position, previous[1] + ty * position, tx, ty);
	}
	state.distance = Math.max(0, total - placements * spacing);
}
export function wakeModes(state: WakeState): WakeMode[] {
	const modes: WakeMode[] = [];
	for (const packet of state.packets) {
		const a = wakeEnvelope(packet.age), drift = 0.13 * packet.radius * (1 - Math.exp(-3 * packet.age));
		for (const side of [1, -1]) modes.push({ x: packet.x + packet.tx * drift - packet.ty * packet.radius * 0.37 * side,
			y: packet.y + packet.ty * drift + packet.tx * packet.radius * 0.37 * side, radius: packet.radius, angle: a * side });
	}
	return modes;
}
/** For one twist, maximum polar shear |r*dtheta/dr| = 8|a|/9.
 * Its maximum singular value <= exp(4|a|/9); composition and the angle budget
 * therefore give sigma_max <= exp(4*4.8/9)=8.443, sigma_min >=1/8.443.
 * The sampler's8x anisotropy is NOT this singular-value bound (anisotropy can
 * reach sigma_max/sigma_min). Native filtering must be checked against a higher
 * sample reference; area preservation alone does not prove image quality. */
export const WAKE_STRETCH_BOUND = Math.exp(4 * WAKE_ANGLE_BUDGET / 9);
export function mapWakePoint(point: readonly [number, number], modes: readonly WakeMode[], inverse = true) {
	if (!point.every(Number.isFinite) || modes.length > WAKE_CAPACITY * 2 || modes.some((m) => ![m.x, m.y, m.radius, m.angle].every(Number.isFinite) || m.radius <= 0)) throw new Error('Wake requires finite bounded compact maps.');
	let [x, y] = point, xx = 1, xy = 0, yx = 0, yy = 1;
	for (let index = 0; index < modes.length; index++) {
		const mode = modes[inverse ? modes.length - 1 - index : index], qx = x - mode.x, qy = y - mode.y, r2 = mode.radius ** 2, s = (qx * qx + qy * qy) / r2;
		if (s >= 1) continue;
		const a = mode.angle * (inverse ? -1 : 1), t = 1 - s, angle = a * t ** 3, c = Math.cos(angle), sin = Math.sin(angle);
		const gx = -6 * a * t * t * qx / r2, gy = -6 * a * t * t * qy / r2;
		const ax = xx - qy * (gx * xx + gy * yx), ay = yx + qx * (gx * xx + gy * yx);
		const bx = xy - qy * (gx * xy + gy * yy), by = yy + qx * (gx * xy + gy * yy);
		xx = c * ax - sin * ay; yx = sin * ax + c * ay; xy = c * bx - sin * by; yy = sin * bx + c * by;
		x = mode.x + c * qx - sin * qy; y = mode.y + sin * qx + c * qy;
	}
	return { point: [x, y] as const, jacobian: [xx, yx, xy, yy] as const, determinant: xx * yy - xy * yx };
}

const VERTEX = /* wgsl */ `
struct Vertex { @builtin(position) clip: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) i: u32) -> Vertex {
	let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3))[i];return Vertex(vec4f(p,0,1),p*vec2f(0.5,-0.5)+0.5);
}`;
const SOURCE = VERTEX + /* wgsl */ `
struct Params { display: vec4f, crop: vec4f, modes: array<vec4f,${WAKE_CAPACITY * 2}> };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var photo: texture_2d<f32>;
@group(0) @binding(2) var filtered: sampler;
fn rotate(v: vec2f,c: f32,s: f32)->vec2f{return vec2f(c*v.x-s*v.y,s*v.x+c*v.y);}
fn sinc(x:f32)->f32{if(abs(x)<0.0001){return 1.0;}return sin(x)/x;}
fn testPattern(uv:vec2f,dx:vec2f,dy:vec2f)->vec3f{
	let f=6.28318531*96.0;
	let plus=cos((uv.x+uv.y)*f)*sinc((dx.x+dx.y)*f*0.5)*sinc((dy.x+dy.y)*f*0.5);
	let minus=cos((uv.x-uv.y)*f)*sinc((dx.x-dx.y)*f*0.5)*sinc((dy.x-dy.y)*f*0.5);
	return vec3f(0.55+0.2*(plus+minus))*vec3f(0.78,0.85,0.9);
}
fn encode(linear:vec3f)->vec3f{return select(1.055*pow(max(linear,vec3f(0)),vec3f(1.0/2.4))-0.055,12.92*linear,linear<=vec3f(0.0031308));}
@fragment fn fragment(in:Vertex)->@location(0) vec4f{
	var uv=in.uv;var dx=vec2f(1.0/params.display.x,0);var dy=vec2f(0,1.0/params.display.y);
	for(var index=0u;index<u32(params.display.z);index++){
		let m=params.modes[u32(params.display.z)-1u-index];let q=uv-m.xy;let r2=m.z*m.z;let s=dot(q,q)/r2;
		if(s<1.0){let t=1.0-s;let a=-m.w;let angle=a*t*t*t;let c=cos(angle);let sn=sin(angle);
			let g=-6.0*a*t*t*q/r2;let p=vec2f(-q.y,q.x);
			dx=rotate(dx+p*dot(g,dx),c,sn);dy=rotate(dy+p*dot(g,dy),c,sn);uv=m.xy+rotate(q,c,sn);
		}
	}
	var color=textureSampleGrad(photo,filtered,(uv-0.5)*params.crop.xy+params.crop.zw,dx*params.crop.xy,dy*params.crop.xy).rgb;
	if(params.display.w>0.5){color=testPattern(uv,dx,dy);}
	return vec4f(encode(color),1);
}`;
const MIP_SOURCE = VERTEX + /* wgsl */ `
@group(0) @binding(0) var previous:texture_2d<f32>;
@group(0) @binding(1) var filtered:sampler;
@fragment fn fragment(in:Vertex)->@location(0) vec4f{return textureSampleLevel(previous,filtered,in.uv,0);}
`;
export interface ImageWakeExperiment extends LiquidExperiment {
	readonly settled: boolean;
	readonly occupancy: number;
	setReference(enabled: boolean): void;
	setDiagnostic(enabled: boolean): void;
	setStill(enabled: boolean): void;
	primeInput(x: number, y: number): void;
	breakStroke(): void;
	/** One static representative stroke for native controls under reduced motion. */
	showTrace(): void;
}
export async function createImageWake(device: GPUDevice, format: GPUTextureFormat, image: ImageBitmap,
	admission: WakeAdmission = 'sparse', crop: 'print' | 'cover' = 'print'): Promise<ImageWakeExperiment> {
	const sourceWidth = image.width, sourceHeight = image.height, info = coverImageBytes(sourceWidth, sourceHeight), uniformBytes = 32 + WAKE_CAPACITY * 32;
	if (sourceWidth > device.limits.maxTextureDimension2D || sourceHeight > device.limits.maxTextureDimension2D || info.bytes > 192 * 1024 * 1024) throw new Error('Original wake image exceeds its explicit source budget. No downsampled replacement was made.');
	const module = await materialShader(device, { label: 'Local retained image wake / exact inverse gradients', code: SOURCE });
	const pipeline = await materialRenderPipeline(device, { layout: 'auto', vertex: { module, entryPoint: 'vertex' }, fragment: { module, entryPoint: 'fragment', targets: [{ format }] } });
	const mipModule = await materialShader(device, { code: MIP_SOURCE });
	const mipPipeline = await materialRenderPipeline(device, { layout: 'auto', vertex: { module: mipModule, entryPoint: 'vertex' }, fragment: { module: mipModule, entryPoint: 'fragment', targets: [{ format: 'rgba8unorm-srgb' }] } });
	let photo: GPUTexture | undefined, uniform: GPUBuffer | undefined, scopesOpen = true;
	device.pushErrorScope('out-of-memory'); device.pushErrorScope('validation');
	try {
		photo = device.createTexture({ label: 'Original wake photograph and linear-light mips', size: [sourceWidth, sourceHeight], format: 'rgba8unorm-srgb', mipLevelCount: info.levels, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
		device.queue.copyExternalImageToTexture({ source: image }, { texture: photo }, [sourceWidth, sourceHeight]);
		const sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: 8 }), mipSampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
		const encoder = device.createCommandEncoder({ label: 'One-time original image prefilter' });
		// Bilinear NPOT reduction, not exact area integration or software EWA.
		for (let level = 1; level < info.levels; level++) {
			const group = device.createBindGroup({ layout: mipPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: photo.createView({ baseMipLevel: level - 1, mipLevelCount: 1 }) }, { binding: 1, resource: mipSampler }] });
			const pass = encoder.beginRenderPass({ colorAttachments: [{ view: photo.createView({ baseMipLevel: level, mipLevelCount: 1 }), loadOp: 'clear', storeOp: 'store' }] });
			pass.setPipeline(mipPipeline); pass.setBindGroup(0, group); pass.draw(3); pass.end();
		}
		device.queue.submit([encoder.finish()]);
		uniform = device.createBuffer({ label: 'Diagonal-sized wake pairs / bounded native presentation', size: uniformBytes, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
		const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: photo.createView() }, { binding: 2, resource: sampler }] });
		const validation = device.popErrorScope(), allocation = device.popErrorScope(); scopesOpen = false;
		await device.queue.onSubmittedWorkDone();
		const [invalid, outOfMemory] = await Promise.all([validation, allocation]);
		if (invalid || outOfMemory) throw new Error(`Original wake image allocation/upload failed: ${(invalid || outOfMemory)!.message}`);
		const source = photo, params = uniform, data = new Float32Array(uniformBytes / 4), state = createWakeState(admission), reference = createCoverState();
		const aspect = sourceWidth / sourceHeight; data.set([Math.min(1, 1 / aspect) * 0.9, Math.min(1, aspect) * 0.9, 0.5, 0.475], 4);
		let width = 0, height = 0, disposed = false, dirty = true, broad = false, still = false, renders = 0;
		const reset = () => { state.packets = []; breakWakeStroke(state); state.accepted = state.rejected = 0; reference.amplitude.fill(0); reference.velocity.fill(0); dirty = true; };
		return {
			memoryBytes: info.bytes + uniformBytes,
			get occupancy() { return state.packets.length; },
			get settled() { return !state.packets.length && reference.amplitude.every((a) => a === 0) && reference.velocity.every((v) => v === 0); },
			resize(w, h) { if (disposed || w === width && h === height) return; if (![w, h].every((n) => Number.isInteger(n) && n > 0 && n <= device.limits.maxTextureDimension2D) || w * h > 16777216 || info.bytes + uniformBytes + w * h * 4 > 256 * 1024 * 1024) throw new Error('Native image wake exceeds its explicit image/output budget. No lower-resolution substitute was made.'); width = w; height = h; data[0] = w; data[1] = h; if (crop === 'cover') { const target = w / h, source = sourceWidth / sourceHeight; data.set([Math.min(1, target / source), Math.min(1, source / target), 0.5, 0.5], 4); } dirty = true; },
			setReference(enabled) { broad = enabled; dirty = true; }, setDiagnostic(enabled) { data[3] = Number(enabled); dirty = true; }, setStill(enabled) { still = enabled; dirty = true; },
			primeInput(x, y) { primeWakeInput(state, x, y); }, breakStroke() { breakWakeStroke(state); }, endInput() { endWakeInput(state); },
			showTrace() { reset(); for (let i = 0; i < 5; i++) stamp(state, 0.25 + i * state.spacing, 0.47 + Math.sin(i * 0.5) * 0.035, 1, 0); for (const packet of state.packets) packet.age = 0.5; reference.amplitude.set([0.25, -0.25, 0.25, -0.25, 0.25, -0.25]); dirty = true; },
			reset,
			step(_encoder, dt, input) { if (disposed || !Number.isFinite(dt) || dt <= 0) return; advanceWake(state, dt, input); advanceCover(reference, dt, input); dirty = true; },
			render(encoder, view) {
				if (disposed) return; if (!width || !height) throw new Error('Size the image wake before rendering.');
				if (dirty) { const modes = still ? [] : broad ? COVER_MODES.map((mode, i) => ({ ...mode, angle: reference.amplitude[i] })) : wakeModes(state); data[2] = modes.length; modes.forEach((mode, i) => data.set([mode.x, mode.y, mode.radius, mode.angle], 8 + i * 4)); device.queue.writeBuffer(params, 0, data); dirty = false; }
				const pass = encoder.beginRenderPass({ label: 'Local image wake / immutable native source', colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] }); pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.draw(3); pass.end(); renders++;
			},
			async inspect() { const modes = wakeModes(state); return { finite: modes.every((mode) => Object.values(mode).every(Number.isFinite)), mass: 0, initialMass: 0, min: Math.min(0, ...modes.map((m) => m.angle)), max: Math.max(0, ...modes.map((m) => m.angle)), kinetic: modes.reduce((sum, m) => sum + m.angle * m.angle, 0), details: { width, height, sourceWidth, sourceHeight, sourceBytes: info.bytes, mipLevels: info.levels, uniformBytes, outputBytes: width * height * 4, packets: state.packets.length, accepted: state.accepted, rejected: state.rejected, capacity: state.capacity, spacing: state.spacing, angleSum: modes.reduce((sum, m) => sum + Math.abs(m.angle), 0), stretchBound: Math.exp(4 * state.capacity * 2 * PACKET_ANGLE / 9), reference: Number(broad), still: Number(still), diagnostic: data[3], renders, ...Object.fromEntries(state.packets.flatMap((p, i) => [['age' + i, p.age], ['x' + i, p.x], ['y' + i, p.y]])) } }; },
			dispose() { if (!disposed) { disposed = true; source.destroy(); params.destroy(); } }
		};
	} catch (error) { photo?.destroy(); uniform?.destroy(); if (scopesOpen) { const validation = device.popErrorScope(), allocation = device.popErrorScope(); await Promise.all([validation, allocation]); } throw error; }
}
