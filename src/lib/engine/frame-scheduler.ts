/*
 * One requestAnimationFrame shared by every FluidEngine on the page (ADR 0080).
 * Holds callbacks only, never GL state (architecture invariant #2). Nothing
 * touches requestAnimationFrame until the first subscribe, so import is SSR-safe.
 */

/** @internal Presentation-only deadline policy; never gate a solver or scheduler callback. */
export function createFrameGate(initialRate = 0): {
	shouldSubmit: (now: number, maxFps?: number | null) => boolean;
	reset: () => void;
} {
	let previous: number | undefined;
	let rate = initialRate;
	let nextDeadline = 0;
	let displayInterval = 1000 / 60;
	const intervals: number[] = [];
	const reset = () => {
		previous = undefined;
		nextDeadline = 0;
		intervals.length = 0;
		displayInterval = 1000 / 60;
	};
	return {
		reset,
		shouldSubmit(now, maxFps) {
			const resolvedRate = maxFps === null ? 0
				: maxFps !== undefined && Number.isFinite(maxFps) && maxFps >= 0 ? maxFps : rate;
			if (resolvedRate !== rate) {
				reset();
				rate = resolvedRate;
			}
			const delta = previous === undefined ? 0 : now - previous;
			if (previous !== undefined && (delta <= 0 || delta > 100)) reset();
			if (delta >= 1 && delta <= 100) {
				intervals.push(delta);
				if (intervals.length > 5) intervals.shift();
				const sorted = [...intervals].sort((a, b) => a - b);
				displayInterval = sorted[Math.floor(sorted.length / 2)];
			}
			const first = previous === undefined;
			previous = now;
			if (!resolvedRate) return true;
			const period = 1000 / resolvedRate;
			if (first || period <= displayInterval + 0.001 || now - nextDeadline > period * 3) {
				nextDeadline = now + period;
				return true;
			}
			if (now < nextDeadline - displayInterval / 2) return false;
			// Keep the ideal phase rather than accumulating quantized submission error.
			nextDeadline += period * Math.max(1, Math.floor((now - nextDeadline) / period) + 1);
			return true;
		}
	};
}

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
