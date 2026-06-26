import { describe, expect, it } from 'vitest';
import { DEFAULTS, curlScale, viscosityAlpha } from '../FluidEngine.js';

describe('resolution gauge helpers', () => {
	it('keeps viscosityAlpha byte-identical at N_ref across aspect ratios', () => {
		const viscosity = 0.019;
		const dt = 1 / 120;
		const nRef = DEFAULTS.SIM_RESOLUTION;

		expect(viscosityAlpha(viscosity, dt, 256, nRef, nRef)).toBeCloseTo(viscosity * dt * 256, 12);
		expect(viscosityAlpha(viscosity, dt, 640, nRef, nRef)).toBeCloseTo(viscosity * dt * 640, 12);
		expect(viscosityAlpha(viscosity, dt, 1024, nRef, nRef)).toBeCloseTo(viscosity * dt * 1024, 12);
	});

	it('scales viscosityAlpha as O(N^2) at fixed aspect ratio', () => {
		const viscosity = 0.022;
		const dt = 1 / 120;

		const nRef = DEFAULTS.SIM_RESOLUTION;
		const a1 = viscosityAlpha(viscosity, dt, 256, 144, nRef); // N_actual=144
		const a2 = viscosityAlpha(viscosity, dt, 512, 288, nRef); // N_actual=288
		expect(a2 / a1).toBeCloseTo(4, 12);
	});

	it('applies curl normalization so N_ref remains the fixed feel anchor', () => {
		const curl = 12;
		const nRef = DEFAULTS.SIM_RESOLUTION;

		expect(curlScale(curl, nRef, nRef, nRef)).toBe(curl);
		expect(curlScale(curl, 192, 192, nRef)).toBeCloseTo(curl * (nRef / 192), 6);
		expect(curlScale(curl, 512, 384, nRef)).toBeCloseTo(curl * (nRef / 384), 12);
	});
});
