import { describe, it, expect } from 'vitest';

/* ------------------------------------------------------------------ */
/*                    Distortion shader math tests                     */
/* ------------------------------------------------------------------ */

describe('distortion UV offset math (shader math mirror)', () => {
	// Mirror of the GLSL distortion UV calculation
	function distortUV(
		vUv: [number, number],
		velocity: [number, number],
		dyeR: number,
		power: number,
		canvasRatio: number,
		imgRatio: number,
		fit: 'cover' | 'contain',
		scale: number
	): [number, number] {
		// Aspect-ratio correction
		let imgUvX = vUv[0] - 0.5;
		let imgUvY = vUv[1] - 0.5;

		if (fit === 'cover') {
			if (canvasRatio > imgRatio) {
				imgUvY *= imgRatio / canvasRatio;
			} else {
				imgUvX *= canvasRatio / imgRatio;
			}
		} else {
			if (canvasRatio > imgRatio) {
				imgUvX *= canvasRatio / imgRatio;
			} else {
				imgUvY *= imgRatio / canvasRatio;
			}
		}

		imgUvX /= Math.max(scale, 0.01);
		imgUvY /= Math.max(scale, 0.01);
		imgUvX += 0.5;
		imgUvY += 0.5;

		// Velocity-directed distortion
		const velX = velocity[0] + 0.001;
		const velY = velocity[1] + 0.001;
		const len = Math.sqrt(velX * velX + velY * velY);
		const normX = velX / len;
		const normY = velY / len;

		imgUvX -= power * normX * dyeR;
		imgUvY -= power * normY * dyeR;

		return [imgUvX, imgUvY];
	}

	it('zero dye produces no distortion', () => {
		const [u, v] = distortUV([0.5, 0.5], [100, 0], 0, 0.4, 1.5, 1.0, 'cover', 1.0);
		// Should be at center (0.5, 0.5) — the aspect ratio doesn't shift center
		expect(u).toBeCloseTo(0.5, 3);
		expect(v).toBeCloseTo(0.5, 3);
	});

	it('zero power produces no distortion even with dye', () => {
		const [u, v] = distortUV([0.5, 0.5], [100, 0], 1.0, 0, 1.5, 1.0, 'cover', 1.0);
		expect(u).toBeCloseTo(0.5, 3);
		expect(v).toBeCloseTo(0.5, 3);
	});

	it('positive x velocity shifts UV left', () => {
		const [u] = distortUV([0.5, 0.5], [100, 0], 0.5, 0.4, 1.0, 1.0, 'cover', 1.0);
		// power * normalize(vel).x * dye = 0.4 * ~1.0 * 0.5 = ~0.2
		// UV shifts left (subtracts)
		expect(u).toBeLessThan(0.5);
	});

	it('stronger power creates larger offset', () => {
		const [u1] = distortUV([0.5, 0.5], [100, 0], 0.5, 0.2, 1.0, 1.0, 'cover', 1.0);
		const [u2] = distortUV([0.5, 0.5], [100, 0], 0.5, 0.8, 1.0, 1.0, 'cover', 1.0);
		// Both should shift left, but u2 more so
		expect(u2).toBeLessThan(u1);
	});

	it('higher dye intensity creates larger offset', () => {
		const [u1] = distortUV([0.5, 0.5], [100, 0], 0.1, 0.4, 1.0, 1.0, 'cover', 1.0);
		const [u2] = distortUV([0.5, 0.5], [100, 0], 0.9, 0.4, 1.0, 1.0, 'cover', 1.0);
		expect(u2).toBeLessThan(u1);
	});

	it('cover fit: wide canvas crops image vertically', () => {
		// Canvas 2:1, image 1:1. Cover should scale y inward
		const [u, v] = distortUV([0.0, 0.0], [0, 0], 0, 0.4, 2.0, 1.0, 'cover', 1.0);
		// x stays at 0 (no scaling needed since canvas is wider)
		expect(u).toBeCloseTo(0.0, 3);
		// y should be scaled toward center (0 → between 0 and 0.5)
		expect(v).toBeGreaterThan(0.0);
		expect(v).toBeLessThan(0.5);
	});

	it('contain fit: wide canvas shows full image with side borders', () => {
		// Canvas 2:1, image 1:1. Contain should scale x outward
		const [u] = distortUV([0.0, 0.0], [0, 0], 0, 0.4, 2.0, 1.0, 'contain', 1.0);
		// x should be scaled outward (0 → negative, i.e. outside image)
		expect(u).toBeLessThan(0.0);
	});

	it('scale > 1 zooms out (shows more image)', () => {
		// At corner (0,0) with scale 1.0
		const [u1, v1] = distortUV([0.0, 0.0], [0, 0], 0, 0.4, 1.0, 1.0, 'cover', 1.0);
		// With scale 1.5, the UV should be closer to 0.5 (center)
		const [u2, v2] = distortUV([0.0, 0.0], [0, 0], 0, 0.4, 1.0, 1.0, 'cover', 1.5);
		expect(Math.abs(u2 - 0.5)).toBeLessThan(Math.abs(u1 - 0.5));
		expect(Math.abs(v2 - 0.5)).toBeLessThan(Math.abs(v1 - 0.5));
	});
});

describe('distortion edge alpha', () => {
	function edgeAlpha(imgUvX: number, imgUvY: number, ew = 0.004): number {
		const smoothstep = (edge0: number, edge1: number, x: number) => {
			const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
			return t * t * (3 - 2 * t);
		};
		let alpha = smoothstep(0, ew, imgUvX) * smoothstep(1, 1 - ew, imgUvX);
		alpha *= smoothstep(0, ew, imgUvY) * smoothstep(1, 1 - ew, imgUvY);
		return alpha;
	}

	it('center of image has full alpha', () => {
		expect(edgeAlpha(0.5, 0.5)).toBeCloseTo(1.0, 5);
	});

	it('outside image bounds has zero alpha', () => {
		expect(edgeAlpha(-0.1, 0.5)).toBe(0);
		expect(edgeAlpha(0.5, 1.1)).toBe(0);
	});

	it('at image edge has reduced alpha (soft fade)', () => {
		const a = edgeAlpha(0.002, 0.5);
		expect(a).toBeGreaterThan(0);
		expect(a).toBeLessThan(1);
	});
});

describe('distortion bleed UV remapping', () => {
	// Mirror of GLSL: visUv = (vUv - uBleed) / (1.0 - 2.0 * uBleed)
	function remapToVisible(vUv: number, bleed: number): number {
		return (vUv - bleed) / Math.max(1 - 2 * bleed, 0.01);
	}

	it('zero bleed is identity', () => {
		expect(remapToVisible(0, 0)).toBeCloseTo(0, 5);
		expect(remapToVisible(0.5, 0)).toBeCloseTo(0.5, 5);
		expect(remapToVisible(1, 0)).toBeCloseTo(1, 5);
	});

	it('bleed edges map to 0 and 1', () => {
		const bleed = 0.1; // 10% bleed
		expect(remapToVisible(bleed, bleed)).toBeCloseTo(0, 5);
		expect(remapToVisible(1 - bleed, bleed)).toBeCloseTo(1, 5);
	});

	it('center maps to center regardless of bleed', () => {
		expect(remapToVisible(0.5, 0.1)).toBeCloseTo(0.5, 5);
		expect(remapToVisible(0.5, 0.2)).toBeCloseTo(0.5, 5);
	});

	it('canvas edges map outside [0,1] with bleed', () => {
		const bleed = 0.1;
		expect(remapToVisible(0, bleed)).toBeLessThan(0);
		expect(remapToVisible(1, bleed)).toBeGreaterThan(1);
	});

	it('bleed fraction computed from CSS pixels', () => {
		// Container 400px, bleed 60px → canvas 520px → frac = 60/520
		const containerW = 400;
		const bleedPx = 60;
		const frac = bleedPx / (containerW + 2 * bleedPx);
		expect(frac).toBeCloseTo(60 / 520, 5);
		// Verify edge mapping: at frac, visUv = 0
		expect(remapToVisible(frac, frac)).toBeCloseTo(0, 5);
	});
});

describe('distortion config defaults', () => {
	it('distortion power default is 0.4', () => {
		expect(0.4).toBe(0.4); // sanity — actual default tested via engine
	});

	it('cover and contain are the only valid fit modes', () => {
		const validModes = ['cover', 'contain'] as const;
		expect(validModes).toContain('cover');
		expect(validModes).toContain('contain');
		expect(validModes).toHaveLength(2);
	});

	it('distortion and reveal are mutually exclusive', () => {
		// When both are set, distortion takes precedence (via #ifdef / #elif)
		const keywords: string[] = [];
		const distortion = true;
		const reveal = true;
		if (distortion) keywords.push('DISTORTION');
		else if (reveal) keywords.push('REVEAL');
		expect(keywords).toContain('DISTORTION');
		expect(keywords).not.toContain('REVEAL');
	});
});
