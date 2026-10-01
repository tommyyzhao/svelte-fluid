import { describe, expect, it } from 'vitest';
import { brushPile, createPileField } from './velvet.js';

describe('polar velvet memory', () => {
	it('stores opposite signed lean, not the same unoriented axis', () => {
		const right = createPileField(), left = createPileField();
		expect(brushPile(right, [0.1, 0.5], [0.9, 0.5])).toBe(true);
		expect(brushPile(left, [0.9, 0.5], [0.1, 0.5])).toBe(true);
		const center = (32 * 96 + 48) * 2;
		expect(right[center]).toBeGreaterThan(0.85); expect(left[center]).toBeLessThan(-0.85);
		expect(right[center]).toBeCloseTo(-left[center], 6);
		for (let i = 0; i < right.length; i += 2) expect(Math.hypot(right[i], right[i + 1])).toBeLessThanOrEqual(0.900001);
	});
	it('sweeps long paths continuously and does no work for a stationary or invalid stroke', () => {
		const field = createPileField();
		brushPile(field, [0.05, 0.5], [0.95, 0.5]);
		for (let x = 8; x < 88; x++) expect(field[(32 * 96 + x) * 2]).toBeGreaterThan(0.8);
		const before = field.slice();
		expect(brushPile(field, [0.5, 0.5], [0.5, 0.5])).toBe(false);
		expect(brushPile(field, [NaN, 0], [1, 1])).toBe(false);
		expect(brushPile(field, [-1e308, 0], [1e308, 0])).toBe(false);
		expect(field).toEqual(before);
	});
	it('integrates brush exposure independently of straight-path input segmentation', () => {
		const whole = createPileField(), pieces = createPileField();
		brushPile(whole, [0.1, 0.48], [0.9, 0.52]);
		for (let i = 0; i < 40; i++) brushPile(pieces, [0.1 + i * 0.02, 0.48 + i * 0.001], [0.1 + (i + 1) * 0.02, 0.48 + (i + 1) * 0.001]);
		let worst = 0; for (let i = 0; i < whole.length; i++) worst = Math.max(worst, Math.abs(whole[i] - pieces[i]));
		expect(worst).toBeLessThan(0.000001);
	});
});
