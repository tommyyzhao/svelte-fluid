import { describe, expect, it } from 'vitest';
import { WICK_WIDTH as W, WICK_HEIGHT as H, WICK_DIFFUSION, WICK_DROP, WICK_PIPETTE, wickDose, wickMaterial, wickReference, wickSubsteps, wickTotals } from './wick-and-swell-model.js';

describe('finite porous water and mechanical coupling', () => {
	it('normalizes a finite dose at both the center and a boundary', () => {
		for (const p of [[0.67, 0.5], [0, 0], [1, 0.5]]) {
			const dose = wickDose(...p as [number, number]);
			expect(dose.reduce((sum, value) => sum + value, 0)).toBeCloseTo(WICK_DROP, 4);
			expect(dose.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
		}
		expect(() => wickDose(NaN, 0.5)).toThrow(); expect(() => wickDose(0.5, 0.5, WICK_PIPETTE + 1)).toThrow();
	});
	it('bounds pore capacity and conserves surface plus absorbed water through uptake and diffusion', () => {
		let state = new Float32Array(W * H * 2); const dose = wickDose(0.67, 0.5);
		for (let i = 0; i < dose.length; i++) state[i * 2 + 1] = dose[i];
		for (let step = 0; step < 240; step++) state = wickReference(state, 1 / 120);
		const first = wickTotals(state);
		for (let step = 0; step < 240; step++) state = wickReference(state, 1 / 120);
		const later = wickTotals(state);
		expect(first.absorbed).toBeGreaterThan(100); expect(first.surface).toBeGreaterThan(0);
		expect(later.min).toBeGreaterThanOrEqual(0); expect(later.max).toBeLessThanOrEqual(1);
		expect(later.mass).toBeCloseTo(WICK_DROP, 2); expect(later.absorbed).toBeGreaterThan(first.absorbed);
		expect(later.radius2).toBeGreaterThan(first.radius2 * 1.2); expect(later.wetCells).toBeGreaterThan(first.wetCells);
	});
	it('has a max principle and no loss across no-flux boundaries', () => {
		const state = new Float32Array(8 * 5 * 2); state[0] = 1; state[1] = 300;
		const result = wickReference(state, 0.1, 8, 5), totals = wickTotals(result, 8);
		expect(totals.min).toBeGreaterThanOrEqual(0); expect(totals.max).toBeLessThanOrEqual(1); expect(totals.mass).toBeCloseTo(301, 3);
		expect(wickSubsteps(0.1)).toBe(12); expect(() => wickSubsteps(0)).toThrow(); expect(() => wickReference(state, 0.2, 8, 5)).toThrow();
	});
	it('uses one conservative integration bound for a normal frame and the full eight-second advance', () => {
		for (const seconds of [1 / 120, 0.037, 0.1, 1.17, 8]) {
			const count = wickSubsteps(seconds);
			expect(4 * WICK_DIFFUSION * seconds / count).toBeLessThanOrEqual(0.8 + 1e-12);
			if (count > 1) expect(4 * WICK_DIFFUSION * seconds / (count - 1)).toBeGreaterThan(0.8);
		}
		expect(wickSubsteps(8)).toBe(960);
		for (const invalid of [0, -1, NaN, Infinity, 8.01]) expect(() => wickSubsteps(invalid)).toThrow();
	});
	it('raises wet paper at rest and makes the same pressure indent it more deeply', () => {
		const dry = wickMaterial(0), wet = wickMaterial(0.8), dryPress = wickMaterial(0, 1), wetPress = wickMaterial(0.8, 1);
		expect(wet.rise).toBeGreaterThan(dry.rise + 0.04);
		expect(wet.compliance / dry.compliance).toBeGreaterThan(8);
		expect(wet.height - wetPress.height).toBeGreaterThan((dry.height - dryPress.height) * 8);
	});
});
