import { expect, it } from 'vitest';
import {
	staggeredGeometry,
	staggeredLaplacian
} from '$lib/engine/staggered.js';
import { coarseGeometry } from './__benches__/coarse.js';

it('Galerkin aggregates preserve operator energy and invert the SPD coarse matrix', () => {
	const g = staggeredGeometry(
		32,
		12,
		(x, y) => !(x > 10 && x < 22 && y > 3 && y < 8),
		{ left: 'open', right: 'open' }
	);
	const c = coarseGeometry(g, 1, 8),
		n = c.count;
	const z = Float64Array.from({ length: n }, (_, i) => Math.sin(i + 1));
	const fine = Float64Array.from(c.ids, (id) => (id < 0 ? 0 : z[id]));
	const af = staggeredLaplacian(g, fine),
		restricted = new Float64Array(n);
	for (let i = 0; i < af.length; i++)
		if (c.ids[i] >= 0) restricted[c.ids[i]] += af[i];
	for (let i = 0; i < n; i++) {
		let value = 0;
		for (let j = 0; j < n; j++) value += c.matrix[i * n + j] * z[j];
		expect(restricted[i]).toBeCloseTo(value, 10);
		let restored = 0;
		for (let j = 0; j < n; j++)
			restored += c.inverse[i * n + j] * restricted[j];
		expect(restored).toBeCloseTo(z[i], 4);
	}
});
