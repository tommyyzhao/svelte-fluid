/*
 * FoilSwitch (ADR-0096): ODE timing ported from the R&D tests, contrast budget,
 * undefined semantics. Pure: no DOM, no GL.
 */
import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance } from '../contrast.js';
import { FOIL_DEFAULTS, resolveFoilConfig } from '../foil/FoilEngine.js';
import { FOIL_LOOKS, METAL_MIN_CONTRAST, clampMetal, hexToRgb, metalBand, metalContrast } from '../foil/look.js';
import { advanceCommittedFoil, foilEnergy, foilSettled, foilTarget, type FoilState } from '../foil/model.js';
import { FOIL_FS } from '../foil/shaders.js';

describe('metal contrast budget (WCAG 1.4.11)', () => {
	const pages = { light: hexToRgb(FOIL_LOOKS.light.page), dark: hexToRgb(FOIL_LOOKS.dark.page) };
	const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

	it.each(['light', 'dark'] as const)('%s: every possible metal colour clamps to ≥3:1 against the page', (tone) => {
		const band = metalBand(pages[tone]);
		let worst = Infinity;
		// The shader's metal is 1 − e^−x per channel: anywhere in the linear unit cube.
		const steps = [0, 0.002, 0.01, 0.03, 0.06, 0.1, 0.15, 0.2, 0.3, 0.45, 0.6, 0.8, 0.95, 0.999];
		for (const r of steps) for (const g of steps) for (const b of steps) worst = Math.min(worst, metalContrast(clampMetal([r, g, b], band), pages[tone]));
		expect(worst).toBeGreaterThanOrEqual(METAL_MIN_CONTRAST);
	});

	it('the budget holds for any page and is tight, not decorative', () => {
		for (let v = 0; v <= 255; v += 15) {
			const page = { r: v, g: v, b: v };
			const band = metalBand(page);
			const pageLum = relativeLuminance(v / 255, v / 255, v / 255);
			const best = Math.max(contrastRatio(0, pageLum), contrastRatio(1, pageLum));
			for (const c of [0, 0.05, 0.2, 0.5, 1]) {
				const ratio = metalContrast(clampMetal([c, c, c], band), page);
				expect(ratio).toBeGreaterThanOrEqual(Math.min(METAL_MIN_CONTRAST, best - 0.2));
			}
		}
	});

	it.each(['light', 'dark'] as const)('%s: the knee keeps highlight gradients (monotone, not flattened)', (tone) => {
		const band = metalBand(pages[tone]);
		let prev = -1;
		for (let v = 0; v <= 1; v += 0.01) {
			const l = lum(clampMetal([v, v, v], band));
			expect(l).toBeGreaterThanOrEqual(prev - 1e-12);
			prev = l;
		}
		if (band.dir < 0) expect(lum(clampMetal([0.9, 0.9, 0.9], band)) - lum(clampMetal([0.5, 0.5, 0.5], band))).toBeGreaterThan(0.005);
	});

	it('the shader clamp mirrors look.ts', () => {
		expect(FOIL_FS).toContain('float knee = uKnee * bound;');
		expect(FOIL_FS).toContain('lin * ((knee + span * (1.0 - exp(-(l - knee) / span))) / l)');
		expect(FOIL_FS).toContain('lin + (vec3(1.0) - lin) * clamp((bound - l) / max(1.0 - l, 1e-4), 0.0, 1.0)');
	});

	it('focus rings clear 3:1 against their page', () => {
		for (const tone of ['light', 'dark'] as const) {
			const ring = hexToRgb(FOIL_LOOKS[tone].ring);
			const page = pages[tone];
			expect(contrastRatio(relativeLuminance(ring.r / 255, ring.g / 255, ring.b / 255), relativeLuminance(page.r / 255, page.g / 255, page.b / 255))).toBeGreaterThanOrEqual(3);
		}
	});
});

describe('SSR', () => {
	it('renders a native switch with the vector arch and touches no browser API', async () => {
		const { render } = await import('svelte/server');
		const { default: FoilSwitch } = await import('../../FoilSwitch.svelte');
		const { body } = render(FoilSwitch, { props: { checked: true } });
		expect(body).toContain('role="switch"');
		expect(body).toContain('aria-checked="true"');
		expect(body).toContain('type="button"');
		expect(body).toContain('Q48 48');
	});
});

describe('undefined semantics', () => {
	it('an undefined field never overwrites a resolved value or reappears as the default', () => {
		const rich = resolveFoilConfig(FOIL_DEFAULTS, { checked: true, hover: { x: 0.2, y: 0.8 }, reducedMotion: true, page: { r: 1, g: 2, b: 3 } });
		expect(resolveFoilConfig(rich, { checked: undefined, hover: undefined, reducedMotion: undefined, page: undefined })).toEqual(rich);
		// null is a value (no hover), not "not supplied".
		expect(resolveFoilConfig(rich, { hover: null }).hover).toBeNull();
		expect(FOIL_DEFAULTS.checked).toBe(false);
	});
});

describe('committed foil timing (R&D parity)', () => {
	it.each([60, 120, 240])('crosses within 85 ms, captures within 220 ms, overshoot ≤5.4%% at %i Hz', (hz) => {
		// Authored simulation-time targets, not calibrated metal or browser latency.
		for (const target of [-1, 1] as const) {
			const state: FoilState = { amplitude: -target, velocity: 0 };
			let active = true;
			let crossing = Infinity;
			let near = Infinity;
			let captured = Infinity;
			let maximum = 1;
			for (let frame = 1; frame <= hz; frame++) {
				active = advanceCommittedFoil(state, 1 / hz, target, active);
				maximum = Math.max(maximum, Math.abs(state.amplitude));
				if (state.amplitude * target >= 0) crossing = Math.min(crossing, frame / hz);
				if (Math.abs(state.amplitude - target) < 0.02) near = Math.min(near, frame / hz);
				if (!active) captured = Math.min(captured, frame / hz);
				expect(Number.isFinite(state.velocity)).toBe(true);
			}
			expect(crossing).toBeLessThanOrEqual(0.085);
			expect(near).toBeLessThanOrEqual(0.13);
			expect(captured).toBeGreaterThanOrEqual(0.15);
			expect(captured).toBeLessThanOrEqual(0.22);
			expect(maximum - 1).toBeLessThanOrEqual(0.054);
			// Capture removes the actuator; idle does not leave a fading tail.
			expect(state).toEqual({ amplitude: target, velocity: 0 });
			expect(active).toBe(false);
		}
	});

	it.each([1 / 60, 1 / 30, 0.075])('settles the latest intent after rapid %fs reversals without growing overshoot', (interval) => {
		for (const hz of [60, 120, 240]) {
			const state: FoilState = { amplitude: 1, velocity: 0 };
			let active = false;
			let maximum = 1;
			let target: -1 | 1 = -1;
			const step = () => {
				active = advanceCommittedFoil(state, 1 / hz, target, active);
				maximum = Math.max(maximum, Math.abs(state.amplitude));
			};
			for (let flip = 0; flip < 13; flip++) {
				target = flip % 2 === 0 ? -1 : 1;
				active = true;
				for (let frame = 0; frame < Math.round(interval * hz); frame++) step();
			}
			for (let frame = 0; frame < Math.ceil(0.22 * hz); frame++) step();
			expect(maximum).toBeLessThan(1.08);
			expect(state).toEqual({ amplitude: target, velocity: 0 });
			expect(active).toBe(false);
		}
	});

	it('hover teases curvature without escaping either well, and the rest test sees it settle', () => {
		for (const target of [-1, 1] as const) {
			const state: FoilState = { amplitude: target, velocity: 0 };
			for (let i = 0; i < 1200; i++) {
				advanceCommittedFoil(state, 1 / 120, target, false, 6 * Math.sin(i / 30));
				expect(state.amplitude * target).toBeGreaterThan(0.8);
			}
			for (let i = 0; i < 360; i++) advanceCommittedFoil(state, 1 / 120, target, false, 0);
			expect(state.amplitude).toBeCloseTo(target, 7);
			expect(foilSettled(state, false, 0)).toBe(true);
		}
	});

	it('two equal wells; checked bows down, unchecked arches up; bad dt is a no-op', () => {
		expect(foilEnergy(-1)).toBe(foilEnergy(1));
		expect(foilEnergy(0)).toBeGreaterThan(foilEnergy(1));
		expect([foilTarget(true), foilTarget(false)]).toEqual([-1, 1]);
		const state = { amplitude: 1, velocity: 0 };
		expect(advanceCommittedFoil(state, NaN, -1, true)).toBe(true);
		expect(advanceCommittedFoil(state, -1, -1, true)).toBe(true);
		expect(state).toEqual({ amplitude: 1, velocity: 0 });
	});
});
