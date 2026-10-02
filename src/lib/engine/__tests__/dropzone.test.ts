/*
 * Drop zone and caustics overlay (ADR-0094): contrast proof, drag mapping,
 * callback isolation, undefined semantics and input caps. Pure: no DOM, no GL.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contrastRatio, relativeLuminance } from '../contrast.js';
import { acceptsFile, deliverFiles, filesMessage, pickFiles } from '../surface/attach.js';
import { CAUSTICS, LABEL_MIN_CONTRAST, LOOKS, hexContrast, hexToSrgb, overlayBudget, overlayCap, overlayContrast, overlayPixel } from '../surface/look.js';
import type { Srgb } from '../surface/look.js';
import {
	CLIMB,
	MAX_QUEUED_IMPULSES,
	RIPPLE_THROTTLE,
	admitRipple,
	ambientWaves,
	climbHeight,
	dragProximity,
	enqueueImpulse,
	roundRectDistance,
	type Impulse
} from '../surface/wave.js';
import shaderSrc from '../surface/shaders.ts?raw';

afterEach(() => vi.restoreAllMocks());

// Body text on the page each tone is designed for (the shots and FluidText's measured case).
const PAIRS = {
	light: { text: '#1a1c21', bg: LOOKS.button.light.page },
	dark: { text: '#e9edf4', bg: LOOKS.button.dark.page }
} as const;

describe('caustics contrast proof', () => {
	it.each(['light', 'dark'] as const)('%s: body text keeps ≥4.5:1 at the default and maximum intensity', (tone) => {
		const text = hexToSrgb(PAIRS[tone].text);
		const bg = hexToSrgb(PAIRS[tone].bg);
		for (const intensity of [undefined, 1]) {
			const k = overlayCap(intensity, text, bg, tone);
			// Clearly visible: the default peak is a quarter of the way to the tint or more.
			expect(k).toBeGreaterThanOrEqual(0.25);
			expect(overlayContrast(text, bg, k, tone)).toBeGreaterThanOrEqual(LABEL_MIN_CONTRAST);
		}
		// Above the clamp the proof would fail: the budget is tight, not decorative.
		const budget = overlayBudget(text, bg, tone);
		if (budget < 1) expect(overlayContrast(text, bg, Math.min(1, budget + 0.02), tone)).toBeLessThan(LABEL_MIN_CONTRAST);
	});

	it('clamps intensity for any page pair that passes on its own, and draws nothing when it does not', () => {
		// Deterministic sweep of text/background greys and tints.
		let seed = 7;
		const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
		for (let i = 0; i < 400; i++) {
			const tone = i % 2 ? 'dark' : 'light';
			const bg: Srgb = tone === 'dark' ? [rnd() * 0.25, rnd() * 0.25, rnd() * 0.3] : [0.75 + rnd() * 0.25, 0.75 + rnd() * 0.25, 0.75 + rnd() * 0.25];
			const text: Srgb = tone === 'dark' ? [0.6 + rnd() * 0.4, 0.6 + rnd() * 0.4, 0.6 + rnd() * 0.4] : [rnd() * 0.45, rnd() * 0.45, rnd() * 0.45];
			for (const intensity of [undefined, 0, 0.5, 1, 7, -3, NaN]) {
				const k = overlayCap(intensity, text, bg, tone);
				expect(k).toBeGreaterThanOrEqual(0);
				expect(k).toBeLessThanOrEqual(CAUSTICS[tone].nominal);
				if (overlayContrast(text, bg, 0, tone) >= LABEL_MIN_CONTRAST) expect(overlayContrast(text, bg, k, tone)).toBeGreaterThanOrEqual(LABEL_MIN_CONTRAST);
				else expect(k).toBe(0);
			}
		}
	});

	it('overlayPixel is the CSS blend the canvas is composited with', () => {
		// Dark: premultiplied (tint·k, k) under mix-blend-mode: screen = d + k·tint·(1 − d).
		// Light: plain source-over = d·(1 − k) + k·tint.
		const d: Srgb = [0.2, 0.5, 0.9];
		const screen = (cb: number, cs: number) => cb + cs - cb * cs;
		const k = 0.3;
		const dark = overlayPixel(d, k, 'dark');
		CAUSTICS.dark.tint.forEach((t, i) => expect(dark[i]).toBeCloseTo(d[i] * (1 - k) + k * screen(d[i], t), 12));
		const light = overlayPixel(d, k, 'light');
		CAUSTICS.light.tint.forEach((t, i) => expect(light[i]).toBeCloseTo(d[i] * (1 - k) + k * t, 12));
		// Dark only adds light; light only shades.
		for (const v of [0, 0.3, 1]) {
			expect(relativeLuminance(...overlayPixel([v, v, v], 0.4, 'dark'))).toBeGreaterThanOrEqual(relativeLuminance(v, v, v) - 1e-12);
		}
		expect(contrastRatio(relativeLuminance(...overlayPixel([0.95, 0.94, 0.92], 0.34, 'light')), relativeLuminance(0.95, 0.94, 0.92))).toBeGreaterThan(1.5);
	});

	it('the shader never draws above the clamped peak, dither included', () => {
		expect(shaderSrc).toContain('float kO = clamp(uOverlay.y * clamp(v, 0.0, 1.0) * fade + dither * step(0.001, v * fade), 0.0, uOverlay.y);');
		expect(shaderSrc).toContain('outColor = vec4(uOverlayTint * kO, kO);');
	});

	it('the drop-zone label meets 4.5:1 on its tray', () => {
		for (const tone of ['light', 'dark'] as const) {
			const look = LOOKS.dropzone[tone];
			expect(hexContrast(look.text, look.fill)).toBeGreaterThanOrEqual(LABEL_MIN_CONTRAST);
			expect(hexContrast(look.text, look.fillLow)).toBeGreaterThanOrEqual(LABEL_MIN_CONTRAST);
			expect(hexContrast(look.ring, look.page)).toBeGreaterThanOrEqual(3);
		}
	});
});

describe('drag-over climb mapping', () => {
	const rect = { x: 0, y: 0, width: 480, height: 200 };

	it('proximity is 1 on or inside the zone and fades to 0 at the reach', () => {
		expect(dragProximity(roundRectDistance(240, 100, rect, 18))).toBe(1);
		expect(dragProximity(0)).toBe(1);
		expect(dragProximity(CLIMB.reach)).toBe(0);
		expect(dragProximity(CLIMB.reach * 2)).toBe(0);
		expect(dragProximity(NaN)).toBe(0);
		let last = 1;
		for (let d = 0; d <= CLIMB.reach; d += 10) {
			const p = dragProximity(d);
			expect(p).toBeLessThanOrEqual(last);
			last = p;
		}
	});

	it('the rounded-rect distance matches the geometry', () => {
		expect(roundRectDistance(-10, 100, rect, 18)).toBeCloseTo(10, 9);
		expect(roundRectDistance(240, 100, rect, 18)).toBeCloseTo(-100, 9);
		// Corner arc: distance to the arc centre minus the radius.
		expect(roundRectDistance(-10, -10, rect, 18)).toBeCloseTo(Math.hypot(28, 28) - 18, 9);
	});

	it('the wall nearest the pointer climbs highest, and the climb dies away from the walls', () => {
		const spread = 90;
		const near = { x: -20, y: 100 };
		const left = climbHeight(2, 100, rect, near, 1, spread);
		const right = climbHeight(478, 100, rect, near, 1, spread);
		expect(left).toBeGreaterThan(3 * right);
		expect(left).toBeGreaterThan(CLIMB.rise * 0.8);
		expect(climbHeight(240, 100, rect, near, 1, spread)).toBeLessThan(0.05 * left);
		// Mirror image: pointer on the right.
		expect(climbHeight(478, 100, rect, { x: 500, y: 100 }, 1, spread)).toBeCloseTo(left, 9);
		// Strength scales linearly; no drag, no climb.
		expect(climbHeight(2, 100, rect, near, 0.5, spread)).toBeCloseTo(left / 2, 12);
		expect(climbHeight(2, 100, rect, near, 0, spread)).toBe(0);
	});

	it('the shader climb is the four-wall sum (no SDF crease)', () => {
		expect(shaderSrc).toContain('float c = amp * (f + (1.0 - f) * N) * E;');
		expect(shaderSrc).toContain('for (int i = 0; i < 4; i++) {');
	});
});

describe('files: picking, isolation and announcement', () => {
	const f = (name: string, type: string) => ({ name, type });

	it('filters drops like the native accept list and honours multiple', () => {
		const files = [f('a.PNG', 'image/png'), f('b.txt', 'text/plain'), f('c.jpg', 'image/jpeg')];
		expect(pickFiles(files, 'image/*', true).map((x) => x.name)).toEqual(['a.PNG', 'c.jpg']);
		expect(pickFiles(files, '.png, .txt', true).map((x) => x.name)).toEqual(['a.PNG', 'b.txt']);
		expect(pickFiles(files, 'text/plain', true).map((x) => x.name)).toEqual(['b.txt']);
		// undefined = not supplied: accept all, single file.
		expect(pickFiles(files, undefined, undefined)).toHaveLength(1);
		expect(pickFiles(files, '', true)).toHaveLength(3);
		expect(acceptsFile(f('x', ''), 'image/*')).toBe(false);
	});

	it('onfiles throwing is logged and isolated; the result is still announced', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const files = [f('a', ''), f('b', '')];
		const message = deliverFiles(files, () => {
			throw new Error('consumer');
		});
		expect(message).toBe('2 files selected');
		expect(error).toHaveBeenCalledOnce();
	});

	it('announces with the override, falls back when it throws or returns nothing', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const one = [f('a', '')];
		const onfiles = vi.fn();
		expect(deliverFiles(one, onfiles, (x) => `${x.length} ficheiro`)).toBe('1 ficheiro');
		expect(onfiles).toHaveBeenCalledWith(one);
		expect(deliverFiles(one, undefined, () => '')).toBe('1 file selected');
		expect(
			deliverFiles(one, undefined, () => {
				throw new Error('x');
			})
		).toBe('1 file selected');
		expect(filesMessage([1, 2, 3])).toBe('3 files selected');
	});

	it('an empty pick (cancelled picker, rejected drop) calls nothing', () => {
		const onfiles = vi.fn();
		const announce = vi.fn();
		expect(deliverFiles([], onfiles, announce)).toBe('');
		expect(onfiles).not.toHaveBeenCalled();
		expect(announce).not.toHaveBeenCalled();
	});
});

describe('caustics input caps and determinism', () => {
	it('throttles pointer ripples by time and travel', () => {
		const gate = { t: -Infinity, x: -Infinity, y: -Infinity };
		let admitted = 0;
		// 1 s of 1 kHz pointer events sweeping 2 px per event.
		for (let i = 0; i < 1000; i++) if (admitRipple(gate, i, i * 2, 50)) admitted++;
		expect(admitted).toBeLessThanOrEqual(Math.ceil(1000 / RIPPLE_THROTTLE.interval) + 1);
		expect(admitted).toBeGreaterThan(5);
		// A still pointer never re-ripples.
		const still = { t: -Infinity, x: -Infinity, y: -Infinity };
		expect(admitRipple(still, 0, 10, 10)).toBe(true);
		expect(admitRipple(still, 1000, 12, 10)).toBe(false);
		expect(admitRipple(still, 2000, NaN, 10)).toBe(false);
	});

	it('the impulse queue stays bounded whatever the event rate', () => {
		const q: Impulse[] = [];
		const gate = { t: -Infinity, x: -Infinity, y: -Infinity };
		for (let i = 0; i < 10000; i++) if (admitRipple(gate, i * 100, (i * 37) % 700, 100)) enqueueImpulse(q, { x: i, y: 0, amplitude: 1, sigma: 4 });
		expect(q).toHaveLength(MAX_QUEUED_IMPULSES);
	});

	it('ambient waves are deterministic per seed and spread in direction', () => {
		expect(ambientWaves(5)).toEqual(ambientWaves(5));
		expect(ambientWaves(5)).not.toEqual(ambientWaves(6));
		const w = ambientWaves(1);
		const angles = w.map((x) => Math.atan2(x.ky, x.kx));
		for (let i = 0; i < angles.length; i++)
			for (let j = i + 1; j < angles.length; j++) {
				const d = Math.abs(Math.sin(angles[i] - angles[j]));
				// No two trains parallel: crests cross into a net.
				expect(d).toBeGreaterThan(0.05);
			}
		for (const x of w) expect(x.amplitude).toBeLessThan(1);
	});
});
