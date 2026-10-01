import { describe, expect, it } from 'vitest';
import { coarseEnamel, enamelProfile } from './enamel-profile.js';

describe('static enamel relief', () => {
	it('rounds toward a plateau, keeps holes empty and leaves thin strokes lower', () => {
		const width = 100, height = 100;
		const coverage = new Uint8Array(width * height);
		for (let y = 10; y < 90; y++) for (let x = 10; x < 50; x++) coverage[y * width + x] = 255;
		for (let y = 10; y < 90; y++) coverage[y * width + 70] = 255;
		const profile = enamelProfile(coverage, width, height);
		const h = (x: number, y: number) => profile.data[(y * width + x) * 4 + 2];
		expect(h(5, 50)).toBe(0);
		expect(h(10, 50)).toBeLessThan(h(12, 50));
		expect(h(12, 50)).toBeLessThan(h(30, 50));
		expect(h(30, 50)).toBe(h(35, 50));
		expect(h(70, 50)).toBeLessThan(h(30, 50));
		expect(profile.data[(50 * width + 10) * 4]).toBeGreaterThan(128);
		expect(profile.data[(50 * width + 49) * 4]).toBeLessThan(128);
	});

	it('area-averages the quantized rendered rest field on noninteger grid ratios', () => {
		const profile = enamelProfile(new Uint8Array(37 * 29).fill(255), 37, 29);
		const { initial, solid } = coarseEnamel(profile, 13, 11);
		const fineMean = profile.data.reduce((sum, v, i) => sum + (i % 4 === 2 ? v / 255 : 0), 0) / (37 * 29);
		const coarseMean = initial.reduce((sum, v) => sum + v, 0) / initial.length;
		expect(coarseMean).toBeCloseTo(fineMean, 6);
		expect([...solid].every((v) => v === 0)).toBe(true);
	});

	it('empty coverage stays empty with finite encoded slopes', () => {
		const profile = enamelProfile(new Uint8Array(40 * 30), 40, 30);
		const { initial, solid } = coarseEnamel(profile, 17, 11);
		expect([...initial].every((v) => v === 0)).toBe(true);
		expect([...solid].every((v) => v === 1)).toBe(true);
		expect(profile.data[0]).toBe(128);
		expect(profile.data[1]).toBe(128);
	});
});
