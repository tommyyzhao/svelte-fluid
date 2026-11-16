import type { StaggeredGeometry } from '$lib/engine/staggered.js';

/** Geodesic-band connected aggregates; exact piecewise-constant Galerkin operator. */
export function coarseGeometry(
	g: StaggeredGeometry,
	direction: 1 | -1,
	bands: number
) {
	if (!Number.isInteger(bands) || bands < 2 || bands > 256)
		throw new RangeError('Invalid coarse bands');
	const n = g.cells.length,
		distance = new Int32Array(n).fill(-1),
		queue = new Int32Array(n);
	let head = 0,
		end = 0,
		farthest = 0;
	for (let y = 0; y < g.height; y++) {
		const i = y * g.width + (direction > 0 ? 0 : g.width - 1);
		if (g.cells[i]) {
			distance[i] = 0;
			queue[end++] = i;
		}
	}
	while (head < end) {
		const i = queue[head++];
		for (let k = 0; k < 4; k++) {
			const j = g.neighbors[4 * i + k];
			if (j >= 0 && distance[j] < 0) {
				distance[j] = distance[i] + 1;
				farthest = Math.max(farthest, distance[j]);
				queue[end++] = j;
			}
		}
	}
	for (let i = 0; i < n; i++)
		if (g.cells[i] && distance[i] < 0)
			throw new Error('Disconnected pressure pocket');
	const band = (i: number) =>
		Math.min(bands - 1, Math.floor((distance[i] * bands) / (farthest + 1)));
	const ids = new Int32Array(n).fill(-1),
		lists: number[][] = [];
	for (let seed = 0; seed < n; seed++) {
		if (!g.cells[seed] || ids[seed] >= 0) continue;
		const id = lists.length,
			cells: number[] = [],
			bucket = band(seed);
		head = 0;
		end = 0;
		queue[end++] = seed;
		ids[seed] = id;
		while (head < end) {
			const i = queue[head++];
			cells.push(i);
			for (let k = 0; k < 4; k++) {
				const j = g.neighbors[4 * i + k];
				if (j >= 0 && ids[j] < 0 && band(j) === bucket) {
					ids[j] = id;
					queue[end++] = j;
				}
			}
		}
		lists.push(cells);
	}
	const count = lists.length,
		maxCells = Math.max(...lists.map((c) => c.length));
	if (count > 2048 || maxCells > 4096)
		throw new Error('Coarse reduction capacity exceeded');
	const matrix = new Float64Array(count * count);
	for (let i = 0; i < n; i++) {
		const row = ids[i];
		if (row < 0) continue;
		matrix[row * count + row] += g.diagonal[i];
		for (let k = 0; k < 4; k++) {
			const j = g.neighbors[4 * i + k];
			if (j >= 0) matrix[row * count + ids[j]]--;
		}
	}
	const l = new Float64Array(matrix);
	for (let i = 0; i < count; i++)
		for (let j = 0; j <= i; j++) {
			let value = matrix[i * count + j];
			for (let k = 0; k < j; k++) value -= l[i * count + k] * l[j * count + k];
			if (i === j) {
				if (!(value > 0)) throw new Error('Non-SPD coarse operator');
				l[i * count + j] = Math.sqrt(value);
			} else l[i * count + j] = value / l[j * count + j];
		}
	const inverse = new Float32Array(count * count),
		work = new Float64Array(count);
	for (let column = 0; column < count; column++) {
		for (let i = 0; i < count; i++) {
			let value = i === column ? 1 : 0;
			for (let k = 0; k < i; k++) value -= l[i * count + k] * work[k];
			work[i] = value / l[i * count + i];
		}
		for (let i = count - 1; i >= 0; i--) {
			let value = work[i];
			for (let k = i + 1; k < count; k++) value -= l[k * count + i] * work[k];
			work[i] = value / l[i * count + i];
			inverse[i * count + column] = work[i];
		}
	}
	const cellList = new Float32Array(count * maxCells).fill(-1);
	for (let i = 0; i < count; i++) cellList.set(lists[i], i * maxCells);
	return {
		ids: Float32Array.from(ids),
		inverse,
		matrix,
		count,
		maxCells,
		cellList,
		bands,
		farthest
	};
}
