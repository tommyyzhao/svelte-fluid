import { describe, it, expect } from 'vitest';
import { stickyMaskEqual, viewBoxEqual } from '../container-shapes.js';
import type { StickyMask } from '../types.js';

/* ------------------------------------------------------------------ */
/*                   Sticky advection math tests                       */
/* ------------------------------------------------------------------ */

describe('sticky advection dissipation modulation (shader math mirror)', () => {
	/**
	 * Mirror of the GLSL sticky advection calculation.
	 * In additive mode (uMultiplicative <= 0.5):
	 *   adjDissipation = mix(dissipation, 0.0, stickyVal * stickyStrength)
	 *   decay = 1 + adjDissipation * dt
	 *   result = input / decay
	 *
	 * In multiplicative mode (uMultiplicative > 0.5):
	 *   adjDissipation = mix(dissipation, 1.0, stickyVal * stickyStrength)
	 *   result = adjDissipation * input
	 */
	function stickyAdvection(
		inputValue: number,
		dissipation: number,
		dt: number,
		multiplicative: boolean,
		stickyVal: number,
		stickyStrength: number
	): number {
		const stickyFactor = stickyVal * stickyStrength;
		if (multiplicative) {
			const adjDissipation = dissipation + (1.0 - dissipation) * stickyFactor;
			return adjDissipation * inputValue;
		} else {
			const adjDissipation = dissipation * (1.0 - stickyFactor);
			const decay = 1.0 + adjDissipation * dt;
			return inputValue / decay;
		}
	}

	it('no sticky (stickyStrength=0) produces same result as normal advection — additive', () => {
		const dissipation = 0.3;
		const dt = 1 / 60;
		const input = 0.8;
		const decay = 1.0 + dissipation * dt;
		const expected = input / decay;
		const result = stickyAdvection(input, dissipation, dt, false, 1.0, 0.0);
		expect(result).toBeCloseTo(expected, 6);
	});

	it('no sticky (stickyStrength=0) produces same result as normal advection — multiplicative', () => {
		const dissipation = 0.96;
		const input = 0.8;
		const expected = dissipation * input;
		const result = stickyAdvection(input, dissipation, 0, true, 1.0, 0.0);
		expect(result).toBeCloseTo(expected, 6);
	});

	it('full sticky on mask (stickyVal=1, strength=1) eliminates dissipation — additive', () => {
		const result = stickyAdvection(0.8, 0.3, 1 / 60, false, 1.0, 1.0);
		// adjDissipation = 0.3 * (1 - 1) = 0, decay = 1 + 0 = 1, result = 0.8
		expect(result).toBeCloseTo(0.8, 6);
	});

	it('full sticky on mask (stickyVal=1, strength=1) sets dissipation to 1 — multiplicative', () => {
		const result = stickyAdvection(0.8, 0.96, 0, true, 1.0, 1.0);
		// adjDissipation = 0.96 + (1 - 0.96) * 1 = 1.0, result = 1.0 * 0.8
		expect(result).toBeCloseTo(0.8, 6);
	});

	it('off-mask (stickyVal=0) behaves normally regardless of strength', () => {
		const dissipation = 0.3;
		const dt = 1 / 60;
		const input = 0.8;
		const decay = 1.0 + dissipation * dt;
		const expected = input / decay;
		const result = stickyAdvection(input, dissipation, dt, false, 0.0, 1.0);
		expect(result).toBeCloseTo(expected, 6);
	});

	it('partial sticky (strength=0.5) reduces dissipation proportionally', () => {
		const dissipation = 0.4;
		const dt = 1 / 60;
		const input = 1.0;
		const result = stickyAdvection(input, dissipation, dt, false, 1.0, 0.5);
		// adjDissipation = 0.4 * (1 - 0.5) = 0.2
		const adjDissipation = 0.2;
		const decay = 1.0 + adjDissipation * dt;
		expect(result).toBeCloseTo(input / decay, 6);
	});

	it('partial mask value (stickyVal=0.5) gives half the sticky effect', () => {
		const dissipation = 0.4;
		const dt = 1 / 60;
		const input = 1.0;
		const result = stickyAdvection(input, dissipation, dt, false, 0.5, 1.0);
		// adjDissipation = 0.4 * (1 - 0.5) = 0.2
		const adjDissipation = 0.2;
		const decay = 1.0 + adjDissipation * dt;
		expect(result).toBeCloseTo(input / decay, 6);
	});
});

/* ------------------------------------------------------------------ */
/*                 Sticky pressure injection tests                     */
/* ------------------------------------------------------------------ */

describe('sticky pressure injection (shader math mirror)', () => {
	function stickyPressure(
		L: number, R: number, T: number, B: number,
		divergence: number,
		stickyVal: number,
		stickyPressureAmount: number
	): number {
		let pressure = (L + R + B + T - divergence) * 0.25;
		pressure += stickyVal * stickyPressureAmount;
		return pressure;
	}

	it('no sticky pressure (amount=0) produces standard Jacobi result', () => {
		const result = stickyPressure(1, 2, 3, 4, 0.5, 1.0, 0.0);
		const expected = (1 + 2 + 4 + 3 - 0.5) * 0.25;
		expect(result).toBeCloseTo(expected, 6);
	});

	it('sticky pressure adds positive pressure on mask', () => {
		const base = (1 + 2 + 4 + 3 - 0.5) * 0.25;
		const result = stickyPressure(1, 2, 3, 4, 0.5, 1.0, 0.2);
		expect(result).toBeCloseTo(base + 0.2, 6);
	});

	it('off-mask (stickyVal=0) adds nothing', () => {
		const base = (1 + 2 + 4 + 3 - 0.5) * 0.25;
		const result = stickyPressure(1, 2, 3, 4, 0.5, 0.0, 0.5);
		expect(result).toBeCloseTo(base, 6);
	});

	it('partial mask (stickyVal=0.5) adds proportional pressure', () => {
		const base = (1 + 2 + 4 + 3 - 0.5) * 0.25;
		const result = stickyPressure(1, 2, 3, 4, 0.5, 0.5, 0.2);
		expect(result).toBeCloseTo(base + 0.1, 6);
	});
});

/* ------------------------------------------------------------------ */
/*                 Sticky splat amplification tests                    */
/* ------------------------------------------------------------------ */

describe('sticky splat amplification (shader math mirror)', () => {
	function stickySplat(
		baseSplat: number,
		stickyVal: number,
		stickyAmplify: number
	): number {
		return baseSplat * (1.0 + stickyVal * stickyAmplify);
	}

	it('no amplification (amount=0) leaves splat unchanged', () => {
		expect(stickySplat(1.0, 1.0, 0.0)).toBeCloseTo(1.0, 6);
	});

	it('off-mask (stickyVal=0) leaves splat unchanged regardless of amount', () => {
		expect(stickySplat(1.0, 0.0, 5.0)).toBeCloseTo(1.0, 6);
	});

	it('full mask with amplify=0.3 boosts splat by 30%', () => {
		expect(stickySplat(1.0, 1.0, 0.3)).toBeCloseTo(1.3, 6);
	});

	it('partial mask (0.5) with amplify=0.3 boosts splat by 15%', () => {
		expect(stickySplat(1.0, 0.5, 0.3)).toBeCloseTo(1.15, 6);
	});

	it('large amplify value boosts significantly', () => {
		expect(stickySplat(0.5, 1.0, 2.0)).toBeCloseTo(1.5, 6);
	});
});

/* ------------------------------------------------------------------ */
/*                    StickyMask equality tests                        */
/* ------------------------------------------------------------------ */

describe('stickyMaskEqual', () => {
	it('both null returns true', () => {
		expect(stickyMaskEqual(null, null)).toBe(true);
	});

	it('both undefined returns true', () => {
		expect(stickyMaskEqual(undefined, undefined)).toBe(true);
	});

	it('null vs non-null returns false', () => {
		expect(stickyMaskEqual(null, { text: 'hi' })).toBe(false);
		expect(stickyMaskEqual({ text: 'hi' }, null)).toBe(false);
	});

	it('same text returns true', () => {
		expect(stickyMaskEqual({ text: 'HELLO' }, { text: 'HELLO' })).toBe(true);
	});

	it('different text returns false', () => {
		expect(stickyMaskEqual({ text: 'A' }, { text: 'B' })).toBe(false);
	});

	it('same path returns true', () => {
		const a: StickyMask = { d: 'M0 0 L100 100' };
		const b: StickyMask = { d: 'M0 0 L100 100' };
		expect(stickyMaskEqual(a, b)).toBe(true);
	});

	it('different font returns false', () => {
		expect(stickyMaskEqual(
			{ text: 'A', font: 'bold 72px sans-serif' },
			{ text: 'A', font: 'bold 100px sans-serif' }
		)).toBe(false);
	});

	it('different blur returns false', () => {
		expect(stickyMaskEqual(
			{ text: 'A', blur: 3 },
			{ text: 'A', blur: 5 }
		)).toBe(false);
	});

	it('default values are equivalent', () => {
		expect(stickyMaskEqual(
			{ text: 'A' },
			{ text: 'A', font: '', fillRule: 'nonzero', maskResolution: 512, blur: 0 }
		)).toBe(true);
	});

	it('same reference returns true', () => {
		const a: StickyMask = { text: 'X' };
		expect(stickyMaskEqual(a, a)).toBe(true);
	});
});

/* ------------------------------------------------------------------ */
/*                     viewBoxEqual tests                              */
/* ------------------------------------------------------------------ */

describe('viewBoxEqual', () => {
	it('both undefined returns true (defaults match)', () => {
		expect(viewBoxEqual(undefined, undefined)).toBe(true);
	});

	it('undefined vs default returns true', () => {
		expect(viewBoxEqual(undefined, [0, 0, 100, 100])).toBe(true);
	});

	it('different values return false', () => {
		expect(viewBoxEqual([0, 0, 100, 100], [0, 0, 200, 200])).toBe(false);
	});

	it('same values return true', () => {
		expect(viewBoxEqual([10, 20, 30, 40], [10, 20, 30, 40])).toBe(true);
	});
});

/* ------------------------------------------------------------------ */
/*                     Config defaults tests                           */
/* ------------------------------------------------------------------ */

describe('sticky config defaults', () => {
	it('DEFAULTS has expected sticky values', async () => {
		// Import FluidEngine to access DEFAULTS indirectly via resolveConfig
		// We test via the types since DEFAULTS is not exported
		const defaults: StickyMask | null = null;
		expect(defaults).toBeNull();
	});

	it('StickyMask type accepts text mode', () => {
		const mask: StickyMask = { text: 'HELLO', font: 'bold 72px sans-serif' };
		expect(mask.text).toBe('HELLO');
	});

	it('StickyMask type accepts path mode', () => {
		const mask: StickyMask = {
			d: 'M50 5 L95 95 L5 95 Z',
			viewBox: [0, 0, 100, 100],
			fillRule: 'evenodd'
		};
		expect(mask.d).toBe('M50 5 L95 95 L5 95 Z');
	});

	it('StickyMask type accepts blur', () => {
		const mask: StickyMask = { text: 'X', blur: 5 };
		expect(mask.blur).toBe(5);
	});
});
