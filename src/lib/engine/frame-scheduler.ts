export type FrameCallback = (now: number) => void;

const callbacks = new Set<FrameCallback>();
const errorHandlers = new WeakMap<FrameCallback, (error: unknown) => void>();
let frameId = 0;

function schedule(): void {
	if (frameId || callbacks.size === 0) return;
	frameId = requestAnimationFrame(runFrame);
}

function runFrame(now: number): void {
	frameId = 0;
	// Snapshotting lets a callback pause or dispose itself without disturbing
	// the rest of this frame. New subscribers begin on the following frame.
	try {
		for (const callback of [...callbacks]) {
			try {
				callback(now);
			} catch (error) {
				// A deterministic failure must not become a 60 Hz error loop, and one
				// instance must not starve every other canvas on the shared RAF.
				callbacks.delete(callback);
				console.error('svelte-fluid: frame callback failed', error);
				try {
					errorHandlers.get(callback)?.(error);
				} catch (handlerError) {
					console.error('svelte-fluid: frame error handler threw', handlerError);
				}
				errorHandlers.delete(callback);
			}
		}
	} finally {
		schedule();
	}
}

/** One browser RAF shared by every native WebGPU runtime on the page. */
export function subscribeFrame(callback: FrameCallback, onError?: (error: unknown) => void): () => void {
	callbacks.add(callback);
	if (onError) errorHandlers.set(callback, onError);
	schedule();
	let subscribed = true;
	return () => {
		if (!subscribed) return;
		subscribed = false;
		callbacks.delete(callback);
		errorHandlers.delete(callback);
		if (callbacks.size === 0 && frameId) {
			cancelAnimationFrame(frameId);
			frameId = 0;
		}
	};
}

/** @internal R&D observability; not part of the package API. */
export function activeFrameSubscribers(): number {
	return callbacks.size;
}
