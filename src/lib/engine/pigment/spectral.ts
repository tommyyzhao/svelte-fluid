/*
 * Kubelka–Munk pigment optics for PigmentEngine (ADR-0090).
 *
 * sRGB→spectrum upsampling follows spectral.js by Ronald van Wijnen (MIT,
 * https://github.com/rvanwijnen/spectral.js); tables live in spectral-data.ts.
 * Unlike spectral.js (infinite-depth masstone mixing) we keep K and S apart and
 * evaluate a *finite* layer over a background, so thin washes show the paper.
 *
 * Bands: 12 groups of the 38 samples, each holding equal CIE (x̄+ȳ+z̄)·D65
 * energy. Measured against the full 38-sample integral over 14 design tokens and
 * 162 two-glaze stacks: max OKLab ΔE 0.0095 (12 bands) vs 0.021 (8) and 0.003 (16).
 * 0.02 is roughly one just-noticeable difference, so 12 is the smallest count
 * that stays invisible, and it packs into exactly three vec4s per pigment.
 */
import { BASE, CMF, SAMPLES, XYZ_TO_LINEAR_SRGB } from './spectral-data.js';

export const BANDS = 12;
export type Rgb = [number, number, number];

const toLinear = (x: number) => (x > 0.04045 ? ((x + 0.055) / 1.055) ** 2.4 : x / 12.92);
const toSrgb = (x: number) => {
	const v = Math.min(1, Math.max(0, x));
	return v > 0.0031308 ? 1.055 * v ** (1 / 2.4) - 0.055 : 12.92 * v;
};

export function parseHex(hex: string): Rgb {
	const h = hex.replace('#', '');
	const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
	return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as Rgb;
}

export const hexToLinear = (hex: string) => parseHex(hex).map(toLinear) as Rgb;
export const linearToHex = (rgb: Rgb) =>
	'#' + rgb.map((v) => Math.round(toSrgb(v) * 255).toString(16).padStart(2, '0')).join('');

// Band edges: equal CMF energy per band.
const groups: [number, number][] = (() => {
	const energy = Array.from({ length: SAMPLES }, (_, i) => CMF[0][i] + CMF[1][i] + CMF[2][i]);
	const total = energy.reduce((a, b) => a + b);
	const out: [number, number][] = [];
	let acc = 0;
	let start = 0;
	for (let i = 0; i < SAMPLES; i++) {
		acc += energy[i];
		if (out.length < BANDS - 1 && acc >= (total * (out.length + 1)) / BANDS - 1e-9) {
			out.push([start, i + 1]);
			start = i + 1;
		}
	}
	out.push([start, SAMPLES]);
	return out;
})();

/** Band-summed CMF rows (X, Y, Z), D65-weighted: flat R = 1 integrates to Y = 1. */
export const BAND_CMF: number[][] = CMF.map((row) =>
	groups.map(([a, b]) => row.slice(a, b).reduce((s, v) => s + v, 0))
);

/** sRGB → 38-sample reflectance (spectral.js method). */
function upsample(lin: Rgb): number[] {
	const w = Math.min(...lin);
	const [r0, g0, b0] = lin.map((v) => v - w);
	const c = Math.min(g0, b0);
	const m = Math.min(r0, b0);
	const y = Math.min(r0, g0);
	const r = Math.max(0, Math.min(r0 - b0, r0 - g0));
	const g = Math.max(0, Math.min(g0 - b0, g0 - r0));
	const b = Math.max(0, Math.min(b0 - g0, b0 - r0));
	return Array.from({ length: SAMPLES }, (_, i) =>
		Math.max(
			1e-4,
			w * BASE.W[i] + c * BASE.C[i] + m * BASE.M[i] + y * BASE.Y[i] + r * BASE.R[i] + g * BASE.G[i] + b * BASE.B[i]
		)
	);
}

/** Token → per-band reflectance, ȳ-weighted within each band (what the eye integrates). */
export function tokenReflectance(hex: string): number[] {
	const R = upsample(hexToLinear(hex));
	return groups.map(([a, b]) => {
		let s = 0;
		let w = 0;
		for (let i = a; i < b; i++) {
			const e = CMF[1][i] + 1e-6;
			s += R[i] * e;
			w += e;
		}
		return s / w;
	});
}

export function bandsToLinear(R: number[]): Rgb {
	const xyz = BAND_CMF.map((row) => row.reduce((s, v, i) => s + v * R[i], 0));
	return XYZ_TO_LINEAR_SRGB.map((r) => r[0] * xyz[0] + r[1] * xyz[1] + r[2] * xyz[2]) as Rgb;
}

/**
 * Kubelka's hyperbolic solution for one homogeneous layer of optical thickness
 * x: reflectance R and transmittance T. Written with tanh/sech via one exp so it
 * is finite from pure scattering (K→0) to pure absorption (S→0, Beer–Lambert).
 * The GLSL `layer()` is a line-for-line mirror.
 */
export function layer(K: number, S: number, x = 1): { R: number; T: number } {
	const s = Math.max(S, 1e-5);
	const a = 1 + K / s;
	const b = Math.max(Math.sqrt(a * a - 1), 1e-3);
	const e = Math.exp(-2 * b * s * x);
	const t = (1 - e) / (1 + e);
	const d = a * t + b;
	return { R: t / d, T: (b * 2 * Math.sqrt(e)) / ((1 + e) * d) };
}

/** Layer (R,T) over a background of reflectance Rg — multiple inter-reflections summed. */
export const over = (l: { R: number; T: number }, Rg: number) => l.R + (l.T * l.T * Rg) / (1 - l.R * Rg);

export interface Pigment {
	/** Absorption per band at unit concentration. */
	K: number[];
	/** Scattering at unit concentration (wavelength-flat). */
	S: number;
}

/**
 * Solve K per band so that a unit-concentration layer of scattering S over
 * `reference` reflectance reproduces the token. PigmentEngine uses transparent
 * watercolour (WATERCOLOUR_S) calibrated over white.
 */
export function pigmentFromToken(hex: string, S: number, reference: number): Pigment {
	const target = tokenReflectance(hex);
	const K = target.map((Rt) => {
		let lo = 0;
		let hi = 200;
		if (over(layer(0, S), reference) <= Rt) return 0;
		for (let i = 0; i < 48; i++) {
			const mid = (lo + hi) / 2;
			if (over(layer(mid, S), reference) > Rt) lo = mid;
			else hi = mid;
		}
		return (lo + hi) / 2;
	});
	return { K, S };
}

/** Pigment mixture (concentrations c) as one layer over paper. Linear sRGB. */
export function mixOverPaper(pigments: Pigment[], c: number[], paperHex: string): Rgb {
	const paper = tokenReflectance(paperHex);
	const S = pigments.reduce((s, p, i) => s + p.S * c[i], 0);
	const R = paper.map((Rg, band) => {
		const K = pigments.reduce((s, p, i) => s + p.K[band] * c[i], 0);
		return over(layer(K, S), Rg);
	});
	return bandsToLinear(R);
}

export const WATERCOLOUR_S = 0.12;

/** OKLCH hue in degrees, for tests and diagnostics. */
export function hue(lin: Rgb): number {
	const [r, g, b] = lin;
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const B = 0.0259040371 * l + 0.7827717662 * m - 0.808595867 * s;
	return ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
}

/** Uniform packing for the display shader: K as vec4[pigment*3 + bandGroup]. */
export function packPigments(pigments: Pigment[]): { K: Float32Array; S: Float32Array } {
	const K = new Float32Array(4 * BANDS);
	const S = new Float32Array(4);
	pigments.slice(0, 4).forEach((p, i) => {
		K.set(p.K, i * BANDS);
		S[i] = p.S;
	});
	return { K, S };
}
