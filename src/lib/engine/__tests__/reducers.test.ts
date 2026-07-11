import { describe, expect, it } from 'vitest';
import {
	divergenceL2,
	divergenceStats,
	fieldEnergy,
	fluxAcrossLine,
	gridScaleEnergyFraction,
	hasNonFinite,
	l2Norm,
	peakVectorMagnitude,
	signChangeCount,
	solidFaceFluxStats,
	trackPeakAlongPath
} from '../__benches__/reducers.js';

describe('bench reducers', () => {
	it('computes l2Norm with known answers', () => {
		expect(l2Norm(new Float32Array([3, 4]))).toBe(5);
	});

	it('returns near-zero divergence for a constant vector field', () => {
		const velocity = new Float32Array([1, 2, 1, 2, 1, 2, 1, 2]); // 2x2 field
		expect(divergenceL2(velocity, 2, 2)).toBeLessThan(1e-12);
	});

	it('measures divergence with closed solid ghost values', () => {
		const velocity = new Float32Array([
			0, 0, 1, 1, 0, 0,
			0, 0, 2, 2, 0, 0,
			0, 0, 1, 1, 0, 0
		]);
		const solid = new Uint8Array([
			1, 0, 1,
			1, 0, 1,
			1, 0, 1
		]);
		const stats = divergenceStats(velocity, 3, 3, 2, solid);
		expect(stats.fluidCells).toBe(3);
		expect(stats.rms).toBeGreaterThan(0);
		expect(stats.max).toBeGreaterThanOrEqual(stats.rms);
	});

	it('measures peak magnitude and fluid-side solid-face normal flux', () => {
		const velocity = new Float32Array([2, 3, 0, 0]);
		const solid = new Uint8Array([0, 1]);
		expect(peakVectorMagnitude(velocity, 2, 1)).toBeCloseTo(Math.sqrt(13));
		expect(solidFaceFluxStats(velocity, 2, 1, solid)).toEqual({
			meanAbs: 2,
			maxAbs: 2,
			faceCount: 1
		});
	});

	it('tracks the peak value along a crafted path', () => {
		const samples = new Float32Array([0, -1, 4, -2, 3]);
		const peak = trackPeakAlongPath(samples, 0, 4);
		expect(peak.index).toBe(2);
		expect(peak.value).toBe(4);
	});

	it('tracks the peak value along a descending path', () => {
		const samples = new Float32Array([0, -1, 4, -2, 3]);
		const peak = trackPeakAlongPath(samples, 4, 0);
		expect(peak.index).toBe(2);
		expect(peak.value).toBe(4);
	});

	it('counts sign changes in a crafted sequence', () => {
		expect(signChangeCount(new Float32Array([0.2, -0.2, -0.1, 0.5, 0.5, -0.2, 0.1]))).toBe(4);
	});

	it('integrates constant field flux along a line', () => {
		const scalarField = new Float32Array([1, 1, 1, 1, 1, 1]); // 2x3, row major
		expect(fluxAcrossLine(scalarField, 3, 2, { line: 0, orientation: 'horizontal' })).toBe(3);
		expect(fluxAcrossLine(scalarField, 3, 2, { line: 1, orientation: 'horizontal' })).toBe(3);
		expect(fluxAcrossLine(scalarField, 3, 2, { line: 1, orientation: 'vertical' })).toBe(2);
	});

	it('detects non-finite values', () => {
		expect(hasNonFinite(new Float32Array([0.1, 0.2, 0.3]))).toBe(false);
		expect(hasNonFinite(new Float32Array([0.1, Infinity, 0.2]))).toBe(true);
		expect(hasNonFinite(new Float32Array([0.1, Number.NaN, 0.2]))).toBe(true);
	});

	it('computes field energy with a known field', () => {
		expect(fieldEnergy(new Float32Array([3, 4]))).toBeCloseTo(Math.sqrt(12.5));
	});

	it('computes near-zero grid-scale energy fraction for smooth fields', () => {
		const w = 16;
		const h = 16;
		const field = new Float32Array(w * h * 2);
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const idx = (y * w + x) * 2;
				const value = (x + y) / (w + h);
				field[idx] = value;
				field[idx + 1] = value;
			}
		}
		expect(gridScaleEnergyFraction(field, w, h)).toBeLessThan(0.05);
	});

	it('computes a high grid-scale energy fraction for checkerboard noise', () => {
		const size = 16;
		const field = new Float32Array(size * size * 2);
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				const idx = (y * size + x) * 2;
				const value = (x + y) % 2 === 0 ? 1 : -1;
				field[idx] = value;
				field[idx + 1] = -value;
			}
		}
		expect(gridScaleEnergyFraction(field, size, size)).toBeGreaterThan(0.8);
		expect(gridScaleEnergyFraction(field, size, size)).toBeLessThan(1.01);
	});
});
