import { describe, expect, it } from 'vitest';
import { bakeChebyshevDistanceField } from '../container-shapes.js';

function seededGrid(width: number, height: number, solids: Array<[number, number]>): Uint8Array {
	const data = new Uint8Array(width * height).fill(255);
	for (const [x, y] of solids) data[y * width + x] = 0;
	return data;
}

describe('bakeChebyshevDistanceField', () => {
	it('encodes exact distance from a solid cell', () => {
		const size = 7;
		const clearance = bakeChebyshevDistanceField(seededGrid(size, size, [[3, 3]]), size, size);
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				expect(clearance[y * size + x]).toBe(Math.max(Math.abs(x - 3), Math.abs(y - 3)));
			}
		}
	});

	it('gives a thin wall zero clearance and one-cell halos', () => {
		const size = 9;
		const solids = Array.from({ length: size }, (_, y) => [4, y] as [number, number]);
		const clearance = bakeChebyshevDistanceField(seededGrid(size, size, solids), size, size);
		for (let y = 0; y < size; y++) {
			expect(clearance[y * size + 4]).toBe(0);
			expect(clearance[y * size + 3]).toBe(1);
			expect(clearance[y * size + 5]).toBe(1);
		}
	});

	it('caps empty or distant clearance at the packed maximum', () => {
		const empty = bakeChebyshevDistanceField(seededGrid(4, 4, []), 4, 4);
		expect(empty.every((value) => value === 255)).toBe(true);
		const size = 300;
		const distant = bakeChebyshevDistanceField(seededGrid(size, 1, [[0, 0]]), size, 1);
		expect(distant[size - 1]).toBe(255);
	});

	it('rejects a seed whose extent does not match', () => {
		expect(() => bakeChebyshevDistanceField(new Uint8Array(3), 2, 2)).toThrow(/seed size/);
	});
});

describe('MacCormack clearance radius', () => {
	const required = (dxCells: number, dyCells: number): number =>
		Math.ceil(Math.max(Math.abs(dxCells), Math.abs(dyCells))) + 1;

	it('includes the forward and reverse bilinear stencils', () => {
		expect(required(0, 0)).toBe(1);
		expect(required(0.1, 0)).toBe(2);
		expect(required(1.01, 0)).toBe(3);
		expect(required(-2.2, 1.4)).toBe(4);
	});
});
