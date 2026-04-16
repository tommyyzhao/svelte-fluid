/*
 * svelte-fluid — pointer state and update helpers
 * Derivative work of WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017, MIT.
 *
 * The originals (script.js:87-98 and 1526-1563) closed over the global
 * `canvas` variable. Here every helper takes the current backbuffer
 * width / height as explicit arguments so multiple instances stay isolated.
 */

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
		color: { r: 0, g: 0, b: 0 }
	};
}

/** Touch- or mouse-down: snapshot the position and assign a fresh color. */
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

/** Touch / mouse up: just clear the down flag. */
export function updatePointerUpData(pointer: Pointer): void {
	pointer.down = false;
}

export function correctDeltaX(delta: number, aspectRatio: number): number {
	return aspectRatio < 1 ? delta * aspectRatio : delta;
}

export function correctDeltaY(delta: number, aspectRatio: number): number {
	return aspectRatio > 1 ? delta / aspectRatio : delta;
}
