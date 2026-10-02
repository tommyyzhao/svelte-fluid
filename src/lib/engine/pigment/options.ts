/*
 * Pigment options resolution (ADR-0090). Pure, GL-free. `undefined` (or an
 * invalid value) means "not supplied": it never overwrites a resolved value.
 */

import type { InkBrush } from '../types.js';

export interface ResolvedBrush {
	size: number;
	water: number;
	/** Fixed pigment index, or -1 to change pigment after each pause. */
	pigment: number;
}

export interface PigmentOptions {
	paper: string;
	pigments: string[];
	brush: ResolvedBrush;
	seed: number;
}

export interface PigmentOptionsInput {
	paper?: string;
	pigments?: readonly string[];
	brush?: InkBrush;
	seed?: number;
}

export const MAX_PIGMENTS = 4;

export const PIGMENT_DEFAULTS: Readonly<PigmentOptions> = Object.freeze({
	paper: '#f4ecdc',
	pigments: ['#2549a8', '#e7b112', '#b8325a', '#2e8a5a'],
	brush: { size: 23, water: 1, pigment: -1 },
	seed: 1
});

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColour(value: unknown): value is string {
	return typeof value === 'string' && HEX.test(value.trim());
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function resolvePigmentOptions(prev: PigmentOptions, patch: PigmentOptionsInput = {}): PigmentOptions {
	const out: PigmentOptions = { ...prev, pigments: [...prev.pigments], brush: { ...prev.brush } };
	if (isHexColour(patch.paper)) out.paper = patch.paper.trim();
	if (Array.isArray(patch.pigments)) {
		const valid = patch.pigments.filter(isHexColour).map((p) => p.trim()).slice(0, MAX_PIGMENTS);
		if (valid.length) out.pigments = valid;
	}
	const b = patch.brush;
	if (b) {
		if (finite(b.size) && b.size > 0) out.brush.size = clamp(b.size, 2, 120);
		if (finite(b.water) && b.water >= 0) out.brush.water = clamp(b.water, 0.1, 3);
		if (b.pigment === null) out.brush.pigment = -1;
		else if (finite(b.pigment)) out.brush.pigment = b.pigment < 0 ? -1 : clamp(Math.floor(b.pigment), 0, MAX_PIGMENTS - 1);
	}
	if (finite(patch.seed)) out.seed = Math.floor(patch.seed) >>> 0;
	return out;
}
