import { describe, expect, it } from 'vitest';
import {
	staggeredGeometry,
	staggeredDivergence,
	staggeredGradient,
	staggeredLaplacian
} from '../staggered.js';

describe('MAC operator algebra', () => {
	it('packs right/top faces, left/bottom padding, pins all solid faces', () => {
		const g = staggeredGeometry(3, 2, (x, y) => !(x === 1 && y === 1), {
			left: 'open',
			right: 'open',
			bottom: 'open'
		});
		expect(g.u(1, 0)).toBe(0);
		expect(g.v(0, 1)).toBe(1);
		expect(g.u(0, 0)).toBe(6);
		expect(g.v(0, 0)).toBe(17);
		expect(g.faces[g.u(1, 1)]).toBe(0);
		expect(g.faces[g.v(1, 1)]).toBe(0);
		expect(g.faces[g.u(0, 0)]).toBe(255);
		expect(g.diagonal[0]).toBe(6);
	});
	it.each([
		{},
		{ left: 'open', right: 'open', top: 'open', bottom: 'open' }
	] as const)(
		'DG equals the five-point Laplacian including walls and open ghosts: %j',
		(boundary) => {
			const g = staggeredGeometry(
				9,
				7,
				(x, y) => !(x === 4 && y > 1 && y < 5),
				boundary
			);
			const p = Float64Array.from(g.cells, (cell, i) =>
				cell ? Math.sin(i * 0.71) : 0
			);
			const gradient = staggeredGradient(g, p),
				divergence = staggeredDivergence(g, gradient),
				laplacian = staggeredLaplacian(g, p);
			for (let i = 0; i < p.length; i++)
				expect(divergence[i]).toBeCloseTo(-laplacian[i], 12);
			for (let i = 0; i < gradient.length; i++)
				if (!g.faces[i]) expect(gradient[i]).toBe(0);
			const q = Float64Array.from(g.cells, (cell, i) =>
					cell ? Math.cos(i * 0.31) : 0
				),
				aq = staggeredLaplacian(g, q);
			const dot = (a: Float64Array, b: Float64Array) =>
				a.reduce((sum, v, i) => sum + v * b[i], 0);
			expect(dot(p, aq)).toBeCloseTo(dot(q, laplacian), 10);
			expect(dot(p, laplacian)).toBeGreaterThan(0);
		}
	);
	it('face flux telescopes exactly over arbitrary slabs', () => {
		const g = staggeredGeometry(
			20,
			8,
			(x, y) => y > 0 && y < 7 && !(x === 8 && y > 4),
			{ left: 'open', right: 'open' }
		);
		const velocity = Float64Array.from(g.faces, (open, i) =>
			open ? Math.sin(i * 0.23) : 0
		);
		const d = staggeredDivergence(g, velocity),
			flux = (x: number) =>
				Array.from({ length: g.height }, (_, y) => velocity[g.u(x, y)]).reduce(
					(a, b) => a + b,
					0
				);
		for (const [a, b] of [
			[0, 20],
			[4, 9],
			[9, 19]
		]) {
			let total = 0;
			for (let y = 0; y < g.height; y++)
				for (let x = a; x < b; x++) total += d[y * g.width + x];
			expect(flux(b) - flux(a)).toBeCloseTo(total, 12);
		}
	});
	it('rejects invalid dimensions', () => {
		for (const n of [0, -1, 0.5, NaN, Infinity])
			expect(() => staggeredGeometry(n, 8, () => true)).toThrow(RangeError);
	});
});
