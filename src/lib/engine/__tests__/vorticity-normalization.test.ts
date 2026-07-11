import { describe, expect, it } from 'vitest';
import { VORTICITY_ADAPTIVE_HI, VORTICITY_ADAPTIVE_LO } from '../shaders.js';
import {
	adaptiveVorticityWeight,
	normalizedVorticityMagnitude,
	VORTICITY_REFERENCE_RESOLUTION,
	vorticityNormalizationScale
} from '../vorticity-normalization.js';
import engineSource from '../FluidEngine.ts?raw';
import shaderSource from '../shaders.ts?raw';

describe('resolution-normalized adaptive vorticity', () => {
	it('has known answers below, within, and above the real threshold band', () => {
		const n = VORTICITY_REFERENCE_RESOLUTION;
		expect(adaptiveVorticityWeight(VORTICITY_ADAPTIVE_LO * 0.25, n, n)).toBe(0);
		const midpointCurlSample = (VORTICITY_ADAPTIVE_LO + VORTICITY_ADAPTIVE_HI) * 0.25;
		expect(adaptiveVorticityWeight(midpointCurlSample, n, n)).toBeCloseTo(0.5, 12);
		expect(adaptiveVorticityWeight(VORTICITY_ADAPTIVE_HI, n, n)).toBe(1);
	});

	it('maps equivalent continuous fields to the same gate across the resolution sweep', () => {
		const referenceSample = 0.025;
		const referenceOmega = normalizedVorticityMagnitude(referenceSample, 128, 128);
		for (const resolution of [64, 96, 128, 192, 256]) {
			// The shader's centered difference is proportional to h = 1/N.
			const equivalentSample = referenceSample * (128 / resolution);
			expect(normalizedVorticityMagnitude(equivalentSample, resolution, resolution)).toBeCloseTo(referenceOmega, 12);
			expect(adaptiveVorticityWeight(equivalentSample, resolution, resolution)).toBeCloseTo(
				adaptiveVorticityWeight(referenceSample, 128, 128),
				12
			);
		}
	});

	it('leaves reference-resolution normalization unchanged', () => {
		for (const sample of [-0.1, -0.02, 0, 0.02, 0.1]) {
			expect(normalizedVorticityMagnitude(sample, 128, 128)).toBe(Math.abs(sample * 2));
		}
		expect(vorticityNormalizationScale(128, 128)).toBe(1);
	});

	it('uses the screen-isotropic grid dimension for non-square targets', () => {
		expect(vorticityNormalizationScale(256, 128)).toBe(1);
		expect(vorticityNormalizationScale(192, 256)).toBe(1.5);
	});

	it('wires the same scale into the adaptive shader gate', () => {
		expect(shaderSource).toContain('uniform float uVorticityScale;');
		expect(shaderSource).toContain('float omega = abs(C) * 2.0 * uVorticityScale;');
		expect(engineSource).toContain('this.vorticityProgram.uniforms.uVorticityScale');
		expect(engineSource).toContain('vorticityNormalizationScale(this.velocity.width, this.velocity.height)');
	});
});
