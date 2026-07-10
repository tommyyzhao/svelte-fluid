import { describe, expect, it } from 'vitest';
import { dipole, kelvinHelmholtz, rayleighBenard, thinWallTeslaValve } from './scenes.js';
import { fieldEnergy, gridScaleEnergyFraction, hasNonFinite } from './reducers.js';
import { mulberry32 } from '../rng.js';
import { FluidEngine, type FluidEngineOptions } from '../FluidEngine.js';
import { INK_IN_WATER_CONFIG, LAVA_LAMP_CONFIG, PLASMA_CONFIG } from '../../presets/registry.js';
import type { FluidConfig } from '../types.js';

interface BenchCase {
	name: string;
	config: FluidConfig;
	schedule?: (engine: FluidEngine, rng: () => number, frame: number, dt: number) => void;
	seed: number;
	frames: number;
	dt: number;
	floor: number;
	band: [number, number];
}

function arraysSame(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

function runCase(
	caseDef: Omit<BenchCase, 'name'>,
	advectionScheme: FluidEngineOptions['advectionScheme'] = 'semilagrangian'
): {
	fraction: number;
	energy: number;
	data: Float32Array;
} {
	const canvas = document.createElement('canvas');
	canvas.width = 128;
	canvas.height = 128;

	const engine = new FluidEngine({
		canvas,
		config: { ...caseDef.config, pointerInput: false },
		autoStart: false,
		advectionScheme
	});
	try {
		const rng = mulberry32(caseDef.seed);
		for (let frame = 0; frame < caseDef.frames; frame++) {
			caseDef.schedule?.(engine, rng, frame, caseDef.dt);
			engine.advance(1, caseDef.dt);
		}
		const velocity = engine.readField('velocity');
		expect(hasNonFinite(velocity.data)).toBe(false);
		const energy = fieldEnergy(velocity.data);
		return {
			data: velocity.data,
			fraction: gridScaleEnergyFraction(velocity.data, velocity.width, velocity.height),
			energy
		};
	} finally {
		engine.dispose();
	}
}

const sceneCases: BenchCase[] = [
	{
		name: 'dipole',
		config: dipole.config,
		schedule: (engine, rng, frame, dt) => dipole.schedule(engine, rng, frame, dt),
		seed: dipole.seed,
		frames: 220,
		dt: 1 / 120,
		floor: dipole.thresholdBand[0],
		band: [0, 0.18]
	},
	{
		name: 'kelvinHelmholtz',
		config: kelvinHelmholtz.config,
		schedule: (engine, rng, frame, dt) => kelvinHelmholtz.schedule(engine, rng, frame, dt),
		seed: kelvinHelmholtz.seed,
		frames: 220,
		dt: 1 / 120,
		floor: kelvinHelmholtz.thresholdBand[0],
		band: [0, 0.16]
	},
	{
		name: 'rayleighBenard',
		config: rayleighBenard.config,
		schedule: (engine, rng, frame, dt) => rayleighBenard.schedule(engine, rng, frame, dt),
		seed: rayleighBenard.seed,
		frames: 220,
		dt: 1 / 120,
		floor: rayleighBenard.thresholdBand[0],
		band: [0, 0.16]
	},
	{
		name: 'thinWallTeslaValve',
		config: thinWallTeslaValve.config,
		schedule: (engine, rng, frame, dt) => thinWallTeslaValve.schedule(engine, rng, frame, dt),
		seed: thinWallTeslaValve.seed,
		frames: 220,
		dt: 1 / 120,
		floor: thinWallTeslaValve.thresholdBand[0],
		band: [0, 0.16]
	}
];

const decorativeCases: BenchCase[] = [
	// Plasma's baseline SL fraction measures ~0.202 (its preset genuinely carries
	// more grid-scale-looking detail than InkInWater/LavaLamp at rest); 0.25 keeps
	// ~25% headroom above that while staying far below the forced-MacCormack value
	// (~0.57), so the smoke-alarm test below still has a wide margin to fire on.
	{ name: 'Plasma', config: PLASMA_CONFIG, seed: 0x500d, frames: 180, dt: 1 / 120, floor: 0.005, band: [0, 0.25] },
	{ name: 'InkInWater', config: INK_IN_WATER_CONFIG, seed: 0x5ea, frames: 180, dt: 1 / 120, floor: 0.005, band: [0, 0.15] },
	{ name: 'LavaLamp', config: LAVA_LAMP_CONFIG, seed: 0x1a9, frames: 180, dt: 1 / 120, floor: 0.005, band: [0, 0.15] }
];

describe('grid-scale energy regression band', () => {
	for (const sceneCase of sceneCases) {
		it(`${sceneCase.name} stays below the grid-scale churn band`, () => {
			const { fraction, energy } = runCase(sceneCase);
			expect(energy).toBeGreaterThan(sceneCase.floor);
			expect(fraction).toBeGreaterThanOrEqual(sceneCase.band[0]);
			expect(fraction).toBeLessThanOrEqual(sceneCase.band[1]);
		});
	}

	for (const presetCase of decorativeCases) {
		it(`${presetCase.name} stays below the grid-scale churn band`, () => {
			const { fraction, energy } = runCase(presetCase);
			expect(energy).toBeGreaterThan(presetCase.floor);
			expect(fraction).toBeLessThanOrEqual(presetCase.band[1]);
		});
	}

	it('decorative preset with forced internal MacCormack exceeds the churn band', () => {
		const presetCase = decorativeCases[0];
		const baseline = runCase(presetCase, 'semilagrangian');
		const mac = runCase(presetCase, 'maccormack');

		expect(baseline.fraction).toBeLessThanOrEqual(presetCase.band[1]);
		expect(baseline.energy).toBeGreaterThan(presetCase.floor);

		if (arraysSame(baseline.data, mac.data)) {
			// On devices without the required filtering feature, MacCormack
			// is capability-gated to semi-Lagrangian and this test becomes a
			// no-op without a false positive.
			return;
		}

		expect(mac.energy).toBeGreaterThan(presetCase.floor);
		expect(mac.fraction).toBeGreaterThan(presetCase.band[1]);
		expect(mac.fraction).toBeGreaterThan(baseline.fraction);
	});
});
