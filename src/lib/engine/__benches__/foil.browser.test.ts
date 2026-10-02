/*
 * FoilSwitch and FoilEngine on hardware WebGL2 (ADR-0096).
 */
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import { commands, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FoilSwitch from '../../FoilSwitch.svelte';
import { contrastRatio, relativeLuminance } from '../contrast.js';
import { FOIL_LOOKS, hexToRgb } from '../foil/look.js';
import { activeFrameSubscribers } from '../frame-scheduler.js';
import { acquireGlHost } from '../gl-host.js';
import { FoilEngine } from '../foil/FoilEngine.js';
import type { FoilConfig } from '../foil/FoilEngine.js';

const live: (() => void)[] = [];
afterEach(() => {
	for (const done of live.splice(0)) done();
	document.body.replaceChildren();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const CSS = { w: 96, h: 48 };

function engine(config: FoilConfig = {}, dpr = 2): FoilEngine {
	const canvas = document.createElement('canvas');
	canvas.style.cssText = `width:${CSS.w}px;height:${CSS.h}px`;
	document.body.append(canvas);
	const e = new FoilEngine({ canvas, config });
	e.resize(CSS.w, CSS.h, dpr);
	live.push(() => e.dispose());
	return e;
}

/** Visible canvas pixels (top-down RGBA) through a 2D copy. */
function pixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
	const copy = document.createElement('canvas');
	copy.width = canvas.width;
	copy.height = canvas.height;
	const ctx = copy.getContext('2d')!;
	ctx.drawImage(canvas, 0, 0);
	return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

/** Topmost and bottommost opaque metal rows in the centre column (device px, top-down). */
function centreSpan(canvas: HTMLCanvasElement): { top: number; bottom: number } {
	const px = pixels(canvas);
	const x = canvas.width >> 1;
	let top = -1;
	let bottom = -1;
	for (let y = 0; y < canvas.height; y++) {
		if (px[(y * canvas.width + x) * 4 + 3] > 128) {
			if (top < 0) top = y;
			bottom = y;
		}
	}
	return { top, bottom };
}

/** Arch height of the metal centre, CSS px above the canvas middle (+ arched, − bowed). */
function archRise(canvas: HTMLCanvasElement): number {
	const { top, bottom } = centreSpan(canvas);
	return (canvas.height / 2 - (top + bottom) / 2) / (canvas.width / CSS.w);
}

const frames = (n: number) =>
	new Promise<void>((r) => {
		const f = () => (n-- <= 0 ? r() : requestAnimationFrame(f));
		f();
	});
const settle = async (e: FoilEngine, max = 240) => {
	for (let i = 0; i < max && e.running; i++) await frames(1);
};

function stubMedia(reduced: boolean) {
	vi.stubGlobal('matchMedia', (query: string) => ({
		matches: query.includes('prefers-reduced-motion') ? reduced : false,
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {}
	}));
}

describe('FoilEngine', () => {
	it.each([1, 2, 3])('compiles and presents the arch at DPR %i with no GL error', async (dpr) => {
		const e = engine({}, dpr);
		await e.advance(1);
		expect([e.canvas.width, e.canvas.height]).toEqual([CSS.w * dpr, CSS.h * dpr]);
		const px = pixels(e.canvas);
		const { top, bottom } = centreSpan(e.canvas);
		expect(top).toBeGreaterThan(0);
		// Metal at the crown is opaque and lit; the corners are empty.
		const crown = ((((top + bottom) >> 1) * e.canvas.width + (e.canvas.width >> 1)) * 4);
		expect(px[crown + 3]).toBe(255);
		expect(px[crown] + px[crown + 1] + px[crown + 2]).toBeGreaterThan(150);
		expect(px[3]).toBe(0);
		// Off arches up.
		expect(archRise(e.canvas)).toBeGreaterThan(3);
		const host = acquireGlHost(e);
		expect(host.gl.getError()).toBe(host.gl.NO_ERROR);
	});

	it('no chrome: every pixel outside the foil footprint (arch band and mounts) is fully transparent', async () => {
		for (const checked of [false, true]) {
			const e = engine({ checked, hover: { x: 0.8, y: 0.8 } }, 3);
			await e.advance(1);
			const px = pixels(e.canvas);
			const w = e.canvas.width;
			const h = e.canvas.height;
			// Model space of the shader: x ∈ ±1.4, y ∈ ±0.75 at this 2:1 aspect.
			const aspect = w / h / (2.8 / 1.5);
			const sx = 2.8 * Math.max(1, aspect);
			const sy = 1.5 * Math.max(1, 1 / aspect);
			const q = checked ? -1 : 1;
			let stray = 0;
			let inked = 0;
			for (let y = 0; y < h; y++)
				for (let x = 0; x < w; x++) {
					const px0 = ((x + 0.5) / w - 0.5) * sx;
					const py0 = (0.5 - (y + 0.5) / h) * sy;
					const t = Math.min(1, Math.max(-1, px0 / 0.97));
					const band = Math.max(Math.abs(px0) - 0.97, Math.abs((py0 - 0.68 * 0.44 * q * (1 - t * t)) / 0.74) - 0.14);
					const pad = Math.max(Math.abs(Math.abs(px0) - 0.97) - 0.105, Math.abs(py0) - 0.235);
					// One device px of AA slack in model units.
					const slack = (2 * sx) / w;
					const a = px[(y * w + x) * 4 + 3];
					if (a > 0) inked++;
					if (band > slack && pad > slack && a !== 0) stray++;
				}
			expect(inked).toBeGreaterThan(w * h * 0.05);
			expect(stray).toBe(0);
		}
	});

	it('readback: the arch interior keeps ≥3:1 against the page in both tones, hovered or not', async () => {
		const lum = (r: number, g: number, b: number) => relativeLuminance(r / 255, g / 255, b / 255);
		for (const tone of ['light', 'dark'] as const) {
			const page = hexToRgb(FOIL_LOOKS[tone].page);
			for (const checked of [false, true])
				for (const hover of [null, { x: 0.1, y: 0.9 }, { x: 0.9, y: 0.1 }]) {
					const e = engine({ checked, hover, page }, 3);
					await e.advance(1);
					const px = pixels(e.canvas);
					const w = e.canvas.width;
					let worst = Infinity;
					let at = '';
					// Opaque metal pixels between the mounts (pads are dark mounts, not state).
					for (let y = 0; y < e.canvas.height; y++)
						for (let x = Math.round(w * 0.25); x < Math.round(w * 0.75); x++) {
							const i = (y * w + x) * 4;
							const ratio = contrastRatio(lum(px[i], px[i + 1], px[i + 2]), lum(page.r, page.g, page.b));
							if (px[i + 3] === 255 && ratio < worst) [worst, at] = [ratio, `${tone} ${checked} ${JSON.stringify(hover)} (${x},${y}) ${px.slice(i, i + 4).join(',')}`];
						}
					expect(worst, at).toBeGreaterThanOrEqual(3);
					e.dispose();
				}
		}
	});

	it('a checked change snaps into the other well and unsubscribes once captured', async () => {
		const e = engine();
		await settle(e);
		expect(e.running).toBe(false);
		const before = archRise(e.canvas);
		e.setConfig({ checked: true });
		expect(e.running).toBe(true);
		await e.advance(3);
		// Moving within 50 ms.
		expect(archRise(e.canvas)).toBeLessThan(before - 0.5);
		await e.advance(15);
		expect(e.amplitude).toBe(-1);
		expect(archRise(e.canvas)).toBeLessThan(-3);
		await settle(e);
		expect(e.running).toBe(false);
		expect(activeFrameSubscribers()).toBe(0);
	});

	it('zero frames at rest and offscreen; a snap missed offscreen lands in its well', async () => {
		const e = engine();
		await settle(e);
		const count = e.frameCount;
		await frames(5);
		expect(e.frameCount).toBe(count);
		expect(activeFrameSubscribers()).toBe(0);
		e.setVisible(false);
		e.setConfig({ checked: true });
		expect(e.running).toBe(false);
		expect(e.amplitude).toBe(-1);
		e.setVisible(true);
		await settle(e);
		expect(e.running).toBe(false);
		expect(archRise(e.canvas)).toBeLessThan(-3);
	});

	it('hover adds a small load that settles, then rests at zero frames', async () => {
		const e = engine();
		await settle(e);
		e.setConfig({ hover: { x: 0.5, y: 0.9 } });
		await e.advance(30);
		// R&D sign: hover low pushes the crown up (load 12·(y − 0.5)), well short of a snap.
		expect(e.amplitude).toBeGreaterThan(1.01);
		expect(e.amplitude).toBeLessThan(1.2);
		await settle(e);
		expect(e.running).toBe(false);
	});

	it('reduced motion draws the final well at once and schedules nothing after', async () => {
		const e = engine({ reducedMotion: true });
		await settle(e);
		e.setConfig({ checked: true });
		expect(e.amplitude).toBe(-1);
		await e.advance(1);
		expect(archRise(e.canvas)).toBeLessThan(-3);
		e.setConfig({ hover: { x: 0.5, y: 0.9 } });
		await settle(e);
		expect(e.amplitude).toBe(-1);
		expect(e.running).toBe(false);
	});

	it('undefined never overwrites a resolved option', async () => {
		const e = engine({ checked: true, reducedMotion: true });
		e.setConfig({ checked: undefined, reducedMotion: undefined, hover: undefined, page: undefined });
		await e.advance(1);
		expect(e.amplitude).toBe(-1);
		expect(archRise(e.canvas)).toBeLessThan(-3);
	});

	it('survives context loss and restore through gl-host callbacks', async () => {
		const lost = vi.fn();
		const restored = vi.fn();
		const canvas = document.createElement('canvas');
		document.body.append(canvas);
		const e = new FoilEngine({ canvas, onContextLost: lost, onContextRestored: restored });
		live.push(() => e.dispose());
		e.resize(CSS.w, CSS.h, 2);
		await e.advance(1);
		const host = acquireGlHost(e);
		const lose = host.gl.getExtension('WEBGL_lose_context')!;
		const surface = host.gl.canvas;
		const lostEvent = new Promise((r) => surface.addEventListener('webglcontextlost', r, { once: true }));
		lose.loseContext();
		await lostEvent;
		expect(lost).toHaveBeenCalledOnce();
		expect(e.running).toBe(false);
		e.setConfig({ checked: true });
		expect(e.running).toBe(false);
		await new Promise((r) => setTimeout(r, 0));
		const restoredEvent = new Promise((r) => surface.addEventListener('webglcontextrestored', r, { once: true }));
		lose.restoreContext();
		await restoredEvent;
		expect(restored).toHaveBeenCalledOnce();
		await settle(e);
		expect(archRise(e.canvas)).toBeLessThan(-3);
		expect(host.gl.getError()).toBe(host.gl.NO_ERROR);
	});

	it('dispose releases the shared host', async () => {
		const e = engine();
		await e.advance(1);
		const gl = acquireGlHost(e).gl;
		e.dispose();
		expect(gl.isContextLost()).toBe(true);
		expect(activeFrameSubscribers()).toBe(0);
		e.dispose();
	});
});

describe('FoilSwitch', () => {
	const label = createRawSnippet(() => ({ render: () => '<span>Dark appearance</span>' }));
	function mountSwitch(props: Record<string, unknown> = {}) {
		const target = document.createElement('div');
		target.style.cssText = 'background:#f7f7f2;padding:12px';
		document.body.append(target);
		const app = mount(FoilSwitch, { target, props: { children: label, tone: 'light', ...props } });
		live.push(() => void unmount(app));
		return target.querySelector('button')!;
	}
	const canvasOf = (b: HTMLButtonElement) => b.querySelector('canvas')!;

	it('is a native switch: role, aria-checked, label name, decorative canvas, no chrome', async () => {
		const b = mountSwitch({ 'aria-describedby': 'hint', name: 'theme' });
		await vi.waitFor(() => expect(b.classList.contains('live')).toBe(true));
		expect(b.type).toBe('button');
		expect(b.getAttribute('role')).toBe('switch');
		expect(b.getAttribute('aria-checked')).toBe('false');
		expect(b.getAttribute('aria-describedby')).toBe('hint');
		expect(b.name).toBe('theme');
		expect(b.textContent).toContain('Dark appearance');
		const canvas = canvasOf(b);
		expect(canvas.closest('[aria-hidden="true"]')).not.toBeNull();
		expect(getComputedStyle(canvas).pointerEvents).toBe('none');
		const css = getComputedStyle(b);
		expect([css.borderTopWidth, css.borderRightWidth, css.borderBottomWidth, css.borderLeftWidth]).toEqual(['0px', '0px', '0px', '0px']);
		expect(css.boxShadow).toBe('none');
		expect(css.backgroundColor).toBe('rgba(0, 0, 0, 0)');
		expect(css.outlineStyle).toBe('none');
		const r = b.getBoundingClientRect();
		expect(r.height).toBeGreaterThanOrEqual(44);
		expect(r.width).toBeGreaterThanOrEqual(44);
	});

	it('a click flips aria-checked immediately and the arch settles into the other well', async () => {
		const onchange = vi.fn();
		const b = mountSwitch({ onchange });
		await vi.waitFor(() => expect(b.classList.contains('live')).toBe(true));
		await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(0), { timeout: 4000 });
		expect(archRise(canvasOf(b))).toBeGreaterThan(3);
		b.click();
		flushSync();
		// Synchronous: no physics in the way.
		expect(b.getAttribute('aria-checked')).toBe('true');
		expect(onchange).toHaveBeenCalledWith(true);
		await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(0), { timeout: 4000 });
		await frames(2);
		expect(archRise(canvasOf(b))).toBeLessThan(-3);
	});

	it('Space and Enter toggle natively; focus ring only on :focus-visible', async () => {
		const b = mountSwitch();
		await frames(2);
		b.focus();
		await userEvent.keyboard(' ');
		flushSync();
		expect(b.getAttribute('aria-checked')).toBe('true');
		await userEvent.keyboard('{Enter}');
		flushSync();
		expect(b.getAttribute('aria-checked')).toBe('false');
		expect(b.matches(':focus-visible')).toBe(true);
		expect(getComputedStyle(b).outlineStyle).toBe('solid');
		// A mouse click focuses without the ring.
		b.blur();
		await userEvent.click(b);
		expect(b.matches(':focus-visible')).toBe(false);
		expect(getComputedStyle(b).outlineStyle).toBe('none');
	});

	it('bind:checked and a consumer onchange that throws cannot break the toggle', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const b = mountSwitch({ checked: true, onchange: () => { throw new Error('consumer'); } });
		await frames(2);
		expect(b.getAttribute('aria-checked')).toBe('true');
		b.click();
		flushSync();
		expect(b.getAttribute('aria-checked')).toBe('false');
	});

	it('disabled: no toggle, no hover', async () => {
		const b = mountSwitch({ disabled: true });
		await frames(2);
		b.click();
		flushSync();
		expect(b.getAttribute('aria-checked')).toBe('false');
	});

	it('touch adds no hover load', async () => {
		const b = mountSwitch();
		await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(0), { timeout: 4000 });
		const r = canvasOf(b).getBoundingClientRect();
		b.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, isPrimary: true, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.bottom - 2 }));
		await frames(2);
		expect(activeFrameSubscribers()).toBe(0);
		b.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, isPrimary: true, pointerType: 'mouse', clientX: r.left + r.width / 2, clientY: r.bottom - 2 }));
		expect(activeFrameSubscribers()).toBeGreaterThan(0);
	});

	it('reduced motion: a click shows the final well on the next frame', async () => {
		stubMedia(true);
		const b = mountSwitch();
		await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(0), { timeout: 4000 });
		b.click();
		flushSync();
		await frames(2);
		expect(archRise(canvasOf(b))).toBeLessThan(-3);
		expect(activeFrameSubscribers()).toBe(0);
	});

	it('without WebGL2 the vector arch shows the state', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
		const b = mountSwitch();
		await frames(2);
		expect(b.classList.contains('live')).toBe(false);
		expect(getComputedStyle(canvasOf(b)).visibility).toBe('hidden');
		const svg = b.querySelector('svg')!;
		expect(getComputedStyle(svg).visibility).toBe('visible');
		expect(svg.querySelector('path')!.getAttribute('d')).toContain('Q48 0');
		b.click();
		flushSync();
		flushSync();
		expect(svg.querySelector('path')!.getAttribute('d')).toContain('Q48 48');
	});

	it('measures input-to-visible latency: click to the first presented frame showing motion', async () => {
		const b = mountSwitch();
		await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(0), { timeout: 4000 });
		const canvas = canvasOf(b);
		const samples: number[] = [];
		const counts: number[] = [];
		for (let i = 0; i < 8; i++) {
			const start = archRise(canvas);
			const t0 = performance.now();
			b.click();
			let t = Infinity;
			for (let f = 1; f <= 30; f++) {
				await new Promise((r) => requestAnimationFrame(r));
				if (Math.abs(archRise(canvas) - start) > 0.25) {
					t = performance.now() - t0;
					counts.push(f);
					break;
				}
			}
			samples.push(t);
			await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(0), { timeout: 4000 });
		}
		samples.sort((a, b) => a - b);
		// Frame pacing of this browser (headless rAF may not be display-locked).
		const p0 = performance.now();
		await frames(30);
		const rafMs = (performance.now() - p0) / 30;
		const out = import.meta.env.SVELTE_FLUID_GPU_BENCH_OUT;
		if (out) await (commands as unknown as Record<string, (p: string, c: string) => Promise<void>>).writeBenchJson(out, JSON.stringify({ inputToVisibleMs: samples, rafCallbacksToVisible: counts, rafMs }));
		// Two frames at 60 Hz (the frame runs, then the snapshot lands), plus slack.
		expect(samples[samples.length >> 1]).toBeLessThan(50);
	});
});
