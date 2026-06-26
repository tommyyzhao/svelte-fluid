import { describe, expect, it } from 'vitest';
import { fieldEnergy, hasNonFinite } from './reducers.js';
import { dipole, kelvinHelmholtz, rayleighBenard, thinWallTeslaValve } from './scenes.js';
import { mulberry32 } from '../rng.js';
import { FluidEngine } from '../FluidEngine.js';

// Every bench scene must advance (deterministically, off the rAF clock) to a
// live, finite velocity field — the liveness guard the harness relies on so a
// blank/dead readback can never pass as a real measurement.
const scenes = { dipole, kelvinHelmholtz, rayleighBenard, thinWallTeslaValve };

describe('bench scenes liveness', () => {
	for (const [name, scene] of Object.entries(scenes)) {
		it(`${name} advances to a live, finite velocity field`, () => {
			const canvas = document.createElement('canvas');
			canvas.width = 96;
			canvas.height = 96;

			const engine = new FluidEngine({
				canvas,
				config: { ...scene.config, pointerInput: false },
				autoStart: false
			});

			try {
				const rng = mulberry32(scene.seed);
				const dt = 1 / 120;
				for (let frame = 0; frame < 120; frame++) {
					scene.schedule(engine, rng, frame, dt);
					engine.advance(1, dt);
				}

				const velocity = engine.readField('velocity').data;
				expect(hasNonFinite(velocity)).toBe(false);
				expect(fieldEnergy(velocity)).toBeGreaterThanOrEqual(scene.thresholdBand[0]);
			} finally {
				engine.dispose();
			}
		});
	}
});
