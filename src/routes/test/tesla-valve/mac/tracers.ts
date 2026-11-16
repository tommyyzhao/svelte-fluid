import {
	compileShader,
	makeProgram,
	createFBO,
	createDoubleFBO,
	disposeFBO,
	disposeDoubleFBO,
	type ProgramWrap
} from '$lib/engine/gl-utils.js';
import type { DoubleFBO, FBO } from '$lib/engine/internal-types.js';
import * as S from './shaders.js';

export const TRACERS = {
	capacity: 262144,
	textureWidth: 512,
	rate: 2048,
	sigma: 0.25,
	maxTravel: 0.45,
	substepTravel: 0.225,
	maxSubsteps: 32
} as const;

export interface TracerOptions {
	capacity?: number;
	rate?: number;
	sigma?: number;
}
export function resolveTracerOptions(o: TracerOptions = {}) {
	return {
		...TRACERS,
		capacity: o.capacity ?? TRACERS.capacity,
		rate: o.rate ?? TRACERS.rate,
		sigma: o.sigma ?? TRACERS.sigma
	};
}
export function validateTracerOptions(options: TracerOptions, scale: number) {
	const o = resolveTracerOptions(options);
	if (
		!Number.isInteger(o.capacity) ||
		o.capacity < 512 ||
		o.capacity > 1048576 ||
		o.capacity % TRACERS.textureWidth !== 0
	)
		throw new RangeError('Invalid MAC tracers.capacity');
	if (!Number.isFinite(o.rate) || o.rate <= 0)
		throw new RangeError('Invalid MAC tracers.rate');
	if (!Number.isFinite(o.sigma) || o.sigma <= 0 || o.sigma * scale > 4 / 3)
		throw new RangeError('Invalid MAC tracers.sigma * dyeScale');
}

export interface TracerSource {
	x: number;
	y: number;
	width: number;
	spacing: number;
	direction: 1 | -1;
}

/** Passive positions/mass only; neither the faces nor the scalar are writable here. */
export class PaperTracers {
	readonly state!: DoubleFBO;
	readonly depth!: FBO;
	readonly memoryBytes: number;
	readonly options: ReturnType<typeof resolveTracerOptions>;
	readonly programs: ProgramWrap[] = [];
	private readonly shaders: WebGLShader[] = [];
	private readonly targets: (FBO | DoubleFBO)[] = [];
	private serial = 0;
	private elapsed = 0;
	private disposed = false;

	constructor(
		readonly gl: WebGL2RenderingContext,
		readonly size: readonly [number, number],
		readonly mask: WebGLTexture,
		readonly scale: number,
		readonly source: TracerSource,
		options: TracerOptions = {}
	) {
		this.options = resolveTracerOptions(options);
		validateTracerOptions(this.options, scale);
		if (
			!size.every((n) => Number.isInteger(n) && n > 0) ||
			!Number.isInteger(scale) ||
			scale < 1 ||
			scale > 3 ||
			![source.x, source.y, source.width, source.spacing].every(
				Number.isFinite
			) ||
			source.x < 0 ||
			source.x >= size[0] ||
			source.y < 0 ||
			source.y >= size[1] ||
			source.width <= 0 ||
			source.spacing < 0 ||
			![1, -1].includes(source.direction)
		)
			throw new RangeError('Invalid tracer geometry/source');
		this.memoryBytes =
			this.options.capacity * 16 * 2 + size[0] * size[1] * scale ** 2 * 8 + 8;
		try {
			const program = (vertex: string, fragment: string) => {
				const vs = compileShader(gl, gl.VERTEX_SHADER, vertex);
				this.shaders.push(vs);
				const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragment);
				this.shaders.push(fs);
				const p = makeProgram(gl, vs, fs);
				this.programs.push(p);
				return p;
			};
			program(S.tracerTriangleVertex, S.tracerUpdateShader(this.options));
			program(S.tracerSplatVertex(this.options), S.tracerSplatShader);
			program(S.tracerTriangleVertex, S.tracerDisplayShader);
			const probe = program(S.tracerTriangleVertex, S.tracerBlendProbeShader);
			const target = createFBO(
				gl,
				1,
				1,
				gl.RGBA16F,
				gl.RGBA,
				gl.HALF_FLOAT,
				gl.NEAREST
			);
			this.targets.push(target);
			if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
				throw new Error('RGBA16F target unavailable');
			// Completeness alone does not prove blending works; never require EXT_float_blend.
			probe.bind();
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.enable(gl.BLEND);
			gl.blendEquation(gl.FUNC_ADD);
			gl.blendFunc(gl.ONE, gl.ONE);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			gl.disable(gl.BLEND);
			const pixel = new Float32Array(4);
			gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, pixel);
			if (
				gl.getError() !== gl.NO_ERROR ||
				pixel.some((x) => Math.abs(x - 0.5) > 0.001)
			)
				throw new Error('RGBA16F additive blending unavailable');
			this.state = createDoubleFBO(
				gl,
				TRACERS.textureWidth,
				this.options.capacity / TRACERS.textureWidth,
				gl.RGBA32F,
				gl.RGBA,
				gl.FLOAT,
				gl.NEAREST
			);
			this.targets.push(this.state);
			if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
				throw new Error('Tracer state allocation failed');
			this.depth = createFBO(
				gl,
				size[0] * scale,
				size[1] * scale,
				gl.RGBA16F,
				gl.RGBA,
				gl.HALF_FLOAT,
				gl.NEAREST
			);
			this.targets.push(this.depth);
			if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
				throw new Error('Tracer target allocation failed');
		} catch (error) {
			gl.disable(gl.BLEND);
			this.dispose();
			throw error;
		}
	}

	private bind(p: ProgramWrap, faces?: FBO) {
		const gl = this.gl;
		gl.disable(gl.BLEND);
		p.bind();
		gl.uniform2f(p.uniforms.uSize, ...this.size);
		gl.uniform1f(p.uniforms.uScale, this.scale);
		gl.uniform1f(p.uniforms.uSigma, this.options.sigma);
		gl.uniform1i(p.uniforms.uState, this.state.read.attach(10));
		if (faces) gl.uniform1i(p.uniforms.uFaces, faces.attach(0));
		gl.activeTexture(gl.TEXTURE11);
		gl.bindTexture(gl.TEXTURE_2D, this.mask);
		gl.uniform1i(p.uniforms.uDyeMask, 11);
		return p;
	}

	advance(faces: FBO, dt: number, inject = true) {
		if (this.disposed) throw new Error('Tracers disposed');
		if (!Number.isFinite(dt) || Math.abs(dt) > 1)
			throw new RangeError('Invalid tracer dt');
		const gl = this.gl,
			p = this.bind(this.programs[0], faces);
		let count = 0;
		if (inject) {
			this.elapsed += Math.abs(dt);
			count = Math.floor(this.elapsed * this.options.rate) - this.serial;
		}
		gl.uniform1f(p.uniforms.dt, dt);
		gl.uniform1i(p.uniforms.uStart, this.serial % this.options.capacity);
		gl.uniform1i(p.uniforms.uCount, count);
		gl.uniform1i(p.uniforms.uSerial, this.serial % this.options.capacity);
		gl.uniform4f(
			p.uniforms.uSource,
			this.source.x,
			this.source.y,
			this.source.width,
			this.source.spacing
		);
		gl.uniform1f(p.uniforms.uDirection, this.source.direction);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.state.write.fbo);
		gl.viewport(0, 0, this.state.width, this.state.height);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		this.state.swap();
		this.serial += count;
	}

	accumulate(blue: readonly number[], green: readonly number[]) {
		const gl = this.gl,
			p = this.bind(this.programs[1]);
		gl.uniform3f(p.uniforms.uBlue, blue[0], blue[1], blue[2]);
		gl.uniform3f(p.uniforms.uGreen, green[0], green[1], green[2]);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.depth.fbo);
		gl.viewport(0, 0, this.depth.width, this.depth.height);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.enable(gl.BLEND);
		gl.blendEquation(gl.FUNC_ADD);
		gl.blendFunc(gl.ONE, gl.ONE);
		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.options.capacity);
		gl.disable(gl.BLEND);
	}

	render(
		plate: WebGLTexture,
		offset: number,
		width: number,
		carrier: readonly number[]
	) {
		const gl = this.gl,
			p = this.bind(this.programs[2]);
		gl.uniform1i(p.uniforms.uDepth, this.depth.attach(12));
		gl.activeTexture(gl.TEXTURE9);
		gl.bindTexture(gl.TEXTURE_2D, plate);
		gl.uniform1i(p.uniforms.uPlate, 9);
		gl.uniform1f(p.uniforms.uOffset, offset);
		gl.uniform1f(p.uniforms.uValveWidth, width);
		gl.uniform3f(p.uniforms.uCarrierDepth, carrier[0], carrier[1], carrier[2]);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	get clock() {
		return { serial: this.serial, elapsed: this.elapsed };
	}

	restore(state: { state: number[]; serial: number; elapsed: number }) {
		if (
			state.state.length !== this.options.capacity * 4 ||
			!state.state.every(Number.isFinite) ||
			!Number.isSafeInteger(state.serial) ||
			state.serial < 0 ||
			!Number.isFinite(state.elapsed) ||
			state.elapsed < 0 ||
			Math.floor(state.elapsed * this.options.rate) !== state.serial
		)
			throw new Error('Corrupt tracer checkpoint');
		const gl = this.gl;
		gl.bindTexture(gl.TEXTURE_2D, this.state.read.texture);
		gl.texSubImage2D(
			gl.TEXTURE_2D,
			0,
			0,
			0,
			this.state.width,
			this.state.height,
			gl.RGBA,
			gl.FLOAT,
			Float32Array.from(state.state)
		);
		this.serial = state.serial;
		this.elapsed = state.elapsed;
	}

	get budget() {
		return {
			...this.options,
			emitted: this.serial,
			ringOverwrites: Math.max(0, this.serial - this.options.capacity),
			residenceSeconds: this.options.capacity / this.options.rate,
			memoryBytes: this.memoryBytes
		};
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		for (const f of this.targets)
			if ('read' in f) disposeDoubleFBO(this.gl, f);
			else disposeFBO(this.gl, f);
		for (const p of this.programs) this.gl.deleteProgram(p.program);
		for (const s of this.shaders) this.gl.deleteShader(s);
	}
}
