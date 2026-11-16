import type { StaggeredGeometry } from '../staggered.js';

/** MAC dual-volume kinetic energy; open normal faces own half a cell. */
export function faceEnergy(g: StaggeredGeometry, u: ArrayLike<number>): number {
	let e = 0;
	for (let y = 0; y < g.height; y++)
		for (let x = 0; x <= g.width; x++) {
			const value = u[g.u(x, y)];
			e += 0.5 * (x === 0 || x === g.width ? 0.5 : 1) * value * value;
		}
	for (let y = 0; y <= g.height; y++)
		for (let x = 0; x < g.width; x++) {
			const value = u[g.v(x, y)];
			e += 0.5 * (y === 0 || y === g.height ? 0.5 : 1) * value * value;
		}
	return e;
}

/** Same component no-slip stencil as GPU, including anti-symmetric tangential ghosts. */
export function viscousLoss(
	g: StaggeredGeometry,
	u: ArrayLike<number>,
	nu: number
): number {
	let loss = 0;
	for (const c of [0, 1]) {
		const maxX = c === 0 ? g.width : g.width - 1,
			maxY = c === 0 ? g.height - 1 : g.height;
		const index = c === 0 ? g.u : g.v;
		for (let y = 0; y <= maxY; y++)
			for (let x = 0; x <= maxX; x++) {
				const i = index(x, y);
				if (!g.faces[i]) continue;
				const center = u[i];
				let lap = -4 * center;
				for (const [dx, dy] of [
					[-1, 0],
					[1, 0],
					[0, -1],
					[0, 1]
				]) {
					const nx = x + dx,
						ny = y + dy,
						tangent = c === 0 ? dy !== 0 : dx !== 0;
					if (nx < 0 || nx > maxX || ny < 0 || ny > maxY)
						lap += tangent ? -center : center;
					else if (!g.faces[index(nx, ny)]) lap += tangent ? -center : 0;
					else lap += u[index(nx, ny)];
				}
				const edge =
					c === 0 ? x === 0 || x === g.width : y === 0 || y === g.height;
				loss -= nu * (edge ? 0.5 : 1) * center * lap;
			}
	}
	return loss;
}

/** Reservoir pressure is zero at the open faces; pressure work there is exactly zero. */
export function kineticOutflow(
	g: StaggeredGeometry,
	u: ArrayLike<number>
): number {
	let flux = 0;
	for (let y = 0; y < g.height; y++)
		for (const [x, sign] of [
			[0, -1],
			[g.width, 1]
		]) {
			const un = u[g.u(x, y)],
				cellX = Math.min(g.width - 1, x);
			const tangent = 0.5 * (u[g.v(cellX, y)] + u[g.v(cellX, y + 1)]);
			flux += sign * un * 0.5 * (un * un + tangent * tangent);
		}
	return flux;
}

export function forceWork(
	g: StaggeredGeometry,
	before: ArrayLike<number>,
	afterImpulse: ArrayLike<number>,
	force: number,
	dt: number
): number {
	let work = 0;
	for (let y = 0; y < g.height; y++)
		for (let x = 0; x <= g.width; x++) {
			const i = g.u(x, y);
			if (!g.faces[i]) continue;
			work +=
				(x === 0 || x === g.width ? 0.5 : 1) *
				force *
				dt *
				0.5 *
				(before[i] + afterImpulse[i]);
		}
	return work;
}
