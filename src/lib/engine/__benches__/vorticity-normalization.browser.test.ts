import { describe, expect, it } from 'vitest';
import { FluidEngine } from '../FluidEngine.js';
import { fieldEnergy, hasNonFinite } from './reducers.js';
import { adaptiveVorticityWeight, normalizedVorticityMagnitude } from '../vorticity-normalization.js';

const RESOLUTIONS = [64, 96, 128, 192, 256] as const;
const DT = 1 / 120;

interface ResponseSample {
	velocity: Float32Array;
	curl: Float32Array;
	width: number;
	height: number;
	energy: number;
}

function runVortex(resolution: number, adaptive: number): ResponseSample {
	const canvas = document.createElement('canvas');
	canvas.width = 128;
	canvas.height = 128;
	const engine = new FluidEngine({
		canvas,
		autoStart: false,
		config: {
			pointerInput: false,
			initialSplatCount: 0,
			simResolution: resolution,
			dyeResolution: 64,
			pressureIterations: 12,
			curl: 30,
			vorticityAdaptive: adaptive,
			velocityDissipation: 0,
			densityDissipation: 0,
			shading: false,
			bloom: false,
			sunrays: false
		}
	});
	try {
		// Equal-and-opposite impulses create the same continuous dipole at every
		// grid resolution; only sampling density changes.
		engine.splat(0.42, 0.5, 0, 520, { r: 0, g: 0, b: 0 });
		engine.splat(0.58, 0.5, 0, -520, { r: 0, g: 0, b: 0 });
		engine.advance(1, DT);
		const velocity = engine.readField('velocity');
		const curl = engine.readField('curl', { components: 1 });
		expect(hasNonFinite(velocity.data)).toBe(false);
		expect(hasNonFinite(curl.data)).toBe(false);
		return {
			velocity: velocity.data,
			curl: curl.data,
			width: curl.width,
			height: curl.height,
			energy: fieldEnergy(velocity.data)
		};
	} finally {
		engine.dispose();
	}
}

function rmsDifference(a: ArrayLike<number>, b: ArrayLike<number>): number {
	let sum = 0;
	for (let i = 0; i < a.length; i++) {
		const delta = Number(a[i]) - Number(b[i]);
		sum += delta * delta;
	}
	return Math.sqrt(sum / Math.max(1, a.length));
}

function normalizedGateMean(sample: ResponseSample): number {
	let weighted = 0;
	let magnitude = 0;
	for (const curl of sample.curl) {
		const omega = normalizedVorticityMagnitude(curl, sample.width, sample.height);
		weighted += adaptiveVorticityWeight(curl, sample.width, sample.height) * omega;
		magnitude += omega;
	}
	return magnitude > 0 ? weighted / magnitude : 0;
}

describe('resolution-normalized adaptive vorticity response', () => {
	it('keeps an equivalent dipole in the same normalized response band', () => {
		const metrics = RESOLUTIONS.map((resolution) => {
			const legacy = runVortex(resolution, 0);
			const adaptive = runVortex(resolution, 1);
			expect(legacy.energy).toBeGreaterThan(0.001);
			expect(adaptive.energy).toBeGreaterThan(0.001);
			const response = rmsDifference(legacy.velocity, adaptive.velocity) / Math.sqrt(legacy.energy);
			return { resolution, gate: normalizedGateMean(legacy), response };
		});

		const reference = metrics.find((metric) => metric.resolution === 128)!;
		console.info('vorticity-normalization-sweep', metrics);
		for (const metric of metrics) {
			expect(metric.gate).toBeGreaterThan(0);
			expect(metric.response).toBeGreaterThan(0);
			expect(Number.isFinite(metric.response)).toBe(true);
			expect(metric.gate / reference.gate).toBeGreaterThan(0.75);
			expect(metric.gate / reference.gate).toBeLessThan(1.25);
		}
	});
});
