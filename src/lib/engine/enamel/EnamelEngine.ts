/*
 * Compliant enamel over DOM text (ADR-0097). A sibling model engine on the
 * shared gl-host (ADR-0088): it owns its glyph coverage, the JFA SDF, the
 * fine and coarse rest profiles, an R32F height ping-pong and a deviation
 * texture. Geometry crosses this boundary in DOM CSS px (x right, y down from
 * the canvas's top-left) and flips to GL's y-up here. Never root-exported.
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
import { baseVertexShader } from '../shaders.js';
import type { FBO } from '../internal-types.js';
import type { RGB } from '../types.js';
import { KEY_DIRECTION, LOOKS, bodyLinear, glyphBand, minContrastFor } from './look.js';
import type { EnamelTone } from './look.js';
import { ENAMEL, enamelGrid, exchangeFraction, phaseOrder, restProfile } from './profile.js';
import type { Contact } from './profile.js';
import {
	ENAMEL_COARSE_FS,
	ENAMEL_COMPOSITE_FS,
	ENAMEL_RESET_FS,
	ENAMEL_REST_FS,
	ENAMEL_SURFACE_FS,
	ENAMEL_TRANSFER_FS,
	ENAMEL_VS
} from './shaders.js';
import { rasterizeText } from './text-source.js';
import { assignDefined } from '../surface/wave.js';
import type { EnamelRaster } from './text-source.js';

export interface EnamelConfig {
	tone?: EnamelTone;
	/** Glyph body colour, opaque sRGB 0–255. */
	body?: RGB;
	/** Page colour behind the text, opaque sRGB 0–255 (contrast reference). */
	page?: RGB;
	/** Static relief at rest: no presses, no compliance step. */
	reducedMotion?: boolean;
}

export interface EnamelEngineOptions {
	canvas: HTMLCanvasElement;
	/** Element whose single text node is the glyph source. */
	source: HTMLElement;
	config?: EnamelConfig;
	/** First frame (and first after a restore) is on screen: the DOM text may hide. */
	onPresent?: () => void;
	/** The shared frame scheduler evicted this instance; it will not render again. */
	onFrameError?: (error: unknown) => void;
	onContextLost?: () => void;
	onContextRestored?: () => void;
}

type Resolved = Required<EnamelConfig>;

const DEFAULTS: Resolved = {
	tone: 'light',
	body: { r: 26, g: 28, b: 33 },
	page: { r: 255, g: 255, b: 255 },
	reducedMotion: false
};

/** Release follows the contact this fast (s): a lifted finger eases off, it does not snap. */
const RELEASE_TAU = 0.06;

export class EnamelEngine implements GlHostInstance {
	readonly canvas: HTMLCanvasElement;
	private host: GlHost | null;
	private config: Resolved;
	private raster: EnamelRaster | null = null;
	private uploadedKey = '';
	private coverage: WebGLTexture | null = null;
	private sdf: FBO | null = null;
	private jfa: JumpFlood | null = null;
	private restFine: FBO | null = null;
	private blur: FBO | null = null;
	private cavity: FBO | null = null;
	private rest: FBO | null = null;
	private height: { read: FBO; write: FBO } | null = null;
	private surface: FBO | null = null;
	private dither: DitheringTexture | null = null;
	private cols = 0;
	private rows = 0;
	private cell = 1;
	private cssWidth = 1;
	private cssHeight = 1;
	private contact: Contact | null = null;
	/** Pointer held: the contact strength it holds at (0 = released). */
	private held = 0;
	private tail = 0;
	private accumulator = 0;
	private tick = 0;
	private settle = false;
	private dirty = true;
	private surfaceStale = true;
	private unsubscribe: (() => void) | null = null;
	private visible = true;
	private lost = false;
	private failed = false;
	private disposed = false;
	private presented = false;
	private last = 0;
	private frames = 0;

	constructor(private options: EnamelEngineOptions) {
		this.canvas = options.canvas;
		this.config = assignDefined({ ...DEFAULTS }, options.config ?? {});
		this.host = acquireGlHost(this);
		try {
			// Half float cannot hold a conserved height: require float colour buffers.
			if (!this.host.gl.getExtension('EXT_color_buffer_float')) throw new Error('svelte-fluid: EnamelText needs EXT_color_buffer_float');
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

	/** Model grid (test observability). */
	get grid(): { cols: number; rows: number; cell: number } {
		return { cols: this.cols, rows: this.rows, cell: this.cell };
	}

	setConfig(patch: EnamelConfig): void {
		const prev = this.config;
		this.config = assignDefined({ ...prev }, patch);
		if (this.config.reducedMotion && !prev.reducedMotion) {
			this.held = 0;
			this.contact = null;
			this.tail = 0;
			this.settle = true;
		}
		this.invalidate();
	}

	/**
	 * Size to the canvas's CSS box at `devicePixelRatio` (native, ADR-0089) and
	 * re-rasterise the source text. Unchanged layout keeps the deposited material.
	 */
	resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
		if (this.disposed || !(cssWidth > 0 && cssHeight > 0)) return;
		const { width, height } = canvasPixelSize(cssWidth, cssHeight, devicePixelRatio);
		if (this.canvas.width !== width) this.canvas.width = width;
		if (this.canvas.height !== height) this.canvas.height = height;
		this.cssWidth = cssWidth;
		this.cssHeight = cssHeight;
		this.relayout();
	}

	/** Re-rasterise the text (font load, text or style change). Throws if the text is unsupported. */
	relayout(): void {
		if (this.disposed) return;
		const frame = this.canvas.getBoundingClientRect();
		const box = new DOMRect(frame.left, frame.top, this.cssWidth, this.cssHeight);
		const raster = rasterizeText(this.options.source, box, this.canvas.width, this.canvas.height);
		if (raster.key === this.raster?.key) return;
		this.raster = raster;
		this.invalidate();
	}

	/** Press at DOM CSS px (x, y); `strength` 0.25–1.5 (pen pressure). Held until release(). */
	press(x: number, y: number, strength = 1): void {
		if (this.config.reducedMotion || this.failed || this.disposed || !this.cols) return;
		const s = Number.isFinite(strength) ? Math.min(1.5, Math.max(0.25, strength)) : 1;
		const sigma = Math.max(6, ENAMEL.sigma * (this.raster?.fontPx ?? 16)) / this.cell;
		this.held = s;
		this.contact = { x: x / this.cell, y: (this.cssHeight - y) / this.cell, strength: this.contact?.strength ?? 0, sigma };
		this.tail = ENAMEL.tail;
		this.invalidate();
	}

	/** Lift the press: the material relaxes back to its rest profile. */
	release(): void {
		if (!this.held) return;
		this.held = 0;
		this.tail = ENAMEL.tail;
		this.invalidate();
	}

	/** Offscreen instances schedule nothing. */
	setVisible(visible: boolean): void {
		this.visible = visible;
		this.schedule();
	}

	/** @internal Test/bench hook: run `frames` fixed 1/60 s frames now and present the last. */
	advance(frames = 1): Promise<void> {
		for (let i = 0; i < frames; i++) this.frame(1 / 60);
		this.schedule();
		return this.host && !this.lost ? this.present() : Promise.resolve();
	}

	/** @internal Bench hook: `frames` busy frames (held press, every pass) without presenting. */
	busyFrames(frames: number): void {
		for (let i = 0; i < frames; i++) {
			this.press(this.cssWidth * (0.2 + 0.6 * ((i * 0.618) % 1)), this.cssHeight / 2);
			this.frame(1 / 60);
		}
	}

	/** @internal Test hook: coarse height and rest (rows bottom-up); rest is -1 on solid cells. */
	readModel(): { cols: number; rows: number; height: Float32Array; rest: Float32Array } {
		const n = this.cols * this.rows;
		const read = (fbo: FBO | null | undefined) => {
			const data = new Float32Array(n * 4);
			this.host?.run(this, (gl) => {
				if (!fbo) return;
				gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo);
				gl.readPixels(0, 0, this.cols, this.rows, gl.RGBA, gl.FLOAT, data);
			});
			return Float32Array.from({ length: n }, (_, i) => data[i * 4]);
		};
		return { cols: this.cols, rows: this.rows, height: read(this.height?.read), rest: read(this.rest) };
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
		this.presented = false;
		this.stop();
		this.dither?.dispose();
		this.coverage = this.sdf = this.jfa = this.restFine = this.blur = this.cavity = this.rest = this.height = this.surface = this.dither = null;
		this.uploadedKey = '';
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
		if (!host.gl.getExtension('EXT_color_buffer_float')) throw new Error('svelte-fluid: EnamelText needs EXT_color_buffer_float');
		this.dither = createDitheringTexture(host.gl, () => this.invalidate());
		this.jfa = new JumpFlood(host.gl, host.ext, (name, fragment) => host.program(name, baseVertexShader, fragment), host.blit.bind(host));
		// Compile up front so a driver rejection surfaces here, not mid-frame.
		for (const [name, fs, defines] of this.programs()) host.program(name, ENAMEL_VS, fs, defines);
	}

	private programs(): [string, string, string[]?][] {
		return [
			['enamel-rest-sdf', ENAMEL_REST_FS, ['FROM_SDF']],
			['enamel-rest', ENAMEL_REST_FS],
			['enamel-coarse', ENAMEL_COARSE_FS],
			['enamel-reset', ENAMEL_RESET_FS],
			['enamel-transfer', ENAMEL_TRANSFER_FS],
			['enamel-surface', ENAMEL_SURFACE_FS],
			['enamel-composite', ENAMEL_COMPOSITE_FS]
		];
	}

	private freeResources(): void {
		const gl = this.host?.gl;
		if (!gl || this.lost || gl.isContextLost()) return;
		for (const f of [this.sdf, this.restFine, this.blur, this.cavity, this.rest, this.height?.read, this.height?.write, this.surface]) disposeFBO(gl, f ?? undefined);
		gl.deleteTexture(this.coverage);
		this.jfa?.dispose();
		if (this.dither) gl.deleteTexture(this.dither.texture);
		this.coverage = this.sdf = this.jfa = this.restFine = this.blur = this.cavity = this.rest = this.height = this.surface = this.dither = null;
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
		return !this.config.reducedMotion && (this.held > 0 || this.tail > 0);
	}

	private schedule(): void {
		const active = !this.disposed && !this.lost && !this.failed && this.visible && !!this.raster && (this.dirty || this.animating());
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
		this.frame(dt);
		if (this.host && !this.lost) void this.present();
		this.schedule();
	};

	private present(): Promise<void> {
		const first = !this.presented;
		this.presented = true;
		return this.host!.present(this).then(() => {
			if (first && !this.disposed && !this.lost && !this.failed) notifyHost(this.options.onPresent, 'onPresent');
		});
	}

	/** One frame: ease the contact, fixed 240 Hz pair transport, composite. */
	private frame(dt: number): void {
		const host = this.host;
		if (!host || this.lost || this.failed || !this.raster) return;
		let substeps = 0;
		if (this.animating()) {
			this.accumulator = Math.min(this.accumulator + dt, 3 / 60);
			substeps = Math.floor((this.accumulator + 1e-6) / ENAMEL.substep);
			this.accumulator -= substeps * ENAMEL.substep;
			if (this.contact) {
				const target = this.held;
				const k = target > this.contact.strength ? 1 : 1 - Math.exp(-dt / RELEASE_TAU);
				this.contact.strength += (target - this.contact.strength) * k;
				if (!this.held && this.contact.strength < 1e-3) this.contact = null;
			}
			if (!this.held) {
				this.tail = Math.max(0, this.tail - dt);
				// Residual is below 8-bit shading: end on the exact rest still.
				if (this.tail === 0) this.settle = true;
			}
		}
		host.run(this, (gl) => {
			this.ensureResources(gl);
			if (this.settle) this.blitReset(gl);
			else if (substeps) this.simulate(gl, substeps);
			this.composite(gl);
		});
		this.settle = false;
		this.dirty = false;
		this.frames++;
	}

	private ensureResources(gl: WebGL2RenderingContext): void {
		const host = this.host!;
		const raster = this.raster!;
		if (raster.key === this.uploadedKey && this.height) return;
		const w = this.canvas.width;
		const h = this.canvas.height;
		const dpr = w / this.cssWidth;
		// Coverage: R8 straight from the 2D raster, flipped to GL rows.
		if (!this.coverage) this.coverage = gl.createTexture();
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.coverage);
		for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		try {
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, raster.canvas);
		} finally {
			// Shared context: leave unpack state as every sibling expects it.
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
			gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
		}
		// Euclidean SDF (ADR-0084), device px.
		this.sdf = this.jfa!.build(this.coverage!, w, h, this.sdf);
		const fit = (fbo: FBO | null, fw: number, fh: number) => {
			if (fbo && fbo.width === fw && fbo.height === fh) return fbo;
			disposeFBO(gl, fbo ?? undefined);
			return createFBO(gl, fw, fh, gl.R32F, gl.RED, gl.FLOAT, gl.NEAREST);
		};
		this.restFine = fit(this.restFine, w, h);
		this.blur = fit(this.blur, w, h);
		const font = raster.fontPx;
		const smooth = Math.max(0.75, ENAMEL.smooth * font) * dpr;
		this.cavity = fit(this.cavity, w, h);
		const restPass = (name: string, defines: string[] | undefined, source: WebGLTexture, dir: [number, number], target: FBO, sigma: number) => {
			const p = host.program(name, ENAMEL_VS, ENAMEL_REST_FS, defines);
			p.bind();
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, source);
			gl.uniform1i(p.uniforms.uSource, 0);
			gl.uniform1f(p.uniforms.uDpr, dpr);
			gl.uniform1f(p.uniforms.uPlateau, ENAMEL.plateau * font);
			gl.uniform1f(p.uniforms.uPeak, ENAMEL.peak);
			gl.uniform1f(p.uniforms.uSigma, sigma);
			gl.uniform2i(p.uniforms.uDir, dir[0], dir[1]);
			host.blit(target);
		};
		restPass('enamel-rest-sdf', ['FROM_SDF'], this.sdf.texture, [1, 0], this.blur, smooth);
		restPass('enamel-rest', undefined, this.blur.texture, [0, 1], this.restFine, smooth);
		// Cavity: the rest surface at the occlusion scale (setup only, never per frame).
		const occSigma = ENAMEL.occlusion * font * dpr;
		restPass('enamel-rest', undefined, this.restFine.texture, [1, 0], this.blur, occSigma);
		restPass('enamel-rest', undefined, this.blur.texture, [0, 1], this.cavity, occSigma);

		const grid = enamelGrid(this.cssWidth, this.cssHeight, font);
		const resized = grid.cols !== this.cols || grid.rows !== this.rows || grid.cell !== this.cell;
		this.cols = grid.cols;
		this.rows = grid.rows;
		this.cell = grid.cell;
		this.rest = fit(resized ? null : this.rest, grid.cols, grid.rows);
		if (resized || !this.height) {
			for (const f of [this.height?.read, this.height?.write, this.surface]) disposeFBO(gl, f ?? undefined);
			this.height = { read: fit(null, grid.cols, grid.rows), write: fit(null, grid.cols, grid.rows) };
			this.surface = createFBO(gl, grid.cols, grid.rows, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST);
		}
		const c = host.program('enamel-coarse', ENAMEL_VS, ENAMEL_COARSE_FS);
		c.bind();
		gl.uniform1i(c.uniforms.uRestFine, this.restFine.attach(0));
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.coverage);
		gl.uniform1i(c.uniforms.uCoverage, 1);
		gl.uniform2f(c.uniforms.uCss, this.cssWidth, this.cssHeight);
		gl.uniform1f(c.uniforms.uCell, this.cell);
		gl.uniform1f(c.uniforms.uSolidBelow, ENAMEL.solidBelow);
		host.blit(this.rest);
		// New glyphs: material is deposited at rest (a press in flight is dropped).
		this.blitReset(gl);
		this.contact = null;
		this.held = 0;
		this.tail = 0;
		this.uploadedKey = raster.key;
	}

	private blitReset(gl: WebGL2RenderingContext): void {
		const host = this.host!;
		const p = host.program('enamel-reset', ENAMEL_VS, ENAMEL_RESET_FS);
		p.bind();
		gl.uniform1i(p.uniforms.uRest, this.rest!.attach(0));
		host.blit(this.height!.read);
		this.surfaceStale = true;
	}

	private simulate(gl: WebGL2RenderingContext, substeps: number): void {
		const host = this.host!;
		const height = this.height!;
		const p = host.program('enamel-transfer', ENAMEL_VS, ENAMEL_TRANSFER_FS);
		p.bind();
		const u = p.uniforms;
		gl.uniform1f(u.uF, exchangeFraction(this.raster!.fontPx, this.cell));
		gl.uniform1f(u.uContactGain, ENAMEL.contact);
		const c = this.contact;
		gl.uniform4f(u.uContact, c?.x ?? 0, c?.y ?? 0, c?.strength ?? 0, c?.sigma ?? 1);
		gl.uniform1i(u.uRest, this.rest!.attach(1));
		for (let s = 0; s < substeps; s++, this.tick++) {
			for (const phase of phaseOrder(this.tick)) {
				gl.uniform1i(u.uPhase, phase);
				gl.uniform1i(u.uHeight, height.read.attach(0));
				host.blit(height.write);
				[height.read, height.write] = [height.write, height.read];
			}
		}
		this.surfaceStale = true;
	}

	private composite(gl: WebGL2RenderingContext): void {
		const host = this.host!;
		if (this.surfaceStale) {
			const s = host.program('enamel-surface', ENAMEL_VS, ENAMEL_SURFACE_FS);
			s.bind();
			gl.uniform1i(s.uniforms.uHeight, this.height!.read.attach(0));
			gl.uniform1i(s.uniforms.uRest, this.rest!.attach(1));
			host.blit(this.surface);
			this.surfaceStale = false;
		}
		const raster = this.raster!;
		const look = LOOKS[this.config.tone];
		const band = glyphBand(this.config.body, this.config.page, minContrastFor(raster.fontPx, raster.weight));
		const p = host.program('enamel-composite', ENAMEL_VS, ENAMEL_COMPOSITE_FS);
		p.bind();
		const u = p.uniforms;
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.coverage);
		gl.uniform1i(u.uCoverage, 0);
		gl.uniform1i(u.uRestFine, this.restFine!.attach(1));
		gl.uniform1i(u.uSurface, this.surface!.attach(2));
		gl.uniform1i(u.uDither, this.dither!.attach(3));
		gl.uniform1f(u.uDpr, this.canvas.width / this.cssWidth);
		gl.uniform1f(u.uCell, this.cell);
		gl.uniform1f(u.uRelief, ENAMEL.relief * raster.fontPx);
		gl.uniform1f(u.uDentRelief, ENAMEL.dentRelief * raster.fontPx);
		gl.uniform3fv(u.uBody, bodyLinear(this.config.body));
		gl.uniform1f(u.uAmbient, look.ambient);
		gl.uniform3fv(u.uLight, KEY_DIRECTION);
		gl.uniform3fv(u.uEnvLow, look.envLow);
		gl.uniform3fv(u.uEnvHigh, look.envHigh);
		gl.uniform2f(u.uKey, look.key, look.width);
		gl.uniform4f(u.uBand, band.side, band.lo, band.hi, band.knee);
		gl.uniform1i(u.uCavity, this.cavity!.attach(4));
		gl.uniform1f(u.uOcclusion, look.occlusion);
		gl.uniform1f(u.uPeak, ENAMEL.peak);
		gl.uniform3f(u.uRim, look.rim, restProfile(ENAMEL.rimInset, ENAMEL.plateau), Math.max(0.6, ENAMEL.rimWidth * raster.fontPx));
		host.blit(null);
	}
}
