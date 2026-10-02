/*
 * Liquid-control palettes and the label contrast budget (ADR-0091). Pure: the
 * components style their fallback from the same colours the shader lights, and
 * the Node test proves the budget keeps label text at WCAG AA.
 */
import { contrastRatio, relativeLuminance, srgbToLinear } from '../contrast.js';

export type SurfaceTone = 'light' | 'dark';
export type SurfaceControl = 'button' | 'segmented';

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

export const LOOKS: Record<SurfaceControl, Record<SurfaceTone, SurfaceLook>> = {
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
