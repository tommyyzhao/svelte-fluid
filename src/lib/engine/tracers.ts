import { createFBO, disposeFBO, type ProgramWrap } from './gl-utils.js';
import type { DoubleFBO, FBO } from './internal-types.js';
import type { FlowConfig, RGB } from './types.js';

export const TRACERS = {
	capacity: 262144,
	textureWidth: 512,
	rate: 2048,
	sigma: 0.75
} as const;
export type TracerConfig = NonNullable<FlowConfig['tracers']>;
export type TracerProgramName = 'tracerUpdate' | 'tracerSplat' | 'tracerProbe';
export type TracerPrograms = Record<TracerProgramName, ProgramWrap>;
export function validateTracers(flow: FlowConfig | null | undefined): void {
	const o = flow?.tracers;
	if (!o) return;
	if (!flow.visualization?.absorption)
		throw new RangeError('svelte-fluid: tracers require absorption');
	if (!Array.isArray(o.sources) || o.sources.length < 1 || o.sources.length > 3)
		throw new RangeError('svelte-fluid: tracers.sources requires 1–3 segments');
	for (const source of o.sources) {
		if (
			!source ||
			!source.from ||
			!source.to ||
			![source.from.x, source.from.y, source.to.x, source.to.y].every(
				(v) => Number.isFinite(v) && v >= 0 && v <= 1
			)
		)
			throw new RangeError(
				'svelte-fluid: tracers endpoints must be finite UV in [0, 1]'
			);
		if (
			Math.hypot(source.to.x - source.from.x, source.to.y - source.from.y) <
			1e-4
		)
			throw new RangeError('svelte-fluid: tracers segment is degenerate');
		if (![0, 1, 2].includes(source.species))
			throw new RangeError('svelte-fluid: invalid tracers species');
	}
	const capacity = o.capacity ?? TRACERS.capacity,
		rate = o.rate ?? TRACERS.rate,
		sigma = o.sigma ?? TRACERS.sigma;
	if (
		!Number.isInteger(capacity) ||
		capacity < 512 ||
		capacity > 1048576 ||
		capacity % 512 !== 0
	)
		throw new RangeError('svelte-fluid: invalid tracers.capacity');
	if (!Number.isFinite(rate) || rate <= 0)
		throw new RangeError(
			'svelte-fluid: tracers.rate must be finite and positive'
		);
	if (!Number.isFinite(sigma) || sigma < 0.25 || sigma > 4 / 3)
		throw new RangeError(
			'svelte-fluid: tracers.sigma must be between 0.25 and 4/3 dye texels'
		);
}

/** Owns only passive fields; all calls run inside the owning engine's GL scope. */
export class FlowTracers {
	readonly state!: DoubleFBO;
	depth!: FBO;
	private serial = 0;
	private cursor = 0;
	private fraction = 0;
	private sources = new Float32Array(12);
	private species = new Int32Array(3);
	private absorbance = new Float32Array(9);
	private vao: WebGLVertexArrayObject | null = null;
	private targets: FBO[] = [];
	constructor(
		readonly gl: WebGL2RenderingContext,
		readonly capacity: number,
		readonly programs: TracerPrograms,
		width: number,
		height: number,
		private readonly linearFiltering = true
	) {
		let probe: FBO | undefined;
		try {
			this.vao = gl.createVertexArray();
			if (!this.vao) throw new Error('tracer VAO unavailable');
			gl.bindVertexArray(this.vao);
			gl.disable(gl.BLEND);
			gl.clearColor(0, 0, 0, 0);
			probe = createFBO(
				gl,
				1,
				1,
				gl.RGBA16F,
				gl.RGBA,
				gl.HALF_FLOAT,
				gl.NEAREST
			);
			this.complete();
			programs.tracerProbe.bind();
			gl.enable(gl.BLEND);
			gl.blendEquation(gl.FUNC_ADD);
			gl.blendFunc(gl.ONE, gl.ONE);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			gl.disable(gl.BLEND);
			const pixel = new Float32Array(4);
			gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
			gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, pixel);
			if (
				gl.getError() !== gl.NO_ERROR ||
				pixel.some((x) => Math.abs(x - 0.5) > 0.001)
			)
				throw new Error('RGBA16F additive blending unavailable');
			for (let i = 0; i < 2; i++) {
				const target = createFBO(
					gl,
					512,
					capacity / 512,
					gl.RGBA32F,
					gl.RGBA,
					gl.FLOAT,
					gl.NEAREST
				);
				this.targets.push(target);
				this.complete();
				if (gl.getError() !== gl.NO_ERROR)
					throw new Error('RGBA32F state unavailable');
			}
			const targets = this.targets;
			this.state = {
				width: 512,
				height: capacity / 512,
				texelSizeX: 1 / 512,
				texelSizeY: 512 / capacity,
				get read() {
					return targets[0];
				},
				set read(value) {
					targets[0] = value;
				},
				get write() {
					return targets[1];
				},
				set write(value) {
					targets[1] = value;
				},
				swap() {
					[targets[0], targets[1]] = [targets[1], targets[0]];
				}
			};
			this.resize(width, height);
		} catch (error) {
			this.dispose();
			throw error;
		} finally {
			disposeFBO(gl, probe);
			gl.disable(gl.BLEND);
			gl.bindVertexArray(null);
			gl.clearColor(0, 0, 0, 1);
		}
	}
	private complete() {
		if (
			this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER) !==
			this.gl.FRAMEBUFFER_COMPLETE
		)
			throw new Error('tracer floating-point framebuffer unavailable');
	}
	prepareDepth(width: number, height: number): FBO | undefined {
		if (this.depth?.width === width && this.depth.height === height) return;
		const gl = this.gl;
		gl.clearColor(0, 0, 0, 0);
		let target: FBO | undefined;
		try {
			target = createFBO(
				gl,
				width,
				height,
				gl.RGBA16F,
				gl.RGBA,
				gl.HALF_FLOAT,
				this.linearFiltering ? gl.LINEAR : gl.NEAREST
			);
			this.complete();
			if (gl.getError() !== gl.NO_ERROR)
				throw new Error('tracer depth allocation failed');
			return target;
		} catch (error) {
			disposeFBO(gl, target);
			throw error;
		} finally {
			gl.clearColor(0, 0, 0, 1);
		}
	}
	commitDepth(target: FBO | undefined) {
		if (!target) return;
		disposeFBO(this.gl, this.depth);
		this.depth = target;
	}
	resize(width: number, height: number) {
		this.commitDepth(this.prepareDepth(width, height));
	}
	private bind(
		p: ProgramWrap,
		velocity: FBO,
		mask: WebGLTexture,
		maskSize: readonly [number, number],
		hasMask: boolean
	) {
		const gl = this.gl;
		gl.bindVertexArray(this.vao);
		gl.disable(gl.BLEND);
		p.bind();
		gl.uniform2f(p.uniforms.uSize, velocity.width, velocity.height);
		gl.uniform1i(p.uniforms.uState, this.state.read.attach(0));
		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, mask);
		gl.uniform1i(p.uniforms.uSolidMask, 2);
		gl.uniform1f(p.uniforms.uHasSolidMask, hasMask ? 1 : 0);
		gl.uniform2f(p.uniforms.uMaskSize, ...maskSize);
	}
	advance(
		velocity: FBO,
		dt: number,
		options: TracerConfig,
		mask: WebGLTexture,
		maskSize: readonly [number, number],
		hasMask: boolean,
		edges: readonly [number, number, number, number]
	) {
		if (!Number.isFinite(dt) || dt <= 0) return;
		const gl = this.gl,
			p = this.programs.tracerUpdate,
			rate = options.rate ?? TRACERS.rate;
		const emitted = this.fraction + dt * rate;
		// ponytail: finite GPU ring; retain newest capacity emissions when one step overflows it.
		const total = Math.floor(Math.min(emitted, Number.MAX_SAFE_INTEGER)),
			count = Math.min(total, this.capacity),
			skipped = total - count;
		this.fraction = Number.isFinite(emitted)
			? emitted - Math.floor(emitted)
			: 0;
		const serial = (this.serial + (skipped % 786432)) % 786432;
		this.bind(p, velocity, mask, maskSize, hasMask);
		for (let i = 0; i < 3; i++) {
			const s = options.sources[i] ?? options.sources[0];
			this.sources.set([s.from.x, s.from.y, s.to.x, s.to.y], i * 4);
			this.species[i] = s.species;
		}
		gl.uniform4fv(p.uniforms['uSources[0]'], this.sources);
		gl.uniform1iv(p.uniforms['uSpecies[0]'], this.species);
		gl.uniform1i(p.uniforms.uSourceCount, options.sources.length);
		gl.uniform1f(p.uniforms.uRate, rate);
		gl.uniform1i(p.uniforms.uCapacity, this.capacity);
		gl.uniform1i(
			p.uniforms.uStart,
			(this.cursor + (skipped % this.capacity)) % this.capacity
		);
		gl.uniform1i(p.uniforms.uSerial, serial);
		gl.uniform1i(p.uniforms.uCount, count);
		gl.uniform1f(p.uniforms.dt, dt);
		gl.uniform1f(p.uniforms.uNewestAge, this.fraction / rate);
		gl.uniform4f(p.uniforms.uOpenEdges, ...edges);
		gl.uniform1i(p.uniforms.uVelocity, velocity.attach(1));
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.state.write.fbo);
		gl.viewport(0, 0, this.state.width, this.state.height);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		this.state.swap();
		this.serial = (this.serial + (total % 786432)) % 786432;
		this.cursor = (this.cursor + (total % this.capacity)) % this.capacity;
		gl.bindVertexArray(null);
	}
	accumulate(
		velocity: FBO,
		options: TracerConfig,
		absorbance: readonly RGB[],
		mask: WebGLTexture,
		maskSize: readonly [number, number],
		hasMask: boolean
	) {
		const gl = this.gl,
			p = this.programs.tracerSplat;
		this.bind(p, velocity, mask, maskSize, hasMask);
		gl.uniform2f(p.uniforms.uDyeSize, this.depth.width, this.depth.height);
		gl.uniform1f(p.uniforms.uSigma, options.sigma ?? TRACERS.sigma);
		for (let i = 0; i < 3; i++) {
			const a = absorbance[i];
			this.absorbance.set([a.r, a.g, a.b], i * 3);
		}
		gl.uniform3fv(p.uniforms['uAbsorbance[0]'], this.absorbance);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.depth.fbo);
		gl.viewport(0, 0, this.depth.width, this.depth.height);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.enable(gl.BLEND);
		gl.blendEquation(gl.FUNC_ADD);
		gl.blendFunc(gl.ONE, gl.ONE);
		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.capacity);
		gl.disable(gl.BLEND);
		gl.bindVertexArray(null);
		gl.clearColor(0, 0, 0, 1);
	}
	get memoryBytes() {
		return this.capacity * 32 + this.depth.width * this.depth.height * 8;
	}
	dispose() {
		for (const target of this.targets) disposeFBO(this.gl, target);
		this.targets = [];
		disposeFBO(this.gl, this.depth);
		if (this.vao) this.gl.deleteVertexArray(this.vao);
		this.vao = null;
	}
}
