import { describe, expect, it } from 'vitest';
import { advanceMeniscus, createMeniscusState, meniscusArea, meniscusRadius, meniscusTarget, MENISCUS_BUDGET, MENISCUS_MODES, MENISCUS_RADIUS } from './magnetic-meniscus-model.js';

describe('field-attracted constant-area meniscus', () => {
	it('reaches toward a nearby external field before contact, not a distant one', () => {
		const near = meniscusTarget(0.4, 0), far = meniscusTarget(1.4, 0);
		expect(meniscusRadius(near, 0)).toBeGreaterThan(MENISCUS_RADIUS + 0.055);
		expect(meniscusRadius(near, Math.PI)).toBeLessThan(meniscusRadius(near, 0) - 0.06);
		expect(Math.abs(meniscusRadius(far, 0) - MENISCUS_RADIUS)).toBeLessThan(1e-9);
	});
	it('preserves actual polar area under rotating retargets with positive simple boundaries', () => {
		const state = createMeniscusState(); let min = Infinity, maxError = 0, maxBound = 0;
		for (let i = 0; i < 500; i++) {
			state.target.set(meniscusTarget(Math.cos(i * 0.13) * 0.37, Math.sin(i * 0.13) * 0.37, 1.5)); advanceMeniscus(state, 1 / 60);
			let integral = 0, bound = 0;
			for (let n = 0; n < MENISCUS_MODES; n++) bound += Math.hypot(state.modes[n * 2], state.modes[n * 2 + 1]);
			for (let j = 0; j < 128; j++) { const r = meniscusRadius(state.modes, j * Math.PI / 64); integral += r * r * Math.PI / 128; min = Math.min(min, r); }
			maxError = Math.max(maxError, Math.abs(integral - Math.PI * MENISCUS_RADIUS ** 2)); maxBound = Math.max(maxBound, bound);
			expect(meniscusArea(state.modes)).toBeCloseTo(Math.PI * MENISCUS_RADIUS ** 2, 12);
		}
		expect(maxError).toBeLessThan(1e-12); expect(min).toBeGreaterThan(0.15); expect(maxBound).toBeLessThanOrEqual(MENISCUS_BUDGET + 1e-12);
	});
	it('is timestep-subdivision invariant for held targets and returns without ringing', () => {
		const a = createMeniscusState(), b = createMeniscusState(); a.target.set(meniscusTarget(0.4, 0)); b.target.set(a.target);
		advanceMeniscus(a, 0.2); for (let i = 0; i < 24; i++) advanceMeniscus(b, 1 / 120);
		expect(Math.max(...a.modes.map((v, i) => Math.abs(v - b.modes[i])))).toBeLessThan(1e-14);
		a.target.fill(0); const previous = meniscusRadius(a.modes, 0); advanceMeniscus(a, 0.1);
		expect(meniscusRadius(a.modes, 0)).toBeLessThan(previous); advanceMeniscus(a, 2);
		expect(meniscusRadius(a.modes, 0)).toBeCloseTo(MENISCUS_RADIUS, 12);
	});
});
