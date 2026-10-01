import { describe, expect, it } from 'vitest';
import {
	VORTICITY_REFERENCE_RESOLUTION,
	vorticityNormalizationScale
} from '../vorticity-normalization.js';
import engineSource from '../webgpu/NativeWebGpuFluidEngine.ts?raw';
import { NATIVE_WEBGPU_SHADERS } from '../webgpu/shaders.js';

describe('resolution-normalized adaptive vorticity', () => {
	it('normalizes by the screen-isotropic grid dimension', () => {
		expect(vorticityNormalizationScale(VORTICITY_REFERENCE_RESOLUTION, VORTICITY_REFERENCE_RESOLUTION)).toBe(1);
		expect(vorticityNormalizationScale(256, 128)).toBe(1);
		expect(vorticityNormalizationScale(192, 256)).toBe(1.5);
	});

	it('wires that scale and the solid-neighbor gate into production WGSL', () => {
		const shaderSource = NATIVE_WEBGPU_SHADERS.vorticity;

		expect(shaderSource).toContain('let normalized_omega = abs(center) * 2.0 * params.values.w;');
		expect(shaderSource).toContain('let adaptive_weight = smoothstep(0.02, 0.08, normalized_omega);');
		expect(shaderSource).toContain('(1.0 - step(0.5, neighbor_solid))');
		expect(engineSource).toContain('vorticityNormalizationScale(this.simSize[0], this.simSize[1])');
	});
});
