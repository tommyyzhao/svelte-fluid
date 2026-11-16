import {
	createDoubleFBO,
	createFBO,
	disposeDoubleFBO,
	disposeFBO,
	compileShader,
	makeProgram,
	createBlit,
	getWebGLContext,
	type ProgramWrap
} from '../gl-utils.js';
import type { FBO } from '../internal-types.js';
import { staggeredGeometry } from '../staggered.js';
import * as S from '../shaders.js';

/** Measurement-only host; no public solver is installed until the gates pass. */
export function staggeredHarness(
	geometry: ReturnType<typeof staggeredGeometry>
) {
	const { width, height } = geometry;
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const { gl: raw, ext } = getWebGLContext(canvas);
	if (!ext.isWebGL2 || !raw.getExtension('EXT_color_buffer_float'))
		throw new Error('MAC preflight requires WebGL2 float targets');
	const gl = raw as WebGL2RenderingContext;
	const vertex = compileShader(gl, gl.VERTEX_SHADER, S.baseVertexShader);
	const sources = {
		divergence: S.staggeredDivergenceShader,
		pressure: S.staggeredPressureShader,
		pair: S.staggeredPressureJacobi2Shader,
		gradient: S.staggeredGradientShader,
		force: S.staggeredForceShader,
		advection: S.staggeredAdvectionShader,
		viscosity: S.staggeredViscosityShader
	};
	const fragments = Object.values(sources).map((source) =>
		compileShader(gl, gl.FRAGMENT_SHADER, source)
	);
	const programs = Object.fromEntries(
		Object.keys(sources).map((name, i) => [
			name,
			makeProgram(gl, vertex, fragments[i])
		])
	) as Record<keyof typeof sources, ProgramWrap>;
	const vb = gl.createBuffer()!,
		ib = gl.createBuffer()!,
		blit = createBlit(gl, vb, ib);
	const texture = (
		data: Uint8Array,
		w: number,
		h: number,
		internal: number,
		format: number
	) => {
		const t = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, t);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			internal,
			w,
			h,
			0,
			format,
			gl.UNSIGNED_BYTE,
			data
		);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
		return t;
	};
	const apertures = texture(
			geometry.faces,
			width + 1,
			height + 1,
			gl.RG8,
			gl.RG
		),
		cells = texture(geometry.cells, width, height, gl.R8, gl.RED);
	gl.clearColor(0, 0, 0, 0);
	const velocity = createDoubleFBO(
		gl,
		width + 1,
		height + 1,
		gl.RG32F,
		gl.RG,
		gl.FLOAT,
		gl.NEAREST
	);
	const pressure = createDoubleFBO(
		gl,
		width,
		height,
		gl.R32F,
		gl.RED,
		gl.FLOAT,
		gl.NEAREST
	);
	const divergence = createFBO(
		gl,
		width,
		height,
		gl.R32F,
		gl.RED,
		gl.FLOAT,
		gl.NEAREST
	);
	const scratch = createFBO(
		gl,
		width + 1,
		height + 1,
		gl.RG32F,
		gl.RG,
		gl.FLOAT,
		gl.NEAREST
	);
	const bind = (p: ProgramWrap) => {
		gl.disable(gl.BLEND);
		p.bind();
		gl.uniform2f(p.uniforms.uSize, width, height);
		gl.uniform1i(p.uniforms.uFaces, velocity.read.attach(0));
		gl.uniform1i(p.uniforms.uPressure, pressure.read.attach(1));
		gl.uniform1i(p.uniforms.uDivergence, divergence.attach(2));
		gl.activeTexture(gl.TEXTURE3);
		gl.bindTexture(gl.TEXTURE_2D, apertures);
		gl.uniform1i(p.uniforms.uApertures, 3);
		gl.activeTexture(gl.TEXTURE4);
		gl.bindTexture(gl.TEXTURE_2D, cells);
		gl.uniform1i(p.uniforms.uCells, 4);
		gl.uniform1i(p.uniforms.uPhiHat, scratch.attach(5));
		gl.uniform1i(p.uniforms.uRhs, scratch.attach(5));
	};
	const upload = (fbo: FBO, data: ArrayLike<number>, components: 1 | 2) => {
		gl.bindTexture(gl.TEXTURE_2D, fbo.texture);
		gl.texSubImage2D(
			gl.TEXTURE_2D,
			0,
			0,
			0,
			fbo.width,
			fbo.height,
			components === 1 ? gl.RED : gl.RG,
			gl.FLOAT,
			Float32Array.from(data)
		);
	};
	const read = (fbo: FBO, components: 1 | 2) => {
		const rgba = new Float32Array(fbo.width * fbo.height * 4),
			out = new Float32Array(fbo.width * fbo.height * components);
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo);
		gl.readPixels(0, 0, fbo.width, fbo.height, gl.RGBA, gl.FLOAT, rgba);
		for (let i = 0; i < fbo.width * fbo.height; i++)
			for (let c = 0; c < components; c++)
				out[i * components + c] = rgba[4 * i + c];
		return out;
	};
	const computeDivergence = () => {
		bind(programs.divergence);
		blit(divergence);
	};
	const solve = (count: number, paired = true) => {
		const pairs = paired ? Math.floor(count / 2) : 0;
		for (const [p, n] of [
			[programs.pair, pairs],
			[programs.pressure, count - pairs * 2]
		] as const) {
			if (!n) continue;
			bind(p);
			for (let k = 0; k < n; k++) {
				gl.uniform1i(p.uniforms.uPressure, pressure.read.attach(1));
				blit(pressure.write);
				pressure.swap();
			}
		}
	};
	const subtract = () => {
		bind(programs.gradient);
		blit(velocity.write);
		velocity.swap();
	};
	const project = (count: number) => {
		computeDivergence();
		solve(count);
		subtract();
	};
	const tentative = (
		dt: number,
		force: number,
		nu: number,
		viscosityIterations = 20,
		advect = true,
		macCormack = true,
		wallSafe = false
	) => {
		bind(programs.force);
		gl.uniform2f(programs.force.uniforms.uImpulse, force * dt, 0);
		blit(velocity.write);
		velocity.swap();
		if (advect) {
			const p = programs.advection;
			bind(p);
			gl.uniform1i(p.uniforms.uPhiHat, 3);
			gl.uniform1f(p.uniforms.dt, dt);
			gl.uniform1f(p.uniforms.uCorrection, 0);
			gl.uniform1f(p.uniforms.dissipation, 0);
			gl.uniform1f(p.uniforms.uWallSafe, wallSafe ? 1 : 0);
			if (macCormack) {
				blit(scratch);
				gl.uniform1i(p.uniforms.uPhiHat, scratch.attach(5));
				gl.uniform1f(p.uniforms.uCorrection, 1);
			}
			blit(velocity.write);
			velocity.swap();
		}
		if (nu > 0) {
			// Immutable viscosity RHS, copied without a half-float intermediate.
			gl.bindFramebuffer(gl.READ_FRAMEBUFFER, velocity.read.fbo);
			gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, scratch.fbo);
			gl.blitFramebuffer(
				0,
				0,
				width + 1,
				height + 1,
				0,
				0,
				width + 1,
				height + 1,
				gl.COLOR_BUFFER_BIT,
				gl.NEAREST
			);
			const p = programs.viscosity;
			bind(p);
			gl.uniform1f(p.uniforms.uAlpha, nu * dt);
			for (let k = 0; k < viscosityIterations; k++) {
				gl.uniform1i(p.uniforms.uFaces, velocity.read.attach(0));
				blit(velocity.write);
				velocity.swap();
			}
		}
	};
	return {
		gl,
		geometry,
		velocity,
		pressure,
		divergence,
		scratch,
		read,
		upload,
		computeDivergence,
		solve,
		subtract,
		project,
		tentative,
		dispose() {
			disposeDoubleFBO(gl, velocity);
			disposeDoubleFBO(gl, pressure);
			disposeFBO(gl, divergence);
			disposeFBO(gl, scratch);
			gl.deleteTexture(apertures);
			gl.deleteTexture(cells);
			for (const p of Object.values(programs)) gl.deleteProgram(p.program);
			for (const fragment of fragments) gl.deleteShader(fragment);
			gl.deleteShader(vertex);
			gl.deleteBuffer(vb);
			gl.deleteBuffer(ib);
			gl.getExtension('WEBGL_lose_context')?.loseContext();
		}
	};
}
