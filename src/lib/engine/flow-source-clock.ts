import type { FlowDyeCycle, FlowPulse, FlowSource, RGB } from './types.js';

/** Velocity gain of a pulsed source at solver time `t` (seconds). Peak is always 1. */
export function flowPulseGain(p: FlowPulse, t: number): number {
	const c = Math.max(0, Math.cos((2 * Math.PI * t) / p.period)) ** (p.sharpness ?? 12);
	const f = p.floor ?? 0;
	return f + (1 - f) * c;
}

/** Dye colour of a cycled source at solver time `t` (seconds); wraps and interpolates linearly. */
export function flowDyeAt(c: FlowDyeCycle, t: number): RGB {
	const n = c.colors.length;
	const phase = ((((t % c.period) + c.period) % c.period) * n) / c.period;
	const i = Math.floor(phase) % n;
	const from = c.colors[i];
	const to = c.colors[(i + 1) % n];
	const mix = phase - Math.floor(phase);
	return {
		r: from.r + (to.r - from.r) * mix,
		g: from.g + (to.g - from.g) * mix,
		b: from.b + (to.b - from.b) * mix
	};
}

/** Throws RangeError for a malformed `pulse` / `dyeCycle`. Called from resolveConfig, before any GPU work. */
export function validateFlowSourceClock(source: FlowSource): void {
	const p = source.pulse;
	if (p) {
		if (!Number.isFinite(p.period) || p.period <= 0) throw new RangeError('svelte-fluid: pulse.period must be finite and positive');
		if (p.floor !== undefined && !(p.floor >= 0 && p.floor <= 1)) throw new RangeError('svelte-fluid: pulse.floor must be in [0, 1]');
		if (p.sharpness !== undefined && !(Number.isFinite(p.sharpness) && p.sharpness >= 1)) throw new RangeError('svelte-fluid: pulse.sharpness must be finite and at least 1');
	}
	const d = source.dyeCycle;
	if (d) {
		if (!Number.isFinite(d.period) || d.period <= 0) throw new RangeError('svelte-fluid: dyeCycle.period must be finite and positive');
		if (!Array.isArray(d.colors) || d.colors.length < 2 || !d.colors.every((c) => c && [c.r, c.g, c.b].every((v) => Number.isFinite(v) && v >= 0))) {
			throw new RangeError('svelte-fluid: dyeCycle.colors needs at least two finite non-negative RGB entries');
		}
	}
}
