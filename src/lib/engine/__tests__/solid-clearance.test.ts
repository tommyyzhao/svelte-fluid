import { describe, expect, it } from 'vitest';
import { bakeSolidClearanceData, type MaskContext } from '../container-shapes.js';

function mask(w: number, h: number, solids: Array<[number, number]>): MaskContext {
	const data = new Uint8Array(w * h);
	for (const [x, y] of solids) data[y * w + x] = 255;
	return { data, width: w, height: h };
}

describe('bakeSolidClearanceData', () => {
	it('encodes exact Chebyshev distance from a solid cell', () => {
		const size = 7;
		const clearance = bakeSolidClearanceData(mask(size, size, [[3, 3]]), size, size);
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				expect(clearance[y * size + x]).toBe(Math.max(Math.abs(x - 3), Math.abs(y - 3)));
			}
		}
	});

	it('gives a represented thin wall zero clearance and one-cell halos', () => {
		const size = 9;
		const solids = Array.from({ length: size }, (_, y) => [4, y] as [number, number]);
		const clearance = bakeSolidClearanceData(mask(size, size, solids), size, size);
		for (let y = 0; y < size; y++) {
			expect(clearance[y * size + 4]).toBe(0);
			expect(clearance[y * size + 3]).toBe(1);
			expect(clearance[y * size + 5]).toBe(1);
		}
	});

	it('uses the same top-down mask to bottom-up UV mapping as the solver', () => {
		// Mask row 0 is canvas-top, therefore it lands in the highest sim-grid y.
		const clearance = bakeSolidClearanceData(mask(4, 4, [[0, 0]]), 4, 4);
		expect(clearance[3 * 4]).toBe(0);
		expect(clearance[0]).toBe(3);
	});

	it('caps empty or distant clearance at the R8 maximum', () => {
		const empty = bakeSolidClearanceData(mask(4, 4, []), 4, 4);
		expect(empty.every((value) => value === 255)).toBe(true);

		const size = 300;
		const distant = bakeSolidClearanceData(mask(size, 1, [[0, 0]]), size, 1);
		expect(distant[size - 1]).toBe(255);
	});
});

describe('MacCormack clearance radius', () => {
	const required = (dxCells: number, dyCells: number): number =>
		Math.ceil(Math.max(Math.abs(dxCells), Math.abs(dyCells))) + 1;
	const fallsBack = (clearance: number, dxCells: number, dyCells: number): boolean =>
		clearance <= required(dxCells, dyCells);

	it('includes the complete forward and reverse bilinear stencils', () => {
		expect(required(0, 0)).toBe(1);
		expect(required(0.1, 0)).toBe(2);
		expect(required(1, 0)).toBe(2);
		expect(required(1.01, 0)).toBe(3);
		expect(required(-2.2, 1.4)).toBe(4);
	});

	it('falls back at the requested clearance boundary', () => {
		expect(fallsBack(3, 1.01, 0)).toBe(true);
		expect(fallsBack(4, 1.01, 0)).toBe(false);
	});

	it('uses the dynamic trace radius for open-edge crossings', () => {
		const nearOpenEdge = (u: number, cellsFromEdge: number, texel: number): boolean =>
			u <= cellsFromEdge * texel;
		expect(nearOpenEdge(2.5 / 128, required(3.2, 0), 1 / 128)).toBe(true);
		expect(nearOpenEdge(6.5 / 128, required(3.2, 0), 1 / 128)).toBe(false);
	});
});
