import { describe, expect, it } from 'vitest';
import { advanceFoil, foilEnergy, foilRestLength, FOIL_SNAP_LOAD, FOIL_SPAN, type FoilState } from './snap-foil.js';

function settle(state: FoilState, load: number, seconds = 8) {
	for (let i = 0; i < seconds * 240; i++) advanceFoil(state, 1 / 240, load);
}
describe('one-mode snap-through foil', () => {
	it('has two zero-load stable wells and excess rest length', () => {
		expect(foilEnergy(-1)).toBe(foilEnergy(1)); expect(foilEnergy(0)).toBeGreaterThan(foilEnergy(1));
		expect(foilRestLength()).toBeGreaterThan(FOIL_SPAN * 1.1);
		for (const sign of [-1, 1]) {
			const state = { amplitude: sign * 0.87, velocity: 0.1 }; settle(state, 0);
			expect(state.amplitude).toBeCloseTo(sign, 8); expect(Math.abs(state.velocity)).toBeLessThan(1e-8);
		}
	});
	it('resists subcritical load, snaps above the analytic saddle, and stays across release', () => {
		const state = { amplitude: 1, velocity: 0 };
		// Ramp quasi-statically: a sudden subcritical force may dynamically cross the barrier.
		for (let f = 0; f >= -FOIL_SNAP_LOAD * 0.95; f -= 0.1) settle(state, f, 0.3);
		expect(state.amplitude).toBeGreaterThan(0.57);
		settle(state, -FOIL_SNAP_LOAD * 1.05); expect(state.amplitude).toBeLessThan(-1);
		settle(state, 0); expect(state.amplitude).toBeCloseTo(-1, 8);
		for (let f = 0; f <= FOIL_SNAP_LOAD * 0.95; f += 0.1) settle(state, f, 0.3);
		expect(state.amplitude).toBeLessThan(-0.57);
		settle(state, FOIL_SNAP_LOAD * 1.05); settle(state, 0); expect(state.amplitude).toBeCloseTo(1, 8);
	});
	it('dissipates after release and bounds extreme input without NaN', () => {
		const state = { amplitude: 1, velocity: 0 };
		settle(state, -1e30, 2); const energy = foilEnergy(state.amplitude) + state.velocity ** 2 / 2;
		settle(state, 0, 5); expect(foilEnergy(state.amplitude) + state.velocity ** 2 / 2).toBeLessThan(energy * 0.001);
		const saved = { ...state }; advanceFoil(state, NaN, 0); advanceFoil(state, 1, NaN); expect(state).toEqual(saved);
		expect(Math.abs(state.amplitude)).toBeLessThan(1.6);
	});
});
