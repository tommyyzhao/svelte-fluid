import { describe, expect, it } from 'vitest';
import { DEFAULTS, resolveConfig } from '../FluidEngine.js';
import { PRESETS } from '../../presets/registry.js';
import { SETTLE_EPSILON, hasContinuousDriver, isQuiet, isQuietFlags } from '../settle.js';

const base = { AUTO_SPLAT_RATE: 0, FLOW: null, COLORFUL: false, INITIAL_DENSITY_DISSIPATION_DURATION: 0 };

describe('hasContinuousDriver', () => {
	it('plain scene settles', () => expect(hasContinuousDriver(base, 100)).toBe(false));
	it('autoSplatRate blocks', () => expect(hasContinuousDriver({ ...base, AUTO_SPLAT_RATE: 0.2 }, 100)).toBe(true));
	it('driving flow blocks', () =>
		expect(
			hasContinuousDriver({ ...base, FLOW: { forces: [{ kind: 'gravity', vector: { x: 0, y: -1 } }] } }, 100)
		).toBe(true));
	it('inert flow does not block', () =>
		expect(hasContinuousDriver({ ...base, FLOW: { boundary: { left: 'open' } } }, 100)).toBe(false));
	it('prescribed grid blocks', () =>
		expect(
			hasContinuousDriver(
				{ ...base, FLOW: { prescribed: { kind: 'grid', velocity: { width: 1, height: 1, data: [0, 0] } } } },
				100
			)
		).toBe(true));
	it('initial dissipation ramp blocks until it ends', () => {
		const c = { ...base, INITIAL_DENSITY_DISSIPATION_DURATION: 2 };
		expect(hasContinuousDriver(c, 1)).toBe(true);
		expect(hasContinuousDriver(c, 2)).toBe(false);
	});
	it('COLORFUL does not block', () => expect(hasContinuousDriver({ ...base, COLORFUL: true }, 100)).toBe(false));
});

describe('isQuiet', () => {
	it('moving visible dye is not quiet', () => expect(isQuiet(5, 0.1, 1)).toBe(false));
	it('invisible dye is quiet whatever the velocity', () => expect(isQuiet(50, 0, 1)).toBe(true));
	it('bright dye still fading is not quiet', () => expect(isQuiet(0, 1, 1)).toBe(false));
	it('faded dye with no motion is quiet', () => expect(isQuiet(0, 0.03, 1)).toBe(true));
	it('zero dissipation keeps any dye quiet', () => expect(isQuiet(0, 5, 0)).toBe(true));
	it('epsilon is half an 8-bit step', () => expect(SETTLE_EPSILON).toBeCloseTo(0.5 / 255));
	it('public dissipation filters nonfinite input but negative finite values remain nonquiet', () => {
		expect(resolveConfig({ densityDissipation: NaN }, DEFAULTS).DENSITY_DISSIPATION).toBe(DEFAULTS.DENSITY_DISSIPATION);
		const resolved = resolveConfig({ densityDissipation: -1 }, DEFAULTS);
		expect(resolved.DENSITY_DISSIPATION).toBe(-1);
		expect(isQuiet(0, 0, resolved.DENSITY_DISSIPATION)).toBe(false);
	});
});

describe('RGBA8 quiet flags', () => {
	it('matches maxima including threshold boundaries and HDR', () => {
		for (const v of [0, 0.499, 0.5, 1000]) for (const d of [0, SETTLE_EPSILON / 2, SETTLE_EPSILON, 0.1, 1000]) for (const fade of [0, 1, 60]) {
			const bytes = [v >= 0.5 ? 255 : 0, 0, 0, 255, d >= SETTLE_EPSILON ? 255 : 0, d * (1 - 1 / (1 + fade / 60)) >= SETTLE_EPSILON ? 255 : 0, d !== 0 ? 255 : 0, 255];
			expect(isQuietFlags(bytes)).toBe(isQuiet(v, d, fade));
			expect(isQuietFlags(bytes, true)).toBe(d === 0);
		}
	});
	it('invalid buffers and maxima fail closed', () => {
		for (const bytes of [[], Array(8).fill(0), Array(8).fill(127), [NaN, 0, 0, 255, 0, 0, 0, 255], [255, 255, 0, 255, 0, 0, 0, 255]]) expect(isQuietFlags(bytes)).toBe(false);
		for (const n of [NaN, Infinity, -1]) {
			expect(isQuiet(n, 0, 1)).toBe(false);
			expect(isQuiet(0, n, 1)).toBe(false);
			expect(isQuiet(0, 0, n)).toBe(false);
		}
	});
});

describe('presets', () => {
	const flags = PRESETS.map((p) => ({
		id: p.id,
		continuous: hasContinuousDriver(resolveConfig(p.config as never, DEFAULTS), 1e6)
	}));
	for (const f of flags) {
		it(`${f.id} ${f.continuous ? 'never settles' : 'settles'}`, () => {
			expect(typeof f.continuous).toBe('boolean');
		});
	}
	it('classifies presets both ways', () => {
		expect(flags.some((f) => f.continuous)).toBe(true);
		expect(flags.some((f) => !f.continuous)).toBe(true);
		console.info('settling presets:', flags.filter((f) => !f.continuous).map((f) => f.id).join(', '));
	});
});
