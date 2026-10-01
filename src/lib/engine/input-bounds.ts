import type { FluidConfig, RGB } from './types.js';

/**
 * Random splats retained across frames. One randomSplats() call cannot exceed
 * this; further calls saturate here instead of growing an unbounded queue.
 */
export const MAX_QUEUED_RANDOM_SPLATS = 64;
/** Random splats consumed per frame: 16 × 2 blits keeps a burst under ~1 ms on integrated GPUs. */
export const MAX_RANDOM_SPLATS_PER_FRAME = 16;
/** Construct-time opening splats run synchronously, so they share the retained cap. */
export const MAX_INITIAL_SPLATS = MAX_QUEUED_RANDOM_SPLATS;
/** Auto-splat bursts may fire several times per frame after a throttled tab; cap each burst. */
export const MAX_AUTO_SPLAT_COUNT = MAX_RANDOM_SPLATS_PER_FRAME;

// Not GL state: a process-wide dedupe so a 60 Hz caller bug logs once, not forever.
const warned = new Set<string>();

function warnOnce(key: string, message: string): void {
	if (warned.has(key)) return;
	warned.add(key);
	console.warn(`svelte-fluid: ${message}`);
}

/** @internal Test hook. */
export function resetInputWarnings(): void {
	warned.clear();
}

/** Clamp a randomSplats() request into the retained backlog. Non-finite/negative counts add nothing. */
export function enqueueRandomSplats(pending: number, count: number): number {
	if (!Number.isFinite(count)) {
		warnOnce('randomSplats', `randomSplats(${count}) ignored; count must be finite`);
		return pending;
	}
	return Math.min(MAX_QUEUED_RANDOM_SPLATS, pending + Math.max(0, Math.floor(count)));
}

/** Splats to run this frame given the backlog. */
export function randomSplatsThisFrame(pending: number): number {
	return Math.min(MAX_RANDOM_SPLATS_PER_FRAME, pending);
}

/** True when every splat argument is finite; non-finite input would poison float fields with NaN. */
export function isFiniteSplat(x: number, y: number, dx: number, dy: number, color: RGB): boolean {
	if (
		Number.isFinite(x) &&
		Number.isFinite(y) &&
		Number.isFinite(dx) &&
		Number.isFinite(dy) &&
		Number.isFinite(color?.r) &&
		Number.isFinite(color?.g) &&
		Number.isFinite(color?.b)
	) {
		return true;
	}
	warnOnce('splat', 'splat() ignored; coordinates, force and color must be finite numbers');
	return false;
}

function isRgb(value: unknown): value is RGB {
	return typeof value === 'object' && value !== null && 'r' in value && 'g' in value && 'b' in value;
}

/**
 * Drop top-level numeric and RGB config fields containing NaN/±Infinity so
 * they read as "not supplied" and the previous resolved value survives.
 * ponytail: nested descriptors (containerShape, obstructions, flow) are not
 * scanned; add per-descriptor validation if those prove to be a NaN source.
 */
export function withoutNonFiniteConfig(input: FluidConfig): FluidConfig {
	let out: Record<string, unknown> | null = null;
	for (const [key, value] of Object.entries(input)) {
		const bad =
			(typeof value === 'number' && !Number.isFinite(value)) ||
			(isRgb(value) && ![value.r, value.g, value.b].every(Number.isFinite));
		if (!bad) continue;
		out ??= { ...input };
		delete out[key];
		warnOnce(`config.${key}`, `ignoring non-finite ${key}; keeping the previous value`);
	}
	return (out as FluidConfig | null) ?? input;
}
