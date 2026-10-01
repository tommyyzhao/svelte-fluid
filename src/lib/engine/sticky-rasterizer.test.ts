import { describe, expect, it } from 'vitest';
import { blurStickyMask, resampleStickyMask, resolveMaskResolution } from './sticky-rasterizer.js';

describe('blurStickyMask', () => {
	it('uses one finite bounded resolution policy', () => {
		expect(resolveMaskResolution(Number.NaN)).toBe(512);
		expect(resolveMaskResolution(Number.POSITIVE_INFINITY)).toBe(512);
		expect(resolveMaskResolution(9000)).toBe(4096);
		expect(resolveMaskResolution(9000, 2048)).toBe(2048);
	});
	it('spreads an impulse symmetrically without allocating per pixel', () => {
		const data = new Uint8Array(25);
		data[12] = 255;
		blurStickyMask(data, 5, 5, 1);
		expect(data[12]).toBeGreaterThan(0);
		expect(data[11]).toBe(data[13]);
		expect(data[7]).toBe(data[17]);
		expect(data[0]).toBe(0);
	});

	it('resamples coverage without turning a disabled edge on', () => {
		const data = resampleStickyMask({ data: new Uint8Array([0, 255, 0, 255]), width: 2, height: 2 }, 4, 4);
		expect(data[0]).toBe(0);
		expect(data[3]).toBe(255);
		expect(data[2]).toBeGreaterThan(0);
		expect(data[2]).toBeLessThan(255);
	});
});
