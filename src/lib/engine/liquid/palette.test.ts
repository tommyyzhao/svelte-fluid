import { describe, expect, it } from 'vitest';
import { hexToLinear } from '../pigment/spectral.js';
import { mixtureLut } from './palette.js';

const palette = ['#6ec6ff', '#f2b134', '#e8608a'] as const;
describe('liquid pigment simplex', () => {
	it('preserves pure species at every corner', () => {
		const lut = mixtureLut(palette);
		for (const [species, x, y] of [
			[0, 0, 0],
			[1, 63, 0],
			[2, 0, 63]
		]) {
			const expected = hexToLinear(palette[species]);
			for (let c = 0; c < 3; c++) expect(lut[(y * 64 + x) * 4 + c]).toBeCloseTo(expected[c], 5);
		}
	});
	it('mixes dew and sap subtractively into green', () => {
		const lut = mixtureLut(palette, 65);
		const [r, g, b] = lut.slice(32 * 4, 32 * 4 + 3);
		expect(g).toBeGreaterThan(r);
		expect(g).toBeGreaterThan(b);
	});
	it('keeps dew and rose violet, every mixture finite and bounded', () => {
		const lut = mixtureLut(palette, 65);
		const at = 32 * 65 * 4;
		expect(lut[at + 2]).toBeGreaterThan(lut[at]);
		expect(lut[at]).toBeGreaterThan(lut[at + 1]);
		for (const value of lut) {
			expect(Number.isFinite(value)).toBe(true);
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThanOrEqual(1);
		}
	});
	it('rejects malformed colours and sizes', () => {
		expect(() => mixtureLut(['red', '#fff', '#000'])).toThrow();
		expect(() => mixtureLut(palette, 1)).toThrow();
	});
});
