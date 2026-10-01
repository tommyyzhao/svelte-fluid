import { describe, expect, it } from 'vitest';
import { WebGpuUnavailableError } from './device-pool.js';

describe('WebGPU availability errors', () => {
	it('preserves a backend-neutral failure reason and cause', () => {
		const cause = new Error('adapter refused');
		const error = new WebGpuUnavailableError('unavailable', 'device-request-failed', { cause });
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe('FluidUnavailableError');
		expect(error.reason).toBe('device-request-failed');
		expect(error.cause).toBe(cause);
	});
});
