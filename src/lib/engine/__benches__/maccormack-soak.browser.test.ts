import { describe, expect, it } from 'vitest';
import { hasNonFinite } from './reducers.js';
import { mulberry32 } from '../rng.js';
import { FluidEngine } from '../FluidEngine.js';

// Stability soak: drive MacCormack velocity advection hard (large splat forces,
// open boundaries, low dissipation, many steps) and assert the field never goes
// non-finite. The Selle limiter + ±1000 clamp + open-edge first-order guard must
// keep the two-pass scheme from blowing up.
describe('maccormack velocity advection stays finite under a hard soak', () => {
	it('advances 600 high-force steps with open boundaries without NaN/Inf', () => {
		const canvas = document.createElement('canvas');
		canvas.width = 128;
		canvas.height = 128;

		const engine = new FluidEngine({
			canvas,
			config: {
				pointerInput: false,
				openBoundary: true,
				curl: 30,
				simResolution: 128,
				dyeResolution: 256,
				velocityDissipation: 0.1,
				densityDissipation: 0.2,
				pressure: 0.8,
				pressureIterations: 20,
				substeps: 1,
				maxTimeStep: 1 / 60,
				initialSplatCount: 0,
				shading: false,
				bloom: false,
				sunrays: false,
				backColor: { r: 0, g: 0, b: 0 }
			},
			autoStart: false,
			advectionScheme: 'maccormack'
		});

		try {
			const rng = mulberry32(0x50a4);
			const dt = 1 / 60;
			for (let frame = 0; frame < 600; frame++) {
				if (frame % 5 === 0) {
					engine.splat(rng(), rng(), (rng() - 0.5) * 6000, (rng() - 0.5) * 6000, {
						r: 0.4,
						g: 0.2,
						b: 0.5
					});
				}
				engine.advance(1, dt);
			}

			const velocity = engine.readField('velocity').data;
			expect(hasNonFinite(velocity)).toBe(false);
		} finally {
			engine.dispose();
		}
	});
});
