import type { StaggeredGeometry } from '$lib/engine/staggered.js';
import { staggeredLaplacian } from '$lib/engine/staggered.js';
import {
	compileShader,
	makeProgram,
	createFBO,
	disposeFBO,
	createBlit,
	type ProgramWrap
} from '$lib/engine/gl-utils.js';
import type { DoubleFBO, FBO } from '$lib/engine/internal-types.js';
import {
	baseVertexShader,
	staggeredPressureJacobi2Shader
} from '$lib/engine/shaders.js';
import * as S from './two-level-shaders.js';

function cholesky(a: Float64Array, n: number, band = n - 1) {
	const stride = band + 1,
		l = new Float64Array(n * stride);
	for (let i = 0; i < n; i++)
		for (let j = Math.max(0, i - band); j <= i; j++) {
			let value = a[i * stride + i - j];
			for (let k = Math.max(0, i - band, j - band); k < j; k++)
				value -= l[i * stride + i - k] * l[j * stride + j - k];
			if (i === j) {
				if (!(value > 0)) throw new Error('Two-level operator is not SPD');
				l[i * stride] = Math.sqrt(value);
			} else l[i * stride + i - j] = value / l[j * stride];
		}
	return (rhs: Float64Array) => {
		const x = rhs.slice();
		for (let i = 0; i < n; i++) {
			for (let j = Math.max(0, i - band); j < i; j++)
				x[i] -= l[i * stride + i - j] * x[j];
			x[i] /= l[i * stride];
		}
		for (let i = n - 1; i >= 0; i--) {
			for (let j = i + 1; j <= Math.min(n - 1, i + band); j++)
				x[i] -= l[j * stride + j - i] * x[j];
			x[i] /= l[i * stride];
		}
		return x;
	};
}

/** CPU setup only. Same fixed left-rooted BFS as harmonic-pcg.py in both flows. */
export function twoLevelGeometry(
	g: StaggeredGeometry,
	direction: 1 | -1,
	spacing = 8
) {
	if (
		![1, -1].includes(direction) ||
		!Number.isInteger(spacing) ||
		spacing < 2 ||
		spacing > 64
	)
		throw new RangeError('Invalid two-level geometry options');
	const n = g.cells.length,
		distance = new Int32Array(n).fill(-1),
		queue = new Int32Array(n);
	let head = 0,
		tail = 0;
	for (let y = 0; y < g.height; y++) {
		const i = y * g.width;
		if (g.cells[i]) {
			distance[i] = 0;
			queue[tail++] = i;
		}
	}
	while (head < tail) {
		const i = queue[head++];
		for (let k = 0; k < 4; k++) {
			const j = g.neighbors[4 * i + k];
			if (j >= 0 && distance[j] < 0) {
				distance[j] = distance[i] + 1;
				queue[tail++] = j;
			}
		}
	}
	const root = new Uint8Array(n),
		labels = new Int32Array(n).fill(-1);
	for (let i = 0; i < n; i++)
		if (g.cells[i]) {
			if (distance[i] < 0) throw new Error('Disconnected two-level grid');
			root[i] = +(distance[i] % spacing <= 1 || i % g.width === g.width - 1);
		}
	const components = (selected: (i: number) => boolean) => {
		const seen = new Uint8Array(n),
			result: number[][] = [];
		for (let i = 0; i < n; i++)
			if (g.cells[i] && selected(i) && !seen[i]) {
				head = 0;
				tail = 1;
				queue[0] = i;
				seen[i] = 1;
				const cells: number[] = [];
				while (head < tail) {
					const a = queue[head++];
					cells.push(a);
					for (let k = 0; k < 4; k++) {
						const b = g.neighbors[4 * a + k];
						if (b >= 0 && selected(b) && !seen[b]) {
							seen[b] = 1;
							queue[tail++] = b;
						}
					}
				}
				result.push(cells.sort((a, b) => a - b));
			}
		return result;
	};
	const roots = components((i) => !!root[i]),
		count = roots.length;
	const rows: Map<number, number>[] = Array.from(
		{ length: n },
		() => new Map()
	);
	roots.forEach((cells, column) => {
		for (const i of cells) {
			labels[i] = column;
			rows[i].set(column, 1);
		}
	});
	const local = new Int32Array(n).fill(-1);
	for (const cells of components((i) => !root[i])) {
		cells.forEach((i, j) => {
			local[i] = j;
		});
		const columns = new Set<number>();
		let band = 0;
		for (const i of cells)
			for (let k = 0; k < 4; k++) {
				const j = g.neighbors[4 * i + k];
				if (j < 0) continue;
				if (root[j]) columns.add(labels[j]);
				else band = Math.max(band, Math.abs(local[i] - local[j]));
			}
		const m = cells.length,
			a = new Float64Array(m * (band + 1));
		for (const i of cells) {
			let degree = 0;
			for (let k = 0; k < 4; k++) {
				const j = g.neighbors[4 * i + k];
				if (j < 0) continue;
				degree++;
				if (!root[j] && local[j] < local[i])
					a[local[i] * (band + 1) + local[i] - local[j]] = -1;
			}
			a[local[i] * (band + 1)] = degree;
		}
		const solve = cholesky(a, m, band);
		for (const column of [...columns].sort((a, b) => a - b)) {
			const rhs = new Float64Array(m);
			for (const i of cells)
				for (let k = 0; k < 4; k++) {
					const j = g.neighbors[4 * i + k];
					if (j >= 0 && labels[j] === column) rhs[local[i]]++;
				}
			const values = solve(rhs);
			for (let j = 0; j < m; j++)
				if (values[j] !== 0) rows[cells[j]].set(column, values[j]);
		}
		for (const i of cells) local[i] = -1;
	}
	const matrix = new Float64Array(count * count),
		columnSizes = new Int32Array(count);
	let nnz = 0,
		maxRowNnz = 0;
	for (let i = 0; i < n; i++)
		if (g.cells[i]) {
			nnz += rows[i].size;
			maxRowNnz = Math.max(maxRowNnz, rows[i].size);
			for (const column of rows[i].keys()) columnSizes[column]++;
			const ar = new Map<number, number>();
			for (const [a, v] of rows[i]) ar.set(a, g.diagonal[i] * v);
			for (let k = 0; k < 4; k++) {
				const j = g.neighbors[4 * i + k];
				if (j >= 0)
					for (const [a, v] of rows[j]) ar.set(a, (ar.get(a) ?? 0) - v);
			}
			for (const [a, p] of rows[i])
				for (const [b, v] of ar) matrix[a * count + b] += p * v;
		}
	const packed = new Float64Array(count * count);
	for (let i = 0; i < count; i++)
		for (let j = 0; j <= i; j++)
			packed[i * count + i - j] = matrix[i * count + j];
	const solve = cholesky(packed, count),
		inverse = new Float64Array(count * count);
	for (let j = 0; j < count; j++) {
		const unit = new Float64Array(count);
		unit[j] = 1;
		const x = solve(unit);
		for (let i = 0; i < count; i++) inverse[i * count + j] = x[i];
	}
	return {
		count,
		rows,
		matrix,
		inverse,
		distance,
		nnz,
		maxRowNnz,
		meanRowNnz: nnz / g.cells.reduce((a, b) => a + +!!b, 0),
		maxColumnNnz: Math.max(...columnSizes),
		correct(q: Float64Array, divergence: ArrayLike<number>) {
			const aq = staggeredLaplacian(g, q),
				rc = new Float64Array(count);
			for (let i = 0; i < n; i++)
				for (const [a, p] of rows[i]) rc[a] += p * (-divergence[i] - aq[i]);
			const ec = solve(rc);
			for (let i = 0; i < n; i++)
				for (const [a, p] of rows[i]) q[i] += p * ec[a];
		}
	};
}

/** Rejected unless every pre-registered gate passes. Never used by the live engine. */
export class TwoLevelPressure {
	readonly geometry: ReturnType<typeof twoLevelGeometry>;
	lastDraws = 0;
	private shaders: WebGLShader[] = [];
	private programs: ProgramWrap[] = [];
	private textures: WebGLTexture[] = [];
	private targets: FBO[] = [];
	private buffers: WebGLBuffer[] = [];
	private blit!: ReturnType<typeof createBlit>;
	private apertures!: WebGLTexture;
	private cells!: WebGLTexture;
	private list!: WebGLTexture;
	private rows!: WebGLTexture;
	private inverse!: WebGLTexture;
	private residual!: FBO;
	private levels: FBO[] = [];
	private coarse!: FBO;
	private disposed = false;
	constructor(
		private gl: WebGL2RenderingContext,
		private grid: StaggeredGeometry,
		direction: 1 | -1
	) {
		this.geometry = twoLevelGeometry(grid, direction);
		try {
			const c = this.geometry,
				limit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
			// ponytail: paper-grid bench only; repack sparse rows before larger grids.
			if (
				c.count > 2048 ||
				c.maxRowNnz > 16 ||
				grid.width * c.maxRowNnz > limit ||
				c.maxColumnNnz > limit
			)
				throw new Error('Two-level bench texture/loop ceiling exceeded');
			let length = c.maxColumnNnz;
			while (length > 1) {
				length = Math.ceil(length / 4);
				this.levels.push(this.target(length, c.count));
			}
			if (this.levels.length !== 7)
				throw new Error(
					'Pre-registered schedule requires seven restriction stages'
				);
			this.residual = this.target(grid.width, grid.height);
			this.coarse = this.target(c.count, 1);
			const lists = new Float32Array(c.maxColumnNnz * c.count * 2),
				offsets = new Int32Array(c.count);
			const rows = new Float32Array(grid.width * grid.height * c.maxRowNnz * 2);
			for (let i = 0; i < c.rows.length; i++) {
				let k = 0;
				for (const [a, p] of c.rows[i]) {
					const j = 2 * (a * c.maxColumnNnz + offsets[a]++);
					lists[j] = i;
					lists[j + 1] = p;
					const r = 2 * (i * c.maxRowNnz + k++);
					rows[r] = a;
					rows[r + 1] = p;
				}
			}
			this.apertures = this.texture(
				grid.faces,
				grid.width + 1,
				grid.height + 1,
				2
			);
			this.cells = this.texture(grid.cells, grid.width, grid.height, 1);
			this.list = this.texture(lists, c.maxColumnNnz, c.count, 2);
			this.rows = this.texture(rows, grid.width * c.maxRowNnz, grid.height, 2);
			this.inverse = this.texture(
				Float32Array.from(c.inverse),
				c.count,
				c.count,
				1
			);
			const vertex = compileShader(gl, gl.VERTEX_SHADER, baseVertexShader);
			this.shaders.push(vertex);
			for (const source of [
				staggeredPressureJacobi2Shader,
				S.residualShader,
				S.restrictShader,
				S.reduceShader,
				S.coarseShader,
				S.prolongShader
			]) {
				const fragment = compileShader(gl, gl.FRAGMENT_SHADER, source);
				this.shaders.push(fragment);
				this.programs.push(makeProgram(gl, vertex, fragment));
			}
			for (let i = 0; i < 2; i++) {
				const b = gl.createBuffer();
				if (!b) throw new Error('Two-level buffer allocation failed');
				this.buffers.push(b);
			}
			this.blit = createBlit(gl, this.buffers[0], this.buffers[1]);
		} catch (error) {
			this.dispose();
			throw error;
		}
	}
	private target(w: number, h: number) {
		const gl = this.gl,
			f = createFBO(gl, w, h, gl.R32F, gl.RED, gl.FLOAT, gl.NEAREST);
		this.targets.push(f);
		if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
			throw new Error('Two-level float target unsupported');
		return f;
	}
	private texture(
		data: Uint8Array | Float32Array,
		w: number,
		h: number,
		channels: 1 | 2
	) {
		const gl = this.gl,
			t = gl.createTexture();
		if (!t) throw new Error('Two-level texture allocation failed');
		this.textures.push(t);
		gl.bindTexture(gl.TEXTURE_2D, t);
		for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
			gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
		for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
			gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
		const bytes = data instanceof Uint8Array;
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			bytes
				? channels === 1
					? gl.R8
					: gl.RG8
				: channels === 1
				? gl.R32F
				: gl.RG32F,
			w,
			h,
			0,
			channels === 1 ? gl.RED : gl.RG,
			bytes ? gl.UNSIGNED_BYTE : gl.FLOAT,
			data
		);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
		return t;
	}
	private pass(
		index: number,
		target: FBO,
		inputs: [string, WebGLTexture][],
		length = 1
	) {
		const gl = this.gl,
			p = this.programs[index],
			c = this.geometry;
		p.bind();
		gl.disable(gl.BLEND);
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.SCISSOR_TEST);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[0]);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(0);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers[1]);
		gl.uniform2f(p.uniforms.uSize, this.grid.width, this.grid.height);
		gl.uniform1f(p.uniforms.uCount, c.count);
		gl.uniform1f(p.uniforms.uLength, length);
		gl.uniform1f(p.uniforms.uRowWidth, c.maxRowNnz);
		gl.uniform2f(p.uniforms.uListSize, c.maxColumnNnz, c.count);
		inputs.forEach(([name, texture], unit) => {
			if (texture === target.texture)
				throw new Error('Two-level framebuffer feedback');
			gl.activeTexture(gl.TEXTURE0 + unit);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.uniform1i(p.uniforms[name], unit);
		});
		this.blit(target);
		this.lastDraws++;
	}
	private smooth(pressure: DoubleFBO, divergence: FBO, pairs: number) {
		this.pass(0, pressure.write, [
			['uPressure', pressure.read.texture],
			['uDivergence', divergence.texture],
			['uApertures', this.apertures],
			['uCells', this.cells]
		]);
		pressure.swap();
		for (let i = 1; i < pairs; i++) {
			this.gl.uniform1i(
				this.programs[0].uniforms.uPressure,
				pressure.read.attach(0)
			);
			this.blit(pressure.write);
			this.lastDraws++;
			pressure.swap();
		}
	}
	/** Ten draws. Exposed separately only for the correction-equivalence gate. */
	correct(pressure: DoubleFBO, divergence: FBO) {
		if (this.disposed) throw new Error('Two-level pressure disposed');
		this.pass(1, this.residual, [
			['uPressure', pressure.read.texture],
			['uDivergence', divergence.texture],
			['uApertures', this.apertures],
			['uCells', this.cells]
		]);
		this.pass(2, this.levels[0], [
			['uResidual', this.residual.texture],
			['uList', this.list]
		]);
		for (let i = 1; i < this.levels.length; i++)
			this.pass(
				3,
				this.levels[i],
				[['uInput', this.levels[i - 1].texture]],
				this.levels[i - 1].width
			);
		this.pass(4, this.coarse, [
			['uInput', this.levels.at(-1)!.texture],
			['uInverse', this.inverse]
		]);
		this.pass(5, pressure.write, [
			['uPressure', pressure.read.texture],
			['uRows', this.rows],
			['uCoarse', this.coarse.texture]
		]);
		pressure.swap();
	}
	run(pressure: DoubleFBO, divergence: FBO) {
		if (this.disposed) throw new Error('Two-level pressure disposed');
		this.lastDraws = 0;
		this.smooth(pressure, divergence, 14);
		this.correct(pressure, divergence);
		this.smooth(pressure, divergence, 14);
		this.correct(pressure, divergence);
		this.smooth(pressure, divergence, 16);
		return this.lastDraws;
	}
	baseline(pressure: DoubleFBO, divergence: FBO) {
		if (this.disposed) throw new Error('Two-level pressure disposed');
		this.lastDraws = 0;
		this.smooth(pressure, divergence, 64);
		return this.lastDraws;
	}
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		for (const p of this.programs) this.gl.deleteProgram(p.program);
		for (const s of this.shaders) this.gl.deleteShader(s);
		for (const t of this.textures) this.gl.deleteTexture(t);
		for (const f of this.targets) disposeFBO(this.gl, f);
		for (const b of this.buffers) this.gl.deleteBuffer(b);
	}
}
