/*
 * Height-field surface and liquid controls on hardware WebGL2 (ADR-0091/0092).
 */
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LiquidButton from '../../LiquidButton.svelte';
import LiquidSegmented from '../../LiquidSegmented.svelte';
import { activeFrameSubscribers } from '../frame-scheduler.js';
import { acquireGlHost, releaseGlHost } from '../gl-host.js';
import { SurfaceEngine } from '../surface/SurfaceEngine.js';
import type { SurfaceConfig } from '../surface/SurfaceEngine.js';
import { mottle } from './surface-mottle.js';

const live: (() => void)[] = [];
afterEach(() => {
	for (const done of live.splice(0)) done();
	document.body.replaceChildren();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const PILL: SurfaceConfig = { control: 'button', tone: 'light', rect: { x: 6, y: 6, width: 220, height: 56 }, radius: 28 };

function engine(config: SurfaceConfig = PILL, css = { w: 232, h: 68 }, dpr = 2): SurfaceEngine {
	const canvas = document.createElement('canvas');
	canvas.style.cssText = `width:${css.w}px;height:${css.h}px`;
	document.body.append(canvas);
	const e = new SurfaceEngine({ canvas, config });
	e.resize(css.w, css.h, dpr);
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

const frames = (n: number) =>
	new Promise<void>((r) => {
		const f = () => (n-- <= 0 ? r() : requestAnimationFrame(f));
		f();
	});
const settle = async (e: SurfaceEngine, max = 240) => {
	for (let i = 0; i < max && e.running; i++) await frames(1);
};

function stubReducedMotion(initial: boolean) {
	let matches = initial;
	const listeners = new Set<() => void>();
	vi.stubGlobal('matchMedia', (query: string) => ({
		get matches() {
			return query.includes('prefers-reduced-motion') ? matches : false;
		},
		media: query,
		addEventListener: (_: string, l: () => void) => listeners.add(l),
		removeEventListener: (_: string, l: () => void) => listeners.delete(l)
	}));
	return (v: boolean) => {
		matches = v;
		for (const l of [...listeners]) l();
	};
}

describe('SurfaceEngine', () => {
	it('compiles every program and presents a filled pill with no GL error', async () => {
		const e = engine();
		await e.advance(1);
		const px = pixels(e.canvas);
		const at = (x: number, y: number) => px.slice((y * e.canvas.width + x) * 4, (y * e.canvas.width + x) * 4 + 4);
		// Centre is opaque control fill; the corner outside the pill is transparent.
		expect(at(232, 68)[3]).toBe(255);
		expect(at(232, 68)[2]).toBeGreaterThan(at(232, 68)[0]);
		expect(at(4, 4)[3]).toBe(0);
		const host = acquireGlHost(e);
		expect(host.gl.getError()).toBe(host.gl.NO_ERROR);
	});

	it('a press ripples out from the contact point', async () => {
		const e = engine();
		await e.advance(1);
		e.press(60, 34);
		await e.advance(8);
		const h = e.readHeight();
		const at = (x: number, y: number) => h.data[Math.floor(68 - y) * h.cols + Math.floor(x)];
		// Wave energy is near the press, the far end is still flat.
		const near = Math.max(...[-12, -6, 0, 6, 12].map((d) => Math.abs(at(60 + d, 34))));
		expect(near).toBeGreaterThan(0.02);
		expect(Math.abs(at(200, 34))).toBeLessThan(near / 10);
		const farBefore = Math.abs(at(200, 34));
		await e.advance(24);
		expect(Math.abs(e.readHeight().data[34 * h.cols + 200])).toBeGreaterThan(farBefore);
	});

	it('the focus ring follows the pill SDF', async () => {
		const e = engine({ ...PILL, focus: true });
		await e.advance(1);
		const px = pixels(e.canvas);
		const w = e.canvas.width;
		const alpha = (x: number, y: number) => px[(y * w + x) * 4 + 3];
		// DPR 2: the ring band is 2–4 CSS px outside the control (4–8 device px).
		// Straight edge: above the top edge at x = centre.
		expect(alpha(232, 12 - 6)).toBeGreaterThan(200);
		// Rounded end: along the 45° diagonal from the left cap centre (34, 34) CSS px.
		const cx = 34 * 2;
		const cy = 34 * 2;
		const r = (28 + 3) * 2 / Math.SQRT2;
		expect(alpha(Math.round(cx - r), Math.round(cy - r))).toBeGreaterThan(150);
		// A rectangle ring would put ink at the bounding-box corner; the SDF ring does not.
		expect(alpha(12 - 6, 12 - 6)).toBe(0);
		// Unfocused: no ring at all.
		e.setConfig({ focus: false });
		await e.advance(1);
		expect(pixels(e.canvas)[((12 - 6) * w + 232) * 4 + 3]).toBe(0);
	});

	it('moving the lens target sloshes the liquid across and settles', async () => {
		const lens = (x: number) => ({ x, y: 6, width: 120, height: 56 });
		const e = engine({ control: 'segmented', tone: 'dark', rect: { x: 6, y: 6, width: 360, height: 56 }, radius: 28, lens: lens(6) }, { w: 372, h: 68 });
		await e.advance(2);
		const peakX = () => {
			const h = e.readHeight();
			let best = 0;
			let bx = 0;
			for (let x = 0; x < h.cols; x++) {
				const v = h.data[34 * h.cols + x];
				if (v > best) [best, bx] = [v, x];
			}
			return bx;
		};
		expect(peakX()).toBeLessThan(120);
		e.setConfig({ lens: lens(246) });
		const track: number[] = [];
		for (let i = 0; i < 30; i++) {
			await e.advance(1);
			track.push(peakX());
		}
		// The crest travels: it is seen over the middle option on the way.
		expect(track.some((x) => x > 130 && x < 240)).toBe(true);
		await e.advance(30);
		expect(peakX()).toBeGreaterThan(246);
		await settle(e);
		expect(e.running).toBe(false);
	});

	it('a light-theme slosh shades smoothly: fine texture stays within the dither floor', async () => {
		// Metric (surface-mottle.ts): RMS of 8-bit luminance minus its 7×7 mean over
		// the track span the lens leaves and crosses (Day–Week), i.e. texture finer
		// than ~3 CSS px. Wave shading is broader and passes the box mean.
		// Floor: ±1 LSB blue-noise dither alone measures 0.25–0.65 on a flat field,
		// depending on where the fill sits between 8-bit codes (measured on this
		// track: 0.25 at the opening frame, 0.62 settled). The rejected build (383cf6c)
		// measures 0.86 in this exact slosh and fails; the shipped one ≈0.44. Gate 0.7: above
		// the worst pure-dither field, below the rejected texture.
		const rect = { x: 6, y: 6, width: 360, height: 56 };
		const wake = { x: 6, y: 6, width: 240, height: 56 };
		const lens = (x: number) => ({ x, y: 6, width: 120, height: 56 });
		const e = engine({ control: 'segmented', tone: 'light', rect, radius: 28, lens: lens(6) }, { w: 372, h: 68 }, 2);
		await e.advance(2);
		e.setConfig({ lens: lens(246) });
		let worst = 0;
		for (let i = 0; i < 40; i++) {
			await e.advance(1);
			worst = Math.max(worst, mottle(e.canvas, 2, wake));
		}
		expect(worst).toBeLessThan(0.7);
		await settle(e);
		// Settled: a flat field again (the settle frame drops the residual ripple),
		// so 8-bit values under the wake differ by at most the ±1 LSB dither.
		const copy = document.createElement('canvas');
		copy.width = e.canvas.width;
		copy.height = e.canvas.height;
		const ctx = copy.getContext('2d')!;
		ctx.drawImage(e.canvas, 0, 0);
		const row = ctx.getImageData(120, 68, 280, 1).data;
		const g = Array.from({ length: 280 }, (_, i) => row[i * 4 + 1]);
		expect(Math.max(...g) - Math.min(...g)).toBeLessThanOrEqual(2);
	});

	it('unsubscribes once settled and when offscreen', async () => {
		const e = engine();
		await settle(e);
		expect(e.running).toBe(false);
		expect(activeFrameSubscribers()).toBe(0);
		e.press(100, 30);
		expect(e.running).toBe(true);
		e.setVisible(false);
		expect(e.running).toBe(false);
		e.setVisible(true);
		await settle(e);
		expect(e.running).toBe(false);
		expect(activeFrameSubscribers()).toBe(0);
	});

	it('reduced motion ignores presses and snaps the lens to its settled still', async () => {
		const lens = (x: number) => ({ x, y: 6, width: 120, height: 56 });
		const e = engine({ control: 'segmented', tone: 'light', rect: { x: 6, y: 6, width: 360, height: 56 }, radius: 28, lens: lens(6), reducedMotion: true }, { w: 372, h: 68 });
		await settle(e);
		e.press(100, 30);
		expect(e.running).toBe(false);
		e.setConfig({ lens: lens(246) });
		await e.advance(1);
		const h = e.readHeight();
		// One frame later the lens is fully under the new option and nothing else moves.
		expect(h.data[34 * h.cols + 306]).toBeGreaterThan(1);
		expect(Math.abs(h.data[34 * h.cols + 66])).toBeLessThan(1e-3);
		await frames(2);
		expect(e.running).toBe(false);
	});

	it('resizing resamples the field instead of resetting it', async () => {
		const e = engine();
		await e.advance(1);
		e.press(116, 34);
		await e.advance(4);
		const before = e.readHeight();
		const peak = Math.max(...before.data.map(Math.abs));
		e.resize(300, 68, 2);
		e.setConfig({ rect: { x: 6, y: 6, width: 288, height: 56 } });
		await e.advance(1);
		const after = e.readHeight();
		expect(after.cols).toBe(300);
		expect(Math.max(...after.data.map(Math.abs))).toBeGreaterThan(peak * 0.3);
	});

	it('survives context loss and restore through gl-host callbacks', async () => {
		const lost = vi.fn();
		const restored = vi.fn();
		const canvas = document.createElement('canvas');
		document.body.append(canvas);
		const e = new SurfaceEngine({ canvas, config: PILL, onContextLost: lost, onContextRestored: restored });
		live.push(() => e.dispose());
		e.resize(232, 68, 2);
		await e.advance(1);
		const host = acquireGlHost(e);
		const lose = host.gl.getExtension('WEBGL_lose_context')!;
		const surface = host.gl.canvas;
		const lostEvent = new Promise((r) => surface.addEventListener('webglcontextlost', r, { once: true }));
		lose.loseContext();
		await lostEvent;
		expect(lost).toHaveBeenCalledOnce();
		expect(e.running).toBe(false);
		e.press(50, 30);
		expect(e.running).toBe(false);
		await new Promise((r) => setTimeout(r, 0));
		const restoredEvent = new Promise((r) => surface.addEventListener('webglcontextrestored', r, { once: true }));
		lose.restoreContext();
		await restoredEvent;
		expect(restored).toHaveBeenCalledOnce();
		await e.advance(1);
		expect(pixels(e.canvas)[(68 * e.canvas.width + 232) * 4 + 3]).toBe(255);
		expect(host.gl.getError()).toBe(host.gl.NO_ERROR);
	});

	it('dispose releases the shared host', async () => {
		const e = engine();
		await e.advance(1);
		const gl = acquireGlHost(e).gl;
		e.dispose();
		// The engine was the only instance: the host lost its context on final release.
		expect(gl.isContextLost()).toBe(true);
		expect(activeFrameSubscribers()).toBe(0);
		e.dispose();
	});

	it('B-spline reconstruction removes the grid banding of the bilinear-normal prototype', async () => {
		const e = engine(PILL, { w: 232, h: 68 }, 3);
		await e.advance(1);
		e.press(60, 34);
		await e.advance(10);
		// Banding metric: 99th percentile |row-to-row second difference| of the slope
		// across the wake, per device px (grid cells span 3 px). Smooth wave curvature
		// is common to both; slope kinks at cell boundaries are the bands, and they
		// are what the tail measures.
		const metric = (probe: 'bspline' | 'bilinear') => {
			const { width, data } = e.readSlope(probe);
			const all: number[] = [];

			for (let x = 150; x < 330; x += 3)
				for (let y = 40; y < 164; y++) {
					const g = (yy: number) => data[(yy * width + x) * 4 + 2];
					const d = Math.abs(g(y + 1) - 2 * g(y) + g(y - 1));
					all.push(d);
				}
			all.sort((a, b) => a - b);
			return all[Math.floor(all.length * 0.99)];
		};
		const shipped = metric('bspline');
		const prototype = metric('bilinear');
		expect(prototype).toBeGreaterThan(0);
		expect(shipped).toBeLessThan(prototype * 0.5);
	});
});

describe('LiquidButton', () => {
	const label = createRawSnippet(() => ({ render: () => '<span>Save changes</span>' }));
	function button(props: Record<string, unknown> = {}) {
		const target = document.createElement('div');
		document.body.append(target);
		const app = mount(LiquidButton, { target, props: { children: label, tone: 'light', style: 'width:220px;height:56px', ...props } });
		live.push(() => void unmount(app));
		return target.querySelector('button')!;
	}

	it('is a native button: type, forwarded attributes, aria-hidden decorative canvas', async () => {
		const onclick = vi.fn();
		const b = button({ onclick, 'aria-describedby': 'hint', name: 'save' });
		await frames(2);
		expect(b.type).toBe('button');
		expect(b.getAttribute('aria-describedby')).toBe('hint');
		expect(b.name).toBe('save');
		const canvas = b.querySelector('canvas')!;
		expect(canvas.getAttribute('aria-hidden')).toBe('true');
		expect(getComputedStyle(canvas).pointerEvents).toBe('none');
		expect(b.textContent).toContain('Save changes');
		expect(b.classList.contains('live')).toBe(true);
		await userEvent.click(b);
		expect(onclick).toHaveBeenCalledOnce();
		expect(button({ type: 'submit' }).type).toBe('submit');
	});

	it('Enter and Space activate natively and ripple from the centre', async () => {
		const onclick = vi.fn();
		const b = button({ onclick });
		await frames(3);
		b.focus();
		await userEvent.keyboard('{Enter}');
		await userEvent.keyboard(' ');
		expect(onclick).toHaveBeenCalledTimes(2);
		expect(activeFrameSubscribers()).toBeGreaterThan(0);
	});

	it('throwing forwarded handlers still ripple and are logged once each', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		const boom = () => { throw new Error('consumer'); };
		const b = button({ onpointerdown: boom, onkeydown: boom });
		await frames(3);
		await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(0), { timeout: 4000 });
		b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 20, clientY: 20 }));
		expect(activeFrameSubscribers()).toBeGreaterThan(0);
		expect(err).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(0), { timeout: 4000 });
		b.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
		expect(activeFrameSubscribers()).toBeGreaterThan(0);
		expect(err).toHaveBeenCalledTimes(2);
	});

	it('shows the plain native button when the shared host is unavailable', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
		const b = button();
		await frames(2);
		expect(b.classList.contains('live')).toBe(false);
		expect(getComputedStyle(b).backgroundImage).toContain('gradient');
		expect(getComputedStyle(b.querySelector('canvas')!).display).toBe('none');
	});

	it('under reduced motion presses schedule no frames once settled', async () => {
		stubReducedMotion(true);
		const b = button();
		await frames(6);
		await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(0), { timeout: 4000 });
		await userEvent.click(b);
		await frames(2);
		expect(activeFrameSubscribers()).toBe(0);
	});
});

describe('LiquidSegmented', () => {
	const OPTIONS = [
		{ value: 'day', label: 'Day' },
		{ value: 'week', label: 'Week' },
		{ value: 'month', label: 'Month' }
	];
	function segmented(props: Record<string, unknown> = {}) {
		const target = document.createElement('div');
		document.body.append(target);
		const app = mount(LiquidSegmented, { target, props: { options: OPTIONS, value: 'day', name: 'range', legend: 'Range', tone: 'dark', ...props } });
		live.push(() => void unmount(app));
		return target.querySelector('fieldset')!;
	}

	it('is a fieldset of native radios with a legend', async () => {
		const f = segmented();
		await frames(2);
		expect(f.querySelector('legend')!.textContent).toBe('Range');
		const radios = f.querySelectorAll<HTMLInputElement>('input[type=radio]');
		expect(radios).toHaveLength(3);
		expect([...radios].map((r) => r.name)).toEqual(['range', 'range', 'range']);
		expect(radios[0].checked).toBe(true);
		expect(f.querySelector('canvas')!.getAttribute('aria-hidden')).toBe('true');
	});

	it('native arrow keys change the selection and slosh the lens', async () => {
		const f = segmented();
		await frames(3);
		await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(0), { timeout: 4000 });
		const radios = f.querySelectorAll<HTMLInputElement>('input');
		radios[0].focus();
		await userEvent.keyboard('{ArrowRight}');
		flushSync();
		expect(radios[1].checked).toBe(true);
		expect(document.activeElement).toBe(radios[1]);
		expect(activeFrameSubscribers()).toBeGreaterThan(0);
		await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(0), { timeout: 4000 });
	});

	it('clicking an option updates the bound value', async () => {
		let value = 'day';
		const target = document.createElement('div');
		document.body.append(target);
		const app = mount(LiquidSegmented, {
			target,
			props: {
				options: OPTIONS,
				name: 'r2',
				legend: 'Range',
				get value() {
					return value;
				},
				set value(v: string | undefined) {
					value = v!;
				}
			}
		});
		live.push(() => void unmount(app));
		await frames(2);
		await userEvent.click(target.querySelectorAll('label')[2]);
		flushSync();
		expect(value).toBe('month');
	});

	it('reduced motion: selection change is a settled still with no frame loop', async () => {
		const set = stubReducedMotion(true);
		const f = segmented();
		await frames(3);
		await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(0), { timeout: 4000 });
		await userEvent.click(f.querySelectorAll('label')[2]);
		flushSync();
		await frames(3);
		expect(activeFrameSubscribers()).toBe(0);
		set(false);
		await frames(2);
		expect(f.querySelectorAll<HTMLInputElement>('input')[2].checked).toBe(true);
	});
});

describe('gl-host sharing', () => {
	it('many controls share one context', async () => {
		const es = Array.from({ length: 12 }, () => engine());
		await Promise.all(es.map((e) => e.advance(1)));
		const gl = acquireGlHost(es[0]).gl;
		for (const e of es) expect(acquireGlHost(e).gl).toBe(gl);
		releaseGlHost(es[0]);
		expect(gl.isContextLost()).toBe(false);
	});
});
