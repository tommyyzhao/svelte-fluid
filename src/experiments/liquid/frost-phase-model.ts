/** Fixed-substrate phase change, NOT the 2025 moving-soap-film paper's solver.
 * Recent motivation: Liu et al., TOG 44(4), 2025, DOI 10.1145/3731170.
 * https://s2025.conference-schedule.org/presentation/?id=papers_577&sess=sess136
 * Classical two-field law: Kobayashi, Physica D 63, 1993,
 * https://doi.org/10.1016/0167-2789(93)90120-P .
 * Our simplification: isotropic gradient energy and positive sixfold KINETIC
 * mobility plus bounded warm local melting (which removes the double-well's
 * artificial perfectly-solid superheating lock). No orientation field, anisotropic surface-energy derivative,
 * Marangoni transport, calibrated ice units, or fabricated branch overlay.
 */
export const FROST_SIZE = 192;
export const FROST_EPSILON = 0.009;
export const FROST_TAU = 0.009;
export const FROST_DIFFUSIVITY = 0.018;
export const FROST_LATENT = 0.85;
export const FROST_ANISOTROPY = 0.48;
export const FROST_TIME_SCALE = 0.18;
export const FROST_BATH_RATE = 4;
export const FROST_BRUSH_RATE = 18;
export const FROST_MELT_RATE = 12;
export const FROST_COLD = -0.65;
export const FROST_WARM = 0.65;
export interface FrostOptions { bath: number; latent: number; anisotropy: number; bathRate: number }
export const frostOptions = (): FrostOptions => ({ bath: FROST_COLD, latent: FROST_LATENT,
	anisotropy: FROST_ANISOTROPY, bathRate: FROST_BATH_RATE });
export interface FrostBrush { x: number; y: number; active: boolean; temperature: number }
export const noFrostBrush = (): FrostBrush => ({ x: 0.5, y: 0.5, active: false, temperature: 1.1 });
export interface FrostCpuState { size: number; cells: Float64Array; scratch: Float64Array }

export function validateFrostOptions(options: FrostOptions) {
	if (!Object.values(options).every(Number.isFinite) || Math.abs(options.bath) > 1.2 ||
		options.latent < 0 || options.latent > 1 || options.anisotropy < 0 || options.anisotropy > 0.48 ||
		options.bathRate < 0 || options.bathRate > 4) throw new Error('Frost parameters exceed the bounded illustrative regime.');
}

/** Bound explicit coefficients, not phase values after the fact. For p∈[0,1],
 * |m(T)|<.45, so the reaction's loss/gain is at most .95 p / .95(1-p).
 * h [Mmax/τ (4 ε²/dx² + .95) + meltRate] <= .8 preserves [0,1].
 * Thermal diffusion + bath + brush has the separate positive-weight bound.
 */
export function frostMaxStep(size: number): number {
	if (!Number.isInteger(size) || size < 32 || size > 384) throw new Error('Frost model grid must be an integer from 32 to 384.');
	const phase = (1 + FROST_ANISOTROPY) / FROST_TAU * (4 * FROST_EPSILON ** 2 * size ** 2 + 0.95) + FROST_MELT_RATE;
	const thermal = 4 * FROST_DIFFUSIVITY * size ** 2 + 4 + FROST_BRUSH_RATE;
	return 0.8 / Math.max(phase, thermal);
}
export function frostSubsteps(dt: number, size = FROST_SIZE): number {
	if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) throw new Error('Frost frame dt must lie in (0, .1].');
	return Math.max(1, Math.ceil(dt * FROST_TIME_SCALE / frostMaxStep(size)));
}

/** cos(6θ), evaluated from the interface normal without an atan2 singularity. */
export function frostMobility(gx: number, gy: number, anisotropy: number): number {
	const length = gx * gx + gy * gy;
	if (length < 1e-20) return 1;
	const x = gx * gx / length, y = gy * gy / length;
	return 1 + anisotropy * (x * x * x - 15 * x * x * y + 15 * x * y * y - y * y * y);
}
/** An explicit illustrative melting kinetic, not noise or phase clamping.
 * Pure double-well kinetics leaves p=1 exactly fixed even when superheated.
 * Warm liquid conversion must work inside an ice patch, not only at its rim.
 * The thermal equation pays its full L Δp cost, so melting consumes heat.
 */
export function frostMeltRate(temperature: number): number {
	const t = Math.max(0, Math.min(1, (temperature - 0.02) / 0.3));
	return FROST_MELT_RATE * t * t * (3 - 2 * t);
}
export function frostSeed(size: number, x = 0.5, y = 0.5): Float32Array<ArrayBuffer> {
	frostMaxStep(size);
	if (![x, y].every(Number.isFinite) || x < 0.08 || x > 0.92 || y < 0.08 || y > 0.92) throw new Error('Place a frost nucleus inside the plate.');
	const seed = new Float32Array(size * size);
	for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
		const distance = Math.hypot((col + 0.5) / size - x, (row + 0.5) / size - y);
		const t = Math.max(0, Math.min(1, (0.039 + FROST_EPSILON * 1.8 - distance) / (FROST_EPSILON * 3.6)));
		seed[row * size + col] = t * t * (3 - 2 * t);
	}
	return seed;
}
export function createFrostCpu(size: number, seeded = true, temperature = FROST_COLD): FrostCpuState {
	frostMaxStep(size);
	const cells = new Float64Array(size * size * 2), seed = seeded ? frostSeed(size) : undefined;
	for (let i = 0; i < size * size; i++) { cells[i * 2] = seed?.[i] ?? 0; cells[i * 2 + 1] = temperature; }
	return { size, cells, scratch: new Float64Array(cells.length) };
}

/** Explicitly add cold crystalline material. Only newly added phase mixes in
 * cold temperature; re-planting an already-solid area is not a cooling cheat.
 * This user edit changes enthalpy, unlike the closed evolution below.
 */
export function plantFrostCpu(state: FrostCpuState, x = 0.5, y = 0.5): void {
	plantFrostCoverageCpu(state, frostSeed(state.size, x, y));
}

export function validateFrostCoverage(seed: Float32Array, size = FROST_SIZE): void {
	frostMaxStep(size);
	if (seed.length !== size * size || seed.some(value => !Number.isFinite(value) || value < 0 || value > 1)) {
		throw new Error('Frost seed coverage must contain one finite [0,1] value per model cell.');
	}
}

/** Content planting uses precisely the same local cold-material edit as a
 * circular nucleus. It does not constrain subsequent evolution to the source. */
export function plantFrostCoverageCpu(state: FrostCpuState, seed: Float32Array): void {
	validateFrostCoverage(seed, state.size);
	for (let i = 0; i < seed.length; i++) {
		const old = state.cells[i * 2], phase = Math.max(old, seed[i]);
		state.cells[i * 2 + 1] += (phase - old) * (FROST_COLD - state.cells[i * 2 + 1]);
		state.cells[i * 2] = phase;
	}
}

/** A single model-time step. Heat source is L Δphase, not L phase. Thus the
 * integral of H=T-Lp changes only by explicit bath/brush exchange (sealed edges).
 * New nuclei are an explicit editing operation, outside this evolution law.
 */
export function advanceFrostCpu(state: FrostCpuState, h: number, options: FrostOptions,
	brush: FrostBrush = noFrostBrush()): void {
	validateFrostOptions(options);
	if (!Number.isFinite(h) || h <= 0 || h > frostMaxStep(state.size) * 1.000001) throw new Error('Frost step exceeds the positivity bound.');
	const n = state.size, n2 = n * n, source = state.cells, target = state.scratch;
	for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
		const i = (y * n + x) * 2, l = (y * n + Math.max(0, x - 1)) * 2,
			r = (y * n + Math.min(n - 1, x + 1)) * 2, d = (Math.max(0, y - 1) * n + x) * 2,
			u = (Math.min(n - 1, y + 1) * n + x) * 2;
		const p = source[i], t = source[i + 1];
		const m = 0.9 / Math.PI * Math.atan(-10 * t);
		const mobility = frostMobility(source[r] - source[l], source[u] - source[d], options.anisotropy);
		const change = h * (mobility / FROST_TAU * (FROST_EPSILON ** 2 * n2 * (source[l] + source[r] + source[d] + source[u] - 4 * p) + p * (1 - p) * (p - 0.5 + m)) - frostMeltRate(t) * p);
		const weight = brush.active ? Math.exp(-(((x + 0.5) / n - brush.x) ** 2 + ((y + 0.5) / n - brush.y) ** 2) / 0.008) : 0;
		target[i] = p + change;
		target[i + 1] = t + h * (FROST_DIFFUSIVITY * n2 * (source[l + 1] + source[r + 1] + source[d + 1] + source[u + 1] - 4 * t) + options.bathRate * (options.bath - t) + FROST_BRUSH_RATE * weight * (brush.temperature - t)) + options.latent * change;
	}
	state.cells = target; state.scratch = source;
}

export function frostTotals(cells: ArrayLike<number>, latent = FROST_LATENT) {
	let phase = 0, heat = 0, enthalpy = 0, min = Infinity, max = -Infinity, checksum = 0, finite = true;
	for (let i = 0; i < cells.length; i += 2) {
		const p = cells[i], t = cells[i + 1]; phase += p; heat += t; enthalpy += t - latent * p;
		min = Math.min(min, p); max = Math.max(max, p); finite &&= Number.isFinite(p) && Number.isFinite(t);
		checksum += (i + 1) * p + (i + 2) * t;
	}
	const count = cells.length / 2;
	return { phase: phase / count, heat: heat / count, enthalpy: enthalpy / count, min, max, checksum, finite };
}
