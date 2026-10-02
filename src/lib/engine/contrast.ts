/**
 * WCAG 2.x relative-luminance maths (ADR-0086). Pure and GL-free: the engine
 * derives the display-shader uniforms here and tests mirror the shader on CPU.
 * Colours are sRGB in 0–1 unless a name says otherwise.
 */
import type { RGB } from './types.js';

export function srgbToLinear(c: number): number {
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(c: number): number {
	return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** WCAG relative luminance of an sRGB 0–1 colour. */
export function relativeLuminance(r: number, g: number, b: number): number {
	return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** WCAG contrast ratio (1–21) between two relative luminances. */
export function contrastRatio(l1: number, l2: number): number {
	const hi = Math.max(l1, l2);
	const lo = Math.min(l1, l2);
	return (hi + 0.05) / (lo + 0.05);
}

/** `q`-quantile (0–1) of `values`, nearest-rank. NaN for an empty list. */
export function percentile(values: ArrayLike<number>, q: number): number {
	if (!values.length) return NaN;
	const s = Array.from(values).sort((a, b) => a - b);
	return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))];
}

export interface ContrastFloor {
	/** +1 raises failing pixels to `lum` (lighter side); -1 lowers them (darker side). */
	dir: 1 | -1;
	/** Relative-luminance bound a failing pixel is moved to. */
	lum: number;
	/** Pixels with luminance <= `lo` already pass on the darker side (-1: side unreachable). */
	lo: number;
	/** Pixels with luminance >= `hi` already pass on the lighter side (2: side unreachable). */
	hi: number;
}

/**
 * Luminance bounds for `minRatio` against a page of luminance `bgLum`. A pixel
 * passes on either side (`<= lo` or `>= hi`); only failing pixels move, toward
 * the preferred side. Preference: lighter when the page is dark enough that
 * darkening cannot (crossover L~0.179). When neither side reaches the ratio,
 * the side with the higher achievable ratio wins (pure white or black).
 */
export function contrastFloor(bgLum: number, minRatio: number): ContrastFloor {
	const hiRaw = (bgLum + 0.05) * minRatio - 0.05;
	const loRaw = (bgLum + 0.05) / minRatio - 0.05;
	const canLight = hiRaw <= 1;
	const canDark = loRaw >= 0;
	const lo = canDark ? loRaw : -1;
	const hi = canLight ? hiRaw : 2;
	if (canDark && (bgLum >= 0.179 || !canLight)) return { dir: -1, lum: loRaw, lo, hi };
	if (canLight) return { dir: 1, lum: hiRaw, lo, hi };
	// Neither side reaches the ratio: take the better extreme.
	return contrastRatio(0, bgLum) > contrastRatio(1, bgLum)
		? { dir: -1, lum: 0, lo: 0, hi: 2 }
		: { dir: 1, lum: 1, lo: -1, hi: 1 };
}

/** Extra ratio so 8-bit quantisation and dither never land the result below the request. */
const MARGIN = 1.03;

/** Uniform values for a 0-255 reference colour: `[dir, lum, lo, hi]`, or off. */
export function contrastFloorFor(minRatio: number, ref: RGB): [number, number, number, number] {
	if (!(minRatio > 1)) return [0, 0, -1, 2];
	const f = contrastFloor(relativeLuminance(ref.r / 255, ref.g / 255, ref.b / 255), Math.min(minRatio * MARGIN, 21));
	return [f.dir, f.lum, f.lo, f.hi];
}

/**
 * CPU mirror of the display shader's contrast-floor step. `lin` is the pixel
 * composited over the page, in linear light. Pixels already passing against
 * the reference (either side) are untouched. Luminance is linear in linear
 * RGB, so both corrections are closed form; lifting brightens first (keeps
 * hue) and mixes toward white only for the remainder.
 */
export function applyContrastFloor(lin: [number, number, number], floor: ContrastFloor): [number, number, number] {
	const lum = (v: number[]) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
	let l = lum(lin);
	if (l <= floor.lo || l >= floor.hi) return lin;
	if (floor.dir > 0) {
		const peak = Math.max(lin[0], lin[1], lin[2]);
		const k = l > 1e-5 && peak > 1e-5 ? Math.min(floor.lum / l, 1 / peak) : 1;
		const v: [number, number, number] = [lin[0] * k, lin[1] * k, lin[2] * k];
		l = lum(v);
		const t = Math.min(1, Math.max(0, (floor.lum - l) / Math.max(1 - l, 1e-4)));
		return [v[0] + (1 - v[0]) * t, v[1] + (1 - v[1]) * t, v[2] + (1 - v[2]) * t];
	}
	const k = floor.lum / l;
	return [lin[0] * k, lin[1] * k, lin[2] * k];
}

/** Outline band width in CSS px (ADR-0086): thin, anti-aliased over one device pixel. */
export const OUTLINE_CSS_PX = 1.5;

/**
 * Halo colour over a page `ref` (0-255): the extreme (white or black, or the
 * grey that just clears `minRatio`) with the higher achievable ratio. Returns
 * display-referred sRGB 0-1, or null when off.
 */
export function outlineColorFor(minRatio: number, ref: RGB): [number, number, number] | null {
	if (!(minRatio > 1)) return null;
	const f = contrastFloor(relativeLuminance(ref.r / 255, ref.g / 255, ref.b / 255), Math.min(minRatio * MARGIN, 21));
	const g = linearToSrgb(Math.min(1, Math.max(0, f.lum)));
	return [g, g, g];
}
