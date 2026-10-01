import type { LiquidExperiment, LiquidInput, LiquidSnapshot } from './types.js';
import { PIGMENT_WIDTH as W, PIGMENT_HEIGHT as H, PIGMENT_CAPACITY, PIGMENT_DIFFUSION,
	PIGMENT_ADSORPTION, PIGMENT_DESORPTION, PIGMENT_DRAG, PIGMENT_BRUSH_RADIUS, PIGMENT_LIFT,
	PIGMENT_SHEET_ADSORPTION, PIGMENT_SHEET_CLEARING, PIGMENT_SHEET_DOSE, PIGMENT_CLEAR_SECONDS,
	pigmentSubsteps, pigmentPulse, pigmentSheetPulse, pigmentTotals, pigmentCoveragePeakBytes,
	rasterPigmentGeometry, type PigmentGeometry, type PigmentView } from './capillary-pigment-model.js';

const CELLS = W * H;
const STATE_BYTES = CELLS * 32;
const FIXED_BYTES = STATE_BYTES * 2 + CELLS * 4 + CELLS * 16 + 64;
const MAX_BYTES = 128 * 1024 * 1024;
function computeSource(sheet: boolean) { return /* wgsl */ `
struct Cell { mobile: vec4f, attached: vec4f };
struct Params { pointer: vec4f, settings: vec4f };
@group(0) @binding(0) var<storage, read> source: array<Cell>;
@group(0) @binding(1) var<storage, read_write> destination: array<Cell>;
@group(0) @binding(2) var<storage, read> open: array<u32>;
@group(0) @binding(3) var<uniform> params: Params;
${sheet ? '@group(0) @binding(4) var<storage, read_write> removed: array<vec4f>;' : ''}
fn index(p: vec2i) -> u32 { return u32(p.y * ${W} + p.x); }
fn inside(p: vec2i) -> bool { return all(p >= vec2i(0)) && all(p < vec2i(${W}, ${H})); }
fn influence(p: vec2f) -> f32 {
	let uv = (p + 0.5) / vec2f(${W}, ${H});
	let d = (uv - params.pointer.xy) * vec2f(2, 1);
	return exp(-dot(d, d) / ${2 * PIGMENT_BRUSH_RADIUS ** 2});
}
fn speed(p: vec2f, horizontal: bool) -> f32 {
	// Pointer coordinates are normalized; convert their rate into grid cells.
	// The old fixed32 multiplier accidentally reduced horizontal motion sixfold.
	let velocity = params.pointer.zw * vec2f(${W}, ${H}) * ${PIGMENT_DRAG} * influence(p);
	return select(velocity.y, velocity.x, horizontal);
}
// Always evaluate the same oriented face from both cells: no mass leaks from
// independently limited, mismatched neighbor fluxes or fragment clipping.
fn flux(a: vec2i, b: vec2i, horizontal: bool) -> vec3f {
	if (!inside(a) || !inside(b)) { return vec3f(0); }
	let ai = index(a); let bi = index(b);
	${sheet ? '// The glyph is an adhesive region, never an internal transport wall.' : 'if (open[ai] == 0u || open[bi] == 0u) { return vec3f(0); }'}
	let velocity = speed((vec2f(a) + vec2f(b)) * 0.5, horizontal);
	let ma = source[ai].mobile.xyz; let mb = source[bi].mobile.xyz;
	return max(velocity, 0.0) * ma + min(velocity, 0.0) * mb + ${PIGMENT_DIFFUSION} * (ma - mb);
}
fn exchange(i: u32, mobile: vec3f, attached: vec3f, dt: f32, lift: f32) -> Cell {
	var m = mobile; var b = attached;
	// A passing comb can lift adhered pigment back into the mobile state.
	// This is a bounded internal transfer, not a fresh dye emitter or eraser.
	// Floating-point division/transcendental evaluation can move a zero-rate
	// probability slightly outside [0,1]. Bound probabilities, not pigment
	// states; paired transfers still retain mass.
	let release = b * clamp(1.0 - exp(-(${PIGMENT_DESORPTION} + lift) * dt), 0.0, 1.0); m += release; b -= release;
	let amount = m.x + m.y + m.z;
	let capacity = ${sheet ? `${PIGMENT_CAPACITY} * f32(open[i]) / 255.0` : PIGMENT_CAPACITY};
	let vacancy = max(0.0, capacity - b.x - b.y - b.z);
	let request = amount * clamp(1.0 - exp(-${sheet ? PIGMENT_SHEET_ADSORPTION : PIGMENT_ADSORPTION} * vacancy / max(capacity, 1e-9) * dt), 0.0, 1.0);
	let transfer = min(min(amount, vacancy), request);
	let fraction = transfer / max(amount, 1e-20);
	b += m * fraction; m *= 1.0 - fraction;
	${sheet ? `let cleared = m * clamp(1.0 - exp(-${PIGMENT_SHEET_CLEARING} * (1.0 - f32(open[i]) / 255.0) * dt), 0.0, 1.0);
	removed[i] += vec4f(cleared, 0); m -= cleared;` : ''}
	return Cell(vec4f(m, 0), vec4f(b, 0));
}
@compute @workgroup_size(8, 8)
fn advance(@builtin(global_invocation_id) id: vec3u) {
	if (id.x >= ${W}u || id.y >= ${H}u) { return; }
	let p = vec2i(id.xy); let i = index(p);
	${sheet ? '' : 'if (open[i] == 0u) { destination[i] = Cell(vec4f(0), vec4f(0)); return; }'}
	let dt = params.settings.x;
	let m = source[i].mobile.xyz + dt * (flux(p - vec2i(1, 0), p, true) - flux(p, p + vec2i(1, 0), true)
		+ flux(p - vec2i(0, 1), p, false) - flux(p, p + vec2i(0, 1), false));
	let lift = length(params.pointer.zw * vec2f(2, 1)) * ${PIGMENT_LIFT / PIGMENT_BRUSH_RADIUS} * influence(vec2f(p));
	destination[i] = exchange(i, m, source[i].attached.xyz, dt, lift);
}
${sheet ? `// A direct still-state control uses the same reaction, without hidden
// timesteps or an unstable six-second transport step.
@compute @workgroup_size(8, 8)
fn clear_wash(@builtin(global_invocation_id) id: vec3u) {
	if (id.x >= ${W}u || id.y >= ${H}u) { return; }
	let i = id.y * ${W}u + id.x;
	destination[i] = exchange(i, source[i].mobile.xyz, source[i].attached.xyz, ${PIGMENT_CLEAR_SECONDS}.0, 0.0);
}` : ''}`; }
const POUR = /* wgsl */ `
struct Cell { mobile: vec4f, attached: vec4f };
@group(0) @binding(0) var<storage, read_write> cells: array<Cell>;
@group(0) @binding(1) var<storage, read> dose: array<vec4f>;
@compute @workgroup_size(64)
fn pour(@builtin(global_invocation_id) id: vec3u) {
	if (id.x < ${CELLS}u) { cells[id.x].mobile += dose[id.x]; }
}`;
function renderSource(sheet: boolean) { return /* wgsl */ `
struct Cell { mobile: vec4f, attached: vec4f };
@group(0) @binding(0) var<storage, read> cells: array<Cell>;
@group(0) @binding(1) var coverage: texture_2d<f32>;
@group(0) @binding(2) var<uniform> params: vec4f;
struct Vertex { @builtin(position) clip: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) id: u32) -> Vertex {
	let p = vec2f(f32((id << 1u) & 2u), f32(id & 2u));
	var out: Vertex; out.clip = vec4f(p * 2.0 - 1.0, 0, 1); out.uv = vec2f(p.x, 1.0 - p.y); return out;
}
fn cubic(t: f32) -> vec4f {
	let t2 = t * t; let t3 = t2 * t; let r = 1.0 - t;
	return vec4f(r * r * r, 3.0 * t3 - 6.0 * t2 + 4.0, -3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0, t3) / 6.0;
}
struct Sample { mobile: vec3f, attached: vec3f, gradient: vec2f };
fn derivative(t: f32) -> vec4f {
	return vec4f(-0.5 * (1.0 - t) * (1.0 - t), 1.5 * t * t - 2.0 * t, -1.5 * t * t + t + 0.5, 0.5 * t * t);
}
fn material(uv: vec2f) -> Sample {
	let q = uv * vec2f(${W}, ${H}) - 0.5; let p = vec2i(floor(q));
	let wx = cubic(fract(q.x)); let wy = cubic(fract(q.y));
	let dx = derivative(fract(q.x)); let dy = derivative(fract(q.y));
	var m = vec3f(0); var b = vec3f(0); var gradient = vec2f(0);
	for (var y = 0; y < 4; y++) { for (var x = 0; x < 4; x++) {
		let cell = clamp(p + vec2i(x - 1, y - 1), vec2i(0), vec2i(${W - 1}, ${H - 1}));
		let value = cells[u32(cell.y * ${W} + cell.x)]; let weight = wx[x] * wy[y];
		m += value.mobile.xyz * weight; b += value.attached.xyz * weight;
		let amount = value.mobile.x + value.mobile.y + value.mobile.z;
		gradient += amount * vec2f(dx[x] * wy[y] * ${W}.0, wx[x] * dy[y] * ${H}.0);
	} }
	return Sample(m, b, gradient);
}
@fragment fn fragment(in: Vertex) -> @location(0) vec4f {
	let p = vec2i(in.clip.xy); let mask = textureLoad(coverage, p, 0).r;
	// Most of a wordmark is empty. Analytic reconstruction derivatives let us
	// skip all sixteen material loads there without nonuniform GPU derivatives.
	if (mask == 0.0 ${sheet ? '&& params.z > 1.5' : ''}) { return vec4f(0); }
	let value = material(in.uv);
	var dye = value.mobile.xyz + value.attached.xyz ${sheet ? '* mask' : ''};
	if (params.z > 0.5 && params.z < 1.5) { dye = value.mobile.xyz; }
	if (params.z > 1.5) { dye = value.attached.xyz; }
	// Illustrative subtractive optical density; adding pigment darkens rather
	// than adding RGB until it blows out white. These are not measured spectra.
	let optical = dye.x * vec3f(4.6, 2.0, 0.12) + dye.y * vec3f(0.2, 2.6, 3.8) + dye.z * vec3f(0.08, 0.62, 4.2);
	let color = vec3f(0.87, 0.84, 0.77) * exp(-optical * 1.35);
	let mobile = value.mobile.x + value.mobile.y + value.mobile.z;
	let normal = normalize(vec3f(-value.gradient * 0.008, 1));
	let light = normalize(vec3f(-0.45, -0.65, 1.0));
	let sheen = pow(max(dot(normal, normalize(light + vec3f(0, 0, 1))), 0.0), 28.0) * (1.0 - exp(-mobile * 1.4));
	let finished = color * (0.86 + 0.14 * max(dot(normal, light), 0.0)) + vec3f(0.14) * sheen * select(1.0, 0.0, params.z > 1.5);
	// Source coverage is independent of simulation density and loaded at the
	// exact presentation pixel, including every native antialiased counter edge.
	let alpha = ${sheet ? 'select(1.0, mask, params.z > 1.5)' : 'mask'};
	return vec4f(clamp(finished, vec3f(0), vec3f(1)) * alpha, alpha);
}`; }

export interface PigmentExperiment extends LiquidExperiment {
	pour(color: number): boolean;
	setView(view: PigmentView): void;
	readonly remaining: readonly number[];
	ready(): Promise<void>;
	readState(): Promise<Float32Array<ArrayBuffer>>;
	/** Adhesive-sheet-only direct reaction control; no animated transport. */
	clearWash(): boolean;
}

export async function createCapillaryPigment(device: GPUDevice, format: GPUTextureFormat,
	geometry: PigmentGeometry = 'type', mode: 'sealed' | 'adhesive-sheet' = 'sealed'): Promise<PigmentExperiment> {
	const sheet = mode === 'adhesive-sheet';
	const fixedBytes = FIXED_BYTES + (sheet ? CELLS * 16 * 3 : 0);
	// Retained CPU arrays are separate from the GPU-only memoryBytes getter.
	const cpuFixedBytes = CELLS * 4 + (sheet ? 0 : CELLS * 16);
	const mask = Uint32Array.from(rasterPigmentGeometry(W, H, geometry), (value) => sheet ? value : Number(value > 25));
	if (STATE_BYTES > device.limits.maxStorageBufferBindingSize || fixedBytes > MAX_BYTES) throw new Error('Pigment state exceeds this device’s storage budget.');
	// Auto-derived layouts are pipeline-exclusive. The sheet's two compute
	// entry points share a genuinely explicit layout, including the ledger.
	const sheetLayout = sheet ? device.createBindGroupLayout({ entries: [
		{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
		{ binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
		{ binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
		{ binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', minBindingSize: 32 } },
		{ binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
	] }) : undefined;
	const sharedLayout = sheetLayout ? device.createPipelineLayout({ bindGroupLayouts: [sheetLayout] }) : undefined;
	const computeModule = device.createShaderModule({ code: computeSource(sheet) });
	const renderModule = device.createShaderModule({ code: renderSource(sheet) });
	const [advance, inject, renderer] = await Promise.all([
		device.createComputePipelineAsync({ layout: sharedLayout ?? 'auto', compute: { module: computeModule, entryPoint: 'advance' } }),
		device.createComputePipelineAsync({ layout: 'auto', compute: { module: device.createShaderModule({ code: POUR }), entryPoint: 'pour' } }),
		device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: renderModule, entryPoint: 'vertex' },
			fragment: { module: renderModule, entryPoint: 'fragment', targets: [{ format }] } })
	]);
	const clearing = sheet ? await device.createComputePipelineAsync({ layout: sharedLayout!, compute: { module: computeModule, entryPoint: 'clear_wash' } }) : undefined;
	device.pushErrorScope('out-of-memory'); device.pushErrorScope('validation');
	const owned: GPUBuffer[] = [];
	let state: GPUBuffer[], maskBuffer: GPUBuffer, doseBuffer: GPUBuffer, computeUniform: GPUBuffer, renderUniform: GPUBuffer;
	let computeGroups: GPUBindGroup[], pourGroups: GPUBindGroup[];
	let removedBuffer: GPUBuffer | undefined;
	const sheetPourGroups: GPUBindGroup[][] = [];
	try {
		const buffer = (size: number, usage: GPUBufferUsageFlags) => { const b = device.createBuffer({ size, usage }); owned.push(b); return b; };
		state = [0, 1].map(() => buffer(STATE_BYTES, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST));
		maskBuffer = buffer(CELLS * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
		doseBuffer = buffer(CELLS * 16, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
		if (sheet) removedBuffer = buffer(CELLS * 16, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST);
		computeUniform = buffer(32, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
		renderUniform = buffer(32, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
		device.queue.writeBuffer(maskBuffer, 0, mask);
		computeGroups = state.map((buffer, i) => device.createBindGroup({ layout: advance.getBindGroupLayout(0), entries: [
			{ binding: 0, resource: { buffer } }, { binding: 1, resource: { buffer: state[1 - i] } },
			{ binding: 2, resource: { buffer: maskBuffer } }, { binding: 3, resource: { buffer: computeUniform } },
			...(removedBuffer ? [{ binding: 4, resource: { buffer: removedBuffer } }] : [])
		] }));
		pourGroups = state.map((buffer) => device.createBindGroup({ layout: inject.getBindGroupLayout(0), entries: [
			{ binding: 0, resource: { buffer } }, { binding: 1, resource: { buffer: doseBuffer } }
		] }));
		if (sheet) for (let color = 0; color < 3; color++) {
			const pulse = color === 0 ? doseBuffer : buffer(CELLS * 16, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
			device.queue.writeBuffer(pulse, 0, pigmentSheetPulse(color));
			sheetPourGroups.push(state.map((buffer) => device.createBindGroup({ layout: inject.getBindGroupLayout(0), entries: [
				{ binding: 0, resource: { buffer } }, { binding: 1, resource: { buffer: pulse } }
			] })));
		}
	} catch (error) { await Promise.all([device.popErrorScope(), device.popErrorScope()]); owned.forEach((b) => b.destroy()); throw error; }
	const [validation, allocation] = await Promise.all([device.popErrorScope(), device.popErrorScope()]);
	if (validation || allocation) { owned.forEach((b) => b.destroy()); throw new Error((validation ?? allocation)!.message); }
	let current = 0, width = 1, height = 1, disposed = false, failure: Error | undefined;
	let native: GPUTexture | undefined, nativeBytes = 0, pendingBytes = 0, renderGroups: GPUBindGroup[] = [];
	let requested = { width: 1, height: 1 }, pending: Promise<void> | undefined;
	let view: PigmentView = 'combined', steps = 0, renders = 0, emitted = 0, pours = 0;
	let clears = 0, readbackBytes = 0;
	const injected = [0, 0, 0];
	// Finite reservoirs bound pours to nine. At most sixteen direct clearing
	// actions may await a frame. Immutable color buffers preserve action order
	// without queue.writeBuffer aliases or a second frame submission.
	const actions: number[] = []; // 0..2 = finite pour; 3 = clear wash.
	const remaining = [3, 3, 3], dose = sheet ? undefined : new Float32Array(CELLS * 4);
	let dirtyDose = false;
	function pour(color: number) {
		if (disposed || ![0, 1, 2].includes(color) || remaining[color] <= 0) return false;
		if (sheet) {
			actions.push(color); remaining[color]--; emitted += PIGMENT_SHEET_DOSE; injected[color] += PIGMENT_SHEET_DOSE; pours++; return true;
		}
		const pulse = pigmentPulse(mask, color, geometry);
		for (let i = 0; i < dose!.length; i++) dose![i] += pulse[i];
		remaining[color]--; emitted += 420; pours++; dirtyDose = true; return true;
	}
	function clearWash() {
		if (!sheet || disposed || actions.filter((action) => action === 3).length >= 16) return false;
		actions.push(3); clears++; return true;
	}
	function flush(encoder: GPUCommandEncoder) {
		if (sheet) {
			if (!actions.length) return;
			const pass = encoder.beginComputePass({ label: 'Finite sheet controls in document order' });
			for (const action of actions) {
				if (action < 3) { pass.setPipeline(inject); pass.setBindGroup(0, sheetPourGroups[action][current]); pass.dispatchWorkgroups(Math.ceil(CELLS / 64)); }
				else { pass.setPipeline(clearing!); pass.setBindGroup(0, computeGroups[current]); pass.dispatchWorkgroups(W / 8, H / 8); current = 1 - current; }
			}
			pass.end(); actions.length = 0; return;
		}
		if (!dirtyDose) return;
		device.queue.writeBuffer(doseBuffer, 0, dose!);
		const pass = encoder.beginComputePass({ label: 'Finite pigment dose' }); pass.setPipeline(inject);
		pass.setBindGroup(0, pourGroups[current]); pass.dispatchWorkgroups(Math.ceil(CELLS / 64)); pass.end();
		dose!.fill(0); dirtyDose = false;
	}
	function allocateCoverage() {
		if (pending || disposed) return;
		pending = (async () => {
			while (!disposed && (!native || width !== requested.width || height !== requested.height)) {
				const size = { ...requested }, bytes = size.width * size.height;
				if (pigmentCoveragePeakBytes(size.width, size.height, fixedBytes + cpuFixedBytes, nativeBytes, readbackBytes) > MAX_BYTES) throw new Error('Native pigment preparation exceeds the 128 MiB app-owned CPU+GPU working-set estimate; no downsampling was used.');
				const data = rasterPigmentGeometry(size.width, size.height, geometry);
				device.pushErrorScope('out-of-memory'); device.pushErrorScope('validation');
				let candidate: GPUTexture | undefined; let groups: GPUBindGroup[] = [];
				try {
					candidate = device.createTexture({ label: 'Native pigment silhouette', size: [size.width, size.height], format: 'r8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
					pendingBytes = bytes;
					device.queue.writeTexture({ texture: candidate }, data, { bytesPerRow: size.width }, [size.width, size.height]);
					groups = state.map((buffer) => device.createBindGroup({ layout: renderer.getBindGroupLayout(0), entries: [
						{ binding: 0, resource: { buffer } }, { binding: 1, resource: candidate!.createView() }, { binding: 2, resource: { buffer: renderUniform } }
					] }));
				} catch (error) { await Promise.all([device.popErrorScope(), device.popErrorScope()]); candidate?.destroy(); pendingBytes = 0; throw error; }
				const [error, oom] = await Promise.all([device.popErrorScope(), device.popErrorScope()]);
				if (error || oom) { candidate.destroy(); pendingBytes = 0; throw new Error((error ?? oom)!.message); }
				if (disposed || size.width !== requested.width || size.height !== requested.height) { candidate.destroy(); pendingBytes = 0; continue; }
				const old = native; native = candidate; renderGroups = groups; width = size.width; height = size.height;
				nativeBytes = bytes; pendingBytes = 0; old?.destroy();
			}
		})().catch((error) => { failure = error instanceof Error ? error : new Error(String(error)); }).finally(() => {
			pending = undefined;
			if (!disposed && !failure && (!native || width !== requested.width || height !== requested.height)) allocateCoverage();
		});
	}
	async function ready() { while (pending) await pending; if (failure) throw failure; }
	async function readDocument() {
		if (disposed) throw new Error('Pigment material is disposed.');
		if (sheet && readbackBytes) throw new Error('A pigment inspection is already in flight.');
		const bytes = STATE_BYTES + (sheet ? CELLS * 16 : 0);
		if (fixedBytes + nativeBytes + pendingBytes + readbackBytes + bytes > MAX_BYTES) throw new Error('Pigment inspection exceeds the bounded resource budget.');
		readbackBytes += bytes;
		device.pushErrorScope('out-of-memory'); device.pushErrorScope('validation');
		let read: GPUBuffer;
		try {
			read = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
			const encoder = device.createCommandEncoder(); flush(encoder); encoder.copyBufferToBuffer(state[current], 0, read, 0, STATE_BYTES);
			if (removedBuffer) encoder.copyBufferToBuffer(removedBuffer, 0, read, STATE_BYTES, CELLS * 16);
			device.queue.submit([encoder.finish()]);
		} catch (error) { const scopes = [device.popErrorScope(), device.popErrorScope()]; read!?.destroy(); readbackBytes -= bytes; await Promise.all(scopes); throw error; }
		const metadata = { width, height, steps, renders, pours, clears, emitted, injected: [...injected], view: ['combined', 'mobile', 'attached'].indexOf(view), nativeBytes, pendingBytes, resolvedCanvasBytes: requested.width * requested.height * 4 };
		const scopes = [device.popErrorScope(), device.popErrorScope()];
		try {
			const errors = await Promise.all(scopes); if (errors.some(Boolean)) throw new Error(errors.find(Boolean)!.message);
			await read.mapAsync(GPUMapMode.READ); const raw = new Float32Array(read.getMappedRange());
			return { data: raw.slice(0, CELLS * 8), removed: sheet ? raw.slice(CELLS * 8) : undefined, metadata };
		} finally { read.destroy(); readbackBytes -= bytes; }
	}
	async function readState() { return (await readDocument()).data; }
	// Only the measured native resize owns visual coverage. No arbitrary
	// bootstrap bitmap is allocated while the factory awaits its host.
	pour(0);
	return {
		get memoryBytes() { return fixedBytes + nativeBytes + pendingBytes + readbackBytes; },
		get remaining() { return [...remaining]; },
		pour, clearWash, ready, readState,
		setView(value) { if (['combined', 'mobile', 'attached'].includes(value)) view = value; },
		resize(w, h) {
			if (disposed) return;
			if (![w, h].every(Number.isInteger) || w < 1 || h < 1 || w > device.limits.maxTextureDimension2D || h > device.limits.maxTextureDimension2D || w * h > 16_777_216) throw new Error('Native pigment dimensions exceed the output budget; no downsampling was used.');
			if (native && width === w && height === h) { requested = { width: w, height: h }; return; }
			if (pigmentCoveragePeakBytes(w, h, fixedBytes + cpuFixedBytes, nativeBytes, readbackBytes) > MAX_BYTES) throw new Error('Native pigment preparation exceeds the 128 MiB app-owned CPU+GPU working-set budget; no downsampling was used.');
			requested = { width: w, height: h }; allocateCoverage();
		},
		reset() {
			if (disposed) return;
			const empty = new Float32Array(CELLS * 8); state.forEach((buffer) => device.queue.writeBuffer(buffer, 0, empty));
			dose?.fill(0); dirtyDose = false; remaining.fill(3); emitted = 0; pours = 0; steps = 0;
			if (removedBuffer) device.queue.writeBuffer(removedBuffer, 0, new Float32Array(CELLS * 4));
			actions.length = 0; injected.fill(0); clears = 0;
		},
		step(encoder, dt, input: LiquidInput) {
			if (disposed) return; if (failure) throw failure;
			if (![input.x, input.y, input.vx, input.vy].every(Number.isFinite)) throw new Error('Non-finite pigment input.');
			const vx = input.active ? Math.max(-3, Math.min(3, input.vx)) : 0;
			const vy = input.active ? Math.max(-3, Math.min(3, input.vy)) : 0;
			const count = pigmentSubsteps(dt, vx, vy);
			flush(encoder);
			device.queue.writeBuffer(computeUniform, 0, new Float32Array([input.x, input.y, vx, vy, dt / count, 0, 0, 0]));
			// One pass holds all bounded microsteps. Parameters are identical for
			// every dispatch, and LabSession's repeated steps share dt/input too.
			const pass = encoder.beginComputePass({ label: 'Conservative pigment transport and adhesion' });
			pass.setPipeline(advance);
			for (let i = 0; i < count; i++) {
				pass.setBindGroup(0, computeGroups[current]); pass.dispatchWorkgroups(W / 8, H / 8); current = 1 - current; steps++;
			}
			pass.end();
		},
		render(encoder, target) {
			if (disposed) return; if (failure) throw failure;
			flush(encoder);
			// A pending native mask must not masquerade as a low-resolution source.
			// The wrapper invalidates once ready() adopts the native candidate.
			const matching = native && width === requested.width && height === requested.height;
			const pass = encoder.beginRenderPass({ label: 'Native bounded pigment', colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
			if (matching) {
				device.queue.writeBuffer(renderUniform, 0, new Float32Array([width, height, ['combined', 'mobile', 'attached'].indexOf(view), 0]));
				pass.setPipeline(renderer); pass.setBindGroup(0, renderGroups[current]); pass.draw(3);
			}
			pass.end(); renders++;
		},
		async inspect(): Promise<LiquidSnapshot> {
			const { data, removed, metadata } = await readDocument(), total = pigmentTotals(data);
			let outside = 0; for (let i = 0; i < CELLS; i++) if (!mask[i]) for (let c = 0; c < 8; c++) outside += Math.abs(data[i * 8 + c]);
			const ledger: Record<string, number> = {};
			let minimum = total.min;
			if (removed) {
				const sums = [0, 0, 0]; let capacityError = 0;
				for (let i = 0; i < CELLS; i++) { let occupied = 0; for (let c = 0; c < 3; c++) { sums[c] += removed[i * 4 + c]; minimum = Math.min(minimum, removed[i * 4 + c]); occupied += data[i * 8 + c + 4]; } capacityError = Math.max(capacityError, occupied - PIGMENT_CAPACITY * mask[i] / 255); }
				for (let c = 0; c < 3; c++) { ledger[`injected${c}`] = metadata.injected[c]; ledger[`mobile${c}`] = total.mobile[c]; ledger[`attached${c}`] = total.attached[c]; ledger[`removed${c}`] = sums[c]; }
				ledger.capacityError = capacityError; ledger.removed = sums.reduce((a, value) => a + value, 0); ledger.clears = metadata.clears;
			}
			return { finite: data.every(Number.isFinite) && (!removed || removed.every(Number.isFinite)), mass: total.mass, initialMass: metadata.emitted, min: minimum, max: total.max, kinetic: 0,
				details: { mobile: total.mobile.reduce((a, v) => a + v, 0), attached: total.attached.reduce((a, v) => a + v, 0), capacity: total.capacity,
					outside, checksum: total.checksum, width: metadata.width, height: metadata.height, steps: metadata.steps, renders: metadata.renders, pours: metadata.pours, view: metadata.view,
					stateBytes: STATE_BYTES * 2, cpuFixedBytes, removedBytes: sheet ? CELLS * 16 : 0, nativeCoverageBytes: metadata.nativeBytes, pendingCoverageBytes: metadata.pendingBytes, resolvedCanvasBytes: metadata.resolvedCanvasBytes, ...ledger } };
		},
		dispose() { if (disposed) return; disposed = true; native?.destroy(); owned.forEach((buffer) => buffer.destroy()); }
	};
}

export function createAdhesivePigment(device: GPUDevice, format: GPUTextureFormat): Promise<PigmentExperiment> {
	return createCapillaryPigment(device, format, 'type', 'adhesive-sheet');
}
