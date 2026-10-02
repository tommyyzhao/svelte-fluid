/*
 * Pigment on paper (ADR-0090): a small watercolour solver after Curtis et al.
 * 1997, "Computer-Generated Watercolor", with a 12-band Kubelka–Munk display.
 *
 * A sibling of FluidEngine, not a mode of it. It renders through the shared
 * WebGL2 host (ADR-0088) and owns only its fields: velocity, wet (suspended)
 * pigment, deposited pigment, water, pressure scratch, paper height and the
 * resist SDF. Frames come from the shared scheduler and only while wet or
 * dirty; a dry, idle or hidden surface subscribes nothing.
 */

import { subscribeFrame } from '../frame-scheduler.js';
import { acquireGlHost, releaseGlHost } from '../gl-host.js';
import type { GlHost, GlHostInstance } from '../gl-host.js';
import { supportRenderTextureFormat } from '../gl-utils.js';
import { JumpFlood } from '../jump-flood.js';
import { notifyHost } from '../notify-host.js';
import { canvasPixelSize, fitDrawingBufferSize } from '../resolution.js';
import { baseVertexShader } from '../shaders.js';
import type { FBO } from '../types.js';
import { DabQueue, StrokeLog, openingWash, wetStepsFor, DABS_PER_PASS, EVAP } from './brush.js';
import type { Corner, Dab } from './brush.js';
import { PIGMENT_DEFAULTS, resolvePigmentOptions } from './options.js';
import type { PigmentOptions, PigmentOptionsInput } from './options.js';
import * as S from './shaders.js';
import { BAND_CMF, WATERCOLOUR_S, bandsToLinear, hexToLinear, packPigments, pigmentFromToken, tokenReflectance } from './spectral.js';
import { XYZ_TO_LINEAR_SRGB } from './spectral-data.js';

/** Per-pigment behaviour by channel: settle rate, granulation, lift on rewet. */
const SETTLE = new Float32Array([0.004, 0.003, 0.004, 0.004]);
const GRAN = new Float32Array([0.9, 0.2, 0.35, 0.5]);
const LIFT = new Float32Array([0.004, 0.01, 0.004, 0.004]);
const WET_DRY = 0.04;
const JACOBI = 16;
/** One solver step per 60 Hz frame of wall time, whatever the display rate. */
const STEP_MS = 1000 / 60;
/** Catch-up cap after a stall: drying is allowed to slow rather than spike. */
const MAX_STEPS_PER_FRAME = 3;
/** Invisible steps per frame while settling a still (reduced motion, restore): ~1 frame of GPU budget each. */
const SETTLE_STEPS_PER_FRAME = 16;
/** CSS px per solver cell; grows on very large surfaces to cap the grid. */
const CELL_CSS = 3;
const MAX_SIM_CELLS = 512;
/** Resist mask texels per side, at most; one texel is >= 1 CSS px. */
const MAX_MASK = 1024;
/** Opening-wash clearance around resists, CSS px. */
const WASH_CLEARANCE_CSS = 16;

/** A dry region: a box in CSS px relative to the surface's top-left, with its border radii. */
export interface ResistRect {
	x: number;
	y: number;
	w: number;
	h: number;
	/** Elliptical corner radii, CSS px, in `roundRect` order: top-left, top-right, bottom-right, bottom-left. */
	radii?: readonly [Corner, Corner, Corner, Corner];
}

export interface PigmentEngineOptions extends PigmentOptionsInput {
	canvas: HTMLCanvasElement;
	/** Paint the seeded opening wash once sized. Default true. */
	openingWash?: boolean;
	/** The shared context was lost; the last frame stays visible. */
	onContextLost?: () => void;
	/** The shared context is back and the surface has been rebuilt. */
	onContextRestored?: () => void;
	/** Resource allocation failed or a frame threw; the surface stopped for good. */
	onError?: (error: unknown) => void;
}

interface Target {
	tex: WebGLTexture;
	w: number;
	h: number;
}
type Pair = [Target, Target];
type Uniform = WebGLTexture | number | ['1i' | '2f' | '3f' | '4f' | 'm3', Float32Array | number[]];

interface Fields {
	simW: number;
	simH: number;
	cell: number;
	vel: Pair;
	water: Pair;
	susp: Pair;
	dep: Pair;
	pressure: Pair;
	div: Target;
	curl: Target;
	paper: Target;
}

export class PigmentEngine implements GlHostInstance {
	readonly canvas: HTMLCanvasElement;
	private host: GlHost | null = null;
	private opts: PigmentOptions;
	private callbacks: Pick<PigmentEngineOptions, 'onContextLost' | 'onContextRestored' | 'onError'>;
	private fbo: WebGLFramebuffer | null = null;
	private f32 = false;
	private fields: Fields | null = null;
	private paperHi: Target | null = null;
	private resist: Target | null = null;
	private resistFbo: FBO | null = null;
	private jfa: JumpFlood | null = null;
	private resistRects: ResistRect[] = [];
	private maskCss = 1;
	private cssW = 0;
	private cssH = 0;
	private dpr = 1;
	private queue = new DabQueue();
	private log = new StrokeLog();
	private replay: Dab[][] = [];
	private uniforms: Record<string, Uniform> = {};
	private unsubscribe: (() => void) | null = null;
	private visible = true;
	private still = false;
	private settling = false;
	private dirty = true;
	private lost = false;
	private failed = false;
	private disposed = false;
	private lastNow = 0;
	private acc = 0;
	private wantOpening: boolean;
	/** Frames presented; test/diagnostic observability. */
	presents = 0;
	/** Resolves once the latest frame is on the visible canvas. */
	lastPresent: Promise<void> = Promise.resolve();

	constructor(options: PigmentEngineOptions) {
		this.canvas = options.canvas;
		this.callbacks = options;
		this.wantOpening = options.openingWash ?? true;
		this.opts = resolvePigmentOptions(PIGMENT_DEFAULTS, options);
		this.packLook();
		// Throws WebGLUnavailableError without WebGL2/bitmaprenderer: the
		// component catches it and keeps plain paper.
		this.host = acquireGlHost(this);
		try {
			this.host.run(this, (gl) => this.initGl(gl));
		} catch (error) {
			releaseGlHost(this);
			this.host = null;
			throw error;
		}
	}

	/* ------------------------------------------------------------ public */

	/** Size the surface in CSS px at `devicePixelRatio`. Fields are resampled, never reset. */
	resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
		if (this.disposed || this.failed) return;
		if (!(cssWidth > 0 && cssHeight > 0)) return;
		const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
		if (cssWidth === this.cssW && cssHeight === this.cssH && dpr === this.dpr && this.fields) return;
		const prev = { w: this.cssW, h: this.cssH };
		this.cssW = cssWidth;
		this.cssH = cssHeight;
		this.dpr = dpr;
		this.guard(() => this.host!.run(this, (gl) => this.allocate(gl, prev)));
		this.invalidate();
	}

	/** Apply an options patch; `undefined` fields keep their resolved value. */
	setOptions(patch: PigmentOptionsInput): void {
		const next = resolvePigmentOptions(this.opts, patch);
		const look = next.paper !== this.opts.paper || next.pigments.join() !== this.opts.pigments.join();
		const seed = next.seed !== this.opts.seed;
		this.opts = next;
		if (look) this.packLook();
		if (seed && this.fields) this.guard(() => this.host!.run(this, (gl) => this.drawPaper(gl)));
		if (look || seed) this.invalidate();
	}

	get options(): Readonly<PigmentOptions> {
		return this.opts;
	}

	/** Regions that stay dry (CSS px, surface-relative). */
	setResist(rects: readonly ResistRect[]): void {
		const next = rects
			.filter((r) => [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0)
			.map((r) => ({ ...r, radii: r.radii?.every((c) => Number.isFinite(c.x) && Number.isFinite(c.y)) ? r.radii : undefined }));
		if (JSON.stringify(next) === JSON.stringify(this.resistRects)) return;
		this.resistRects = next;
		if (this.fields) this.guard(() => this.host!.run(this, (gl) => this.buildResist(gl)));
		this.invalidate();
	}

	/** Queue brush dabs (CSS px). Non-finite dabs are dropped; a full queue drops new input. */
	paint(dabs: readonly Dab[]): number {
		if (this.disposed || this.failed) return 0;
		const kept = this.queue.push(dabs);
		if (kept) this.wake();
		return kept;
	}

	/** Brush settings for pointer input. */
	get brush(): PigmentOptions['brush'] {
		return this.opts.brush;
	}

	get pigmentCount(): number {
		return this.opts.pigments.length;
	}

	/** Pause frames while offscreen; wet paper resumes drying when visible. */
	setVisible(visible: boolean): void {
		this.visible = visible;
		if (visible) this.wake();
		else this.sleep();
	}

	/**
	 * Reduced motion: nothing animates. Wet paper is solved to dry invisibly
	 * (fixed steps, so the result is deterministic) and presented once.
	 */
	setStill(still: boolean): void {
		this.still = still;
		this.invalidate();
	}

	/** Solve to dry now and present once (synchronous). */
	settle(maxSteps = 4000): void {
		this.guard(() => {
			for (let i = 0; i < maxSteps && this.wet; i++) this.host!.run(this, (gl) => this.step(gl));
			this.present();
		});
		if (!this.wet) this.sleep();
	}

	/** Water or input remains: frames are needed. */
	get wet(): boolean {
		return this.queue.wet || this.replay.length > 0 || (this.wantOpening && !!this.fields);
	}

	/**
	 * The opening wash waits for the first step, so the resists set right
	 * after the first resize are known and it can be laid around them.
	 */
	private landOpening(): void {
		if (!this.wantOpening || !this.fields) return;
		this.wantOpening = false;
		this.queue.push(openingWash(this.cssW, this.cssH, this.opts.pigments.length, this.opts.seed, this.resistRects, WASH_CLEARANCE_CSS));
	}

	get subscribed(): boolean {
		return this.unsubscribe !== null;
	}

	get isLost(): boolean {
		return this.lost;
	}

	/**
	 * @internal Test hook: RGBA float readback of a sim field (width x height,
	 * bottom row first). Null while lost or unsized.
	 */
	readField(name: 'water' | 'wet' | 'deposited'): { data: Float32Array; width: number; height: number } | null {
		const f = this.fields;
		if (!f || !this.host) return null;
		const target = name === 'water' ? f.water[0] : name === 'wet' ? f.susp[0] : f.dep[0];
		const data = new Float32Array(f.simW * f.simH * 4);
		const ok = this.host.run(this, (gl) => {
			this.bindTargets(gl, [target]);
			gl.readPixels(0, 0, f.simW, f.simH, gl.RGBA, gl.FLOAT, data);
		});
		return ok ? { data, width: f.simW, height: f.simH } : null;
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.sleep();
		const host = this.host;
		if (host && !this.lost && !host.gl.isContextLost()) this.freeGl(host.gl);
		this.fields = null;
		releaseGlHost(this);
		this.host = null;
	}

	/* ------------------------------------------------------ host callbacks */

	onContextLost(): void {
		this.lost = true;
		this.sleep();
		// Every handle died with the context; the visible canvas keeps its frame.
		this.fields = null;
		this.paperHi = null;
		this.resist = null;
		this.resistFbo = null;
		this.jfa = null;
		this.fbo = null;
		notifyHost(this.callbacks.onContextLost, 'onContextLost');
	}

	onContextRestored(): void {
		if (this.disposed || this.failed) return;
		this.lost = false;
		const ok = this.guard(() =>
			this.host!.run(this, (gl) => {
				this.initGl(gl);
				if (this.cssW > 0) this.allocate(gl, { w: 0, h: 0 });
			})
		);
		if (!ok) return;
		// The log replays landed strokes to the dry state, unseen; queued
		// input never reached the GPU and simply lands afterwards.
		this.replay = this.log.batches();
		this.settling = this.replay.length > 0;
		this.invalidate();
		notifyHost(this.callbacks.onContextRestored, 'onContextRestored');
	}

	/* ---------------------------------------------------------- lifecycle */

	private guard(fn: () => void): boolean {
		if (this.failed || !this.host) return false;
		try {
			fn();
			return true;
		} catch (error) {
			this.fail(error);
			return false;
		}
	}

	private fail(error: unknown): void {
		if (this.failed) return;
		this.failed = true;
		this.sleep();
		console.error('svelte-fluid: pigment surface failed', error);
		notifyHost(this.callbacks.onError, 'onError', error);
	}

	private invalidate(): void {
		this.dirty = true;
		this.wake();
	}

	private wake(): void {
		if (this.unsubscribe || !this.visible || this.lost || this.failed || this.disposed || !this.fields) return;
		if (!this.wet && !this.dirty) return;
		this.lastNow = 0;
		this.acc = 0;
		this.unsubscribe = subscribeFrame(
			(now) => this.frame(now),
			(error) => {
				this.unsubscribe = null;
				this.fail(error);
			}
		);
	}

	private sleep(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
	}

	private frame(now: number): void {
		const host = this.host!;
		const quiet = this.still || this.settling;
		let steps: number;
		if (quiet) {
			steps = SETTLE_STEPS_PER_FRAME;
		} else {
			this.acc += this.lastNow ? Math.min(now - this.lastNow, STEP_MS * MAX_STEPS_PER_FRAME) : STEP_MS;
			steps = Math.floor(this.acc / STEP_MS);
			this.acc -= steps * STEP_MS;
		}
		this.lastNow = now;
		let stepped = false;
		for (let i = 0; i < steps && this.wet; i++) {
			host.run(this, (gl) => this.step(gl));
			stepped = true;
		}
		if (!this.wet) this.settling = false;
		// A still presents only its dry result; motion presents every step.
		if ((quiet && !this.wet) || (!quiet && stepped) || (this.dirty && !this.wet)) {
			this.present();
			this.dirty = false;
		}
		if (!this.wet && !this.dirty) this.sleep();
	}

	private present(): void {
		const host = this.host!;
		if (!this.fields || !host.run(this, (gl) => this.display(gl))) return;
		this.presents++;
		this.lastPresent = host.present(this);
	}

	/* --------------------------------------------------------- GL set-up */

	private initGl(gl: WebGL2RenderingContext): void {
		const host = this.host!;
		this.fbo = gl.createFramebuffer();
		if (!this.fbo) throw new Error('svelte-fluid: could not allocate a pigment framebuffer');
		// fp16 cannot hold evaporation steps of ~3e-3 against a depth near 1
		// for long; fp32 where it is renderable and filterable, else half floats
		// (drying is then coarser but still bounded by the step clock).
		this.f32 = host.ext.supportLinearFiltering && supportRenderTextureFormat(gl, gl.RGBA32F, gl.RGBA, gl.FLOAT);
		this.jfa = new JumpFlood(gl, host.ext, (name, fragment) => host.program(name, baseVertexShader, fragment), host.blit.bind(host));
	}

	private texture(gl: WebGL2RenderingContext, w: number, h: number, internal: number, format: number, type: number): Target {
		const tex = gl.createTexture();
		if (!tex) throw new Error('svelte-fluid: gl.createTexture returned null');
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
		return { tex, w, h };
	}

	private field(gl: WebGL2RenderingContext, w: number, h: number, channels: 1 | 2 | 4): Target {
		const ext = this.host!.ext;
		const t = this.f32
			? channels === 1
				? this.texture(gl, w, h, gl.R32F, gl.RED, gl.FLOAT)
				: channels === 2
					? this.texture(gl, w, h, gl.RG32F, gl.RG, gl.FLOAT)
					: this.texture(gl, w, h, gl.RGBA32F, gl.RGBA, gl.FLOAT)
			: (() => {
					const f = channels === 1 ? ext.formatR : channels === 2 ? ext.formatRG : ext.formatRGBA;
					return this.texture(gl, w, h, f.internalFormat, f.format, ext.halfFloatTexType);
				})();
		this.clear(gl, t);
		return t;
	}

	private clear(gl: WebGL2RenderingContext, t: Target, value = 0): void {
		this.bindTargets(gl, [t]);
		gl.clearColor(value, value, value, value);
		gl.clear(gl.COLOR_BUFFER_BIT);
	}

	private bindTargets(gl: WebGL2RenderingContext, targets: Target[]): void {
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
		for (let i = 0; i < 3; i++)
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, targets[i]?.tex ?? null, 0);
		gl.drawBuffers([0, 1, 2].map((i) => (i < targets.length ? gl.COLOR_ATTACHMENT0 + i : gl.NONE)));
		gl.viewport(0, 0, targets[0].w, targets[0].h);
	}

	/** (Re)allocate for the current CSS size, resampling the old painting into it. */
	private allocate(gl: WebGL2RenderingContext, prev: { w: number; h: number }): void {
		const maxTex = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096;
		const px = canvasPixelSize(this.cssW, this.cssH, this.dpr, null);
		const size = fitDrawingBufferSize(px.width, px.height, maxTex, maxTex);
		if (this.canvas.width !== size.width) this.canvas.width = size.width;
		if (this.canvas.height !== size.height) this.canvas.height = size.height;

		const cell = Math.max(CELL_CSS, Math.max(this.cssW, this.cssH) / MAX_SIM_CELLS);
		const simW = Math.max(8, Math.round(this.cssW / cell));
		const simH = Math.max(8, Math.round(this.cssH / cell));
		const old = this.fields;
		if (!old || old.simW !== simW || old.simH !== simH || old.cell !== cell) {
			const next: Fields = {
				simW,
				simH,
				cell,
				vel: [this.field(gl, simW, simH, 2), this.field(gl, simW, simH, 2)],
				water: [this.field(gl, simW, simH, 1), this.field(gl, simW, simH, 1)],
				susp: [this.field(gl, simW, simH, 4), this.field(gl, simW, simH, 4)],
				dep: [this.field(gl, simW, simH, 4), this.field(gl, simW, simH, 4)],
				pressure: [this.field(gl, simW, simH, 1), this.field(gl, simW, simH, 1)],
				div: this.field(gl, simW, simH, 1),
				curl: this.field(gl, simW, simH, 1),
				paper: this.texture(gl, simW, simH, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE)
			};
			if (old && prev.w > 0 && prev.h > 0) {
				// Top-left anchored in CSS space, like the DOM it sits under.
				const sx = this.cssW / prev.w;
				const sy = this.cssH / prev.h;
				const resample = (from: Target, to: Target) =>
					this.pass(gl, 'pigment-resample', S.RESAMPLE, [to], { uSrc: from.tex, uScale: ['2f', [sx, sy]], uOffset: ['2f', [0, 1 - sy]] });
				resample(old.vel[0], next.vel[0]);
				resample(old.water[0], next.water[0]);
				resample(old.susp[0], next.susp[0]);
				resample(old.dep[0], next.dep[0]);
			}
			if (old) this.freeFields(gl, old);
			this.fields = next;
			this.drawPaperSim(gl);
		}
		if (!this.paperHi || this.paperHi.w !== size.width || this.paperHi.h !== size.height) {
			if (this.paperHi) gl.deleteTexture(this.paperHi.tex);
			this.paperHi = null;
			this.paperHi = this.texture(gl, size.width, size.height, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
			this.drawPaperHi(gl);
		}
		this.buildResist(gl);
	}

	private drawPaper(gl: WebGL2RenderingContext): void {
		this.drawPaperSim(gl);
		this.drawPaperHi(gl);
	}

	private drawPaperSim(gl: WebGL2RenderingContext): void {
		const f = this.fields!;
		this.pass(gl, 'pigment-paper', S.PAPER, [f.paper], {
			cssPerTexel: ['2f', [this.cssW / f.simW, this.cssH / f.simH]],
			cssHeight: this.cssH,
			seed: this.paperSeed()
		});
	}

	private drawPaperHi(gl: WebGL2RenderingContext): void {
		const t = this.paperHi!;
		this.pass(gl, 'pigment-paper', S.PAPER, [t], {
			cssPerTexel: ['2f', [this.cssW / t.w, this.cssH / t.h]],
			cssHeight: this.cssH,
			seed: this.paperSeed()
		});
	}

	/** Paper noise offset from the seed; small so float precision holds. */
	private paperSeed(): number {
		return (this.opts.seed % 997) * 0.731;
	}

	/** Rasterise the resist rects and turn them into a signed distance field. */
	private buildResist(gl: WebGL2RenderingContext): void {
		const ext = this.host!.ext;
		if (!this.resistRects.length) {
			if (this.resist && !this.resistFbo) return;
			this.freeResist(gl);
			// 1x1 "far outside" SDF: one shader graph with or without resists.
			this.resist = this.texture(gl, 1, 1, ext.formatR.internalFormat, ext.formatR.format, ext.halfFloatTexType);
			this.clear(gl, this.resist, 1e4);
			this.maskCss = 1;
			return;
		}
		this.maskCss = Math.max(1, Math.max(this.cssW, this.cssH) / MAX_MASK);
		const w = Math.max(1, Math.round(this.cssW / this.maskCss));
		const h = Math.max(1, Math.round(this.cssH / this.maskCss));
		const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
		const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
		if (!ctx) throw new Error('svelte-fluid: no 2D context for the resist mask');
		ctx.fillStyle = '#fff';
		const k = 1 / this.maskCss;
		// The element's own outline, antialiased: the SDF puts the 0.5 crossing
		// on it to a fraction of a mask texel.
		ctx.beginPath();
		for (const r of this.resistRects) {
			const radii = r.radii?.map((c) => ({ x: Math.max(0, c.x * k), y: Math.max(0, c.y * k) }));
			if (radii?.some((c) => c.x > 0 && c.y > 0)) ctx.roundRect(r.x * k, r.y * k, r.w * k, r.h * k, radii);
			else ctx.rect(r.x * k, r.y * k, r.w * k, r.h * k);
		}
		ctx.fill();
		const coverage = gl.createTexture();
		if (!coverage) throw new Error('svelte-fluid: gl.createTexture returned null');
		try {
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, coverage);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			// Canvas rows run top-down; texture v runs bottom-up.
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
			const reuse = this.resistFbo && this.resistFbo.width === w && this.resistFbo.height === h ? this.resistFbo : null;
			if (!reuse) this.freeResist(gl);
			else this.resist = null;
			this.resistFbo = this.jfa!.build(coverage, w, h, reuse);
			this.resist = { tex: this.resistFbo.texture, w, h };
		} finally {
			gl.deleteTexture(coverage);
		}
	}

	private freeResist(gl: WebGL2RenderingContext): void {
		if (this.resistFbo) {
			gl.deleteFramebuffer(this.resistFbo.fbo);
			gl.deleteTexture(this.resistFbo.texture);
		} else if (this.resist) gl.deleteTexture(this.resist.tex);
		this.resistFbo = null;
		this.resist = null;
	}

	private freeFields(gl: WebGL2RenderingContext, f: Fields): void {
		for (const t of [...f.vel, ...f.water, ...f.susp, ...f.dep, ...f.pressure, f.div, f.curl, f.paper]) gl.deleteTexture(t.tex);
	}

	private freeGl(gl: WebGL2RenderingContext): void {
		if (this.fields) this.freeFields(gl, this.fields);
		if (this.paperHi) gl.deleteTexture(this.paperHi.tex);
		this.freeResist(gl);
		this.jfa?.dispose();
		gl.deleteFramebuffer(this.fbo);
		this.paperHi = null;
		this.jfa = null;
		this.fbo = null;
	}

	/* ------------------------------------------------------------- look */

	private packLook(): void {
		const pig = this.opts.pigments.slice(0, 4);
		while (pig.length < 4) pig.push(pig[0]);
		const pigments = pig.map((t) => pigmentFromToken(t, WATERCOLOUR_S, 1));
		// Unused channels never receive pigment; zero their absorbance anyway.
		const packed = packPigments(pigments.map((p, i) => (i < this.opts.pigments.length ? p : { K: p.K.map(() => 0), S: 0 })));
		const paperR = tokenReflectance(this.opts.paper);
		const paperLin = hexToLinear(this.opts.paper);
		const km = bandsToLinear(paperR);
		this.uniforms = {
			uK: ['4f', packed.K],
			uS: ['4f', packed.S],
			uGran: ['4f', GRAN],
			uPaperR: ['4f', new Float32Array(paperR)],
			uCmf: ['4f', new Float32Array(BAND_CMF.flat())],
			uXyzToRgb: ['m3', new Float32Array(XYZ_TO_LINEAR_SRGB.flat())],
			// Bare paper shows the exact token, not its K–M round trip.
			uWhite: ['3f', new Float32Array(paperLin.map((v, i) => (km[i] > 1e-4 ? v / km[i] : 1)))]
		};
	}

	/* ------------------------------------------------------------ passes */

	/** One fullscreen pass. Binds every texture and uniform it reads (ADR-0088). */
	private pass(gl: WebGL2RenderingContext, name: string, fragment: string, out: Target[] | null, inputs: Record<string, Uniform>): void {
		const host = this.host!;
		const p = host.program(name, S.VERT, fragment);
		p.bind();
		const loc = (k: string) => (k in p.uniforms ? p.uniforms[k] : (p.uniforms[`${k}[0]`] ?? null));
		const ref = out?.[0] ?? { w: this.fields?.simW ?? 1, h: this.fields?.simH ?? 1 };
		const texel = loc('texel');
		if (texel) gl.uniform2f(texel, 1 / ref.w, 1 / ref.h);
		let unit = 0;
		for (const [k, v] of Object.entries(inputs)) {
			const l = loc(k);
			if (l === null) continue;
			if (typeof v === 'number') gl.uniform1f(l, v);
			else if (Array.isArray(v)) {
				const [kind, data] = v;
				if (kind === '1i') gl.uniform1i(l, data[0]);
				else if (kind === '2f') gl.uniform2fv(l, data);
				else if (kind === '3f') gl.uniform3fv(l, data);
				else if (kind === '4f') gl.uniform4fv(l, data);
				else gl.uniformMatrix3fv(l, true, data);
			} else {
				gl.activeTexture(gl.TEXTURE0 + unit);
				gl.bindTexture(gl.TEXTURE_2D, v);
				gl.uniform1i(l, unit++);
			}
		}
		if (out) {
			this.bindTargets(gl, out);
			host.blit({ fbo: this.fbo, width: ref.w, height: ref.h } as FBO);
		} else {
			host.blit(null);
		}
	}

	private resistInputs(cssPerTexel: number): Record<string, Uniform> {
		return {
			uResist: this.resist!.tex,
			uResistScale: this.maskCss / cssPerTexel
		};
	}

	private landDabs(gl: WebGL2RenderingContext, f: Fields, dabs: Dab[]): void {
		const k = 1 / f.cell;
		for (let i = 0; i < dabs.length; i += DABS_PER_PASS) {
			const batch = dabs.slice(i, i + DABS_PER_PASS);
			const A = new Float32Array(4 * S.MAX_SPLATS);
			const B = new Float32Array(4 * S.MAX_SPLATS);
			const C = new Float32Array(4 * S.MAX_SPLATS);
			batch.forEach((s, j) => {
				A.set([s.x / this.cssW, 1 - s.y / this.cssH, s.r / this.cssH, s.water], j * 4);
				B.set(s.pigment, j * 4);
				C.set([(s.vx ?? 0) * k, -(s.vy ?? 0) * k, s.hard ?? 0.2, 0], j * 4);
			});
			this.pass(gl, 'pigment-splat', S.SPLAT, [f.vel[1], f.water[1], f.susp[1]], {
				uVel: f.vel[0].tex,
				uWater: f.water[0].tex,
				uSusp: f.susp[0].tex,
				uPaper: f.paper.tex,
				...this.resistInputs(f.cell),
				uA: ['4f', A],
				uB: ['4f', B],
				uC: ['4f', C],
				uCount: ['1i', [batch.length]],
				uAspect: this.cssW / this.cssH
			});
			swap(f.vel);
			swap(f.water);
			swap(f.susp);
		}
	}

	private step(gl: WebGL2RenderingContext): void {
		const f = this.fields!;
		this.landOpening();
		// Restore replays the log before any new input lands, oldest first.
		const replayed = this.replay.shift();
		if (replayed) {
			this.landDabs(gl, f, replayed);
			for (const d of replayed) this.queue.wetSteps = Math.max(this.queue.wetSteps, wetStepsFor(d));
		}
		const due = this.replay.length ? [] : this.queue.take();
		if (due.length) {
			this.landDabs(gl, f, due);
			this.log.record(due);
		}
		const resist = this.resistInputs(f.cell);
		this.pass(gl, 'pigment-advect', S.ADVECT_VEL, [f.vel[1]], { uVel: f.vel[0].tex, uWater: f.water[0].tex, ...resist, uDamp: 0.94 });
		swap(f.vel);
		this.pass(gl, 'pigment-curl', S.CURL, [f.curl], { uVel: f.vel[0].tex });
		this.pass(gl, 'pigment-vorticity', S.VORTICITY, [f.vel[1]], { uVel: f.vel[0].tex, uCurl: f.curl.tex, uStrength: 0.12 });
		swap(f.vel);
		this.pass(gl, 'pigment-divergence', S.DIVERGENCE, [f.div], { uVel: f.vel[0].tex });
		this.pass(gl, 'pigment-scale', S.SCALE, [f.pressure[1]], { uSrc: f.pressure[0].tex, uScale: 0.8 });
		swap(f.pressure);
		for (let i = 0; i < JACOBI; i++) {
			this.pass(gl, 'pigment-jacobi', S.JACOBI, [f.pressure[1]], { uP: f.pressure[0].tex, uDiv: f.div.tex });
			swap(f.pressure);
		}
		this.pass(gl, 'pigment-gradient', S.GRADIENT, [f.vel[1]], { uP: f.pressure[0].tex, uVel: f.vel[0].tex, uWater: f.water[0].tex, uEta: 0.35 });
		swap(f.vel);
		this.pass(gl, 'pigment-transport', S.TRANSPORT, [f.water[1], f.susp[1], f.dep[1]], {
			uVel: f.vel[0].tex,
			uWater: f.water[0].tex,
			uSusp: f.susp[0].tex,
			uDep: f.dep[0].tex,
			uPaper: f.paper.tex,
			...resist,
			uDiffuse: 0.11,
			uHold: 0.01,
			uPin: 0.3,
			uEdgeEvap: 9,
			// Last wet step blots: whatever is still wet lands, so a sleeping
			// surface holds no suspended pigment or water.
			uEvap: this.queue.wetSteps === 1 && !this.replay.length ? 10 : EVAP,
			uWetDry: WET_DRY,
			uSettle: ['4f', SETTLE],
			uGran: ['4f', GRAN],
			uLift: ['4f', LIFT]
		});
		swap(f.water);
		swap(f.susp);
		swap(f.dep);
		this.queue.tick();
	}

	private display(gl: WebGL2RenderingContext): void {
		const f = this.fields!;
		this.pass(gl, 'pigment-display', S.DISPLAY, null, {
			...this.uniforms,
			uSusp: f.susp[0].tex,
			uDep: f.dep[0].tex,
			uWater: f.water[0].tex,
			uPaperHi: this.paperHi!.tex,
			...this.resistInputs(this.cssW / this.canvas.width),
			uSimTexel: ['2f', [1 / f.simW, 1 / f.simH]]
		});
	}
}

function swap(p: Pair): void {
	const t = p[0];
	p[0] = p[1];
	p[1] = t;
}
