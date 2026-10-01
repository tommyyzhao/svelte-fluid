import { describe, expect, it } from 'vitest';
import { blurMaskData } from '../sticky-blur.js';

/** Verbatim copy of the pre-0.8 FluidEngine.blurMaskData (O(radius) per pixel, unbounded passes). */
function legacyBlur(data: Uint8Array, w: number, h: number, radius: number): void {
	const passes = Math.max(1, Math.ceil(radius / 2));
	const r = Math.max(1, Math.round(radius));
	const temp = new Uint8Array(w * h);
	for (let pass = 0; pass < passes; pass++) {
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				let sum = 0;
				let count = 0;
				for (let dx = -r; dx <= r; dx++) {
					const nx = x + dx;
					if (nx >= 0 && nx < w) {
						sum += data[y * w + nx];
						count++;
					}
				}
				temp[y * w + x] = (sum / count) | 0;
			}
		}
		for (let x = 0; x < w; x++) {
			for (let y = 0; y < h; y++) {
				let sum = 0;
				let count = 0;
				for (let dy = -r; dy <= r; dy++) {
					const ny = y + dy;
					if (ny >= 0 && ny < h) {
						sum += temp[ny * w + x];
						count++;
					}
				}
				data[y * w + x] = (sum / count) | 0;
			}
		}
	}
}

/** Glyph-like test mask: a filled disc plus a thin bar, hard 0/255 edges. */
function mask(w: number, h: number): Uint8Array {
	const out = new Uint8Array(w * h);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const disc = (x - w * 0.35) ** 2 + (y - h * 0.5) ** 2 < (h * 0.3) ** 2;
			const bar = x > w * 0.65 && x < w * 0.72 && y > h * 0.15 && y < h * 0.85;
			out[y * w + x] = disc || bar ? 255 : 0;
		}
	}
	return out;
}

describe('sticky mask blur', () => {
	it('matches the historical blur bit-for-bit up to three passes', () => {
		for (const radius of [0.4, 1, 1.5, 2, 3, 4, 5, 6]) {
			const expected = mask(61, 37);
			const actual = expected.slice();
			legacyBlur(expected, 61, 37, radius);
			blurMaskData(actual, 61, 37, radius);
			expect(Array.from(actual), `radius ${radius}`).toEqual(Array.from(expected));
		}
	});

	it('stays within tolerance of the historical softness for larger radii', () => {
		// Residual is mostly the legacy stack's extra `| 0` truncations (one per
		// pass per axis) plus edge renormalization: under 5% of full scale.
		for (const radius of [7, 8, 10, 14, 20]) {
			const expected = mask(96, 64);
			const actual = expected.slice();
			legacyBlur(expected, 96, 64, radius);
			blurMaskData(actual, 96, 64, radius);
			let total = 0;
			let max = 0;
			for (let i = 0; i < actual.length; i++) {
				const diff = Math.abs(actual[i] - expected[i]);
				total += diff;
				max = Math.max(max, diff);
			}
			expect(total / actual.length, `radius ${radius} mean`).toBeLessThan(12);
			expect(max, `radius ${radius} max`).toBeLessThan(24);
		}
	});

	it('ignores zero, negative and non-finite radii', () => {
		for (const radius of [0, -3, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
			const data = mask(16, 16);
			const before = data.slice();
			blurMaskData(data, 16, 16, radius);
			expect(data).toEqual(before);
		}
	});

	it('bounds work for huge radii on a full-size mask', () => {
		const data = mask(512, 512);
		const start = performance.now();
		blurMaskData(data, 512, 512, 1e9);
		// Legacy cost here is ~5e8 passes × O(r) per pixel; the bounded blur is three O(n) passes.
		expect(performance.now() - start).toBeLessThan(1000);
		expect(data.every((v) => v >= 0 && v <= 255)).toBe(true);
	});
});
