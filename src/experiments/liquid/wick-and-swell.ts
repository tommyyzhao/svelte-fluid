import type { LiquidExperiment, LiquidSnapshot } from './types.js';
import { WICK_WIDTH as W, WICK_HEIGHT as H, WICK_DIFFUSION, WICK_ABSORPTION, WICK_DROP, WICK_PIPETTE,
	WICK_SWELL, WICK_DRY_COMPLIANCE, WICK_WET_COMPLIANCE, wickDose, wickSubsteps, wickTotals, wickMaterial } from './wick-and-swell-model.js';

const CELLS = W * H, STATE_BYTES = CELLS * 8, FIXED_BYTES = STATE_BYTES * 2 + CELLS * 4 + 64;
const COMPUTE = /* wgsl */ `
@group(0) @binding(0) var<storage, read> source: array<vec2f>;
@group(0) @binding(1) var<storage, read_write> destination: array<vec2f>;
@group(0) @binding(2) var<uniform> params: vec4f;
@compute @workgroup_size(8, 8) fn advance(@builtin(global_invocation_id) id: vec3u) {
	if (id.x >= ${W}u || id.y >= ${H}u) { return; }
	let i = id.y * ${W}u + id.x; let cell = source[i]; var laplacian = 0.0;
	if (id.x > 0u) { laplacian += source[i - 1u].x - cell.x; }
	if (id.x + 1u < ${W}u) { laplacian += source[i + 1u].x - cell.x; }
	if (id.y > 0u) { laplacian += source[i - ${W}u].x - cell.x; }
	if (id.y + 1u < ${H}u) { laplacian += source[i + ${W}u].x - cell.x; }
	let s = cell.x + ${WICK_DIFFUSION}.0 * params.x * laplacian;
	let transfer = min(min(cell.y, max(0.0, 1.0 - s)), cell.y * (1.0 - exp(-${WICK_ABSORPTION} * params.x)));
	destination[i] = vec2f(s + transfer, cell.y - transfer);
}`;
const POUR = /* wgsl */ `
@group(0) @binding(0) var<storage, read_write> state: array<vec2f>;
@group(0) @binding(1) var<storage, read> dose: array<f32>;
@compute @workgroup_size(64) fn pour(@builtin(global_invocation_id) id: vec3u) {
	if (id.x < ${CELLS}u) { state[id.x].y += dose[id.x]; }
}`;
const RENDER = /* wgsl */ `
struct Params { display: vec4f, probe: vec4f, finish: vec4f };
@group(0) @binding(0) var<storage, read> state: array<vec2f>;
@group(0) @binding(1) var<uniform> params: Params;
struct Vertex { @builtin(position) clip: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) id: u32) -> Vertex {
	let p = vec2f(f32((id << 1u) & 2u), f32(id & 2u));
	var out: Vertex; out.clip = vec4f(p * 2.0 - 1.0, 0, 1); out.uv = vec2f(p.x, 1.0 - p.y); return out;
}
fn cubic(t: f32) -> vec4f {
	let t2 = t * t; let t3 = t2 * t; let r = 1.0 - t;
	return vec4f(r * r * r, 3.0 * t3 - 6.0 * t2 + 4.0, -3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0, t3) / 6.0;
}
fn derivative(t: f32) -> vec4f {
	return vec4f(-0.5 * (1.0 - t) * (1.0 - t), 1.5 * t * t - 2.0 * t, -1.5 * t * t + t + 0.5, 0.5 * t * t);
}
fn material(uv: vec2f) -> vec4f {
	let q = clamp(uv, vec2f(0), vec2f(1)) * vec2f(${W}, ${H}) - 0.5;
	let p = vec2i(floor(q)); let wx = cubic(fract(q.x)); let wy = cubic(fract(q.y));
	let dx = derivative(fract(q.x)); let dy = derivative(fract(q.y));
	var value = vec2f(0); var gradient = vec2f(0);
	for (var y = 0; y < 4; y++) { for (var x = 0; x < 4; x++) {
		let cell = clamp(p + vec2i(x - 1, y - 1), vec2i(0), vec2i(${W - 1}, ${H - 1}));
		let sample = state[u32(cell.y * ${W} + cell.x)]; value += sample * wx[x] * wy[y];
		gradient += sample.x * vec2f(dx[x] * wy[y] * ${W / 1.6}.0, wx[x] * dy[y] * ${H}.0);
	} }
	return vec4f(value, gradient);
}
// Height and derivative of a circular pressure footprint, in plate-height units.
fn pressure(p: vec2f, center: vec2f) -> vec3f {
	let d = (p - center) * vec2f(1.6, 1); let r2 = 0.095 * 0.095;
	let weight = exp(-dot(d, d) / (2.0 * r2));
	return vec3f(weight, -d * weight / r2);
}
@fragment fn fragment(in: Vertex) -> @location(0) vec4f {
	let aspect = params.display.x / params.display.y; let scale = min(0.89 * aspect / 1.6, 0.78);
	let p = (in.uv - 0.5) * vec2f(aspect, 1) / scale; let uv = p / vec2f(1.6, 1) + 0.5;
	let q = abs(p) - vec2f(0.785, 0.485); let distance = length(max(q, vec2f(0))) + min(max(q.x, q.y), 0.0) - 0.015;
	let aa = max(fwidth(distance), 0.000001); let coverage = 1.0 - smoothstep(-aa * 0.5, aa * 0.5, distance);
	let data = material(uv); let saturation = select(data.x, 0.0, params.finish.y > 0.5);
	let gradient = select(data.zw, vec2f(0), params.finish.y > 0.5);
	var load = pressure(uv, params.probe.xy) * params.probe.z;
	if (params.probe.w > 0.5) { load = pressure(uv, vec2f(0.30, 0.5)) + pressure(uv, vec2f(0.67, 0.5)); }
	let compliance = ${WICK_DRY_COMPLIANCE} + ${WICK_WET_COMPLIANCE - WICK_DRY_COMPLIANCE} * saturation;
	let height = ${WICK_SWELL} * saturation - compliance * load.x;
	let slope = gradient * (${WICK_SWELL} - ${WICK_WET_COMPLIANCE - WICK_DRY_COMPLIANCE} * load.x) - compliance * load.yz;
	let edgeHeight = 0.015 * smoothstep(0.0, 0.025, -distance);
	let edgeSlope = vec2f(dpdx(edgeHeight), dpdy(edgeHeight)) / vec2f(aspect / params.display.x / scale, 1.0 / params.display.y / scale);
	let normal = normalize(vec3f(-slope - edgeSlope, 1));
	let light = normalize(vec3f(cos(params.display.z), sin(params.display.z), 0.60));
	// Fixed material-space fibres, filtered by the actual pixel footprint.
	let phase = dot(p, vec2f(1750, 590)); let phase2 = dot(p, vec2f(-620, 2170));
	let footprint = max(abs(dpdx(phase)), abs(dpdy(phase))); let footprint2 = max(abs(dpdx(phase2)), abs(dpdy(phase2)));
	let grain = sin(phase) * exp(-0.24 * footprint * footprint) + 0.45 * sin(phase2) * exp(-0.24 * footprint2 * footprint2);
	let wetTint = select(1.0 - saturation * 0.10, 1.0, params.finish.x > 0.5);
	let base = vec3f(0.78, 0.68, 0.49) * wetTint;
	let diffuse = 0.34 + 0.72 * max(dot(normal, light), 0.0);
	// A matte rough surface: no painted highlights or shiny water shader.
	let color = base * (diffuse + grain * 0.016) + vec3f(0.045, 0.038, 0.025) * max(normal.z, 0.0);
	return vec4f(clamp(color, vec3f(0), vec3f(1)) * coverage, coverage);
}`;

export interface WickAndSwellExperiment extends LiquidExperiment {
	readonly remaining: number;
	drop(x?: number, y?: number): boolean;
	advance(seconds: number): void;
	setLight(angle: number): void;
	setEqualPressure(enabled: boolean): void;
	setColorless(enabled: boolean): void;
	setBaseline(enabled: boolean): void;
	readState(): Promise<Float32Array<ArrayBuffer>>;
}

export async function createWickAndSwell(device: GPUDevice, format: GPUTextureFormat): Promise<WickAndSwellExperiment> {
	if (STATE_BYTES > device.limits.maxStorageBufferBindingSize) throw new Error('Porous material exceeds the storage binding budget.');
	const module = device.createShaderModule({ code: RENDER, label: 'Native matte porous relief' });
	const [compute, pour, renderer] = await Promise.all([
		device.createComputePipelineAsync({ layout: 'auto', compute: { module: device.createShaderModule({ code: COMPUTE }), entryPoint: 'advance' } }),
		device.createComputePipelineAsync({ layout: 'auto', compute: { module: device.createShaderModule({ code: POUR }), entryPoint: 'pour' } }),
		device.createRenderPipelineAsync({ layout: 'auto', vertex: { module, entryPoint: 'vertex' }, fragment: { module, entryPoint: 'fragment', targets: [{ format }] } })
	]);
	device.pushErrorScope('out-of-memory'); device.pushErrorScope('validation');
	const owned: GPUBuffer[] = [];
	let state: GPUBuffer[], doseBuffer: GPUBuffer, stepUniform: GPUBuffer, renderUniform: GPUBuffer;
	let steps: GPUBindGroup[], pours: GPUBindGroup[], renders: GPUBindGroup[];
	try {
		const buffer = (size: number, usage: GPUBufferUsageFlags) => { const result = device.createBuffer({ size, usage }); owned.push(result); return result; };
		state = [0, 1].map(() => buffer(STATE_BYTES, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC));
		doseBuffer = buffer(CELLS * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
		stepUniform = buffer(16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
		renderUniform = buffer(48, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
		steps = state.map((source, i) => device.createBindGroup({ layout: compute.getBindGroupLayout(0), entries: [
			{ binding: 0, resource: { buffer: source } }, { binding: 1, resource: { buffer: state[1 - i] } }, { binding: 2, resource: { buffer: stepUniform } }
		] }));
		pours = state.map((source) => device.createBindGroup({ layout: pour.getBindGroupLayout(0), entries: [
			{ binding: 0, resource: { buffer: source } }, { binding: 1, resource: { buffer: doseBuffer } }
		] }));
		renders = state.map((source) => device.createBindGroup({ layout: renderer.getBindGroupLayout(0), entries: [
			{ binding: 0, resource: { buffer: source } }, { binding: 1, resource: { buffer: renderUniform } }
		] }));
	} catch (reason) { await Promise.all([device.popErrorScope(), device.popErrorScope()]); owned.forEach((b) => b.destroy()); throw reason; }
	const [validation, allocation] = await Promise.all([device.popErrorScope(), device.popErrorScope()]);
	if (validation || allocation) { owned.forEach((b) => b.destroy()); throw new Error((validation ?? allocation)!.message); }
	const dose = new Float32Array(CELLS), values = new Float32Array([1, 1, -2.3, 0, 0.5, 0.5, 0, 0, 0, 0, 0, 0]);
	let current = 0, remaining = WICK_PIPETTE, emitted = 0, dirty = false, disposed = false, width = 1, height = 1, stepCount = 0, renderCount = 0, dropCount = 0;
	function flush(encoder: GPUCommandEncoder) {
		if (!dirty) return;
		device.queue.writeBuffer(doseBuffer, 0, dose); const pass = encoder.beginComputePass({ label: 'Finite surface-water aliquot' });
		pass.setPipeline(pour); pass.setBindGroup(0, pours[current]); pass.dispatchWorkgroups(CELLS / 64); pass.end();
		dirty = false; dose.fill(0);
	}
	function encode(encoder: GPUCommandEncoder, dt: number, count: number) {
		flush(encoder); device.queue.writeBuffer(stepUniform, 0, new Float32Array([dt, 0, 0, 0]));
		const pass = encoder.beginComputePass({ label: 'Bounded pore transport and uptake' }); pass.setPipeline(compute);
		for (let i = 0; i < count; i++) { pass.setBindGroup(0, steps[current]); pass.dispatchWorkgroups(W / 8, H / 8); current = 1 - current; stepCount++; }
		pass.end();
	}
	async function readState() {
		if (disposed) throw new Error('Porous material is disposed.');
		const read = device.createBuffer({ size: STATE_BYTES, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
		try {
			const encoder = device.createCommandEncoder(); flush(encoder); encoder.copyBufferToBuffer(state[current], 0, read, 0, STATE_BYTES); device.queue.submit([encoder.finish()]);
			await read.mapAsync(GPUMapMode.READ); return new Float32Array(read.getMappedRange().slice(0));
		} finally { read.destroy(); }
	}
	return {
		get memoryBytes() { return FIXED_BYTES; }, get remaining() { return remaining; }, readState,
		drop(x = 0.67, y = 0.5) {
			if (disposed || remaining < WICK_DROP) return false;
			const pulse = wickDose(x, y); for (let i = 0; i < CELLS; i++) dose[i] += pulse[i];
			remaining -= WICK_DROP; emitted += WICK_DROP; dropCount++; dirty = true; return true;
		},
		advance(seconds) {
			if (disposed) return;
			const count = wickSubsteps(seconds), encoder = device.createCommandEncoder(); encode(encoder, seconds / count, count); device.queue.submit([encoder.finish()]);
		},
		setLight(angle) { if (!disposed && Number.isFinite(angle)) values[2] = angle; },
		setEqualPressure(enabled) { if (!disposed) values[7] = Number(enabled); },
		setColorless(enabled) { if (!disposed) values[8] = Number(enabled); },
		setBaseline(enabled) { if (!disposed) values[9] = Number(enabled); },
		endInput() { values[6] = 0; },
		resize(w, h) {
			if (disposed) return;
			if (![w, h].every(Number.isInteger) || w < 1 || h < 1 || w > device.limits.maxTextureDimension2D || h > device.limits.maxTextureDimension2D || w * h > 16_777_216 || FIXED_BYTES + w * h * 4 > 128 * 1024 * 1024) throw new Error('Native porous material exceeds the presentation budget; no downsampling was used.');
			width = w; height = h; values[0] = w; values[1] = h;
		},
		reset() {
			if (disposed) return; const zero = new Float32Array(CELLS * 2); state.forEach((b) => device.queue.writeBuffer(b, 0, zero));
			dose.fill(0); dirty = false; remaining = WICK_PIPETTE; emitted = 0; dropCount = 0; stepCount = 0; values[6] = 0; values[7] = 0;
		},
		step(encoder, dt, input) {
			if (disposed) return;
			if (dt > 0.1) throw new Error('A normal wicking step cannot exceed 0.1 seconds.');
			const count = wickSubsteps(dt);
			if (![input.x, input.y].every(Number.isFinite)) throw new Error('Invalid porous pressure location.');
			const aspect = width / height, scale = Math.min(0.89 * aspect / 1.6, 0.78);
			values[4] = (input.x - 0.5) * aspect / scale / 1.6 + 0.5; values[5] = (input.y - 0.5) / scale + 0.5;
			values[6] = Number(input.active && values[4] >= 0 && values[4] <= 1 && values[5] >= 0 && values[5] <= 1);
			if (emitted > 0) encode(encoder, dt / count, count);
		},
		render(encoder, target) {
			if (disposed) return; flush(encoder); device.queue.writeBuffer(renderUniform, 0, values);
			const pass = encoder.beginRenderPass({ label: 'Native matte swell and compliance relief', colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
			pass.setPipeline(renderer); pass.setBindGroup(0, renders[current]); pass.draw(3); pass.end(); renderCount++;
		},
		async inspect(): Promise<LiquidSnapshot> {
			const state = await readState(), total = wickTotals(state), wet = wickMaterial(total.max);
			return { finite: state.every(Number.isFinite), mass: total.mass, initialMass: emitted, min: total.min, max: total.max, kinetic: 0,
				details: { ...total, remaining, emitted, ledger: total.mass + remaining, initialLedger: WICK_PIPETTE,
					heightMax: wet.rise, complianceMax: wet.compliance, complianceDry: WICK_DRY_COMPLIANCE, equalPressure: values[7], probeLoad: values[6],
					light: values[2], colorless: values[8], baseline: values[9], width, height, steps: stepCount, renders: renderCount, drops: dropCount,
					stateBytes: STATE_BYTES * 2, fixedBytes: FIXED_BYTES, cpuDoseBytes: dose.byteLength, resolvedCanvasBytes: width * height * 4 } };
		},
		dispose() { if (disposed) return; disposed = true; owned.forEach((b) => b.destroy()); }
	};
}
