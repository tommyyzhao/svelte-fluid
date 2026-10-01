/** A bounded, field-attracted radial boundary. Not a magnetostatic solver.
 * IoB inspiration: https://ferrofluid-simulation.github.io/ . This reduction
 * tests non-contact attraction and an exact area constraint, not induction.
 */
export const MENISCUS_MODES = 12;
export const MENISCUS_RADIUS = 0.3;
export const MENISCUS_BUDGET = 0.42;
export interface MeniscusState { modes: Float64Array; target: Float64Array }
export const createMeniscusState = (): MeniscusState => ({ modes: new Float64Array(MENISCUS_MODES * 2), target: new Float64Array(MENISCUS_MODES * 2) });

export function meniscusTarget(x: number, y: number, strength = 1): Float64Array {
	const target = new Float64Array(MENISCUS_MODES * 2);
	if (![x, y, strength].every(Number.isFinite)) return target;
	const samples = 96, gain = Math.min(1.5, Math.max(0, strength));
	for (let i = 0; i < samples; i++) {
		const a = 2 * Math.PI * i / samples, nx = Math.cos(a), ny = Math.sin(a);
		const dx = x - MENISCUS_RADIUS * nx, dy = y - MENISCUS_RADIUS * ny;
		// Compact regularized attraction at the edge, not a force at the centre.
		const distance2 = dx * dx + dy * dy;
		const outward = Math.max(0, (dx * nx + dy * ny + 0.025) / Math.sqrt(distance2 + 0.0025));
		const load = 0.72 * gain * outward * Math.exp(-distance2 / 0.035);
		for (let n = 1; n <= MENISCUS_MODES; n++) {
			const attenuation = 1 / (1 + 0.035 * n * n); // authored surface-smoothing response
			target[(n - 1) * 2] += 2 / samples * load * Math.cos(n * a) * attenuation;
			target[(n - 1) * 2 + 1] += 2 / samples * load * Math.sin(n * a) * attenuation;
		}
	}
	let bound = 0; for (let n = 0; n < MENISCUS_MODES; n++) bound += Math.hypot(target[n * 2], target[n * 2 + 1]);
	const scale = Math.min(1, MENISCUS_BUDGET / Math.max(bound, 1e-30));
	for (let n = 0; n < target.length; n++) target[n] *= scale;
	return target;
}

export function advanceMeniscus(state: MeniscusState, dt: number): void {
	if (!Number.isFinite(dt) || dt <= 0) return;
	// Exact first-order relaxation: no overshoot, convex budget under retargeting.
	const weight = -Math.expm1(-18 * dt);
	for (let i = 0; i < state.modes.length; i++) state.modes[i] += (state.target[i] - state.modes[i]) * weight;
}

export function meniscusScale(modes: ArrayLike<number>): number {
	let square = 0; for (let i = 0; i < MENISCUS_MODES * 2; i++) square += modes[i] ** 2;
	return MENISCUS_RADIUS / Math.sqrt(1 + square / 2);
}

export function meniscusRadius(modes: ArrayLike<number>, angle: number): number {
	let value = 1;
	for (let n = 1; n <= MENISCUS_MODES; n++) value += modes[(n - 1) * 2] * Math.cos(n * angle) + modes[(n - 1) * 2 + 1] * Math.sin(n * angle);
	return value * meniscusScale(modes);
}

export function meniscusArea(modes: ArrayLike<number>): number {
	let square = 0; for (let i = 0; i < MENISCUS_MODES * 2; i++) square += modes[i] ** 2;
	return Math.PI * meniscusScale(modes) ** 2 * (1 + square / 2);
}
