import type { StaggeredGeometry } from '../staggered.js';

/** Bench-only sparse LDLᵀ, geometric nested dissection; no iterative stopping rule. */
export function directPressure(g: StaggeredGeometry) {
	const started = performance.now();
	const active: number[] = [];
	for (let i = 0; i < g.cells.length; i++) if (g.cells[i]) active.push(i);
	const order: number[] = [];
	function dissect(cells: number[]) {
		if (cells.length <= 24) {
			order.push(...cells);
			return;
		}
		let xmin = g.width,
			xmax = 0,
			ymin = g.height,
			ymax = 0;
		for (const i of cells) {
			const x = i % g.width,
				y = Math.floor(i / g.width);
			xmin = Math.min(xmin, x);
			xmax = Math.max(xmax, x);
			ymin = Math.min(ymin, y);
			ymax = Math.max(ymax, y);
		}
		const horizontal = xmax - xmin >= ymax - ymin;
		const mid = Math.floor(horizontal ? (xmin + xmax) / 2 : (ymin + ymax) / 2);
		const left: number[] = [],
			right: number[] = [],
			separator: number[] = [];
		for (const i of cells) {
			const coordinate = horizontal ? i % g.width : Math.floor(i / g.width);
			(coordinate < mid ? left : coordinate > mid ? right : separator).push(i);
		}
		dissect(left);
		dissect(right);
		for (const i of separator) order.push(i);
	}
	dissect(active);
	const permutation = Int32Array.from(order),
		n = order.length;
	const inverse = new Int32Array(g.cells.length).fill(-1);
	for (let k = 0; k < n; k++) inverse[permutation[k]] = k;
	const ap = new Int32Array(n + 1),
		rows: number[] = [],
		values: number[] = [];
	for (let k = 0; k < n; k++) {
		const cell = permutation[k];
		rows.push(k);
		values.push(g.diagonal[cell]);
		for (let d = 0; d < 4; d++) {
			const neighbor = g.neighbors[4 * cell + d];
			if (neighbor >= 0 && inverse[neighbor] < k) {
				rows.push(inverse[neighbor]);
				values.push(-1);
			}
		}
		ap[k + 1] = rows.length;
	}
	const ai = Int32Array.from(rows),
		ax = Float64Array.from(values);
	const parent = new Int32Array(n).fill(-1),
		flag = new Int32Array(n).fill(-1);
	const count = new Int32Array(n),
		lp = new Int32Array(n + 1);
	for (let k = 0; k < n; k++) {
		flag[k] = k;
		for (let p = ap[k]; p < ap[k + 1]; p++) {
			let i = ai[p];
			if (i >= k) continue;
			while (flag[i] !== k) {
				if (parent[i] < 0) parent[i] = k;
				count[i]++;
				flag[i] = k;
				i = parent[i];
			}
		}
	}
	for (let k = 0; k < n; k++) lp[k + 1] = lp[k] + count[k];
	const li = new Int32Array(lp[n]),
		lx = new Float64Array(lp[n]);
	const diagonal = new Float64Array(n),
		y = new Float64Array(n);
	const pattern = new Int32Array(n);
	count.fill(0);
	flag.fill(-1);
	for (let k = 0; k < n; k++) {
		let top = n;
		flag[k] = k;
		for (let p = ap[k]; p < ap[k + 1]; p++) {
			let i = ai[p],
				length = 0;
			y[i] += ax[p];
			while (flag[i] !== k) {
				pattern[length++] = i;
				flag[i] = k;
				i = parent[i];
			}
			while (length > 0) pattern[--top] = pattern[--length];
		}
		diagonal[k] = y[k];
		y[k] = 0;
		for (; top < n; top++) {
			const i = pattern[top],
				yi = y[i],
				end = lp[i] + count[i];
			y[i] = 0;
			for (let p = lp[i]; p < end; p++) y[li[p]] -= lx[p] * yi;
			const lki = yi / diagonal[i];
			diagonal[k] -= lki * yi;
			li[end] = k;
			lx[end] = lki;
			count[i]++;
		}
		if (!(diagonal[k] > 0)) throw new Error(`Non-SPD direct pivot ${k}`);
	}
	const factorMs = performance.now() - started;
	const x = new Float64Array(n);
	return {
		stats: {
			method: 'Float64 sparse LDLᵀ, geometric nested dissection',
			cells: n,
			nonzeros: lp[n],
			factorMs,
			factorBytes:
				permutation.byteLength +
				lp.byteLength +
				li.byteLength +
				lx.byteLength +
				diagonal.byteLength,
			workspaceBytes:
				x.byteLength +
				inverse.byteLength +
				ap.byteLength +
				ai.byteLength +
				ax.byteLength +
				parent.byteLength +
				flag.byteLength +
				count.byteLength +
				y.byteLength +
				pattern.byteLength
		},
		solve(
			divergence: ArrayLike<number>,
			out = new Float64Array(g.cells.length)
		) {
			for (let i = 0; i < n; i++) x[i] = -divergence[permutation[i]];
			for (let i = 0; i < n; i++)
				for (let p = lp[i]; p < lp[i + 1]; p++) x[li[p]] -= lx[p] * x[i];
			for (let i = 0; i < n; i++) x[i] /= diagonal[i];
			for (let i = n - 1; i >= 0; i--)
				for (let p = lp[i]; p < lp[i + 1]; p++) x[i] -= lx[p] * x[li[p]];
			for (let i = 0; i < n; i++) out[permutation[i]] = x[i];
			let residual2 = 0,
				rhs2 = 0;
			for (const i of permutation) {
				let value = g.diagonal[i] * out[i] + divergence[i];
				for (let k = 0; k < 4; k++) {
					const neighbor = g.neighbors[4 * i + k];
					if (neighbor >= 0) value -= out[neighbor];
				}
				residual2 += value * value;
				rhs2 += divergence[i] ** 2;
			}
			const relativeResidual = Math.sqrt(residual2 / Math.max(rhs2, 1e-300));
			if (!(relativeResidual <= 1e-8))
				throw new Error(`Direct residual ${relativeResidual}`);
			return out;
		}
	};
}
