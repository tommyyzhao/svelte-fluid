import { describe, expect, it } from 'vitest';
import {
	applyCssQualityPolicy,
	canvasPixelSize,
	cssQualityPolicy,
	fitDrawingBufferSize,
	resolvePixelRatio
} from '../resolution.js';
import { DEFAULTS } from '../FluidEngine.js';
import { getResolution } from '../gl-utils.js';
import type { GL } from '../gl-utils.js';
import fluidSrc from '../../Fluid.svelte?raw';

describe('component pixel ratio and CSS quality policy', () => {
	it('keeps CSS quality tiers identical across DPR 1, 2, and 3', () => {
		const policies = [1, 2, 3].map(() => cssQualityPolicy(520, 480, 128, false, false));
		expect(policies[1]).toEqual(policies[0]);
		expect(policies[2]).toEqual(policies[0]);
		expect(policies[0]).toEqual({ suppressPost: true, bloomIterations: 5, pressureIterations: 10 });
	});

	it('caps DPR 3 at 2 by default and null opts into native DPR', () => {
		expect(resolvePixelRatio(3)).toBe(2);
		expect(canvasPixelSize(320, 180, 3)).toEqual({ width: 640, height: 360, pixelRatio: 2 });
		expect(canvasPixelSize(320, 180, 3, null)).toEqual({ width: 960, height: 540, pixelRatio: 3 });
		expect(resolvePixelRatio(Number.NaN)).toBe(1);
		expect(resolvePixelRatio(3, 0)).toBe(2);
	});

	it('declares and consumes the public component prop instead of leaking it to canvas attributes', () => {
		expect(fluidSrc).toContain('maxPixelRatio?: number | null');
		expect(fluidSrc).toContain('maxPixelRatio = 2');
		expect(fluidSrc).toContain('const stableMaxPixelRatio = untrack(() => maxPixelRatio)');
		expect(fluidSrc).toContain('canvasPixelSize(cssW, cssH, window.devicePixelRatio || 1, stableMaxPixelRatio)');
	});

	it('fits drawing buffers and texture grids within GL limits while preserving aspect', () => {
		expect(fitDrawingBufferSize(8000, 4000, 4096, 4096)).toEqual({ width: 4096, height: 2048 });
		const gl = {
			drawingBufferWidth: 8000,
			drawingBufferHeight: 4000,
			MAX_TEXTURE_SIZE: 0x0d33,
			getParameter: () => 4096
		} as unknown as GL;
		expect(getResolution(gl, 3000)).toEqual({ width: 4096, height: 2048 });
	});

	describe('applyCssQualityPolicy', () => {
		type Cfg = Record<string, boolean | number | undefined>;
		const defaults = {
			bloom: DEFAULTS.BLOOM,
			sunrays: DEFAULTS.SUNRAYS,
			bloomIterations: DEFAULTS.BLOOM_ITERATIONS,
			pressureIterations: DEFAULTS.PRESSURE_ITERATIONS
		};
		const small = cssQualityPolicy(320, 240, 128, false, false);
		const large = cssQualityPolicy(900, 700, 128, false, false);

		it('undoes policy-injected values when the canvas grows', () => {
			const cfg: Cfg = {};
			const forced = applyCssQualityPolicy(cfg, small, defaults);
			expect(cfg).toEqual({ bloom: false, sunrays: false, bloomIterations: 4, pressureIterations: 10 });
			const grown: Cfg = {};
			applyCssQualityPolicy(grown, large, defaults, forced);
			expect(grown).toEqual({
				bloom: DEFAULTS.BLOOM,
				sunrays: DEFAULTS.SUNRAYS,
				bloomIterations: DEFAULTS.BLOOM_ITERATIONS,
				pressureIterations: DEFAULTS.PRESSURE_ITERATIONS
			});
		});

		it('never overrides an explicit user value, including bloom={true}', () => {
			const cfg: Cfg = { bloom: true, pressureIterations: 7 };
			const forced = applyCssQualityPolicy(cfg, small, defaults);
			expect(cfg).toMatchObject({ bloom: true, pressureIterations: 7, sunrays: false });
			expect(forced.has('bloom')).toBe(false);
			expect(forced.has('pressureIterations')).toBe(false);
			const grown: Cfg = { bloom: true, pressureIterations: 7 };
			applyCssQualityPolicy(grown, large, defaults, forced);
			expect(grown).toMatchObject({ bloom: true, pressureIterations: 7, sunrays: true });
		});
	});
});
