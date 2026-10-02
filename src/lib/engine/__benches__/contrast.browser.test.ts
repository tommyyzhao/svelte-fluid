/*
 * WCAG contrast measurement (Bead svelte-fluid-ddf, ADR-0086). Measures worst-
 * case (5th percentile) contrast for text-bearing components x presets and
 * writes evidence frames. Set SVELTE_FLUID_CONTRAST_TAG=before|after to label
 * the output (default 'run'); frames go to /tmp/lane-contrast/<tag>/.
 *
 * The full table lands in /tmp/lane-contrast/<tag>/table.json.
 */
import { mount, unmount } from 'svelte';
import { commands } from 'vitest/browser';
import { afterAll, describe, expect, it, vi } from 'vitest';
import FluidText from '../../FluidText.svelte';
import { cssColorToRgb, measurePageColor, resetCssColorWarnings } from '../css-color.js';
import { FluidEngine, _setContextTier } from '../FluidEngine.js';
import { PRESETS } from '../../presets/registry.js';
import { contrastRatio, percentile, relativeLuminance } from '../contrast.js';
import { generateColor, mulberry32 } from '../rng.js';
import type { FluidConfig, RGB } from '../types.js';

const TAG = String(import.meta.env.SVELTE_FLUID_CONTRAST_TAG || 'run');
const DIR = `/tmp/lane-contrast/${TAG}`;
const FRAMES = 150;
const DT = 1 / 60;
const W = 640;
const H = 200;

interface Harness {
	gl: WebGL2RenderingContext;
	renderCore(target: null): void;
}
const cmd = commands as unknown as Record<string, (...a: string[]) => Promise<void>>;
const table: Record<string, Record<string, unknown>> = {};

const BLACK: RGB = { r: 0, g: 0, b: 0 };
const WHITE: RGB = { r: 255, g: 255, b: 255 };

/** Force the no-jump-flood path: the engine falls back to a WebGL1 context. */
function noWebGL2(canvas: HTMLCanvasElement): void {
	// A shared-tier engine would ignore the canvas patch; engines choose their
	// tier synchronously in the constructor, so reset the hook once that has run.
	_setContextTier(false);
	queueMicrotask(() => _setContextTier('auto'));
	const get = canvas.getContext.bind(canvas) as (type: string, ...a: unknown[]) => unknown;
	(canvas as unknown as { getContext: unknown }).getContext = (t: string, ...a: unknown[]) => (t === 'webgl2' ? null : get(t, ...a));
}

/** Render and read the canvas as top-down premultiplied RGBA bytes. */
function frame(config: FluidConfig, w = W, h = H, steps = FRAMES, webgl1 = false): Uint8Array {
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	if (webgl1) noWebGL2(canvas);
	const engine = new FluidEngine({ canvas, autoStart: false, config: { pointerInput: false, seed: 42, ...config } });
	const harness = engine as unknown as Harness;
	try {
		engine.advance(steps, DT);
		harness.renderCore(null);
		const gl = harness.gl;
		const px = new Uint8Array(w * h * 4);
		gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
		const out = new Uint8Array(px.length);
		for (let y = 0; y < h; y++) out.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
		return out;
	} finally {
		engine.dispose();
	}
}

/** Composite premultiplied canvas bytes over an opaque page colour; returns 0-1 sRGB. */
function over(px: Uint8Array, i: number, page: RGB): [number, number, number] {
	const a = px[i + 3] / 255;
	return [
		px[i] / 255 + (page.r / 255) * (1 - a),
		px[i + 1] / 255 + (page.g / 255) * (1 - a),
		px[i + 2] / 255 + (page.b / 255) * (1 - a)
	];
}

async function saveComposite(name: string, px: Uint8Array, w: number, h: number, page: RGB) {
	const out = new Uint8ClampedArray(w * h * 4);
	for (let i = 0; i < w * h * 4; i += 4) {
		const c = over(px, i, page);
		out[i] = Math.round(c[0] * 255);
		out[i + 1] = Math.round(c[1] * 255);
		out[i + 2] = Math.round(c[2] * 255);
		out[i + 3] = 255;
	}
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	c.getContext('2d')!.putImageData(new ImageData(out, w, h), 0, 0);
	await cmd.writeBenchBase64(`${DIR}/${name}.png`, c.toDataURL('image/png').split(',')[1]);
}

/* ------------------------------------------------------------------ FluidText */

/** Config FluidText.svelte hands to <Fluid> for a given consumer config. */
function fluidTextConfig(extra: FluidConfig): FluidConfig {
	return {
		...extra,
		containerShape: {
			type: 'svgPath',
			text: 'FLUID',
			font: 'bold 100px "Helvetica Neue", Arial, sans-serif',
			maskResolution: 512
		},
		transparent: true
	};
}

// 'before' tag measures 0.8.0 behaviour (no floor); anything else applies the
// component defaults (<FluidText> minContrast 3 vs the measured page colour).
const FIX = TAG !== 'before';

/** Glyph-interior pixel indices: reveal-mode alpha with no dye is exactly the display mask. */
function glyphInterior(config: FluidConfig, webgl1 = false): number[] {
	const px = frame(
		{ containerShape: config.containerShape, obstructions: config.obstructions, reveal: true, revealSensitivity: 0, initialSplatCount: 0 },
		W,
		H,
		1,
		webgl1
	);
	const idx: number[] = [];
	for (let i = 0; i < W * H; i++) if (px[i * 4 + 3] === 255) idx.push(i * 4);
	return idx;
}

const textCases: [string, FluidConfig][] = [
	['(default)', {}],
	...PRESETS.filter((p) => p.category !== 'flow').map((p): [string, FluidConfig] => [
		p.id,
		p.config as FluidConfig
	])
];

describe('contrast floor leaves passing pixels alone (0.8.0 look)', () => {
	it('Fluid Plasma: pixels already >= 3:1 are unchanged, and the default (no floor) path is bit-identical', () => {
		const base = { ...(PRESETS.find((p) => p.id === 'Plasma')!.config as FluidConfig), containerShape: null };
		const raw = frame(base);
		const same = frame({ ...base, minContrast: 0 });
		expect(same.every((v, i) => v === raw[i])).toBe(true);
		const fixed = frame({ ...base, minContrast: 3, contrastColor: BLACK });
		const lp = relativeLuminance(0, 0, 0);
		let passing = 0;
		for (let i = 0; i < raw.length; i += 4) {
			const c = over(raw, i, BLACK);
			if (raw[i + 3] === 0 || contrastRatio(relativeLuminance(c[0], c[1], c[2]), lp) < 3.2) continue;
			passing++;
			for (let k = 0; k < 4; k++) expect(Math.abs(fixed[i + k] - raw[i + k])).toBeLessThanOrEqual(2);
		}
		expect(passing).toBeGreaterThan(100);
	});
});

/** Pixel indices (x4) whose four neighbours are also in `set`. */
function eroded(set: Set<number>): number[] {
	return [...set].filter((i) => set.has(i - 4) && set.has(i + 4) && set.has(i - W * 4) && set.has(i + W * 4));
}

const lumOf = (c: number[]) => relativeLuminance(c[0], c[1], c[2]);

describe('text halo without jump flood (WebGL1 coverage-mask path)', () => {
	it('uses the outline, never the per-pixel floor, and keeps interiors bit-identical', () => {
		const cfg = fluidTextConfig({ glass: false, contrastMode: 'outline' });
		const canvas = document.createElement('canvas');
		noWebGL2(canvas);
		const engine = new FluidEngine({ canvas, autoStart: false, config: { ...cfg, minContrast: 3, contrastColor: WHITE } });
		const h = engine as unknown as { ext: { isWebGL2: boolean }; config: unknown; displayKeywords(c: unknown): string[] };
		try {
			expect(h.ext.isWebGL2).toBe(false);
			const kw = h.displayKeywords(h.config);
			expect(kw).toContain('CONTRAST_OUTLINE');
			expect(kw).not.toContain('CONTRAST_FLOOR');
			expect(kw).not.toContain('MASK_SDF');
		} finally {
			engine.dispose();
		}
		const interior = glyphInterior(cfg, true);
		expect(interior.length).toBeGreaterThan(2000);
		const inside = new Set(interior);
		for (const page of [WHITE, BLACK]) {
			const plain = frame({ ...cfg, minContrast: 1 }, W, H, FRAMES, true);
			const px = frame({ ...cfg, minContrast: 3, contrastColor: page }, W, H, FRAMES, true);
			for (const i of eroded(inside)) for (let k = 0; k < 4; k++) expect(px[i + k]).toBe(plain[i + k]);
			// A halo band exists and clears 3:1 at its core.
			const lp = lumOf([page.r / 255, page.g / 255, page.b / 255]);
			let band = 0;
			let best = 0;
			for (let i = 0; i < px.length; i += 4) {
				if (inside.has(i) || plain[i + 3] !== 0 || px[i + 3] === 0) continue;
				band++;
				best = Math.max(best, contrastRatio(lumOf(over(px, i, page)), lp));
			}
			expect(band).toBeGreaterThan(500);
			expect(best).toBeGreaterThanOrEqual(3);
		}
	});
});

describe('floor needs a reference and spares passing pixels', () => {
	const plasma = { ...(PRESETS.find((p) => p.id === 'Plasma')!.config as FluidConfig), containerShape: null };
	it('minContrast without contrastColor is bit-identical to off (no grey canvas)', () => {
		const off = frame({ ...plasma, minContrast: 0 });
		const noRef = frame({ ...plasma, minContrast: 3 });
		expect(noRef.every((v, i) => v === off[i])).toBe(true);
	});
	it('mid-grey #6e6e6e reference: black stays black, passing pixels untouched', () => {
		const ref: RGB = { r: 0x6e, g: 0x6e, b: 0x6e };
		const lr = relativeLuminance(0x6e / 255, 0x6e / 255, 0x6e / 255);
		const base = { ...plasma, transparent: false, backColor: BLACK };
		const raw = frame(base);
		const fixed = frame({ ...base, minContrast: 3, contrastColor: ref });
		let checked = 0;
		for (let i = 0; i < raw.length; i += 4) {
			if (contrastRatio(lumOf(over(raw, i, BLACK)), lr) < 3.2) continue;
			checked++;
			for (let k = 0; k < 3; k++) expect(Math.abs(fixed[i + k] - raw[i + k])).toBeLessThanOrEqual(2);
		}
		expect(checked).toBeGreaterThan(100);
		// Undyed black is already 3.12:1 against #6e6e6e: it must stay exactly black.
		const empty = { ...base, initialSplatCount: 0, presetSplats: [], autoSplatRate: 0 };
		const blank = frame({ ...empty, minContrast: 3, contrastColor: ref }, W, H, 1);
		const blankOff = frame({ ...empty, minContrast: 0 }, W, H, 1);
		expect(blank.every((v, i) => v === blankOff[i])).toBe(true);
		expect(blankOff[0] + blankOff[1] + blankOff[2]).toBeLessThanOrEqual(3);
	});
});

describe('FluidText halo: obstructions and opaque canvas', () => {
	const cfg = fluidTextConfig({ glass: false, contrastMode: 'outline' });
	it('obstruction holes inside glyphs stay unhaloed and interiors bit-identical', () => {
		const withObs = { ...cfg, obstructions: [{ d: 'M35,25h30v50h-30Z', viewBox: [0, 0, 100, 100] as [number, number, number, number] }] };
		const whole = new Set(glyphInterior(cfg));
		const live = new Set(glyphInterior(withObs));
		const hole = new Set([...whole].filter((i) => !live.has(i)));
		expect(hole.size).toBeGreaterThan(500);
		const plain = frame({ ...withObs, minContrast: 1 });
		const px = frame({ ...withObs, minContrast: 3, contrastColor: WHITE });
		for (const i of [...eroded(live), ...eroded(hole)]) for (let k = 0; k < 4; k++) expect(px[i + k]).toBe(plain[i + k]);
	});
	it('opaque canvas: halo replaces the composite, interiors identical', async () => {
		const grey: RGB = { r: 128, g: 128, b: 128 };
		const opaque = { ...cfg, transparent: false, backColor: grey };
		const lp = relativeLuminance(128 / 255, 128 / 255, 128 / 255);
		const inside = new Set(glyphInterior(opaque));
		const plain = frame({ ...opaque, minContrast: 1 });
		const px = frame({ ...opaque, minContrast: 3 });
		for (const i of eroded(inside)) for (let k = 0; k < 4; k++) expect(px[i + k]).toBe(plain[i + k]);
		let changed = 0;
		let best = 0;
		for (let i = 0; i < px.length; i += 4) {
			if (inside.has(i) || (px[i] === plain[i] && px[i + 1] === plain[i + 1] && px[i + 2] === plain[i + 2])) continue;
			changed++;
			expect(px[i + 3]).toBe(255);
			best = Math.max(best, contrastRatio(lumOf(over(px, i, grey)), lp));
		}
		expect(changed).toBeGreaterThan(500);
		expect(best).toBeGreaterThanOrEqual(3);
		await saveComposite('text-opaque-grey', px, W, H, grey);
	});
});

describe('CSS page measurement', () => {
	function page(css: string, inner = ''): HTMLElement {
		const el = document.createElement('div');
		el.style.cssText = css;
		el.innerHTML = inner;
		document.body.append(el);
		return el;
	}
	it('oklch page: measured colour clears 3:1 through the halo', async () => {
		const el = page('background:oklch(0.984 0.003 247.858)', '<span></span>');
		try {
			const pg = measurePageColor(el.firstElementChild);
			expect(pg.r).toBeGreaterThan(240);
			expect(pg.r).toBeLessThan(255);
			const cfg = fluidTextConfig({ glass: false, contrastMode: 'outline' });
			const inside = new Set(glyphInterior(cfg));
			const plain = frame({ ...cfg, minContrast: 1 });
			const px = frame({ ...cfg, minContrast: 3, contrastColor: pg });
			const lp = relativeLuminance(pg.r / 255, pg.g / 255, pg.b / 255);
			let best = 0;
			let band = 0;
			for (let i = 0; i < px.length; i += 4) {
				if (inside.has(i) || plain[i + 3] !== 0 || px[i + 3] === 0) continue;
				band++;
				best = Math.max(best, contrastRatio(lumOf(over(px, i, pg)), lp));
			}
			expect(band).toBeGreaterThan(500);
			expect(best).toBeGreaterThanOrEqual(3);
			await saveComposite('text-oklch-page', px, W, H, pg);
		} finally {
			el.remove();
		}
	});
	it('FluidText hands the measured oklch page colour to the engine', async () => {
		const el = page('background:oklch(0.984 0.003 247.858);width:640px');
		// The engine may be built with the measured colour or receive it via setConfig; either way drawDisplay sees it.
		const seen: (RGB | null)[] = [];
		const proto = FluidEngine.prototype as unknown as { drawDisplay: (...a: unknown[]) => void };
		const orig = proto.drawDisplay;
		const spy = vi.spyOn(proto, 'drawDisplay').mockImplementation(function (this: { config: { CONTRAST_COLOR: RGB | null } }, ...a: unknown[]) {
			seen.push(this.config.CONTRAST_COLOR);
			return orig.apply(this, a);
		});
		const app = mount(FluidText as never, { target: el, props: { text: 'FLUID' } });
		try {
			await vi.waitFor(() => expect(seen.some((c) => c !== null && c.r > 240 && c.r < 255)).toBe(true));
		} finally {
			void unmount(app);
			spy.mockRestore();
			el.remove();
		}
	});
	it('composites rgba text colour and translucent ancestors', () => {
		const mixed = cssColorToRgb('rgba(255, 255, 255, 0.5)', { r: 8, g: 8, b: 16 });
		expect(mixed.r).toBeGreaterThan(125);
		expect(mixed.r).toBeLessThan(138);
		const outer = page('background:rgb(0 0 0)', '<div style="background:rgb(255 255 255 / 0.5)"><i></i></div>');
		try {
			const pg = measurePageColor(outer.querySelector('i'));
			expect(pg.r).toBeGreaterThan(125);
			expect(pg.r).toBeLessThan(130);
		} finally {
			outer.remove();
		}
	});
	it('gradient ancestors warn once and fall back to background-color', () => {
		resetCssColorWarnings();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const el = page('background-color:rgb(10 20 30);background-image:linear-gradient(red, blue)', '<i></i>');
		try {
			expect(measurePageColor(el.firstElementChild)).toEqual({ r: 10, g: 20, b: 30 });
			measurePageColor(el.firstElementChild);
			expect(warn).toHaveBeenCalledTimes(1);
			expect(String(warn.mock.calls[0][0])).toContain('contrastColor');
		} finally {
			warn.mockRestore();
			el.remove();
		}
	});
});

describe('FluidText outline halo vs page (ADR-0086)', () => {
	for (const [name, base] of textCases) {
		it(name, async () => {
			// Preset physics, but the text container replaces the preset geometry.
			const cfg = fluidTextConfig({ ...base, glass: false, obstructions: undefined });
			const interior = glyphInterior(cfg);
			expect(interior.length).toBeGreaterThan(2000);
			const inside = new Set(interior);
			const pages: Record<string, RGB> = {
				black: BLACK,
				white: WHITE,
				own: (base.backColor as RGB | undefined) ?? BLACK
			};
			const row: Record<string, unknown> = { glyphPixels: interior.length };
			const plain = frame({ ...cfg, minContrast: 1 });
			let worst = Infinity;
			for (const [pn, page] of Object.entries(pages)) {
				const lp = relativeLuminance(page.r / 255, page.g / 255, page.b / 255);
				const px = frame(FIX ? { ...cfg, minContrast: 3, contrastColor: page, contrastMode: 'outline' } : cfg);
				const band = frame({ ...cfg, initialSplatCount: 0, presetSplats: [], autoSplatRate: 0, bloom: false, minContrast: 3, contrastColor: page, contrastMode: 'outline' }, W, H, 1);
				if (FIX) {
					// Interior pixels (eroded one pixel: the edge ramp is the halo's own AA) equal the minContrast=1 render exactly.
					for (const i of interior) if (inside.has(i - 4) && inside.has(i + 4) && inside.has(i - W * 4) && inside.has(i + W * 4)) for (let k = 0; k < 4; k++) expect(px[i + k]).toBe(plain[i + k]);
					// Opaque halo band (outside the glyph interior) clears 3:1 vs the page.
					const ratios: number[] = [];
					for (let i = 0; i < px.length; i += 4) {
						if (band[i + 3] !== 255 || inside.has(i) || plain[i + 3] !== 0) continue;
						const c = over(px, i, page);
						ratios.push(contrastRatio(relativeLuminance(c[0], c[1], c[2]), lp));
					}
					expect(ratios.length).toBeGreaterThan(500);
					const lo = Math.min(...ratios);
					row[pn] = +lo.toFixed(2);
					row[`${pn}Band`] = ratios.length;
					worst = Math.min(worst, lo);
				}
				await saveComposite(`text-${name}-${pn}`, px, W, H, page);
			}
			if (FIX) {
				row.worst = +worst.toFixed(2);
				expect(worst).toBeGreaterThanOrEqual(3);
			}
			table[`FluidText/${name}`] = row;
		});
	}
});

/* ----------------------------------------------------------------- FluidReveal */

/** FluidReveal.svelte's pinned engine config (defaults) with an optional cover colour. */
function revealConfig(cover?: RGB): FluidConfig {
	return {
		reveal: true,
		revealSensitivity: 0.1,
		revealCurve: 0.5,
		revealCoverColor: cover,
		densityDissipation: 0.995,
		splatRadius: 0.2,
		splatOnHover: false,
		initialSplatCount: 0,
		bloom: false,
		sunrays: false,
		shading: false,
		velocityDissipation: 0.98,
		pressure: 1,
		curl: 0,
		openBoundary: true,
		backColor: BLACK
	};
}

function revealFrame(cover?: RGB): Uint8Array {
	const canvas = document.createElement('canvas');
	canvas.width = W;
	canvas.height = H;
	const engine = new FluidEngine({ canvas, autoStart: false, config: { pointerInput: false, ...revealConfig(cover) } });
	const harness = engine as unknown as Harness;
	try {
		// A pointer sweep: same 5x pixel-delta force FluidReveal applies.
		for (let k = 0; k < 40; k++) {
			engine.splat(0.15 + k * 0.017, 0.5 + 0.15 * Math.sin(k / 6), 5 * 12, 5 * 3, { r: 1, g: 1, b: 1 });
			engine.advance(1, DT);
		}
		engine.advance(20, DT);
		harness.renderCore(null);
		const gl = harness.gl;
		const px = new Uint8Array(W * H * 4);
		gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
		return px;
	} finally {
		engine.dispose();
	}
}

const revealCovers: [string, RGB | undefined][] = [
	['cover-white(default)', undefined],
	['cover-black', { r: 0, g: 0, b: 0 }],
	['cover-gray', { r: 0.5, g: 0.5, b: 0.5 }]
];
const revealPairs: [string, RGB, RGB][] = [
	['black-on-white', BLACK, WHITE],
	['white-on-black', WHITE, BLACK],
	['gray767676-on-white', { r: 118, g: 118, b: 118 }, WHITE]
];

describe('FluidReveal text vs cover (per-pixel text/bg contrast under the cover)', () => {
	for (const [cn, cover] of revealCovers) {
		it(cn, async () => {
			const px = revealFrame(cover);
			const row: Record<string, unknown> = {};
			let a0 = 0;
			let partial = 0;
			for (let i = 0; i < W * H; i++) {
				const a = px[i * 4 + 3];
				if (a === 0) a0++;
				else if (a < 255) partial++;
			}
			row.alphaZeroShare = +(a0 / (W * H)).toFixed(3);
			row.partialShare = +(partial / (W * H)).toFixed(3);
			for (const [pn, text, page] of revealPairs) {
				const lt = relativeLuminance(text.r / 255, text.g / 255, text.b / 255);
				const lb = relativeLuminance(page.r / 255, page.g / 255, page.b / 255);
				const own = contrastRatio(lt, lb);
				const low: number[] = [];
				const mid: number[] = [];
				for (let i = 0; i < W * H; i++) {
					const a = px[i * 4 + 3] / 255;
					if (a >= 0.5 || (a === 0 && false)) continue;
					const ct = over(px, i * 4, text);
					const cb = over(px, i * 4, page);
					const r = contrastRatio(relativeLuminance(ct[0], ct[1], ct[2]), relativeLuminance(cb[0], cb[1], cb[2]));
					(a < 0.1 ? low : mid).push(r);
				}
				row[pn + '/own'] = +own.toFixed(2);
				row[pn + '/p5(alpha<0.1)'] = +percentile(low, 0.05).toFixed(2);
				// Revealed pixels (cover alpha < 0.1) keep >= 80% of the DOM text's own contrast.
				expect(percentile(low, 0.05)).toBeGreaterThanOrEqual(0.8 * own);
				row[pn + '/p5(alpha<0.5)'] = +percentile([...low, ...mid], 0.05).toFixed(2);
				if (pn === 'black-on-white') await saveComposite('reveal-' + cn + '-' + pn, px, W, H, page);
			}
			table['FluidReveal/' + cn] = row;
		});
	}
});

/* ------------------------------------------------------------- FluidBackground */

/** FluidBackground.svelte defaults, no exclusion zones. */
const bgDefaults: FluidConfig = {
	simResolution: 64,
	dyeResolution: 512,
	pressureIterations: 6,
	bloomIterations: 4,
	autoSplatRate: 0,
	initialSplatCount: 0,
	backColor: { r: 8, g: 8, b: 16 },
	splatOnHover: true
};

function bgFrame(config: FluidConfig, extra: FluidConfig = {}): Uint8Array {
	const w = 480;
	const h = 270;
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const engine = new FluidEngine({ canvas, autoStart: false, config: { pointerInput: false, ...bgDefaults, ...config, ...extra } });
	const harness = engine as unknown as Harness;
	try {
		// Pointer-like strokes (random splats at the engine's default intensity).
		for (let k = 0; k < 30; k++) {
			engine.splat(0.1 + 0.027 * k, 0.5 + 0.3 * Math.sin(k / 4), 600, 100 * Math.cos(k / 3), generateColor(mulberry32(k + 1)));
			engine.advance(2, DT);
		}
		engine.advance(60, DT);
		harness.renderCore(null);
		const gl = harness.gl;
		const px = new Uint8Array(w * h * 4);
		gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
		return px;
	} finally {
		engine.dispose();
	}
}

const bgCases: [string, FluidConfig][] = [
	['(default)', {}],
	...PRESETS.map((p): [string, FluidConfig] => [p.id, p.config as FluidConfig])
];

function bgRow(px: Uint8Array, text: RGB): number {
	const lt = relativeLuminance(text.r / 255, text.g / 255, text.b / 255);
	const ratios: number[] = [];
	for (let i = 0; i < px.length; i += 4) {
		const c = over(px, i, BLACK);
		ratios.push(contrastRatio(relativeLuminance(c[0], c[1], c[2]), lt));
	}
	return +percentile(ratios, 0.05).toFixed(2);
}

describe('FluidBackground text contrast (white / black text vs fluid canvas)', () => {
	for (const [name, base] of bgCases) {
		it(name, async () => {
			const row: Record<string, unknown> = {};
			for (const [tn, text] of [['whiteText', WHITE], ['blackText', BLACK]] as const) {
				const px = bgFrame(base, FIX ? { minContrast: 4.5, contrastColor: text } : {});
				row[tn] = bgRow(px, text);
				await saveComposite('bg-' + name + '-' + tn, px, 480, 270, BLACK);
			}
			table['FluidBackground/' + name] = row;
			// Glass is composited after the display pass (reflections), outside the guarantee.
			if (FIX && !base.glass) {
				expect(row.whiteText).toBeGreaterThanOrEqual(4.5);
				expect(row.blackText).toBeGreaterThanOrEqual(4.5);
			}
		});
	}
});


afterAll(async () => {
	await cmd.writeBenchJson(`${DIR}/table.json`, JSON.stringify(table, null, 1));
});
