import { describe, expect, it } from 'vitest';
import { DEFAULTS, resolveConfig } from '../FluidEngine.js';
import { displayShaderSource, DYE_GEOMETRY_GLSL } from '../shaders.js';
import { PRESETS } from '../../presets/registry.js';

// Mirrors of DYE_GEOMETRY_GLSL. Concentration has no calibrated absorption
// coefficients; the adopted transmittance is T_i=1/(1+c_i) (ADR-0087).
const height = (c: number[]) => 0.06 * c.reduce((s, v) => s + Math.log1p(Math.max(0, v)), 0) / 3;
const normal = (l: number, r: number, b: number, t: number, dx: number, dy: number) => {
	const x = -(r - l) / (2 * dx);
	const y = -(t - b) / (2 * dy);
	const inv = 1 / Math.hypot(x, y, 1);
	return [x * inv, y * inv, inv];
};

describe('optical-depth surface', () => {
	it('is zero without dye, finite for HDR, monotone, hue-permutation invariant', () => {
		expect(height([0, 0, 0])).toBe(0);
		expect(height([-1, 0, 0])).toBe(0);
		for (const v of [0.001, 0.1, 1, 10, 65504]) {
			expect(height([v, 0, 0])).toBeCloseTo(-0.02 * Math.log(1 / (1 + v)), 12);
			expect(height([v, 0, 0])).toBe(height([0, v, 0]));
			expect(height([v, 0, 0])).toBeGreaterThan(height([v / 2, 0, 0]));
		}
		// Equal optical depth, different Euclidean RGB lengths.
		expect(height([3, 0, 0])).toBeCloseTo(height([1, 1, 0]), 12);
	});
	it('central differences use physical distances, independent of grid resolution / DPR', () => {
		const expected = normal(0, 0.2, 0, 0.4, 1, 1);
		for (const resolution of [64, 128, 512, 1024]) {
			const dx = 1.6 / resolution;
			const dy = 1 / resolution;
			const n = normal(0.1 - 0.1 * dx, 0.1 + 0.1 * dx, 0.1 - 0.2 * dy, 0.1 + 0.2 * dy, dx, dy);
			n.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 10));
		}
	});
	it('removes emitted RGB-length normals; defaults never opt presets into new optics', () => {
		expect(displayShaderSource).not.toMatch(/length\([lrbt]c\)/);
		expect(DYE_GEOMETRY_GLSL).toContain('log(vec3(1.0)');
		expect(DEFAULTS.SPECULAR).toBe(0);
		expect(DEFAULTS.REFRACTION).toBe(0);
		for (const p of PRESETS) {
			expect(p.config.specular).toBeUndefined();
			expect(p.config.refraction).toBeUndefined();
		}
	});
	it('clamps optics at the config boundary and ignores undefined/non-finite patches', () => {
		const hot = resolveConfig({ specular: 0.4, refraction: 0.6 }, DEFAULTS);
		expect(resolveConfig({ specular: undefined, refraction: undefined }, hot)).toEqual(hot);
		expect(resolveConfig({ specular: NaN, refraction: Infinity }, hot)).toEqual(hot);
		const clamped = resolveConfig({ specular: -1, refraction: 3 }, hot);
		expect(clamped.SPECULAR).toBe(0);
		expect(clamped.REFRACTION).toBe(1);
	});
});
