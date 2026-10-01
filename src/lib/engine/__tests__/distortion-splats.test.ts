import { describe, expect, it } from 'vitest';
import { createDistortionPresetSplats } from '../distortion-splats.js';

describe('FluidDistortion opening splats', () => {
	it('are reproducible for the public seed', () => {
		expect(createDistortionPresetSplats(42, 4)).toEqual(createDistortionPresetSplats(42, 4));
		expect(createDistortionPresetSplats(42, 4)).not.toEqual(createDistortionPresetSplats(43, 4));
	});

	it('ignores invalid counts and cannot allocate beyond the engine queue bound', () => {
		expect(createDistortionPresetSplats(42, Number.POSITIVE_INFINITY)).toBeUndefined();
		expect(createDistortionPresetSplats(42, -1)).toBeUndefined();
		expect(createDistortionPresetSplats(42, 999)).toHaveLength(64);
	});
});
