/**
 * Adaptive vorticity confinement math mirror.
 *
 * The GLSL path is a single lerp between legacy confinement and
 * an adaptive-magnitude branch. The pure helper in `FluidEngine` must
 * stay byte-identical at `adaptiveMix = 0`.
 */
import { describe, expect, it } from 'vitest';
import {
	adaptiveConfinementMagnitude,
	VORTICITY_ADAPTIVE_HI,
	VORTICITY_ADAPTIVE_LO
} from '../FluidEngine.js';

describe('adaptive confinement magnitude mirror', () => {
	it('returns the legacy magnitude when adaptive mix is zero', () => {
		const curl = 30;
		const curlSample = 0.11;
		expect(adaptiveConfinementMagnitude(curl, curlSample, 0)).toBe(curl * curlSample);
	});

	it('applies lerp and normalized-vorticity gating exactly', () => {
		const curl = 30;
		const curlSample = VORTICITY_ADAPTIVE_LO * 0.75;
		const legacy = curl * curlSample;
		const omega = Math.abs(curlSample * 2);
		const t = Math.max(0, Math.min(1, (omega - VORTICITY_ADAPTIVE_LO) / (VORTICITY_ADAPTIVE_HI - VORTICITY_ADAPTIVE_LO)));
		const adaptiveWeight = t * t * (3 - 2 * t);
		const expected = legacy + (legacy * adaptiveWeight - legacy) * 0.4;

		expect(adaptiveConfinementMagnitude(curl, curlSample, 0.4)).toBeCloseTo(expected, 12);
	});

	it('normalizes the adaptive gate across equivalent grid samples', () => {
		const reference = adaptiveConfinementMagnitude(30, 0.025, 1, undefined, undefined, 128, 128);
		for (const resolution of [64, 96, 128, 192, 256]) {
			const equivalentSample = 0.025 * (128 / resolution);
			expect(
				adaptiveConfinementMagnitude(30, equivalentSample, 1, undefined, undefined, resolution, resolution) /
					(30 * equivalentSample)
			).toBeCloseTo(reference / (30 * 0.025), 12);
		}
	});
});
