import { describe, expect, it } from 'vitest';
import { causticMemoryPlan, causticPhotoColor, causticPhotoCrop } from './caustic-light.js';
import { coverImageBytes } from './living-cover.js';

describe('fixed photographic caustic receiver', () => {
	it('preserves the registered crop and never derives photo coordinates from light', () => {
		const sourceAspect = 3803 / 3162;
		expect(causticPhotoCrop(1, sourceAspect)).toEqual([0.9 / sourceAspect, 0.9]);
		for (const aspect of [0.5, 1, 1.6, 2.5]) {
			const [sx, sy] = causticPhotoCrop(aspect, sourceAspect);
			expect(sx / sy).toBeCloseTo(aspect / sourceAspect, 12);
			expect(0.5 - sx / 2).toBeGreaterThanOrEqual(0.049999);
			expect(0.475 - sy / 2).toBeGreaterThanOrEqual(0.024999);
			expect(0.475 + sy / 2).toBeLessThanOrEqual(0.925001);
		}
		expect(() => causticPhotoCrop(NaN, sourceAspect)).toThrow();
	});
	it('is exact identity under unit illumination and bounds a monotone linear-light shoulder', () => {
		for (let color = 0; color <= 1; color += 0.01) {
			expect(causticPhotoColor(color, 1)).toBeCloseTo(color, 14);
			let previous = -1;
			for (const light of [0, 0.01, 0.5, 1, 2, 20, 500, 65_504 * 1024]) {
				const value = causticPhotoColor(color, light);
				expect(Number.isFinite(value)).toBe(true); expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(1);
				expect(value).toBeGreaterThanOrEqual(previous); previous = value;
			}
		}
		expect(causticPhotoColor(0.3, 0.1)).toBeLessThan(0.3);
		expect(causticPhotoColor(0.3, 3)).toBeGreaterThan(0.3);
	});
	it('adds immutable original+mips to native source/receiver/output/resize ledgers', () => {
		const source = coverImageBytes(3803, 3162);
		expect(source).toEqual({ bytes: 64_123_008, levels: 12 });
		const plan = causticMemoryPlan(1800, 1800, 1200 ** 2, source.bytes);
		expect(plan.engineBytes).toBe(source.bytes + 256 ** 2 * 32 + 64 + 1800 ** 2 * 2);
		expect(plan.peakResizeBytes).toBe(88_540_224);
		expect(() => causticMemoryPlan(4000, 4000, 4000 ** 2, 192 * 1024 ** 2)).toThrow('attachment budget');
	});
});
