/*
 * Liquid-control palettes and the label contrast budget (ADR-0091). Pure: the
 * components style their fallback from the same colours the shader lights, and
 * the Node test proves the budget keeps label text at WCAG AA.
 */
import { contrastRatio, relativeLuminance, srgbToLinear } from '../contrast.js';

export type SurfaceTone = 'light' | 'dark';
export type SurfaceControl = 'button' | 'segmented' | 'dropzone' | 'overlay';

export interface SurfaceLook {
	/** Control background (sRGB hex). */
	fill: string;
	/** Second fill stop, bottom of the control. */
	fillLow: string;
	/** Label colour drawn by the DOM above the canvas. */
	text: string;
	/** Focus ring; ≥ 3:1 against the page it sits on. */
	ring: string;
	/** Page colour the tone is designed for (ring contrast). */
	page: string;
	/** Studio room gradient, linear RGB, reflected at grazing slopes. */
	envLow: [number, number, number];
	envHigh: [number, number, number];
	/** Key, rim strip and floor bounce area-light radiance (linear, HDR). */
	lights: [number, number, number];
	/** Caustic gain; light tones darken (a shaded net), dark tones add light. */
	caustic: number;
	/** Beer–Lambert σ per CSS px of liquid path, linear RGB. */
	absorb: [number, number, number];
	/** In-volume scatter colour the liquid tends to as it deepens (linear). */
	scatter: [number, number, number];
}

/** WCAG AA for body text. */
export const LABEL_MIN_CONTRAST = 4.5;
/** Headroom so 8-bit encode plus ±1 LSB dither never lands below the floor, even near black. */
export const LABEL_MARGIN = 1.05;

export const LOOKS: Record<Exclude<SurfaceControl, 'overlay'>, Record<SurfaceTone, SurfaceLook>> = {
	button: {
		light: {
			fill: '#2a4fc6',
			fillLow: '#2242ad',
			text: '#ffffff',
			ring: '#1f3f9e',
			page: '#f2f0eb',
			envLow: [0.02, 0.025, 0.05],
			envHigh: [0.12, 0.14, 0.2],
			lights: [5.5, 3.5, 0.8],
			caustic: 0.55,
			absorb: [0.05, 0.03, 0.006],
			scatter: [0.01, 0.02, 0.09]
		},
		dark: {
			fill: '#2b4fc4',
			fillLow: '#2343ab',
			text: '#ffffff',
			ring: '#8fb0ff',
			page: '#0b0d12',
			envLow: [0.004, 0.006, 0.012],
			envHigh: [0.05, 0.06, 0.09],
			lights: [6, 4, 0.8],
			caustic: 0.6,
			absorb: [0.05, 0.03, 0.006],
			scatter: [0.01, 0.02, 0.09]
		}
	},
	segmented: {
		light: {
			fill: '#e8e5de',
			fillLow: '#e2dfd7',
			text: '#1a1c21',
			ring: '#1f3f9e',
			page: '#f2f0eb',
			envLow: [0.55, 0.57, 0.6],
			envHigh: [0.86, 0.88, 0.92],
			lights: [3, 2.2, 0.5],
			caustic: 0.3,
			absorb: [0.09, 0.06, 0.02],
			scatter: [0.42, 0.5, 0.72]
		},
		dark: {
			fill: '#151a26',
			fillLow: '#121620',
			text: '#e9edf4',
			ring: '#8fb0ff',
			page: '#0b0d12',
			envLow: [0.003, 0.004, 0.008],
			envHigh: [0.03, 0.035, 0.05],
			lights: [5, 3.5, 0.6],
			caustic: 0.6,
			absorb: [0.09, 0.06, 0.02],
			scatter: [0.03, 0.05, 0.12]
		}
	},
	// Drop zone (ADR-0094): a shallow tray on the page; the segmented studio, a quieter fill.
	dropzone: {
		light: {
			fill: '#e6e3db',
			fillLow: '#dedad1',
			text: '#33363d',
			ring: '#1f3f9e',
			page: '#f2f0eb',
			envLow: [0.55, 0.57, 0.6],
			envHigh: [0.86, 0.88, 0.92],
			lights: [3, 2.2, 0.5],
			caustic: 0.35,
			absorb: [0.09, 0.06, 0.02],
			scatter: [0.42, 0.5, 0.72]
		},
		dark: {
			fill: '#141925',
			fillLow: '#10141e',
			text: '#d7dce6',
			ring: '#8fb0ff',
			page: '#0b0d12',
			envLow: [0.003, 0.004, 0.008],
			envHigh: [0.03, 0.035, 0.05],
			lights: [5, 3.5, 0.6],
			caustic: 0.7,
			absorb: [0.09, 0.06, 0.02],
			scatter: [0.03, 0.05, 0.12]
		}
	}
};

export function hexToSrgb(hex: string): [number, number, number] {
	return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

export function hexToLinear(hex: string): [number, number, number] {
	return hexToSrgb(hex).map(srgbToLinear) as [number, number, number];
}

const luminanceOf = (hex: string) => relativeLuminance(...hexToSrgb(hex));

export interface LabelBand {
	/** Background relative-luminance band under a label: [lo, hi]. */
	lo: number;
	hi: number;
	/** Linear light that may be added to the base fill before `hi` (the light budget). */
	addBudget: number;
}

/**
 * Relative-luminance band the background under `text` must stay inside for
 * `min`·LABEL_MARGIN contrast. Light text bounds the background from above
 * (added light is what can fail), dark text from below (shade is).
 */
export function labelBand(text: string, fill: string, min = LABEL_MIN_CONTRAST): LabelBand {
	const lt = luminanceOf(text);
	const lf = luminanceOf(fill);
	const r = min * LABEL_MARGIN;
	const band = lt > lf ? { lo: 0, hi: Math.min(1, (lt + 0.05) / r - 0.05) } : { lo: Math.max(0, (lt + 0.05) * r - 0.05), hi: 1 };
	return { ...band, addBudget: band.hi - lf };
}

/**
 * CPU mirror of the composite shader's label clamp: scale down to `hi` (keeps
 * hue), lift by grey to `lo`. Linear RGB in, linear RGB out.
 */
export function clampToBand(lin: [number, number, number], band: LabelBand): [number, number, number] {
	const l = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
	if (l > band.hi) return lin.map((v) => (v * band.hi) / l) as [number, number, number];
	if (l < band.lo) return lin.map((v) => v + band.lo - l) as [number, number, number];
	return lin;
}

/** WCAG ratio between two hex colours. */
export function hexContrast(a: string, b: string): number {
	return contrastRatio(luminanceOf(a), luminanceOf(b));
}

/** Palette for a control kind. The overlay has no fill; it reuses the segmented studio. */
export function lookFor(control: SurfaceControl, tone: SurfaceTone): SurfaceLook {
	return LOOKS[control === 'overlay' ? 'segmented' : control][tone];
}

/** sRGB 0–1 triple. */
export type Srgb = [number, number, number];

/**
 * Caustics overlay (ADR-0094). Dark tones add light through `mix-blend-mode:
 * screen` (d + k·tint·(1 − d)); light tones shade with premultiplied alpha
 * toward a deep blue (d·(1 − k) + k·tint). `nominal` is the peak strength at
 * intensity 1 before the measured contrast budget clamps it.
 */
export const CAUSTICS: { light: { nominal: number; tint: Srgb }; dark: { nominal: number; tint: Srgb }; intensity: number } = {
	light: { nominal: 0.34, tint: [0.05, 0.08, 0.16] },
	dark: { nominal: 0.4, tint: [0.8, 0.9, 1] },
	intensity: 0.75
};

/** Pixel `d` under the overlay at strength `k` (sRGB, before 8-bit rounding). Mirrors the blend. */
export function overlayPixel(d: Srgb, k: number, tone: SurfaceTone): Srgb {
	const tint = CAUSTICS[tone].tint;
	return d.map((v, i) => (tone === 'dark' ? v + k * tint[i] * (1 - v) : v * (1 - k) + k * tint[i])) as Srgb;
}

/**
 * Worst WCAG ratio of `text` against `bg` with the overlay at strength `k` on
 * either, both or neither (caustics vary across a glyph edge), and ±2/255
 * encode + dither error on every channel.
 */
export function overlayContrast(text: Srgb, bg: Srgb, k: number, tone: SurfaceTone): number {
	const lum = (c: Srgb, e: number) => relativeLuminance(...(c.map((v) => Math.min(1, Math.max(0, v + e))) as Srgb));
	let worst = Infinity;
	for (const kt of [0, k])
		for (const kb of [0, k])
			for (const et of [-2 / 255, 2 / 255])
				for (const eb of [-2 / 255, 2 / 255])
					worst = Math.min(worst, contrastRatio(lum(overlayPixel(text, kt, tone), et), lum(overlayPixel(bg, kb, tone), eb)));
	return worst;
}

/**
 * Largest overlay strength (0–1) keeping `text` ≥ `min`:1 over `bg`. The worst
 * case is monotone in k, so bisection is exact to 2⁻²⁰. 0 when the page pair
 * already misses `min`: the overlay then draws nothing.
 */
export function overlayBudget(text: Srgb, bg: Srgb, tone: SurfaceTone, min = LABEL_MIN_CONTRAST): number {
	if (overlayContrast(text, bg, 0, tone) < min) return 0;
	if (overlayContrast(text, bg, 1, tone) >= min) return 1;
	let lo = 0;
	let hi = 1;
	for (let i = 0; i < 20; i++) {
		const mid = (lo + hi) / 2;
		if (overlayContrast(text, bg, mid, tone) >= min) lo = mid;
		else hi = mid;
	}
	return lo;
}

/** Peak strength the shader may draw: intensity (0–1, clamped) × nominal, never above the budget. */
export function overlayCap(intensity: number | undefined, text: Srgb, bg: Srgb, tone: SurfaceTone): number {
	const i = intensity !== undefined && Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : CAUSTICS.intensity;
	return Math.min(i * CAUSTICS[tone].nominal, overlayBudget(text, bg, tone));
}
