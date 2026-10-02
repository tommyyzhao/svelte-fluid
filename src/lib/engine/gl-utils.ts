/*
 * svelte-fluid — WebGL utilities (framework- and instance-agnostic)
 * Derivative work of WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017, MIT.
 *
 * Every function in this module takes the WebGL context as its first
 * argument so that nothing here keeps module-level GL state. This is what
 * makes the engine safe to instantiate multiple times in the same page.
 */

import type { DoubleFBO, ExtInfo, FBO, SupportedFormat } from './internal-types.js';
import {
	WebGLUnavailableError,
	webglSupportedMemo,
	type GetContextOptions,
	type WebGLUnavailableReason
} from './gl-support.js';

export {
	isWebGLAvailable,
	WebGLUnavailableError,
	_resetWebGLSupportCache,
	type GetContextOptions,
	type WebGLUnavailableReason
} from './gl-support.js';

/** A union covering both WebGL1 and WebGL2 rendering contexts. */
export type GL = WebGL2RenderingContext | WebGLRenderingContext;

/** A wrapped WebGL program with cached uniform locations. */
export interface ProgramWrap {
	program: WebGLProgram;
	uniforms: Record<string, WebGLUniformLocation | null>;
	bind(): void;
}

/* -------------------------------------------------------------------------- */
/*                              Context creation                              */
/* -------------------------------------------------------------------------- */

/**
 * Acquire a WebGL2 (preferred) or WebGL1 context plus the half-float /
 * format extensions the simulation needs. Throws a {@link WebGLUnavailableError}
 * (with a typed reason) if a usable context cannot be created.
 *
 * Ported from script.js:118-168.
 */
export function getWebGLContext(
	canvas: HTMLCanvasElement,
	options: GetContextOptions = {}
): { gl: GL; ext: ExtInfo } {
	const params: WebGLContextAttributes = {
		alpha: true,
		depth: false,
		stencil: false,
		antialias: false,
		preserveDrawingBuffer: false,
		failIfMajorPerformanceCaveat: options.requireHardwareAcceleration ?? false
	};

	let gl: GL | null = canvas.getContext('webgl2', params) as WebGL2RenderingContext | null;
	const isWebGL2 = !!gl;
	if (!isWebGL2) {
		gl =
			(canvas.getContext('webgl', params) as WebGLRenderingContext | null) ??
			(canvas.getContext('experimental-webgl', params) as WebGLRenderingContext | null);
	}
	if (!gl) {
		// Classify via the memoized capability probe (see webglSupportCache). If
		// WebGL can be created at all, this canvas's failure was situational —
		// almost always the page hit its live-context limit — and may recover on
		// a later reconcile (transient). Otherwise WebGL is genuinely unavailable,
		// disabled, or (with requireHardwareAcceleration) only a rejected software
		// path exists (permanent). NOTE: a browser that hard-caps without LRU
		// eviction (Firefox-class) can make the probe also fail at the cap, which
		// would misclassify context-limit as no-webgl on a dense page; that is an
		// accepted limitation documented in ADR-0041.
		const reason: WebGLUnavailableReason = webglSupportedMemo(params) ? 'context-limit' : 'no-webgl';
		throw new WebGLUnavailableError(
			reason,
			reason === 'context-limit'
				? 'svelte-fluid: could not acquire a WebGL context (the page may have reached its WebGL context limit)'
				: 'svelte-fluid: WebGL is not supported in this browser'
		);
	}

	let halfFloat: OES_texture_half_float | null = null;
	let supportLinearFiltering: unknown;
	if (isWebGL2) {
		gl.getExtension('EXT_color_buffer_float');
		supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
	} else {
		halfFloat = gl.getExtension('OES_texture_half_float');
		supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
	}

	gl.clearColor(0.0, 0.0, 0.0, 1.0);

	const halfFloatTexType = isWebGL2
		? (gl as WebGL2RenderingContext).HALF_FLOAT
		: (halfFloat as OES_texture_half_float).HALF_FLOAT_OES;

	let formatRGBA: SupportedFormat | null;
	let formatRG: SupportedFormat | null;
	let formatR: SupportedFormat | null;

	if (isWebGL2) {
		const gl2 = gl as WebGL2RenderingContext;
		formatRGBA = getSupportedFormat(gl2, gl2.RGBA16F, gl2.RGBA, halfFloatTexType);
		formatRG = getSupportedFormat(gl2, gl2.RG16F, gl2.RG, halfFloatTexType);
		formatR = getSupportedFormat(gl2, gl2.R16F, gl2.RED, halfFloatTexType);
	} else {
		formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
		formatRG = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
		formatR = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
	}

	if (!formatRGBA) {
		throw new WebGLUnavailableError(
			'no-float-textures',
			'svelte-fluid: required half-float texture format is not supported'
		);
	}

	return {
		gl,
		ext: {
			formatRGBA,
			formatRG: formatRG ?? formatRGBA,
			formatR: formatR ?? formatRGBA,
			halfFloatTexType,
			supportLinearFiltering: !!supportLinearFiltering,
			isWebGL2
		}
	};
}

/** Walk down to a supported pixel format if the requested one isn't usable. */
export function getSupportedFormat(
	gl: GL,
	internalFormat: number,
	format: number,
	type: number
): SupportedFormat | null {
	if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
		const gl2 = gl as WebGL2RenderingContext;
		switch (internalFormat) {
			case gl2.R16F:
				return getSupportedFormat(gl, gl2.RG16F, gl2.RG, type);
			case gl2.RG16F:
				return getSupportedFormat(gl, gl2.RGBA16F, gl2.RGBA, type);
			default:
				return null;
		}
	}
	return { internalFormat, format };
}

/** Probe the driver to see if a given texture format can be rendered into. */
export function supportRenderTextureFormat(
	gl: GL,
	internalFormat: number,
	format: number,
	type: number
): boolean {
	const texture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

	const fbo = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

	const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);

	// Tidy up the probe artifacts so we don't leak.
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.bindTexture(gl.TEXTURE_2D, null);
	gl.deleteFramebuffer(fbo);
	gl.deleteTexture(texture);

	return status === gl.FRAMEBUFFER_COMPLETE;
}

/* -------------------------------------------------------------------------- */
/*                          Shader & program plumbing                         */
/* -------------------------------------------------------------------------- */

/**
 * Compile a single shader stage. Optionally prepends `#define KEYWORD` lines
 * for conditional compilation (used for the display material variants and
 * the advection MANUAL_FILTERING fallback).
 *
 * Throws on compile error so library consumers see clear messages.
 */
export function compileShader(
	gl: GL,
	type: number,
	source: string,
	keywords?: string[] | null
): WebGLShader {
	const finalSource = addKeywords(source, keywords);
	const shader = gl.createShader(type);
	if (!shader) throw new Error('svelte-fluid: gl.createShader returned null');
	gl.shaderSource(shader, finalSource);
	gl.compileShader(shader);

	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(shader) ?? '(no info log)';
		gl.deleteShader(shader);
		throw new Error(`svelte-fluid: shader compile failed:\n${log}\n\nSource:\n${finalSource}`);
	}
	return shader;
}

function addKeywords(source: string, keywords?: string[] | null): string {
	if (!keywords || keywords.length === 0) return source;
	let prefix = '';
	for (const keyword of keywords) {
		prefix += `#define ${keyword}\n`;
	}
	return prefix + source;
}

/** Link a vertex + fragment shader pair. Throws on link error. */
export function createProgram(gl: GL, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
	const program = gl.createProgram();
	if (!program) throw new Error('svelte-fluid: gl.createProgram returned null');
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);

	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const log = gl.getProgramInfoLog(program) ?? '(no info log)';
		gl.deleteProgram(program);
		throw new Error(`svelte-fluid: program link failed:\n${log}`);
	}
	return program;
}

/** Pull out every active uniform location into a name-keyed map. */
export function getUniforms(gl: GL, program: WebGLProgram): Record<string, WebGLUniformLocation | null> {
	const uniforms: Record<string, WebGLUniformLocation | null> = {};
	const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
	for (let i = 0; i < count; i++) {
		const info = gl.getActiveUniform(program, i);
		if (!info) continue;
		uniforms[info.name] = gl.getUniformLocation(program, info.name);
	}
	return uniforms;
}

/** Convenience: compile + link + uniforms in one call. */
export function makeProgram(gl: GL, vs: WebGLShader, fs: WebGLShader): ProgramWrap {
	const program = createProgram(gl, vs, fs);
	try {
		const uniforms = getUniforms(gl, program);
		return {
			program,
			uniforms,
			bind() {
				gl.useProgram(program);
			}
		};
	} catch (error) {
		gl.deleteProgram(program);
		throw error;
	}
}

/**
 * Multi-variant material — a single fragment shader source compiled with
 * different `#define` keyword sets, used by the display shader to toggle
 * SHADING / BLOOM / SUNRAYS without rebuilding all FBOs.
 *
 * Ported from script.js:351-382.
 */
export class Material {
	private programs = new Map<string, ProgramWrap>();
	private fragmentShaders = new Map<string, WebGLShader>();
	activeProgram: WebGLProgram | null = null;
	uniforms: Record<string, WebGLUniformLocation | null> = {};

	/**
	 * `vertexShader` may instead be a factory over a shared program cache
	 * (gl-host, ADR-0082): the cache owns every variant and dispose() deletes none.
	 */
	constructor(
		private gl: GL,
		private vertexShader: WebGLShader | ((keywords: string[]) => ProgramWrap),
		private fragmentShaderSource: string
	) {}

	prepareKeywords(keywords: string[]): string {
		const hash = [...keywords].sort().join(',');
		if (this.programs.has(hash)) return hash;
		if (typeof this.vertexShader === 'function') {
			this.programs.set(hash, this.vertexShader(keywords));
			return hash;
		}

		const fragmentShader = compileShader(
			this.gl,
			this.gl.FRAGMENT_SHADER,
			this.fragmentShaderSource,
			keywords
		);
		try {
			const program = makeProgram(this.gl, this.vertexShader, fragmentShader);
			this.programs.set(hash, program);
			this.fragmentShaders.set(hash, fragmentShader);
			return hash;
		} catch (error) {
			this.gl.deleteShader(fragmentShader);
			throw error;
		}
	}

	activatePrepared(hash: string): void {
		const program = this.programs.get(hash);
		if (!program) throw new Error(`svelte-fluid: display material variant ${hash || '(default)'} was not prepared`);
		if (program.program === this.activeProgram) return;
		this.uniforms = program.uniforms;
		this.activeProgram = program.program;
	}

	setKeywords(keywords: string[]): void {
		const hash = this.prepareKeywords(keywords);
		this.activatePrepared(hash);
	}

	bind(): void {
		this.gl.useProgram(this.activeProgram);
	}

	dispose(): void {
		if (typeof this.vertexShader === 'function') this.programs.clear();
		for (const [hash, p] of this.programs) {
			const fs = this.fragmentShaders.get(hash);
			if (fs) {
				this.gl.detachShader(p.program, fs);
				this.gl.deleteShader(fs);
			}
			this.gl.deleteProgram(p.program);
		}
		this.programs.clear();
		this.fragmentShaders.clear();
		this.activeProgram = null;
	}
}

/* -------------------------------------------------------------------------- */
/*                                  FBO API                                   */
/* -------------------------------------------------------------------------- */

/** Allocate a single framebuffer object backed by a fresh texture. */
export function createFBO(
	gl: GL,
	w: number,
	h: number,
	internalFormat: number,
	format: number,
	type: number,
	param: number
): FBO {
	gl.activeTexture(gl.TEXTURE0);
	const texture = gl.createTexture();
	if (!texture) throw new Error('svelte-fluid: gl.createTexture returned null');
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

	const fbo = gl.createFramebuffer();
	if (!fbo) throw new Error('svelte-fluid: gl.createFramebuffer returned null');
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
	gl.viewport(0, 0, w, h);
	gl.clear(gl.COLOR_BUFFER_BIT);

	return {
		texture,
		fbo,
		width: w,
		height: h,
		texelSizeX: 1.0 / w,
		texelSizeY: 1.0 / h,
		attach(id: number) {
			gl.activeTexture(gl.TEXTURE0 + id);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			return id;
		}
	};
}

/** Allocate a ping-pong pair of FBOs. */
export function createDoubleFBO(
	gl: GL,
	w: number,
	h: number,
	internalFormat: number,
	format: number,
	type: number,
	param: number
): DoubleFBO {
	let read = createFBO(gl, w, h, internalFormat, format, type, param);
	let write = createFBO(gl, w, h, internalFormat, format, type, param);

	const dfbo: DoubleFBO = {
		width: w,
		height: h,
		texelSizeX: read.texelSizeX,
		texelSizeY: read.texelSizeY,
		get read() {
			return read;
		},
		set read(v: FBO) {
			read = v;
		},
		get write() {
			return write;
		},
		set write(v: FBO) {
			write = v;
		},
		swap() {
			const t = read;
			read = write;
			write = t;
		}
	};
	return dfbo;
}

/**
 * Resize a single FBO, copying its current contents into the new texture
 * via the supplied copy program. Used by `setConfig` Bucket C to keep dye
 * visually continuous when the user changes resolution.
 */
export function resizeFBO(
	gl: GL,
	target: FBO,
	w: number,
	h: number,
	internalFormat: number,
	format: number,
	type: number,
	param: number,
	copyProgram: ProgramWrap,
	blit: BlitFn
): FBO {
	const newFBO = createFBO(gl, w, h, internalFormat, format, type, param);
	copyProgram.bind();
	gl.uniform1i(copyProgram.uniforms.uTexture, target.attach(0));
	blit(newFBO);
	gl.deleteFramebuffer(target.fbo);
	gl.deleteTexture(target.texture);
	return newFBO;
}

/** Resize a double FBO; preserves the read texture's contents. */
export function resizeDoubleFBO(
	gl: GL,
	target: DoubleFBO,
	w: number,
	h: number,
	internalFormat: number,
	format: number,
	type: number,
	param: number,
	copyProgram: ProgramWrap,
	blit: BlitFn
): DoubleFBO {
	if (target.width === w && target.height === h) return target;
	target.read = resizeFBO(
		gl,
		target.read,
		w,
		h,
		internalFormat,
		format,
		type,
		param,
		copyProgram,
		blit
	);
	// The old write texture is dropped — its contents would be stale anyway.
	gl.deleteFramebuffer(target.write.fbo);
	gl.deleteTexture(target.write.texture);
	target.write = createFBO(gl, w, h, internalFormat, format, type, param);
	target.width = w;
	target.height = h;
	target.texelSizeX = 1.0 / w;
	target.texelSizeY = 1.0 / h;
	return target;
}

export function disposeFBO(gl: GL, target: FBO | undefined): void {
	if (!target) return;
	gl.deleteFramebuffer(target.fbo);
	gl.deleteTexture(target.texture);
}

export function disposeDoubleFBO(gl: GL, target: DoubleFBO | undefined): void {
	if (!target) return;
	disposeFBO(gl, target.read);
	disposeFBO(gl, target.write);
}

/* -------------------------------------------------------------------------- */
/*                                Blit factory                                */
/* -------------------------------------------------------------------------- */

export type BlitFn = (target: FBO | null, clear?: boolean) => void;

/**
 * Build a `blit` closure that draws the screen-filling quad into either a
 * given FBO or the default framebuffer. The vertex/index buffers are owned
 * by the engine — pass them in so they can be deleted on dispose.
 *
 * Ported from script.js:915-942.
 */
export function createBlit(gl: GL, vertexBuffer: WebGLBuffer, indexBuffer: WebGLBuffer): BlitFn {
	gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(0);

	return (target: FBO | null, clear = false) => {
		if (target == null) {
			gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		} else {
			gl.viewport(0, 0, target.width, target.height);
			gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
		}
		if (clear) {
			gl.clearColor(0.0, 0.0, 0.0, 1.0);
			gl.clear(gl.COLOR_BUFFER_BIT);
		}
		gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
	};
}

/* -------------------------------------------------------------------------- */
/*                              Pure helpers                                  */
/* -------------------------------------------------------------------------- */

/** Compute the simulation grid resolution for a given target dimension. */
export function getResolution(
	gl: GL,
	resolution: number,
	bufferWidth = gl.drawingBufferWidth,
	bufferHeight = gl.drawingBufferHeight
): { width: number; height: number } {
	let aspectRatio = bufferWidth / bufferHeight;
	if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;

	let min = Math.max(1, Math.round(resolution));
	let max = Math.max(1, Math.round(resolution * aspectRatio));
	const textureLimit = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE));
	if (Number.isFinite(textureLimit) && textureLimit > 0 && max > textureLimit) {
		const scale = textureLimit / max;
		min = Math.max(1, Math.floor(min * scale));
		max = Math.floor(textureLimit);
	}

	return bufferWidth > bufferHeight
		? { width: max, height: min }
		: { width: min, height: max };
}

/** Stretch the splat radius to compensate for non-square aspect ratios. */
export function correctRadius(radius: number, aspectRatio: number): number {
	return aspectRatio > 1 ? radius * aspectRatio : radius;
}

/** Wrap a value into a half-open interval [min, max). */
export function wrap(value: number, min: number, max: number): number {
	const range = max - min;
	if (range === 0) return min;
	return ((value - min) % range) + min;
}

/** DPR-aware coordinate scaling. */
export function scaleByPixelRatio(input: number): number {
	const pixelRatio = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
	return Math.floor(input * pixelRatio);
}

/** Tiny string hash used by `Material.setKeywords` to dedupe variants. */
export function hashCode(s: string): number {
	if (s.length === 0) return 0;
	let hash = 0;
	for (let i = 0; i < s.length; i++) {
		hash = (hash << 5) - hash + s.charCodeAt(i);
		hash |= 0;
	}
	return hash;
}

/** Compute the dithering texture's UV scale relative to the framebuffer. */
export function getTextureScale(
	texture: { width: number; height: number },
	width: number,
	height: number
): { x: number; y: number } {
	return { x: width / texture.width, y: height / texture.height };
}
