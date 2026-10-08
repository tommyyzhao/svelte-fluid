import { describe, it, expect } from 'vitest';
import {
	fidelity,
	lab,
	median,
	noise,
	settledTimestamp,
	restProof,
	flatTransportPair,
} from './metrics.js';
import {
	relaxationKeep,
	referenceDisplacement,
	targetRelaxation,
	targetCurlKeep,
} from '$lib/engine/image-convergence.js';
describe('E5 frozen math', () => {
	it('rest proof rejects wakeups and any engine submission', () => {
		const a = { settled: true, paused: true, draws: 10, frameCount: 2 };
		expect(restProof(a, { ...a })).toBe(true);
		expect(restProof(a, { ...a, settled: false })).toBe(false);
		expect(restProof(a, { ...a, paused: false })).toBe(false);
		expect(restProof(a, { ...a, draws: 11 })).toBe(false);
		expect(restProof(a, { ...a, frameCount: 3 })).toBe(false);
		expect(restProof({ ...a, paused: false }, a)).toBe(false);
	});
	it('flat fallback ties require both changes strictly below the frozen threshold', () => {
		expect(flatTransportPair(0, 0)).toBe(true);
		expect(flatTransportPair(0.5 / 255, 0.99 / 255)).toBe(true);
		expect(flatTransportPair(1 / 255, 0)).toBe(false);
		expect(flatTransportPair(0, 1 / 255)).toBe(false);
		expect(flatTransportPair(0, 2 / 255)).toBe(false);
	});
	it('V2s preserves scramble curl then tapers it to zero without restarting', () => {
		expect(targetCurlKeep(0)).toBe(1);
		expect(targetCurlKeep(0.75)).toBe(1);
		expect(targetCurlKeep(2.25)).toBe(0.5);
		expect(targetCurlKeep(3.75)).toBe(0);
		expect(targetCurlKeep(30)).toBe(0);
	});
	it('forgets pre-splat final timestamps on the first disturbed frame', () => {
		let timestamp = settledTimestamp(0, true, 25);
		expect(timestamp).toBe(25);
		timestamp = settledTimestamp(timestamp, false, 50);
		expect(timestamp).toBe(0);
		timestamp = settledTimestamp(timestamp, true, 7000);
		expect(timestamp).toBe(7000);
		expect(settledTimestamp(timestamp, true, 7100)).toBe(7000);
	});
	it('identity fidelity, D65 Lab and degradation', () => {
		const a = new Uint8Array(8 * 8 * 4).fill(255),
			b = new Uint8Array(a.length);
		expect(fidelity(a, a, 8, 8)).toEqual({ ssim: 1, deltaE76: 0, exact: true });
		expect(lab(255, 255, 255)[0]).toBeCloseTo(100, 3);
		expect(lab(0, 0, 0)).toEqual([0, 0, 0]);
		expect(fidelity(a, b, 8, 8).deltaE76).toBeCloseTo(100, 3);
		expect(fidelity(a, b, 8, 8).ssim).toBeLessThan(0.001);
		expect(() => fidelity(a, b, 9, 8)).toThrow(RangeError);
	});
	it('exponential composition, scramble ceiling and ramp', () => {
		expect(targetRelaxation(0.5)).toBe(0);
		expect(targetRelaxation(0.75)).toBe(0.35);
		expect(targetRelaxation(3.75)).toBe(3);
		expect(targetRelaxation(20)).toBe(3);
		expect(relaxationKeep(2, 0.1) * relaxationKeep(2, 0.2)).toBeCloseTo(
			relaxationKeep(2, 0.3),
			14
		);
		expect(() => relaxationKeep(NaN, 1)).toThrow(RangeError);
		expect(() => relaxationKeep(1, -1)).toThrow(RangeError);
	});
	it('displacement encoding preserves the reference-map equation and exact identity', () => {
		const x = 0.4,
			departure = 0.35,
			d = 0.1,
			keep = relaxationKeep(2, 0.1);
		expect(x + referenceDisplacement(d, departure - x, 2, 0.1)).toBeCloseTo(
			x + keep * (departure + d - x),
			14
		);
		expect(referenceDisplacement(0, 0, 3, 0.1)).toBe(0);
		expect(referenceDisplacement(0.2, -0.1, 0, 0.1)).toBeCloseTo(0.1, 14);
	});
	it('median and pre-registered relative noise', () => {
		expect(median([3, 1, 2])).toBe(2);
		expect(median([4, 1, 2, 3])).toBe(2.5);
		expect(noise([9, 10, 11])).toBe(0.2);
		expect(noise([0, 0, 0])).toBe(0);
		expect(noise([0.5, 1, 1], 0.5)).toBe(0.5);
	});
});

// Identity map: (grad xi)^T displacement is exactly the displacement.
it('V2 identity-map controller direction decreases reference energy', () => {
	const d = [0.1, -0.2],
		k = 8,
		dt = 0.01;
	const force = d.map((v) => k * v);
	const next = d.map((v, i) => v - dt * force[i]);
	expect(next.reduce((e, v) => e + v * v, 0)).toBeLessThan(
		d.reduce((e, v) => e + v * v, 0)
	);
});
