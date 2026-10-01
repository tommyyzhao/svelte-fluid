import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.resetModules();
});

describe('shared frame scheduler', () => {
	it('imports without touching requestAnimationFrame (SSR-safe)', async () => {
		expect(typeof globalThis.requestAnimationFrame).toBe('undefined');
		const scheduler = await import('../frame-scheduler.js');
		expect(scheduler.activeFrameSubscribers()).toBe(0);
	});

	it('runs all subscribers per frame, evicts a thrower, and stops when empty', async () => {
		let pending: FrameRequestCallback | null = null;
		const raf = vi.fn((cb: FrameRequestCallback) => {
			pending = cb;
			return 1;
		});
		const cancel = vi.fn(() => {
			pending = null;
		});
		vi.stubGlobal('requestAnimationFrame', raf);
		vi.stubGlobal('cancelAnimationFrame', cancel);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { subscribeFrame, activeFrameSubscribers } = await import('../frame-scheduler.js');
		const flush = () => {
			const cb = pending;
			pending = null;
			cb?.(0);
		};

		const good = vi.fn();
		const onError = vi.fn();
		const bad = vi.fn(() => {
			throw new Error('boom');
		});
		const stopGood = subscribeFrame(good);
		subscribeFrame(bad, onError);
		expect(raf).toHaveBeenCalledTimes(1);

		flush();
		expect(good).toHaveBeenCalledTimes(1);
		expect(bad).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(activeFrameSubscribers()).toBe(1);

		flush();
		expect(good).toHaveBeenCalledTimes(2);
		expect(bad).toHaveBeenCalledTimes(1);
		expect(raf).toHaveBeenCalledTimes(3);

		stopGood();
		stopGood();
		expect(activeFrameSubscribers()).toBe(0);
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(pending).toBeNull();
	});
});
