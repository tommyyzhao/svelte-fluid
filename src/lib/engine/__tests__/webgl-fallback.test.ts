/*
 * Tests for the WebGL-unavailable fallback plumbing (ADR-0041):
 *  - `isWebGLAvailable()` capability probe (SSR-safe, attribute-forwarding,
 *    context release),
 *  - `getWebGLContext()` typed-error classification (permanent `no-webgl` vs.
 *    transient `context-limit`), and
 *  - `requireHardwareAcceleration` resolving into the context attributes.
 *
 * Pure unit tests: no real GL. We stub `globalThis.document` so the throwaway
 * probe context is fully controllable, and pass fake canvases directly.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
	isWebGLAvailable,
	getWebGLContext,
	WebGLUnavailableError,
	_resetWebGLSupportCache,
	type GL
} from '../gl-utils.js';
import { resolveConfig, DEFAULTS } from '../FluidEngine.js';

type GetContext = (type: string, attrs?: WebGLContextAttributes) => unknown;

const realDocument = (globalThis as { document?: unknown }).document;

/** Install a fake `document` whose `<canvas>.getContext` is `getContext`. */
function setProbe(getContext: GetContext): void {
	(globalThis as { document?: unknown }).document = {
		createElement: () => ({ getContext })
	};
}

/** Remove `document` entirely to simulate an SSR / non-DOM environment. */
function clearDocument(): void {
	delete (globalThis as { document?: unknown }).document;
}

beforeEach(() => {
	// getWebGLContext memoizes the capability probe; clear it so each
	// classification case probes the document this test installed.
	_resetWebGLSupportCache();
});

afterEach(() => {
	if (realDocument === undefined) clearDocument();
	else (globalThis as { document?: unknown }).document = realDocument;
});

/** A minimal stand-in for a live GL context that can be released. */
function fakeGL(onLose?: () => void): Partial<GL> {
	return { getExtension: () => ({ loseContext: () => onLose?.() }) as never };
}

/** A canvas whose every `getContext` returns null (acquisition fails). */
function nullCanvas(spy?: (attrs?: WebGLContextAttributes) => void): HTMLCanvasElement {
	return {
		getContext: (_type: string, attrs?: WebGLContextAttributes) => {
			spy?.(attrs);
			return null;
		}
	} as unknown as HTMLCanvasElement;
}

/** Assert `fn` throws a WebGLUnavailableError and return its reason (fails loudly if it does not throw). */
function reasonOf(fn: () => unknown): string {
	try {
		fn();
	} catch (err) {
		expect(err).toBeInstanceOf(WebGLUnavailableError);
		return (err as WebGLUnavailableError).reason;
	}
	throw new Error('expected getWebGLContext to throw, but it returned');
}

describe('isWebGLAvailable', () => {
	it('returns false in an SSR / non-DOM environment', () => {
		clearDocument();
		expect(isWebGLAvailable()).toBe(false);
	});

	it('returns false when no context can be created', () => {
		setProbe(() => null);
		expect(isWebGLAvailable()).toBe(false);
	});

	it('returns true and releases the probe context when one is created', () => {
		let released = false;
		setProbe((type) => (type === 'webgl2' ? fakeGL(() => (released = true)) : null));
		expect(isWebGLAvailable()).toBe(true);
		// The probe must not hold a context slot.
		expect(released).toBe(true);
	});

	it('falls back through webgl / experimental-webgl', () => {
		setProbe((type) => (type === 'experimental-webgl' ? fakeGL() : null));
		expect(isWebGLAvailable()).toBe(true);
	});

	it('forwards the supplied context attributes', () => {
		let seen: WebGLContextAttributes | undefined;
		setProbe((type, attrs) => {
			if (type === 'webgl2') {
				seen = attrs;
				return fakeGL();
			}
			return null;
		});
		const attrs: WebGLContextAttributes = { failIfMajorPerformanceCaveat: true };
		isWebGLAvailable(attrs);
		expect(seen).toBe(attrs);
	});

	it('returns false (never throws) when getContext throws', () => {
		setProbe(() => {
			throw new Error('boom');
		});
		expect(isWebGLAvailable()).toBe(false);
	});

	it('still reports available when WEBGL_lose_context is missing (no release)', () => {
		// A browser without the lose-context extension: we can't explicitly free
		// the probe, but WebGL IS available — returning false would be wrong.
		setProbe((type) => (type === 'webgl2' ? { getExtension: () => null } : null));
		expect(isWebGLAvailable()).toBe(true);
	});
});

describe('getWebGLContext failure classification', () => {
	it('throws no-webgl (permanent) when neither the canvas nor a probe can get a context', () => {
		setProbe(() => null);
		try {
			getWebGLContext(nullCanvas());
			throw new Error('expected getWebGLContext to throw');
		} catch (err) {
			expect(err).toBeInstanceOf(WebGLUnavailableError);
			expect((err as WebGLUnavailableError).reason).toBe('no-webgl');
		}
	});

	it('throws context-limit (transient) when the canvas fails but a fresh probe succeeds', () => {
		setProbe((type) => (type === 'webgl2' ? fakeGL() : null));
		try {
			getWebGLContext(nullCanvas());
			throw new Error('expected getWebGLContext to throw');
		} catch (err) {
			expect(err).toBeInstanceOf(WebGLUnavailableError);
			expect((err as WebGLUnavailableError).reason).toBe('context-limit');
		}
	});

	it('threads requireHardwareAcceleration into failIfMajorPerformanceCaveat (canvas + probe)', () => {
		let probeAttrs: WebGLContextAttributes | undefined;
		setProbe((type, attrs) => {
			if (type === 'webgl2') probeAttrs = attrs;
			return null;
		});
		let canvasAttrs: WebGLContextAttributes | undefined;
		const canvas = nullCanvas((attrs) => (canvasAttrs = attrs));
		expect(() => getWebGLContext(canvas, { requireHardwareAcceleration: true })).toThrow(
			WebGLUnavailableError
		);
		expect(canvasAttrs?.failIfMajorPerformanceCaveat).toBe(true);
		expect(probeAttrs?.failIfMajorPerformanceCaveat).toBe(true);
	});

	it('leaves failIfMajorPerformanceCaveat off by default', () => {
		setProbe(() => null);
		let canvasAttrs: WebGLContextAttributes | undefined;
		const canvas = nullCanvas((attrs) => (canvasAttrs = attrs));
		expect(() => getWebGLContext(canvas)).toThrow(WebGLUnavailableError);
		expect(canvasAttrs?.failIfMajorPerformanceCaveat).toBe(false);
	});

	it('memoizes the capability probe so it is not re-created on every failure', () => {
		let probes = 0;
		setProbe((type) => {
			if (type === 'webgl2') {
				probes++;
				return fakeGL();
			}
			return null;
		});
		// First failure probes and caches 'available'.
		expect(reasonOf(() => getWebGLContext(nullCanvas()))).toBe('context-limit');
		expect(probes).toBe(1);
		// Even if the environment now reports NO context, the cached verdict stands
		// (no second probe → no extra context creation / sibling eviction).
		setProbe(() => null);
		expect(reasonOf(() => getWebGLContext(nullCanvas()))).toBe('context-limit');
		expect(probes).toBe(1);
	});

	it('caches only positive results so a transient false-negative is not permanent', () => {
		// A one-off probe failure must NOT stick as a page-wide 'no WebGL' verdict.
		let available = false;
		setProbe((type) => (type === 'webgl2' && available ? fakeGL() : null));
		expect(reasonOf(() => getWebGLContext(nullCanvas()))).toBe('no-webgl');
		// Environment recovers — the next classification must re-probe (false wasn't cached).
		available = true;
		expect(reasonOf(() => getWebGLContext(nullCanvas()))).toBe('context-limit');
	});

	it('keys the cache by hardware-acceleration requirement', () => {
		// Non-hw probe succeeds; hw-accel probe fails — must not collide.
		setProbe((type, attrs) => {
			if (type !== 'webgl2') return null;
			return attrs?.failIfMajorPerformanceCaveat ? null : fakeGL();
		});
		expect(reasonOf(() => getWebGLContext(nullCanvas()))).toBe('context-limit');
		expect(reasonOf(() => getWebGLContext(nullCanvas(), { requireHardwareAcceleration: true }))).toBe(
			'no-webgl'
		);
	});
});

describe('WebGLUnavailableError', () => {
	it('is an Error carrying the typed reason', () => {
		const e = new WebGLUnavailableError('no-float-textures', 'msg');
		expect(e).toBeInstanceOf(Error);
		expect(e.name).toBe('WebGLUnavailableError');
		expect(e.reason).toBe('no-float-textures');
		expect(e.message).toBe('msg');
	});
});

describe('resolveConfig — requireHardwareAcceleration', () => {
	it('defaults REQUIRE_HARDWARE_ACCELERATION to false', () => {
		expect(DEFAULTS.REQUIRE_HARDWARE_ACCELERATION).toBe(false);
		expect(resolveConfig(undefined, DEFAULTS).REQUIRE_HARDWARE_ACCELERATION).toBe(false);
	});

	it('maps the public field onto the resolved key', () => {
		expect(
			resolveConfig({ requireHardwareAcceleration: true }, DEFAULTS).REQUIRE_HARDWARE_ACCELERATION
		).toBe(true);
	});
});
