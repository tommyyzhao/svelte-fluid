/*
 * FoilSwitch palettes and the metal contrast budget (ADR-0096). Pure: the
 * shader mirrors clampMetal, and the Node test proves the arch keeps ≥3:1
 * against the page (WCAG 1.4.11) whatever light the studio throws at it.
 */
import { contrastFloor, contrastRatio, relativeLuminance } from '../contrast.js';
import type { RGB } from '../types.js';

export type FoilTone = 'light' | 'dark';

export interface FoilLook {
	/** Page colour the tone is designed for (sRGB hex); the live budget uses the measured page. */
	page: string;
	/** Vector fallback stroke (no WebGL2). Forced colors use system colours instead. */
	metal: string;
	/** Keyboard focus ring; ≥3:1 against `page`. */
	ring: string;
	/** Studio radiance scale before the R&D tone map (1 − e^−x). */
	exposure: number;
}

// Pages, glyph and ring colours are the R&D library route's (/lab/interfaces/library).
export const FOIL_LOOKS: Record<FoilTone, FoilLook> = {
	light: { page: '#f7f7f2', metal: '#74776d', ring: '#345994', exposure: 1 },
	dark: { page: '#191b18', metal: '#c8ccbd', ring: '#a4bce6', exposure: 1 }
};

/** Mount pads, display-referred sRGB, exactly the R&D colour. */
export const FOIL_PAD: [number, number, number] = [0.2, 0.155, 0.16];

/** WCAG 1.4.11 non-text contrast: the arch shape is the state. */
export const METAL_MIN_CONTRAST = 3;
/** Headroom for 8-bit encode plus ±1 LSB dither. */
export const METAL_MARGIN = 1.05;
/** Darkening starts at this fraction of the bound, so highlights roll off instead of flattening. */
export const METAL_KNEE = 0.3;

export interface MetalBand {
	/** -1: metal luminance is capped from above (light page); +1: lifted from below (dark page). */
	dir: 1 | -1;
	/** Relative-luminance bound (linear). */
	bound: number;
}

/** Luminance bound that keeps metal ≥ METAL_MIN_CONTRAST·METAL_MARGIN from `page` (0-255). */
export function metalBand(page: RGB): MetalBand {
	const f = contrastFloor(relativeLuminance(page.r / 255, page.g / 255, page.b / 255), METAL_MIN_CONTRAST * METAL_MARGIN);
	return { dir: f.dir, bound: Math.min(1, Math.max(0, f.lum)) };
}

const lum = (c: [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/**
 * CPU mirror of the shader's clampMetal (linear RGB in and out). Capping keeps
 * hue and rolls off softly above METAL_KNEE·bound, so the Fresnel and strip
 * gradients survive; lifting mixes toward white just enough.
 */
export function clampMetal(lin: [number, number, number], band: MetalBand): [number, number, number] {
	const l = lum(lin);
	if (band.dir < 0) {
		const knee = METAL_KNEE * band.bound;
		if (l <= knee) return lin;
		const span = band.bound - knee;
		const target = knee + span * (1 - Math.exp(-(l - knee) / span));
		return lin.map((v) => (v * target) / l) as [number, number, number];
	}
	if (l >= band.bound) return lin;
	const t = Math.min(1, Math.max(0, (band.bound - l) / Math.max(1 - l, 1e-4)));
	return lin.map((v) => v + (1 - v) * t) as [number, number, number];
}

/** Worst WCAG ratio of a clamped linear colour against `page` (0-255), with ±2/255 sRGB error. */
export function metalContrast(lin: [number, number, number], page: RGB): number {
	const encode = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
	const srgb = lin.map(encode);
	const pageLum = relativeLuminance(page.r / 255, page.g / 255, page.b / 255);
	let worst = Infinity;
	for (const e of [-2 / 255, 2 / 255]) {
		const c = srgb.map((v) => Math.min(1, Math.max(0, v + e))) as [number, number, number];
		worst = Math.min(worst, contrastRatio(relativeLuminance(...c), pageLum));
	}
	return worst;
}

export function hexToRgb(hex: string): RGB {
	const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
	return { r, g, b };
}
