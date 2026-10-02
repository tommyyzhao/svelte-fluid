import { describe, expect, it } from 'vitest';
import { MAX_STROKE_SAMPLES_PER_FRAME, MAX_TOUCH_POINTERS } from '../input-bounds.js';
import {
	PointerSlots,
	boundCoalesced,
	clampToCanvas,
	createPointer,
	pressureScale,
	recordPointerMove,
	updatePointerDownData
} from '../pointer.js';

const RGB = { r: 1, g: 1, b: 1 };

describe('PointerSlots', () => {
	it('shares slot 0 for mouse and pen, never allocates for them', () => {
		const slots = new PointerSlots();
		expect(slots.slotFor(1, 'mouse', true)).toBe(0);
		expect(slots.slotFor(7, 'pen', true)).toBe(0);
	});

	it('assigns touches lowest free slot per pointerId and reuses released slots', () => {
		const slots = new PointerSlots();
		expect(slots.slotFor(10, 'touch', true)).toBe(1);
		expect(slots.slotFor(11, 'touch', true)).toBe(2);
		expect(slots.slotFor(10, 'touch', true)).toBe(1);
		slots.release(10);
		expect(slots.slotFor(12, 'touch', true)).toBe(1);
	});

	it('does not create slots on move and caps concurrent touches', () => {
		const slots = new PointerSlots();
		expect(slots.slotFor(99, 'touch', false)).toBe(-1);
		for (let i = 0; i < MAX_TOUCH_POINTERS; i++) slots.slotFor(i, 'touch', true);
		expect(slots.slotFor(1000, 'touch', true)).toBe(-1);
	});
});

describe('recordPointerMove', () => {
	it('queues one sample per move with aspect-corrected delta', () => {
		const p = createPointer();
		updatePointerDownData(p, 1, 0, 100, 100, 100, RGB);
		recordPointerMove(p, 10, 100, 100, 100);
		recordPointerMove(p, 20, 100, 100, 100);
		expect(p.sampleCount).toBe(2);
		expect(p.moved).toBe(true);
		expect(p.samples[2]).toBeCloseTo(0.1);
	});

	it('bounds samples per frame and conserves total delta', () => {
		const p = createPointer();
		updatePointerDownData(p, 1, 0, 100, 1000, 100, RGB);
		const n = MAX_STROKE_SAMPLES_PER_FRAME * 4;
		for (let i = 1; i <= n; i++) recordPointerMove(p, i, 100, 1000, 100);
		expect(p.sampleCount).toBe(MAX_STROKE_SAMPLES_PER_FRAME);
		let sum = 0;
		for (let i = 0; i < p.sampleCount; i++) sum += p.samples[4 * i + 2];
		// Aspect 10 > 1 leaves deltaX uncorrected: total = n / 1000.
		expect(sum).toBeCloseTo(n / 1000, 4);
		const last = (MAX_STROKE_SAMPLES_PER_FRAME - 1) * 4;
		expect(p.samples[last]).toBeCloseTo(n / 1000, 4);
	});

	it('ignores zero-delta moves', () => {
		const p = createPointer();
		updatePointerDownData(p, 1, 5, 5, 100, 100, RGB);
		recordPointerMove(p, 5, 5, 100, 100);
		expect(p.sampleCount).toBe(0);
		expect(p.moved).toBe(false);
	});
});

describe('boundCoalesced', () => {
	it('passes small lists through and thins large ones keeping endpoints', () => {
		const a = [1, 2, 3];
		expect(boundCoalesced(a, 16)).toBe(a);
		const big = Array.from({ length: 1000 }, (_, i) => i);
		const out = boundCoalesced(big, 16);
		expect(out).toHaveLength(16);
		expect(out[0]).toBe(0);
		expect(out[15]).toBe(999);
		expect(boundCoalesced(big, 1)).toEqual([999]);
		expect(boundCoalesced(big, 0)).toEqual([]);
	});
});

describe('pressureScale / clampToCanvas', () => {
	it('scales only pen pressure, within 0.5x-1.5x', () => {
		expect(pressureScale('mouse', 0.5)).toBe(1);
		expect(pressureScale('touch', 1)).toBe(1);
		expect(pressureScale('pen', 0.5)).toBe(1);
		expect(pressureScale('pen', 1)).toBe(1.5);
		expect(pressureScale('pen', 0.01)).toBeCloseTo(0.51);
		expect(pressureScale('pen', 0)).toBe(1);
		expect(pressureScale('pen', Number.NaN)).toBe(1);
		expect(pressureScale('pen', 99)).toBe(1.5);
	});

	it('rejects non-finite and clamps far-outside coordinates', () => {
		expect(clampToCanvas(Number.NaN, 100)).toBeNull();
		expect(clampToCanvas(Infinity, 100)).toBeNull();
		expect(clampToCanvas(-1e9, 100)).toBe(-50);
		expect(clampToCanvas(1e9, 100)).toBe(150);
		expect(clampToCanvas(40, 100)).toBe(40);
	});
});
