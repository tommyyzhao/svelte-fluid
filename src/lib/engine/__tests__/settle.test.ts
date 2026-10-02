import { describe, expect, it } from 'vitest';
import { DEFAULTS, resolveConfig } from '../FluidEngine.js';
import { PRESETS } from '../../presets/registry.js';
import { SETTLE_EPSILON, hasContinuousDriver, isQuiet } from '../settle.js';

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
