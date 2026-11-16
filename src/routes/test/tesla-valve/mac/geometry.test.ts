import { expect, it } from 'vitest';
import { disturbanceBand } from './geometry.js';

// ADR 0122 numbers: 1080-wide valve, wet mean width 30.0898148, plenum ceil(4 * w) = 121.
const g = { plenum: 121, valveWidth: 1080, meanWidth: 30.0898148 };
const gridWidth = g.valveWidth + 2 * g.plenum;
const sponge = Math.ceil(g.meanWidth);

it('threads explicit default and non-default disturbance widths without reassociation', () => {
	for (const direction of [1, -1]) {
		expect(disturbanceBand(direction, g, 2.25, 0.7)).toEqual(
			disturbanceBand(direction, g)
		);
		const band = disturbanceBand(direction, g, 2, 0.5);
		expect(band.center).toBe(
			direction > 0
				? g.plenum - 2 * g.meanWidth
				: g.plenum + g.valveWidth + 2 * g.meanWidth
		);
		expect(band.halfWidth).toBe(0.5 * g.meanWidth);
	}
});

it('pins the disturbance forcing support and its 1.24-cell sponge clearance (ADR 0122 D-1 violation)', () => {
	for (const direction of [1, -1]) {
		const { center, halfWidth } = disturbanceBand(direction, g);
		const lo = center - halfWidth,
			hi = center + halfWidth;
		// Distance from the support to the sponge edge nearest the outflow end it faces.
		const clearance = direction > 0 ? lo - sponge : gridWidth - sponge - hi;
		// Mirrored into the inlet-end frame both directions give [32.24, 74.36].
		const [a, b] = direction > 0 ? [lo, hi] : [gridWidth - hi, gridWidth - lo];
		expect(a).toBeCloseTo(32.235, 3);
		expect(b).toBeCloseTo(74.3608, 3);
		expect(clearance).toBeCloseTo(1.235, 3);
		// D-1 requires >= 1 mean width; deliberately not met. Changing this invalidates the calibrations.
		expect(clearance).toBeLessThan(g.meanWidth);
	}
});
