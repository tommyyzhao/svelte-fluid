import { expect, it } from 'vitest';
import { summarize, PAPER_THRESHOLDS } from './metrics.js';

it('keeps the registered paper thresholds and exact five-section flow convention', () => {
	expect(PAPER_THRESHOLDS).toEqual({
		mixed: 0.05,
		bearing: 0.1,
		mixedArea: 0.1,
		retention: 0.9,
		correlation: 0.2
	});
	const rows = Array.from({ length: 100 }, (_, i) => ({
		time: i + 1,
		flux: 10,
		fluxes: [10, 10, 10, 10, 10],
		re: 200,
		qmax: 1,
		probe: 0.2
	}));
	const s = summarize(rows, 2, 20);
	expect(s.flowTime).toBe(4);
	expect(s.durationInFlowTimes).toBe(25);
	expect(s.fluxSd).toBe(0);
	expect(s.spread).toBe(0);
	expect(s.dominantFrequency).toBeNull();
	expect(s.averagingWindow).toEqual([60, 100]);
	expect(s.sustainedPressureGrowth).toBe(false);
});

it('rejects near-Nyquist peaks and low aliases when expected bandwidth is undersampled', () => {
	const rows = (frequency: number, dt: number) =>
		Array.from({ length: 200 }, (_, i) => {
			const flux = 10 + Math.sin(2 * Math.PI * frequency * i * dt);
			return {
				time: i * dt,
				flux,
				fluxes: Array(5).fill(flux),
				re: 400,
				qmax: 1
			};
		});
	expect(summarize(rows(0.45, 1), 100, 100).dominantFrequency).toBeNull();
	expect(summarize(rows(0.2, 1), 100, 100, 0.8).dominantFrequency).toBeNull();
	expect(
		summarize(rows(0.8, 0.05), 100, 100, 0.8).dominantFrequency
	).toBeCloseTo(0.8);
});

it('recognizes sustained pressure growth without declaring slow spin-up periodic', () => {
	const rows = Array.from({ length: 100 }, (_, i) => ({
		time: i + 1,
		flux: 10,
		fluxes: [10, 10, 10, 10, 10],
		re: 200,
		qmax: Math.exp(i / 10)
	}));
	const s = summarize(rows, 2, 20);
	expect(s.sustainedPressureGrowth).toBe(true);
	expect(s.dominantFrequency).toBeNull();
});
