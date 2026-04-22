import { describe, it, expect } from 'vitest';
import { normalizeColor } from '../rng.js';

/* ------------------------------------------------------------------ */
/*                     Reveal alpha curve math                         */
/* ------------------------------------------------------------------ */

describe('reveal alpha curve (shader math mirror)', () => {
	// Mirror of the GLSL: clamp(pow(clamp(a * sensitivity, 0, 1), curve), 0, 1)
	function revealAmount(a: number, sensitivity: number, curve: number): number {
		return Math.min(1, Math.max(0, Math.pow(Math.min(1, Math.max(0, a * sensitivity)), curve)));
	}

	it('zero dye intensity → zero reveal', () => {
		expect(revealAmount(0, 0.12, 0.1)).toBe(0);
	});

	it('high dye intensity with default params → strong reveal', () => {
		const r = revealAmount(1.0, 0.12, 0.1);
		// pow(0.12, 0.1) ≈ 0.81
		expect(r).toBeGreaterThan(0.7);
		expect(r).toBeLessThan(1.0);
	});

	it('dye above 1/sensitivity clamps to full reveal', () => {
		const r = revealAmount(10.0, 0.12, 0.1);
		// a * sensitivity = 1.2, clamped to 1.0, pow(1.0, 0.1) = 1.0
		expect(r).toBe(1.0);
	});

	it('higher sensitivity reveals more at same dye level', () => {
		const low = revealAmount(0.5, 0.05, 0.1);
		const high = revealAmount(0.5, 0.5, 0.1);
		expect(high).toBeGreaterThan(low);
	});

	it('lower curve creates steeper threshold', () => {
		const steep = revealAmount(0.3, 0.12, 0.05);
		const soft = revealAmount(0.3, 0.12, 0.5);
		expect(steep).toBeGreaterThan(soft);
	});

	it('curve=1 gives linear behavior', () => {
		const r = revealAmount(0.5, 1.0, 1.0);
		expect(r).toBeCloseTo(0.5, 5);
	});

	it('premultiplied output satisfies R,G,B <= A invariant', () => {
		const coverColor = { r: 0.1, g: 0.2, b: 0.3 };
		const r = revealAmount(0.5, 0.12, 0.1);
		const coverAlpha = 1.0 - r;
		expect(coverColor.r * coverAlpha).toBeLessThanOrEqual(coverAlpha);
		expect(coverColor.g * coverAlpha).toBeLessThanOrEqual(coverAlpha);
		expect(coverColor.b * coverAlpha).toBeLessThanOrEqual(coverAlpha);
	});
});

/* ------------------------------------------------------------------ */
/*             Cover color normalization (0-255 → 0-1)                 */
/* ------------------------------------------------------------------ */

describe('revealCoverColor normalization', () => {
	it('normalizes mid-range values', () => {
		const c = normalizeColor({ r: 20, g: 30, b: 60 });
		expect(c.r).toBeCloseTo(0.078, 2);
		expect(c.g).toBeCloseTo(0.118, 2);
		expect(c.b).toBeCloseTo(0.235, 2);
	});

	it('preserves black as zero', () => {
		const c = normalizeColor({ r: 0, g: 0, b: 0 });
		expect(c.r).toBe(0);
		expect(c.g).toBe(0);
		expect(c.b).toBe(0);
	});
});
