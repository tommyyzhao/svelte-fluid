/*
 * svelte-fluid — WebGL availability probe and typed failure.
 * Public surface: this module's declarations must stay free of GL types
 * (checked by scripts/check-public-declarations.mjs).
 */

/** Context attributes the availability probe forwards; the subset of the DOM context attributes the probe cares about. */
export interface ContextProbeAttributes {
	failIfMajorPerformanceCaveat?: boolean;
}

/**
 * Why a WebGL context could not be acquired. Lets the component layer
 * distinguish a **permanent** failure (no WebGL / no float textures → show a
 * fallback) from a **transient** one (`context-limit`: the page hit the
 * browser's live-context cap → stay blank and retry on the next reconcile).
 * `render-failed` is permanent: a frame threw and the engine was evicted from
 * the shared scheduler (ADR 0085).
 */
export type WebGLUnavailableReason =
	| 'no-webgl'
	| 'no-float-textures'
	| 'context-limit'
	| 'render-failed';

/**
 * Thrown by {@link getWebGLContext} when a usable context cannot be created.
 * Carries a typed {@link WebGLUnavailableReason} so callers can react without
 * string-matching the message.
 */
export class WebGLUnavailableError extends Error {
	readonly reason: WebGLUnavailableReason;
	constructor(reason: WebGLUnavailableReason, message: string) {
		super(message);
		this.name = 'WebGLUnavailableError';
		this.reason = reason;
	}
}

/**
 * Report whether a WebGL context can be created at all, right now. Creates a
 * throwaway context on a detached canvas and releases it immediately via
 * `WEBGL_lose_context`. This is the correct way to detect support — actually
 * creating a context — rather than sniffing `window.WebGLRenderingContext`,
 * which false-positives on blacklisted/disabled GPUs.
 *
 * SSR-safe: returns `false` when `document` is unavailable. Pass the same
 * {@link ContextProbeAttributes} the real context uses (notably
 * `failIfMajorPerformanceCaveat`) so the probe's answer matches.
 *
 * NOTE: this reports only whether a context can be *created*. The simulation
 * additionally needs a renderable half-float format; a browser can pass this
 * check and still fail engine init with `no-float-textures`. Treat it as a
 * fast "is WebGL fundamentally available" gate, not a guarantee the engine will
 * start.
 */
export function isWebGLAvailable(attributes?: ContextProbeAttributes): boolean {
	if (typeof document === 'undefined') return false;
	try {
		const canvas = document.createElement('canvas');
		const gl = (canvas.getContext('webgl2', attributes) ??
			canvas.getContext('webgl', attributes) ??
			canvas.getContext('experimental-webgl', attributes)) as {
			getExtension(name: string): { loseContext(): void } | null;
		} | null;
		if (!gl) return false;
		// Release the probe context right away so it doesn't hold a slot.
		gl.getExtension('WEBGL_lose_context')?.loseContext();
		return true;
	} catch {
		return false;
	}
}

/**
 * Memoized capability cache for {@link getWebGLContext}'s failure classification,
 * keyed by whether hardware acceleration was required. This is NOT GL state (it
 * holds no context/buffer/program/FBO — invariant #2 is about not sharing GL
 * *resources* across instances): it is a single flag per key so that classifying
 * a null-context failure does not spawn a fresh probe context on *every* failure.
 * Repeatedly creating probe contexts on a page already at the live-context cap
 * could evict a sibling engine's context (Chromium LRU) or leak a slot when
 * `WEBGL_lose_context` is absent — so a confirmed `true` is probed at most once
 * per key. We deliberately cache ONLY positive results: a one-off transient
 * `false` (e.g. a fluke during a context storm) must not become a permanent,
 * page-wide "no WebGL" verdict, and the component's permanent-failure
 * short-circuit already prevents re-probing on a genuine `no-webgl`.
 */
const webglSupportCache: { [key: string]: true } = {};

export function webglSupportedMemo(attributes?: ContextProbeAttributes): boolean {
	const key = attributes?.failIfMajorPerformanceCaveat ? 'hw' : 'any';
	if (webglSupportCache[key]) return true;
	const result = isWebGLAvailable(attributes);
	if (result) webglSupportCache[key] = true;
	return result;
}

/** @internal Test-only: clear the memoized capability probe between cases. */
export function _resetWebGLSupportCache(): void {
	delete webglSupportCache.hw;
	delete webglSupportCache.any;
}

/** Options for {@link getWebGLContext}. */
export interface GetContextOptions {
	/**
	 * Reject a software/SwiftShader rendering path via
	 * `failIfMajorPerformanceCaveat`. Off by default to avoid false negatives
	 * on legitimate integrated GPUs.
	 */
	requireHardwareAcceleration?: boolean;
}
