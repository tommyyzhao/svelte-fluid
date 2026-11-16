import { expect, it } from 'vitest';
import {
	staggeredGeometry,
	staggeredLaplacian
} from '$lib/engine/staggered.js';
import { smoothedReference } from './__benches__/smoothed-reference.js';

it('Float64 smoothed Galerkin correction cannot increase pressure energy error', () => {
	const g = staggeredGeometry(24, 8, () => true, {
			left: 'open',
			right: 'open'
		}),
		s = smoothedReference(g, 8);
	const exact = Float64Array.from(g.cells, (_, i) => Math.sin(i / 17)),
		rhs = Float64Array.from(staggeredLaplacian(g, exact), (v) => -v),
		q = new Float64Array(exact.length);
	const energy = () => {
		const e = Float64Array.from(q, (v, i) => v - exact[i]),
			ae = staggeredLaplacian(g, e);
		return e.reduce((sum, v, i) => sum + v * ae[i], 0);
	};
	const before = energy();
	s.correct(q, rhs);
	expect(energy()).toBeLessThanOrEqual(before * (1 + 1e-12));
});
