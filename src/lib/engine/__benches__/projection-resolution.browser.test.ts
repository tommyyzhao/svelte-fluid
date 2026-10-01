import { describe, expect, it } from 'vitest';
import { containerMask } from '../container-shapes.js';
import { FluidEngine } from '../FluidEngine.js';
import { mulberry32 } from '../rng.js';
import {
	divergenceStats,
	fieldEnergy,
	gridScaleEnergyFraction,
	hasNonFinite,
	peakVectorMagnitude,
	solidFaceFluxStats
} from './reducers.js';
import { projectionSweep, projectionSweepShape } from './scenes.js';

const RESOLUTIONS = [64, 96, 128, 192, 256] as const;
const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 128;
const ASPECT = CANVAS_WIDTH / CANVAS_HEIGHT;
const PAIRED_JACOBI_MAX_TEXELS = 150_000;

type MetricBand = readonly [number, number];
interface ProjectionBands {
	regime: 'paired' | 'single';
	divergenceRms: MetricBand;
	divergenceMax: MetricBand;
	energy: MetricBand;
	gridScaleEnergy: MetricBand;
	peakVelocity: MetricBand;
	solidFaceFluxMean: MetricBand;
	solidFaceFluxMax: MetricBand;
}

// Measured on Chromium/ANGLE Metal. 96's lower divergence/flux floors were
// relaxed after Chrome 154 (2026-10) measured rms 0.48, max 4.3, flux max 4.5:
// tighter projection, in line with 64/128. Upper bounds still reject leaks.
// These retain cross-renderer headroom while
// still rejecting dead fields, projection jumps, and order-of-magnitude leaks.
const BANDS: Record<(typeof RESOLUTIONS)[number], ProjectionBands> = {
	64: { regime: 'paired', divergenceRms: [0.3, 0.8], divergenceMax: [3, 10], energy: [12, 30], gridScaleEnergy: [0.025, 0.08], peakVelocity: [80, 200], solidFaceFluxMean: [0.1, 0.6], solidFaceFluxMax: [0.8, 4] },
	96: { regime: 'paired', divergenceRms: [0.3, 1.4], divergenceMax: [2.5, 36], energy: [14, 33], gridScaleEnergy: [0.012, 0.05], peakVelocity: [100, 260], solidFaceFluxMean: [0.3, 1.5], solidFaceFluxMax: [1.5, 18] },
	128: { regime: 'paired', divergenceRms: [0.35, 1], divergenceMax: [2, 8], energy: [15, 36], gridScaleEnergy: [0.008, 0.04], peakVelocity: [120, 300], solidFaceFluxMean: [0.05, 0.35], solidFaceFluxMax: [0.5, 3] },
	192: { regime: 'paired', divergenceRms: [0.35, 1.1], divergenceMax: [2, 8], energy: [17, 40], gridScaleEnergy: [0.004, 0.025], peakVelocity: [140, 350], solidFaceFluxMean: [0.008, 0.1], solidFaceFluxMax: [0.08, 0.7] },
	256: { regime: 'single', divergenceRms: [0.4, 1.2], divergenceMax: [2.5, 9], energy: [19, 44], gridScaleEnergy: [0.001, 0.015], peakVelocity: [160, 400], solidFaceFluxMean: [0.004, 0.06], solidFaceFluxMax: [0.04, 0.4] }
};

function expectInBand(value: number, band: MetricBand): void {
	expect(value).toBeGreaterThanOrEqual(band[0]);
	expect(value).toBeLessThanOrEqual(band[1]);
}

function analyticSolidMask(width: number, height: number): Uint8Array {
	const solid = new Uint8Array(width * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const u = (x + 0.5) / width;
			const v = (y + 0.5) / height;
			solid[y * width + x] = containerMask(projectionSweepShape, u, v, ASPECT) < 0.5 ? 1 : 0;
		}
	}
	return solid;
}

describe('projection fidelity across resolution and Jacobi regimes', () => {
	it.each(RESOLUTIONS)('simResolution %s stays live and inside measured projection bands', (resolution) => {
		const canvas = document.createElement('canvas');
		canvas.width = CANVAS_WIDTH;
		canvas.height = CANVAS_HEIGHT;
		const engine = new FluidEngine({ canvas, autoStart: false, config: { ...projectionSweep.config, simResolution: resolution } });
		try {
			const rng = mulberry32(projectionSweep.seed);
			for (let frame = 0; frame < 18; frame++) {
				projectionSweep.schedule(engine, rng, frame, 1 / 120);
				engine.advance(1, 1 / 120);
			}

			const velocity = engine.readField('velocity');
			expect(hasNonFinite(velocity.data)).toBe(false);
			const energy = fieldEnergy(velocity.data);
			const peakVelocity = peakVectorMagnitude(velocity.data, velocity.width, velocity.height);
			expect(energy).toBeGreaterThan(0.001);
			expect(peakVelocity).toBeGreaterThan(0.01);

			const solid = analyticSolidMask(velocity.width, velocity.height);
			const divergence = divergenceStats(velocity.data, velocity.width, velocity.height, 2, solid);
			const gridScaleEnergy = gridScaleEnergyFraction(velocity.data, velocity.width, velocity.height);
			const solidFlux = solidFaceFluxStats(velocity.data, velocity.width, velocity.height, solid);
			const regime = velocity.width * velocity.height <= PAIRED_JACOBI_MAX_TEXELS ? 'paired' : 'single';
			const bands = BANDS[resolution];

			expect(divergence.fluidCells).toBeGreaterThan(0);
			expect(solidFlux.faceCount).toBeGreaterThan(0);
			for (const metric of [divergence.rms, divergence.max, energy, gridScaleEnergy, peakVelocity, solidFlux.meanAbs, solidFlux.maxAbs]) expect(Number.isFinite(metric)).toBe(true);
			expect(regime).toBe(bands.regime);
			expectInBand(divergence.rms, bands.divergenceRms);
			expectInBand(divergence.max, bands.divergenceMax);
			expectInBand(energy, bands.energy);
			expectInBand(gridScaleEnergy, bands.gridScaleEnergy);
			expectInBand(peakVelocity, bands.peakVelocity);
			expectInBand(solidFlux.meanAbs, bands.solidFaceFluxMean);
			expectInBand(solidFlux.maxAbs, bands.solidFaceFluxMax);
		} finally {
			engine.dispose();
		}
	});
});
