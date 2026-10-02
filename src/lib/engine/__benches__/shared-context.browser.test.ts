/*
 * FluidEngine context tiers (ADR-0082 option A as a hybrid, ADR-0093): own
 * contexts below OWN_CONTEXT_LIMIT, then the shared WebGL2 host. Pixel parity
 * between the tiers, tier assignment, 24 live <Fluid>s, state isolation, loss
 * fan-out, lazy churn and per-instance failure on both tiers. Startup timings are
 * written to /tmp/lane-shared-ctx/startup.json (measurement, not a gate).
 */
import { mount, unmount } from 'svelte';
import { commands } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Fluid from '../../Fluid.svelte';
import { FluidEngine, _ownContextEngines, _setContextTier } from '../FluidEngine.js';
import { activeFrameSubscribers } from '../frame-scheduler.js';
import { PRESETS } from '../../presets/registry.js';
import type { FluidConfig } from '../types.js';

interface Harness {
	gl: WebGL2RenderingContext;
	sharedContext: boolean;
	renderCoreInner(target: null): void;
	withGl<T>(fn: () => T): T | undefined;
	renderCore(target: null): void;
	presented(): Promise<void>;
}

const W = 160;
const H = 100;
const STEPS = 30;
const DT = 1 / 60;

const engines: FluidEngine[] = [];
const mounted: { app: object; el: HTMLElement }[] = [];
afterEach(() => {
	for (const e of engines.splice(0)) e.dispose();
	for (const { app, el } of mounted.splice(0)) {
		void unmount(app);
		el.remove();
	}
	_setContextTier('auto');
	vi.restoreAllMocks();
	document.body.replaceChildren();
});

function create(config: FluidConfig, shared: boolean, w = W, h = H, opts: { onFrameError?: (e: unknown) => void } = {}) {
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	_setContextTier(shared);
	try {
		const engine = new FluidEngine({
			canvas,
			autoStart: false,
			onFrameError: opts.onFrameError,
			config: { pointerInput: false, seed: 1234, ...config }
		});
		engines.push(engine);
		expect(engine.sharedContext).toBe(shared);
		return { engine, canvas, h: engine as unknown as Harness };
	} finally {
		_setContextTier('auto');
	}
}

/** The engine's exact 8-bit output (premultiplied), read inside its own GL scope. */
function output(h: Harness, w: number, ht: number): Uint8Array {
	const px = new Uint8Array(w * ht * 4);
	h.withGl(() => {
		h.renderCoreInner(null);
		h.gl.bindFramebuffer(h.gl.FRAMEBUFFER, null);
		h.gl.readPixels(0, 0, w, ht, h.gl.RGBA, h.gl.UNSIGNED_BYTE, px);
	});
	return px;
}

/** What the page shows: the visible canvas drawn through 2D. */
function visible(canvas: HTMLCanvasElement): Uint8ClampedArray {
	const copy = document.createElement('canvas');
	copy.width = canvas.width;
	copy.height = canvas.height;
	const ctx = copy.getContext('2d')!;
	ctx.drawImage(canvas, 0, 0);
	return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

function diff(a: ArrayLike<number>, b: ArrayLike<number>): { pixels: number; max: number } {
	let pixels = 0;
	let max = 0;
	for (let i = 0; i < a.length; i += 4) {
		let d = 0;
		for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(a[i + c] - b[i + c]));
		if (d > 0) pixels++;
		max = Math.max(max, d);
	}
	return { pixels, max };
}

const nonBlank = (px: ArrayLike<number>) => {
	let lit = 0;
	for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 12) lit++;
	return lit;
};

const frames = (count: number) =>
	new Promise<void>((resolve) => {
		const next = () => (count-- <= 0 ? resolve() : requestAnimationFrame(next));
		next();
	});
const nextTask = () => new Promise((r) => setTimeout(r, 0));

const CASES: [string, FluidConfig][] = [
	...PRESETS.map((p): [string, FluidConfig] => [p.id, p.config as FluidConfig]),
	['transparent', { transparent: true }],
	['transparent+glass', { ...(PRESETS.find((p) => p.id === 'LavaLamp')!.config as FluidConfig), transparent: true }],
	['reveal', { reveal: true }],
	['transparent+contrast', { transparent: true, minContrast: 4.5, contrastColor: { r: 255, g: 255, b: 255 } }]
];

describe('shared WebGL2 host: pixel parity with the per-canvas path', () => {
	const table: Record<string, { gl: number; glMax: number; page: number; pageMax: number }> = {};
	for (const [name, config] of CASES) {
		it(name, async () => {
			const own = create(config, false);
			own.engine.advance(STEPS, DT);
			const ref = output(own.h, W, H);
			own.h.renderCore(null);
			const refPage = visible(own.canvas);

			const shared = create(config, true);
			shared.engine.advance(STEPS, DT);
			const got = output(shared.h, W, H);
			shared.h.renderCore(null);
			await shared.h.presented();
			const gotPage = visible(shared.canvas);

			const g = diff(ref, got);
			const p = diff(refPage, gotPage);
			table[name] = { gl: g.pixels, glMax: g.max, page: p.pixels, pageMax: p.max };
			expect(nonBlank(got)).toBeGreaterThan(0);
			expect(g.pixels).toBe(0);
			expect(p.pixels).toBe(0);
		});
	}
	it('writes the parity table', async () => {
		console.info('[shared-ctx] parity', JSON.stringify(table));
		const write = (commands as unknown as Record<string, (p: string, c: string) => Promise<void>>).writeBenchJson;
		await write('/tmp/lane-shared-ctx/parity.json', JSON.stringify(table, null, 2));
	});
});

describe('shared WebGL2 host: isolation', () => {
	it('alternating a bloom+sunrays+glass instance with a transparent one leaks no state', async () => {
		const lava = { ...(PRESETS.find((p) => p.id === 'LavaLamp')!.config as FluidConfig), bloom: true, sunrays: true };
		const transparent: FluidConfig = { transparent: true, dyeResolution: 256 };
		const refEngine = create(transparent, false, 130, 90);
		refEngine.engine.advance(STEPS, DT);
		const ref = output(refEngine.h, 130, 90);

		const heavy = create(lava, true, 210, 140);
		const light = create(transparent, true, 130, 90);
		light.engine.advance(STEPS, DT);
		for (let round = 0; round < 4; round++) {
			heavy.engine.advance(1, DT);
			heavy.h.renderCore(null);
			expect(diff(ref, output(light.h, 130, 90)).pixels).toBe(0);
			light.h.renderCore(null);
		}
		await light.h.presented();
		expect(heavy.h.gl.getError()).toBe(heavy.h.gl.NO_ERROR);
	});

	it("one shared instance's GL failure marks only that instance failed", async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const onFrameError = vi.fn();
		const bad = create({ sticky: true, stickyMask: { text: 'A' } }, true, W, H, { onFrameError });
		const sibling = create({}, true);
		sibling.engine.advance(5, DT);
		// Inject a real GL error into the failing instance's resource transition.
		const target = bad.engine as unknown as Record<string, () => void>;
		const original = target.initStickyMaskTexture;
		target.initStickyMaskTexture = function () {
			original.call(this);
			bad.h.gl.texImage2D(bad.h.gl.TEXTURE_2D, 0, 0x1234, 1, 1, 0, bad.h.gl.RGBA, bad.h.gl.UNSIGNED_BYTE, null);
		};
		bad.engine.setConfig({ stickyMask: { text: 'B' } });
		expect(onFrameError).toHaveBeenCalledTimes(1);
		expect(String(onFrameError.mock.calls[0][0])).toMatch(/GL error 0x50[01] during reconfigure/);
		// Failed is terminal: further work is ignored, never retried.
		bad.engine.resume();
		expect(bad.engine.isPaused).toBe(true);
		bad.engine.setConfig({ curl: 3 });
		expect(onFrameError).toHaveBeenCalledTimes(1);

		sibling.engine.advance(5, DT);
		sibling.engine.setConfig({ dyeResolution: 128 });
		expect(nonBlank(output(sibling.h, W, H))).toBeGreaterThan(0);
		expect(sibling.h.gl.getError()).toBe(sibling.h.gl.NO_ERROR);
		// Disposing the failed instance frees only its fields.
		bad.engine.dispose();
		expect(nonBlank(output(sibling.h, W, H))).toBeGreaterThan(0);
	});

	it("one own-context instance's frame failure evicts only that instance", async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const onFrameError = vi.fn();
		const bad = create({ dyeResolution: 128 }, false, W, H, { onFrameError });
		const ownSibling = create({ dyeResolution: 128 }, false);
		const sharedSibling = create({ dyeResolution: 128 }, true);
		const draw = bad.h.gl.drawElements.bind(bad.h.gl);
		Object.defineProperty(bad.h.gl, 'drawElements', {
			configurable: true,
			value: () => {
				throw new Error('injected frame failure');
			}
		});
		for (const { engine } of [bad, ownSibling, sharedSibling]) engine.resume();
		await vi.waitFor(() => expect(onFrameError).toHaveBeenCalledTimes(1));
		await frames(5);
		Object.defineProperty(bad.h.gl, 'drawElements', { configurable: true, value: draw });
		expect(bad.engine.isPaused).toBe(true);
		expect(ownSibling.engine.isPaused).toBe(false);
		expect(sharedSibling.engine.isPaused).toBe(false);
		for (const { h } of [ownSibling, sharedSibling]) expect(nonBlank(output(h, W, H))).toBeGreaterThan(0);
	});

	it('one forced loss restores every instance, sequentially, with its opening scene', async () => {
		const list = Array.from({ length: 8 }, (_, i) => create({ seed: 100 + i, dyeResolution: 128 }, true, 96 + i * 8, 64));
		const before = list.map(({ engine }) => engine.readField('dye').data.reduce((s, v) => s + Math.abs(v), 0));
		const gl = list[0].h.gl;
		const lose = gl.getExtension('WEBGL_lose_context')!;
		const lost = new Promise((r) => gl.canvas.addEventListener('webglcontextlost', r, { once: true }));
		lose.loseContext();
		await lost;
		expect(() => list[3].engine.readField('dye')).toThrow();
		await nextTask();
		const restored = new Promise((r) => gl.canvas.addEventListener('webglcontextrestored', r, { once: true }));
		lose.restoreContext();
		await restored;
		await nextTask();
		const after = list.map(({ engine }) => engine.readField('dye').data.reduce((s, v) => s + Math.abs(v), 0));
		expect(after).toEqual(before);
		for (const { h, canvas } of list) {
			expect(nonBlank(output(h, canvas.width, canvas.height))).toBeGreaterThan(0);
		}
		gl.getError();
	});
});

function hostEl(w: number, h: number): HTMLElement {
	const el = document.createElement('div');
	el.style.cssText = `width:${w}px;height:${h}px;display:inline-block;position:relative`;
	document.body.append(el);
	return el;
}

describe('context tiers', () => {
	it('gives the first 8 engines their own context and the 9th the shared host; disposal frees a slot', () => {
		expect(_ownContextEngines()).toBe(0);
		const make = () => {
			const canvas = document.createElement('canvas');
			canvas.width = 64;
			canvas.height = 48;
			const engine = new FluidEngine({ canvas, autoStart: false, config: { pointerInput: false, dyeResolution: 64 } });
			engines.push(engine);
			return engine;
		};
		const first = Array.from({ length: 8 }, make);
		expect(first.every((e) => !e.sharedContext)).toBe(true);
		expect(_ownContextEngines()).toBe(8);
		const ninth = make();
		expect(ninth.sharedContext).toBe(true);
		expect(_ownContextEngines()).toBe(8);
		first[3].dispose();
		expect(_ownContextEngines()).toBe(7);
		expect(make().sharedContext).toBe(false);
		expect(make().sharedContext).toBe(true);
		// requireHardwareAcceleration always keeps its own context.
		const canvas = document.createElement('canvas');
		const hw = new FluidEngine({ canvas, autoStart: false, config: { pointerInput: false, requireHardwareAcceleration: true } });
		engines.push(hw);
		expect(hw.sharedContext).toBe(false);
	});
});

describe('context tiers through <Fluid>', () => {
	it('keeps 24 visible instances live: 8 own contexts plus 16 shared', async () => {
		let lostEvents = 0;
		const onLost = () => lostEvents++;
		window.addEventListener('webglcontextlost', onLost, true);
		const ready = vi.fn();
		const errors = vi.fn();
		for (let i = 0; i < 24; i++) {
			const el = hostEl(120, 80);
			const app = mount(Fluid, {
				target: el,
				props: { seed: i + 1, initialSplatCount: 8, onReady: ready, onError: errors, autoPause: false }
			});
			mounted.push({ app, el });
		}
		await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(24));
		await frames(6);
		window.removeEventListener('webglcontextlost', onLost, true);
		expect(errors).not.toHaveBeenCalled();
		expect(lostEvents).toBe(0);
		for (const { el } of mounted) {
			const canvas = el.querySelector('canvas')!;
			expect(nonBlank(visible(canvas))).toBeGreaterThan(0);
			expect(el.querySelector('.svelte-fluid-fallback')).toBeNull();
		}
		expect(activeFrameSubscribers()).toBe(24);
		expect(_ownContextEngines()).toBe(8);
	});

	for (const tier of ['own', 'shared'] as const)
	it(`lazy scroll-out/in churn 50x does not grow the live context count (${tier} tier)`, async () => {
		// Fill every own-context slot first so the lazy instances go shared.
		if (tier === 'shared') for (let i = 0; i < 8; i++) create({ dyeResolution: 64 }, false, 32, 32);
		const created: (WebGLRenderingContext | WebGL2RenderingContext)[] = [];
		for (const proto of [HTMLCanvasElement.prototype, OffscreenCanvas.prototype] as { getContext: (...a: unknown[]) => unknown }[]) {
			const get = proto.getContext;
			vi.spyOn(proto, 'getContext').mockImplementation(function (this: unknown, ...a: unknown[]) {
				const ctx = get.apply(this, a);
				if (ctx && String(a[0]).startsWith('webgl') && !created.includes(ctx as WebGL2RenderingContext))
					created.push(ctx as WebGL2RenderingContext);
				return ctx;
			});
		}
		const spacer = document.createElement('div');
		spacer.style.height = '3000px';
		const ready = vi.fn();
		for (let i = 0; i < 3; i++) {
			const el = hostEl(120, 80);
			mounted.push({ app: mount(Fluid, { target: el, props: { lazy: true, seed: i + 1, onReady: ready } }), el });
		}
		document.body.append(spacer);
		await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(3));
		const live = () => created.filter((gl) => !gl.isContextLost()).length;
		// Own tier: one context per lazy canvas, lost on scroll-out (slot freed)
		// and restored on scroll-in. Shared tier: the one host context.
		const expected = tier === 'own' ? 3 : 1;
		expect(live()).toBe(expected);
		for (let i = 0; i < 50; i++) {
			window.scrollTo(0, 2500);
			await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(0));
			if (tier === 'own') expect(_ownContextEngines()).toBe(0);
			window.scrollTo(0, 0);
			await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(3 * (i + 2)));
		}
		await frames(3);
		expect(live()).toBe(expected);
		// Own tier reuses each canvas's context. On the shared tier the last
		// release frees the host's slot (ADR-0088) and scroll-in makes a new one.
		if (tier === 'own') expect(created.length).toBe(expected);
		expect(_ownContextEngines()).toBe(tier === 'own' ? 3 : 8);
		for (const { el } of mounted) expect(nonBlank(visible(el.querySelector('canvas')!))).toBeGreaterThan(0);
	});
});

describe('review fixes (ADR-0093)', () => {
	it('a shared canvas rebuilt while an own slot is free stays shared and renders', async () => {
		const spacer = document.createElement('div');
		spacer.style.height = '3000px';
		const ready = vi.fn();
		const errors = vi.fn();
		const els: HTMLElement[] = [];
		for (let i = 0; i < 9; i++) {
			const el = hostEl(64, 40);
			els.push(el);
			mounted.push({ app: mount(Fluid, { target: el, props: { lazy: true, seed: i + 1, onReady: ready, onError: errors } }), el });
		}
		document.body.append(spacer);
		await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(9));
		expect(_ownContextEngines()).toBe(8);
		const sharedCanvas = els[8].querySelector('canvas')!;
		// Scroll every instance out: own slots free up (0 own live).
		window.scrollTo(0, 2500);
		await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(0));
		expect(_ownContextEngines()).toBe(0);
		// Back in: each canvas keeps its first tier, so S stays shared.
		window.scrollTo(0, 0);
		await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(18));
		await frames(4);
		expect(errors).not.toHaveBeenCalled();
		expect(_ownContextEngines()).toBe(8);
		expect(nonBlank(visible(sharedCanvas))).toBeGreaterThan(0);
		expect(els[8].querySelector('.svelte-fluid-fallback')).toBeNull();
	});

	it('an own canvas rebuilt while all slots are taken stays own and is counted past K', () => {
		const first = create({ dyeResolution: 64 }, false, 32, 32);
		first.engine.dispose();
		engines.splice(engines.indexOf(first.engine), 1);
		const filler = Array.from({ length: 8 }, () => create({ dyeResolution: 64 }, false, 32, 32));
		expect(_ownContextEngines()).toBe(8);
		const rebuilt = new FluidEngine({ canvas: first.canvas, autoStart: false, config: { pointerInput: false, dyeResolution: 64 } });
		engines.push(rebuilt);
		expect(rebuilt.sharedContext).toBe(false);
		expect(_ownContextEngines()).toBe(9);
		rebuilt.dispose();
		expect(_ownContextEngines()).toBe(8);
		expect(filler.every((f) => !f.engine.sharedContext)).toBe(true);
	});

	it('a shared engine constructed while the host is lost recovers on restore', async () => {
		const errorLog = vi.spyOn(console, 'error');
		const anchor = create({ dyeResolution: 64 }, true, 32, 32);
		const gl = anchor.h.gl;
		const lose = gl.getExtension('WEBGL_lose_context')!;
		const lost = new Promise((r) => gl.canvas.addEventListener('webglcontextlost', r, { once: true }));
		lose.loseContext();
		await lost;
		const late = create({ seed: 77, dyeResolution: 64 }, true, 80, 50);
		expect(() => late.engine.readField('dye')).toThrow();
		await nextTask();
		const restored = new Promise((r) => gl.canvas.addEventListener('webglcontextrestored', r, { once: true }));
		lose.restoreContext();
		await restored;
		await nextTask();
		expect(errorLog).not.toHaveBeenCalled();
		expect(late.engine.readField('dye').data.some((v) => v !== 0)).toBe(true);
		expect(nonBlank(output(late.h, 80, 50))).toBeGreaterThan(0);
		// Disposing both releases the host completely: no leaked registration.
		anchor.engine.dispose();
		late.engine.dispose();
		engines.length = 0;
		expect(gl.isContextLost()).toBe(true);
	});

	it('public methods after dispose are no-ops and leave a sibling untouched', () => {
		const a = create({ dyeResolution: 64 }, true, 64, 64);
		const b = create({ seed: 9, dyeResolution: 64 }, true, 64, 64);
		const before = b.engine.readField('dye').data.slice();
		a.engine.dispose();
		const gl = b.h.gl;
		let calls = 0;
		for (const name of ['drawElements', 'texImage2D', 'createFramebuffer', 'readPixels', 'useProgram'] as const) {
			const orig = (gl[name] as (...a: unknown[]) => unknown).bind(gl);
			Object.defineProperty(gl, name, { configurable: true, value: (...args: unknown[]) => (calls++, orig(...args)) });
		}
		a.engine.splat(0.5, 0.5, 100, 0, { r: 1, g: 1, b: 1 });
		a.engine.randomSplats(4);
		a.engine.advance(3, DT);
		a.engine.setConfig({ dyeResolution: 32, bloom: true });
		a.engine.resize(200, 100);
		a.engine.settleStill();
		a.engine.renderOnce();
		a.engine.resume();
		expect(() => a.engine.readField('dye')).toThrow();
		expect(calls).toBe(0);
		for (const name of ['drawElements', 'texImage2D', 'createFramebuffer', 'readPixels', 'useProgram']) delete (gl as unknown as Record<string, unknown>)[name];
		expect(b.engine.readField('dye').data).toEqual(before);
	});

	it('uses the real shared drawing buffer if it is clamped below the canvas size', () => {
		const probe = create({ dyeResolution: 64 }, true, 32, 32);
		const max = probe.h.gl.getParameter(probe.h.gl.MAX_VIEWPORT_DIMS) as Int32Array;
		const big = create({ dyeResolution: 64, simResolution: 16 }, true, 32, 32);
		// initContext fits the canvas to MAX_VIEWPORT_DIMS, so the surface matches.
		big.engine.resize(max[0] * 2, 8);
		const h = big.h as unknown as { bufferWidth(): number };
		expect(big.canvas.width).toBeLessThanOrEqual(max[0]);
		let inside = 0;
		big.h.withGl(() => (inside = h.bufferWidth()));
		expect(inside).toBe(big.h.gl.drawingBufferWidth);
		expect(inside).toBe(big.canvas.width);
	});

	it('forced WebGL1 and a canvas already holding a context take the own tier', () => {
		const c1 = document.createElement('canvas');
		const get = c1.getContext.bind(c1) as (t: string, ...a: unknown[]) => unknown;
		(c1 as unknown as { getContext: unknown }).getContext = (t: string, ...a: unknown[]) => (t === 'webgl2' || t === 'bitmaprenderer' ? null : get(t, ...a));
		_setContextTier('shared');
		const webgl1 = new FluidEngine({ canvas: c1, autoStart: false, config: { pointerInput: false, dyeResolution: 64 } });
		engines.push(webgl1);
		_setContextTier('auto');
		expect(webgl1.sharedContext).toBe(false);
		expect((webgl1 as unknown as { ext: { isWebGL2: boolean } }).ext.isWebGL2).toBe(false);

		const c2 = document.createElement('canvas');
		c2.getContext('webgl2');
		_setContextTier('shared');
		const held = new FluidEngine({ canvas: c2, autoStart: false, config: { pointerInput: false, dyeResolution: 64 } });
		engines.push(held);
		_setContextTier('auto');
		expect(held.sharedContext).toBe(false);
		held.advance(2, DT);
		expect(held.readField('dye').width).toBeGreaterThan(0);
	});

	it('uploads a distortion image on the shared tier', async () => {
		const src = document.createElement('canvas');
		src.width = 8;
		src.height = 4;
		const ctx = src.getContext('2d')!;
		ctx.fillStyle = '#f00';
		ctx.fillRect(0, 0, 8, 4);
		const url = src.toDataURL();
		const s = create({ distortion: true, distortionImageUrl: url, dyeResolution: 64 }, true, 64, 32);
		const h = s.engine as unknown as { distortionLoadedUrl: string | null; distortionTextureW: number };
		await vi.waitFor(() => expect(h.distortionLoadedUrl).toBe(url));
		expect(h.distortionTextureW).toBe(8);
		expect(s.h.gl.getError()).toBe(s.h.gl.NO_ERROR);
		const px = output(s.h, 64, 32);
		expect(px[0]).toBeGreaterThan(200);
		expect(px[1]).toBeLessThan(40);
	});

	it('Fluid shows render-failed after a shared transition failure', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		for (let i = 0; i < 8; i++) create({ dyeResolution: 64 }, false, 32, 32);
		const ready = vi.fn();
		const onError = vi.fn();
		const el = hostEl(120, 80);
		const app = mount(Fluid, { target: el, props: { seed: 5, onReady: ready, onError, fallbackText: 'failed', autoPause: false } });
		mounted.push({ app, el });
		await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
		// The resize transition (aspect change) hits a GL error on this instance only.
		const proto = FluidEngine.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
		const orig = proto.initGlassFramebuffer;
		proto.initGlassFramebuffer = function (this: { gl: WebGL2RenderingContext; sharedContext: boolean }, ...a: unknown[]) {
			orig.apply(this, a);
			if (this.sharedContext) this.gl.texImage2D(this.gl.TEXTURE_2D, 0, 0x1234, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, null);
		};
		try {
			el.style.width = '200px';
			await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
		} finally {
			proto.initGlassFramebuffer = orig;
		}
		await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
		expect(el.querySelector('.svelte-fluid-fallback')).not.toBeNull();
	});
});

describe('startup (measurement)', () => {
	const rows: Record<string, unknown>[] = [];
	for (const n of [8, 24]) {
		for (const shared of [false, true]) {
			it(`n=${n} ${shared ? 'shared' : 'per-canvas'}`, async () => {
				const times: number[] = [];
				const list: FluidEngine[] = [];
				_setContextTier(shared);
				let lost = 0;
				try {
					const start = performance.now();
					for (let i = 0; i < n; i++) {
						const canvas = document.createElement('canvas');
						canvas.width = 1600;
						canvas.height = 1000;
						canvas.addEventListener('webglcontextlost', () => lost++);
						const t0 = performance.now();
						list.push(new FluidEngine({ canvas, autoStart: false, config: { pointerInput: false, seed: i + 1 } }));
						times.push(performance.now() - t0);
					}
					const total = performance.now() - start;
					await nextTask();
					const rest = times.slice(1).sort((a, b) => a - b);
					const row = { n, mode: shared ? 'shared' : 'per-canvas', totalMs: +total.toFixed(1), firstMs: +times[0].toFixed(1), ctorMedian2toN: +rest[Math.floor(rest.length / 2)].toFixed(2), contextsLost: lost };
					rows.push(row);
					console.info('[shared-ctx] startup', JSON.stringify(row));
				} finally {
					_setContextTier('auto');
					for (const e of list) e.dispose();
				}
			});
		}
	}
	it('writes startup.json', async () => {
		const write = (commands as unknown as Record<string, (p: string, c: string) => Promise<void>>).writeBenchJson;
		await write('/tmp/lane-shared-ctx/startup.json', JSON.stringify(rows, null, 2));
	});
});
