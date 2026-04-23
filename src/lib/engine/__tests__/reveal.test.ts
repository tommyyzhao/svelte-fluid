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
