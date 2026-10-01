/** Fixed-porosity illustration inspired by Li et al. (SIGGRAPH Asia 2025),
 * §4.1 Eq13 (wet-dependent stiffness) and Eq14 (wetting dilation), not their
 * particle, dynamic-porosity, or saturation-aware DFSPH solver.
 * https://webspace.science.uu.nl/~telea001/uploads/Bibtex/li25_multiphase.pdf
 */
export const WICK_WIDTH = 128;
export const WICK_HEIGHT = 80;
export const WICK_DIFFUSION = 24; // model cells² / illustrative second
export const WICK_ABSORPTION = 2.4;
export const WICK_DROP = 360; // one pore-cell capacity is one volume unit
export const WICK_PIPETTE = WICK_DROP * 3;
export const WICK_SWELL = 0.064; // plate-height units
export const WICK_DRY_COMPLIANCE = 0.006;
export const WICK_WET_COMPLIANCE = 0.067;

export function wickSubsteps(dt: number): number {
	// Both interactive steps and finite native-control advances derive their
	// integration bound here; no second assumed frame rate owns stability.
	if (!Number.isFinite(dt) || dt <= 0 || dt > 8) throw new Error('Wicking duration must be finite and in (0, 8].');
	return Math.max(1, Math.ceil(dt * (4 * WICK_DIFFUSION / 0.8)));
}

/** Compact, normalized finite dose. It enters surface water, not saturation. */
export function wickDose(x: number, y: number, volume = WICK_DROP): Float32Array<ArrayBuffer> {
	if (![x, y, volume].every(Number.isFinite) || x < 0 || x > 1 || y < 0 || y > 1 || volume < 0 || volume > WICK_PIPETTE) throw new Error('Invalid finite water dose.');
	const dose = new Float32Array(WICK_WIDTH * WICK_HEIGHT); let sum = 0;
	for (let row = 0; row < WICK_HEIGHT; row++) for (let col = 0; col < WICK_WIDTH; col++) {
		const radius = Math.hypot(((col + 0.5) / WICK_WIDTH - x) * 1.6, (row + 0.5) / WICK_HEIGHT - y) / 0.14;
		const weight = Math.max(0, 1 - radius * radius) ** 3;
		dose[row * WICK_WIDTH + col] = weight; sum += weight;
	}
	for (let i = 0; i < dose.length; i++) dose[i] = dose[i] / sum * volume;
	return dose;
}

/** Convex no-flux diffusion followed by equal/opposite local exchange.
 * 4Ddt<=.8 makes saturation a convex combination in [0,1]. Exchange is
 * bounded by both remaining surface water and unoccupied pore capacity.
 */
export function wickReference(input: Float32Array, dt: number, width = WICK_WIDTH, height = WICK_HEIGHT): Float32Array<ArrayBuffer> {
	if (input.length !== width * height * 2 || width < 1 || height < 1) throw new Error('Invalid porous state dimensions.');
	if (dt > 0.1) throw new Error('A normal wicking step cannot exceed 0.1 seconds.');
	const count = wickSubsteps(dt), step = dt / count;
	let state = input.slice();
	for (let iteration = 0; iteration < count; iteration++) {
		const next = new Float32Array(state.length);
		for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
			const i = y * width + x, s = state[i * 2]; let laplacian = 0;
			if (x) laplacian += state[(i - 1) * 2] - s;
			if (x + 1 < width) laplacian += state[(i + 1) * 2] - s;
			if (y) laplacian += state[(i - width) * 2] - s;
			if (y + 1 < height) laplacian += state[(i + width) * 2] - s;
			const diffused = s + WICK_DIFFUSION * step * laplacian;
			const surface = state[i * 2 + 1];
			const transfer = Math.min(surface, Math.max(0, 1 - diffused), surface * (1 - Math.exp(-WICK_ABSORPTION * step)));
			next[i * 2] = diffused + transfer; next[i * 2 + 1] = surface - transfer;
		}
		state = next;
	}
	return state;
}

export function wickMaterial(saturation: number, pressure = 0) {
	const s = Math.max(0, Math.min(1, saturation));
	const compliance = WICK_DRY_COMPLIANCE + (WICK_WET_COMPLIANCE - WICK_DRY_COMPLIANCE) * s;
	return { compliance, rise: WICK_SWELL * s, height: WICK_SWELL * s - Math.max(0, Math.min(1, pressure)) * compliance };
}

export function wickTotals(state: Float32Array, width = WICK_WIDTH) {
	let absorbed = 0, surface = 0, min = Infinity, max = -Infinity, checksum = 0, radius2 = 0, wetCells = 0;
	let mx = 0, my = 0;
	for (let i = 0; i < state.length / 2; i++) {
		const s = state[i * 2], r = state[i * 2 + 1]; absorbed += s; surface += r;
		min = Math.min(min, s, r); max = Math.max(max, s); checksum += s * (i * 2 + 1) + r * (i * 2 + 2);
		mx += s * (i % width); my += s * Math.floor(i / width); if (s > 0.02) wetCells++;
	}
	if (absorbed > 0) for (let i = 0; i < state.length / 2; i++) radius2 += state[i * 2] * ((i % width - mx / absorbed) ** 2 + (Math.floor(i / width) - my / absorbed) ** 2) / absorbed;
	return { absorbed, surface, mass: absorbed + surface, min, max, checksum, radius2, wetCells };
}
