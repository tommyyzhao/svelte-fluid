import { describe, expect, it } from 'vitest';
import { FluidEngine } from '../FluidEngine.js';
import { mulberry32 } from '../rng.js';
import {
	divergenceStats,
	fieldEnergy,
	fluxAcrossLine,
	hasNonFinite,
	horizontalMirrorSymmetryStats,
	obstacleAdjacentGridScaleEnergyFraction,
	solidFaceFluxStats,
	weightedFluxAcrossLine
} from './reducers.js';
import { fractionalApertureScenes, type FractionalApertureScene } from './scenes.js';

interface GateMetrics {
	grid: string;
	energy: number;
	divergenceRms: number;
	divergenceMax: number;
	symmetryError: number;
	solidCells: number;
	solidFluxMean: number;
	solidFluxMax: number;
	adjacentGridScale: number;
	adjacentCells: number;
	barrierFluxMean: number;
	barrierWeight: number;
	upstreamFluxMean: number;
	downstreamFluxMean: number;
	barrierLeakRatio: number;
}

function sampleIntendedSolid(scene: FractionalApertureScene, width: number, height: number): Uint8Array {
	const solid = new Uint8Array(width * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const u = (x + 0.5) / width;
			const v = (y + 0.5) / height;
			solid[y * width + x] = scene.intendedSolidAt(u, v) ? 1 : 0;
		}
	}
	return solid;
}

function barrierWeights(scene: FractionalApertureScene, width: number, height: number): Float32Array {
	const weights = new Float32Array(width * height);
	for (let y = 0; y < height; y++) {
		const v = (y + 0.5) / height;
		const blocked = scene.intendedSolidAt(0.5, v) ? 1 : 0;
		for (let x = 0; x < width; x++) weights[y * width + x] = blocked;
	}
	return weights;
}

function measure(scene: FractionalApertureScene): GateMetrics {
	const canvas = document.createElement('canvas');
	canvas.width = scene.canvas.width;
	canvas.height = scene.canvas.height;
	const engine = new FluidEngine({
		canvas,
		autoStart: false,
		config: scene.config
	});
	try {
		const rng = mulberry32(scene.seed);
		for (let frame = 0; frame < scene.frames; frame++) {
			scene.schedule(engine, rng, frame, scene.dt);
			engine.advance(1, scene.dt);
		}

		const velocity = engine.readField('velocity');
		expect(hasNonFinite(velocity.data)).toBe(false);
		const solid = sampleIntendedSolid(scene, velocity.width, velocity.height);
		const weights = barrierWeights(scene, velocity.width, velocity.height);
		const divergence = divergenceStats(velocity.data, velocity.width, velocity.height, 2, solid);
		const symmetry = horizontalMirrorSymmetryStats(velocity.data, velocity.width, velocity.height, 2, solid);
		const solidFlux = solidFaceFluxStats(velocity.data, velocity.width, velocity.height, solid);
		const adjacent = obstacleAdjacentGridScaleEnergyFraction(velocity.data, velocity.width, velocity.height, solid);
		const centerLine = Math.floor(velocity.width / 2);
		const barrierFlux = weightedFluxAcrossLine(velocity.data, velocity.width, velocity.height, weights, {
			components: 2,
			component: 0,
			orientation: 'vertical',
			line: centerLine
		});
		const upstreamFluxMean =
			Math.abs(
				fluxAcrossLine(velocity.data, velocity.width, velocity.height, {
					components: 2,
					component: 0,
					orientation: 'vertical',
					line: Math.floor(velocity.width * 0.25)
				})
			) / velocity.height;
		const downstreamFluxMean =
			Math.abs(
				fluxAcrossLine(velocity.data, velocity.width, velocity.height, {
					components: 2,
					component: 0,
					orientation: 'vertical',
					line: Math.floor(velocity.width * 0.75)
				})
			) / velocity.height;

		return {
			grid: `${velocity.width}x${velocity.height}`,
			energy: fieldEnergy(velocity.data),
			divergenceRms: divergence.rms,
			divergenceMax: divergence.max,
			symmetryError: symmetry.normalizedRms,
			solidCells: solid.reduce((sum, value) => sum + value, 0),
			solidFluxMean: solidFlux.meanAbs,
			solidFluxMax: solidFlux.maxAbs,
			adjacentGridScale: adjacent.fraction,
			adjacentCells: adjacent.fluidCells,
			barrierFluxMean: barrierFlux.meanAbs,
			barrierWeight: barrierFlux.weight,
			upstreamFluxMean,
			downstreamFluxMean,
			barrierLeakRatio: upstreamFluxMean > 0 ? barrierFlux.meanAbs / upstreamFluxMean : 0
		};
	} finally {
		engine.dispose();
	}
}

describe('fractional-aperture evidence gate', () => {
	it('resolved curved-cylinder and narrow-throat scenes remain live, symmetric, and bounded', () => {
		for (const [name, scene] of [
			['curvedCylinder', fractionalApertureScenes.curvedCylinder],
			['narrowThroat', fractionalApertureScenes.narrowThroat]
		] as const) {
			const metrics = measure(scene);
			console.info(`[FID-005] ${name}`, metrics);
			expect(metrics.energy).toBeGreaterThan(scene.thresholdBand[0]);
			expect(metrics.solidCells).toBeGreaterThan(0);
			expect(metrics.adjacentCells).toBeGreaterThan(0);
			expect(metrics.symmetryError).toBeLessThan(0.2);
			expect(metrics.divergenceRms).toBeLessThan(2);
			expect(metrics.divergenceMax).toBeLessThan(20);
			expect(metrics.solidFluxMean).toBeLessThan(1);
			expect(metrics.adjacentGridScale).toBeLessThan(0.35);
			expect(metrics.upstreamFluxMean).toBeGreaterThan(0.01);
			expect(metrics.downstreamFluxMean).toBeGreaterThan(0.01);
		}
	});

	it('detects the expected resolution limit for a subcell wall without generalizing it to resolved geometry', () => {
		const scene = fractionalApertureScenes.subcellWall;
		const metrics = measure(scene);
		console.info('[FID-005] subcellWall', metrics);
		expect(metrics.energy).toBeGreaterThan(scene.thresholdBand[0]);
		expect(metrics.solidCells).toBe(0);
		expect(metrics.adjacentCells).toBe(0);
		expect(metrics.upstreamFluxMean).toBeGreaterThan(0.01);
		expect(metrics.barrierWeight).toBeGreaterThan(0);
		expect(metrics.barrierLeakRatio).toBeLessThan(0.1);
		expect(metrics.symmetryError).toBeLessThan(0.2);
	});
});
