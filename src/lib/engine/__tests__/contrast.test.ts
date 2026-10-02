import { describe, expect, it } from 'vitest';
import {
	applyContrastFloor,
	contrastFloor,
	contrastFloorFor,
	contrastRatio,
	linearToSrgb,
	percentile,
	outlineColorFor,
	relativeLuminance,
	srgbToLinear
} from '../contrast.js';
import { DEFAULTS, resolveConfig } from '../FluidEngine.js';
import { displayShaderSource } from '../shaders.js';

const lum = (v: number[]) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];

describe('WCAG maths', () => {
	it('matches the spec anchors', () => {
		expect(relativeLuminance(1, 1, 1)).toBeCloseTo(1, 6);
		expect(relativeLuminance(0, 0, 0)).toBe(0);
		expect(contrastRatio(1, 0)).toBeCloseTo(21, 6);
		// #767676 on white is the canonical 4.54:1 AA pass.
		const g = 0x76 / 255;
		expect(contrastRatio(relativeLuminance(g, g, g), 1)).toBeCloseTo(4.54, 2);
		expect(linearToSrgb(srgbToLinear(0.37))).toBeCloseTo(0.37, 8);
	});
	it('percentile is nearest-rank', () => {
		expect(percentile([5, 1, 3, 2, 4], 0)).toBe(1);
		expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3);
		expect(percentile([1, 2], 1)).toBe(2);
		expect(percentile([], 0.5)).toBeNaN();
	});
});

describe('contrast floor', () => {
	it('dark page lifts, light page darkens, and the bound achieves the ratio', () => {
		for (const bg of [0, 0.01, 0.05, 0.179, 0.3, 0.6, 1]) {
			for (const ratio of [3, 4.5, 7]) {
				const f = contrastFloor(bg, ratio);
				expect(f.lum).toBeGreaterThanOrEqual(0);
				expect(f.lum).toBeLessThanOrEqual(1);
				if (contrastRatio(f.lum, bg) < ratio - 1e-9) {
					// Only allowed when the page cannot reach the ratio on either side.
					expect(contrastRatio(0, bg) < ratio && contrastRatio(1, bg) < ratio).toBe(true);
				}
			}
		}
		expect(contrastFloor(0, 3).dir).toBe(1);
		expect(contrastFloor(1, 3).dir).toBe(-1);
	});
	it('is off for ratios <= 1 and clamps above 21', () => {
		for (const r of [1, 0, NaN]) expect(contrastFloorFor(r, { r: 0, g: 0, b: 0 })[0]).toBe(0);
		expect(contrastFloorFor(99, { r: 0, g: 0, b: 0 })[1]).toBeLessThanOrEqual(1);
	});
	it('applyContrastFloor reaches the bound, never moves passing pixels, stays in gamut', () => {
		const floor = contrastFloor(0, 3);
		const samples: [number, number, number][] = [
			[0, 0, 0],
			[0.01, 0, 0.02],
			[0.2, 0.01, 0.01],
			[0.001, 0.3, 0.001],
			[0.9, 0.9, 0.9]
		];
		for (const px of samples) {
			const out = applyContrastFloor(px, floor);
			for (const v of out) {
				expect(v).toBeGreaterThanOrEqual(0);
				expect(v).toBeLessThanOrEqual(1 + 1e-9);
			}
			if (lum(px) >= floor.lum) expect(out).toEqual(px);
			else expect(lum(out)).toBeGreaterThanOrEqual(floor.lum - 1e-6);
		}
		const dark = contrastFloor(1, 4.5);
		const out = applyContrastFloor([0.9, 0.8, 0.95], dark);
		expect(lum(out)).toBeLessThanOrEqual(dark.lum + 1e-9);
		// Hue-preserving darken: channel ratios unchanged.
		expect(out[0] / out[1]).toBeCloseTo(0.9 / 0.8, 8);
	});
});

describe('best achievable side', () => {
	it('picks the side with the higher ratio when neither reaches the request', () => {
		// Page L=0.30: black gives 7:1, white only 3.5:1.
		const f = contrastFloor(0.3, 10);
		expect(f).toMatchObject({ dir: -1, lum: 0 });
		expect(contrastRatio(f.lum, 0.3)).toBeCloseTo(7, 6);
		const dark = contrastFloor(0.02, 40);
		expect(dark).toMatchObject({ dir: 1, lum: 1 });
		const halo = outlineColorFor(10, { r: 148, g: 148, b: 148 })!; // L~0.30
		expect(halo).toEqual([0, 0, 0]);
	});
});

describe('passing pixels are untouched (mid-grey reference)', () => {
	// #6e6e6e: L=0.156. At 3:1 black passes (ratio 3.12), white passes (5.8).
	const ref = relativeLuminance(0x6e / 255, 0x6e / 255, 0x6e / 255);
	const floor = contrastFloor(ref, 3);
	it('black and white stay; the grey in between moves to a passing side', () => {
		expect(applyContrastFloor([0, 0, 0], { ...floor, lo: contrastFloor(ref, 3).lo })).toEqual([0, 0, 0]);
		expect(applyContrastFloor([1, 1, 1], floor)).toEqual([1, 1, 1]);
		const mid = applyContrastFloor([0.17, 0.17, 0.17], floor);
		expect(contrastRatio(lum(mid), ref)).toBeGreaterThanOrEqual(3);
	});
	it('every pixel ends at >= minContrast, and any pixel that already passed is unchanged', () => {
		for (let v = 0; v <= 1; v += 0.01) {
			const px: [number, number, number] = [v, v * 0.7, v * 0.4];
			const out = applyContrastFloor(px, floor);
			if (contrastRatio(lum(px), ref) >= 3) expect(out).toEqual(px);
			else expect(contrastRatio(lum(out), ref)).toBeGreaterThanOrEqual(3 - 1e-6);
		}
	});
});

describe('engine wiring', () => {
	it('is off by default; undefined never overwrites; values clamp', () => {
		expect(DEFAULTS.MIN_CONTRAST).toBe(0);
		const on = resolveConfig({ minContrast: 3, contrastColor: { r: 1, g: 2, b: 3 } }, DEFAULTS);
		expect(on.MIN_CONTRAST).toBe(3);
		const kept = resolveConfig({ minContrast: undefined, contrastColor: undefined }, on);
		expect(kept.MIN_CONTRAST).toBe(3);
		expect(kept.CONTRAST_COLOR).toEqual({ r: 1, g: 2, b: 3 });
		expect(resolveConfig({ minContrast: 500 }, DEFAULTS).MIN_CONTRAST).toBe(21);
		expect(resolveConfig({ minContrast: Infinity }, DEFAULTS).MIN_CONTRAST).toBe(0);
		expect(resolveConfig({ contrastColor: null }, on).CONTRAST_COLOR).toBeNull();
	});
	it('the shader carries the floor behind a keyword', () => {
		expect(displayShaderSource).toContain('#ifdef CONTRAST_FLOOR');
		expect(displayShaderSource).toContain('uContrastFloor');
	});
});

describe('outline colour', () => {
	it('clears the requested ratio against dark/light pages; disables at 1', () => {
		for (const g of [0, 32, 118, 180, 255]) {
			for (const ratio of [3, 4.5]) {
				const ref = { r: g, g, b: g };
				const c = outlineColorFor(ratio, ref)!;
				expect(contrastRatio(relativeLuminance(...c), relativeLuminance(g / 255, g / 255, g / 255))).toBeGreaterThanOrEqual(ratio);
			}
		}
		expect(outlineColorFor(1, { r: 0, g: 0, b: 0 })).toBeNull();
	});
});
