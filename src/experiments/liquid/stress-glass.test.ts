import { describe, expect, it } from 'vitest';
import { GLASS_CONTACT_HALF_ANGLE, glassStressDifference } from './stress-glass.js';

describe('finite arc compression, Hung & Ma Eq. 23', () => {
	it('has reflection symmetry and a linear pressure/fringe-order relationship', () => {
		for (const [x, y] of [[0, 0], [0.2, 0.3], [0.6, 0.5], [0.02, 0.98]]) {
			const value = glassStressDifference(x, y, 0.4);
			expect(glassStressDifference(-x, y, 0.4)).toBeCloseTo(value, 10);
			expect(glassStressDifference(x, -y, 0.4)).toBeCloseTo(value, 10);
			expect(glassStressDifference(x, y, 0.8)).toBeCloseTo(value * 2, 10);
			expect(glassStressDifference(x, y, 0)).toBe(0);
		}
	});
	it('matches the closed-form center and concentrated-load limit', () => {
		expect(glassStressDifference(0, 0, 1)).toBeCloseTo(4 / Math.PI * Math.sin(2 * GLASS_CONTACT_HALF_ANGLE), 12);
		// Vertical force F=2*p*R*t*sin(alpha), with F=R=t=1.
		const alpha = 0.0001, pressure = 1 / (2 * Math.sin(alpha));
		expect(glassStressDifference(0, 0, pressure, alpha)).toBeCloseTo(4 / Math.PI, 7);
		// Uniform radial pressure on the entire rim is hydrostatic in plane.
		expect(glassStressDifference(0.23, 0.46, 1, Math.PI / 2)).toBeLessThan(1e-12);
	});
	it('agrees with independent integration of rotated diametric point-load stresses', () => {
		// Integrate p*R*dtheta force per radial load pair, with p=R=t=1.
		// This checks the finite-arc normalization and geometry, not just a
		// second transcription of the same principal-gap formula.
		for (const [x, y] of [[0, 0], [0.24, 0.31], [0.08, 0.85]]) {
			let xx = 0, yy = 0, xy = 0; const count = 2048, dtheta = 2 * GLASS_CONTACT_HALF_ANGLE / count;
			for (let i = 0; i < count; i++) {
				const theta = (i + 0.5) * dtheta - GLASS_CONTACT_HALF_ANGLE, c = Math.cos(theta), s = Math.sin(theta);
				const u = c * x + s * y, v = -s * x + c * y;
				const top = (u * u + (1 - v) ** 2) ** 2, bottom = (u * u + (1 + v) ** 2) ** 2, factor = 2 * dtheta / Math.PI;
				const a = factor * (0.5 - u * u * ((1 - v) / top + (1 + v) / bottom));
				const b = factor * (0.5 - (1 - v) ** 3 / top - (1 + v) ** 3 / bottom);
				const shear = factor * u * ((1 - v) ** 2 / top - (1 + v) ** 2 / bottom);
				xx += c * c * a + s * s * b - 2 * c * s * shear;
				yy += s * s * a + c * c * b + 2 * c * s * shear;
				xy += c * s * (a - b) + (c * c - s * s) * shear;
			}
			expect(glassStressDifference(x, y, 1)).toBeCloseTo(Math.hypot(xx - yy, 2 * xy), 6);
		}
	});
	it('remains finite at finite-contact boundaries without point-load spikes', () => {
		for (let i = 0; i <= 1000; i++) {
			const theta = i / 1000 * Math.PI * 2;
			const value = glassStressDifference(Math.sin(theta), Math.cos(theta), 1);
			expect(Number.isFinite(value)).toBe(true); expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThan(1.001);
		}
		expect(() => glassStressDifference(0, 0, -1)).toThrow();
	});
});
