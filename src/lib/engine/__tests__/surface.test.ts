import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance } from '../contrast.js';
import { LABEL_MIN_CONTRAST, LOOKS, clampToBand, hexContrast, hexToLinear, hexToSrgb, labelBand } from '../surface/look.js';
import {
	CAUSTIC_CAP,
	MAX_QUEUED_IMPULSES,
	REFRACTION_CAP_CSS,
	SURFACE_MAX_CELLS,
	WAVE,
	assignDefined,
	causticAreaRatio,
	causticJacobianRatio,
	courantLimit,
	enqueueImpulse,
	lensProfile,
	maxAmplification,
	refractionOffset,
	surfaceGrid,
	waveEnergy,
	waveStep,
	type Impulse,
	type WaveParams
} from '../surface/wave.js';
import shaderSrc from '../surface/shaders.ts?raw';
import engineSrc from '../surface/SurfaceEngine.ts?raw';

const W = 48;
const run = (h: Float64Array, prev: Float64Array, p: WaveParams, n: number, each?: (h: Float64Array, prev: Float64Array) => void) => {
	for (let i = 0; i < n; i++) {
		[h, prev] = [waveStep(h, prev, W, p), h];
		each?.(h, prev);
	}
	return [h, prev] as const;
};
const pulse = () => Float64Array.from({ length: W * W }, (_, i) => Math.exp(-(((i % W) - 20) ** 2 + (Math.floor(i / W) - 26) ** 2) / 8));

describe('surface wave stencil (ADR-0091)', () => {
	it('is von Neumann stable at the CFL limit (with the shipped ν, m²) and unstable past it', () => {
		expect(courantLimit()).toBeCloseTo(Math.SQRT1_2, 12);
		const limit = courantLimit(WAVE.viscosity, WAVE.mass);
		expect(WAVE.courant).toBeLessThanOrEqual(limit);
		expect(maxAmplification({ ...WAVE, courant: limit, damping: 0 })).toBeLessThanOrEqual(1 + 1e-9);
		expect(maxAmplification({ ...WAVE, courant: limit * 1.02, damping: 0 })).toBeGreaterThan(1.01);
		expect(maxAmplification(WAVE)).toBeLessThan(1);
		expect(() => waveStep(new Float64Array(4), new Float64Array(4), 2, { ...WAVE, courant: limit * 1.001 })).toThrow(RangeError);
	});

	it('keeps checkerboard noise bounded at the CFL limit and kills it with viscosity', () => {
		const noise = () => Float64Array.from({ length: W * W }, (_, i) => (((i % W) + Math.floor(i / W)) % 2 ? 1 : -1) * (1 + Math.sin(i)));
		// The λ = 8 root sits on |z| = 1 exactly at the limit; 0.99× keeps the energy norm definite.
		const p = { courant: courantLimit() * 0.99, damping: 0, viscosity: 0, mass: 0 };
		let h: Float64Array = noise();
		let prev: Float64Array = h.slice();
		const peak = [0, 0];
		const e0 = waveEnergy(h, prev, W, p);
		for (const k of [0, 1])
			[h, prev] = run(h, prev, p, 3000, (x) => {
				for (const v of x) peak[k] = Math.max(peak[k], Math.abs(v));
			});
		expect(peak[1]).toBeLessThanOrEqual(peak[0] * 1.05);
		expect(Math.abs(waveEnergy(h, prev, W, p) / e0 - 1)).toBeLessThan(1e-9);

		h = noise();
		prev = h.slice();
		[h] = run(h, prev, { ...WAVE, courant: courantLimit(WAVE.viscosity, WAVE.mass) }, 600);
		expect(Math.max(...h.map(Math.abs))).toBeLessThan(0.05);
	});

	it('conserves energy undamped and decays it monotonically with the shipped damping', () => {
		const free = { courant: courantLimit(0, WAVE.mass), damping: 0, viscosity: 0, mass: WAVE.mass };
		let h: Float64Array = pulse();
		let prev: Float64Array = h.slice();
		const e0 = waveEnergy(h, prev, W, free);
		[h, prev] = run(h, prev, free, 400);
		expect(Math.abs(waveEnergy(h, prev, W, free) / e0 - 1)).toBeLessThan(1e-9);

		h = pulse();
		prev = h.slice();
		let last = waveEnergy(h, prev, W);
		run(h, prev, WAVE, 1500, (x, y) => {
			const e = waveEnergy(x, y, W);
			expect(e).toBeLessThanOrEqual(last * (1 + 1e-9));
			last = e;
		});
		expect(last).toBeLessThan(e0 * 1e-3);
	});

	it('sizes the grid per CSS px, not a fixed 256 cells', () => {
		expect(surfaceGrid(220, 56)).toEqual({ cols: 220, rows: 56, cell: 1 });
		expect(surfaceGrid(40, 30).cols).toBe(40);
		const big = surfaceGrid(2048, 100);
		expect(big.cols).toBe(SURFACE_MAX_CELLS);
		expect(big.cell).toBe(4);
	});
});

describe('lens edge', () => {
	it('has continuous curvature across the edge band (no seam in the caustic term)', () => {
		// Max jump of the second difference between neighbouring samples, sweeping
		// the band: a C¹ smoothstep jumps by ~6A/f² at its band ends; tanh does not.
		const A = 1.6;
		const f = 7;
		const step = 0.02;
		const curv = (fn: (d: number) => number, d: number) => (fn(d + step) - 2 * fn(d) + fn(d - step)) / step ** 2;
		const jump = (fn: (d: number) => number) => {
			let worst = 0;
			for (let d = -2 * f; d < 2 * f; d += step) worst = Math.max(worst, Math.abs(curv(fn, d + step) - curv(fn, d)));
			return worst;
		};
		const smooth = (d: number) => {
			const t = Math.min(1, Math.max(0, (d - f) / (-2 * f)));
			return A * t * t * (3 - 2 * t);
		};
		const ours = jump((d) => lensProfile(d, A, f));
		expect(jump(smooth)).toBeGreaterThan(20 * ours);
		expect(lensProfile(-50, A, f)).toBeCloseTo(A, 6);
		expect(lensProfile(50, A, f)).toBeCloseTo(0, 6);
		expect(shaderSrc).toContain('return uLensShape.y * 0.5 * (1.0 - tanh(sdRoundRect(p - l.xy, l.zw, uLensShape.x) / (uLensShape.z / 1.5)));');
		// Same peak slope as the smoothstep it replaced: the resting lens look is unchanged.
		const slope = (fn: (d: number) => number) => Math.max(...Array.from({ length: 2000 }, (_, i) => Math.abs(fn(-2 * f + i * 0.01 + 0.01) - fn(-2 * f + i * 0.01)) / 0.01));
		expect(slope((d) => lensProfile(d, A, f))).toBeCloseTo(slope(smooth), 2);
	});
});

describe('caustics and refraction', () => {
	it('is flat area over refracted area', () => {
		expect(causticAreaRatio(1, 1)).toBe(1);
		expect(causticAreaRatio(1, 0.25)).toBe(4);
		expect(causticAreaRatio(1, 4)).toBe(0.25);
		expect(causticAreaRatio(1, 0)).toBe(CAUSTIC_CAP);
		expect(() => causticAreaRatio(-1, 1)).toThrow(RangeError);
	});

	it('matches a finite-difference Jacobian of the refracted grid', () => {
		// h = A·cos(kx)·cos(ky); floor point x + D·k_r·∇h.
		const A = 0.6;
		const k = 0.35;
		const D = 30;
		const kr = 1 - 1 / 1.333;
		const grad = (x: number, y: number) => [-A * k * Math.sin(k * x) * Math.cos(k * y), -A * k * Math.cos(k * x) * Math.sin(k * y)];
		const map = (x: number, y: number) => {
			const g = grad(x, y);
			return [x + D * kr * g[0], y + D * kr * g[1]];
		};
		for (const [x, y] of [
			[0, 0],
			[1.3, 2.1],
			[4.5, 0.7],
			[8.9, 8.9]
		]) {
			const e = 1e-4;
			const [ax, ay] = map(x + e, y).map((v, i) => (v - map(x - e, y)[i]) / (2 * e));
			const [bx, by] = map(x, y + e).map((v, i) => (v - map(x, y - e)[i]) / (2 * e));
			const area = Math.abs(ax * by - ay * bx);
			const hxx = -A * k * k * Math.cos(k * x) * Math.cos(k * y);
			const hxy = A * k * k * Math.sin(k * x) * Math.sin(k * y);
			expect(causticJacobianRatio(hxx, hxy, hxx, D)).toBeCloseTo(causticAreaRatio(1, area), 5);
		}
		// A crest focuses light (ratio > 1); a trough spreads it.
		expect(causticJacobianRatio(-0.01, 0, -0.01, D)).toBeGreaterThan(1);
		expect(causticJacobianRatio(0.01, 0, 0.01, D)).toBeLessThan(1);
	});

	it('caps the refraction offset at 1.5 CSS px', () => {
		expect(REFRACTION_CAP_CSS).toBeLessThanOrEqual(1.5);
		const steep = refractionOffset(1, 20);
		expect(steep.offset).toBeGreaterThan(1.5);
		expect(steep.capped).toBe(REFRACTION_CAP_CSS);
		expect(shaderSrc).toContain('offset *= min(1.0, uRefractCap / max(length(offset), 1e-6));');
	});

	it('only darkens with caustics on light tones', () => {
		expect(shaderSrc).toContain('if (uCaustic.y > 0.5) delta = min(delta, 0.0);');
		expect(engineSrc).toContain("this.config.tone === 'light' ? 1 : 0");
	});
});

describe('label contrast budget', () => {
	const toneCases = (['button', 'segmented'] as const).flatMap((control) =>
		(['light', 'dark'] as const).map((tone) => [control, tone] as const)
	);

	it.each(toneCases)('%s/%s text has ≥4.5:1 on the base fill', (control, tone) => {
		const look = LOOKS[control][tone];
		expect(hexContrast(look.text, look.fill)).toBeGreaterThanOrEqual(LABEL_MIN_CONTRAST);
		expect(hexContrast(look.text, look.fillLow)).toBeGreaterThanOrEqual(LABEL_MIN_CONTRAST);
		// The native focus ring reads against the page (WCAG 1.4.11).
		expect(hexContrast(look.ring, look.page)).toBeGreaterThanOrEqual(3);
	});

	it.each(toneCases)('%s/%s keeps ≥4.5:1 under any added light or shade after the clamp', (control, tone) => {
		const look = LOOKS[control][tone];
		const band = labelBand(look.text, look.fill);
		const text = relativeLuminance(...hexToSrgb(look.text));
		// Light text: the budget is the light that may be added before failing; it is positive.
		if (text > 0.5) expect(band.addBudget).toBeGreaterThan(0);
		const base = hexToLinear(look.fill);
		for (const add of [0, 0.01, 0.05, 0.2, 1, 5]) {
			for (const shade of [1, 0.8, 0.4, 0]) {
				const lin = base.map((v) => v * shade + add) as [number, number, number];
				const out = clampToBand(lin, band);
				const l = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2];
				// Worst 8-bit quantisation plus ±1 LSB dither: 2/255 sRGB on every channel.
				const s = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
				const worst = (dir: number) =>
					relativeLuminance(...(out.map((v) => Math.min(1, Math.max(0, s(v) + (dir * 2) / 255))) as [number, number, number]));
				expect(l).toBeLessThanOrEqual(band.hi + 1e-9);
				expect(l).toBeGreaterThanOrEqual(band.lo - 1e-9);
				for (const dir of [-1, 1]) expect(contrastRatio(text, worst(dir))).toBeGreaterThanOrEqual(LABEL_MIN_CONTRAST);
			}
		}
	});

	it('the shader clamp mirrors clampToBand', () => {
		expect(shaderSrc).toContain('vec3 clamped = l > uBand.y ? color * (uBand.y / l) : l < uBand.x ? color + (uBand.x - l) : color;');
	});
});

describe('surface input and config semantics', () => {
	it('caps the impulse backlog and rejects non-finite presses (ADR-0079)', () => {
		const q: Impulse[] = [];
		for (let i = 0; i < 100; i++) enqueueImpulse(q, { x: i, y: 0, amplitude: 1, sigma: 4 });
		expect(q).toHaveLength(MAX_QUEUED_IMPULSES);
		const empty: Impulse[] = [];
		expect(enqueueImpulse(empty, { x: NaN, y: 0, amplitude: 1, sigma: 4 })).toBe(false);
		expect(enqueueImpulse(empty, { x: 0, y: Infinity, amplitude: 1, sigma: 4 })).toBe(false);
		expect(enqueueImpulse(empty, { x: 0, y: 0, amplitude: 1, sigma: 0 })).toBe(false);
		expect(empty).toHaveLength(0);
	});

	it('never overwrites a resolved option with undefined', () => {
		const target = { tone: 'dark', focus: true, radius: 12 };
		assignDefined(target, { tone: undefined, focus: false, radius: undefined });
		expect(target).toEqual({ tone: 'dark', focus: false, radius: 12 });
		expect(engineSrc).toContain('const next = assignDefined({ ...prev }, patch);');
	});
});
