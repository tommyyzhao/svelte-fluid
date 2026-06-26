import { describe, expect, it } from 'vitest';
import { fieldEnergy, hasNonFinite } from './reducers.js';
import { dipole } from './scenes.js';
import { mulberry32 } from '../rng.js';
import { FluidEngine } from '../FluidEngine.js';

describe('readField/readback', () => {
	it('advances a dipole scene and reads back a positive velocity energy', () => {
		const canvas = document.createElement('canvas');
		canvas.width = 96;
		canvas.height = 96;

		const engine = new FluidEngine({
			canvas,
			config: { ...dipole.config, pointerInput: false },
			autoStart: false
		});

		try {
			const rng = mulberry32(dipole.seed);
			const dt = 1 / 120;
			for (let frame = 0; frame < 120; frame++) {
				dipole.schedule(engine, rng, frame, dt);
				engine.advance(1, dt);
			}

			const velocity = engine.readField('velocity').data;
			expect(hasNonFinite(velocity)).toBe(false);
			const energy = fieldEnergy(velocity);
			expect(energy).toBeGreaterThanOrEqual(dipole.thresholdBand[0]);
		} finally {
			engine.dispose();
		}
	});
});
