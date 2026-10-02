/*
 * Enamel studio lighting and the glyph contrast budget (ADR-0097). Pure: the
 * composite shader evaluates the same compression, and the Node test proves
 * every shaded glyph pixel keeps WCAG contrast against the page.
 */
import { contrastRatio, relativeLuminance, srgbToLinear } from '../contrast.js';
import type { RGB } from '../types.js';

export type EnamelTone = 'light' | 'dark';

export interface EnamelLook {
	/** Diffuse floor on slopes facing away from the key (flat = 1). */
	ambient: number;
	/** Reflected room: floor and ceiling radiance, linear RGB. */
	envLow: [number, number, number];
	envHigh: [number, number, number];
	/** Soft-box radiance, linear (HDR). Broad: a satin glaze, never pixel glints. */
	key: number;
	/** Soft-box angular width (σ in reflected-direction xy). */
	width: number;
	/** Concave-corner occlusion strength (0–1) on diffuse and reflection. */
	occlusion: number;
	/** Rim radiance on light-facing edges, linear (HDR before tone map). */
	rim: number;
}

export const LOOKS: Record<EnamelTone, EnamelLook> = {
	light: { ambient: 0.1, envLow: [0.12, 0.13, 0.15], envHigh: [0.9, 0.92, 0.96], key: 4.5, width: 0.5, occlusion: 0.6, rim: 0.32 },
	dark: { ambient: 0.12, envLow: [0.004, 0.005, 0.008], envHigh: [0.14, 0.15, 0.19], key: 5, width: 0.5, occlusion: 0.6, rim: 0.9 }
};

/** Key light direction: upper left, toward the viewer (x right, y up). */
export const KEY_DIRECTION: [number, number, number] = (() => {
	const v = [-0.55, 0.7, 0.75];
	const l = Math.hypot(...v);
	return v.map((c) => c / l) as [number, number, number];
})();

/** WCAG large text: ≥ 24 CSS px, or bold (≥ 700) at ≥ 18.66 CSS px (14 pt). */
export function isLargeText(fontPx: number, weight: number): boolean {
	return fontPx >= 24 || (weight >= 700 && fontPx >= 18.66);
}

/** AA ratio for the computed font: 3 for large text, 4.5 otherwise. */
export function minContrastFor(fontPx: number, weight: number): number {
	return isLargeText(fontPx, weight) ? 3 : 4.5;
}

/** Headroom so 8-bit encode plus ±1 LSB dither never lands below the floor. */
export const GLYPH_MARGIN = 1.05;

export interface GlyphBand {
	/** -1: glyph darker than the page (luminance ≤ hi); +1: lighter (≥ lo). */
	side: -1 | 1;
	lo: number;
	hi: number;
	/** Soft-knee width (relative luminance) of the compression toward the bound. */
	knee: number;
}

/**
 * Relative-luminance band every glyph pixel must stay in for `min`:1 against
 * `page` (0–255). The glyph keeps the side its body colour is on when that
 * side can reach the ratio; otherwise it moves to the side that can. When
 * neither can, the band collapses to the better extreme (black or white).
 */
export function glyphBand(body: RGB, page: RGB, min: number): GlyphBand {
	const lp = relativeLuminance(page.r / 255, page.g / 255, page.b / 255);
	const lt = relativeLuminance(body.r / 255, body.g / 255, body.b / 255);
	const r = Math.min(21, min * GLYPH_MARGIN);
	const hi = (lp + 0.05) / r - 0.05;
	const lo = (lp + 0.05) * r - 0.05;
	const dark = hi >= 0;
	const light = lo <= 1;
	const darkBand = (h: number): GlyphBand => ({ side: -1, lo: 0, hi: h, knee: 0.12 * Math.max(h, 0.02) });
	const lightBand = (l: number): GlyphBand => ({ side: 1, lo: l, hi: 1, knee: 0.12 * Math.max(1 - l, 0.02) });
	if (dark && (lt <= lp || !light)) return darkBand(hi);
	if (light) return lightBand(lo);
	return contrastRatio(0, lp) >= contrastRatio(1, lp) ? darkBand(0) : lightBand(1);
}

const softplus = (x: number) => (x > 30 ? x : Math.log1p(Math.exp(x)));

/**
 * Smooth, monotone map of a shaded luminance into the band: identity well
 * inside it, a soft knee into the bound (mirror: compressLum in shaders.ts).
 * A hard clamp would flatten highlights into clipped plateaus.
 */
export function compressLuminance(l: number, band: GlyphBand): number {
	const k = band.knee;
	if (band.side < 0) return Math.min(band.hi, Math.max(0, band.hi - k * softplus((band.hi - l) / k)));
	return Math.max(band.lo, Math.min(1, band.lo + k * softplus((l - band.lo) / k)));
}

/**
 * CPU mirror of the shader's final colour step: scale to the compressed
 * luminance (keeps hue); lifting past a channel's peak mixes toward white.
 * Linear RGB in, linear RGB out (0–1).
 */
export function clampGlyph(lin: [number, number, number], band: GlyphBand): [number, number, number] {
	const lum = (v: number[]) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
	const c = lin.map((v) => Math.max(0, v)) as [number, number, number];
	const l = lum(c);
	const target = compressLuminance(l, band);
	if (l < 1e-6) return [target, target, target];
	const peak = Math.max(...c);
	const k = Math.min(target / l, 1 / peak);
	const v = c.map((x) => x * k);
	const t = Math.min(1, Math.max(0, (target - lum(v)) / Math.max(1 - lum(v), 1e-6)));
	return v.map((x) => Math.min(1, x + (1 - x) * t)) as [number, number, number];
}

/** Linear-light body colour for the shader from 0–255 sRGB. */
export function bodyLinear(c: RGB): [number, number, number] {
	return [srgbToLinear(c.r / 255), srgbToLinear(c.g / 255), srgbToLinear(c.b / 255)];
}
