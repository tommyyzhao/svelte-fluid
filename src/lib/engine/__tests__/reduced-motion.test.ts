import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefersReducedMotion, watchReducedMotion } from '../reduced-motion.js';

afterEach(() => vi.unstubAllGlobals());

describe('reduced-motion', () => {
	it('is false when matchMedia is unavailable', () => {
		expect(prefersReducedMotion()).toBe(false);
		const cb = vi.fn();
		watchReducedMotion(cb)();
		expect(cb).toHaveBeenCalledWith(false);
	});

	it('reads the preference and follows changes until unsubscribed', () => {
		let handler: () => void = () => {};
		const mq = {
			matches: true,
			addEventListener: (_: string, h: () => void) => (handler = h),
			removeEventListener: vi.fn()
		};
		vi.stubGlobal('matchMedia', () => mq);
		expect(prefersReducedMotion()).toBe(true);
		const cb = vi.fn();
		const stop = watchReducedMotion(cb);
		expect(cb).toHaveBeenLastCalledWith(true);
		mq.matches = false;
		handler();
		expect(cb).toHaveBeenLastCalledWith(false);
		stop();
		expect(mq.removeEventListener).toHaveBeenCalled();
	});
});
