/*
 * svelte-fluid — pointer state and update helpers
 * Derivative work of WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017, MIT.
 *
 * The originals (script.js:87-98 and 1526-1563) closed over the global
 * `canvas` variable. Here every helper takes the current backbuffer
 * width / height as explicit arguments so multiple instances stay isolated.
 */

import { MAX_STROKE_SAMPLES_PER_FRAME, MAX_TOUCH_POINTERS } from './input-bounds.js';
import type { RGB } from './types.js';

export interface Pointer {
	id: number;
	texcoordX: number;
	texcoordY: number;
	prevTexcoordX: number;
	prevTexcoordY: number;
	deltaX: number;
	deltaY: number;
	down: boolean;
	moved: boolean;
	color: RGB;
	/** Force multiplier for this pointer (pen pressure); 1 for everything else. */
	pressureScale: number;
	/** Queued stroke segments since the last frame: x, y, dx, dy per sample. */
	samples: Float32Array;
	sampleCount: number;
}

export function createPointer(): Pointer {
	return {
		id: -1,
		texcoordX: 0,
		texcoordY: 0,
		prevTexcoordX: 0,
		prevTexcoordY: 0,
		deltaX: 0,
		deltaY: 0,
		down: false,
		moved: false,
		color: { r: 0, g: 0, b: 0 },
		pressureScale: 1,
		samples: new Float32Array(4 * MAX_STROKE_SAMPLES_PER_FRAME),
		sampleCount: 0
	};
}

/** Pointer-down: snapshot the position and assign a fresh color. */
export function updatePointerDownData(
	pointer: Pointer,
	id: number,
	posX: number,
	posY: number,
	canvasWidth: number,
	canvasHeight: number,
	color: RGB
): void {
	pointer.id = id;
	pointer.down = true;
	pointer.moved = false;
	pointer.texcoordX = posX / canvasWidth;
	pointer.texcoordY = 1.0 - posY / canvasHeight;
	pointer.prevTexcoordX = pointer.texcoordX;
	pointer.prevTexcoordY = pointer.texcoordY;
	pointer.deltaX = 0;
	pointer.deltaY = 0;
	pointer.sampleCount = 0;
	pointer.color = color;
}

/** Drag in progress: update position and aspect-corrected delta. */
export function updatePointerMoveData(
	pointer: Pointer,
	posX: number,
	posY: number,
	canvasWidth: number,
	canvasHeight: number
): void {
	pointer.prevTexcoordX = pointer.texcoordX;
	pointer.prevTexcoordY = pointer.texcoordY;
	pointer.texcoordX = posX / canvasWidth;
	pointer.texcoordY = 1.0 - posY / canvasHeight;
	const aspectRatio = canvasWidth / canvasHeight;
	pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX, aspectRatio);
	pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY, aspectRatio);
	pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
}

/** Pointer up: just clear the down flag. */
export function updatePointerUpData(pointer: Pointer): void {
	pointer.down = false;
}

export function correctDeltaX(delta: number, aspectRatio: number): number {
	return aspectRatio < 1 ? delta * aspectRatio : delta;
}

export function correctDeltaY(delta: number, aspectRatio: number): number {
	return aspectRatio > 1 ? delta / aspectRatio : delta;
}

/**
 * Move the pointer and queue the segment for the next frame. Coalesced events
 * each add a sample; past the per-frame cap the last sample absorbs the rest
 * (position replaced, delta summed) so no force is lost and work stays bounded.
 */
export function recordPointerMove(
	pointer: Pointer,
	posX: number,
	posY: number,
	canvasWidth: number,
	canvasHeight: number
): void {
	updatePointerMoveData(pointer, posX, posY, canvasWidth, canvasHeight);
	if (pointer.deltaX === 0 && pointer.deltaY === 0) {
		pointer.moved = pointer.sampleCount > 0;
		return;
	}
	const s = pointer.samples;
	let i = pointer.sampleCount;
	if (i < MAX_STROKE_SAMPLES_PER_FRAME) {
		pointer.sampleCount++;
		i *= 4;
		s[i + 2] = pointer.deltaX;
		s[i + 3] = pointer.deltaY;
	} else {
		i = (MAX_STROKE_SAMPLES_PER_FRAME - 1) * 4;
		s[i + 2] += pointer.deltaX;
		s[i + 3] += pointer.deltaY;
	}
	s[i] = pointer.texcoordX;
	s[i + 1] = pointer.texcoordY;
	pointer.moved = true;
}

/** At most `max` items, evenly spaced, always keeping the first and last. */
export function boundCoalesced<T>(events: readonly T[], max: number): readonly T[] {
	const n = events.length;
	if (n <= max || max < 1) return max < 1 ? [] : events;
	if (max === 1) return [events[n - 1]];
	const out: T[] = [];
	for (let k = 0; k < max; k++) out.push(events[Math.round((k * (n - 1)) / (max - 1))]);
	return out;
}

/**
 * Pen pressure scales splat force 0.5x (light) to 1.5x (full); the default
 * pen pressure of 0.5 is neutral. Mouse/touch pressure is not meaningful
 * (constant or zero on many devices), so it never scales.
 */
export function pressureScale(pointerType: string, pressure: number): number {
	if (pointerType !== 'pen' || !Number.isFinite(pressure) || pressure <= 0) return 1;
	return 0.5 + Math.min(1, pressure);
}

/** Keep finite coordinates within a margin around the canvas; non-finite -> null. */
export function clampToCanvas(pos: number, size: number): number | null {
	if (!Number.isFinite(pos)) return null;
	return Math.max(-0.5 * size, Math.min(1.5 * size, pos));
}

/**
 * Maps pointerIds to pointer slots. Slot 0 is the shared mouse/pen pointer
 * (hover, glass light); touches take slots 1..maxTouches, lowest free first.
 */
export class PointerSlots {
	private touches = new Map<number, number>();
	constructor(readonly maxTouches = MAX_TOUCH_POINTERS) {}

	/** Slot for this pointer, or -1 (unknown touch, or table full when `create`). */
	slotFor(pointerId: number, pointerType: string, create: boolean): number {
		if (pointerType !== 'touch') return 0;
		const existing = this.touches.get(pointerId);
		if (existing !== undefined) return existing;
		if (!create || this.touches.size >= this.maxTouches) return -1;
		const used = new Set(this.touches.values());
		let slot = 1;
		while (used.has(slot)) slot++;
		this.touches.set(pointerId, slot);
		return slot;
	}

	release(pointerId: number): void {
		this.touches.delete(pointerId);
	}

	clear(): void {
		this.touches.clear();
	}
}
