import {
	compileShader,
	makeProgram,
	createFBO,
	disposeFBO,
	type BlitFn,
	type ProgramWrap
} from '$lib/engine/gl-utils.js';
import type { DoubleFBO, FBO } from '$lib/engine/internal-types.js';
import type { StaggeredGeometry } from '$lib/engine/staggered.js';
import { baseVertexShader } from '$lib/engine/shaders.js';
import { coarseGeometry } from './coarse.js';
import * as S from './coarse-shaders.js';

/** Rejected C1 bench prototype; never imported by the live route engine. */
export class CoarseCorrection {
	readonly geometry;
	private shaders: WebGLShader[] = [];
	private programs: ProgramWrap[] = [];
	private textures: WebGLTexture[] = [];
	private targets: FBO[] = [];
	private residual!: FBO;
	private restricted!: FBO;
	private error!: FBO;
	private ids!: WebGLTexture;
	private lists!: WebGLTexture;
	private inverse!: WebGLTexture;
	constructor(
		private gl: WebGL2RenderingContext,
		private grid: StaggeredGeometry,
		direction: 1 | -1,
		bands: number
	) {
		this.geometry = coarseGeometry(grid, direction, bands);
		try {
			const vertex = compileShader(gl, gl.VERTEX_SHADER, baseVertexShader);
			this.shaders.push(vertex);
			for (const source of [
				S.residualShader,
				S.restrictShader,
				S.coarseSolveShader,
				S.prolongShader
			]) {
				const fragment = compileShader(gl, gl.FRAGMENT_SHADER, source);
				this.shaders.push(fragment);
				this.programs.push(makeProgram(gl, vertex, fragment));
			}
			const { count, maxCells } = this.geometry;
			for (const [w, h] of [
				[grid.width, grid.height],
				[count, 1],
				[count, 1]
			])
				this.targets.push(
					createFBO(gl, w, h, gl.R32F, gl.RED, gl.FLOAT, gl.NEAREST)
				);
			[this.residual, this.restricted, this.error] = this.targets;
			this.ids = this.texture(this.geometry.ids, grid.width, grid.height);
			this.lists = this.texture(this.geometry.cellList, maxCells, count);
			this.inverse = this.texture(this.geometry.inverse, count, count);
		} catch (error) {
			this.dispose();
			throw error;
		}
	}
	private texture(data: Float32Array, w: number, h: number) {
		const gl = this.gl,
			t = gl.createTexture();
		if (!t) throw new Error('Coarse texture allocation failed');
		this.textures.push(t);
		gl.bindTexture(gl.TEXTURE_2D, t);
		for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
			gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
		for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
			gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w, h, 0, gl.RED, gl.FLOAT, data);
		return t;
	}
	run(
		pressure: DoubleFBO,
		divergence: FBO,
		apertures: WebGLTexture,
		cells: WebGLTexture,
		blit: BlitFn
	) {
		const gl = this.gl,
			{ count, maxCells } = this.geometry;
		for (let pass = 0; pass < 4; pass++) {
			const p = this.programs[pass];
			p.bind();
			gl.disable(gl.BLEND);
			gl.uniform2f(p.uniforms.uSize, this.grid.width, this.grid.height);
			gl.uniform1f(p.uniforms.uCount, count);
			gl.uniform1f(p.uniforms.uMaxCells, maxCells);
			for (const [unit, name, t] of [
				[0, 'uPressure', pressure.read.texture],
				[1, 'uDivergence', divergence.texture],
				[2, 'uApertures', apertures],
				[3, 'uCells', cells],
				[4, 'uResidual', this.residual.texture],
				[5, 'uCellList', this.lists],
				[6, 'uRestricted', this.restricted.texture],
				[7, 'uInverse', this.inverse],
				[8, 'uAggregate', this.ids],
				[9, 'uCoarse', this.error.texture]
			] as const) {
				gl.activeTexture(gl.TEXTURE0 + unit);
				gl.bindTexture(gl.TEXTURE_2D, t);
				gl.uniform1i(p.uniforms[name], unit);
			}
			blit(
				pass === 0
					? this.residual
					: pass === 1
					? this.restricted
					: pass === 2
					? this.error
					: pressure.write
			);
		}
		pressure.swap();
	}
	dispose() {
		for (const p of this.programs) this.gl.deleteProgram(p.program);
		for (const s of this.shaders) this.gl.deleteShader(s);
		for (const t of this.textures) this.gl.deleteTexture(t);
		for (const f of this.targets) disposeFBO(this.gl, f);
		this.programs = [];
		this.shaders = [];
		this.textures = [];
		this.targets = [];
	}
}
