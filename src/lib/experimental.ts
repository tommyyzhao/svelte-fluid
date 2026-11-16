/*
 * svelte-fluid/experimental — unstable engine surfaces (ADR 0116).
 * No semver promise: any minor release may change or remove these names.
 */
import { FluidEngine, type FluidEngineOptions } from './engine/FluidEngine.js';

export { LiquidEngine } from './engine/liquid/LiquidEngine.js';
export {
	Cell,
	// Deprecated aliases (one minor): identical values, game-flavoured names.
	AIR,
	STONE,
	LOAM,
	INK,
	GATE,
	VINE,
	ROOT
} from './engine/liquid/types.js';
export type {
	CellKind,
	CellRect,
	CellVec,
	LiquidEmit,
	LiquidFill,
	LiquidOptions,
	LiquidRegion,
	LiquidRenderOptions,
	LiquidScene,
	LiquidSim,
	LiquidSpecies,
	LiquidTick,
	LiquidWind,
	SensorFrame,
	SensorReading,
	SpeciesCounts,
	TerrainEdit,
	// Deprecated aliases (one minor).
	Counts,
	Rect,
	RenderOptions,
	Rgb,
	Species,
	Vec,
	Wind
} from './engine/liquid/types.js';

/**
 * Box-averaged air velocity from {@link SteppedFluidEngine.pollVelocitySnapshot}.
 *
 * Coordinates: normalized-domain units/s, x right, y UP, interleaved xy,
 * row-major with the BOTTOM row first. This differs from `LiquidTick.wind`
 * (cells/s, y down, top row first); to convert, `vx = width * ux`,
 * `vy = -height * uy`, and reverse the row order.
 */
export interface VelocitySnapshot {
	tick: number;
	/** Bumps on every velocity-domain rebuild; drop snapshots from an older epoch. */
	epoch: number;
	width: number;
	height: number;
	data: Float32Array;
}

/**
 * A FluidEngine stepped by the caller's clock instead of requestAnimationFrame.
 * `pause`/`resume`/`isPaused` are omitted: `resume()` would start the RAF loop
 * and defeat the caller's clock; drive it with `advance` + `renderOnce`.
 */
export interface SteppedFluidEngine extends Omit<FluidEngine, 'pause' | 'resume' | 'isPaused'> {
	/** Advance by `steps` identical fixed `dt` steps (seconds). */
	advance(steps: number, dt: number): void;
	/**
	 * Present the current state once. `advance`, `splat`, `setConfig` and `resize`
	 * mark the frame dirty; a call with nothing new to show is a no-op (returns
	 * early rather than redrawing), as it is after dispose or a lost context.
	 */
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
