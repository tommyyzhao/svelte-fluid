import { PAPER_ISLAND_CENTERS, PAPER_VIEWBOX } from './geometry.js';
import type { PaperMacEngine } from './engine.js';

// ADR 0117 thresholds frozen before the MAC results. Geometry now has 11 units.
export const PAPER_THRESHOLDS = {
	mixed: 0.05,
	bearing: 0.1,
	mixedArea: 0.1,
	retention: 0.9,
	correlation: 0.2
};

export function paperDyeMetrics(engine: PaperMacEngine) {
	const g = engine.geometry,
		scale = engine.options.dyeScale,
		w = engine.dye.width,
		h = engine.dye.height;
	const dye = engine.read(engine.dye.read, 4),
		mask = g.valve.cells;
	const fluid = (x: number, y: number) =>
		x >= 0 &&
		x < g.valveWidth &&
		y >= 0 &&
		y < g.height &&
		!!mask[Math.floor(y) * g.valveWidth + Math.floor(x)];
	// Patent's central corridor follows the line joining the two mouth centres.
	// At each column take the connected vertical wet interval containing that line.
	const corridor = Array.from({ length: g.valveWidth }, (_, x) => {
		const center = Math.floor(
			g.mouths[0] + ((g.mouths[1] - g.mouths[0]) * (x + 0.5)) / g.valveWidth
		);
		let lo = center,
			hi = center;
		if (!fluid(x, center)) return [1, 0];
		while (fluid(x, lo - 1)) lo--;
		while (fluid(x, hi + 1)) hi++;
		return [lo, hi + 1];
	});
	const caps = [
		0,
		...PAPER_ISLAND_CENTERS.slice(1).map(
			(x, i) => (x + PAPER_ISLAND_CENTERS[i]) / 2
		),
		PAPER_VIEWBOX[2]
	];
	const mass = [0, 0],
		inside = [0, 0],
		bearing = Array(11).fill(0),
		mixed = Array(11).fill(0);
	let sa = 0,
		sb = 0,
		sab = 0,
		saa = 0,
		sbb = 0,
		n = 0;
	for (let y = 0; y < h; y++)
		for (let x = g.plenum * scale; x < (g.plenum + g.valveWidth) * scale; x++) {
			const vx = (x + 0.5) / scale - g.plenum,
				vy = (y + 0.5) / scale;
			if (
				vx < 0.02 * g.valveWidth ||
				vx > 0.98 * g.valveWidth ||
				!fluid(vx, vy)
			)
				continue;
			const i = (y * w + x) * 4,
				a = dye[i],
				b = dye[i + 1];
			mass[0] += a;
			mass[1] += b;
			const interval = corridor[Math.floor(vx)];
			if (vy >= interval[0] && vy <= interval[1]) {
				inside[0] += a;
				inside[1] += b;
			}
			sa += a;
			sb += b;
			sab += a * b;
			saa += a * a;
			sbb += b * b;
			n++;
			const cm = (vx / g.valveWidth) * PAPER_VIEWBOX[2];
			let unit = caps.findIndex((edge) => edge > cm) - 1;
			unit = Math.max(0, Math.min(10, unit));
			const bin = engine.options.direction > 0 ? unit : 10 - unit;
			if (a + b > PAPER_THRESHOLDS.bearing) {
				bearing[bin]++;
				if (Math.min(a, b) > PAPER_THRESHOLDS.mixed) mixed[bin]++;
			}
		}
	const fractions = mixed.map((value, i) => value / Math.max(1, bearing[i]));
	const onset = fractions.findIndex(
		(value) => value > PAPER_THRESHOLDS.mixedArea
	);
	const retention = inside.map((value, i) => value / Math.max(1e-20, mass[i]));
	const correlation =
		(sab - (sa * sb) / n) /
		Math.max(1e-20, Math.sqrt((saa - (sa * sa) / n) * (sbb - (sb * sb) / n)));
	return {
		retention,
		correlation,
		mixed: fractions,
		onset: onset < 0 ? null : onset + 1,
		dyeMass: mass,
		forwardPass:
			retention.every((value) => value >= PAPER_THRESHOLDS.retention) &&
			correlation < PAPER_THRESHOLDS.correlation
	};
}

export function summarize(
	rows: {
		time: number;
		flux: number;
		fluxes: number[];
		re: number;
		qmax: number;
		probe?: number;
	}[],
	meanWidth: number,
	length: number,
	expectedFrequency?: number
) {
	const mean = (a: number[]) =>
		a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
	const tail = rows.slice(-Math.max(20, Math.floor(rows.length / 2)));
	let flowTime = (length * meanWidth) / mean(tail.map((r) => r.flux));
	let window = rows.filter((r) => r.time >= rows.at(-1)!.time - 10 * flowTime);
	for (let i = 0; i < 3; i++) {
		flowTime = (length * meanWidth) / mean(window.map((r) => r.flux));
		window = rows.filter((r) => r.time >= rows.at(-1)!.time - 10 * flowTime);
	}
	const flux = mean(window.map((r) => r.flux)),
		sd = Math.sqrt(mean(window.map((r) => (r.flux - flux) ** 2)));
	const sectionMeans = [0, 1, 2, 3, 4].map((i) =>
		mean(window.map((r) => r.fluxes[i]))
	);
	const probe = window.map((r) => r.probe ?? 0),
		probeMean = mean(probe);
	const probeSd = Math.sqrt(mean(probe.map((v) => (v - probeMean) ** 2)));
	const drift =
		window.length > 1 ? (window.at(-1)!.flux - window[0].flux) / flux : 0;
	// Reject a Fourier label for plain spin-up drift; report only an interior spectral peak.
	let dominantFrequency: number | null = null;
	if (
		sd / Math.abs(flux) > 1e-4 &&
		Math.abs(drift) < (2 * sd) / Math.abs(flux)
	) {
		let best = 0,
			bin = 0;
		for (let k = 2; k < window.length / 2; k++) {
			let real = 0,
				imaginary = 0;
			for (let j = 0; j < window.length; j++) {
				const phase = (2 * Math.PI * k * j) / window.length,
					value = window[j].flux - flux;
				real += value * Math.cos(phase);
				imaginary += value * Math.sin(phase);
			}
			const power = real * real + imaginary * imaginary;
			if (power > best) {
				best = power;
				bin = k;
			}
		}
		const interval = window[1].time - window[0].time;
		// A low alias cannot reveal its missing high-frequency source; use prior bandwidth too.
		if (
			bin &&
			interval > 0 &&
			bin / window.length <= 0.4 &&
			(expectedFrequency === undefined ||
				(expectedFrequency > 0 && interval <= 1 / (8 * expectedFrequency))) &&
			window.every(
				(row, i) =>
					i === 0 ||
					Math.abs(row.time - window[i - 1].time - interval) <= interval * 1e-6
			)
		)
			dominantFrequency = bin / (window.length * interval);
	}
	const quarters = [0, 1, 2, 3].map((k) =>
		Math.max(
			...window
				.slice(
					Math.floor((k * window.length) / 4),
					Math.floor(((k + 1) * window.length) / 4)
				)
				.map((r) => r.qmax)
		)
	);
	const sustainedPressureGrowth = quarters.every(
		(v, i) => i === 0 || v > quarters[i - 1] * 1.01
	);
	return {
		pressureQuarterMaxima: quarters,
		sustainedPressureGrowth,
		flux,
		fluxSd: sd,
		fluxSdPercent: (100 * sd) / flux,
		probeMean,
		probeSd,
		dominantFrequency,
		drift,
		re: mean(window.map((r) => r.re)),
		flowTime,
		durationInFlowTimes: rows.at(-1)!.time / flowTime,
		averagingWindow: [window[0].time, window.at(-1)!.time],
		averagingWindowInFlowTimes:
			(window.at(-1)!.time - window[0].time) / flowTime,
		sectionMeans,
		spread:
			(Math.max(...sectionMeans) - Math.min(...sectionMeans)) /
			Math.max(...sectionMeans.map(Math.abs))
	};
}
