import { describe, expect, it } from 'vitest';
import {
	applyCssQualityPolicy,
	canvasPixelSize,
	cssQualityPolicy,
	resolvePixelRatio
} from '../resolution.js';
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


	it('undoes policy-injected values when the canvas grows, never user values', () => {
		const small = cssQualityPolicy(320, 240, 128, false, false);
		const large = cssQualityPolicy(900, 700, 128, false, false);
		const cfg: Record<string, boolean | number | undefined> = {};
		const forced = applyCssQualityPolicy(cfg, small);
		expect(cfg).toMatchObject({ bloom: false, sunrays: false, bloomIterations: 4, pressureIterations: 10 });

		const grown: Record<string, boolean | number | undefined> = {};
		applyCssQualityPolicy(grown, large, forced);
		expect(grown).toEqual({ bloom: true, sunrays: true, bloomIterations: 8, pressureIterations: 20 });

		// User-resolved values survive: bloom explicit false, pressureIterations explicit 7.
		const userSmall = cssQualityPolicy(320, 240, 128, false, true);
		const userForced = applyCssQualityPolicy({ bloom: false, pressureIterations: 7 }, userSmall);
		const userGrown: Record<string, boolean | number | undefined> = { bloom: false, pressureIterations: 7 };
		applyCssQualityPolicy(userGrown, cssQualityPolicy(900, 700, 128, false, true), userForced);
		expect(userGrown).toMatchObject({ bloom: false, pressureIterations: 7, sunrays: true, bloomIterations: 8 });
	});
});
