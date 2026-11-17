import { describe, expect, it } from 'vitest';
import { distortionFieldKeyword } from '../FluidEngine.js';
import { displayShaderSource } from '../shaders.js';

describe('internal distortion field selection', () => {
	it('velocity adds no keyword; the other modes add theirs', () => {
		expect(distortionFieldKeyword('velocity')).toBeNull();
		expect(distortionFieldKeyword('acceleration')).toBe('DISTORTION_ACCEL');
		expect(distortionFieldKeyword('pressure-gradient')).toBe('DISTORTION_PGRAD');
	});

	it.each(['', 'Velocity', 'accel', 'pressure', null, undefined, 3])('rejects %s with RangeError', (mode) => {
		expect(() => distortionFieldKeyword(mode)).toThrow(RangeError);
	});

	it('keeps the original warp line as the only path without the new keywords', () => {
		// The #else branch is what velocity mode compiles; it must stay the shipped line.
		expect(displayShaderSource).toContain('imgUv -= uDistortionPower * normalize(vel) * offset;');
		expect(displayShaderSource).toContain('imgUv -= uDistortionPower * offset * acc / (length(acc) + uAccelSoftness);');
	});
});
