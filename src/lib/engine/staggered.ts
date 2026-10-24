import type { FlowBoundary } from './types.js';

/** @internal MAC geometry, bottom-up. R=right, G=top; padding holds left/bottom. */
export function staggeredGeometry(
	width: number,
	height: number,
	fluid: (x: number, y: number) => boolean,
	boundary: FlowBoundary = {}
) {
	if (
		!Number.isInteger(width) ||
		!Number.isInteger(height) ||
		width < 1 ||
		height < 1
	)
		throw new RangeError('Invalid staggered grid dimensions');
	const cells = new Uint8Array(width * height);
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++)
			cells[y * width + x] = fluid(x, y) ? 255 : 0;
	const at = (x: number, y: number) =>
		x >= 0 && x < width && y >= 0 && y < height && cells[y * width + x] !== 0;
	const faces = new Uint8Array((width + 1) * (height + 1) * 2);
	const u = (x: number, y: number) =>
		(y * (width + 1) + (x === 0 ? width : x - 1)) * 2;
	const v = (x: number, y: number) =>
		((y === 0 ? height : y - 1) * (width + 1) + x) * 2 + 1;
	for (let y = 0; y < height; y++)
		for (let x = 0; x <= width; x++)
			faces[u(x, y)] = (
				x === 0
					? boundary.left === 'open' && at(0, y)
					: x === width
					? boundary.right === 'open' && at(width - 1, y)
					: at(x - 1, y) && at(x, y)
			)
				? 255
				: 0;
	for (let y = 0; y <= height; y++)
		for (let x = 0; x < width; x++)
			faces[v(x, y)] = (
				y === 0
					? boundary.bottom === 'open' && at(x, 0)
					: y === height
					? boundary.top === 'open' && at(x, height - 1)
					: at(x, y - 1) && at(x, y)
			)
				? 255
				: 0;
	const diagonal = new Float64Array(width * height);
	const neighbors = new Int32Array(width * height * 4).fill(-1);
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			const i = y * width + x;
			if (!cells[i]) continue;
			for (const [k, open, inside, n] of [
				[0, faces[u(x, y)], x > 0, i - 1],
				[1, faces[u(x + 1, y)], x < width - 1, i + 1],
				[2, faces[v(x, y)], y > 0, i - width],
				[3, faces[v(x, y + 1)], y < height - 1, i + width]
			] as const) {
				if (!open) continue;
				diagonal[i] += inside ? 1 : 2;
				if (inside) neighbors[4 * i + k] = n;
			}
		}
	return { width, height, cells, faces, diagonal, neighbors, u, v };
}

export type StaggeredGeometry = ReturnType<typeof staggeredGeometry>;

/** @internal Positive operator -DG; open-face half-cell distance gives conductance 2. */
export function staggeredLaplacian(
	g: StaggeredGeometry,
	p: ArrayLike<number>,
	out = new Float64Array(g.cells.length)
): Float64Array {
	for (let i = 0; i < out.length; i++) {
		let value = g.diagonal[i] * p[i];
		for (let k = 0; k < 4; k++) {
			const n = g.neighbors[4 * i + k];
			if (n >= 0) value -= p[n];
		}
		out[i] = value;
	}
	return out;
}

/** @internal Compact divergence in cells/second; no interpolated cell velocities. */
export function staggeredDivergence(
	g: StaggeredGeometry,
	velocity: ArrayLike<number>
): Float64Array {
	const d = new Float64Array(g.cells.length);
	for (let y = 0; y < g.height; y++)
		for (let x = 0; x < g.width; x++) {
			const i = y * g.width + x;
			if (g.cells[i])
				d[i] =
					velocity[g.u(x + 1, y)] -
					velocity[g.u(x, y)] +
					velocity[g.v(x, y + 1)] -
					velocity[g.v(x, y)];
		}
	return d;
}

/** @internal Gradient in the exact packed face layout. Closed faces stay exactly zero. */
export function staggeredGradient(
	g: StaggeredGeometry,
	p: ArrayLike<number>
): Float64Array {
	const out = new Float64Array(g.faces.length),
		{ width: w, height: h } = g;
	for (let y = 0; y < h; y++)
		for (let x = 0; x <= w; x++) {
			const i = g.u(x, y);
			if (g.faces[i])
				out[i] =
					x === 0
						? 2 * p[y * w]
						: x === w
						? -2 * p[y * w + w - 1]
						: p[y * w + x] - p[y * w + x - 1];
		}
	for (let y = 0; y <= h; y++)
		for (let x = 0; x < w; x++) {
			const i = g.v(x, y);
			if (g.faces[i])
				out[i] =
					y === 0
						? 2 * p[x]
						: y === h
						? -2 * p[(h - 1) * w + x]
						: p[y * w + x] - p[(y - 1) * w + x];
		}
	return out;
}
