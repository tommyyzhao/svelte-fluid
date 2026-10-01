/** An authored one-hole geometric reduction, NOT the coupled thin-film PDE in
 * https://arxiv.org/html/2609.01444v1. A thick precursor alone does not reproduce
 * that paper's contact-line dynamics; this model makes no such equivalence claim.
 * Hole volume is placed into a compact positive rim. A scalar energy decreases
 * under unforced evolution; the energy law and time scale are illustrative. */
export const DEWETTING_WIDTH = 1.8;
export const FILM_HEIGHT = 0.014;
export const RESIDUAL_HEIGHT = 0.00035;
export const INNER_FRACTION = 0.82;
export const SHAPE_NORMALIZER = Math.sqrt(1 + (0.09 ** 2 + 0.04 ** 2) / 2);
export const SHAPE_MAXIMUM = 1.13 / SHAPE_NORMALIZER;
export const REMOVAL_INTEGRAL = 0.15 + 0.2 * INNER_FRACTION + 0.15 * INNER_FRACTION ** 2;

export interface DewettingState {
	x: number; y: number; radius: number; limit: number; phase: number;
	spreading: number; viscosity: number; dissipated: number; work: number;
	elapsed: number; steps: number; nucleations: number; moving: boolean;
}
export function dewettingState(): DewettingState {
	return { x: 0.9, y: 0.5, radius: 0, limit: 0.37, phase: 0,
		spreading: 0.68, viscosity: 1.4, dissipated: 0, work: 0, elapsed: 0, steps: 0, nucleations: 0, moving: false };
}
export function dewettingEnergy(state: DewettingState, radius = state.radius): number {
	const line = 0.018 * state.limit;
	return 2 * Math.PI * (line * radius - state.spreading * radius ** 2 / 2 + 0.9 * radius ** 4 / (4 * state.limit ** 2));
}
export function dewettingGradient(state: DewettingState, radius = state.radius): number {
	return 2 * Math.PI * (0.018 * state.limit - state.spreading * radius + 0.9 * radius ** 3 / state.limit ** 2);
}
export function equilibriumRadius(state: DewettingState): number {
	let low = state.limit * 0.1, high = state.limit;
	for (let i = 0; i < 48; i++) {
		const middle = (low + high) / 2;
		if (dewettingGradient(state, middle) < 0) low = middle; else high = middle;
	}
	return (low + high) / 2;
}
export function seedDewetting(state: DewettingState, x: number, y: number): void {
	if (![x, y].every(Number.isFinite)) throw new RangeError('A nucleation point must be finite.');
	state.x = Math.max(0.18, Math.min(DEWETTING_WIDTH - 0.18, x * DEWETTING_WIDTH));
	state.y = Math.max(0.18, Math.min(0.82, y));
	state.limit = Math.min(0.37, (Math.min(state.x, DEWETTING_WIDTH - state.x, state.y, 1 - state.y) - 0.07) / SHAPE_MAXIMUM);
	state.phase = state.x * 7.3 + state.y * 5.1;
	state.radius = state.limit * 0.08;
	state.dissipated = state.elapsed = state.steps = 0;
	state.work = dewettingEnergy(state); state.moving = true; state.nucleations++;
}
export function setDewettingSpreading(state: DewettingState, value: number): void {
	if (!Number.isFinite(value) || value < 0.3 || value > 0.85) throw new RangeError('Spreading drive must be in [0.3, 0.85].');
	const before = dewettingEnergy(state); state.spreading = value;
	state.work += dewettingEnergy(state) - before; state.moving = state.radius > 0;
}
export function finishDewetting(state: DewettingState): void {
	if (!state.radius) return;
	const before = dewettingEnergy(state), radius = equilibriumRadius(state);
	state.radius = radius; state.dissipated += before - dewettingEnergy(state); state.moving = false;
}
export function advanceDewetting(state: DewettingState, dt: number): void {
	if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) throw new RangeError('Dewetting step must be in (0, 0.1].');
	if (!state.moving) return;
	const count = Math.ceil(dt * 120), h = dt / count;
	for (let step = 0; step < count; step++) {
		const before = dewettingEnergy(state), gradient = dewettingGradient(state);
		if (Math.abs(gradient) < 1e-5) { finishDewetting(state); break; }
		const speed = -1.5 / state.viscosity * gradient / (2 * Math.PI * Math.max(state.radius, state.limit * 0.025));
		let scale = 1, next = state.radius;
		for (let attempt = 0; attempt < 24; attempt++) {
			const candidate = Math.max(0, Math.min(state.limit, state.radius + speed * h * scale));
			if (dewettingEnergy(state, candidate) <= before) { next = candidate; break; }
			scale *= 0.5;
		}
		state.radius = next; state.dissipated += before - dewettingEnergy(state);
		state.elapsed += h; state.steps++;
	}
}
export function dewettingShape(angle: number, phase: number): { value: number; derivative: number } {
	return { value: (1 + 0.09 * Math.cos(3 * angle + phase) + 0.04 * Math.sin(5 * angle - phase)) / SHAPE_NORMALIZER,
		derivative: (-0.27 * Math.sin(3 * angle + phase) + 0.2 * Math.cos(5 * angle - phase)) / SHAPE_NORMALIZER };
}
export function dewettingProfile(state: DewettingState) {
	const width = 0.025 + 0.045 * Math.sqrt(state.radius / state.limit);
	// Mean shape² is exactly one; mean shape is 1 / SHAPE_NORMALIZER.
	const removed = 2 * Math.PI * (FILM_HEIGHT - RESIDUAL_HEIGHT) * REMOVAL_INTEGRAL * state.radius ** 2;
	const rimIntegral = 16 * Math.PI / 15 * width * (state.radius / SHAPE_NORMALIZER + width / 2);
	return { width, removed, amplitude: removed / rimIntegral, rimIntegral };
}
export function dewettingHeight(state: DewettingState, x: number, y: number): number {
	if (!state.radius) return FILM_HEIGHT;
	const dx = x - state.x, dy = y - state.y, distance = Math.hypot(dx, dy);
	const boundary = state.radius * dewettingShape(Math.atan2(dy, dx), state.phase).value;
	const { width, amplitude } = dewettingProfile(state);
	if (distance < boundary) {
		const t = Math.max(0, Math.min(1, (distance / boundary - INNER_FRACTION) / (1 - INNER_FRACTION)));
		return RESIDUAL_HEIGHT + (FILM_HEIGHT - RESIDUAL_HEIGHT) * t * t * (3 - 2 * t);
	}
	const t = (distance - boundary) / width;
	return FILM_HEIGHT + (t < 1 ? amplitude * 16 * t * t * (1 - t) ** 2 : 0);
}
