/*
 * svelte-fluid — seedable PRNG and color generation
 * Derivative work of WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017, MIT.
 */

import type { RGB } from './types.js';

/** A pure 32-bit float pseudo-random number generator. */
export type Rng = () => number;

/**
 * Mulberry32 — small, fast, deterministic 32-bit PRNG.
 * Good enough for visual jitter; not cryptographic.
 */
export function mulberry32(seed: number): Rng {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Generate a random initial seed in the unsigned 32-bit range. */
export function randomSeed(): number {
	return Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
}

/**
 * Convert HSV (all 0–1) to RGB (all 0–1).
 * Ported verbatim from script.js:1573-1595.
 */
export function HSVtoRGB(h: number, s: number, v: number): RGB {
	let r = 0;
	let g = 0;
	let b = 0;
	const i = Math.floor(h * 6);
	const f = h * 6 - i;
	const p = v * (1 - s);
	const q = v * (1 - f * s);
	const t = v * (1 - (1 - f) * s);

	switch (i % 6) {
		case 0:
			r = v;
			g = t;
			b = p;
			break;
		case 1:
			r = q;
			g = v;
			b = p;
			break;
		case 2:
			r = p;
			g = v;
			b = t;
			break;
		case 3:
			r = p;
			g = q;
			b = v;
			break;
		case 4:
			r = t;
			g = p;
			b = v;
			break;
		case 5:
			r = v;
			g = p;
			b = q;
			break;
	}

	return { r, g, b };
}

/**
 * Pick a random colorful pointer/splat color from the seeded RNG,
 * scaled down to a tasteful intensity.
 * Ported from script.js:1565-1571 with `Math.random` replaced by `rng()`.
 */
export function generateColor(rng: Rng): RGB {
	const c = HSVtoRGB(rng(), 1.0, 1.0);
	c.r *= 0.15;
	c.g *= 0.15;
	c.b *= 0.15;
	return c;
}

/** Normalize a 0–255 RGB triple to 0–1. */
export function normalizeColor(input: RGB): RGB {
	return {
		r: input.r / 255,
		g: input.g / 255,
		b: input.b / 255
	};
}
