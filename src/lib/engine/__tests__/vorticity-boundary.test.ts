import { describe, expect, it } from 'vitest';
import { solidNeighborConfinementAttenuation } from '../FluidEngine.js';

describe('vorticity boundary attenuation mirror', () => {
	it('keeps confinement unattenuated when no neighbor is solid', () => {
		expect(solidNeighborConfinementAttenuation(0, 0, 0, 0)).toBe(1);
	});

	it('suppresses confinement when any face neighbor is solid', () => {
		expect(solidNeighborConfinementAttenuation(1, 0, 0, 0)).toBe(0);
		expect(solidNeighborConfinementAttenuation(0, 0, 1, 0)).toBe(0);
		expect(solidNeighborConfinementAttenuation(0, 0, 0, 1)).toBe(0);
		expect(solidNeighborConfinementAttenuation(0, 1, 0, 0)).toBe(0);
	});
});

