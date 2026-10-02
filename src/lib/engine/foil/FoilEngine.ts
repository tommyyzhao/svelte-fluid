/*
 * Snap-foil switch renderer (ADR-0096). A sibling model engine on the shared
 * gl-host (ADR-0088): it owns one dither texture and a two-float ODE state; the
 * fragment pass is analytic. Frames run only while the foil moves; at rest or
 * offscreen nothing is subscribed or submitted. Never root-exported.
 */
import { createDitheringTexture } from '../dithering.js';
import type { DitheringTexture } from '../dithering.js';
import { subscribeFrame } from '../frame-scheduler.js';
import { acquireGlHost, releaseGlHost } from '../gl-host.js';
import type { GlHost, GlHostInstance } from '../gl-host.js';
import { notifyHost } from '../notify-host.js';
import { canvasPixelSize } from '../resolution.js';
import type { RGB } from '../types.js';
import { FOIL_LOOKS, METAL_KNEE, hexToRgb, metalBand } from './look.js';
import { advanceCommittedFoil, foilSettled, foilTarget, hoverLoad } from './model.js';
import type { FoilState } from './model.js';
import { FOIL_FS, FOIL_VS } from './shaders.js';

export interface FoilConfig {
	checked?: boolean;
	/** Mouse/pen hover, canvas-relative 0–1 (x right, y down); null = none. */
	hover?: { x: number; y: number } | null;
	/** Snap to the final well; hover ignored; no frames once drawn. */
	reducedMotion?: boolean;
	/** Page colour behind the foil (0–255): sets the metal contrast budget. */
	page?: RGB;
}

export interface FoilEngineOptions {
	canvas: HTMLCanvasElement;
	config?: FoilConfig;
	/** The shared frame scheduler evicted this instance; it will not render again. */
	onFrameError?: (error: unknown) => void;
	onContextLost?: () => void;
	onContextRestored?: () => void;
}

type Resolved = Required<FoilConfig>;

/** R&D layout: the model spans 2.8 × 1.5 units at the canvas's aspect. */
const MODEL_ASPECT = 2.8 / 1.5;

export const FOIL_DEFAULTS: Readonly<Resolved> = { checked: false, hover: null, reducedMotion: false, page: hexToRgb(FOIL_LOOKS.light.page) };

/** Apply `patch` over `prev`; an `undefined` field means "not supplied" and keeps `prev`. */
export function resolveFoilConfig(prev: Readonly<Resolved>, patch: FoilConfig): Resolved {
	const next = { ...prev };
	for (const key of Object.keys(patch) as (keyof FoilConfig)[]) {
		if (patch[key] !== undefined) (next as Record<string, unknown>)[key] = patch[key];
	}
	return next;
}

export class FoilEngine implements GlHostInstance {
	readonly canvas: HTMLCanvasElement;
	private host: GlHost | null;
	private config: Resolved;
	private state: FoilState;
	private actuated = false;
	private dither: DitheringTexture | null = null;
	private unsubscribe: (() => void) | null = null;
	private dirty = true;
	private visible = true;
	private lost = false;
	private failed = false;
	private disposed = false;
	private last = 0;
	private frames = 0;
	private cssWidth = 1;
	private cssHeight = 1;

	constructor(private options: FoilEngineOptions) {
		this.canvas = options.canvas;
		this.config = resolveFoilConfig(FOIL_DEFAULTS, options.config ?? {});
		// The opening state is placed, not snapped in.
		this.state = { amplitude: foilTarget(this.config.checked), velocity: 0 };
		this.host = acquireGlHost(this);
		try {
			this.build();
		} catch (error) {
			this.dispose();
			throw error;
		}
	}

	/** Current arch amplitude: +1 arched (off), −1 bowed (on). */
	get amplitude(): number {
		return this.state.amplitude;
	}

	/** True while subscribed to the shared frame scheduler. */
	get running(): boolean {
		return this.unsubscribe !== null;
	}

	/** Frames rendered so far (test observability). */
	get frameCount(): number {
		return this.frames;
	}

	/** Apply supplied fields; `undefined` keeps the previous value. */
	setConfig(patch: FoilConfig): void {
		const prev = this.config;
		const next = resolveFoilConfig(prev, patch);
		const same = (a: object | null, b: object | null) => JSON.stringify(a) === JSON.stringify(b);
		// Effects re-send unchanged props; only a real change may cost a frame.
		if (next.checked === prev.checked && next.reducedMotion === prev.reducedMotion && same(next.hover, prev.hover) && same(next.page, prev.page)) return;
		this.config = next;
		if (next.checked !== prev.checked || (next.reducedMotion && !prev.reducedMotion)) {
			const target = foilTarget(next.checked);
			// Hidden or reduced: no one can see the snap, so land in the well.
			const unseen = next.reducedMotion || !this.visible || (typeof document !== 'undefined' && document.hidden);
			if (unseen) this.state = { amplitude: target, velocity: 0 };
			// Retargeting keeps position and momentum (the R&D contract).
			this.actuated = !unseen;
		}
		this.invalidate();
	}

	/** Size the canvas: CSS px and device pixel ratio (native, ADR-0089). */
	resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
		if (!(cssWidth > 0 && cssHeight > 0)) return;
		const { width, height } = canvasPixelSize(cssWidth, cssHeight, devicePixelRatio);
		if (width === this.canvas.width && height === this.canvas.height && cssWidth === this.cssWidth && cssHeight === this.cssHeight) return;
		this.canvas.width = width;
		this.canvas.height = height;
		this.cssWidth = cssWidth;
		this.cssHeight = cssHeight;
		this.invalidate();
	}

	/** Offscreen instances schedule nothing; a snap missed offscreen lands in its well. */
	setVisible(visible: boolean): void {
		if (visible === this.visible) return;
		this.visible = visible;
		if (!visible && this.actuated) {
			this.state = { amplitude: foilTarget(this.config.checked), velocity: 0 };
			this.actuated = false;
			this.dirty = true;
		}
		this.schedule();
	}

	/** Draw the current state now; resolves once it is on the visible canvas. */
	show(): Promise<void> {
		this.tick(0);
		return this.host && !this.lost ? this.host.present(this) : Promise.resolve();
	}

	/** @internal Test hook: run `frames` fixed 1/60 s frames now and present the last. */
	advance(frames = 1): Promise<void> {
		for (let i = 0; i < frames; i++) this.tick(1 / 60);
		return this.host && !this.lost ? this.host.present(this) : Promise.resolve();
	}

	/** @internal Bench hook: `frames` busy frames (mid-snap, hovered) without presenting. */
	busyFrames(frames: number): void {
		for (let i = 0; i < frames; i++) {
			this.state = { amplitude: Math.sin(i * 0.37) * 0.9, velocity: 1 };
			this.config.hover = { x: (i % 7) / 7, y: 0.5 };
			this.tick(0);
		}
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.stop();
		const gl = this.host?.gl;
		if (gl && this.dither && !this.lost && !gl.isContextLost()) gl.deleteTexture(this.dither.texture);
		this.dither?.dispose();
		this.dither = null;
		releaseGlHost(this);
		this.host = null;
	}

	onContextLost(): void {
		this.lost = true;
		this.stop();
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
		if (!this.host) return;
		this.dither = createDitheringTexture(this.host.gl, () => this.invalidate());
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

	private load(): number {
		return this.config.reducedMotion ? 0 : hoverLoad(this.config.hover);
	}

	private animating(): boolean {
		return !this.config.reducedMotion && !foilSettled(this.state, this.actuated, this.load());
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
		this.tick(dt);
		if (this.host && !this.lost) void this.host.present(this);
		this.schedule();
	};

	private tick(dt: number): void {
		const host = this.host;
		if (!host || this.lost || this.failed || !this.dither) return;
		if (!this.config.reducedMotion && dt > 0) {
			this.actuated = advanceCommittedFoil(this.state, dt, foilTarget(this.config.checked), this.actuated, this.load());
		}
		const hover = this.config.reducedMotion ? null : this.config.hover;
		const band = metalBand(this.config.page);
		const aspect = this.canvas.width / this.canvas.height / MODEL_ASPECT;
		host.run(this, (gl) => {
			const p = host.program('foil', FOIL_VS, FOIL_FS);
			p.bind();
			const u = p.uniforms;
			gl.uniform2f(u.uDisplay, Math.max(1, aspect), Math.max(1, 1 / aspect));
			gl.uniform4f(u.uState, this.state.amplitude, hover?.y ?? 0.5, hover?.x ?? 0.5, hover ? 1 : 0);
			gl.uniform2f(u.uMetalBand, band.dir, band.bound);
			gl.uniform1f(u.uKnee, METAL_KNEE);
			gl.uniform1i(u.uDither, this.dither!.attach(0));
			// The quad writes every pixel (transparent outside the foil): no clear.
			host.blit(null);
		});
		this.dirty = false;
		this.frames++;
	}
}
