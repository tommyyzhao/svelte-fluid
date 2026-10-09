import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commands } from 'vitest/browser';
import InkPaper from '../../InkPaper.svelte';
import { activeFrameSubscribers } from '../frame-scheduler.js';
import { PigmentEngine } from '../pigment/PigmentEngine.js';
import type { PigmentEngineOptions } from '../pigment/PigmentEngine.js';
import { bloom, MAX_WET_STEPS, MAX_DAB_DELAY } from '../pigment/brush.js';
import type { Dab } from '../pigment/brush.js';
import * as S from '../pigment/shaders.js';
import { glDeadline, waitForSurfaceSettle } from './renderer.js';

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

type Target = { tex: WebGLTexture; w: number; h: number };
type Pair = [Target, Target];
type PressureHook = {
	host: { run(e: PigmentEngine, fn: (gl: WebGL2RenderingContext) => void): boolean };
	f32: boolean;
	fields: { simW: number; simH: number; pressure: Pair; div: Target };
	pass(gl: WebGL2RenderingContext, name: string, shader: string, out: Target[], inputs: Record<string, WebGLTexture | number>): void;
	bindTargets(gl: WebGL2RenderingContext, out: Target[]): void;
	solvePressure(gl: WebGL2RenderingContext, iterations: number): void;
	step(gl: WebGL2RenderingContext): void;
};
const pressureHook = (e: PigmentEngine) => e as unknown as PressureHook;
const OLD_JACOBI = S.JACOBI.replace('(L + R + B + T) * uScale', 'L + R + B + T');
const OLD_SCALE = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uSrc;
out float o;
void main() { o = texture(uSrc, vUv).r * 0.8; }`;
function oldPressure(e: PigmentEngine, gl: WebGL2RenderingContext, iterations: number): void {
	const h = pressureHook(e), f = h.fields;
	const swap = () => f.pressure.reverse();
	h.pass(gl, 'pigment-test-old-scale', OLD_SCALE, [f.pressure[1]], { uSrc: f.pressure[0].tex });
	swap();
	for (let i = 0; i < iterations; i++) {
		h.pass(gl, 'pigment-test-old-jacobi', OLD_JACOBI, [f.pressure[1]], { uP: f.pressure[0].tex, uDiv: f.div.tex });
		swap();
	}
}
function fixedStep(e: PigmentEngine): void {
	pressureHook(e).host.run(e, (gl) => pressureHook(e).step(gl));
}

describe('Pigment pressure pairing (ADR-0104)', () => {
	it('matches scale + single Jacobi at edges, odd counts, fp32 and fp16', () => {
		for (const half of [false, true]) for (const iterations of [1, 2, 15, 16, 17]) {
			const e = engine();
			e.setVisible(false);
			const h = pressureHook(e);
			if (half) h.f32 = false;
			e.resize(51, 33, 2);
			const f = h.fields, gl = hostGl(e);
			const input = new Float32Array(f.simW * f.simH);
			const div = Float32Array.from(input, (_, i) => Math.sin(i * 1.7) * 0.2);
			for (let i = 0; i < input.length; i++) input[i] = Math.cos(i * 0.3) * 0.4;
			const upload = (target: Target, data: Float32Array) => {
				gl.bindTexture(gl.TEXTURE_2D, target.tex);
				gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, f.simW, f.simH, gl.RED, gl.FLOAT, data);
			};
			const read = () => {
				h.bindTargets(gl, [f.pressure[0]]);
				const out = new Float32Array(input.length * 4);
				gl.readPixels(0, 0, f.simW, f.simH, gl.RGBA, gl.FLOAT, out);
				return Float32Array.from(input, (_, i) => out[i * 4]);
			};
			h.host.run(e, () => {
				upload(f.pressure[0], input); upload(f.div, div);
				oldPressure(e, gl, iterations); const old = read();
				upload(f.pressure[0], input);
				const draw = vi.spyOn(gl, 'drawElements');
				h.solvePressure(gl, iterations);
				expect(draw).toHaveBeenCalledTimes(Math.ceil(iterations / 2)); draw.mockRestore();
				const next = read();
				// fp16 unit roundoff is 2^-11; omitted scale/intermediate stores
				// accumulate across <=17 nonexpansive stencil iterations. 0.002
				// absolute covers this bounded |p|<0.4 fixture, not arbitrary fields.
				const tolerance = half ? 0.002 : 0.000002;
				for (let i = 0; i < old.length; i++) expect(Math.abs(old[i] - next[i])).toBeLessThan(tolerance);
				expect(gl.getError()).toBe(gl.NO_ERROR);
			});
			e.dispose();
		}
	});

	it('conserves pigment during settling/evaporation with transport disabled', () => {
		const e = engine(); e.setVisible(false); e.resize(48, 36, 2);
		const h = pressureHook(e);
		const fields = h.fields as unknown as { simW: number; simH: number; vel: Pair; water: Pair; susp: Pair; dep: Pair; paper: Target };
		const inner = e as unknown as { landDabs(gl: WebGL2RenderingContext, f: unknown, dabs: Dab[]): void; resistInputs(cell: number): Record<string, unknown> };
		h.host.run(e, (gl) => {
			inner.landDabs(gl, fields, [{ x: 24, y: 18, r: 8, water: 0.3, pigment: [0.2, 0.1, 0.05, 0] }]);
			const before = sum(e.readField('wet')) + sum(e.readField('deposited'));
			const pass = h.pass as unknown as (gl: WebGL2RenderingContext, name: string, shader: string, out: Target[], inputs: Record<string, unknown>) => void;
			for (let i = 0; i < 10; i++) {
				pass.call(h, gl, 'pigment-test-transfer', S.TRANSPORT, [fields.water[1], fields.susp[1], fields.dep[1]], {
					uVel: fields.vel[0].tex, uWater: fields.water[0].tex, uSusp: fields.susp[0].tex, uDep: fields.dep[0].tex,
					uPaper: fields.paper.tex, ...inner.resistInputs(3), uDiffuse: 0, uHold: 0.01, uPin: 0.3,
					uEdgeEvap: 9, uEvap: i === 9 ? 10 : 0.003, uWetDry: 0.04,
					uSettle: ['4f', [0.004, 0.003, 0.004, 0.004]], uGran: ['4f', [0.9, 0.2, 0.35, 0.5]], uLift: ['4f', [0.004, 0.01, 0.004, 0.004]]
				});
				fields.water.reverse(); fields.susp.reverse(); fields.dep.reverse();
				expect(Math.abs(sum(e.readField('wet')) + sum(e.readField('deposited')) - before)).toBeLessThan(before * 0.000001);
			}
			expect(sum(e.readField('wet'))).toBe(0);
		});
	});

	it('preserves wet/dry mass, resist, resize/replay determinism and sibling isolation', () => {
		const make = (legacy = false) => {
			const e = engine(); e.setVisible(false); e.resize(120, 90, 2);
			e.setResist([{ x: 75, y: 30, w: 30, h: 30 }]);
			if (legacy) pressureHook(e).solvePressure = (gl, iterations) => oldPressure(e, gl, iterations);
			e.paint([{ x: 42, y: 45, r: 28, water: 0.3, pigment: [0.2, 0.1, 0, 0], vx: 2 }]);
			return e;
		};
		const a = make(), b = make(true), replay = make(), sibling = make();
		const same = (x: PigmentEngine, y: PigmentEngine, tolerance: number) => {
			for (const field of ['water', 'wet', 'deposited'] as const) {
				const left = x.readField(field)!, right = y.readField(field)!;
				for (let i = 0; i < left.data.length; i++) expect(Math.abs(left.data[i] - right.data[i])).toBeLessThanOrEqual(tolerance);
			}
		};
		for (let i = 0; i < 30; i++) { fixedStep(a); fixedStep(b); fixedStep(replay); }
		same(a, b, 0.00001); same(a, replay, 0);
		const mass = (e: PigmentEngine) => sum(e.readField('wet')) + sum(e.readField('deposited'));
		expect(Math.abs(mass(a) - mass(b))).toBeLessThan(mass(b) * 0.00001);
		const frozen = sibling.readField('water')!.data.slice();
		a.resize(150, 105, 2); b.resize(150, 105, 2); replay.resize(150, 105, 2);
		a.settle(); b.settle(); replay.settle();
		same(a, b, 0.00001); same(a, replay, 0);
		expect(sibling.readField('water')!.data).toEqual(frozen);
		expect(mass(a)).toBeGreaterThan(1);
		expect(sum(a.readField('water'), 0)).toBe(0);
		expect(sum(a.readField('wet'))).toBe(0);
		const dep = a.readField('deposited')!;
		for (let y = 0; y < dep.height; y++) for (let x = 0; x < dep.width; x++) {
			const cssX = (x + 0.5) * 150 / dep.width, cssY = 105 - (y + 0.5) * 105 / dep.height;
			if (cssX > 79 && cssX < 101 && cssY > 34 && cssY < 56) expect(dep.data[(y * dep.width + x) * 4]).toBe(0);
		}
	});
});

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
		await vi.waitFor(() => expect(e.wet).toBe(false), { timeout: glDeadline(20000), interval: 50 });
		await frames(2);
		expect(atPresent.length).toBeGreaterThan(0);
		expect(atPresent.every((wet) => wet === false)).toBe(true);
		expect(sum(e.readField('water'), 0)).toBe(0);
		expect(sum(e.readField('deposited'))).toBeGreaterThan(1);
		expect(e.subscribed).toBe(false);
	}, glDeadline(60_000));

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
		e.setVisible(false);
		e.resize(200, 120, 1);
		e.paint(bloom(70, 60, 35, 0, 0.08, 4));
		e.settle();
		const original = e.readField('deposited')!.data.slice();
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
		e.settle();
		expect(e.wet).toBe(false);
		const replayed = e.readField('deposited')!.data;
		for (let i = 0; i < original.length; i++) expect(Math.abs(original[i] - replayed[i])).toBeLessThanOrEqual(0.000001);
		const after = sum(e.readField('deposited'), 0);
		expect(Math.abs(after - before)).toBeLessThan(before * 0.000001);
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
		await waitForSurfaceSettle(activeFrameSubscribers, 30000, MAX_WET_STEPS + MAX_DAB_DELAY, 100);
		(root.querySelector('button') as HTMLButtonElement).focus();
		expect(activeFrameSubscribers()).toBe(1);
		await waitForSurfaceSettle(activeFrameSubscribers, 30000, MAX_WET_STEPS + MAX_DAB_DELAY, 100);
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
		await waitForSurfaceSettle(activeFrameSubscribers, 30000, MAX_WET_STEPS + MAX_DAB_DELAY, 100);
		const before = pixels(canvas);
		(root.querySelector('button') as HTMLButtonElement).focus();
		await waitForSurfaceSettle(activeFrameSubscribers, 30000, MAX_WET_STEPS + MAX_DAB_DELAY, 100);
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

	it('a drag on bare paper paints without selecting; a drag on text selects without painting', async () => {
		const text = createRawSnippet(() => ({
			render: () => `<div style="padding:20px"><p id="copy" style="margin:0;width:200px">Selectable paragraph text</p></div>`
		}));
		const el = host(400, 260);
		const app = mount(InkPaper, { target: el, props: { children: text, paper: PAPER, pigments: ['#2549a8'], seed: 4, style: 'width:400px;height:260px' } });
		live.push(() => {
			void unmount(app);
		});
		flushSync();
		const root = el.firstElementChild as HTMLElement;
		const canvas = root.querySelector('canvas')!;
		await vi.waitFor(() => expect(canvas.width).toBeGreaterThan(0));
		await waitForSurfaceSettle(activeFrameSubscribers, 30000, MAX_WET_STEPS + MAX_DAB_DELAY, 100);
		const dark = () => {
			const px = pixels(canvas);
			let n = 0;
			for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i] - PAPER_RGB[0]) + Math.abs(px[i + 1] - PAPER_RGB[1]) + Math.abs(px[i + 2] - PAPER_RGB[2]) > 24) n++;
			return n;
		};
		const dragFrom = async (from: [number, number], to: [number, number]) => {
			const r = root.getBoundingClientRect();
			await (commands as unknown as Record<string, (...a: number[]) => Promise<void>>).dragMouse(r.left + from[0], r.top + from[1], r.left + to[0], r.top + to[1]);
			await frames(20);
		};
		getSelection()?.removeAllRanges();
		const before = dark();
		await dragFrom([260, 200], [8, 22]);
		expect(getSelection()?.toString()).toBe('');
		expect(dark()).toBeGreaterThan(before);

		getSelection()?.removeAllRanges();
		await waitForSurfaceSettle(activeFrameSubscribers, 30000, MAX_WET_STEPS + MAX_DAB_DELAY, 100);
		const afterBare = dark();
		await dragFrom([22, 30], [190, 30]);
		expect(getSelection()?.toString().length).toBeGreaterThan(3);
		expect(dark()).toBe(afterBare);
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
