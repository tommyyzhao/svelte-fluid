import { expect, it } from 'vitest';
import { staggeredGeometry, staggeredLaplacian } from '../staggered.js';
import { directPressure } from './staggered-direct.js';
import { referencePressure } from './staggered-reference.js';

it('direct sparse factor agrees with CG on a masked open-face operator', () => {
	const g = staggeredGeometry(53, 21, (x, y) => !(x > 13 && x < 27 && y > 8), {
		left: 'open',
		right: 'open'
	});
	const rhs = Float64Array.from(g.cells, (v, i) =>
		v ? Math.sin(i * 0.13) : 0
	);
	const direct = directPressure(g),
		q = direct.solve(rhs),
		cg = referencePressure(g, rhs);
	const aq = staggeredLaplacian(g, q);
	let error = 0,
		norm = 0,
		difference = 0,
		pressureNorm = 0;
	for (let i = 0; i < rhs.length; i++) {
		error += (aq[i] + rhs[i]) ** 2;
		norm += rhs[i] ** 2;
		difference += (q[i] - cg.pressure[i]) ** 2;
		pressureNorm += cg.pressure[i] ** 2;
	}
	expect(Math.sqrt(error / norm)).toBeLessThan(1e-10);
	expect(Math.sqrt(difference / pressureNorm)).toBeLessThan(1e-8);
	expect(direct.solve(rhs)).toEqual(q);
});
