import { staggeredLaplacian, type StaggeredGeometry } from '../staggered.js';

/** Test-only Float64 preconditioned CG. Never selected by the engine. */
export function referencePressure(
	g: StaggeredGeometry,
	divergence: ArrayLike<number>,
	initial?: ArrayLike<number>,
	tolerance = 1e-10,
	refinement = 0
) {
	const n = g.cells.length,
		p = Float64Array.from({ length: n }, (_, i) => initial?.[i] ?? 0);
	const r = staggeredLaplacian(g, p),
		z = new Float64Array(n),
		direction = new Float64Array(n),
		ad = new Float64Array(n);
	const active = Int32Array.from(
		Array.from({ length: n }, (_, i) => i).filter((i) => g.cells[i])
	);
	let normB2 = 0,
		normR2 = 0,
		rz = 0;
	for (const i of active) {
		normB2 += divergence[i] ** 2;
		r[i] = -divergence[i] - r[i];
		normR2 += r[i] ** 2;
		z[i] = r[i] / g.diagonal[i];
		direction[i] = z[i];
		rz += r[i] * z[i];
	}
	let iterations = 0;
	for (
		;
		Math.sqrt(normR2 / Math.max(normB2, 1e-300)) > tolerance &&
		iterations < 50_000;
		iterations++
	) {
		let dAd = 0;
		for (const i of active) {
			let value = g.diagonal[i] * direction[i];
			for (let k = 0; k < 4; k++) {
				const j = g.neighbors[4 * i + k];
				if (j >= 0) value -= direction[j];
			}
			ad[i] = value;
			dAd += direction[i] * value;
		}
		if (!(dAd > 0))
			throw new Error('Reference operator is not positive definite');
		const alpha = rz / dAd;
		normR2 = 0;
		let nextRz = 0;
		for (const i of active) {
			p[i] += alpha * direction[i];
			r[i] -= alpha * ad[i];
			normR2 += r[i] ** 2;
			z[i] = r[i] / g.diagonal[i];
			nextRz += r[i] * z[i];
		}
		const beta = nextRz / rz;
		for (const i of active) direction[i] = z[i] + beta * direction[i];
		rz = nextRz;
	}
	// Recompute the true residual, not only CG's recursive residual.
	staggeredLaplacian(g, p, ad);
	normR2 = 0;
	for (const i of active) normR2 += (-divergence[i] - ad[i]) ** 2;
	const relativeResidual = Math.sqrt(normR2 / Math.max(normB2, 1e-300));
	if (relativeResidual > tolerance * 1.02) {
		if (refinement >= 3)
			throw new Error(
				`Reference residual ${relativeResidual} after ${iterations} iterations`
			);
		// Solve the small true residual separately: recursive CG loses accuracy on long channels.
		const correctionRhs = Float64Array.from(divergence, (v, i) => v + ad[i]);
		const correction = referencePressure(
			g,
			correctionRhs,
			undefined,
			1e-6,
			refinement + 1
		);
		for (const i of active) p[i] += correction.pressure[i];
		iterations += correction.iterations;
		staggeredLaplacian(g, p, ad);
		normR2 = 0;
		for (const i of active) normR2 += (-divergence[i] - ad[i]) ** 2;
		const refined = Math.sqrt(normR2 / Math.max(normB2, 1e-300));
		if (refined > tolerance * 1.02)
			throw new Error(
				`Refined reference residual ${refined} after ${iterations} iterations`
			);
		return { pressure: p, iterations, relativeResidual: refined };
	}
	return { pressure: p, iterations, relativeResidual };
}

/** Test-only inverse iteration of the homogeneous pressure operator. */
export async function lowestPressureMode(g: StaggeredGeometry) {
	let vector = Float64Array.from(g.cells, (cell) => (cell ? 1 : 0)),
		previousLambda = Infinity;
	let lambda = 0,
		cgIterations = 0,
		outer = 0,
		quotientChange = Infinity;
	for (; outer < 30; outer++) {
		const solved = referencePressure(
			g,
			Float64Array.from(vector, (v) => -v)
		);
		cgIterations += solved.iterations;
		vector = solved.pressure;
		let norm2 = 0;
		for (const v of vector) norm2 += v * v;
		const norm = Math.sqrt(norm2);
		for (let i = 0; i < vector.length; i++) vector[i] /= norm;
		const av = staggeredLaplacian(g, vector);
		lambda = 0;
		for (let i = 0; i < vector.length; i++) lambda += vector[i] * av[i];
		quotientChange = Math.abs(lambda - previousLambda) / lambda;
		console.log(
			'MAC INVERSE ITERATION',
			JSON.stringify({ outer: outer + 1, lambda, quotientChange, cgIterations })
		);
		await new Promise((r) => setTimeout(r, 0));
		if (quotientChange < 1e-8) break;
		previousLambda = lambda;
	}
	const av = staggeredLaplacian(g, vector);
	let eigenResidual2 = 0;
	for (let i = 0; i < vector.length; i++)
		eigenResidual2 += (av[i] - lambda * vector[i]) ** 2;
	return {
		vector,
		lambda,
		outer: outer + 1,
		quotientChange,
		cgIterations,
		relativeEigenResidual: Math.sqrt(eigenResidual2) / lambda
	};
}

/** Fluid-cell BFS distance; opposite mouths give a geometry-derived channel path. */
export function channelPath(g: StaggeredGeometry): number {
	const distance = new Int32Array(g.cells.length).fill(-1),
		queue = new Int32Array(g.cells.length);
	let front = 0,
		back = 0;
	for (let y = 0; y < g.height; y++)
		if (g.faces[g.u(0, y)]) {
			const i = y * g.width;
			distance[i] = 0;
			queue[back++] = i;
		}
	while (front < back) {
		const i = queue[front++];
		if (
			i % g.width === g.width - 1 &&
			g.faces[g.u(g.width, Math.floor(i / g.width))]
		)
			return distance[i] + 1;
		for (let k = 0; k < 4; k++) {
			const j = g.neighbors[4 * i + k];
			if (j >= 0 && distance[j] < 0) {
				distance[j] = distance[i] + 1;
				queue[back++] = j;
			}
		}
	}
	throw new Error('Valve mouths are disconnected');
}
