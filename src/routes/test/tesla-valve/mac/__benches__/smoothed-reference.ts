import {
	staggeredLaplacian,
	type StaggeredGeometry
} from '$lib/engine/staggered.js';
import { coarseGeometry } from './coarse.js';

/** Bench-only rejected C1 candidate; no GPU/production evolution (ADR 0119). */
export function smoothedReference(g: StaggeredGeometry, bands = 256) {
	const c = coarseGeometry(g, -1, bands),
		n = c.count,
		omega = 2 / 3;
	const rows: Map<number, number>[] = Array.from(
		{ length: g.cells.length },
		() => new Map()
	);
	for (let i = 0; i < g.cells.length; i++) {
		if (!g.cells[i]) continue;
		const row = rows[i];
		row.set(c.ids[i], 1 - omega);
		for (let k = 0; k < 4; k++) {
			const j = g.neighbors[4 * i + k];
			if (j >= 0)
				row.set(c.ids[j], (row.get(c.ids[j]) ?? 0) + omega / g.diagonal[i]);
		}
	}
	const matrix = new Float64Array(n * n);
	for (let i = 0; i < g.cells.length; i++) {
		if (!g.cells[i]) continue;
		const ar = new Map<number, number>();
		for (const [a, v] of rows[i]) ar.set(a, g.diagonal[i] * v);
		for (let k = 0; k < 4; k++) {
			const j = g.neighbors[4 * i + k];
			if (j >= 0) for (const [a, v] of rows[j]) ar.set(a, (ar.get(a) ?? 0) - v);
		}
		for (const [a, p] of rows[i])
			for (const [b, v] of ar) matrix[a * n + b] += p * v;
	}
	const l = new Float64Array(matrix);
	for (let i = 0; i < n; i++)
		for (let j = 0; j <= i; j++) {
			let v = matrix[i * n + j];
			for (let k = 0; k < j; k++) v -= l[i * n + k] * l[j * n + k];
			if (i === j) {
				if (!(v > 0)) throw new Error('SA non-SPD');
				l[i * n + j] = Math.sqrt(v);
			} else l[i * n + j] = v / l[j * n + j];
		}
	const rc = new Float64Array(n),
		ec = new Float64Array(n);
	return {
		count: n,
		correct(q: Float64Array, rhs: ArrayLike<number>) {
			const aq = staggeredLaplacian(g, q);
			rc.fill(0);
			for (let i = 0; i < q.length; i++)
				if (g.cells[i])
					for (const [a, v] of rows[i]) rc[a] += v * (-rhs[i] - aq[i]);
			for (let i = 0; i < n; i++) {
				let v = rc[i];
				for (let j = 0; j < i; j++) v -= l[i * n + j] * ec[j];
				ec[i] = v / l[i * n + i];
			}
			for (let i = n - 1; i >= 0; i--) {
				let v = ec[i];
				for (let j = i + 1; j < n; j++) v -= l[j * n + i] * ec[j];
				ec[i] = v / l[i * n + i];
			}
			for (let i = 0; i < q.length; i++)
				if (g.cells[i]) for (const [a, v] of rows[i]) q[i] += v * ec[a];
		}
	};
}
