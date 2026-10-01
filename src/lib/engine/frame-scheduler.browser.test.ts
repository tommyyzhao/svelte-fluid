import { describe, expect, it, vi } from 'vitest';
import { activeFrameSubscribers, subscribeFrame } from './frame-scheduler.js';

describe('shared frame scheduler', () => {
	it('isolates one failed instance and continues scheduling its siblings', async () => {
		const before = activeFrameSubscribers();
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		let faultyFrames = 0;
		let healthyFrames = 0;
		const stopFaulty = subscribeFrame(() => {
			faultyFrames += 1;
			throw new Error('intentional frame fault');
		});
		const stopHealthy = subscribeFrame(() => {
			healthyFrames += 1;
		});
		try {
			await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
			expect(healthyFrames).toBeGreaterThan(0);
			expect(faultyFrames).toBe(1);
			expect(error).toHaveBeenCalledWith('svelte-fluid: frame callback failed', expect.any(Error));
		} finally {
			stopFaulty();
			stopHealthy();
			error.mockRestore();
		}
		expect(activeFrameSubscribers()).toBe(before);
	});
});
