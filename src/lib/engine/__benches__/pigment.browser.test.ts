import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import InkPaper from '../../InkPaper.svelte';
import { activeFrameSubscribers } from '../frame-scheduler.js';
import { PigmentEngine } from '../pigment/PigmentEngine.js';
import type { PigmentEngineOptions } from '../pigment/PigmentEngine.js';
import { bloom } from '../pigment/brush.js';
import type { Dab } from '../pigment/brush.js';

/* ADR-0090: PigmentEngine and InkPaper on hardware WebGL2. */

const PAPER = '#f4ecdc';
const PAPER_RGB = [0xf4, 0xec, 0xdc];
const live: (() => void)[] = [];

afterEach(() => {
	for (const stop of live.splice(0)) stop();
	document.body.replaceChildren();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const frames = (count: number) =>
	new Promise<void>((resolve) => {
		const next = () => (count-- <= 0 ? resolve() : requestAnimationFrame(next));
		next();
	});

function engine(options: Partial<PigmentEngineOptions> = {}): PigmentEngine {
	const canvas = document.createElement('canvas');
	document.body.append(canvas);
	const e = new PigmentEngine({ canvas, paper: PAPER, openingWash: false, seed: 5, ...options });
	live.push(() => e.dispose());
	return e;
}

function hostGl(e: PigmentEngine): WebGL2RenderingContext {
	return (e as unknown as { host: { gl: WebGL2RenderingContext } }).host.gl;
}

/** Visible-canvas pixels via a 2D copy (bitmaprenderer cannot be read directly). */
function pixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
	const copy = document.createElement('canvas');
	copy.width = canvas.width;
	copy.height = canvas.height;
	const ctx = copy.getContext('2d')!;
	ctx.drawImage(canvas, 0, 0);
	return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

function pixelAt(px: Uint8ClampedArray, width: number, x: number, y: number): number[] {
	const i = (Math.floor(y) * width + Math.floor(x)) * 4;
	return [px[i], px[i + 1], px[i + 2]];
}

const near = (a: number[], b: number[], tol: number) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

function sum(field: { data: Float32Array } | null, channel = -1): number {
	let s = 0;
	if (!field) return NaN;
	for (let i = 0; i < field.data.length; i += 4) s += channel < 0 ? field.data[i] + field.data[i + 1] + field.data[i + 2] + field.data[i + 3] : field.data[i + channel];
	return s;
}

describe('PigmentEngine (ADR-0090)', () => {
	it('compiles, paints, dries and reads back at DPR 1, 2 and 3', async () => {
		for (const dpr of [1, 2, 3]) {
			const e = engine({ pigments: ['#2549a8', '#e7b112'] });
			e.resize(200, 120, dpr);
			expect(e.canvas.width).toBe(200 * dpr);
			expect(e.canvas.height).toBe(120 * dpr);
			e.paint(bloom(60, 60, 40, 0, 0.08, 1));
			e.settle();
			await e.lastPresent;
			expect(e.wet).toBe(false);
			expect(sum(e.readField('water'), 0)).toBe(0);
			expect(sum(e.readField('wet'))).toBeLessThan(1e-3);
			expect(sum(e.readField('deposited'), 0)).toBeGreaterThan(1);
			const px = pixels(e.canvas);
			const w = e.canvas.width;
			// Bare paper shows the exact token (±dither); the wash is blue.
			expect(near(pixelAt(px, w, 180 * dpr, 20 * dpr), PAPER_RGB, 4)).toBe(true);
			const [r, , b] = pixelAt(px, w, 60 * dpr, 60 * dpr);
			// Paper is warm (b - r = -24); a blue wash flips the sign.
			expect(b - r).toBeGreaterThan(5);
			expect(hostGl(e).getError()).toBe(hostGl(e).NO_ERROR);
			e.dispose();
		}
	});

	it('keeps resist regions dry', async () => {
		const e = engine({ pigments: ['#b8325a'] });
		e.resize(240, 160, 2);
		const box = { x: 80, y: 50, w: 80, h: 60 };
		e.setResist([box]);
		const flood: Dab[] = [];
		for (let y = 10; y < 160; y += 14) for (let x = 10; x < 240; x += 14) flood.push({ x, y, r: 14, water: 0.5, pigment: [0.08, 0, 0, 0] });
		e.paint(flood);
		e.settle();
		await e.lastPresent;
		const dep = e.readField('deposited')!;
		// Sim rows are bottom-up; sample the resist interior in sim cells.
		const cell = 240 / dep.width;
		let inside = 0;
		let outside = 0;
		for (let j = 0; j < dep.height; j++) {
			for (let i = 0; i < dep.width; i++) {
				const x = (i + 0.5) * cell;
				const y = 160 - (j + 0.5) * cell;
				const v = dep.data[(j * dep.width + i) * 4];
				if (x > box.x + 2 && x < box.x + box.w - 2 && y > box.y + 2 && y < box.y + box.h - 2) inside = Math.max(inside, v);
				else if (x < box.x - 20 || x > box.x + box.w + 20) outside = Math.max(outside, v);
			}
		}
		expect(inside).toBe(0);
		expect(outside).toBeGreaterThan(0.05);
		const px = pixels(e.canvas);
		const w = e.canvas.width;
		for (const [x, y] of [[box.x + 4, box.y + 4], [box.x + box.w / 2, box.y + box.h / 2], [box.x + box.w - 4, box.y + box.h - 4]])
			expect(near(pixelAt(px, w, x * 2, y * 2), PAPER_RGB, 4)).toBe(true);
		expect(near(pixelAt(px, w, 20, 20), PAPER_RGB, 4)).toBe(false);
	});

	it('reduced motion presents only a dry still', async () => {
		const e = engine({ openingWash: true, pigments: ['#2549a8', '#e7b112'] });
		const atPresent: boolean[] = [];
		const inner = e as unknown as { present(): void };
		const present = inner.present.bind(e);
		inner.present = () => {
			atPresent.push(e.wet);
			present();
		};
		e.setStill(true);
		e.resize(320, 200, 1);
		expect(e.wet).toBe(true);
		await vi.waitFor(() => expect(e.wet).toBe(false), { timeout: 20000, interval: 50 });
		await frames(2);
		expect(atPresent.length).toBeGreaterThan(0);
		expect(atPresent.every((wet) => wet === false)).toBe(true);
		expect(sum(e.readField('water'), 0)).toBe(0);
		expect(sum(e.readField('deposited'))).toBeGreaterThan(1);
		expect(e.subscribed).toBe(false);
	});

	it('subscribes no frames when dry, idle or hidden', async () => {
		const e = engine();
		e.resize(160, 100, 1);
		await frames(3);
		expect(e.subscribed).toBe(false);
		expect(activeFrameSubscribers()).toBe(0);
		e.paint(bloom(50, 50, 30, 0, 0.05, 2));
		expect(activeFrameSubscribers()).toBe(1);
		e.setVisible(false);
		expect(activeFrameSubscribers()).toBe(0);
		await frames(3);
		expect(e.wet).toBe(true);
		e.setVisible(true);
		expect(activeFrameSubscribers()).toBe(1);
		e.settle();
		expect(activeFrameSubscribers()).toBe(0);
		// Hot options re-present once, then stop.
		e.setOptions({ paper: '#ffffff' });
		expect(activeFrameSubscribers()).toBe(1);
		await frames(2);
		expect(activeFrameSubscribers()).toBe(0);
		e.setOptions({ paper: undefined, pigments: undefined, seed: undefined });
		expect(activeFrameSubscribers()).toBe(0);
		expect(e.options.paper).toBe('#ffffff');
	});

	it('resamples fields on resize instead of resetting', () => {
		const e = engine();
		e.resize(200, 120, 1);
		e.paint(bloom(60, 60, 30, 0, 0.08, 3));
		e.settle();
		const before = sum(e.readField('deposited'), 0);
		const cells = e.readField('deposited')!.width;
		e.resize(260, 150, 2);
		const after = e.readField('deposited')!;
		expect(after.width).not.toBe(cells);
		// Cells stay 3 CSS px and the painting stays put (top-left anchor), so
		// the same pigment mass survives the resample.
		expect(sum(after, 0)).toBeGreaterThan(before * 0.9);
		expect(sum(after, 0)).toBeLessThan(before * 1.1);
	});

	it('recovers from context loss by replaying strokes to the dry state', async () => {
		const restored = vi.fn();
		const lostCb = vi.fn();
		const e = engine({ onContextRestored: restored, onContextLost: lostCb, pigments: ['#2549a8'] });
		e.resize(200, 120, 1);
		e.paint(bloom(70, 60, 35, 0, 0.08, 4));
		e.settle();
		const before = sum(e.readField('deposited'), 0);
		const gl = hostGl(e);
		const lose = gl.getExtension('WEBGL_lose_context')!;
		const lost = new Promise((r) => gl.canvas.addEventListener('webglcontextlost', r, { once: true }));
		lose.loseContext();
		await lost;
		expect(lostCb).toHaveBeenCalledTimes(1);
		expect(e.isLost).toBe(true);
		expect(e.subscribed).toBe(false);
		await new Promise((r) => setTimeout(r, 0));
		const back = new Promise((r) => gl.canvas.addEventListener('webglcontextrestored', r, { once: true }));
		lose.restoreContext();
		await back;
		expect(restored).toHaveBeenCalledTimes(1);
		expect(e.isLost).toBe(false);
		await vi.waitFor(() => expect(e.wet).toBe(false), { timeout: 20000, interval: 50 });
		const after = sum(e.readField('deposited'), 0);
		expect(after).toBeGreaterThan(before * 0.7);
		expect(after).toBeLessThan(before * 1.3);
		expect(hostGl(e).getError()).toBe(hostGl(e).NO_ERROR);
	});

	it('dispose releases the shared host', () => {
		const e = engine();
		e.resize(100, 80, 1);
		const gl = hostGl(e);
		e.dispose();
		e.dispose();
		// Last registration gone: the host frees its context slot (ADR-0088).
		expect(gl.isContextLost()).toBe(true);
		expect(e.subscribed).toBe(false);
	});
});

describe('InkPaper', () => {
	function host(width = 320, height = 200): HTMLElement {
		const el = document.createElement('div');
		el.style.cssText = `width:${width}px;height:${height}px`;
		document.body.append(el);
		return el;
	}
	const content = createRawSnippet(() => ({
		render: () => `<div style="padding:20px"><h2 data-ink-resist style="margin:0">Dry title</h2><button data-ink-wick="1" style="margin-top:40px">Wick</button></div>`
	}));

	function render(props: Record<string, unknown>) {
		const el = host();
		const app = mount(InkPaper, { target: el, props: { children: content, ...props } });
		live.push(() => {
			void unmount(app);
		});
		flushSync();
		return el;
	}

	it('renders content above an aria-hidden canvas, wicks on focus, idles after', async () => {
		const el = render({ paper: PAPER, pigments: ['#2549a8', '#e7b112'], seed: 3, style: 'height:200px' });
		const root = el.firstElementChild as HTMLElement;
		const canvas = root.querySelector('canvas')!;
		expect(canvas.getAttribute('aria-hidden')).toBe('true');
		expect(getComputedStyle(root).backgroundColor).toBe('rgb(244, 236, 220)');
		expect(root.querySelector('h2')?.textContent).toBe('Dry title');
		await vi.waitFor(() => expect(canvas.width).toBeGreaterThan(0));
		// Opening wash dries, then nothing is subscribed.
		await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(0), { timeout: 30000, interval: 100 });
		(root.querySelector('button') as HTMLButtonElement).focus();
		expect(activeFrameSubscribers()).toBe(1);
		await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(0), { timeout: 30000, interval: 100 });
	});

	it('wicks right up to a pill button outline and keeps the pill dry', async () => {
		const el = host(360, 200);
		const pill = createRawSnippet(() => ({
			render: () =>
				`<button data-ink-resist data-ink-wick="0" style="position:absolute;left:100px;top:60px;width:160px;height:44px;border:0;border-radius:999px;padding:0">Pill</button>`
		}));
		// Any CSS colour: normalised to hex for the spectral solver.
		const app = mount(InkPaper, { target: el, props: { children: pill, paper: 'rgb(244 236 220)', pigments: ['#2549a8'], seed: 21, style: 'width:360px;height:200px' } });
		live.push(() => {
			void unmount(app);
		});
		flushSync();
		const root = el.firstElementChild as HTMLElement;
		const canvas = root.querySelector('canvas')!;
		await vi.waitFor(() => expect(canvas.width).toBe(360), { timeout: 5000 });
		await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(0), { timeout: 30000, interval: 100 });
		const before = pixels(canvas);
		(root.querySelector('button') as HTMLButtonElement).focus();
		await vi.waitFor(() => expect(activeFrameSubscribers()).toBe(0), { timeout: 30000, interval: 100 });
		await new Promise((r) => setTimeout(r, 50));
		const after = pixels(canvas);
		const W = canvas.width;
		const changed = (x: number, y: number) => {
			const a = pixelAt(before, W, x, y);
			const b = pixelAt(after, W, x, y);
			return Math.max(...a.map((v, i) => Math.abs(v - b[i]))) > 6;
		};
		// Pill: 160x44 at (100, 60), radius 22. Lower-left corner arc centre:
		const cx = 122;
		const cy = 82;
		let hits = 0;
		let samples = 0;
		for (let deg = 95; deg <= 175; deg += 5) {
			const a = (deg * Math.PI) / 180;
			samples++;
			// Within 2 CSS px outside the arc (y grows downward on screen).
			for (const d of [0.75, 1.25, 1.75]) {
				if (changed(cx + Math.cos(a) * (22 + d), cy + Math.sin(a) * (22 + d))) {
					hits++;
					break;
				}
			}
		}
		expect(hits / samples).toBeGreaterThan(0.6);
		// Inside the pill (1 px in from its outline): untouched paper.
		const inside = (x: number, y: number) => {
			const ex = Math.max(122 - x, x - 238, 0);
			return Math.hypot(ex, y - 82) < 21;
		};
		let wet = 0;
		for (let y = 60; y < 104; y++)
			for (let x = 100; x < 260; x++) if (inside(x + 0.5, y + 0.5) && !near(pixelAt(after, W, x, y), PAPER_RGB, 3)) wet++;
		expect(wet).toBe(0);
	});

	it('falls back to plain paper with usable content when WebGL2 is unavailable', async () => {
		const original = HTMLCanvasElement.prototype.getContext;
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
			if (type === 'bitmaprenderer' || type === 'webgl2') return null;
			return (original as (...a: unknown[]) => unknown).call(this, type, ...args) as never;
		});
		const el = render({ paper: '#ffffff' });
		const root = el.firstElementChild as HTMLElement;
		expect(getComputedStyle(root.querySelector('canvas')!).display).toBe('none');
		expect(getComputedStyle(root).backgroundColor).toBe('rgb(255, 255, 255)');
		const button = root.querySelector('button') as HTMLButtonElement;
		button.focus();
		expect(document.activeElement).toBe(button);
		expect(activeFrameSubscribers()).toBe(0);
	});
});
