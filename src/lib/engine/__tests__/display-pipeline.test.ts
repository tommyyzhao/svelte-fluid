import { describe, expect, it } from 'vitest';
import { DEFAULTS, FluidEngine, resolveConfig } from '../FluidEngine.js';
import { displayShaderSource, bloomDownShader, bloomUpShader, bloomPrefilterShader } from '../shaders.js';
import { GAS_FLARE_CONFIG, LAVA_LAMP_CONFIG, PRESETS } from '../../presets/registry.js';
import type { FluidConfig, ResolvedConfig } from '../types.js';

// Pure TS mirrors of SRGB_TRANSFER_GLSL / TONE_MAP_GLSL (ADR-0081).
const decode = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const encode = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
function dyeToLinear(rgb: number[]): number[] {
	const c = rgb.map((v) => Math.max(v, 0));
	const peak = Math.max(1, ...c);
	return c.map((v) => decode(Math.min(v, 1)) * peak);
}
// Khronos PBR Neutral shoulder (exact constants), without its PBR toe offset.
function neutral(rgb: number[]): number[] {
	const peak = Math.max(...rgb);
	if (peak < 0.76) return rgb;
	const newPeak = 1 - 0.24 ** 2 / (peak + 0.24 - 0.76);
	const g = 1 - 1 / (0.15 * (peak - newPeak) + 1);
	return rgb.map((v) => ((v * newPeak) / peak) * (1 - g) + newPeak * g);
}
function agx(rgb: number[]): number[] {
	const inset = [
		[0.842479062253094, 0.0784335999999992, 0.0792237451477643],
		[0.0423282422610123, 0.878468636469772, 0.0791661274605434],
		[0.0423756549057051, 0.0784336, 0.879142973793104]
	];
	const outset = [
		[1.19687900512017, -0.0980208811401368, -0.0990297440797205],
		[-0.0528968517574562, 1.15190312990417, -0.0989611768448433],
		[-0.0529716355144438, -0.0980434501171241, 1.15107367264116]
	];
	const mul = (m: number[][], v: number[]) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
	const [lo, hi] = [-12.47393, 4.026069];
	const v = mul(inset, rgb.map((x) => Math.max(x, 1e-10))).map((x) => {
		const t = (Math.min(Math.max(Math.log2(x), lo), hi) - lo) / (hi - lo);
		return 15.5 * t ** 6 - 40.14 * t ** 5 + 31.96 * t ** 4 - 6.868 * t ** 3 + 0.4298 * t ** 2 + 0.1191 * t - 0.00232;
	});
	return mul(outset, v).map((x) => Math.min(Math.max(x, 0), 1) ** 2.2);
}

describe('linear display pipeline', () => {
	it('round-trips in-range sRGB unchanged through decode → Neutral → encode', () => {
		for (const v of [0, 0.001, 0.04045, 0.18, 0.5, 1]) expect(encode(decode(v))).toBeCloseTo(v, 7);
		// Below the 0.76 linear shoulder (≈0.89 sRGB) authored colours are identity.
		for (const rgb of [[0.1, 0.2, 0.4], [0.85, 0.3, 0.05], [0.02, 0.02, 0.03]]) {
			const out = neutral(dyeToLinear(rgb)).map(encode);
			out.forEach((v, i) => expect(v).toBeCloseTo(rgb[i], 6));
		}
	});
	it('rolls HDR highlights off below white, finite, with 0.8.0 HDR hue', () => {
		for (const rgb of [[2, 0.5, 0.1], [10, 8, 4], [1e4, 0, 0], [0.9, 0.9, 0.9]]) {
			for (const map of [neutral, agx]) {
				for (const v of map(dyeToLinear(rgb))) {
					expect(Number.isFinite(v)).toBe(true);
					expect(v).toBeGreaterThanOrEqual(0);
					expect(v).toBeLessThanOrEqual(1);
				}
			}
		}
		// HDR dye keeps the hue 0.8.0 displayed (per-channel clip) and scales
		// linear energy by its peak so the tone map has highlights to roll off.
		const hdr = dyeToLinear([2, 1, 0.5]);
		expect(hdr[0]).toBe(2);
		expect(hdr[1] / hdr[2]).toBeCloseTo(1 / decode(0.5), 9);
		expect(Math.max(...neutral([4, 1, 0.3]))).toBeLessThan(1);
		// Monotone shoulder.
		expect(neutral([3, 0, 0])[0]).toBeGreaterThan(neutral([2, 0, 0])[0]);
	});
	it('ships the mirrored GLSL', () => {
		for (const text of ['desaturation = 0.15', 'startCompression = 0.76', 'vec3(2.2)', '-12.47393', '4.026069', 'step(vec3(0.04045), c)', 'step(vec3(0.0031308), c)'])
			expect(displayShaderSource).toContain(text);
		expect(displayShaderSource).not.toContain('6.25 * x * x');
		expect(displayShaderSource).not.toContain('linearToGamma');
		expect(displayShaderSource).toContain('clamp(color + ditherNoise(), 0.0, 1.0) * alpha');
		expect(displayShaderSource).toContain('display = clamp(display + ditherNoise() * outAlpha, 0.0, outAlpha)');
	});
	it('uses max-channel prefilter, first-down Karis and normalized Kawase kernels', () => {
		expect(bloomPrefilterShader).toContain('float br = max(c.r, max(c.g, c.b));');
		expect(bloomDownShader.match(/texture2D\(/g)).toHaveLength(5);
		expect(bloomDownShader).toContain('1.0 / (1.0 + dot');
		expect(bloomUpShader.match(/texture2D\(/g)).toHaveLength(8);
		expect(bloomUpShader).toContain('intensity / 12.0');
	});
	it('validates toneMapping, preserves undefined hot values, emits display keywords', () => {
		expect(DEFAULTS.TONE_MAPPING).toBe('neutral');
		const hot = resolveConfig({ toneMapping: 'agx' }, DEFAULTS);
		expect(resolveConfig({ toneMapping: undefined }, hot).TONE_MAPPING).toBe('agx');
		expect(resolveConfig({ toneMapping: 'bad' } as unknown as FluidConfig, hot).TONE_MAPPING).toBe('agx');
		const harness = FluidEngine.prototype as unknown as {
			displayKeywords(config: ResolvedConfig): string[];
		};
		expect(harness.displayKeywords(hot)).toContain('TONE_MAP_AGX');
		expect(harness.displayKeywords(resolveConfig({ toneMapping: 'none' }, DEFAULTS))).toContain('TONE_MAP_NONE');
		expect(harness.displayKeywords(DEFAULTS)).not.toContain('TONE_MAP_AGX');
		expect(harness.displayKeywords(DEFAULTS)).not.toContain('TONE_MAP_NONE');
	});
	it('pins the ADR-0081 preset retunes', () => {
		expect(GAS_FLARE_CONFIG).toMatchObject({ toneMapping: 'none', bloomThreshold: 0.3, bloomIntensity: 1.2 });
		expect(LAVA_LAMP_CONFIG.toneMapping).toBe('none');
		const opted = PRESETS.filter((p) => p.config.toneMapping !== undefined).map((p) => p.id).sort();
		expect(opted).toEqual(['GasFlare', 'LavaLamp']);
	});
});
