import { describe, expect, it } from 'vitest';
import { hasNonFinite } from './reducers.js';
import { FluidEngine } from '../FluidEngine.js';

type Scheme = 'semilagrangian' | 'maccormack';

interface WallSample {
	flux: number;
	energy: number;
	data: ArrayLike<number>;
}

function rightSideMetrics(data: ArrayLike<number>, width: number, height: number): [number, number] {
	const lineX = Math.floor(width * 0.56);
	let positiveFlux = 0;
	for (let y = 0; y < height; y++) {
		positiveFlux += Math.max(0, data[(y * width + lineX) * 2]);
	}
	positiveFlux /= height;

	let energy = 0;
	let count = 0;
	for (let y = 0; y < height; y++) {
		for (let x = Math.floor(width * 0.54); x < width; x++) {
			const i = (y * width + x) * 2;
			energy += data[i] * data[i] + data[i + 1] * data[i + 1];
			count++;
		}
	}
	return [positiveFlux, Math.sqrt(energy / Math.max(1, count))];
}

function measure(scheme: Scheme, withWall: boolean): WallSample {
	const canvas = document.createElement('canvas');
	canvas.width = 64;
	canvas.height = 64;
	const engine = new FluidEngine({
		canvas,
		config: {
			pointerInput: false,
			obstructions: withWall
				? [
						{
							d: 'M 49 0 L 51 0 L 51 100 L 49 100 Z',
							fit: 'fill',
							viewBox: [0, 0, 100, 100]
						}
					]
				: undefined,
			curl: 0,
			viscosity: 0,
			simResolution: 64,
			dyeResolution: 64,
			velocityDissipation: 0.05,
			densityDissipation: 0,
			pressure: 0.8,
			pressureIterations: 12,
			substeps: 1,
			maxTimeStep: 1 / 60,
			splatRadius: 0.04,
			initialSplatCount: 0,
			shading: false,
			bloom: false,
			sunrays: false,
			backColor: { r: 0, g: 0, b: 0 }
		},
		autoStart: false,
		advectionScheme: scheme
	});

	try {
		engine.splat(0.32, 0.5, 1200, 0, { r: 0, g: 0, b: 0 });
		engine.advance(12, 1 / 60);
		const field = engine.readField('velocity');
		const [flux, energy] = rightSideMetrics(field.data, field.width, field.height);
		return { flux, energy, data: field.data };
	} finally {
		engine.dispose();
	}
}

describe('MacCormack solid departure guard', () => {
	it('does not increase transport through a represented thin wall versus SL', { timeout: 120_000 }, () => {
		const noWall = measure('semilagrangian', false);
		const slWall = measure('semilagrangian', true);
		const macWall = measure('maccormack', true);
		// eslint-disable-next-line no-console
		console.log(
			`[maccormack-wall] flux control=${noWall.flux.toFixed(4)} sl=${slWall.flux.toFixed(4)} mac=${macWall.flux.toFixed(4)}; ` +
				`energy control=${noWall.energy.toFixed(4)} sl=${slWall.energy.toFixed(4)} mac=${macWall.energy.toFixed(4)}`
		);

		// The control proves the impulse reaches the measurement region; otherwise
		// a zero-vs-zero wall comparison could pass without exercising advection.
		expect(noWall.flux).toBeGreaterThan(0.05);
		expect(noWall.energy).toBeGreaterThan(0.05);
		expect(hasNonFinite(slWall.data)).toBe(false);
		expect(hasNonFinite(macWall.data)).toBe(false);

		const fluxTolerance = Math.max(0.02, slWall.flux * 0.05);
		const energyTolerance = Math.max(0.02, slWall.energy * 0.05);
		expect(macWall.flux).toBeLessThanOrEqual(slWall.flux + fluxTolerance);
		expect(macWall.energy).toBeLessThanOrEqual(slWall.energy + energyTolerance);
	});
});
