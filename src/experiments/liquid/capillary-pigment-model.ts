import type { LiquidInput } from './types.js';

/** Bounded pigment transport, not a capillary free-surface or molecular solver.
 * Upwind finite-volume flux/CFL: https://arxiv.org/html/1606.09156 §2.2.
 * Finite-site kinetics: https://doi.org/10.1016/j.seppur.2019.115832.
 * Equal, opposing face fluxes conserve each color. Mobile and attached states
 * exchange pigment, never create it; the three colors share site capacity.
 */
export const PIGMENT_WIDTH = 192;
export const PIGMENT_HEIGHT = 96;
export const PIGMENT_CAPACITY = 0.8;
export const PIGMENT_DIFFUSION = 1.1; // cell²/s; numerical upwind diffusion is additional.
export const PIGMENT_ADSORPTION = 0.07;
export const PIGMENT_DESORPTION = 0.003;
export const PIGMENT_DRAG = 0.9;
export const PIGMENT_BRUSH_RADIUS = 0.18; // In plate-height units, independent of DPR.
export const PIGMENT_LIFT = 0.75; // Illustrative mechanical release per swept brush radius.
export const PIGMENT_SHEET_ADSORPTION = 2.4;
export const PIGMENT_SHEET_CLEARING = 1.2;
export const PIGMENT_SHEET_DOSE = 2400;
export const PIGMENT_CLEAR_SECONDS = 6;
export type PigmentGeometry = 'type' | 'emblem';
export type PigmentView = 'combined' | 'mobile' | 'attached';
export const PIGMENT_EMBLEM = 'M200 100 C160 28 52 28 52 100 C52 172 160 172 200 100 C240 28 348 28 348 100 C348 172 240 172 200 100';

/** Conservative app-owned CPU+GPU preparation working-set estimate, not
 * driver-resident memory. Raster phase: CanvasRGBA4 + readRGBA4 + R8CPU1 +
 * reserved outputRGBA4. After releasing Canvas2D, upload phase is smaller.
 * Call only for a real candidate, never an already adopted same-size source. */
export function pigmentCoveragePeakBytes(width: number, height: number, fixedBytes: number, oldCoverageBytes = 0, readbackBytes = 0) {
	if (![width, height].every((n) => Number.isInteger(n) && n > 0) || ![fixedBytes, oldCoverageBytes, readbackBytes].every((n) => Number.isFinite(n) && n >= 0)) throw new Error('Invalid pigment preparation dimensions or resource sizes.');
	return fixedBytes + oldCoverageBytes + width * height * 13 + readbackBytes;
}

export function rasterPigmentGeometry(width: number, height: number, kind: PigmentGeometry): Uint8Array<ArrayBuffer> {
	const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
	try {
	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) throw new Error('Cannot rasterize the pigment boundary.');
	context.scale(width / 400, height / 200); context.fillStyle = '#fff'; context.strokeStyle = '#fff';
	if (kind === 'type') {
		context.font = 'bold 146px Georgia'; context.textAlign = 'center'; context.textBaseline = 'alphabetic';
		context.fillText('INK', 200, 153, 364);
	} else {
		context.lineWidth = 37; context.lineJoin = 'round'; context.lineCap = 'round'; context.stroke(new Path2D(PIGMENT_EMBLEM));
	}
	const rgba = context.getImageData(0, 0, width, height).data;
	const coverage = new Uint8Array(width * height);
	for (let i = 0; i < coverage.length; i++) coverage[i] = rgba[i * 4 + 3];
	return coverage;
	} finally { canvas.width = canvas.height = 0; }
}

/** One outgoing face per axis: brush strength is nonnegative, so each velocity
 * component has one sign throughout the domain. No unrelated ambient swirl.
 * With LabSession's |v|≤3 and dt=1/120 this requires at most nine dispatches.
 */
export function pigmentSubsteps(dt: number, vx = 0, vy = 0): number {
	if (![dt, vx, vy].every(Number.isFinite) || dt <= 0 || dt > 0.1) throw new Error('Pigment step must be finite and in (0, 0.1].');
	const rate = PIGMENT_DRAG * (Math.min(3, Math.abs(vx)) * PIGMENT_WIDTH + Math.min(3, Math.abs(vy)) * PIGMENT_HEIGHT);
	return Math.max(1, Math.ceil(dt * (rate + 4 * PIGMENT_DIFFUSION) / 0.8));
}

/** Normalized pointer velocity must become cells/s, not an arbitrary gain in
 * cell units. Mechanical lifting only exchanges attached and mobile pigment.
 */
export function pigmentBrushAt(x: number, y: number, input: LiquidInput) {
	const vx = input.active ? Math.max(-3, Math.min(3, input.vx)) : 0;
	const vy = input.active ? Math.max(-3, Math.min(3, input.vy)) : 0;
	const dx = (x - input.x) * PIGMENT_WIDTH / PIGMENT_HEIGHT, dy = y - input.y;
	const influence = Math.exp(-(dx * dx + dy * dy) / (2 * PIGMENT_BRUSH_RADIUS ** 2));
	return {
		vx: vx * PIGMENT_WIDTH * PIGMENT_DRAG * influence,
		vy: vy * PIGMENT_HEIGHT * PIGMENT_DRAG * influence,
		lift: Math.hypot(vx * PIGMENT_WIDTH / PIGMENT_HEIGHT, vy) * PIGMENT_LIFT / PIGMENT_BRUSH_RADIUS * influence
	};
}

/** An illustrative vacancy-limited split reaction, not an exact Langmuir solve. */
export function attachPigment(mobile: readonly number[], attached: readonly number[], dt: number,
	capacity = PIGMENT_CAPACITY, adsorption = PIGMENT_ADSORPTION, desorption = PIGMENT_DESORPTION) {
	if (![...mobile, ...attached, dt, capacity, adsorption, desorption].every(Number.isFinite) ||
		mobile.length !== 3 || attached.length !== 3 || [...mobile, ...attached, dt, capacity, adsorption, desorption].some((v) => v < 0) ||
		attached.reduce((a, b) => a + b, 0) > capacity + 1e-6) throw new Error('Invalid pigment reaction state.');
	const released = attached.map((v) => v * (1 - Math.exp(-desorption * dt)));
	const m = mobile.map((v, c) => v + released[c]);
	const b = attached.map((v, c) => v - released[c]);
	const amount = m.reduce((a, value) => a + value, 0), occupied = b.reduce((a, value) => a + value, 0);
	const vacancy = Math.max(0, capacity - occupied);
	const transfer = Math.min(amount, vacancy, amount * (1 - Math.exp(-adsorption * vacancy / Math.max(capacity, 1e-9) * dt)));
	const fraction = amount > 0 ? transfer / amount : 0;
	return { mobile: m.map((v) => v * (1 - fraction)), attached: b.map((v, c) => v + m[c] * fraction) };
}

/** A traversable sheet has no internal walls. Glyph coverage supplies finite
 * attachment sites; clearing transfers off-glyph mobile pigment to an explicit
 * removed reservoir. This is an illustrative wash, not pigment evaporation. */
export function reactPigmentSheet(mobile: readonly number[], attached: readonly number[], coverage: number, dt: number, lift = 0) {
	if (!Number.isFinite(coverage) || coverage < 0 || coverage > 1 || !Number.isFinite(lift) || lift < 0) throw new Error('Invalid adhesive sheet coverage or lift.');
	const reaction = attachPigment(mobile, attached, dt, PIGMENT_CAPACITY * coverage, PIGMENT_SHEET_ADSORPTION, PIGMENT_DESORPTION + lift);
	const fraction = 1 - Math.exp(-PIGMENT_SHEET_CLEARING * (1 - coverage) * dt);
	const removed = reaction.mobile.map((v) => v * fraction);
	return { mobile: reaction.mobile.map((v, c) => v - removed[c]), attached: reaction.attached, removed };
}

export function pigmentSheetPulse(color: number): Float32Array<ArrayBuffer> {
	if (![0, 1, 2].includes(color)) throw new Error('Invalid sheet pigment.');
	const weights = new Float32Array(PIGMENT_WIDTH * PIGMENT_HEIGHT); let sum = 0;
	for (let y = 0; y < PIGMENT_HEIGHT; y++) for (let x = 0; x < PIGMENT_WIDTH; x++) {
		const u = (x + 0.5) / PIGMENT_WIDTH, v = (y + 0.5) / PIGMENT_HEIGHT;
		const center = 0.49 + 0.035 * Math.sin(u * 7 + color * 2);
		const weight = Math.exp(-(((u - [0.48, 0.59, 0.37][color]) / 0.47) ** 2) - ((v - center) / 0.33) ** 2);
		weights[y * PIGMENT_WIDTH + x] = weight; sum += weight;
	}
	const dose = new Float32Array(weights.length * 4);
	for (let i = 0; i < weights.length; i++) dose[i * 4 + color] = weights[i] / sum * PIGMENT_SHEET_DOSE;
	return dose;
}

/** Reference conservative Cartesian step. Face speeds are cells/second. */
export function transportPigment(input: Float32Array, mask: Uint32Array, width: number, height: number,
	dt: number, velocity: (x: number, y: number, horizontal: boolean) => number,
	diffusion = PIGMENT_DIFFUSION): Float32Array<ArrayBuffer> {
	if (input.length !== width * height * 8 || mask.length !== width * height || dt <= 0 || !Number.isFinite(dt) || diffusion < 0) throw new Error('Invalid pigment transport.');
	const result = input.slice();
	const outflow = new Float64Array(mask.length);
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
		const a = y * width + x;
		if (!mask[a]) continue;
		for (let axis = 0; axis < 2; axis++) {
			if ((axis === 0 && x + 1 === width) || (axis === 1 && y + 1 === height)) continue;
			const b = a + (axis === 0 ? 1 : width);
			if (!mask[b]) continue;
			const speed = velocity(x + (axis === 0 ? 0.5 : 0), y + (axis === 1 ? 0.5 : 0), axis === 0);
			if (!Number.isFinite(speed)) throw new Error('Non-finite pigment velocity.');
			outflow[a] += dt * (Math.max(speed, 0) + diffusion); outflow[b] += dt * (Math.max(-speed, 0) + diffusion);
			for (let c = 0; c < 3; c++) {
				const av = input[a * 8 + c], bv = input[b * 8 + c];
				const flux = dt * (Math.max(speed, 0) * av + Math.min(speed, 0) * bv + diffusion * (av - bv));
				result[a * 8 + c] -= flux; result[b * 8 + c] += flux;
			}
		}
	}
	if (outflow.some((value) => value > 1 + 1e-6)) throw new Error('Pigment transport exceeded the positivity CFL limit.');
	return result;
}

export function pigmentTotals(state: Float32Array) {
	const mobile = [0, 0, 0], attached = [0, 0, 0]; let min = Infinity, max = 0, capacity = 0, checksum = 0;
	for (let i = 0; i < state.length; i += 8) {
		let occupied = 0;
		for (let c = 0; c < 3; c++) {
			const m = state[i + c], b = state[i + c + 4]; mobile[c] += m; attached[c] += b; occupied += b;
			min = Math.min(min, m, b); max = Math.max(max, m, b); checksum += (i + c + 1) * m + (i + c + 5) * b;
		}
		capacity = Math.max(capacity, occupied);
	}
	return { mobile, attached, min, max, capacity, checksum, mass: [...mobile, ...attached].reduce((a, value) => a + value, 0) };
}

/** A finite authored pulse, normalized over open cells; no persistent emitter. */
export function pigmentPulse(mask: Uint32Array, color: number, geometry: PigmentGeometry): Float32Array<ArrayBuffer> {
	if (![0, 1, 2].includes(color) || mask.length !== PIGMENT_WIDTH * PIGMENT_HEIGHT) throw new Error('Invalid pigment pulse.');
	const weights = new Float32Array(mask.length); let sum = 0;
	for (let y = 0; y < PIGMENT_HEIGHT; y++) for (let x = 0; x < PIGMENT_WIDTH; x++) {
		const index = y * PIGMENT_WIDTH + x; if (!mask[index]) continue;
		const u = (x + 0.5) / PIGMENT_WIDTH, v = (y + 0.5) / PIGMENT_HEIGHT;
		const center = geometry === 'type' ? 0.50 + 0.14 * Math.sin(u * 11 + color * 2) : 0.5;
		// Start at the reachable central junction, not an isolated left edge.
		const horizontal = geometry === 'type' ? 0 : ((u - [0.5, 0.30, 0.70][color]) / 0.085) ** 2;
		weights[index] = Math.exp(-horizontal - ((v - center) / 0.060) ** 2); sum += weights[index];
	}
	if (sum === 0) throw new Error('Pigment pulse has no open reservoir.');
	const result = new Float32Array(mask.length * 4);
	for (let i = 0; i < mask.length; i++) result[i * 4 + color] = weights[i] / sum * 420;
	return result;
}
