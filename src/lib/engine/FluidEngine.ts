/*
 * svelte-fluid — FluidEngine
 * Derivative work of WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017, MIT.
 * https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
 *
 * MIT License
 *
 * Copyright (c) 2017 Pavel Dobryakov  (original WebGL implementation)
 * Copyright (c) 2026 svelte-fluid contributors  (Svelte 5 / TypeScript port)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
 *
 * --------------------------------------------------------------------------
 * Architectural notes:
 *  - This is a per-instance class. There is *no* module-level mutable state.
 *  - WebGL context, framebuffers, programs, listener set, RAF loop, RNG and
 *    pointer state are all owned by the instance and freed by `dispose()`.
 *  - The Svelte component is responsible for sizing the canvas backbuffer
 *    BEFORE constructing the engine. The engine never resizes itself.
 *  - All randomness is routed through a seeded RNG so resizing produces the
 *    same initial splat pattern.
 */

import type {
	DoubleFBO,
	ExtInfo,
	FBO,
	FluidConfig,
	FluidHandle,
	ResolvedConfig,
	RGB
} from './types.js';
import {
	type BlitFn,
	type GL,
	type ProgramWrap,
	Material,
	compileShader,
	correctRadius,
	createBlit,
	createDoubleFBO,
	createFBO,
	disposeDoubleFBO,
	disposeFBO,
	getResolution,
	getTextureScale,
	getWebGLContext,
	makeProgram,
	resizeDoubleFBO,
	scaleByPixelRatio,
	wrap
} from './gl-utils.js';
import { type DitheringTexture, createDitheringTexture } from './dithering.js';
import { type Pointer, createPointer, updatePointerDownData, updatePointerMoveData, updatePointerUpData } from './pointer.js';
import { type Rng, generateColor, mulberry32, normalizeColor, randomSeed } from './rng.js';
import * as S from './shaders.js';

/* -------------------------------------------------------------------------- */
/*                                  Defaults                                  */
/* -------------------------------------------------------------------------- */

const DEFAULTS: ResolvedConfig = {
	SIM_RESOLUTION: 128,
	DYE_RESOLUTION: 1024,
	DENSITY_DISSIPATION: 1,
	INITIAL_DENSITY_DISSIPATION: 1,
	INITIAL_DENSITY_DISSIPATION_DURATION: 0,
	VELOCITY_DISSIPATION: 0.2,
	PRESSURE: 0.8,
	PRESSURE_ITERATIONS: 20,
	CURL: 30,
	SPLAT_RADIUS: 0.25,
	SPLAT_FORCE: 6000,
	SHADING: true,
	COLORFUL: true,
	COLOR_UPDATE_SPEED: 10,
	PAUSED: false,
	BACK_COLOR: { r: 0, g: 0, b: 0 },
	TRANSPARENT: false,
	BLOOM: true,
	BLOOM_ITERATIONS: 8,
	BLOOM_RESOLUTION: 256,
	BLOOM_INTENSITY: 0.8,
	BLOOM_THRESHOLD: 0.6,
	BLOOM_SOFT_KNEE: 0.7,
	SUNRAYS: true,
	SUNRAYS_RESOLUTION: 196,
	SUNRAYS_WEIGHT: 1.0,
	INITIAL_SPLAT_MIN: 5,
	INITIAL_SPLAT_MAX: 25,
	POINTER_INPUT: true,
	SEED: 0
};

function resolveConfig(input: FluidConfig | undefined, base: ResolvedConfig): ResolvedConfig {
	const out: ResolvedConfig = { ...base };
	if (!input) return out;
	if (input.simResolution !== undefined) out.SIM_RESOLUTION = input.simResolution;
	if (input.dyeResolution !== undefined) out.DYE_RESOLUTION = input.dyeResolution;
	if (input.densityDissipation !== undefined) {
		out.DENSITY_DISSIPATION = input.densityDissipation;
		// Default `initialDensityDissipation` to match the steady-state
		// value so existing consumers see no behavior change.
		if (input.initialDensityDissipation === undefined) {
			out.INITIAL_DENSITY_DISSIPATION = input.densityDissipation;
		}
	}
	if (input.initialDensityDissipation !== undefined)
		out.INITIAL_DENSITY_DISSIPATION = input.initialDensityDissipation;
	if (input.initialDensityDissipationDuration !== undefined)
		out.INITIAL_DENSITY_DISSIPATION_DURATION = input.initialDensityDissipationDuration;
	if (input.velocityDissipation !== undefined) out.VELOCITY_DISSIPATION = input.velocityDissipation;
	if (input.pressure !== undefined) out.PRESSURE = input.pressure;
	if (input.pressureIterations !== undefined) out.PRESSURE_ITERATIONS = input.pressureIterations;
	if (input.curl !== undefined) out.CURL = input.curl;
	if (input.splatRadius !== undefined) out.SPLAT_RADIUS = input.splatRadius;
	if (input.splatForce !== undefined) out.SPLAT_FORCE = input.splatForce;
	if (input.shading !== undefined) out.SHADING = input.shading;
	if (input.colorful !== undefined) out.COLORFUL = input.colorful;
	if (input.colorUpdateSpeed !== undefined) out.COLOR_UPDATE_SPEED = input.colorUpdateSpeed;
	if (input.paused !== undefined) out.PAUSED = input.paused;
	if (input.backColor !== undefined) out.BACK_COLOR = input.backColor;
	if (input.transparent !== undefined) out.TRANSPARENT = input.transparent;
	if (input.bloom !== undefined) out.BLOOM = input.bloom;
	if (input.bloomIterations !== undefined) out.BLOOM_ITERATIONS = input.bloomIterations;
	if (input.bloomResolution !== undefined) out.BLOOM_RESOLUTION = input.bloomResolution;
	if (input.bloomIntensity !== undefined) out.BLOOM_INTENSITY = input.bloomIntensity;
	if (input.bloomThreshold !== undefined) out.BLOOM_THRESHOLD = input.bloomThreshold;
	if (input.bloomSoftKnee !== undefined) out.BLOOM_SOFT_KNEE = input.bloomSoftKnee;
	if (input.sunrays !== undefined) out.SUNRAYS = input.sunrays;
	if (input.sunraysResolution !== undefined) out.SUNRAYS_RESOLUTION = input.sunraysResolution;
	if (input.sunraysWeight !== undefined) out.SUNRAYS_WEIGHT = input.sunraysWeight;
	if (input.initialSplatCountMin !== undefined) out.INITIAL_SPLAT_MIN = input.initialSplatCountMin;
	if (input.initialSplatCountMax !== undefined) out.INITIAL_SPLAT_MAX = input.initialSplatCountMax;
	if (input.initialSplatCount !== undefined) {
		out.INITIAL_SPLAT_MIN = input.initialSplatCount;
		out.INITIAL_SPLAT_MAX = input.initialSplatCount;
	}
	if (input.pointerInput !== undefined) out.POINTER_INPUT = input.pointerInput;
	if (input.seed !== undefined) out.SEED = input.seed >>> 0;
	return out;
}

/* -------------------------------------------------------------------------- */
/*                                FluidEngine                                 */
/* -------------------------------------------------------------------------- */

export interface FluidEngineOptions {
	canvas: HTMLCanvasElement;
	config?: FluidConfig;
}

export class FluidEngine implements FluidHandle {
	// --- Owned references ---
	private canvas: HTMLCanvasElement;
	private gl!: GL;
	private ext!: ExtInfo;
	private config: ResolvedConfig;
	private rng: Rng;

	// --- GL buffers ---
	private vertexBuffer!: WebGLBuffer;
	private indexBuffer!: WebGLBuffer;
	private blit!: BlitFn;

	// --- Shaders kept for dispose ---
	private baseVertexShader!: WebGLShader;
	private blurVertexShader!: WebGLShader;
	private fragmentShaders: WebGLShader[] = [];

	// --- Programs ---
	private blurProgram!: ProgramWrap;
	private copyProgram!: ProgramWrap;
	private clearProgram!: ProgramWrap;
	private colorProgram!: ProgramWrap;
	private checkerboardProgram!: ProgramWrap;
	private bloomPrefilterProgram!: ProgramWrap;
	private bloomBlurProgram!: ProgramWrap;
	private bloomFinalProgram!: ProgramWrap;
	private sunraysMaskProgram!: ProgramWrap;
	private sunraysProgram!: ProgramWrap;
	private splatProgram!: ProgramWrap;
	private advectionProgram!: ProgramWrap;
	private divergenceProgram!: ProgramWrap;
	private curlProgram!: ProgramWrap;
	private vorticityProgram!: ProgramWrap;
	private pressureProgram!: ProgramWrap;
	private gradientSubtractProgram!: ProgramWrap;
	private displayMaterial!: Material;

	// --- Framebuffers ---
	private dye!: DoubleFBO;
	private velocity!: DoubleFBO;
	private divergence!: FBO;
	private curlFBO!: FBO;
	private pressure!: DoubleFBO;
	private bloom!: FBO;
	private bloomFramebuffers: FBO[] = [];
	private sunrays!: FBO;
	private sunraysTemp!: FBO;
	private ditheringTexture!: DitheringTexture;

	// --- Runtime state ---
	private pointers: Pointer[] = [createPointer()];
	private splatStack: number[] = [];
	private lastUpdateTime = 0;
	private engineStartTime = 0;
	private colorUpdateTimer = 0;
	private rafId = 0;
	private disposed = false;
	private pointerListenersInstalled = false;

	// --- Bound listeners ---
	private onMouseDown = (e: MouseEvent) => this.handleMouseDown(e);
	private onMouseMove = (e: MouseEvent) => this.handleMouseMove(e);
	private onMouseUp = () => this.handleMouseUp();
	private onTouchStart = (e: TouchEvent) => this.handleTouchStart(e);
	private onTouchMove = (e: TouchEvent) => this.handleTouchMove(e);
	private onTouchEnd = (e: TouchEvent) => this.handleTouchEnd(e);
	private tick = () => this.update();

	constructor(opts: FluidEngineOptions) {
		this.canvas = opts.canvas;
		const seed = opts.config?.seed ?? randomSeed();
		this.config = resolveConfig({ ...opts.config, seed }, DEFAULTS);
		this.rng = mulberry32(this.config.SEED);

		this.initContext();
		this.compileShaders();
		this.initBuffersAndPrograms();
		this.ditheringTexture = createDitheringTexture(this.gl);

		this.updateKeywords();
		this.initFramebuffers();
		this.multipleSplats(this.randomSplatCount());

		// Construct-only preset splats. Applied after the random initial
		// splats so wrappers can either combine with or suppress them
		// (via `initialSplatCount: 0`). Read directly from the raw input
		// config because this field is intentionally absent from
		// `ResolvedConfig` — it has no meaning after construction.
		const presetSplats = opts.config?.presetSplats;
		if (presetSplats) {
			for (const s of presetSplats) {
				this.splat(s.x, s.y, s.dx, s.dy, s.color);
			}
		}

		if (this.config.POINTER_INPUT) {
			this.installPointerListeners();
		}

		this.lastUpdateTime = performance.now();
		this.engineStartTime = this.lastUpdateTime;
		this.rafId = requestAnimationFrame(this.tick);
	}

	/**
	 * Compute the density dissipation for this frame. If
	 * `INITIAL_DENSITY_DISSIPATION_DURATION > 0`, linearly interpolate
	 * from `INITIAL_DENSITY_DISSIPATION` toward `DENSITY_DISSIPATION`
	 * over the duration; afterwards (and always when duration ≤ 0),
	 * return the steady-state value.
	 *
	 * The clock starts when the engine begins ticking, so the ramp
	 * survives `setConfig` updates and matches the user's perception
	 * of "since the canvas appeared".
	 */
	private currentDensityDissipation(): number {
		const duration = this.config.INITIAL_DENSITY_DISSIPATION_DURATION;
		if (duration <= 0) return this.config.DENSITY_DISSIPATION;
		const elapsed = (performance.now() - this.engineStartTime) / 1000;
		if (elapsed >= duration) return this.config.DENSITY_DISSIPATION;
		const t = elapsed / duration;
		return (
			this.config.INITIAL_DENSITY_DISSIPATION * (1 - t) +
			this.config.DENSITY_DISSIPATION * t
		);
	}

	/* ---------------------------------------------------------------------- */
	/*                                Public API                              */
	/* ---------------------------------------------------------------------- */

	splat(x: number, y: number, dx: number, dy: number, color: RGB): void {
		const gl = this.gl;
		this.splatProgram.bind();
		gl.uniform1i(this.splatProgram.uniforms.uTarget, this.velocity.read.attach(0));
		gl.uniform1f(
			this.splatProgram.uniforms.aspectRatio,
			this.canvas.width / this.canvas.height
		);
		gl.uniform2f(this.splatProgram.uniforms.point, x, y);
		gl.uniform3f(this.splatProgram.uniforms.color, dx, dy, 0.0);
		gl.uniform1f(
			this.splatProgram.uniforms.radius,
			correctRadius(this.config.SPLAT_RADIUS / 100.0, this.canvas.width / this.canvas.height)
		);
		this.blit(this.velocity.write);
		this.velocity.swap();

		gl.uniform1i(this.splatProgram.uniforms.uTarget, this.dye.read.attach(0));
		gl.uniform3f(this.splatProgram.uniforms.color, color.r, color.g, color.b);
		this.blit(this.dye.write);
		this.dye.swap();
	}

	randomSplats(count: number): void {
		this.splatStack.push(count);
	}

	/**
	 * Hot-update a subset of config fields. Uses a 4-bucket strategy:
	 *   A — scalar/boolean assignment, picked up next frame.
	 *       Includes `pointerInput`, which also installs/removes the
	 *       canvas + window event listeners on transition.
	 *   B — display shader keyword recompile (shading, bloom, sunrays)
	 *   C — FBO rebuild (sim/dye/bloom/sunrays resolutions)
	 *   D — construct-only — `seed`, `initialSplatCount*`, `presetSplats`.
	 *       These are silently ignored: `seed` and `initialSplatCount*`
	 *       only affect the first frame, and `presetSplats` is absent
	 *       from `ResolvedConfig` entirely.
	 */
	setConfig(patch: FluidConfig): void {
		if (this.disposed) return;
		const next = resolveConfig(patch, this.config);
		const a = this.config;
		const b = next;

		const fbChanged = a.SIM_RESOLUTION !== b.SIM_RESOLUTION || a.DYE_RESOLUTION !== b.DYE_RESOLUTION;
		const bloomChanged =
			a.BLOOM_RESOLUTION !== b.BLOOM_RESOLUTION || a.BLOOM_ITERATIONS !== b.BLOOM_ITERATIONS;
		const sunraysChanged = a.SUNRAYS_RESOLUTION !== b.SUNRAYS_RESOLUTION;
		const kwChanged = a.SHADING !== b.SHADING || a.BLOOM !== b.BLOOM || a.SUNRAYS !== b.SUNRAYS;
		const pointerInputChanged = a.POINTER_INPUT !== b.POINTER_INPUT;

		this.config = b;

		if (fbChanged) this.initFramebuffers();
		if (bloomChanged) this.initBloomFramebuffers();
		if (sunraysChanged) this.initSunraysFramebuffers();
		if (kwChanged) this.updateKeywords();
		if (pointerInputChanged) {
			if (b.POINTER_INPUT) {
				this.installPointerListeners();
			} else {
				this.removePointerListeners();
				// Also drain any in-flight pointer state so a half-press
				// doesn't keep emitting splats after the listeners are gone.
				for (const p of this.pointers) {
					p.down = false;
					p.moved = false;
				}
			}
		}
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;

		cancelAnimationFrame(this.rafId);

		if (this.pointerListenersInstalled) {
			this.removePointerListeners();
		}

		const gl = this.gl;

		// FBOs
		disposeDoubleFBO(gl, this.dye);
		disposeDoubleFBO(gl, this.velocity);
		disposeFBO(gl, this.divergence);
		disposeFBO(gl, this.curlFBO);
		disposeDoubleFBO(gl, this.pressure);
		disposeFBO(gl, this.bloom);
		for (const fbo of this.bloomFramebuffers) disposeFBO(gl, fbo);
		this.bloomFramebuffers = [];
		disposeFBO(gl, this.sunrays);
		disposeFBO(gl, this.sunraysTemp);

		if (this.ditheringTexture) gl.deleteTexture(this.ditheringTexture.texture);

		// Programs
		const programs: ProgramWrap[] = [
			this.blurProgram,
			this.copyProgram,
			this.clearProgram,
			this.colorProgram,
			this.checkerboardProgram,
			this.bloomPrefilterProgram,
			this.bloomBlurProgram,
			this.bloomFinalProgram,
			this.sunraysMaskProgram,
			this.sunraysProgram,
			this.splatProgram,
			this.advectionProgram,
			this.divergenceProgram,
			this.curlProgram,
			this.vorticityProgram,
			this.pressureProgram,
			this.gradientSubtractProgram
		];
		for (const p of programs) gl.deleteProgram(p.program);
		this.displayMaterial.dispose();

		// Shaders
		gl.deleteShader(this.baseVertexShader);
		gl.deleteShader(this.blurVertexShader);
		for (const s of this.fragmentShaders) gl.deleteShader(s);
		this.fragmentShaders = [];

		// Buffers
		gl.deleteBuffer(this.vertexBuffer);
		gl.deleteBuffer(this.indexBuffer);

		// Force the driver to free GPU resources promptly.
		const loseCtx = gl.getExtension('WEBGL_lose_context');
		loseCtx?.loseContext();
	}

	/* ---------------------------------------------------------------------- */
	/*                              Initialization                            */
	/* ---------------------------------------------------------------------- */

	private initContext(): void {
		const { gl, ext } = getWebGLContext(this.canvas);
		this.gl = gl;
		this.ext = ext;

		// Mobile / non-linear-filtering fallback. Only relax features if the
		// hardware can't support them — never override an explicit user opt-in.
		if (!ext.supportLinearFiltering) {
			this.config.SHADING = false;
			this.config.BLOOM = false;
			this.config.SUNRAYS = false;
			this.config.DYE_RESOLUTION = Math.min(this.config.DYE_RESOLUTION, 512);
		}
	}

	private compileShaders(): void {
		const gl = this.gl;

		this.baseVertexShader = compileShader(gl, gl.VERTEX_SHADER, S.baseVertexShader);
		this.blurVertexShader = compileShader(gl, gl.VERTEX_SHADER, S.blurVertexShader);

		const advectionKeywords = this.ext.supportLinearFiltering ? null : ['MANUAL_FILTERING'];

		const fragments: Record<string, WebGLShader> = {
			blur: compileShader(gl, gl.FRAGMENT_SHADER, S.blurShader),
			copy: compileShader(gl, gl.FRAGMENT_SHADER, S.copyShader),
			clear: compileShader(gl, gl.FRAGMENT_SHADER, S.clearShader),
			color: compileShader(gl, gl.FRAGMENT_SHADER, S.colorShader),
			checkerboard: compileShader(gl, gl.FRAGMENT_SHADER, S.checkerboardShader),
			bloomPrefilter: compileShader(gl, gl.FRAGMENT_SHADER, S.bloomPrefilterShader),
			bloomBlur: compileShader(gl, gl.FRAGMENT_SHADER, S.bloomBlurShader),
			bloomFinal: compileShader(gl, gl.FRAGMENT_SHADER, S.bloomFinalShader),
			sunraysMask: compileShader(gl, gl.FRAGMENT_SHADER, S.sunraysMaskShader),
			sunrays: compileShader(gl, gl.FRAGMENT_SHADER, S.sunraysShader),
			splat: compileShader(gl, gl.FRAGMENT_SHADER, S.splatShader),
			advection: compileShader(gl, gl.FRAGMENT_SHADER, S.advectionShader, advectionKeywords),
			divergence: compileShader(gl, gl.FRAGMENT_SHADER, S.divergenceShader),
			curl: compileShader(gl, gl.FRAGMENT_SHADER, S.curlShader),
			vorticity: compileShader(gl, gl.FRAGMENT_SHADER, S.vorticityShader),
			pressure: compileShader(gl, gl.FRAGMENT_SHADER, S.pressureShader),
			gradientSubtract: compileShader(gl, gl.FRAGMENT_SHADER, S.gradientSubtractShader)
		};

		for (const f of Object.values(fragments)) this.fragmentShaders.push(f);

		// Stash for use during program creation
		this._fragmentShadersByName = fragments;
	}

	private _fragmentShadersByName!: Record<string, WebGLShader>;

	private initBuffersAndPrograms(): void {
		const gl = this.gl;

		this.vertexBuffer = gl.createBuffer()!;
		this.indexBuffer = gl.createBuffer()!;
		this.blit = createBlit(gl, this.vertexBuffer, this.indexBuffer);

		const f = this._fragmentShadersByName;
		this.blurProgram = makeProgram(gl, this.blurVertexShader, f.blur);
		this.copyProgram = makeProgram(gl, this.baseVertexShader, f.copy);
		this.clearProgram = makeProgram(gl, this.baseVertexShader, f.clear);
		this.colorProgram = makeProgram(gl, this.baseVertexShader, f.color);
		this.checkerboardProgram = makeProgram(gl, this.baseVertexShader, f.checkerboard);
		this.bloomPrefilterProgram = makeProgram(gl, this.baseVertexShader, f.bloomPrefilter);
		this.bloomBlurProgram = makeProgram(gl, this.baseVertexShader, f.bloomBlur);
		this.bloomFinalProgram = makeProgram(gl, this.baseVertexShader, f.bloomFinal);
		this.sunraysMaskProgram = makeProgram(gl, this.baseVertexShader, f.sunraysMask);
		this.sunraysProgram = makeProgram(gl, this.baseVertexShader, f.sunrays);
		this.splatProgram = makeProgram(gl, this.baseVertexShader, f.splat);
		this.advectionProgram = makeProgram(gl, this.baseVertexShader, f.advection);
		this.divergenceProgram = makeProgram(gl, this.baseVertexShader, f.divergence);
		this.curlProgram = makeProgram(gl, this.baseVertexShader, f.curl);
		this.vorticityProgram = makeProgram(gl, this.baseVertexShader, f.vorticity);
		this.pressureProgram = makeProgram(gl, this.baseVertexShader, f.pressure);
		this.gradientSubtractProgram = makeProgram(gl, this.baseVertexShader, f.gradientSubtract);

		this.displayMaterial = new Material(gl, this.baseVertexShader, S.displayShaderSource);
	}

	private initFramebuffers(): void {
		const gl = this.gl;
		const simRes = getResolution(gl, this.config.SIM_RESOLUTION);
		const dyeRes = getResolution(gl, this.config.DYE_RESOLUTION);
		const texType = this.ext.halfFloatTexType;
		const rgba = this.ext.formatRGBA;
		const rg = this.ext.formatRG;
		const r = this.ext.formatR;
		const filtering = this.ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

		gl.disable(gl.BLEND);

		if (this.dye == null) {
			this.dye = createDoubleFBO(
				gl,
				dyeRes.width,
				dyeRes.height,
				rgba.internalFormat,
				rgba.format,
				texType,
				filtering
			);
		} else {
			this.dye = resizeDoubleFBO(
				gl,
				this.dye,
				dyeRes.width,
				dyeRes.height,
				rgba.internalFormat,
				rgba.format,
				texType,
				filtering,
				this.copyProgram,
				this.blit
			);
		}

		if (this.velocity == null) {
			this.velocity = createDoubleFBO(
				gl,
				simRes.width,
				simRes.height,
				rg.internalFormat,
				rg.format,
				texType,
				filtering
			);
		} else {
			this.velocity = resizeDoubleFBO(
				gl,
				this.velocity,
				simRes.width,
				simRes.height,
				rg.internalFormat,
				rg.format,
				texType,
				filtering,
				this.copyProgram,
				this.blit
			);
		}

		// Single-buffer FBOs are recreated unconditionally — their contents are
		// transient (recomputed every step), so no copy is needed.
		disposeFBO(gl, this.divergence);
		disposeFBO(gl, this.curlFBO);
		disposeDoubleFBO(gl, this.pressure);

		this.divergence = createFBO(
			gl,
			simRes.width,
			simRes.height,
			r.internalFormat,
			r.format,
			texType,
			gl.NEAREST
		);
		this.curlFBO = createFBO(
			gl,
			simRes.width,
			simRes.height,
			r.internalFormat,
			r.format,
			texType,
			gl.NEAREST
		);
		this.pressure = createDoubleFBO(
			gl,
			simRes.width,
			simRes.height,
			r.internalFormat,
			r.format,
			texType,
			gl.NEAREST
		);

		this.initBloomFramebuffers();
		this.initSunraysFramebuffers();
	}

	private initBloomFramebuffers(): void {
		const gl = this.gl;
		const res = getResolution(gl, this.config.BLOOM_RESOLUTION);
		const texType = this.ext.halfFloatTexType;
		const rgba = this.ext.formatRGBA;
		const filtering = this.ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

		disposeFBO(gl, this.bloom);
		for (const fbo of this.bloomFramebuffers) disposeFBO(gl, fbo);
		this.bloomFramebuffers = [];

		this.bloom = createFBO(
			gl,
			res.width,
			res.height,
			rgba.internalFormat,
			rgba.format,
			texType,
			filtering
		);

		for (let i = 0; i < this.config.BLOOM_ITERATIONS; i++) {
			const width = res.width >> (i + 1);
			const height = res.height >> (i + 1);
			if (width < 2 || height < 2) break;
			this.bloomFramebuffers.push(
				createFBO(gl, width, height, rgba.internalFormat, rgba.format, texType, filtering)
			);
		}
	}

	private initSunraysFramebuffers(): void {
		const gl = this.gl;
		const res = getResolution(gl, this.config.SUNRAYS_RESOLUTION);
		const texType = this.ext.halfFloatTexType;
		const r = this.ext.formatR;
		const filtering = this.ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

		disposeFBO(gl, this.sunrays);
		disposeFBO(gl, this.sunraysTemp);

		this.sunrays = createFBO(
			gl,
			res.width,
			res.height,
			r.internalFormat,
			r.format,
			texType,
			filtering
		);
		this.sunraysTemp = createFBO(
			gl,
			res.width,
			res.height,
			r.internalFormat,
			r.format,
			texType,
			filtering
		);
	}

	private updateKeywords(): void {
		const keywords: string[] = [];
		if (this.config.SHADING) keywords.push('SHADING');
		if (this.config.BLOOM) keywords.push('BLOOM');
		if (this.config.SUNRAYS) keywords.push('SUNRAYS');
		this.displayMaterial.setKeywords(keywords);
	}

	/* ---------------------------------------------------------------------- */
	/*                                 Update loop                            */
	/* ---------------------------------------------------------------------- */

	private update(): void {
		if (this.disposed) return;
		const dt = this.calcDeltaTime();
		this.updateColors(dt);
		this.applyInputs();
		if (!this.config.PAUSED) this.step(dt);
		this.render(null);
		this.rafId = requestAnimationFrame(this.tick);
	}

	private calcDeltaTime(): number {
		const now = performance.now();
		let dt = (now - this.lastUpdateTime) / 1000;
		dt = Math.min(dt, 0.016666);
		this.lastUpdateTime = now;
		return dt;
	}

	private updateColors(dt: number): void {
		if (!this.config.COLORFUL) return;
		this.colorUpdateTimer += dt * this.config.COLOR_UPDATE_SPEED;
		if (this.colorUpdateTimer >= 1) {
			this.colorUpdateTimer = wrap(this.colorUpdateTimer, 0, 1);
			for (const p of this.pointers) {
				p.color = generateColor(this.rng);
			}
		}
	}

	private applyInputs(): void {
		if (this.splatStack.length > 0) {
			this.multipleSplats(this.splatStack.pop()!);
		}
		for (const p of this.pointers) {
			if (p.moved) {
				p.moved = false;
				this.splatPointer(p);
			}
		}
	}

	private step(dt: number): void {
		const gl = this.gl;
		gl.disable(gl.BLEND);

		this.curlProgram.bind();
		gl.uniform2f(
			this.curlProgram.uniforms.texelSize,
			this.velocity.texelSizeX,
			this.velocity.texelSizeY
		);
		gl.uniform1i(this.curlProgram.uniforms.uVelocity, this.velocity.read.attach(0));
		this.blit(this.curlFBO);

		this.vorticityProgram.bind();
		gl.uniform2f(
			this.vorticityProgram.uniforms.texelSize,
			this.velocity.texelSizeX,
			this.velocity.texelSizeY
		);
		gl.uniform1i(this.vorticityProgram.uniforms.uVelocity, this.velocity.read.attach(0));
		gl.uniform1i(this.vorticityProgram.uniforms.uCurl, this.curlFBO.attach(1));
		gl.uniform1f(this.vorticityProgram.uniforms.curl, this.config.CURL);
		gl.uniform1f(this.vorticityProgram.uniforms.dt, dt);
		this.blit(this.velocity.write);
		this.velocity.swap();

		this.divergenceProgram.bind();
		gl.uniform2f(
			this.divergenceProgram.uniforms.texelSize,
			this.velocity.texelSizeX,
			this.velocity.texelSizeY
		);
		gl.uniform1i(this.divergenceProgram.uniforms.uVelocity, this.velocity.read.attach(0));
		this.blit(this.divergence);

		this.clearProgram.bind();
		gl.uniform1i(this.clearProgram.uniforms.uTexture, this.pressure.read.attach(0));
		gl.uniform1f(this.clearProgram.uniforms.value, this.config.PRESSURE);
		this.blit(this.pressure.write);
		this.pressure.swap();

		this.pressureProgram.bind();
		gl.uniform2f(
			this.pressureProgram.uniforms.texelSize,
			this.velocity.texelSizeX,
			this.velocity.texelSizeY
		);
		gl.uniform1i(this.pressureProgram.uniforms.uDivergence, this.divergence.attach(0));
		for (let i = 0; i < this.config.PRESSURE_ITERATIONS; i++) {
			gl.uniform1i(this.pressureProgram.uniforms.uPressure, this.pressure.read.attach(1));
			this.blit(this.pressure.write);
			this.pressure.swap();
		}

		this.gradientSubtractProgram.bind();
		gl.uniform2f(
			this.gradientSubtractProgram.uniforms.texelSize,
			this.velocity.texelSizeX,
			this.velocity.texelSizeY
		);
		gl.uniform1i(
			this.gradientSubtractProgram.uniforms.uPressure,
			this.pressure.read.attach(0)
		);
		gl.uniform1i(
			this.gradientSubtractProgram.uniforms.uVelocity,
			this.velocity.read.attach(1)
		);
		this.blit(this.velocity.write);
		this.velocity.swap();

		this.advectionProgram.bind();
		gl.uniform2f(
			this.advectionProgram.uniforms.texelSize,
			this.velocity.texelSizeX,
			this.velocity.texelSizeY
		);
		if (!this.ext.supportLinearFiltering) {
			gl.uniform2f(
				this.advectionProgram.uniforms.dyeTexelSize,
				this.velocity.texelSizeX,
				this.velocity.texelSizeY
			);
		}
		const velocityId = this.velocity.read.attach(0);
		gl.uniform1i(this.advectionProgram.uniforms.uVelocity, velocityId);
		gl.uniform1i(this.advectionProgram.uniforms.uSource, velocityId);
		gl.uniform1f(this.advectionProgram.uniforms.dt, dt);
		gl.uniform1f(
			this.advectionProgram.uniforms.dissipation,
			this.config.VELOCITY_DISSIPATION
		);
		this.blit(this.velocity.write);
		this.velocity.swap();

		if (!this.ext.supportLinearFiltering) {
			gl.uniform2f(
				this.advectionProgram.uniforms.dyeTexelSize,
				this.dye.texelSizeX,
				this.dye.texelSizeY
			);
		}
		gl.uniform1i(this.advectionProgram.uniforms.uVelocity, this.velocity.read.attach(0));
		gl.uniform1i(this.advectionProgram.uniforms.uSource, this.dye.read.attach(1));
		gl.uniform1f(
			this.advectionProgram.uniforms.dissipation,
			this.currentDensityDissipation()
		);
		this.blit(this.dye.write);
		this.dye.swap();
	}

	private render(target: FBO | null): void {
		const gl = this.gl;

		if (this.config.BLOOM) this.applyBloom(this.dye.read, this.bloom);
		if (this.config.SUNRAYS) {
			this.applySunrays(this.dye.read, this.dye.write, this.sunrays);
			this.blur(this.sunrays, this.sunraysTemp, 1);
		}

		if (target == null || !this.config.TRANSPARENT) {
			gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
			gl.enable(gl.BLEND);
		} else {
			gl.disable(gl.BLEND);
		}

		if (!this.config.TRANSPARENT) {
			this.drawColor(target, normalizeColor(this.config.BACK_COLOR));
		}
		if (target == null && this.config.TRANSPARENT) {
			this.drawCheckerboard(target);
		}
		this.drawDisplay(target);
	}

	private drawColor(target: FBO | null, color: RGB): void {
		const gl = this.gl;
		this.colorProgram.bind();
		gl.uniform4f(this.colorProgram.uniforms.color, color.r, color.g, color.b, 1);
		this.blit(target);
	}

	private drawCheckerboard(target: FBO | null): void {
		const gl = this.gl;
		this.checkerboardProgram.bind();
		gl.uniform1f(
			this.checkerboardProgram.uniforms.aspectRatio,
			this.canvas.width / this.canvas.height
		);
		this.blit(target);
	}

	private drawDisplay(target: FBO | null): void {
		const gl = this.gl;
		const width = target == null ? gl.drawingBufferWidth : target.width;
		const height = target == null ? gl.drawingBufferHeight : target.height;

		this.displayMaterial.bind();
		if (this.config.SHADING) {
			gl.uniform2f(this.displayMaterial.uniforms.texelSize, 1.0 / width, 1.0 / height);
		}
		gl.uniform1i(this.displayMaterial.uniforms.uTexture, this.dye.read.attach(0));
		if (this.config.BLOOM) {
			gl.uniform1i(this.displayMaterial.uniforms.uBloom, this.bloom.attach(1));
			gl.uniform1i(
				this.displayMaterial.uniforms.uDithering,
				this.ditheringTexture.attach(2)
			);
			const scale = getTextureScale(this.ditheringTexture, width, height);
			gl.uniform2f(this.displayMaterial.uniforms.ditherScale, scale.x, scale.y);
		}
		if (this.config.SUNRAYS) {
			gl.uniform1i(this.displayMaterial.uniforms.uSunrays, this.sunrays.attach(3));
		}
		this.blit(target);
	}

	private applyBloom(source: FBO, destination: FBO): void {
		if (this.bloomFramebuffers.length < 2) return;

		const gl = this.gl;
		let last = destination;

		gl.disable(gl.BLEND);
		this.bloomPrefilterProgram.bind();
		const knee = this.config.BLOOM_THRESHOLD * this.config.BLOOM_SOFT_KNEE + 0.0001;
		const curve0 = this.config.BLOOM_THRESHOLD - knee;
		const curve1 = knee * 2;
		const curve2 = 0.25 / knee;
		gl.uniform3f(this.bloomPrefilterProgram.uniforms.curve, curve0, curve1, curve2);
		gl.uniform1f(
			this.bloomPrefilterProgram.uniforms.threshold,
			this.config.BLOOM_THRESHOLD
		);
		gl.uniform1i(this.bloomPrefilterProgram.uniforms.uTexture, source.attach(0));
		this.blit(last);

		this.bloomBlurProgram.bind();
		for (let i = 0; i < this.bloomFramebuffers.length; i++) {
			const dest = this.bloomFramebuffers[i];
			gl.uniform2f(
				this.bloomBlurProgram.uniforms.texelSize,
				last.texelSizeX,
				last.texelSizeY
			);
			gl.uniform1i(this.bloomBlurProgram.uniforms.uTexture, last.attach(0));
			this.blit(dest);
			last = dest;
		}

		gl.blendFunc(gl.ONE, gl.ONE);
		gl.enable(gl.BLEND);

		for (let i = this.bloomFramebuffers.length - 2; i >= 0; i--) {
			const baseTex = this.bloomFramebuffers[i];
			gl.uniform2f(
				this.bloomBlurProgram.uniforms.texelSize,
				last.texelSizeX,
				last.texelSizeY
			);
			gl.uniform1i(this.bloomBlurProgram.uniforms.uTexture, last.attach(0));
			gl.viewport(0, 0, baseTex.width, baseTex.height);
			this.blit(baseTex);
			last = baseTex;
		}

		gl.disable(gl.BLEND);
		this.bloomFinalProgram.bind();
		gl.uniform2f(
			this.bloomFinalProgram.uniforms.texelSize,
			last.texelSizeX,
			last.texelSizeY
		);
		gl.uniform1i(this.bloomFinalProgram.uniforms.uTexture, last.attach(0));
		gl.uniform1f(this.bloomFinalProgram.uniforms.intensity, this.config.BLOOM_INTENSITY);
		this.blit(destination);
	}

	private applySunrays(source: FBO, mask: FBO, destination: FBO): void {
		const gl = this.gl;
		gl.disable(gl.BLEND);
		this.sunraysMaskProgram.bind();
		gl.uniform1i(this.sunraysMaskProgram.uniforms.uTexture, source.attach(0));
		this.blit(mask);

		this.sunraysProgram.bind();
		gl.uniform1f(this.sunraysProgram.uniforms.weight, this.config.SUNRAYS_WEIGHT);
		gl.uniform1i(this.sunraysProgram.uniforms.uTexture, mask.attach(0));
		this.blit(destination);
	}

	private blur(target: FBO, temp: FBO, iterations: number): void {
		const gl = this.gl;
		this.blurProgram.bind();
		for (let i = 0; i < iterations; i++) {
			gl.uniform2f(this.blurProgram.uniforms.texelSize, target.texelSizeX, 0.0);
			gl.uniform1i(this.blurProgram.uniforms.uTexture, target.attach(0));
			this.blit(temp);

			gl.uniform2f(this.blurProgram.uniforms.texelSize, 0.0, target.texelSizeY);
			gl.uniform1i(this.blurProgram.uniforms.uTexture, temp.attach(0));
			this.blit(target);
		}
	}

	private splatPointer(pointer: Pointer): void {
		const dx = pointer.deltaX * this.config.SPLAT_FORCE;
		const dy = pointer.deltaY * this.config.SPLAT_FORCE;
		this.splat(pointer.texcoordX, pointer.texcoordY, dx, dy, pointer.color);
	}

	private multipleSplats(amount: number): void {
		for (let i = 0; i < amount; i++) {
			const color = generateColor(this.rng);
			color.r *= 10.0;
			color.g *= 10.0;
			color.b *= 10.0;
			const x = this.rng();
			const y = this.rng();
			const dx = 1000 * (this.rng() - 0.5);
			const dy = 1000 * (this.rng() - 0.5);
			this.splat(x, y, dx, dy, color);
		}
	}

	private randomSplatCount(): number {
		const lo = this.config.INITIAL_SPLAT_MIN;
		const hi = this.config.INITIAL_SPLAT_MAX;
		if (lo === hi) return lo;
		return Math.floor(this.rng() * (hi - lo + 1)) + lo;
	}

	/* ---------------------------------------------------------------------- */
	/*                              Pointer events                            */
	/* ---------------------------------------------------------------------- */

	private installPointerListeners(): void {
		if (this.pointerListenersInstalled) return;
		this.canvas.addEventListener('mousedown', this.onMouseDown);
		this.canvas.addEventListener('mousemove', this.onMouseMove);
		window.addEventListener('mouseup', this.onMouseUp);
		this.canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
		this.canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
		window.addEventListener('touchend', this.onTouchEnd);
		this.pointerListenersInstalled = true;
	}

	private removePointerListeners(): void {
		if (!this.pointerListenersInstalled) return;
		this.canvas.removeEventListener('mousedown', this.onMouseDown);
		this.canvas.removeEventListener('mousemove', this.onMouseMove);
		window.removeEventListener('mouseup', this.onMouseUp);
		this.canvas.removeEventListener('touchstart', this.onTouchStart);
		this.canvas.removeEventListener('touchmove', this.onTouchMove);
		window.removeEventListener('touchend', this.onTouchEnd);
		this.pointerListenersInstalled = false;
	}

	private getCanvasOffset(clientX: number, clientY: number): { x: number; y: number } {
		const rect = this.canvas.getBoundingClientRect();
		return {
			x: scaleByPixelRatio(clientX - rect.left),
			y: scaleByPixelRatio(clientY - rect.top)
		};
	}

	private handleMouseDown(e: MouseEvent): void {
		const { x, y } = this.getCanvasOffset(e.clientX, e.clientY);
		let pointer = this.pointers.find((p) => p.id === -1);
		if (pointer == null) {
			pointer = createPointer();
			this.pointers.push(pointer);
		}
		updatePointerDownData(
			pointer,
			-1,
			x,
			y,
			this.canvas.width,
			this.canvas.height,
			generateColor(this.rng)
		);
	}

	private handleMouseMove(e: MouseEvent): void {
		const pointer = this.pointers[0];
		if (!pointer.down) return;
		const { x, y } = this.getCanvasOffset(e.clientX, e.clientY);
		updatePointerMoveData(pointer, x, y, this.canvas.width, this.canvas.height);
	}

	private handleMouseUp(): void {
		updatePointerUpData(this.pointers[0]);
	}

	private handleTouchStart(e: TouchEvent): void {
		e.preventDefault();
		const touches = e.targetTouches;
		while (touches.length >= this.pointers.length) {
			this.pointers.push(createPointer());
		}
		for (let i = 0; i < touches.length; i++) {
			const { x, y } = this.getCanvasOffset(touches[i].clientX, touches[i].clientY);
			updatePointerDownData(
				this.pointers[i + 1],
				touches[i].identifier,
				x,
				y,
				this.canvas.width,
				this.canvas.height,
				generateColor(this.rng)
			);
		}
	}

	private handleTouchMove(e: TouchEvent): void {
		e.preventDefault();
		const touches = e.targetTouches;
		for (let i = 0; i < touches.length; i++) {
			const pointer = this.pointers[i + 1];
			if (!pointer || !pointer.down) continue;
			const { x, y } = this.getCanvasOffset(touches[i].clientX, touches[i].clientY);
			updatePointerMoveData(pointer, x, y, this.canvas.width, this.canvas.height);
		}
	}

	private handleTouchEnd(e: TouchEvent): void {
		const touches = e.changedTouches;
		for (let i = 0; i < touches.length; i++) {
			const pointer = this.pointers.find((p) => p.id === touches[i].identifier);
			if (!pointer) continue;
			updatePointerUpData(pointer);
		}
	}
}
