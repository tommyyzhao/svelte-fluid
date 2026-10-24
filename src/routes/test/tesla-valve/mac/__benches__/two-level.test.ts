import { expect, it, vi } from 'vitest';
// @ts-expect-error Node-only bench; package intentionally has no @types/node dependency.
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
// @ts-expect-error Node-only bench; not part of the browser bundle.
import { resolve } from 'node:path';
// @ts-expect-error Node-only oracle process; uv is owner-approved.
import { execFileSync } from 'node:child_process';
import { staggeredGeometry } from '$lib/engine/staggered.js';
import { paperGeometry } from '../geometry.js';
import { twoLevelGeometry } from './two-level.js';

// Independent ray crossing makes the actual paperGeometry callable in node.
class PolygonPath {
	polygons: number[][][];
	constructor(path: string) {
		this.polygons = path
			.split('M ')
			.slice(1)
			.map((part) => {
				const a = part.match(/-?\d+(?:\.\d+)?/g)!.map(Number),
					points = [];
				for (let i = 0; i < a.length; i += 2) points.push([a[i], a[i + 1]]);
				return points;
			});
	}
}
function paperGrid(width: number) {
	vi.stubGlobal('Path2D', PolygonPath);
	vi.stubGlobal(
		'OffscreenCanvas',
		class {
			getContext() {
				return {
					isPointInPath(path: PolygonPath, x: number, y: number) {
						let inside = false;
						for (const polygon of path.polygons)
							for (let i = 0; i < polygon.length; i++) {
								const a = polygon[i],
									b = polygon[(i + 1) % polygon.length];
								if (
									a[1] > y !== b[1] > y &&
									x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
								)
									inside = !inside;
							}
						return inside;
					}
				};
			}
		}
	);
	try {
		return paperGeometry(width).grid;
	} finally {
		vi.unstubAllGlobals();
	}
}
function decode(s: string) {
	const bytes = Buffer.from(s, 'base64');
	return new Float64Array(
		bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
	);
}
function relative(a: ArrayLike<number>, b: ArrayLike<number>) {
	expect(a.length).toBe(b.length);
	let error = 0,
		scale = 0;
	for (let i = 0; i < a.length; i++) {
		error += (a[i] - b[i]) ** 2;
		scale += b[i] ** 2;
	}
	return Math.sqrt(error / scale);
}
it('harmonic interpolation preserves constants, symmetry, inverse and straight-channel ramp ceiling', () => {
	const g = staggeredGeometry(33, 5, () => true, {
			left: 'open',
			right: 'open'
		}),
		c = twoLevelGeometry(g, 1);
	for (const row of c.rows)
		expect([...row.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 11);
	for (let i = 0; i < c.count; i++)
		for (let j = 0; j < c.count; j++) {
			expect(c.matrix[i * c.count + j]).toBeCloseTo(
				c.matrix[j * c.count + i],
				11
			);
			let v = 0;
			for (let k = 0; k < c.count; k++)
				v += c.matrix[i * c.count + k] * c.inverse[k * c.count + j];
			expect(v).toBeCloseTo(+(i === j), 10);
		}
	const centers = new Float64Array(c.count),
		sizes = new Int32Array(c.count);
	for (let i = 0; i < g.cells.length; i++)
		if ((i % g.width) % 8 <= 1 || i % g.width === 32) {
			const id = c.rows[i].keys().next().value!;
			centers[id] += i % g.width;
			sizes[id]++;
		}
	for (let j = 0; j < c.count; j++) centers[j] /= sizes[j];
	for (let i = 0; i < g.cells.length; i++) {
		let value = 0;
		for (const [id, p] of c.rows[i]) value += p * centers[id];
		expect(Math.abs(value - (i % g.width))).toBeLessThanOrEqual(0.50000000001);
	}
	expect(() => twoLevelGeometry(g, 0 as 1)).toThrow();
});

const directory = resolve('.svelte-kit/two-level'),
	capture = resolve(directory, 'capture-worst.json');
// The independent oracle may provision Python packages; never run it implicitly.
it.skipIf(process.env.SVELTE_FLUID_PYTHON_ORACLE !== '1' || !existsSync(capture))(
	'matches independent Python P, Galerkin Ac and W correction within 1e-6 Float64',
	() => {
		const oracle = resolve(directory, 'python-reference.json');
		if (!existsSync(oracle)) {
			mkdirSync(directory, { recursive: true });
			execFileSync(
				'uv',
				[
					'run',
					'--with',
					'numpy',
					'--with',
					'scipy',
					'python',
					'-I',
					'-c',
					`
import runpy,sys,json,base64,pathlib,numpy as np
from scipy import linalg
m=runpy.run_path(sys.argv[1]); raw=json.loads(pathlib.Path(sys.argv[2]).read_text()); g=m['geometry'](raw)
p,f,stats=m['interpolation'](g,8); q=m['decode'](raw['previous'],'<f8')[g['mask'].ravel()]; rhs=-m['decode'](raw['rhs'],'<f8')[g['mask'].ravel()]
e=p@linalg.cho_solve(f,p.T@(rhs-g['a']@q)); q+=e
enc=lambda x:base64.b64encode(np.asarray(x,dtype='<f8').tobytes()).decode()
rows=np.repeat(np.flatnonzero(g['mask'].ravel()),np.diff(p.indptr)); cols=p.indices
out=dict(stats=stats,rows=rows.tolist(),cols=cols.tolist(),values=enc(p.data),matrix=enc((p.T@g['a']@p).toarray()),correction=enc(q),fluid=np.flatnonzero(g['mask'].ravel()).tolist())
pathlib.Path(sys.argv[3]).write_text(json.dumps(out))
`,
					resolve(
						'src/routes/test/tesla-valve/mac/__benches__/harmonic-pcg.py'
					),
					capture,
					oracle
				],
				{
					env: {
						...process.env,
						OPENBLAS_NUM_THREADS: '1',
						VECLIB_MAXIMUM_THREADS: '1',
						OMP_NUM_THREADS: '1'
					},
					timeout: 180000
				}
			);
		}
		const raw = JSON.parse(readFileSync(capture, 'utf8')),
			ref = JSON.parse(readFileSync(oracle, 'utf8'));
		const g = paperGrid(raw.options.width),
			c = twoLevelGeometry(g, raw.options.direction),
			values = decode(ref.values);
		expect(c.count).toBe(ref.stats.count);
		expect(c.nnz).toBe(ref.stats.nnz);
		const actual = Float64Array.from(
			ref.rows,
			(i: number, k) => c.rows[i].get(ref.cols[k]) ?? 0
		);
		const pError = relative(actual, values),
			acError = relative(c.matrix, decode(ref.matrix));
		const q = decode(raw.previous);
		c.correct(q, decode(raw.rhs));
		const referenceQ = decode(ref.correction),
			previous = decode(raw.previous);
		const qError = relative(
			Float64Array.from(ref.fluid, (i: number) => q[i]),
			referenceQ
		);
		const correctionError = relative(
			Float64Array.from(ref.fluid, (i: number) => q[i] - previous[i]),
			Float64Array.from(
				ref.fluid,
				(i: number, k) => referenceQ[k] - previous[i]
			)
		);
		writeFileSync(
			resolve(directory, 'cpu-report.json'),
			JSON.stringify(
				{
					count: c.count,
					nnz: c.nnz,
					meanRowNnz: c.meanRowNnz,
					maxRowNnz: c.maxRowNnz,
					maxColumnNnz: c.maxColumnNnz,
					pError,
					acError,
					qError,
					correctionError
				},
				null,
				2
			)
		);
		expect(pError).toBeLessThanOrEqual(1e-6);
		expect(acError).toBeLessThanOrEqual(1e-6);
		expect(qError).toBeLessThanOrEqual(1e-6);
		expect(correctionError).toBeLessThanOrEqual(1e-6);
	},
	240000
);
