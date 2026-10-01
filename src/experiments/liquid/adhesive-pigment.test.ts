import { describe, expect, it } from 'vitest';
import { pigmentSheetPulse, reactPigmentSheet, transportPigment, pigmentCoveragePeakBytes, PIGMENT_SHEET_DOSE, PIGMENT_CLEAR_SECONDS } from './capillary-pigment-model.js';

describe('traversable adhesive pigment sheet', () => {
	it('accounts for native raster CPU copies plus output before admitting a candidate', () => {
		const fixed = 2_433_088 + 192 * 96 * 4, old = 801 * 401, readback = 884_736;
		expect(pigmentCoveragePeakBytes(1202, 601, fixed, old, readback)).toBe(fixed + old + readback + 1202 * 601 * (4 + 4 + 1 + 4));
		expect(pigmentCoveragePeakBytes(2700, 1560, fixed, old)).toBeLessThan(128 * 1024 * 1024);
		expect(pigmentCoveragePeakBytes(4000, 3000, fixed, old)).toBeGreaterThan(128 * 1024 * 1024);
		expect(() => pigmentCoveragePeakBytes(800.5, 401, fixed)).toThrow();
	});
	it('accounts for every color in mobile, attached and cleared reservoirs under repeated reaction and mechanical lift', () => {
		for (const coverage of [0, 0.2, 1]) {
			let mobile = [0.7, 0.5, 0.2], attached = [0, 0, 0]; const cleared = [0, 0, 0], initial = [...mobile];
			let minimum = Infinity, maximumCapacityError = 0;
			for (let i = 0; i < 800; i++) {
				const next = reactPigmentSheet(mobile, attached, coverage, 1 / 120, i > 400 ? 4 : 0);
				mobile = next.mobile; attached = next.attached; for (let c = 0; c < 3; c++) cleared[c] += next.removed[c];
				minimum = Math.min(minimum, ...mobile, ...attached, ...cleared);
				maximumCapacityError = Math.max(maximumCapacityError, attached.reduce((a, b) => a + b, 0) - coverage * 0.8);
			}
			expect(minimum).toBeGreaterThanOrEqual(0); expect(maximumCapacityError).toBeLessThan(1e-12);
			for (let c = 0; c < 3; c++) expect(mobile[c] + attached[c] + cleared[c]).toBeCloseTo(initial[c], 12);
			if (coverage === 0) { expect(attached).toEqual([0, 0, 0]); expect(cleared[0]).toBeGreaterThan(0.69); }
			if (coverage === 1) { expect(cleared).toEqual([0, 0, 0]); expect(attached[0]).toBeGreaterThan(0.02); }
		}
	});
	it('allows mobile pigment to cross an adhesive region instead of treating its boundary as a wall', () => {
		const width = 11, height = 3, open = new Uint32Array(width * height).fill(1), cleared = [0, 0, 0];
		let state = new Float32Array(width * height * 8); state[(width + 1) * 8] = 1;
		for (let step = 0; step < 120; step++) {
			state = transportPigment(state, open, width, height, 1 / 120, (_x, _y, horizontal) => horizontal ? 7 : 0, 0);
			for (let i = 0; i < open.length; i++) {
				const reaction = reactPigmentSheet([...state.subarray(i * 8, i * 8 + 3)], [...state.subarray(i * 8 + 4, i * 8 + 7)], i % width === 5 ? 1 : 0, 1 / 120);
				state.set(reaction.mobile, i * 8); state.set(reaction.attached, i * 8 + 4); for (let c = 0; c < 3; c++) cleared[c] += reaction.removed[c];
			}
		}
		let beyond = 0, mobile = 0, attached = 0;
		for (let i = 0; i < open.length; i++) { mobile += state[i * 8]; attached += state[i * 8 + 4]; if (i % width > 5) beyond += state[i * 8]; }
		expect(beyond).toBeGreaterThan(0.1); expect(attached).toBeGreaterThan(0.005); expect(mobile + attached + cleared[0]).toBeCloseTo(1, 6);
	});
	it('has finite whole-sheet color doses and a bounded reaction-only clear control, including empty and saturated sites', () => {
		for (let color = 0; color < 3; color++) {
			const dose = pigmentSheetPulse(color), totals = [0, 0, 0]; let minimum = Infinity;
			for (let i = 0; i < dose.length; i += 4) for (let c = 0; c < 3; c++) { totals[c] += dose[i + c]; minimum = Math.min(minimum, dose[i + c]); }
			expect(minimum).toBeGreaterThanOrEqual(0); for (let c = 0; c < 3; c++) expect(totals[c]).toBeCloseTo(c === color ? PIGMENT_SHEET_DOSE : 0, 3);
		}
		const glyph = reactPigmentSheet([0.2, 0.1, 0.05], [0, 0, 0], 1, PIGMENT_CLEAR_SECONDS), sheet = reactPigmentSheet([0.2, 0.1, 0.05], [0, 0, 0], 0, PIGMENT_CLEAR_SECONDS);
		expect(glyph.attached[0]).toBeGreaterThan(0.19); expect(sheet.mobile[0]).toBeLessThan(0.001); expect(sheet.removed[0]).toBeGreaterThan(0.199);
		expect(reactPigmentSheet([0, 0, 0], [0, 0, 0], 0, PIGMENT_CLEAR_SECONDS)).toEqual({ mobile: [0, 0, 0], attached: [0, 0, 0], removed: [0, 0, 0] });
		const saturated = reactPigmentSheet([100, 100, 100], [0.2, 0.2, 0.4], 1, PIGMENT_CLEAR_SECONDS);
		expect(saturated.attached.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(0.8000000001);
	});
});
