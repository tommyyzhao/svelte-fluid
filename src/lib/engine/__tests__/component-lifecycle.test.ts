import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifyHost } from '../notify-host.js';
import fluidSrc from '../../Fluid.svelte?raw';

afterEach(() => vi.restoreAllMocks());

describe('notifyHost', () => {
	it('swallows and logs a throwing consumer callback', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(
			notifyHost(() => {
				throw new Error('boom');
			}, 'onReady')
		).toBe(false);
		expect(error).toHaveBeenCalledOnce();
	});

	it('passes arguments through and tolerates a missing callback', () => {
		const cb = vi.fn();
		expect(notifyHost(cb, 'onError', new Error('x'))).toBe(true);
		expect(cb).toHaveBeenCalledWith(expect.any(Error));
		expect(notifyHost(undefined, 'onReady')).toBe(true);
	});
});

describe('Fluid lifecycle wiring', () => {
	it('declares onReady/onError and invokes them only through notifyHost', () => {
		expect(fluidSrc).toContain('onReady?: () => void');
		expect(fluidSrc).toContain('onError?: (error: Error) => void');
		expect(fluidSrc).toContain("notifyHost(onReady, 'onReady')");
		expect(fluidSrc).toContain("notifyHost(onError, 'onError'");
	});

	it('pauses a freshly built engine when the tab is already hidden', () => {
		expect(fluidSrc).toContain(
			"if (stableAutoPause && typeof document !== 'undefined' && document.hidden) engine.pause();"
		);
	});
});
