/*
 * EnamelText / EnamelEngine on hardware WebGL2 (ADR-0097).
 */
import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EnamelText from '../../EnamelText.svelte';
import { contrastRatio, relativeLuminance } from '../contrast.js';
import { activeFrameSubscribers } from '../frame-scheduler.js';
import { acquireGlHost } from '../gl-host.js';
import { EnamelEngine } from '../enamel/EnamelEngine.js';
import type { EnamelConfig } from '../enamel/EnamelEngine.js';
import { waitForSurfaceSettle } from './renderer.js';

const live: (() => void)[] = [];
afterEach(() => {
	for (const done of live.splice(0)) done();
	document.body.replaceChildren();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const frames = (n: number) =>
	new Promise<void>((r) => {
		const f = () => (n-- <= 0 ? r() : requestAnimationFrame(f));
		f();
	});

/** A 96 px bold heading with a bare EnamelEngine over it. */
function engine(config: EnamelConfig = {}, text = 'Enamel', dpr = 2) {
	const host = document.createElement('div');
	host.style.cssText = 'position:relative;display:inline-block;font:700 96px/1.15 system-ui, sans-serif;padding:0;background:#fff;color:#1a1c21';
	const source = document.createElement('span');
	source.textContent = text;
	const canvas = document.createElement('canvas');
	canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
	host.append(source, canvas);
	document.body.append(host);
	const e = new EnamelEngine({ canvas, source, config: { body: { r: 26, g: 28, b: 33 }, page: { r: 255, g: 255, b: 255 }, ...config } });
	const r = host.getBoundingClientRect();
	e.resize(r.width, r.height, dpr);
	live.push(() => e.dispose());
	return { e, host, canvas, source, css: r };
}

function pixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
	const copy = document.createElement('canvas');
	copy.width = canvas.width;
	copy.height = canvas.height;
	const ctx = copy.getContext('2d')!;
	ctx.drawImage(canvas, 0, 0);
	return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

const total = (a: Float32Array) => {
	let s = 0;
	for (const v of a) s += v;
	return s;
};

/** A point inside the broad stem of the "E": the first column with solid coverage near mid-height. */
function stem(e: EnamelEngine): { x: number; y: number } {
	const m = e.readModel();
	const g = e.grid;
	const j = Math.floor(m.rows / 2);
	for (let i = 0; i < m.cols; i++) {
		let ok = true;
		for (let k = 0; k < 4; k++) if (m.rest[j * m.cols + i + k] < 0.3) ok = false;
		if (ok) return { x: (i + 2.5) * g.cell, y: (m.rows - j - 0.5) * g.cell };
	}
	throw new Error('no stem');
}

describe('EnamelEngine', () => {
	it('compiles every program and presents shaded glyphs with no GL error', async () => {
		const { e, canvas } = engine();
		await e.advance(1);
		const px = pixels(canvas);
		let covered = 0;
		for (let i = 3; i < px.length; i += 4) if (px[i] > 200) covered++;
		expect(covered).toBeGreaterThan(canvas.width * canvas.height * 0.08);
		expect(px[3]).toBe(0);
		const gl = acquireGlHost(e).gl;
		expect(gl.getError()).toBe(gl.NO_ERROR);
	});

	it('conserves mass within 1e-5 relative over 500 steps with presses', async () => {
		const { e, css } = engine();
		await e.advance(1);
		const m0 = total(e.readModel().height);
		for (let i = 0; i < 125; i++) {
			if (i % 25 === 0) e.press(css.width * (0.1 + 0.15 * (i / 25)), css.height * 0.5, 1 + (i % 3) * 0.25);
			if (i % 25 === 15) e.release();
			// 4 substeps per 1/60 s frame: 125 frames = 500 steps.
			await e.advance(1);
		}
		const m1 = total(e.readModel().height);
		const rel = Math.abs(m1 - m0) / m0;
		console.log(`enamel mass: m0=${m0} m1=${m1} rel=${rel.toExponential(3)}`);
		expect(rel).toBeLessThan(1e-5);
	});

	it('a press dents the surface, then it relaxes to rest; the silhouette never moves', async () => {
		const { e, canvas } = engine();
		await e.advance(1);
		const before = pixels(canvas);
		const p = stem(e);
		const g = e.grid;
		const cell = (m: ReturnType<EnamelEngine['readModel']>) => {
			const i = Math.floor(p.x / g.cell);
			const j = m.rows - 1 - Math.floor(p.y / g.cell);
			return m.height[j * m.cols + i] - m.rest[j * m.cols + i];
		};
		e.press(p.x, p.y);
		await e.advance(15);
		const dent = cell(e.readModel());
		const pressed = pixels(canvas);
		e.release();
		await e.advance(20);
		const relaxing = cell(e.readModel());
		await e.advance(Math.ceil(3 * 60));
		const settled = cell(e.readModel());
		const after = pixels(canvas);
		console.log(`enamel dent: held 250 ms ${dent.toFixed(4)}, 330 ms after release ${relaxing.toFixed(4)}, settled ${settled}`);
		expect(dent).toBeLessThan(-0.08);
		expect(Math.abs(relaxing)).toBeLessThan(Math.abs(dent));
		expect(Math.abs(settled)).toBeLessThan(1e-6);
		// Silhouette: alpha is coverage, identical before, during and after.
		let moved = 0;
		let shaded = 0;
		for (let i = 0; i < before.length; i += 4) {
			if (before[i + 3] !== pressed[i + 3] || before[i + 3] !== after[i + 3]) moved++;
			if (Math.abs(before[i] - pressed[i]) > 3) shaded++;
		}
		expect(moved).toBe(0);
		expect(shaded).toBeGreaterThan(200);
		expect(e.running).toBe(false);
	});

	it('every opaque glyph pixel keeps the contrast budget against the page, pressed or not', async () => {
		for (const [body, page] of [
			[{ r: 35, g: 50, b: 79 }, { r: 242, g: 240, b: 235 }],
			[{ r: 216, g: 195, b: 154 }, { r: 11, g: 13, b: 18 }],
			// A body colour that fails on its own: the shader moves it into the band.
			[{ r: 150, g: 150, b: 150 }, { r: 255, g: 255, b: 255 }]
		] as const) {
			const { e, canvas, css } = engine({ body, page, tone: page.r > 128 ? 'light' : 'dark' });
			e.press(css.width * 0.12, css.height * 0.55);
			await e.advance(20);
			const px = pixels(canvas);
			const lum = (r: number, g: number, b: number) => relativeLuminance(r / 255, g / 255, b / 255);
			const lp = lum(page.r, page.g, page.b);
			let worst = Infinity;
			for (let i = 0; i < px.length; i += 4) if (px[i + 3] === 255) worst = Math.min(worst, contrastRatio(lum(px[i], px[i + 1], px[i + 2]), lp));
			console.log(`enamel contrast: body ${JSON.stringify(body)} worst ${worst.toFixed(2)}`);
			expect(worst).toBeGreaterThanOrEqual(3);
			e.dispose();
		}
	});

	it('reduced motion: the static relief, no presses, no frames once drawn', async () => {
		const { e, css, canvas } = engine({ reducedMotion: true });
		await e.advance(1);
		const still = pixels(canvas);
		e.press(css.width * 0.12, css.height * 0.55);
		expect(e.running).toBe(false);
		await e.advance(10);
		const m = e.readModel();
		for (let k = 0; k < m.height.length; k++) expect(m.height[k]).toBe(Math.max(0, m.rest[k]));
		expect(pixels(canvas)).toEqual(still);
		// Turning reduced motion on mid-press snaps to the rest still.
		e.setConfig({ reducedMotion: false });
		e.press(css.width * 0.12, css.height * 0.55);
		await e.advance(10);
		e.setConfig({ reducedMotion: true });
		await e.advance(1);
		expect(pixels(canvas)).toEqual(still);
	});

	it('schedules nothing at rest or offscreen', async () => {
		const { e, css } = engine();
		await frames(3);
		expect(e.running).toBe(false);
		expect(activeFrameSubscribers()).toBe(0);
		e.press(css.width * 0.12, css.height * 0.55);
		expect(e.running).toBe(true);
		e.setVisible(false);
		expect(e.running).toBe(false);
		expect(activeFrameSubscribers()).toBe(0);
		e.setVisible(true);
		e.release();
		await waitForSurfaceSettle(activeFrameSubscribers, 4000);
	});

	it('undefined config fields keep their resolved values', async () => {
		const { e } = engine({ tone: 'dark', body: { r: 216, g: 195, b: 154 }, page: { r: 11, g: 13, b: 18 } });
		await e.advance(1);
		const a = pixels(e.canvas);
		e.setConfig({ tone: undefined, body: undefined, page: undefined, reducedMotion: undefined });
		await e.advance(1);
		expect(pixels(e.canvas)).toEqual(a);
	});

	it('survives context loss and restore through gl-host callbacks', async () => {
		const lost = vi.fn();
		const restored = vi.fn();
		const host = document.createElement('div');
		host.style.cssText = 'position:relative;display:inline-block;font:700 96px/1.15 system-ui';
		const source = document.createElement('span');
		source.textContent = 'Enamel';
		const canvas = document.createElement('canvas');
		canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
		host.append(source, canvas);
		document.body.append(host);
		const e = new EnamelEngine({ canvas, source, onContextLost: lost, onContextRestored: restored });
		live.push(() => e.dispose());
		const r = host.getBoundingClientRect();
		e.resize(r.width, r.height, 2);
		await e.advance(1);
		const before = pixels(canvas);
		const gl = acquireGlHost(e).gl;
		const lose = gl.getExtension('WEBGL_lose_context')!;
		const lostEvent = new Promise((res) => gl.canvas.addEventListener('webglcontextlost', res, { once: true }));
		lose.loseContext();
		await lostEvent;
		expect(lost).toHaveBeenCalledOnce();
		expect(e.running).toBe(false);
		await new Promise((res) => setTimeout(res, 0));
		const restoredEvent = new Promise((res) => gl.canvas.addEventListener('webglcontextrestored', res, { once: true }));
		lose.restoreContext();
		await restoredEvent;
		expect(restored).toHaveBeenCalledOnce();
		await e.advance(1);
		expect(pixels(canvas)).toEqual(before);
		expect(gl.getError()).toBe(gl.NO_ERROR);
	});

	it('dispose releases the shared host and is idempotent', async () => {
		const { e } = engine();
		await e.advance(1);
		const gl = acquireGlHost(e).gl;
		e.dispose();
		expect(gl.isContextLost()).toBe(true);
		expect(activeFrameSubscribers()).toBe(0);
		e.dispose();
	});
});

describe('EnamelText', () => {
	function heading(props: Record<string, unknown> = {}) {
		const target = document.createElement('h1');
		target.style.cssText = 'font:700 96px/1.1 system-ui;background:#f2f0eb;color:#23324f;margin:0';
		document.body.append(target);
		const app = mount(EnamelText, { target, props: { text: 'Enamel', ...props } });
		live.push(() => void unmount(app));
		return target;
	}

	it('keeps native, selectable, unfocusable DOM text; it turns transparent only once drawn', async () => {
		const h = heading();
		const root = h.querySelector<HTMLElement>('.enamel-text')!;
		const source = root.querySelector<HTMLElement>('.source')!;
		expect(getComputedStyle(source).color).not.toBe('rgba(0, 0, 0, 0)');
		await vi.waitFor(() => expect(root.classList.contains('live')).toBe(true), { timeout: 4000 });
		expect(getComputedStyle(source).color).toBe('rgba(0, 0, 0, 0)');
		expect(h.textContent).toBe('Enamel');
		expect(root.tabIndex).toBe(-1);
		expect(root.getAttribute('role')).toBeNull();
		expect(root.querySelector('canvas')!.getAttribute('aria-hidden')).toBe('true');
		expect(getComputedStyle(source).userSelect).not.toBe('none');
		getSelection()!.selectAllChildren(source);
		expect(getSelection()!.toString()).toBe('Enamel');
		getSelection()!.removeAllRanges();
		// Observe only: a press is never prevented (selection and scrolling stay native).
		const down = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 30, clientY: 50, pointerId: 3, button: 0 });
		source.dispatchEvent(down);
		expect(down.defaultPrevented).toBe(false);
		expect(activeFrameSubscribers()).toBeGreaterThan(0);
		window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 3 }));
		await waitForSurfaceSettle(activeFrameSubscribers, 4000);
	});

	it('shows plain text when float colour buffers are unavailable', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const original = WebGL2RenderingContext.prototype.getExtension;
		vi.spyOn(WebGL2RenderingContext.prototype, 'getExtension').mockImplementation(function (this: WebGL2RenderingContext, name: string) {
			return name === 'EXT_color_buffer_float' ? null : original.call(this, name);
		} as typeof original);
		const h = heading();
		await frames(4);
		const root = h.querySelector<HTMLElement>('.enamel-text')!;
		expect(root.classList.contains('live')).toBe(false);
		expect(getComputedStyle(root.querySelector('.source')!).color).toBe('rgb(35, 50, 79)');
		expect(getComputedStyle(root.querySelector('canvas')!).visibility).toBe('hidden');
		expect(activeFrameSubscribers()).toBe(0);
	});

	it('reduced motion: drawn once, presses schedule nothing', async () => {
		vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
		const h = heading();
		const root = h.querySelector<HTMLElement>('.enamel-text')!;
		await vi.waitFor(() => expect(root.classList.contains('live')).toBe(true), { timeout: 4000 });
		await waitForSurfaceSettle(activeFrameSubscribers, 4000);
		root.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 30, clientY: 50, pointerId: 4, button: 0 }));
		await frames(2);
		expect(activeFrameSubscribers()).toBe(0);
	});
});
