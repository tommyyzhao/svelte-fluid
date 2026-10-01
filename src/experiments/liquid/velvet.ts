import type { LiquidExperiment, LiquidInput, LiquidSnapshot } from './types.js';

const COLUMNS = 96;
const ROWS = 64;
const INITIAL_LEAN = -0.62;

/** Polar lean, not an undirected tangent axis or a painted brightness mask. */
export function createPileField(): Float32Array<ArrayBuffer> {
	const field = new Float32Array(COLUMNS * ROWS * 2);
	for (let i = 1; i < field.length; i += 2) field[i] = INITIAL_LEAN;
	return field;
}

export function brushPile(field: Float32Array, from: readonly number[], to: readonly number[], aspect = 1.5): boolean {
	if (field.length !== COLUMNS * ROWS * 2 || ![...from, ...to, aspect].every(Number.isFinite) || aspect <= 0) return false;
	const dx = (to[0] - from[0]) * aspect, dy = to[1] - from[1];
	const distance = Math.hypot(dx, dy);
	if (!Number.isFinite(distance) || distance < 0.00001) return false;
	const nx = dx / distance * 0.9, ny = dy / distance * 0.9;
	let changed = false;
	for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLUMNS; x++) {
		const px = (x / (COLUMNS - 1) - from[0]) * aspect, py = y / (ROWS - 1) - from[1];
		const projection = (px * dx + py * dy) / distance;
		const perpendicular2 = Math.max(0, px * px + py * py - projection * projection);
		const radius2 = 0.095 ** 2;
		if (perpendicular2 >= radius2) continue;
		const halfChord = Math.sqrt(radius2 - perpendicular2);
		const lo = Math.max(-projection, -halfChord), hi = Math.min(distance - projection, halfChord);
		if (hi <= lo) continue;
		// Exact line integral of the compact quartic brush kernel. Splitting a
		// straight stroke into many pointer samples gives the same exposure.
		const a = 1 - perpendicular2 / radius2;
		const integral = (s: number) => a * a * s - 2 * a * s ** 3 / (3 * radius2) + s ** 5 / (5 * radius2 ** 2);
		const weight = 1 - Math.exp(-180 * Math.max(0, integral(hi) - integral(lo)));
		const index = (y * COLUMNS + x) * 2;
		field[index] += (nx - field[index]) * weight;
		field[index + 1] += (ny - field[index + 1]) * weight;
		changed = true;
	}
	return changed;
}

const SHADER = /* wgsl */ `
struct Params { display: vec4f, light: vec4f };
@group(0) @binding(0) var<storage, read> pile: array<vec2f>;
@group(0) @binding(1) var<uniform> params: Params;
struct Vertex { @builtin(position) clip: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) id: u32) -> Vertex {
	let p = vec2f(f32((id << 1u) & 2u), f32(id & 2u));
	var out: Vertex; out.clip = vec4f(p * 2.0 - 1.0, 0, 1); out.uv = vec2f(p.x, 1.0 - p.y); return out;
}
fn cubic(f: f32) -> vec4f {
	let f2 = f * f; let f3 = f2 * f; let r = 1.0 - f;
	return vec4f(r * r * r, 3.0 * f3 - 6.0 * f2 + 4.0, -3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0, f3) / 6.0;
}
fn leanAt(uv: vec2f) -> vec2f {
	let p = clamp(uv, vec2f(0), vec2f(1)) * vec2f(${COLUMNS - 1}, ${ROWS - 1});
	let cell = vec2i(floor(p)); let wx = cubic(fract(p.x)); let wy = cubic(fract(p.y));
	var lean = vec2f(0);
	// C2 B-spline reconstruction removes cell-shaped shoulders that a C1
	// smoothstep bilerp left visible around curved strokes at native 3×.
	for (var y = 0; y < 4; y++) {
		for (var x = 0; x < 4; x++) {
			let q = clamp(cell + vec2i(x - 1, y - 1), vec2i(0), vec2i(${COLUMNS - 1}, ${ROWS - 1}));
			lean += pile[u32(q.y * ${COLUMNS} + q.x)] * wx[x] * wy[y];
		}
	}
	return lean;
}
@fragment fn fragment(in: Vertex) -> @location(0) vec4f {
	let uv = in.uv; let lean = leanAt(uv);
	let p = (uv - 0.5) * vec2f(params.display.x / params.display.y, 1);
	let normal = normalize(vec3f(-p * 0.10, 1));
	let light = normalize(vec3f(cos(params.light.x) * 0.84, sin(params.light.x) * 0.84, 0.52));
	let napNormal = normalize(vec3f(lean * 1.25, 0.85));
	// The signed first-order lean/light term makes the pile polar. Reversing
	// the brush is visibly different even though the anisotropic axis agrees.
	let nap = pow(clamp(0.5 + 0.5 * dot(napNormal, light), 0.0, 1.0), 2.8);
	let tangent = normalize(vec3f(lean.x, lean.y, 0.22));
	let halfVector = normalize(light + vec3f(0, 0, 1));
	let grazing = pow(max(0.0, 1.0 - dot(tangent, halfVector) * dot(tangent, halfVector)), 9.0);
	let materialPoint = uv * vec2f(params.display.x / params.display.y, 1);
	let phase = dot(materialPoint, vec2f(2471, 831));
	let crossPhase = dot(materialPoint, vec2f(-1171, 3343));
	// Integrate away subpixel frequencies instead of putting a coarse bitmap
	// behind a Retina canvas. Fine detail never owns the material memory.
	// Fixed material-space carriers avoid invented phase folds from dotting
	// the global position with a non-integrable local orientation field.
	let footprint = max(abs(dpdx(phase)), abs(dpdy(phase)));
	let crossFootprint = max(abs(dpdx(crossPhase)), abs(dpdy(crossPhase)));
	let grain = (sin(phase) * exp(-0.24 * footprint * footprint)
		+ 0.5 * sin(crossPhase) * exp(-0.24 * crossFootprint * crossFootprint)) / 1.5;
	let broad = 0.5 + 0.5 * sin(uv.x * 17.0 + sin(uv.y * 11.0));
	let base = vec3f(0.13, 0.008, 0.028);
	let radiance = base * (0.22 + 2.55 * nap + grain * 0.11 + broad * 0.018)
		+ vec3f(0.13, 0.046, 0.064) * grazing * (0.15 + 0.5 * nap)
		+ base * max(dot(normal, light), 0.0) * 0.08;
	let edge = smoothstep(0.0, 0.10, uv.x) * smoothstep(0.0, 0.10, 1.0 - uv.x)
		* smoothstep(0.0, 0.11, uv.y) * smoothstep(0.0, 0.11, 1.0 - uv.y);
	let color = pow(vec3f(1) - exp(-radiance * (0.72 + 0.28 * edge)), vec3f(1.0 / 2.2));
	return vec4f(color, 1);
}`;

export interface VelvetExperiment extends LiquidExperiment {
	setLight(angle: number): void;
	brush(from: readonly number[], to: readonly number[]): void;
}

export async function createVelvet(device: GPUDevice, format: GPUTextureFormat): Promise<VelvetExperiment> {
	const module = device.createShaderModule({ label: 'Polar velvet nap', code: SHADER });
	const pipeline = await device.createRenderPipelineAsync({ label: 'Native velvet reflectance', layout: 'auto',
		vertex: { module, entryPoint: 'vertex' }, fragment: { module, entryPoint: 'fragment', targets: [{ format }] } });
	const field = createPileField();
	const storage = device.createBuffer({ label: 'Persistent velvet lean', size: field.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
	const uniform = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
	const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
		{ binding: 0, resource: { buffer: storage } }, { binding: 1, resource: { buffer: uniform } }
	] });
	const values = new Float32Array([1, 1, 0, 0, -2.3, 0, 0, 0]);
	let width = 1, height = 1, disposed = false, uploads = 0, renders = 0, brushes = 0;
	let previous: number[] | undefined;
	const upload = () => { device.queue.writeBuffer(storage, 0, field); uploads++; };
	const brush = (from: readonly number[], to: readonly number[]) => {
		if (!disposed && brushPile(field, from, to, width / height)) { upload(); brushes++; }
	};
	upload();
	return {
		get memoryBytes() { return field.byteLength + 32; },
		resize(w, h) {
			if (disposed) return;
			if (![w, h].every(Number.isInteger) || w < 1 || h < 1 || w > device.limits.maxTextureDimension2D || h > device.limits.maxTextureDimension2D || w * h > 16_777_216) throw new Error('Native velvet dimensions exceed the presentation limit; no downsampling was used.');
			width = w; height = h; values[0] = w; values[1] = h;
		},
		setLight(angle) { if (!disposed && Number.isFinite(angle)) values[4] = angle; },
		brush,
		endInput() { previous = undefined; },
		reset() { if (!disposed) { field.set(createPileField()); upload(); brushes = 0; previous = undefined; } },
		step(_encoder: GPUCommandEncoder, dt: number, input: LiquidInput) {
			if (!input.active || !Number.isFinite(dt) || dt <= 0 || ![input.x, input.y, input.vx, input.vy].every(Number.isFinite)) { previous = undefined; return; }
			// LabSession repeats one endpoint/velocity across fixed substeps. The
			// actual swept endpoint segment owns a stroke, not velocity × substep.
			// This also preserves fast strokes after the harness velocity clamp.
			const current = [input.x, input.y];
			if (previous) brush(previous, current);
			previous = current;
		},
		render(encoder, target) {
			if (disposed) return;
			device.queue.writeBuffer(uniform, 0, values);
			const pass = encoder.beginRenderPass({ label: 'Velvet native surface', colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
			pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.draw(3); pass.end(); renders++;
		},
		async inspect(): Promise<LiquidSnapshot> {
			let squared = 0, changed = 0, checksum = 0, finite = true;
			for (let i = 0; i < field.length; i += 2) {
				finite &&= Number.isFinite(field[i]) && Number.isFinite(field[i + 1]);
				squared += field[i] ** 2 + field[i + 1] ** 2;
				if (Math.abs(field[i]) + Math.abs(field[i + 1] - INITIAL_LEAN) > 0.01) changed++;
				checksum += field[i] * (i + 1) + field[i + 1] * (i + 2);
			}
			return { finite, mass: 0, initialMass: 0, min: 0, max: Math.sqrt(squared / (COLUMNS * ROWS)), kinetic: 0,
				details: { columns: COLUMNS, rows: ROWS, changedCells: changed, checksum, uploads, brushes, renders, light: values[4], width, height, stateBytes: field.byteLength, cpuStateBytes: field.byteLength, resolvedCanvasBytes: width * height * 4 } };
		},
		dispose() { if (disposed) return; disposed = true; storage.destroy(); uniform.destroy(); }
	};
}
