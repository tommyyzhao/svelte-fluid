import { describe, expect, it } from 'vitest';
import { DEFAULTS, distortionFieldKeyword, resolveConfig } from '../FluidEngine.js';
import { displayShaderSource } from '../shaders.js';

describe('distortion field selection', () => {
	it('velocity adds no keyword; the other modes add theirs', () => {
		expect(distortionFieldKeyword('velocity')).toBeNull();
		expect(distortionFieldKeyword('acceleration')).toBe('DISTORTION_ACCEL');
		expect(distortionFieldKeyword('pressure')).toBe('DISTORTION_PGRAD');
	});

	it('defaults to pressure and resolves the public field', () => {
		expect(DEFAULTS.DISTORTION_FIELD).toBe('pressure');
		expect(resolveConfig({ distortionField: 'acceleration' }, DEFAULTS).DISTORTION_FIELD).toBe('acceleration');
		expect(resolveConfig({}, DEFAULTS).DISTORTION_FIELD).toBe('pressure');
		expect(() => resolveConfig({ distortionField: 'nope' as never }, DEFAULTS)).toThrow(RangeError);
	});

	it.each(['', 'Velocity', 'accel', 'pressure-gradient', null, undefined, 3])('rejects %s with RangeError', (mode) => {
		expect(() => distortionFieldKeyword(mode)).toThrow(RangeError);
	});

	it('keeps the original warp line as the only path without the new keywords', () => {
		// The #else branch is what velocity mode compiles; it must stay the shipped line.
		expect(displayShaderSource).toContain('imgUv -= uDistortionPower * normalize(vel) * offset;');
		expect(displayShaderSource).toContain('imgUv -= uDistortionPower * uDistortionGain * offset * acc / (length(acc) + uAccelSoftness);');
	});
});
