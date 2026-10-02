/*
 * Brush input for PigmentEngine (ADR-0090): pure dab generation, the bounded
 * dab queue, the drying clock and the pointer adapter. No GL, no Svelte.
 * Coordinates are CSS px relative to the surface's top-left corner.
 */

import { MAX_COALESCED_PER_EVENT, MAX_TOUCH_POINTERS } from '../input-bounds.js';
import { boundCoalesced } from '../pointer.js';
import { mulberry32 } from '../rng.js';

export type Load = [number, number, number, number];

/** One touch of a loaded brush. */
export interface Dab {
	x: number;
	y: number;
	/** Radius in CSS px. */
	r: number;
	/** Water, in brush loads (1 = flooded; depth clamps at 1.6). */
	water: number;
	/** Pigment per channel, unit-layer concentration. */
	pigment: Load;
	/** Drag in CSS px per step. */
	vx?: number;
	vy?: number;
	/** 0 = soft falloff, 0.9 = hard edge. Default 0.2. */
	hard?: number;
	/** Solver steps to wait before landing (staged blooms). Default 0. */
	delay?: number;
}

/** Splats per shader pass (uniform array length in shaders.ts). */
export const DABS_PER_PASS = 32;
/** Dabs landed per solver step: two passes, well under 0.1 ms at sim resolution. */
export const MAX_DABS_PER_STEP = 2 * DABS_PER_PASS;
/** Dabs retained between frames (ADR-0079); a saturated queue drops new input. */
export const MAX_QUEUED_DABS = 512;
/** Dabs kept for replay after a context restore; the oldest fall off first. */
export const MAX_LOGGED_DABS = 2048;
/** Longest delay a dab may request (about 1 s of steps). */
export const MAX_DAB_DELAY = 60;

/** Evaporation per step for a wet cell (shaders: uEvap). */
export const EVAP = 0.0028;
/** Deepest water a splat can leave (shaders: SPLAT clamp). */
export const MAX_DEPTH = 1.6;
/**
 * Upper bound on steps from a dab landing to dry paper. Every wet cell loses
 * at least EVAP per step and depth is clamped, so this many steps empty the
 * deepest pool; the final step blots whatever remains (TRANSPORT uEvap).
 */
export const MAX_WET_STEPS = Math.ceil(MAX_DEPTH / EVAP) + 30;

/** Steps a dab keeps the surface wet: its own depth, not the worst case. */
export function wetStepsFor(dab: Pick<Dab, 'water' | 'delay'>): number {
	const depth = Math.min(MAX_DEPTH, Math.max(0, dab.water) * 4 + 0.3);
	return (dab.delay ?? 0) + Math.min(MAX_WET_STEPS, Math.ceil(depth / EVAP) + 30);
}

function finiteDab(d: Dab): boolean {
	return (
		[d.x, d.y, d.r, d.water, d.vx ?? 0, d.vy ?? 0, d.hard ?? 0, d.delay ?? 0].every(Number.isFinite) &&
		d.pigment?.length === 4 &&
		d.pigment.every(Number.isFinite) &&
		d.r > 0
	);
}

/**
 * Bounded dab queue plus the drying clock. `wetSteps` counts down one per
 * solver step and only grows when a dab is accepted, so a surface with no new
 * input reaches zero (dry, idle) in at most MAX_WET_STEPS + MAX_DAB_DELAY steps.
 */
export class DabQueue {
	private items: Dab[] = [];
	wetSteps = 0;

	get size(): number {
		return this.items.length;
	}

	/** Accept finite dabs up to the retained cap; returns how many were kept. */
	push(dabs: readonly Dab[]): number {
		let kept = 0;
		for (const d of dabs) {
			if (this.items.length >= MAX_QUEUED_DABS) break;
			if (!finiteDab(d)) continue;
			const dab: Dab = {
				...d,
				pigment: d.pigment.map((v) => Math.max(0, v)) as Load,
				water: Math.max(0, d.water),
				delay: Math.min(MAX_DAB_DELAY, Math.max(0, Math.round(d.delay ?? 0)))
			};
			this.items.push(dab);
			this.wetSteps = Math.max(this.wetSteps, wetStepsFor(dab));
			kept++;
		}
		return kept;
	}

	/** Dabs due this step (at most MAX_DABS_PER_STEP); delayed ones tick down. */
	take(): Dab[] {
		const due: Dab[] = [];
		const rest: Dab[] = [];
		for (const d of this.items) {
			if ((d.delay ?? 0) <= 0 && due.length < MAX_DABS_PER_STEP) due.push(d);
			else rest.push(d.delay ? { ...d, delay: d.delay - 1 } : d);
		}
		this.items = rest;
		return due;
	}

	/** Advance the drying clock by one step. */
	tick(): void {
		this.wetSteps = Math.max(0, this.wetSteps - 1);
		// Undelivered input keeps the clock alive (cannot happen once taken).
		if (this.wetSteps === 0 && this.items.length) this.wetSteps = 1;
	}

	get wet(): boolean {
		return this.wetSteps > 0 || this.items.length > 0;
	}

	clear(): void {
		this.items = [];
		this.wetSteps = 0;
	}
}

/**
 * Landed dabs for replay after context restore, in order, capped at
 * MAX_LOGGED_DABS. ponytail: dropping the oldest marks loses the first layer
 * of a very long session; snapshot the deposit field if that ever matters.
 */
export class StrokeLog {
	private dabs: Dab[] = [];

	record(dabs: readonly Dab[]): void {
		for (const d of dabs) this.dabs.push({ ...d, delay: 0 });
		const over = this.dabs.length - MAX_LOGGED_DABS;
		if (over > 0) this.dabs.splice(0, over);
	}

	/** Replay batches, oldest first, one shader pass each. */
	batches(): Dab[][] {
		const out: Dab[][] = [];
		for (let i = 0; i < this.dabs.length; i += DABS_PER_PASS) out.push(this.dabs.slice(i, i + DABS_PER_PASS));
		return out;
	}

	get size(): number {
		return this.dabs.length;
	}

	clear(): void {
		this.dabs = [];
	}
}

const loadOf = (channel: number, amount: number): Load => {
	const l: Load = [0, 0, 0, 0];
	l[Math.max(0, Math.min(3, channel | 0))] = amount;
	return l;
};

/** A gestural stroke across a `w`×`h` surface (the opening wash). */
export function gesture(w: number, h: number, channel: number, seed: number): Dab[] {
	const rnd = mulberry32(seed);
	const phase = rnd() * 6.28;
	const y0 = 0.62 + 0.2 * rnd();
	const tilt = 0.08 + 0.12 * rnd();
	const out: Dab[] = [];
	const size = Math.min(1, Math.max(0.4, Math.min(w, h * 1.6) / 900));
	// Dabs overlap even at the thin tail (r = 12 * size), so it never beads into dots.
	const n = Math.max(70, Math.min(240, Math.ceil((0.8 * w) / (5 * size))));
	for (let i = 0; i < n; i++) {
		const t = i / (n - 1);
		const pr = Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.75 + 0.2;
		out.push({
			x: w * (0.1 + 0.8 * t),
			y: h * (y0 + 0.1 * Math.sin(t * 5.2 + phase) - tilt * t),
			r: (8 + 20 * pr) * size,
			water: 0.12 + 0.12 * pr,
			pigment: loadOf(channel, 0.05 * pr),
			vx: 2.2,
			vy: 0,
			hard: 0.55
		});
	}
	return out;
}

/** A bloom: a loaded brush touched down once, then the water finds its own shape. */
export function bloom(x: number, y: number, r: number, channel: number, amount: number, seed: number, delay = 0): Dab[] {
	const rnd = mulberry32(seed);
	const out: Dab[] = [{ x, y, r: r * 0.55, water: 0.8, pigment: loadOf(channel, amount), hard: 0.3, delay }];
	for (let i = 0; i < 9; i++) {
		const a = (i / 9) * Math.PI * 2 + rnd() * 0.6;
		const d = r * (0.35 + rnd() * 0.3);
		out.push({
			x: x + Math.cos(a) * d,
			y: y + Math.sin(a) * d * 0.8,
			r: r * (0.3 + rnd() * 0.2),
			water: 0.55,
			pigment: loadOf(channel, amount * 0.7),
			hard: 0.3,
			delay
		});
	}
	return out;
}

/** Longest unbroken run of `keep` dabs: a stroke cut by a resist keeps one piece, never stray dots. */
function longestRun(dabs: Dab[], keep: (d: Dab) => boolean): Dab[] {
	let best: Dab[] = [];
	let run: Dab[] = [];
	for (const d of dabs) {
		if (keep(d)) run.push(d);
		else run = [];
		if (run.length > best.length) best = run.slice();
	}
	return best;
}

function washCandidate(w: number, h: number, channels: number, seed: number, keep: (d: Dab) => boolean): Dab[] {
	const rnd = mulberry32(seed ^ 0x9e3779b9);
	const second = channels > 1 ? 1 : 0;
	const r = Math.max(30, Math.min(w, h) * (0.18 + 0.06 * rnd()));
	const stroke = longestRun(gesture(w, h, 0, seed), keep);
	const flower = bloom(w * (0.2 + 0.6 * rnd()), h * (0.3 + 0.4 * rnd()), r, second, 0.08, seed + 1, 20);
	// A stub is a dot, not a stroke; a bloom missing its centre is a ring.
	return [...(stroke.length >= 12 ? stroke : []), ...(keep(flower[0]) ? flower.filter(keep) : [])];
}

const hits = (d: Dab, b: Box, pad: number) =>
	d.x + d.r > b.x - pad && d.x - d.r < b.x + b.w + pad && d.y + d.r > b.y - pad && d.y - d.r < b.y + b.h + pad;

/**
 * The deterministic opening wash: one stroke crossed by a bloom. Of a few
 * seeded layouts it takes the one that best avoids `avoid` (dry regions,
 * inflated by `pad`), then drops dabs that still touch one, so water never
 * floods the narrow gaps between neighbouring resists.
 */
export function openingWash(w: number, h: number, channels: number, seed: number, avoid: readonly Box[] = [], pad = 0): Dab[] {
	if (channels < 1 || w < 8 || h < 8) return [];
	let best: Dab[] = [];
	let bestScore = -1;
	for (let k = 0; k < 8; k++) {
		const dabs = washCandidate(w, h, channels, seed + k * 7919, (d) => !avoid.some((b) => hits(d, b, pad)));
		// Keep both marks: a lost bloom or stroke is worth more than a few dabs.
		const blooms = dabs.filter((d) => d.delay).length;
		const score = dabs.length + (blooms ? 100 : 0);
		if (score > bestScore) {
			best = dabs;
			bestScore = score;
		}
		if (!avoid.length) break;
	}
	return best;
}

/** Box in CSS px relative to the surface. */
export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** One elliptical corner radius in CSS px. */
export interface Corner {
	x: number;
	y: number;
}

/**
 * A computed `border-*-radius` value ("12px", "12px 6px", "50%", "50% 20%")
 * as a corner, percentages against the box. Overlap scaling is left to the
 * rasteriser (`roundRect` applies the CSS rule).
 */
export function parseCornerRadius(value: string, w: number, h: number): Corner {
	const parts = value.trim().split(/\s+/);
	const one = (v: string | undefined, size: number) => {
		if (!v) return 0;
		const n = Number.parseFloat(v);
		if (!Number.isFinite(n) || n <= 0) return 0;
		return v.endsWith('%') ? (n / 100) * size : n;
	};
	return { x: one(parts[0], w), y: one(parts[1] ?? parts[0], h) };
}

/**
 * Water touches the paper just under a control (where the pointer entered,
 * or its leading edge for keyboard focus) and creeps both ways along the
 * lower half of its stadium outline, pooling against the dry control.
 */
export function wick(box: Box, channel: number, entryX: number | null = null): Dab[] {
	// Dabs straddle the outline; the resist keeps the control itself dry,
	// so water pools right against its edge.
	const rad = box.h / 2 + 5;
	const cy = box.y + box.h / 2;
	const left = box.x + box.h / 2;
	const right = Math.max(left, box.x + box.w - box.h / 2);
	const arc = Math.PI * rad * 0.5;
	const total = arc * 2 + (right - left);
	const at = (u: number) => {
		let d = u * total;
		if (d < arc) {
			const a = Math.PI - (d / arc) * (Math.PI / 2);
			return { x: left + Math.cos(a) * rad, y: cy + Math.sin(a) * rad };
		}
		d -= arc;
		if (d < right - left) return { x: left + d, y: cy + rad };
		const a = Math.PI / 2 - ((d - (right - left)) / arc) * (Math.PI / 2);
		return { x: right + Math.cos(a) * rad, y: cy + Math.sin(a) * rad };
	};
	const px = entryX ?? left;
	const start = Math.min(1, Math.max(0, (px - (left - rad)) / (right - left + 2 * rad)));
	const out: Dab[] = [];
	const steps = 14;
	for (let k = 0; k < steps; k++) {
		const reach = (k + 1) / steps;
		const fade = 1 - 0.6 * reach;
		for (const dir of [-1, 1]) {
			const u = start + dir * reach * Math.max(start, 1 - start);
			if (u < 0 || u > 1) continue;
			out.push({ ...at(u), r: 10 * fade + 5, water: 0.45 * fade, pigment: loadOf(channel, 0.2 * fade), hard: 0.4, delay: Math.round(k * 1.7) });
		}
	}
	return out;
}

export interface BrushSettings {
	/** Radius in CSS px at full pressure. */
	size: number;
	/** Water per dab relative to the default load (1 = default). */
	water: number;
	/** Pigment channel, or -1 to advance channels after each pause. */
	channel: number;
	/** Number of channels in the palette. */
	channels: number;
}

/**
 * Pointer -> dabs. Spaced by arc length, so pigment laid per CSS px does not
 * depend on event rate; coalesced events add fidelity, capped per event.
 * Mouse hover is a light, dry touch; pressed mouse 0.6; pen uses pressure;
 * touch has no meaningful pressure (ADR-0083) and uses 0.5.
 */
export function attachBrush(el: HTMLElement, sink: (dabs: Dab[]) => void, settings: () => BrushSettings): () => void {
	const strokes = new Map<number, { x: number; y: number; carry: number }>();
	let cycle = 0;
	let lastMove = 0;
	const onMove = (e: PointerEvent) => {
		const s = settings();
		if (s.channels < 1) return;
		const base = el.getBoundingClientRect();
		const now = e.timeStamp;
		// A pause lifts the brush; the next stroke picks up the next pan.
		if (lastMove && now - lastMove > 700) cycle = (cycle + 1) % s.channels;
		lastMove = now;
		const channel = s.channel >= 0 ? Math.min(s.channel, s.channels - 1) : cycle % s.channels;
		let st = strokes.get(e.pointerId);
		if (!st && strokes.size > MAX_TOUCH_POINTERS) return;
		const all = e.getCoalescedEvents?.() ?? [];
		const dabs: Dab[] = [];
		for (const ev of boundCoalesced(all.length ? all : [e], MAX_COALESCED_PER_EVENT)) {
			const x = ev.clientX - base.left;
			const y = ev.clientY - base.top;
			if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
			const pressed = ev.buttons !== 0 || ev.pointerType !== 'mouse';
			const pr =
				ev.pointerType === 'mouse' ? (pressed ? 0.6 : 0.25) : ev.pointerType === 'pen' ? Math.max(0.15, Math.min(1, ev.pressure || 0.5)) : 0.5;
			const r = (s.size / 23) * (7 + 16 * pr);
			if (!st) {
				st = { x, y, carry: 0 };
				strokes.set(e.pointerId, st);
				continue;
			}
			const dx = x - st.x;
			const dy = y - st.y;
			const len = Math.hypot(dx, dy);
			if (len > 200) {
				st.x = x;
				st.y = y;
				continue;
			}
			const spacing = Math.max(1, r * 0.3);
			st.carry += len;
			const k = 0.05 * pr;
			while (st.carry >= spacing) {
				st.carry -= spacing;
				const t = 1 - st.carry / Math.max(len, 1e-3);
				dabs.push({
					x: st.x + dx * t,
					y: st.y + dy * t,
					r,
					water: (0.09 + 0.12 * pr) * s.water,
					pigment: loadOf(channel, k),
					vx: dx * 0.12,
					vy: dy * 0.12,
					hard: 0.55
				});
			}
			st.x = x;
			st.y = y;
		}
		if (dabs.length) sink(dabs);
	};
	const onEnd = (e: PointerEvent) => {
		strokes.delete(e.pointerId);
	};
	el.addEventListener('pointermove', onMove);
	el.addEventListener('pointerleave', onEnd);
	el.addEventListener('pointercancel', onEnd);
	el.addEventListener('pointerup', onEnd);
	return () => {
		el.removeEventListener('pointermove', onMove);
		el.removeEventListener('pointerleave', onEnd);
		el.removeEventListener('pointercancel', onEnd);
		el.removeEventListener('pointerup', onEnd);
	};
}
