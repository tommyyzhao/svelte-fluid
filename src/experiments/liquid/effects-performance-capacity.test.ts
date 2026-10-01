import { expect, it, vi } from 'vitest';
import { measureEffectPerformance } from './effects-performance.js';
import type { LiquidExperiment } from './types.js';

it('rejects query capacities that cannot fit the fixed tape before touching GPU resources', async () => {
	const resize = vi.fn(), model = { resize } as unknown as LiquidExperiment;
	for (const capacity of [0, 1.5, 33, 64, NaN, Infinity]) {
		await expect(measureEffectPerformance(undefined as unknown as GPUDevice, 'rgba8unorm', model,
			1, 1, () => ({ x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, tilt: 0 }), capacity)).rejects.toThrow('[1, 32]');
	}
	expect(resize).not.toHaveBeenCalled();
});
