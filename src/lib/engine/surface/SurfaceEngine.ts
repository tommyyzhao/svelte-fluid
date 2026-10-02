/*
 * Height-field liquid surface for small controls (ADR-0091). A sibling of
 * FluidEngine on the shared gl-host (ADR-0088): it owns only its height field,
 * the control SDF and a dither texture. All geometry crosses this boundary in
 * DOM CSS px (x right, y down, origin at the canvas's top-left) and is flipped
 * once to GL's y-up here. Never root-exported: GL types stay internal.
 */
import { createDitheringTexture } from '../dithering.js';
import type { DitheringTexture } from '../dithering.js';
import { subscribeFrame } from '../frame-scheduler.js';
import { createFBO, disposeFBO } from '../gl-utils.js';
import { acquireGlHost, releaseGlHost } from '../gl-host.js';
import type { GlHost, GlHostInstance } from '../gl-host.js';
import { JumpFlood } from '../jump-flood.js';
import { notifyHost } from '../notify-host.js';
import { canvasPixelSize } from '../resolution.js';
import { mulberry32 } from '../rng.js';
import type { Rng } from '../rng.js';
import { baseVertexShader } from '../shaders.js';
import type { FBO } from '../types.js';
import { CAUSTICS, hexToLinear, hexToSrgb, labelBand, lookFor } from './look.js';
import type { SurfaceControl, SurfaceTone } from './look.js';
import { SURFACE_COMPOSITE_FS, SURFACE_CURVATURE_FS, SURFACE_MASK_FS, SURFACE_RESAMPLE_FS, SURFACE_STEP_FS, SURFACE_VS } from './shaders.js';
import {
	CLIMB,
	MAX_IMPULSES_PER_STEP,
	REFRACT_GAIN,
	REFRACTION_CAP_CSS,
	WAVE,
	assignDefined,
	climbSpread,
	dampingFor,
	dragProximity,
	enqueueImpulse,
	roundRectDistance,
	substepsPerFrame,
	surfaceGrid
} from './wave.js';
import type { Impulse } from './wave.js';

/** DOM CSS px rectangle relative to the canvas's top-left. */
export interface SurfaceRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface SurfaceConfig {
	control?: SurfaceControl;
	tone?: SurfaceTone;
	/** The control's own rounded rect inside the (larger, ring-bearing) canvas. */
	rect?: SurfaceRect;
	/** Corner radius, CSS px; clamped to a pill. */
	radius?: number;
	/** Rect the liquid lens gathers over (segmented selection); null = none. */
	lens?: SurfaceRect | null;
	/** DOM label boxes: the background beneath them stays inside the contrast band. */
	labels?: SurfaceRect[];
	/** Show the focus ring and the still light lift. */
	focus?: boolean;
	/** Settled stills only: no impulses, lens moves snap. */
	reducedMotion?: boolean;
	/** Drop zone: the dragged pointer (DOM CSS px, canvas-relative); null = no drag. */
	drag?: { x: number; y: number } | null;
	/** Caustics overlay: contrast-clamped peak strength 0–1 (look.ts overlayCap). */
	overlay?: number;
}

export interface SurfaceEngineOptions {
	canvas: HTMLCanvasElement;
	config?: SurfaceConfig;
	/** Seeds press-shape variation. */
	seed?: number;
	/** The shared frame scheduler evicted this instance; it will not render again. */
	onFrameError?: (error: unknown) => void;
	onContextLost?: () => void;
	onContextRestored?: () => void;
}

type Resolved = Required<Omit<SurfaceConfig, 'lens' | 'drag'>> & { lens: SurfaceRect | null; drag: { x: number; y: number } | null };

const DEFAULTS: Resolved = {
	control: 'button',
	tone: 'light',
	rect: { x: 0, y: 0, width: 1, height: 1 },
	radius: 12,
	lens: null,
	labels: [],
	focus: false,
	reducedMotion: false,
	drag: null,
	overlay: 0
};

/** Wave speed, CSS px/s. */
const SPEED = 300;
/** Amplitude e-folding time, s. */
const DECAY = 0.45;
/** Dispersive restoring length, CSS px. */
const REACH = 14;
/** Below this many CSS px of estimated amplitude the surface counts as still. */
const SETTLED_PX = 0.03;
const LENS = { inset: 5, amplitude: 1.6, falloff: 7, release: 0.2 };
const PRESS = { amplitude: 3.6, sigma: 5 };
/** Lens follows its target as a damped spring: settles in ~0.5 s. */
const SPRING = { omega: 11, zeta: 0.8 };
// rise/length (CSS px) shape the static wall meniscus; pin is the distance over
// which wave displacement fades to zero at the pinned contact line (ADR-0091).
const MENISCUS = { rise: 0.6, length: 1.6, pin: 4 };
const DEPTH = 6;
const CAUSTIC_DEPTH = 36;
const RING = { gap: 2, width: 2 };
const MAX_LABELS = 8;
/** Drop-zone climb follows its target with this time constant, s. */
const CLIMB_TAU = 0.12;
/** Overlay: light-path depth (CSS px), sun blur (CSS px), edge fade (CSS px), grid cell floor (CSS px). */
const OVERLAY = { depth: 400, blur: 0.6, fade: 28, cell: 2 };
/** Pointer and focus ripples on the overlay are gentle; a drop is a full press. */
export const OVERLAY_RIPPLE = 1.1;

function rectEqual(a: SurfaceRect | null, b: SurfaceRect | null): boolean {
	return a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);
}

export class SurfaceEngine implements GlHostInstance {
	readonly canvas: HTMLCanvasElement;
	private host: GlHost | null;
	private config: Resolved;
	private rng: Rng;
	private impulses: Impulse[] = [];
	private state: { read: FBO; write: FBO } | null = null;
	private curv: FBO | null = null;
	private mask: FBO | null = null;
	private sdf: FBO | null = null;
	private jfa: JumpFlood | null = null;
	private dither: DitheringTexture | null = null;
	private cols = 0;
	private rows = 0;
	private cell = 1;
	private cssWidth = 1;
	private cssHeight = 1;
	private sdfDirty = true;
	private stepPending = true;
	private dirty = true;
	private energy = 0;
	private accumulator = 0;
	private relaxPending = false;
	private last = 0;
	private lensAt: { x: number; vx: number } | null = null;
	private lensDrawn: [number, number, number, number] = [0, 0, 0, 0];
	private unsubscribe: (() => void) | null = null;
	private visible = true;
	private lost = false;
	private failed = false;
	private disposed = false;
	private frames = 0;
	/** Eased drop-zone climb strength and the pointer it leans toward (GL CSS px). */
	private climb = { at: 0, x: 0, y: 0 };
	/**
	 * Caustics overlay: the field is flat and the canvas blank. A flat overlay draws
	 * nothing, so nothing is rendered or scheduled until the next ripple. False until
	 * the first frame has cleared the canvas.
	 */
	private quiet = false;
	/** The smoothed curvature no longer matches the field. */
	private curvStale = true;

	constructor(private options: SurfaceEngineOptions) {
		this.canvas = options.canvas;
		this.config = assignDefined({ ...DEFAULTS }, options.config ?? {});
		this.rng = mulberry32(options.seed ?? 1);
		// The opening lens is placed, not sloshed in.
		this.retargetLens(this.config.lens, true);
		this.host = acquireGlHost(this);
		try {
			this.build();
		} catch (error) {
			this.dispose();
			throw error;
		}
	}

	/** Frames rendered so far (test observability). */
	get frameCount(): number {
		return this.frames;
	}

	/** True while subscribed to the shared frame scheduler. */
	get running(): boolean {
		return this.unsubscribe !== null;
	}

	/** Apply supplied fields; `undefined` keeps the previous value. */
	setConfig(patch: SurfaceConfig): void {
		const prev = this.config;
		const next = assignDefined({ ...prev }, patch);
		if (!rectEqual(next.rect, prev.rect) || next.radius !== prev.radius) this.sdfDirty = true;
		if (!rectEqual(next.lens, prev.lens)) this.retargetLens(next.lens, next.reducedMotion);
		if (next.reducedMotion && !prev.reducedMotion) {
			this.impulses.length = 0;
			this.energy = 0;
			if (this.lensAt) this.lensAt.vx = 0;
			this.stepPending = true;
		}
		this.config = next;
		if (next.reducedMotion) this.climb.at = this.climbTarget();
		this.invalidate();
	}

	/** Size the canvas: CSS px and device pixel ratio (native by default, ADR-0089). */
	resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
		if (!(cssWidth > 0 && cssHeight > 0)) return;
		const { width, height } = canvasPixelSize(cssWidth, cssHeight, devicePixelRatio);
		const same = width === this.canvas.width && height === this.canvas.height && cssWidth === this.cssWidth && cssHeight === this.cssHeight;
		if (same) return;
		this.canvas.width = width;
		this.canvas.height = height;
		this.cssWidth = cssWidth;
		this.cssHeight = cssHeight;
		this.sdfDirty = true;
		this.invalidate();
	}

	/** Press impulse at DOM CSS px (x, y); `strength` 0.5–1.5 scales it (pen pressure). */
	press(x: number, y: number, strength = 1): void {
		if (this.config.reducedMotion || this.failed || this.disposed) return;
		const s = Number.isFinite(strength) ? Math.min(1.5, Math.max(0.25, strength)) : 1;
		const jitter = 0.85 + 0.3 * this.rng();
		const queued = enqueueImpulse(this.impulses, {
			x,
			y: this.cssHeight - y,
			amplitude: PRESS.amplitude * s * jitter,
			sigma: Math.max(PRESS.sigma * (0.9 + 0.2 * this.rng()), 2 * this.cell)
		});
		if (!queued) return;
		this.quiet = false;
		this.energy += PRESS.amplitude * s;
		this.invalidate();
	}

	/** Make the IntersectionObserver result count: offscreen instances schedule nothing. */
	setVisible(visible: boolean): void {
		this.visible = visible;
		this.schedule();
	}

	/**
	 * @internal Test/bench hook: run `frames` fixed 1/60 s frames now and present
	 * the last. Resolves once the frame is on the visible canvas.
	 */
	advance(frames = 1): Promise<void> {
		let drawn = false;
		for (let i = 0; i < frames; i++) drawn = this.tick(1 / 60) || drawn;
		return drawn && this.host && !this.lost ? this.host.present(this) : Promise.resolve();
	}

	/** @internal Bench hook: draw `frames` busy frames (with impulses) without presenting. */
	busyFrames(frames: number): void {
		for (let i = 0; i < frames; i++) {
			this.impulses.push({ x: this.cssWidth * this.rng(), y: this.cssHeight * this.rng(), amplitude: 0.2, sigma: 4 });
			this.energy = 1;
			this.quiet = false;
			this.tick(1 / 60);
		}
	}

	/**
	 * @internal Test hook: the composite's reconstructed field per device px
	 * (h, ∂h/∂x, ∂h/∂y, ∇²h; CSS px units, rows bottom-up), rendered with
	 * `probe` = 'bspline' (shipped) or 'bilinear' (the prototype's normal path).
	 * 'surface' adds the analytic meniscus and drop-zone climb (alpha unused).
	 */
	readSlope(probe: 'bspline' | 'bilinear' | 'surface' = 'bspline'): { width: number; height: number; data: Float32Array } {
		const w = this.canvas.width;
		const h = this.canvas.height;
		const data = new Float32Array(w * h * 4);
		this.host?.run(this, (gl) => {
			const out = createFBO(gl, w, h, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
			try {
				this.composite(gl, out, probe === 'surface' ? ['HEIGHT_PROBE'] : probe === 'bspline' ? ['SLOPE_PROBE'] : ['SLOPE_PROBE', 'BILINEAR_PROBE']);
				gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo);
				gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, data);
			} finally {
				disposeFBO(gl, out);
			}
		});
		return { width: w, height: h, data };
	}

	/** @internal Test hook: displayed height field (CSS px, rows bottom-up). */
	readHeight(): { cols: number; rows: number; cell: number; data: Float32Array } {
		const data = new Float32Array(this.cols * this.rows * 4);
		this.host?.run(this, (gl) => {
			if (!this.state) return;
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.state.read.fbo);
			gl.readPixels(0, 0, this.cols, this.rows, gl.RGBA, gl.FLOAT, data);
		});
		const height = new Float32Array(this.cols * this.rows);
		for (let i = 0; i < height.length; i++) height[i] = data[i * 4 + 2];
		return { cols: this.cols, rows: this.rows, cell: this.cell, data: height };
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.stop();
		this.freeResources();
		this.dither?.dispose();
		releaseGlHost(this);
		this.host = null;
	}

	onContextLost(): void {
		this.lost = true;
		this.stop();
		// Every handle is dead with the context; drop them without deleting.
		this.state = null;
		this.curv = null;
		this.mask = null;
		this.sdf = null;
		this.jfa = null;
		this.dither?.dispose();
		this.dither = null;
		notifyHost(this.options.onContextLost, 'onContextLost');
	}

	onContextRestored(): void {
		this.lost = false;
		try {
			this.build();
		} catch (error) {
			this.fail(error);
			return;
		}
		notifyHost(this.options.onContextRestored, 'onContextRestored');
		this.invalidate();
	}

	private build(): void {
		const host = this.host;
		if (!host) return;
		this.dither = createDitheringTexture(host.gl, () => this.invalidate());
		this.jfa = new JumpFlood(host.gl, host.ext, (name, fragment) => host.program(name, baseVertexShader, fragment), host.blit.bind(host));
		this.cols = 0;
		this.sdfDirty = true;
		this.stepPending = true;
	}

	private freeResources(): void {
		const gl = this.host?.gl;
		if (!gl || this.lost || gl.isContextLost()) return;
		disposeFBO(gl, this.state?.read);
		disposeFBO(gl, this.state?.write);
		disposeFBO(gl, this.curv ?? undefined);
		disposeFBO(gl, this.mask ?? undefined);
		disposeFBO(gl, this.sdf ?? undefined);
		this.jfa?.dispose();
		this.dither?.dispose();
		if (this.dither) gl.deleteTexture(this.dither.texture);
		this.state = this.curv = this.mask = this.sdf = this.jfa = this.dither = null;
	}

	private fail(error: unknown): void {
		if (this.failed) return;
		this.failed = true;
		this.stop();
		notifyHost(this.options.onFrameError, 'onFrameError', error);
	}

	private invalidate(): void {
		this.dirty = true;
		this.schedule();
	}

	private animating(): boolean {
		return this.energy > SETTLED_PX || this.impulses.length > 0 || this.lensMoving() || this.climbMoving();
	}

	/** Proximity 0–1 of the dragged pointer to the zone (1 on or inside it). */
	private climbTarget(): number {
		const { drag, rect, radius } = this.config;
		if (!drag || this.config.control !== 'dropzone') return 0;
		return dragProximity(roundRectDistance(drag.x, drag.y, rect, radius));
	}

	private climbMoving(): boolean {
		return Math.abs(this.climb.at - this.climbTarget()) > 0.002;
	}

	private lensMoving(): boolean {
		const lens = this.config.lens;
		if (!lens || !this.lensAt) return false;
		const target = lens.x + lens.width / 2;
		return Math.abs(this.lensAt.x - target) > 0.05 || Math.abs(this.lensAt.vx) > 0.05;
	}

	private schedule(): void {
		const active = !this.disposed && !this.lost && !this.failed && this.visible && (this.dirty || this.animating());
		if (active && !this.unsubscribe) {
			this.last = 0;
			this.unsubscribe = subscribeFrame(this.onFrame, (error) => this.fail(error));
		} else if (!active) this.stop();
	}

	private stop(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
	}

	private onFrame = (now: number): void => {
		const dt = this.last ? Math.min((now - this.last) / 1000, 1 / 20) : 1 / 60;
		this.last = now;
		if (this.tick(dt) && this.host && !this.lost) void this.host.present(this);
		this.schedule();
	};

	private retargetLens(lens: SurfaceRect | null, reduced: boolean): void {
		if (!lens) {
			this.lensAt = null;
		} else {
			const target = lens.x + lens.width / 2;
			// Layout jitter (font load, sub-px resize) re-places the lens; only a real move sloshes.
			if (!this.lensAt || reduced || Math.abs(this.lensAt.x - target) < 2) this.lensAt = { x: target, vx: 0 };
			else this.energy += 0.4;
		}
		this.stepPending = true;
	}

	/** One frame: lens spring, fixed 60 Hz physics, optics. Returns whether it drew. */
	private tick(dt: number, render = true): boolean {
		const host = this.host;
		if (!host || this.lost || this.failed) return false;
		if (this.config.control === 'overlay' && this.quiet) {
			// Flat field, blank canvas (the settle frame cleared it): no GL work at all.
			this.dirty = false;
			return false;
		}
		let substeps = 0;
		const n = substepsPerFrame(SPEED, this.cell);
		if (!this.config.reducedMotion) {
			this.accumulator = Math.min(this.accumulator + dt, 3 / 60);
			while (this.accumulator >= 1 / 60 - 1e-6) {
				this.accumulator -= 1 / 60;
				substeps += n;
				this.springLens(1 / 60);
			}
			const was = this.energy;
			this.energy *= Math.exp(-substeps / n / 60 / DECAY);
			if (this.energy <= SETTLED_PX) {
				this.energy = 0;
				// The estimate just crossed the floor: the last frame must be the clean
				// still, not a residual ripple frozen mid-wave until the next input.
				if (was > 0 && !this.lensMoving()) this.relaxPending = true;
			}
		}
		this.easeClimb(dt);
		// No field dynamics left (the settle frame already wrote the equilibrium): the
		// climb is analytic in the composite, so skip the step.
		if (this.energy === 0 && !this.impulses.length && !this.lensMoving()) substeps = 0;
		if (this.stepPending || this.impulses.length) substeps = Math.max(substeps, 1);
		const still = this.config.reducedMotion || this.relaxPending;
		if (still) substeps = Math.max(substeps, 1);
		this.relaxPending = false;
		host.run(this, (gl) => {
			this.ensureResources(gl);
			if (substeps) this.simulate(gl, substeps, still);
			if (render) this.composite(gl);
		});
		this.stepPending = false;
		this.dirty = false;
		this.frames++;
		// The settle frame (or the first) has drawn the flat field: blank from here on.
		if (this.config.control === 'overlay' && this.energy === 0 && !this.impulses.length) this.quiet = true;
		return true;
	}

	private easeClimb(dt: number): void {
		const drag = this.config.drag;
		if (drag) {
			this.climb.x = drag.x;
			this.climb.y = this.cssHeight - drag.y;
		}
		const target = this.climbTarget();
		this.climb.at = this.config.reducedMotion || !this.climbMoving() ? target : target + (this.climb.at - target) * Math.exp(-dt / CLIMB_TAU);
	}

	private springLens(dt: number): void {
		const lens = this.config.lens;
		if (!lens || !this.lensAt) return;
		const target = lens.x + lens.width / 2;
		const { omega, zeta } = SPRING;
		const a = -omega * omega * (this.lensAt.x - target) - 2 * zeta * omega * this.lensAt.vx;
		this.lensAt.vx += a * dt;
		this.lensAt.x += this.lensAt.vx * dt;
		if (!this.lensMoving()) this.lensAt = { x: target, vx: 0 };
	}

	private ensureResources(gl: WebGL2RenderingContext): void {
		const host = this.host!;
		const grid = surfaceGrid(this.cssWidth, this.cssHeight, this.config.control === 'overlay' ? OVERLAY.cell : undefined);
		if (!this.state || grid.cols !== this.cols || grid.rows !== this.rows || grid.cell !== this.cell) {
			const make = () => createFBO(gl, grid.cols, grid.rows, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
			const next = { read: make(), write: make() };
			if (this.state) {
				// Resample, never reset: a resize mid-ripple keeps the liquid where it was.
				const p = host.program('surface-resample', SURFACE_VS, SURFACE_RESAMPLE_FS);
				p.bind();
				gl.uniform1i(p.uniforms.uState, this.state.read.attach(0));
				gl.uniform1f(p.uniforms.uCell, grid.cell);
				gl.uniform1f(p.uniforms.uOldCell, this.cell);
				host.blit(next.read);
				disposeFBO(gl, this.state.read);
				disposeFBO(gl, this.state.write);
			}
			this.state = next;
			this.cols = grid.cols;
			this.rows = grid.rows;
			this.cell = grid.cell;
			disposeFBO(gl, this.curv ?? undefined);
			// Bilinear over cells: the smoothed Hessian is band-limited, so linear is exact enough.
			this.curv = createFBO(gl, grid.cols, grid.rows, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
			this.stepPending = true;
			this.curvStale = true;
		}
		if (this.sdfDirty || !this.sdf) {
			const w = this.canvas.width;
			const h = this.canvas.height;
			if (!this.mask || this.mask.width !== w || this.mask.height !== h) {
				disposeFBO(gl, this.mask ?? undefined);
				const r = host.ext.formatR;
				this.mask = createFBO(gl, w, h, r.internalFormat, r.format, host.ext.halfFloatTexType, gl.LINEAR);
			}
			const p = host.program('surface-mask', SURFACE_VS, SURFACE_MASK_FS);
			p.bind();
			const { rect } = this.config;
			const sx = this.scale();
			gl.uniform4f(
				p.uniforms.uRect,
				(rect.x + rect.width / 2) * sx,
				(this.cssHeight - rect.y - rect.height / 2) * sx,
				(rect.width / 2) * sx,
				(rect.height / 2) * sx
			);
			gl.uniform1f(p.uniforms.uRadius, Math.min(this.config.radius, rect.width / 2, rect.height / 2) * sx);
			host.blit(this.mask);
			this.sdf = this.jfa!.build(this.mask.texture, w, h, this.sdf);
			this.sdfDirty = false;
			this.stepPending = true;
		}
	}

	/** Device px per CSS px. */
	private scale(): number {
		return this.canvas.width / this.cssWidth;
	}

	private lensUniform(): [number, number, number, number] {
		const lens = this.config.lens;
		if (!lens || !this.lensAt) return [0, 0, 0, 0];
		return [this.lensAt.x, this.cssHeight - lens.y - lens.height / 2, lens.width / 2 - LENS.inset, lens.height / 2 - LENS.inset];
	}

	private simulate(gl: WebGL2RenderingContext, steps: number, still: boolean): void {
		const host = this.host!;
		const state = this.state!;
		const p = host.program('surface-step', SURFACE_VS, SURFACE_STEP_FS);
		p.bind();
		const u = p.uniforms;
		const n = substepsPerFrame(SPEED, this.cell);
		const mass = ((WAVE.courant * this.cell) / REACH) ** 2;
		gl.uniform4f(u.uCoef, WAVE.courant ** 2, dampingFor(DECAY, n), WAVE.viscosity, mass);
		gl.uniform2f(u.uCanvas, this.cssWidth, this.cssHeight);
		gl.uniform1f(u.uCell, this.cell);
		gl.uniform1f(u.uDpr, this.scale());
		gl.uniform1i(u.uSdf, this.sdf!.attach(1));
		const lens = this.lensUniform();
		const radius = Math.max(0, this.config.radius - LENS.inset);
		gl.uniform3f(u.uLensShape, radius, this.config.lens ? LENS.amplitude : 0, LENS.falloff);
		gl.uniform4fv(u.uLens, lens);
		gl.uniform1f(u.uStill, still ? 1 : 0);
		const inject = !this.config.reducedMotion && this.lensDrawn[2] > 0 && lens[2] > 0 ? LENS.release : 0;
		for (let i = 0; i < steps; i++) {
			const first = i === 0;
			gl.uniform4fv(u.uLensOld, first ? this.lensDrawn : lens);
			gl.uniform1f(u.uInject, first ? inject : 0);
			const batch = first ? this.impulses.splice(0, MAX_IMPULSES_PER_STEP) : [];
			gl.uniform1i(u.uImpulseCount, batch.length);
			if (batch.length) gl.uniform4fv(u['uImpulse[0]'], batch.flatMap((b) => [b.x, b.y, b.amplitude, b.sigma]));
			gl.uniform1i(u.uState, state.read.attach(0));
			host.blit(state.write);
			[state.read, state.write] = [state.write, state.read];
		}
		this.lensDrawn = lens;
		this.curvStale = true;
	}

	private composite(gl: WebGL2RenderingContext, target: FBO | null = null, defines?: string[]): void {
		const host = this.host!;
		const look = lookFor(this.config.control, this.config.tone);
		const overlay = this.config.control === 'overlay';
		if (this.curvStale) {
			const k = host.program('surface-curvature', SURFACE_VS, SURFACE_CURVATURE_FS);
			k.bind();
			gl.uniform1i(k.uniforms.uState, this.state!.read.attach(0));
			gl.uniform1f(k.uniforms.uCell, this.cell);
			host.blit(this.curv!);
			this.curvStale = false;
		}
		const p = host.program('surface-composite', SURFACE_VS, SURFACE_COMPOSITE_FS, defines ?? (overlay ? ['OVERLAY'] : undefined));
		p.bind();
		// Probe variants compile some uniforms away; a missing location must be null, not undefined.
		const u = new Proxy(p.uniforms, { get: (t, k: string) => t[k] ?? null });
		const { rect } = this.config;
		gl.uniform1i(u.uState, this.state!.read.attach(0));
		gl.uniform1i(u.uSdf, this.sdf!.attach(1));
		gl.uniform1i(u.uDither, this.dither!.attach(2));
		gl.uniform1i(u.uCurv, this.curv!.attach(3));
		gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
		gl.uniform1f(u.uDpr, this.scale());
		gl.uniform1f(u.uCell, this.cell);
		gl.uniform3f(u.uMeniscus, MENISCUS.rise, MENISCUS.length, MENISCUS.pin);
		gl.uniform1f(u.uDepth, DEPTH);
		gl.uniform1f(u.uCausticDepth, CAUSTIC_DEPTH);
		gl.uniform1f(u.uRefractCap, REFRACTION_CAP_CSS);
		gl.uniform1f(u.uRefractGain, REFRACT_GAIN);
		gl.uniform3fv(u.uFill, hexToLinear(look.fill));
		gl.uniform3fv(u.uFillLow, hexToLinear(look.fillLow));
		gl.uniform4f(u.uFillRect, this.cssHeight - rect.y - rect.height, this.cssHeight - rect.y, rect.x, rect.x + rect.width);
		gl.uniform3fv(u.uEnvLow, look.envLow);
		gl.uniform3fv(u.uEnvHigh, look.envHigh);
		gl.uniform3fv(u.uLights, look.lights);
		gl.uniform2f(u.uCaustic, look.caustic, this.config.tone === 'light' ? 1 : 0);
		gl.uniform3fv(u.uAbsorb, look.absorb);
		gl.uniform3fv(u.uScatter, look.scatter);
		gl.uniform1f(u.uFocus, this.config.focus ? 1 : 0);
		gl.uniform3fv(u.uRing, hexToSrgb(look.ring));
		gl.uniform2f(u.uRingBand, RING.gap, RING.width);
		const band = labelBand(look.text, look.fill);
		gl.uniform2f(u.uBand, band.lo, band.hi);
		const labels = this.config.labels.slice(0, MAX_LABELS);
		gl.uniform1i(u.uLabelCount, labels.length);
		if (labels.length) {
			gl.uniform4fv(
				u['uLabels[0]'],
				labels.flatMap((l) => [l.x, this.cssHeight - l.y - l.height, l.x + l.width, this.cssHeight - l.y])
			);
		}
		gl.uniform4f(u.uClimb, this.climb.x, this.climb.y, this.climb.at, climbSpread(rect.width, rect.height));
		gl.uniform3f(u.uClimbShape, CLIMB.rise, CLIMB.length, CLIMB.floor);
		const strength = overlay ? Math.min(1, Math.max(0, this.config.overlay)) : 0;
		gl.uniform4f(u.uOverlay, OVERLAY.depth, strength, OVERLAY.blur, OVERLAY.fade);
		gl.uniform3fv(u.uOverlayTint, CAUSTICS[this.config.tone].tint);
		host.blit(target);
	}
}
