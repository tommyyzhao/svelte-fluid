import type { LiquidExperiment, LiquidInput, LiquidSnapshot } from './types.js';

const LIMIT = 240;
export const CRACK_RELIEF = 0.058;
export interface CrackSegment { ax: number; ay: number; bx: number; by: number; generation: number }
export interface CrackGraph { segments: CrackSegment[]; seeds: { x: number; y: number; clearance: number }[]; junctions: number }
export const createCrackGraph = (): CrackGraph => ({ segments: [], seeds: [], junctions: 0 });

export function pointSegmentDistance(x: number, y: number, segment: CrackSegment): number {
	const dx = segment.bx - segment.ax, dy = segment.by - segment.ay;
	const t = Math.max(0, Math.min(1, ((x - segment.ax) * dx + (y - segment.ay) * dy) / Math.max(1e-16, dx * dx + dy * dy)));
	return Math.hypot(x - segment.ax - dx * t, y - segment.ay - dy * t);
}

/** Clips growth at its first existing edge: genuine T junctions, not overlaid lines. */
export function appendCrackSegment(graph: CrackGraph, candidate: CrackSegment): boolean {
	if (graph.segments.length >= LIMIT || !Object.values(candidate).every(Number.isFinite)) return true;
	const dx = candidate.bx - candidate.ax, dy = candidate.by - candidate.ay;
	if (Math.hypot(dx, dy) < 1e-7) return true;
	let first = 1, hit = false;
	for (const segment of graph.segments) {
		const ex = segment.bx - segment.ax, ey = segment.by - segment.ay;
		const determinant = dx * ey - dy * ex;
		if (Math.abs(determinant) < 1e-10) continue;
		const qx = segment.ax - candidate.ax, qy = segment.ay - candidate.ay;
		const t = (qx * ey - qy * ex) / determinant;
		const u = (qx * dy - qy * dx) / determinant;
		if (t > 1e-6 && t <= first && u >= -1e-7 && u <= 1 + 1e-7) { first = t; hit = true; }
	}
	// A near-coincident junction can clip an otherwise long candidate below
	// float32 coordinate precision. Stop there without uploading a zero edge.
	if (Math.hypot(dx, dy) * first < 1e-7) return true;
	graph.segments.push({ ...candidate, bx: candidate.ax + dx * first, by: candidate.ay + dy * first });
	if (hit) graph.junctions++;
	return hit;
}

/** A geometric stress-relief proxy. No scalar is pretending to be a stress tensor. */
export function seedCrack(graph: CrackGraph, x: number, y: number): boolean {
	if (![x, y].every(Number.isFinite) || x < 0.075 || x > 0.925 || y < 0.085 || y > 0.915 || graph.segments.length >= LIMIT) return false;
	const clearance = graph.segments.reduce((distance, segment) => Math.min(distance, pointSegmentDistance(x, y, segment)), 1);
	if (clearance < CRACK_RELIEF) return false;
	const generation = graph.seeds.length;
	graph.seeds.push({ x, y, clearance });
	for (let arm = 0; arm < 3; arm++) {
		let ax = x, ay = y, angle = generation * 2.399963 + arm * Math.PI * 2 / 3 + 0.43;
		for (let step = 0; step < 36 && graph.segments.length < LIMIT; step++) {
			angle += Math.sin(step * 1.7 + generation * 3.1 + arm * 5.3) * 0.19;
			const length = 0.027 + 0.008 * (0.5 + 0.5 * Math.sin(step * 2.3 + arm));
			const dx = Math.cos(angle) * length, dy = Math.sin(angle) * length;
			let t = 1;
			if (ax + dx < 0.035) t = Math.min(t, (0.035 - ax) / dx);
			if (ax + dx > 0.965) t = Math.min(t, (0.965 - ax) / dx);
			if (ay + dy < 0.04) t = Math.min(t, (0.04 - ay) / dy);
			if (ay + dy > 0.96) t = Math.min(t, (0.96 - ay) / dy);
			const bx = ax + dx * t, by = ay + dy * t;
			const terminated = appendCrackSegment(graph, { ax, ay, bx, by, generation });
			if (terminated || t < 1) break;
			ax = bx; ay = by;
		}
	}
	return true;
}

const SHADER = /* wgsl */ `
struct Params { display: vec4f, light: vec4f };
struct Segment { ends: vec4f, neighbor: vec4f, info: vec4f };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> segments: array<Segment>;
struct Vertex { @builtin(position) clip: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) edge: u32 };
@vertex fn backgroundVertex(@builtin(vertex_index) id: u32) -> Vertex {
	let p = vec2f(f32((id << 1u) & 2u), f32(id & 2u));
	var out: Vertex; out.clip = vec4f(p * 2.0 - 1.0, 0, 1); out.uv = vec2f(p.x, 1.0 - p.y); out.edge = 0u; return out;
}
fn tileDistance(uv: vec2f) -> f32 {
	let p = abs(uv - 0.5) - vec2f(0.43, 0.415);
	return length(max(p, vec2f(0))) + min(max(p.x, p.y), 0.0) - 0.025;
}
fn square(value: f32) -> f32 { return value * value; }
@fragment fn backgroundFragment(in: Vertex) -> @location(0) vec4f {
	let uv = in.uv; let d = tileDistance(uv); let footprint = max(fwidth(d), 0.000001);
	let light = vec2f(cos(params.light.x), sin(params.light.x));
	let bump = exp(-max(0.0, -d) * 115.0);
	let slope = vec2f(dpdx(d) * params.display.x, dpdy(d) * params.display.y);
	let reflection = exp(-square((dot(uv - 0.5, light) + 0.28) / 0.22));
	let edgeLight = clamp(dot(normalize(slope + vec2f(0.000001)), -light) * bump, -1.0, 1.0);
	let color = vec3f(0.52, 0.68, 0.61) + reflection * vec3f(0.16, 0.17, 0.14)
		+ edgeLight * vec3f(0.16, 0.19, 0.16);
	let shadow = exp(-max(0.0, d) * 65.0) * 0.25;
	let backdrop = vec3f(0.055, 0.085, 0.078) * (1.0 - shadow);
	return vec4f(mix(backdrop, color, 1.0 - smoothstep(-footprint, footprint, d)), 1);
}
@vertex fn crackVertex(@builtin(vertex_index) id: u32, @builtin(instance_index) instance: u32) -> Vertex {
	let segment = segments[instance];
	let corner = array<vec2f, 6>(vec2f(0,0), vec2f(1,0), vec2f(0,1), vec2f(0,1), vec2f(1,0), vec2f(1,1));
	// Native-pixel fringe extends the analytic bevel's support at every DPR.
	let padding = vec2f(0.005) + 2.0 / params.display.xy;
	let lo = min(segment.ends.xy, segment.ends.zw) - padding;
	let hi = max(segment.ends.xy, segment.ends.zw) + padding;
	let uv = mix(lo, hi, corner[id]);
	var out: Vertex; out.clip = vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 0, 1); out.uv = uv; out.edge = instance; return out;
}
@fragment fn crackFragment(in: Vertex) -> @location(0) vec4f {
	let segment = segments[in.edge]; let a = segment.ends.xy; let b = segment.ends.zw;
	let aspect = params.display.x / params.display.y;
	let delta = (b - a) * vec2f(aspect, 1); let p = (in.uv - a) * vec2f(aspect, 1);
	let t = clamp(dot(p, delta) / max(dot(delta, delta), 0.0000001), 0.0, 1.0);
	let away = p - delta * t; let distance = length(away);
	let footprint = max(fwidth(distance), 1.0 / params.display.y);
	let width = 0.00063 * (1.0 - min(segment.info.x, 5.0) * 0.075);
	let core = 1.0 - smoothstep(width - footprint * 0.65, width + footprint * 0.65, distance);
	let bevel = exp(-square((distance - width * 1.5) / (0.0009 + footprint * 0.5)));
	let light = vec2f(cos(params.light.x), sin(params.light.x));
	let side = dot(away / max(distance, 0.000001), -light);
	let highlight = max(side, 0.0) * bevel * 0.62;
	let shadow = max(-side, 0.0) * bevel * 0.18;
	let alpha = clamp(core * 0.8 + highlight + shadow, 0.0, 0.94);
	let color = mix(vec3f(0.14, 0.20, 0.15), vec3f(0.97, 0.93, 0.69), highlight / max(alpha, 0.00001));
	let tile = 1.0 - smoothstep(-fwidth(tileDistance(in.uv)), fwidth(tileDistance(in.uv)), tileDistance(in.uv));
	// Adjacent spans partition the join on the shared angle bisector. Their
	// round caps must not source-over twice and make a dot at every vertex.
	// Derivatives above are evaluated before the nonuniform discard.
	let direction = normalize(delta);
	if (segment.info.y > 0.5) {
		let previous = normalize(segment.neighbor.xy * vec2f(aspect, 1));
		if (dot(p, previous + direction) < 0.0) { discard; }
	}
	if (segment.info.z > 0.5) {
		let next = normalize(segment.neighbor.zw * vec2f(aspect, 1));
		if (dot(p - delta, direction + next) >= 0.0) { discard; }
	}
	return vec4f(color * alpha * tile, alpha * tile);
}`;

export interface CrazedEnamelExperiment extends LiquidExperiment {
	setLight(angle: number): void;
	seed(x: number, y: number): boolean;
}

export async function createCrazedEnamel(device: GPUDevice, format: GPUTextureFormat): Promise<CrazedEnamelExperiment> {
	const module = device.createShaderModule({ label: 'Geometric glaze fracture and filtered bevels', code: SHADER });
	const background = await device.createRenderPipelineAsync({ label: 'Native glazed ceramic', layout: 'auto', vertex: { module, entryPoint: 'backgroundVertex' }, fragment: { module, entryPoint: 'backgroundFragment', targets: [{ format }] } });
	const cracks = await device.createRenderPipelineAsync({ label: 'Sparse native crack bevels', layout: 'auto', vertex: { module, entryPoint: 'crackVertex' }, fragment: { module, entryPoint: 'crackFragment', targets: [{ format, blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } }] } });
	const uniform = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
	const edges = device.createBuffer({ size: LIMIT * 48, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
	const bgGroup = device.createBindGroup({ layout: background.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] });
	const group = device.createBindGroup({ layout: cracks.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: edges } }] });
	const values = new Float32Array([1, 1, 0, 0, -2.15, 0, 0, 0]);
	const packed = new Float32Array(LIMIT * 12);
	let graph = createCrackGraph(), width = 1, height = 1, disposed = false, travel = 0, renders = 0, uploads = 0;
	const seed = (x: number, y: number) => {
		if (disposed || !seedCrack(graph, x, y)) return false;
		graph.segments.forEach((edge, i) => {
			const before = graph.segments[i - 1], after = graph.segments[i + 1];
			const joinedBefore = before?.bx === edge.ax && before?.by === edge.ay;
			const joinedAfter = after?.ax === edge.bx && after?.ay === edge.by;
			packed.set([edge.ax, edge.ay, edge.bx, edge.by,
				joinedBefore ? before.bx - before.ax : 1, joinedBefore ? before.by - before.ay : 0,
				joinedAfter ? after.bx - after.ax : 1, joinedAfter ? after.by - after.ay : 0,
				edge.generation, Number(joinedBefore), Number(joinedAfter), 0], i * 12);
		});
		device.queue.writeBuffer(edges, 0, packed, 0, graph.segments.length * 12); uploads++;
		return true;
	};
	seed(0.38, 0.46);
	return {
		get memoryBytes() { return LIMIT * 48 + 32; },
		resize(w, h) {
			if (disposed) return;
			if (![w, h].every(Number.isInteger) || w < 1 || h < 1 || w > device.limits.maxTextureDimension2D || h > device.limits.maxTextureDimension2D || w * h > 16_777_216) throw new Error('Native glaze dimensions exceed the presentation limit; no downsampling was used.');
			width = w; height = h; values[0] = w; values[1] = h;
		},
		setLight(angle) { if (!disposed && Number.isFinite(angle)) values[4] = angle; },
		seed,
		endInput() { travel = 0; },
		reset() { if (!disposed) { graph = createCrackGraph(); travel = 0; } },
		step(_encoder: GPUCommandEncoder, dt: number, input: LiquidInput) {
			if (disposed || !input.active || !Number.isFinite(dt) || dt <= 0 || ![input.x, input.y, input.vx, input.vy].every(Number.isFinite)) return;
			travel += Math.min(dt, 1 / 30) * Math.hypot(input.vx, input.vy);
			if (travel >= 0.12) { travel = 0; seed(input.x, input.y); }
		},
		render(encoder, target) {
			if (disposed) return;
			device.queue.writeBuffer(uniform, 0, values);
			const pass = encoder.beginRenderPass({ label: 'Glaze and sparse persistent bevels', colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
			pass.setPipeline(background); pass.setBindGroup(0, bgGroup); pass.draw(3);
			if (graph.segments.length) { pass.setPipeline(cracks); pass.setBindGroup(0, group); pass.draw(6, graph.segments.length); }
			pass.end(); renders++;
		},
		async inspect(): Promise<LiquidSnapshot> {
			let checksum = 0, length = 0;
			graph.segments.forEach((edge, i) => { checksum += (i + 1) * (edge.ax + 2 * edge.ay + 3 * edge.bx + 4 * edge.by); length += Math.hypot(edge.bx - edge.ax, edge.by - edge.ay); });
			return { finite: graph.segments.every((edge) => Object.values(edge).every(Number.isFinite)), mass: 0, initialMass: 0, min: 0, max: length, kinetic: 0,
				details: { segments: graph.segments.length, segmentLimit: LIMIT, seeds: graph.seeds.length, junctions: graph.junctions, checksum, minSeedClearance: Math.min(1, ...graph.seeds.map((seed) => seed.clearance)), reliefRadius: CRACK_RELIEF, light: values[4], width, height, renders, uploads, stateBytes: LIMIT * 48, resolvedCanvasBytes: width * height * 4 } };
		},
		dispose() { if (disposed) return; disposed = true; edges.destroy(); uniform.destroy(); }
	};
}
