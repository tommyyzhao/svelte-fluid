import type { LiquidExperiment, LiquidSnapshot } from './types.js';

/** Periodic, one-dimensional elastic rim waves; not a water-surface solver.
 * Fourier / d'Alembert split: https://math.mit.edu/classes/18.086/hw1sol.pdf
 * Damping: https://mathlets.org/mathlets/damped-wave-equation/
 * q_tt + 2 damping q_t = speed² q_ss, independently on each closed path.
 */
export const CONTOUR_MODES = 24;
export const CONTOUR_SAMPLES = 256;
export const CONTOUR_AMPLITUDE_LIMIT = 0.075;
const TAU = Math.PI * 2;
export const CONTOURS = [
	{ x: -0.19, y: 0, hx: 0.67, hy: 0.34, radius: 0.24 },
	{ x: 0.77, y: 0, hx: 0.13, hy: 0.13, radius: 0.13 }
] as const;
export type ContourShape = { x: number; y: number; hx: number; hy: number; radius: number };
export interface ContourState { modes: Float64Array; length: number }
export interface ContourOptions { speed: number; damping: number; baseline: boolean }
export const DEFAULT_CONTOUR_OPTIONS: ContourOptions = { speed: 1.8, damping: 1.5, baseline: false };
export const contourLength = (shape: ContourShape): number => 4 * (shape.hx + shape.hy - 2 * shape.radius) + TAU * shape.radius;
export const createContourState = (length: number): ContourState => ({ modes: new Float64Array(CONTOUR_MODES * 4), length });

/** An authored response budget, not a claim of motion safety. Equal world-space
 * forcing made the small circle disproportionately deform and ring many times.
 * Scale forcing with perimeter; decay comparable amounts per circuit; cap all
 * free evolution to 10% of the smaller half-size (including repeated input).
 */
export function contourResponse(shape: ContourShape) {
	const inputScale = contourLength(shape) / contourLength(CONTOURS[0]);
	return {
		inputScale,
		dampingScale: 1 / inputScale,
		amplitudeLimit: Math.min(CONTOUR_AMPLITUDE_LIMIT * inputScale, 0.1 * Math.min(shape.hx, shape.hy))
	};
}

/** Closest point and arc length on an authored rounded rectangle (circle included).
 * Start at its top-right straight/arc junction, proceed clockwise in DOM y-down.
 */
export function nearestContour(x: number, y: number, shape: ContourShape) {
	const px = x - shape.x, py = y - shape.y, ax = shape.hx - shape.radius, ay = shape.hy - shape.radius;
	const dx = Math.abs(px) - ax, dy = Math.abs(py) - ay, corner = shape.radius * Math.PI / 2;
	let s: number, nx: number, ny: number, qx: number, qy: number;
	if (dx > 0 && dy > 0) {
		const cx = Math.sign(px) * ax, cy = Math.sign(py) * ay;
		const angle = Math.atan2(py - cy, px - cx);
		nx = Math.cos(angle); ny = Math.sin(angle); qx = cx + shape.radius * nx; qy = cy + shape.radius * ny;
		if (px >= 0 && py < 0) s = shape.radius * (angle + Math.PI / 2);
		else if (px >= 0) s = corner + 2 * ay + shape.radius * angle;
		else if (py >= 0) s = 2 * corner + 2 * ay + 2 * ax + shape.radius * (angle - Math.PI / 2);
		else s = 3 * corner + 4 * ay + 2 * ax + shape.radius * (angle + Math.PI);
	} else if (dx > dy) {
		nx = px >= 0 ? 1 : -1; ny = 0; qx = nx * shape.hx; qy = Math.max(-ay, Math.min(ay, py));
		s = px >= 0 ? corner + qy + ay : 3 * corner + 2 * ay + 2 * ax + ay - qy;
	} else {
		nx = 0; ny = py >= 0 ? 1 : -1; qx = Math.max(-ax, Math.min(ax, px)); qy = ny * shape.hy;
		s = py >= 0 ? 2 * corner + 2 * ay + ax - qx : 4 * corner + 4 * ay + 2 * ax + qx + ax;
	}
	return { s: s % contourLength(shape), distance: (px - qx) * nx + (py - qy) * ny, x: qx + shape.x, y: qy + shape.y, nx, ny };
}

export function contourPoint(s: number, shape: ContourShape) {
	const ax = shape.hx - shape.radius, ay = shape.hy - shape.radius, r = shape.radius, arc = r * Math.PI / 2;
	let t = ((s % contourLength(shape)) + contourLength(shape)) % contourLength(shape);
	const arcPoint = (cx: number, cy: number, angle: number) => ({ x: shape.x + cx + r * Math.cos(angle), y: shape.y + cy + r * Math.sin(angle) });
	if (t < arc) return arcPoint(ax, -ay, t / r - Math.PI / 2); t -= arc;
	if (t < 2 * ay) return { x: shape.x + shape.hx, y: shape.y - ay + t }; t -= 2 * ay;
	if (t < arc) return arcPoint(ax, ay, t / r); t -= arc;
	if (t < 2 * ax) return { x: shape.x + ax - t, y: shape.y + shape.hy }; t -= 2 * ax;
	if (t < arc) return arcPoint(-ax, ay, t / r + Math.PI / 2); t -= arc;
	if (t < 2 * ay) return { x: shape.x - shape.hx, y: shape.y + ay - t }; t -= 2 * ay;
	if (t < arc) return arcPoint(-ax, -ay, t / r + Math.PI); t -= arc;
	return { x: shape.x - ax + t, y: shape.y - shape.hy };
}

/** Exact underdamped modal propagator. Public controls keep every mode underdamped. */
export function advanceContour(state: ContourState, dt: number, speed: number, damping: number): void {
	if (![dt, speed, damping].every(Number.isFinite) || dt <= 0 || speed <= 0 || damping < 0) return;
	if (TAU * speed / state.length <= damping) throw new RangeError('Contour modes must remain underdamped.');
	const attenuation = Math.exp(-damping * dt);
	for (let n = 1; n <= CONTOUR_MODES; n++) {
		const omega2 = (TAU * n * speed / state.length) ** 2, w = Math.sqrt(omega2 - damping * damping);
		const c = Math.cos(w * dt), b = Math.sin(w * dt) / w, i = (n - 1) * 4;
		for (let component = 0; component < 2; component++) {
			const q = state.modes[i + component], v = state.modes[i + component + 2];
			state.modes[i + component] = attenuation * ((c + damping * b) * q + b * v);
			state.modes[i + component + 2] = attenuation * ((c - damping * b) * v - omega2 * b * q);
		}
	}
}

/** A conservative all-time displacement bound for the current free evolution. */
export function contourEnvelope(state: ContourState, speed: number, damping: number): number {
	let bound = 0;
	for (let n = 1; n <= CONTOUR_MODES; n++) {
		const i = (n - 1) * 4, w = Math.sqrt((TAU * n * speed / state.length) ** 2 - damping ** 2);
		for (let axis = 0; axis < 2; axis++) bound += Math.hypot(state.modes[i + axis], (state.modes[i + axis + 2] + damping * state.modes[i + axis]) / w);
	}
	return bound;
}

/** Gaussian displacement, zero mean normal displacement, no added initial velocity.
 * Saturation limits NEW excitation only; existing motion is never reset by a pulse.
 */
export function pulseContour(state: ContourState, s: number, amplitude: number, speed: number, damping: number,
	amplitudeLimit = CONTOUR_AMPLITUDE_LIMIT): number {
	if (![s, amplitude, speed, damping].every(Number.isFinite)) return 0;
	const coefficients = new Float64Array(CONTOUR_MODES * 2), sigma = Math.min(0.058, state.length * 0.06);
	let addedBound = 0;
	for (let n = 1; n <= CONTOUR_MODES; n++) {
		const k = TAU * n / state.length, a = 2 * amplitude * Math.sqrt(TAU) * sigma / state.length * Math.exp(-0.5 * (k * sigma) ** 2);
		const w = Math.sqrt((k * speed) ** 2 - damping ** 2), envelopeFactor = Math.hypot(1, damping / w);
		coefficients[(n - 1) * 2] = a * Math.cos(k * s); coefficients[(n - 1) * 2 + 1] = a * Math.sin(k * s);
		addedBound += envelopeFactor * (Math.abs(coefficients[(n - 1) * 2]) + Math.abs(coefficients[(n - 1) * 2 + 1]));
	}
	const scale = Math.min(1, Math.max(0, amplitudeLimit - contourEnvelope(state, speed, damping)) / Math.max(1e-30, addedBound));
	for (let n = 0; n < CONTOUR_MODES; n++) { state.modes[n * 4] += scale * coefficients[n * 2]; state.modes[n * 4 + 1] += scale * coefficients[n * 2 + 1]; }
	return scale;
}

export function sampleContour(state: ContourState, s: number): number {
	let q = 0;
	for (let n = 1; n <= CONTOUR_MODES; n++) q += state.modes[(n - 1) * 4] * Math.cos(TAU * n * s / state.length) + state.modes[(n - 1) * 4 + 1] * Math.sin(TAU * n * s / state.length);
	return q;
}
export function contourEnergy(state: ContourState, speed: number): number {
	let energy = 0;
	for (let n = 1; n <= CONTOUR_MODES; n++) {
		const i = (n - 1) * 4, w2 = (TAU * n * speed / state.length) ** 2;
		energy += state.length / 4 * (state.modes[i + 2] ** 2 + state.modes[i + 3] ** 2 + w2 * (state.modes[i] ** 2 + state.modes[i + 1] ** 2));
	}
	return energy;
}

/** Bounded swept input: fast movement across a rim must not miss it just because
 * both browser event endpoints lie away from the edge. Samples are world-space,
 * independent of canvas pixels. The modal excitation cap remains authoritative.
 */
export function contourStroke(from: { x: number; y: number }, to: { x: number; y: number }) {
	const hits: { contour: number; fraction: number; amplitude: number }[] = [];
	if (![from.x, from.y, to.x, to.y].every(Number.isFinite)) return hits;
	const samples = Math.min(96, Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 0.045)));
	for (let sample = 1; sample <= samples; sample++) {
		const t = sample / samples, x = from.x + (to.x - from.x) * t, y = from.y + (to.y - from.y) * t;
		let nearest = -1, distance = Infinity, fraction = 0;
		for (let i = 0; i < CONTOURS.length; i++) {
			const hit = nearestContour(x, y, CONTOURS[i]);
			if (Math.abs(hit.distance) < distance) { nearest = i; distance = Math.abs(hit.distance); fraction = hit.s / contourLength(CONTOURS[i]); }
		}
		if (distance < 0.115) hits.push({ contour: nearest, fraction, amplitude: 0.032 * (1 - distance / 0.115) });
	}
	return hits;
}

const SHADER = /* wgsl */ `
struct Params { display: vec4f, control: vec4f, first: vec4f, second: vec4f };
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read> heights: array<f32>;
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) i: u32) -> Vertex {
	let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
	return Vertex(vec4f(xy * 2.0 - 1.0, 0, 1), vec2f(xy.x, 1.0 - xy.y));
}
// Exact closest-point arc length, rather than UV angle (which speeds up on straights).
fn path(point: vec2f, half: vec2f, r: f32) -> vec4f {
	let a = half - r; let d = abs(point) - a; let arc = r * 1.570796326795;
	var s = 0.0; var normal = vec2f(0.0); var q = vec2f(0.0);
	if (d.x > 0.0 && d.y > 0.0) {
		let center = sign(point) * a; let angle = atan2(point.y - center.y, point.x - center.x);
		normal = vec2f(cos(angle), sin(angle)); q = center + r * normal;
		if (point.x >= 0.0 && point.y < 0.0) { s = r * (angle + 1.570796326795); }
		else if (point.x >= 0.0) { s = arc + 2.0 * a.y + r * angle; }
		else if (point.y >= 0.0) { s = 2.0 * arc + 2.0 * a.y + 2.0 * a.x + r * (angle - 1.570796326795); }
		else { s = 3.0 * arc + 4.0 * a.y + 2.0 * a.x + r * (angle + 3.14159265359); }
	} else if (d.x > d.y) {
		normal = vec2f(select(-1.0, 1.0, point.x >= 0.0), 0); q = vec2f(normal.x * half.x, clamp(point.y, -a.y, a.y));
		s = select(3.0 * arc + 3.0 * a.y + 2.0 * a.x - q.y, arc + q.y + a.y, point.x >= 0.0);
	} else {
		normal = vec2f(0, select(-1.0, 1.0, point.y >= 0.0)); q = vec2f(clamp(point.x, -a.x, a.x), normal.y * half.y);
		s = select(4.0 * arc + 4.0 * a.y + 3.0 * a.x + q.x, 2.0 * arc + 2.0 * a.y + a.x - q.x, point.y >= 0.0);
	}
	return vec4f(dot(point - q, normal), s / (4.0 * (a.x + a.y) + 4.0 * arc), normal);
}
fn sample(index: i32, contour: u32) -> f32 { return heights[contour * ${CONTOUR_SAMPLES}u + u32((index + ${CONTOUR_SAMPLES * 2}) % ${CONTOUR_SAMPLES})]; }
fn wave(s: f32, contour: u32) -> f32 {
	let x = fract(s) * ${CONTOUR_SAMPLES}.0; let i = i32(floor(x)); let t = fract(x);
	let a = sample(i - 1, contour); let b = sample(i, contour); let c = sample(i + 1, contour); let d = sample(i + 2, contour);
	return 0.5 * (2.0 * b + (-a + c) * t + (2.0 * a - 5.0 * b + 4.0 * c - d) * t * t + (-a + 3.0 * b - 3.0 * c + d) * t * t * t);
}
fn ring(color: vec3f, route: vec4f, contour: u32, pulse: vec4f, perimeter: f32) -> vec3f {
	let height = wave(route.y, contour);
	let position = fract(pulse.x + pulse.y * p.control.x / perimeter);
	let delta = abs(fract(route.y - position + 0.5) - 0.5);
	let canned = exp(-pow(delta / 0.042, 2.0)) * exp(-pulse.w * pulse.y) * pulse.z;
	let displacement = select(height, 0.0, p.control.z > 0.5);
	let distance = route.x - displacement;
	let halfWidth = 0.015;
	let edge = abs(distance) - halfWidth;
	let footprint = max(fwidth(edge), 0.00001);
	let coverage = 1.0 - smoothstep(-0.5 * footprint, 0.5 * footprint, edge);
	let cross = clamp(distance / halfWidth, -0.999, 0.999);
	// Differentiate the displaced implicit rim itself: a traveling slope must
	// tilt its highlight, rather than retaining the undeformed path's normal.
	let gradient = vec2f(dpdx(distance) * p.display.z / p.display.x, dpdy(distance) * p.display.w / p.display.y);
	let across = gradient / max(length(gradient), 0.00001);
	let normal = normalize(vec3f(across * cross * 0.85, sqrt(max(0.001, 1.0 - cross * cross))));
	let light = normalize(vec3f(-0.35, -0.65, 0.9));
	let specular = pow(max(0.0, dot(normal, normalize(light + vec3f(0, 0, 1)))), 28.0);
	let activity = select(clamp(abs(height) * 35.0, 0.0, 1.0), canned, p.control.z > 0.5);
	let base = mix(vec3f(0.25, 0.37, 0.38), vec3f(0.91, 0.55, 0.29), activity);
	let material = base * (0.4 + 0.60 * max(dot(normal, light), 0.0)) + vec3f(0.83, 0.92, 0.85) * specular * (0.32 + activity * 0.65);
	let shadowDistance = (route.x - 0.019) / 0.025;
	let glowDistance = distance / 0.043;
	let shadow = exp(-shadowDistance * shadowDistance) * 0.13;
	let glow = exp(-glowDistance * glowDistance) * activity * vec3f(0.15, 0.055, 0.012);
	return mix(color * (1.0 - shadow) + glow, material, coverage);
}
@fragment fn fragment(v: Vertex) -> @location(0) vec4f {
	let point = (v.uv - 0.5) * p.display.xy;
	var color = vec3f(0.041, 0.069, 0.074) + vec3f(0.012, 0.022, 0.022) * exp(-dot(point, point) * 1.5);
	color = ring(color, path(point - vec2f(-0.19, 0), vec2f(0.67, 0.34), 0.24), 0u, p.first, ${contourLength(CONTOURS[0])});
	color = ring(color, path(point - vec2f(0.77, 0), vec2f(0.13), 0.13), 1u, p.second, ${contourLength(CONTOURS[1])});
	return vec4f(color, 1);
}`;

export interface ContourExperiment extends LiquidExperiment {
	pulse(contour?: number, fraction?: number, amplitude?: number): void;
	setOptions(options: Partial<ContourOptions>): void;
}
export async function createContourWaves(device: GPUDevice, format: GPUTextureFormat): Promise<ContourExperiment> {
	const module = device.createShaderModule({ label: 'Periodic contour echoes / analytic native rim', code: SHADER });
	const errors = (await module.getCompilationInfo()).messages.filter((message) => message.type === 'error');
	if (errors.length) throw new Error(errors.map((message) => `Contour shader ${message.lineNum}: ${message.message}`).join('\n'));
	const pipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module, entryPoint: 'vertex' }, fragment: { module, entryPoint: 'fragment', targets: [{ format }] } });
	const uniform = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
	const field = new Float32Array(CONTOUR_SAMPLES * CONTOURS.length);
	const storage = device.createBuffer({ size: field.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
	const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: storage } }] });
	const states = CONTOURS.map((shape) => createContourState(contourLength(shape))), options = { ...DEFAULT_CONTOUR_OPTIONS };
	const responses = CONTOURS.map(contourResponse);
	const basis = new Float64Array(CONTOUR_SAMPLES * CONTOUR_MODES * 2);
	for (let i = 0; i < CONTOUR_SAMPLES; i++) for (let n = 1; n <= CONTOUR_MODES; n++) {
		const j = (i * CONTOUR_MODES + n - 1) * 2; basis[j] = Math.cos(TAU * n * i / CONTOUR_SAMPLES); basis[j + 1] = Math.sin(TAU * n * i / CONTOUR_SAMPLES);
	}
	const data = new Float32Array(16), lastPulses = CONTOURS.map(() => ({ fraction: 0, age: 0, active: 0 }));
	let width = 0, height = 0, disposed = false, impulses = 0, limited = 0, renders = 0, previous: { x: number; y: number } | undefined;
	const pulse = (contour = 0, fraction = 0.15, amplitude = 0.037) => {
		if (disposed || !Number.isInteger(contour) || !states[contour] || !Number.isFinite(fraction) || !Number.isFinite(amplitude)) return;
		const response = responses[contour];
		const scale = pulseContour(states[contour], fraction * states[contour].length,
			Math.max(-0.045, Math.min(0.045, amplitude)) * response.inputScale, options.speed,
			options.damping * response.dampingScale, response.amplitudeLimit);
		if (scale < 1) limited++; if (scale > 0) impulses++;
		lastPulses[contour] = { fraction: ((fraction % 1) + 1) % 1, age: 0, active: 1 };
	};
	return {
		memoryBytes: field.byteLength + 64,
		pulse,
		setOptions(update) {
			if (disposed) return;
			const next = { ...options, ...update };
			if (!Number.isFinite(next.speed) || next.speed < 1.2 || next.speed > 3.5 || !Number.isFinite(next.damping) || next.damping < 0.8 || next.damping > 1.8) throw new RangeError('Contour speed / damping exceeds the bounded underdamped regime.');
			Object.assign(options, next);
			// Changing a material coefficient does work on it. Preserve shape,
			// uniformly attenuating only if the new all-time envelope needs a cap.
			for (let c = 0; c < states.length; c++) {
				const state = states[c], response = responses[c], envelope = contourEnvelope(state, options.speed, options.damping * response.dampingScale);
				if (envelope > response.amplitudeLimit) for (let i = 0; i < state.modes.length; i++) state.modes[i] *= response.amplitudeLimit / envelope;
			}
		},
		resize(w, h) {
			if (disposed) return;
			if (![w, h].every(Number.isInteger) || w < 1 || h < 1 || w > device.limits.maxTextureDimension2D || h > device.limits.maxTextureDimension2D || w * h > 16_777_216) throw new RangeError('Native contour output exceeds the presentation budget; no downsampling was used.');
			width = w; height = h; const aspect = w / h / (2.3 / 1.35); data[0] = 2.3 * Math.max(1, aspect); data[1] = 1.35 * Math.max(1, 1 / aspect);
		},
		reset() { if (!disposed) { for (const state of states) state.modes.fill(0); for (const p of lastPulses) p.active = 0; previous = undefined; impulses = limited = 0; } },
		endInput() { previous = undefined; },
		step(_encoder, dt, input) {
			if (disposed || !Number.isFinite(dt) || dt <= 0) return;
			for (let c = 0; c < states.length; c++) advanceContour(states[c], dt, options.speed, options.damping * responses[c].dampingScale);
			for (const p of lastPulses) p.age += dt;
			if (!input.active || ![input.x, input.y].every(Number.isFinite)) { previous = undefined; return; }
			const point = { x: (input.x - 0.5) * data[0], y: (input.y - 0.5) * data[1] };
			// One endpoint repeated across fixed substeps must not create more pulses.
			if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.045) return;
			for (const hit of contourStroke(previous ?? point, point)) pulse(hit.contour, hit.fraction, hit.amplitude);
			previous = point;
		},
		render(encoder, target) {
			if (disposed) return; if (!width || !height) throw new Error('Size contours before rendering.');
			for (let c = 0; c < states.length; c++) for (let i = 0; i < CONTOUR_SAMPLES; i++) {
				let value = 0; for (let n = 0; n < CONTOUR_MODES; n++) { const j = (i * CONTOUR_MODES + n) * 2; value += states[c].modes[n * 4] * basis[j] + states[c].modes[n * 4 + 1] * basis[j + 1]; }
				field[c * CONTOUR_SAMPLES + i] = value;
			}
			data[2] = width; data[3] = height; data[4] = options.speed; data[5] = options.damping; data[6] = Number(options.baseline);
			for (let c = 0; c < lastPulses.length; c++) data.set([lastPulses[c].fraction, lastPulses[c].age, lastPulses[c].active, options.damping * responses[c].dampingScale], 8 + c * 4);
			device.queue.writeBuffer(uniform, 0, data); device.queue.writeBuffer(storage, 0, field);
			const pass = encoder.beginRenderPass({ label: 'Native contour echoes', colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
			pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.draw(3); pass.end(); renders++;
		},
		async inspect(): Promise<LiquidSnapshot> {
			const energy = states.map((state) => contourEnergy(state, options.speed)), envelopes = states.map((state, c) => contourEnvelope(state, options.speed, options.damping * responses[c].dampingScale));
			let kinetic = 0; for (const state of states) for (let n = 0; n < CONTOUR_MODES; n++) kinetic += state.length / 4 * (state.modes[n * 4 + 2] ** 2 + state.modes[n * 4 + 3] ** 2);
			return { finite: [...energy, ...envelopes].every(Number.isFinite), mass: 0, initialMass: 0, min: -Math.max(...envelopes), max: Math.max(...envelopes), kinetic,
				details: { width, height, impulses, limited, renders, modes: CONTOUR_MODES, contours: states.length, samples: CONTOUR_SAMPLES, energy0: energy[0], energy1: energy[1], envelope0: envelopes[0], envelope1: envelopes[1], relativeEnvelope0: envelopes[0] / CONTOURS[0].hy, relativeEnvelope1: envelopes[1] / CONTOURS[1].hy, amplitudeLimit0: responses[0].amplitudeLimit, amplitudeLimit1: responses[1].amplitudeLimit, speed: options.speed, damping: options.damping, damping0: options.damping * responses[0].dampingScale, damping1: options.damping * responses[1].dampingScale, baseline: Number(options.baseline), stateBytes: field.byteLength + 64, cpuStateBytes: basis.byteLength + field.byteLength + data.byteLength + states.reduce((sum, state) => sum + state.modes.byteLength, 0), resolvedCanvasBytes: width * height * 4 } };
		},
		dispose() { if (!disposed) { disposed = true; uniform.destroy(); storage.destroy(); } }
	};
}
