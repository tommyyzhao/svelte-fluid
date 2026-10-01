/*
 * One requestAnimationFrame shared by every FluidEngine on the page (ADR 0080).
 * Holds callbacks only, never GL state (architecture invariant #2). Nothing
 * touches requestAnimationFrame until the first subscribe, so import is SSR-safe.
 */

export type FrameCallback = (now: number) => void;

const callbacks = new Set<FrameCallback>();
const errorHandlers = new Map<FrameCallback, (error: unknown) => void>();
let frameId = 0;

function schedule(): void {
	if (frameId || callbacks.size === 0) return;
	frameId = requestAnimationFrame(runFrame);
}

function runFrame(now: number): void {
	frameId = 0;
	try {
		// Snapshot so callbacks may (un)subscribe themselves or siblings mid-frame;
		// new subscribers start next frame, removed ones are skipped now.
		for (const callback of [...callbacks]) {
			if (!callbacks.has(callback)) continue;
			try {
				callback(now);
			} catch (error) {
				// Evict: a deterministic failure must not become a 60 Hz error loop
				// or starve sibling canvases sharing this frame.
				const onError = errorHandlers.get(callback);
				callbacks.delete(callback);
				errorHandlers.delete(callback);
				console.error('svelte-fluid: frame callback failed', error);
				try {
					onError?.(error);
				} catch (handlerError) {
					console.error('svelte-fluid: frame error handler threw', handlerError);
				}
			}
		}
	} finally {
		schedule();
	}
}

/** Run `callback` every animation frame until the returned unsubscribe is called or it throws. */
export function subscribeFrame(callback: FrameCallback, onError?: (error: unknown) => void): () => void {
	callbacks.add(callback);
	if (onError) errorHandlers.set(callback, onError);
	schedule();
	return () => {
		if (!callbacks.delete(callback)) return;
		errorHandlers.delete(callback);
		if (callbacks.size === 0 && frameId) {
			cancelAnimationFrame(frameId);
			frameId = 0;
		}
	};
}

/** @internal Test observability. */
export function activeFrameSubscribers(): number {
	return callbacks.size;
}
