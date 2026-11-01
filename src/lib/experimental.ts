/*
 * svelte-fluid/experimental — unstable engine surfaces (ADR 0116).
 * No semver promise: any minor release may change or remove these names.
 */
import { FluidEngine, type FluidEngineOptions } from './engine/FluidEngine.js';

export { LiquidEngine } from './engine/liquid/LiquidEngine.js';
export * from './engine/liquid/types.js';

/** Box-averaged air velocity: normalized units/s (x right, y up), interleaved xy, bottom row first. */
export interface VelocitySnapshot {
	tick: number;
	/** Bumps on every velocity-domain rebuild; drop snapshots from an older epoch. */
	epoch: number;
	width: number;
	height: number;
	data: Float32Array;
}

/** A FluidEngine stepped by the caller's clock instead of requestAnimationFrame. */
export interface SteppedFluidEngine extends FluidEngine {
	/** Advance by `steps` identical fixed `dt` steps (seconds). */
	advance(steps: number, dt: number): void;
	/** Present the current state once. */
	renderOnce(): void;
	/** Resize the drawing buffer in place, keeping the context; true when the size changed. */
	resize(width: number, height: number): boolean;
	/** Queue a nonblocking GPU readback; false when unavailable or all 3 slots are busy. */
	queueVelocitySnapshot(tick: number, width: number, height: number): boolean;
	/** Oldest completed snapshot, never blocks; null until a fence signals. */
	pollVelocitySnapshot(): VelocitySnapshot | null;
}

export function createSteppedFluidEngine(options: FluidEngineOptions): SteppedFluidEngine {
	return new FluidEngine({ ...options, autoStart: false });
}
