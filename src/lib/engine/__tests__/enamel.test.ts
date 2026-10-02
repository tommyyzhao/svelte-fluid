import { describe, expect, it } from 'vitest';
import {
	ENAMEL,
	areaAverage,
	contactPotential,
	enamelGrid,
	exchangeFraction,
	pairFlux,
	phaseOrder,
	restProfile,
	transferPhase,
	type Contact
} from '../enamel/profile.js';
import { contrastRatio, relativeLuminance, srgbToLinear, linearToSrgb } from '../contrast.js';
import { clampGlyph, compressLuminance, glyphBand, isLargeText, minContrastFor } from '../enamel/look.js';
import { assignDefined } from '../surface/wave.js';
import engineSrc from '../enamel/EnamelEngine.ts?raw';
import shaderSrc from '../enamel/shaders.ts?raw';
import type { RGB } from '../types.js';

const sum = (a: Float32Array) => a.reduce((s, v) => s + v, 0);

/** Two 'glyph' bars on a 40×24 grid: a broad stroke and a thin one, a hole between. */
function scene(cols = 40, rows = 24) {
	const solid = new Uint8Array(cols * rows).fill(1);
	const rest = new Float32Array(cols * rows);
	for (let j = 3; j < rows - 3; j++) {
		for (let i = 3; i < 20; i++) solid[j * cols + i] = 0;
		for (let i = 28; i < 31; i++) solid[j * cols + i] = 0;
	}
	for (let k = 0; k < rest.length; k++) if (!solid[k]) rest[k] = 0.5 + 0.2 * Math.sin(k);
	return { cols, rows, solid, rest };
}

describe('enamel rest profile (ADR-0097)', () => {
	it('ramps from zero at the edge to a flat plateau', () => {
		expect(restProfile(0, 4)).toBe(0);
		expect(restProfile(-3, 4)).toBe(0);
		expect(restProfile(1, 4)).toBeLessThan(restProfile(2, 4));
		expect(restProfile(4, 4)).toBeCloseTo(ENAMEL.peak, 12);
		expect(restProfile(9, 4)).toBe(restProfile(4, 4));
		// A thin stroke (half-width below the plateau distance) stays lower than a broad one.
		expect(restProfile(1.5, 4)).toBeLessThan(ENAMEL.peak * 0.6);
	});

	it('area-averages on non-integer cell ratios', () => {
		const fw = 37;
		const fh = 29;
		const fine = Float32Array.from({ length: fw * fh }, (_, i) => (i * 7919) % 13);
		const coarse = areaAverage(fine, fw, fh, 13, 11, fw / 13, fh / 11);
		expect(sum(coarse) / coarse.length).toBeCloseTo(sum(fine) / fine.length, 4);
	});

	it('grid cells track the font size and cap at 512 per side', () => {
		expect(enamelGrid(400, 120, 96).cell).toBe(2);
		expect(enamelGrid(40, 20, 12).cell).toBe(1);
		const big = enamelGrid(4000, 300, 24);
		expect(big.cols).toBeLessThanOrEqual(512);
	});

	it('exchange fraction is the exact two-cell solution: in (0, ½) for any step', () => {
		for (const dt of [1e-4, 1 / 240, 1, 100]) {
			const f = exchangeFraction(96, 2, dt);
			expect(f).toBeGreaterThan(0);
			expect(f).toBeLessThanOrEqual(0.5);
		}
	});
});

describe('enamel pairwise transport (ADR-0097)', () => {
	it('the ordered flux is antisymmetric: swapping the pair negates it', () => {
		const cases = [
			[0.3, 0.7, 0.5, 0.5, 0, 0.2],
			[0.01, 0.9, 0.2, 0.1, 0.6, 0],
			[0.5, 0.5, 0.5, 0.5, 0, 0]
		];
		for (const [ha, hb, ra, rb, pa, pb] of cases) {
			const ab = pairFlux(ha, hb, ra, rb, pa, pb, 0.3);
			const ba = pairFlux(hb, ha, rb, ra, pb, pa, 0.3);
			expect(ab).toBeCloseTo(-ba, 12);
			// Donor-bounded: neither side goes negative.
			expect(ha - ab).toBeGreaterThanOrEqual(0);
			expect(hb + ab).toBeGreaterThanOrEqual(0);
		}
	});

	it('every gather texel agrees with its partner: mass is conserved through presses', () => {
		const { cols, rows, solid, rest } = scene();
		const f = exchangeFraction(96, 2);
		let h: Float32Array = Float32Array.from(rest);
		const m0 = sum(h);
		for (let tick = 0; tick < 500; tick++) {
			const press: Contact | null = tick < 300 ? { x: 10 + (tick % 7), y: 12, strength: 1 + 0.5 * Math.sin(tick), sigma: 4 } : null;
			for (const phase of phaseOrder(tick)) h = transferPhase(h, rest, solid, cols, rows, phase, f, press);
		}
		expect(Math.abs(sum(h) - m0) / m0).toBeLessThan(1e-5);
		for (let k = 0; k < h.length; k++) {
			expect(h[k]).toBeGreaterThanOrEqual(0);
			if (solid[k]) expect(h[k]).toBe(0);
		}
	});

	it('a press dents under the contact, bulges beside it, then relaxes to rest', () => {
		const { cols, rows, solid, rest } = scene();
		const f = exchangeFraction(96, 2);
		const press: Contact = { x: 11, y: 12, strength: 1, sigma: 3 };
		let h: Float32Array = Float32Array.from(rest);
		let tick = 0;
		const run = (n: number, c: Contact | null) => {
			for (let k = 0; k < n; k++, tick++) for (const p of phaseOrder(tick)) h = transferPhase(h, rest, solid, cols, rows, p, f, c);
		};
		run(240, press);
		const at = (i: number, j: number) => h[j * cols + i] - rest[j * cols + i];
		expect(at(11, 12)).toBeLessThan(-0.05);
		expect(at(18, 12)).toBeGreaterThan(0);
		const dent = Math.abs(at(11, 12));
		run(ENAMEL.tail / ENAMEL.substep, null);
		expect(Math.abs(at(11, 12))).toBeLessThan(dent * 0.05);
		// Nothing crosses the hole between the strokes.
		const thin = (g: Float32Array) => [28, 29, 30].reduce((s, i) => s + g[12 * cols + i], 0);
		expect(thin(h)).toBeCloseTo(thin(rest), 4);
	});

	it('contact is a Gaussian centred on the press', () => {
		const c = { x: 5.5, y: 5.5, strength: 1, sigma: 2 };
		expect(contactPotential(5, 5, c)).toBeCloseTo(ENAMEL.contact, 12);
		expect(contactPotential(7, 5, c)).toBeLessThan(contactPotential(6, 5, c));
		expect(contactPotential(5, 5, null)).toBe(0);
	});
});

const rgb = (r: number, g: number, b: number): RGB => ({ r, g, b });

describe('enamel contrast budget (ADR-0097)', () => {
	const lumOf = (lin: number[]) => 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
	/** Worst ratio of any shaded glyph pixel after 8-bit encode with ±1 LSB dither. */
	function worst(body: RGB, page: RGB, min: number): number {
		const band = glyphBand(body, page, min);
		const lp = relativeLuminance(page.r / 255, page.g / 255, page.b / 255);
		const base = [body.r, body.g, body.b].map((v) => srgbToLinear(v / 255));
		let w = Infinity;
		// Shading spans deep shadow (×0) to an HDR glaze highlight (×6, tinted toward white).
		for (let s = 0; s <= 6; s += 0.05) {
			for (const tint of [0, 0.5, 1]) {
				const lin = base.map((v) => v * s + tint * Math.max(0, s - 1) * 0.3) as [number, number, number];
				const out = clampGlyph(lin, band);
				for (const e of [-1, 1]) {
					const px = out.map((v) => Math.min(255, Math.max(0, Math.round(linearToSrgb(v) * 255) + e)) / 255);
					w = Math.min(w, contrastRatio(relativeLuminance(px[0], px[1], px[2]), lp));
				}
			}
		}
		return w;
	}

	it('picks 3:1 for large text (≥24 px, or bold ≥18.66 px) and 4.5:1 otherwise', () => {
		expect(minContrastFor(96, 700)).toBe(3);
		expect(minContrastFor(24, 400)).toBe(3);
		expect(minContrastFor(19, 700)).toBe(3);
		expect(minContrastFor(19, 400)).toBe(4.5);
		expect(minContrastFor(18, 700)).toBe(4.5);
		expect(isLargeText(23.9, 600)).toBe(false);
	});

	it('the darkest and lightest shaded glyph pixels both clear the ratio on every page', () => {
		const pages = [rgb(255, 255, 255), rgb(242, 240, 235), rgb(128, 128, 128), rgb(90, 110, 140), rgb(11, 13, 18), rgb(0, 0, 0)];
		const bodies = [rgb(35, 50, 79), rgb(216, 195, 154), rgb(150, 150, 150), rgb(200, 30, 40), rgb(255, 255, 255), rgb(0, 0, 0), rgb(118, 118, 118)];
		for (const min of [3, 4.5])
			for (const page of pages)
				for (const body of bodies) {
					const lp = relativeLuminance(page.r / 255, page.g / 255, page.b / 255);
					// Mid-grey pages cannot reach 4.5 on either side; the better extreme is the floor there.
					const reachable = Math.max(contrastRatio(0, lp), contrastRatio(1, lp));
					expect(worst(body, page, min)).toBeGreaterThanOrEqual(Math.min(min, reachable * 0.98));
				}
	});

	it('keeps the side of the body colour when that side can reach the ratio', () => {
		expect(glyphBand(rgb(35, 50, 79), rgb(255, 255, 255), 3).side).toBe(-1);
		expect(glyphBand(rgb(216, 195, 154), rgb(11, 13, 18), 3).side).toBe(1);
		// A light body on a white page has no light side: it goes dark.
		expect(glyphBand(rgb(240, 240, 240), rgb(255, 255, 255), 3).side).toBe(-1);
	});

	it('compression is monotone and leaves well-inside luminances nearly untouched', () => {
		const band = glyphBand(rgb(35, 50, 79), rgb(242, 240, 235), 3);
		let prev = -1;
		for (let l = 0; l <= 1; l += 0.001) {
			const c = compressLuminance(l, band);
			expect(c).toBeGreaterThanOrEqual(prev - 1e-12);
			expect(c).toBeLessThanOrEqual(band.hi);
			prev = c;
		}
		expect(compressLuminance(0.02, band)).toBeCloseTo(0.02, 3);
		expect(lumOf(clampGlyph([0.02, 0.03, 0.08], band))).toBeCloseTo(lumOf([0.02, 0.03, 0.08]), 3);
	});

	it('the shader mirrors look.ts (soft knee, hue-preserving scale, white mix)', () => {
		expect(shaderSrc).toContain('uBand.z - k * softplus((uBand.z - l) / k)');
		expect(shaderSrc).toContain('uBand.y + k * softplus((l - uBand.y) / k)');
		expect(shaderSrc).toContain('min(target / l, 1.0 / peak)');
	});
});

describe('enamel config semantics', () => {
	it('undefined never overwrites a resolved value', () => {
		const resolved = { tone: 'dark' as const, reducedMotion: true, body: rgb(1, 2, 3) };
		assignDefined(resolved, { tone: undefined, reducedMotion: undefined, body: undefined });
		expect(resolved).toEqual({ tone: 'dark', reducedMotion: true, body: rgb(1, 2, 3) });
	});

	it('the engine resolves construction and setConfig through assignDefined only', () => {
		expect(engineSrc).toContain('assignDefined({ ...DEFAULTS }, options.config ?? {})');
		expect(engineSrc).toContain('assignDefined({ ...prev }, patch)');
		expect(engineSrc).not.toMatch(/\{ \.\.\.prev, \.\.\.patch \}/);
	});

	it('server-renders the plain text with no browser globals touched', async () => {
		const { render } = await import('svelte/server');
		const { default: EnamelText } = await import('../../EnamelText.svelte');
		const { body } = render(EnamelText, { props: { text: 'Enamel', tone: 'dark', color: 'oklch(0.8 0.05 80)' } });
		expect(body).toContain('>Enamel</span>');
		expect(body).toContain('aria-hidden="true"');
		expect(body).not.toContain('live');
	});

	it('the height field is R32F with EXT_color_buffer_float required (half float breaks conservation)', () => {
		expect(engineSrc).toContain("getExtension('EXT_color_buffer_float')");
		expect(engineSrc).toContain('gl.R32F, gl.RED, gl.FLOAT');
	});
});
