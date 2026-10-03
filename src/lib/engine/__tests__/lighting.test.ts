import { describe, expect, it } from 'vitest';
import { DEFAULTS, resolveConfig } from '../FluidEngine.js';
import { displayShaderSource, glassShaderSource, splatShader, flowSourceShader, DYE_GEOMETRY_GLSL, DYE_SPLAT_DOSE, DYE_HEIGHT_CEILING } from '../shaders.js';
import { PRESETS } from '../../presets/registry.js';

// Thickness is passively transported, not a calibrated free-surface solve.
const height = (rgba: number[]) => Math.max(0, rgba[3]);
const deposit = (base: number, weight: number, dose = DYE_SPLAT_DOSE) => Math.min(DYE_HEIGHT_CEILING, base + weight * dose);
const normal = (l: number, r: number, b: number, t: number, dx: number, dy: number) => {
	const x = -(r - l) / (2 * dx);
	const y = -(t - b) / (2 * dy);
	const inv = 1 / Math.hypot(x, y, 1);
	return [x * inv, y * inv, inv];
};

describe('independent deposited thickness', () => {
	it('empty is zero; every RGB including black and HDR has the same height', () => {
		expect(height([0, 0, 0, 0])).toBe(0);
		for (const rgb of [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 1], [65504, 0, 0]]) {
			expect(height([...rgb, DYE_SPLAT_DOSE])).toBe(DYE_SPLAT_DOSE);
		}
		expect(height([1, 1, 1, -1])).toBe(0);
	});
	it('deposition adds bounded volume per area; radius controls footprint, not peak', () => {
		const weight = Math.exp(-0.001 / 0.01);
		expect(deposit(deposit(0, weight), weight)).toBeCloseTo(2 * weight * DYE_SPLAT_DOSE);
		expect(deposit(0, 1)).toBe(DYE_SPLAT_DOSE);
		expect(deposit(DYE_HEIGHT_CEILING, 1)).toBe(DYE_HEIGHT_CEILING);
		expect(deposit(0.02, 0)).toBe(0.02);
		// Continuous sources supply rate * dt doses; substeps do not multiply volume.
		expect(deposit(0, 1, DYE_SPLAT_DOSE * 10 / 60)).toBeCloseTo(
			deposit(deposit(0, 1, DYE_SPLAT_DOSE * 10 / 120), 1, DYE_SPLAT_DOSE * 10 / 120)
		);
		expect(splatShader).toContain('base.a + weight * uDose');
		expect(flowSourceShader).toContain('dose += amount * uDose[i]');
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
		expect(displayShaderSource).not.toContain('10000.0 * dot(n.xy');
		expect(displayShaderSource).toContain('0.7 + 0.3 * max(dot(n, normalize(vec3(-0.35, 0.45, 1.0))), 0.0)');
		expect(DYE_GEOMETRY_GLSL).not.toMatch(/log\(|concentration|\.rgb/);
		expect(DYE_GEOMETRY_GLSL).toContain('float dyeHeight (float thickness)');
		expect(displayShaderSource).toContain('dyeHeight(dye.a)');
		expect(glassShaderSource).toContain('dyeHeight(texture2D(uHeightTexture, uv).a)');
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
