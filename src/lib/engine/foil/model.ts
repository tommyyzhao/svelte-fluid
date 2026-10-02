/*
 * One-mode bistable foil (ADR-0096). The ODE is copied verbatim from the R&D
 * snap foil (rd/webgpu-replacement, materials/snap-foil.ts) so the timing the
 * owner approved (cross ~75 ms, capture ~0.2 s) carries over unchanged. Pure:
 * no DOM, no GL. Illustrative buckling energy, not a calibrated shell model.
 */

export const FOIL_STIFFNESS = 42;
export const FOIL_SPAN = 1.94;
export const FOIL_RISE = 0.44;
/** Authored response rate for the committed UI variant, not calibrated metal. */
export const COMMITTED_FOIL_TIME_SCALE = 8;

export interface FoilState {
	amplitude: number;
	velocity: number;
}

export function foilEnergy(amplitude: number, load = 0): number {
	return (FOIL_STIFFNESS * (amplitude * amplitude - 1) ** 2) / 4 - load * amplitude;
}

/**
 * A finite UI actuator crosses the material's energy barrier; it is removed
 * once captured in the requested well. Hover is a small load, far below the
 * static saddle. Retargeting never resets position or velocity. Returns
 * whether the actuator is still engaged.
 */
export function advanceCommittedFoil(state: FoilState, dt: number, target: -1 | 1, actuated: boolean, hover = 0): boolean {
	if (!Number.isFinite(dt) || dt <= 0) return actuated;
	// Time scaled uniformly (inertia 1/s², damping 14/s, unchanged force and
	// potential): same wells and damping ratio, but crosses in ~75 ms and
	// captures in ~200 ms. Velocity stays in real seconds, so retargeting
	// preserves momentum continuously.
	const speed = COMMITTED_FOIL_TIME_SCALE;
	const steps = Math.ceil(Math.min(dt, 0.1) * 240 * speed);
	const h = Math.min(dt, 0.1) / steps;
	const decay = Math.exp(-14 * speed * h);
	for (let i = 0; i < steps; i++) {
		const q = state.amplitude;
		const force = actuated ? Math.max(-40, Math.min(40, 80 * (target - q))) : Math.max(-6, Math.min(6, Number.isFinite(hover) ? hover : 0));
		state.velocity = (state.velocity + h * speed * speed * (force - FOIL_STIFFNESS * q * (q * q - 1))) * decay;
		state.amplitude += h * state.velocity;
	}
	if (actuated && Math.abs(state.amplitude - target) < 0.002 && Math.abs(state.velocity) < 0.015 * speed) {
		state.amplitude = target;
		state.velocity = 0;
		return false;
	}
	return actuated;
}

/** Well for a switch state: on bows down (-1), off arches up (+1), as in R&D. */
export function foilTarget(checked: boolean): -1 | 1 {
	return checked ? -1 : 1;
}

/** Hover load from the pointer's canvas-relative y (0 top … 1 bottom); 0 without hover. */
export function hoverLoad(hover: { x: number; y: number } | null): number {
	return hover ? 12 * (hover.y - 0.5) : 0;
}

/** At rest: actuator released, velocity and net force (hover vs. spring) negligible. */
export function foilSettled(state: FoilState, actuated: boolean, load: number): boolean {
	const q = state.amplitude;
	return !actuated && Math.abs(state.velocity) < 0.002 && Math.abs(load - FOIL_STIFFNESS * q * (q * q - 1)) < 0.03;
}
