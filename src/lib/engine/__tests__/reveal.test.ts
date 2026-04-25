import { describe, it, expect } from 'vitest';

/* ------------------------------------------------------------------ */
/*                     Reveal alpha curve math                         */
/* ------------------------------------------------------------------ */

describe('reveal alpha curve (shader math mirror)', () => {
	// Mirror of the GLSL: clamp(pow(clamp(a * sensitivity, 0, 1), curve), 0, 1)
	function revealAmount(a: number, sensitivity: number, curve: number): number {
		return Math.min(1, Math.max(0, Math.pow(Math.min(1, Math.max(0, a * sensitivity)), curve)));
	}

	it('zero dye intensity → zero reveal', () => {
		expect(revealAmount(0, 0.1, 0.1)).toBe(0);
	});

	it('high dye intensity with default params → strong reveal', () => {
		const r = revealAmount(1.0, 0.1, 0.1);
		// pow(0.1, 0.1) ≈ 0.79
		expect(r).toBeGreaterThan(0.7);
		expect(r).toBeLessThan(1.0);
	});

	it('dye above 1/sensitivity clamps to full reveal', () => {
		const r = revealAmount(10.0, 0.1, 0.1);
		// a * sensitivity = 1.0, pow(1.0, 0.1) = 1.0
		expect(r).toBe(1.0);
	});

	it('higher sensitivity reveals more at same dye level', () => {
		const low = revealAmount(0.5, 0.05, 0.1);
		const high = revealAmount(0.5, 0.5, 0.1);
		expect(high).toBeGreaterThan(low);
	});

	it('lower curve creates steeper threshold', () => {
		const steep = revealAmount(0.3, 0.1, 0.05);
		const soft = revealAmount(0.3, 0.1, 0.5);
		expect(steep).toBeGreaterThan(soft);
	});

	it('curve=1 gives linear behavior', () => {
		const r = revealAmount(0.5, 1.0, 1.0);
		expect(r).toBeCloseTo(0.5, 5);
	});

	it('display output uses inverted dye color for iridescent fringe', () => {
		// GLSL: gl_FragColor = vec4(1.0 - c, alpha)
		// At the fringe, low dye → inverted color is near-white
		const dyeR = 0.1, dyeG = 0.08, dyeB = 0.05;
		expect(1.0 - dyeR).toBeCloseTo(0.9, 5);
		expect(1.0 - dyeG).toBeCloseTo(0.92, 5);
		expect(1.0 - dyeB).toBeCloseTo(0.95, 5);
		// Different channels → color variation (blue-ish tint) = iridescence
		expect(1.0 - dyeB).toBeGreaterThan(1.0 - dyeR);
	});

	it('non-uniform dye creates channel separation at edges', () => {
		// Reference-matching dye: { r: 0.95, g: 0.84, b: 0.68 }
		// Inverted fringe color should be blue-ish (B > G > R)
		const dye = { r: 0.95, g: 0.84, b: 0.68 };
		const fringe = { r: 1 - dye.r, g: 1 - dye.g, b: 1 - dye.b };
		expect(fringe.b).toBeGreaterThan(fringe.g);
		expect(fringe.g).toBeGreaterThan(fringe.r);
	});
});

/* ------------------------------------------------------------------ */
/*                 Reveal dye color computation                        */
/* ------------------------------------------------------------------ */

describe('revealDye computation (FluidReveal pointer splat color)', () => {
	const FLOOR = 0.15;

	/**
	 * Mirrors FluidReveal.svelte's revealDye $derived computation.
	 * Ensures nonzero dye intensity for all cover/accent combinations.
	 */
	function computeRevealDye(
		cover: { r: number; g: number; b: number },
		accent: { r: number; g: number; b: number }
	) {
		const dr = cover.r - accent.r;
		const dg = cover.g - accent.g;
		const db = cover.b - accent.b;
		const allNegative = dr <= 0 && dg <= 0 && db <= 0;
		return {
			r: Math.max(FLOOR, Math.min(1, allNegative ? -dr : Math.max(0, dr))),
			g: Math.max(FLOOR, Math.min(1, allNegative ? -dg : Math.max(0, dg))),
			b: Math.max(FLOOR, Math.min(1, allNegative ? -db : Math.max(0, db)))
		};
	}

	it('white cover + dark accent → positive dye (standard case)', () => {
		const dye = computeRevealDye({ r: 1, g: 1, b: 1 }, { r: 0.05, g: 0.16, b: 0.32 });
		expect(dye.r).toBeCloseTo(0.95, 2);
		expect(dye.g).toBeCloseTo(0.84, 2);
		expect(dye.b).toBeCloseTo(0.68, 2);
	});

	it('dark cover + bright accent → uses absolute difference (was all-zero bug)', () => {
		// Permanent reveal: cover=(0.16,0.16,0.18), accent=(0.78,0.66,0.39)
		const dye = computeRevealDye({ r: 0.16, g: 0.16, b: 0.18 }, { r: 0.78, g: 0.66, b: 0.39 });
		// Should be |cover - accent| = (0.62, 0.50, 0.21)
		expect(dye.r).toBeCloseTo(0.62, 2);
		expect(dye.g).toBeCloseTo(0.50, 2);
		expect(dye.b).toBeCloseTo(0.21, 2);
		// Must have nonzero intensity for reveal to work
		expect(Math.max(dye.r, dye.g, dye.b)).toBeGreaterThan(0);
	});

	it('identical cover and accent → floor ensures nonzero intensity', () => {
		const dye = computeRevealDye({ r: 0.5, g: 0.5, b: 0.5 }, { r: 0.5, g: 0.5, b: 0.5 });
		expect(dye.r).toBe(FLOOR);
		expect(dye.g).toBe(FLOOR);
		expect(dye.b).toBe(FLOOR);
	});

	it('black cover + black accent → floor ensures nonzero intensity', () => {
		const dye = computeRevealDye({ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 });
		expect(Math.max(dye.r, dye.g, dye.b)).toBe(FLOOR);
	});

	it('mixed positive/negative channels → clamps negatives to 0, keeps positives', () => {
		// cover.r > accent.r, but cover.g < accent.g
		const dye = computeRevealDye({ r: 0.8, g: 0.1, b: 0.5 }, { r: 0.2, g: 0.9, b: 0.5 });
		// Not all-negative (r channel is positive), so standard path
		expect(dye.r).toBeCloseTo(0.6, 2);
		expect(dye.g).toBe(FLOOR); // max(0.15, max(0, -0.8)) = 0.15
		expect(dye.b).toBe(FLOOR); // max(0.15, max(0, 0)) = 0.15
	});
});
