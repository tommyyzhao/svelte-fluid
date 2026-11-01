/*
 * Internal free-surface liquid engine contract (ADR-0114). Never root-exported.
 * Coordinates are simulation cells: x right, y down, origin at the top-left;
 * velocities are cells per second. GL types never cross this boundary.
 */

export type Species = 0 | 1 | 2;
export type Counts = readonly [number, number, number];
export type Rgb = readonly [number, number, number];

/** Terrain cell kinds. Everything except AIR is solid to liquid. */
export const AIR = 0;
export const STONE = 1;
export const LOAM = 2;
export const INK = 3;
export const GATE = 4;
export const VINE = 5;
/** Rootbound loam: solid, looks like loam, cannot be dug. */
export const ROOT = 6;
export type CellKind = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Integer cell rectangle. */
export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Vec {
	x: number;
	y: number;
}

export interface LiquidScene {
	/** Cells; at most 256×160. */
	width: number;
	height: number;
	/** width*height CellKind values, row-major from the top row. */
	terrain: Uint8Array;
	/** Liquid present at load, jittered over the air cells of `rect`. */
	fills: readonly { species: Species; rect: Rect; markers: number }[];
	/** Counting regions (≤ 32, may overlap). A marker counts where its cell lies. */
	sensors: readonly { id: string; rect: Rect }[];
	/** Markers entering a drain (≤ 16) leave the flow and are tallied, never deleted. */
	drains: readonly { id: string; rect: Rect }[];
	/** Downward acceleration, cells/s². Default 300. */
	gravity?: number;
	/** Marker speed cap, cells/s. Default 150. */
	maxSpeed?: number;
}

/** One terrain cell write, applied at the start of the next step. */
export interface TerrainEdit {
	x: number;
	y: number;
	kind: CellKind;
}

export interface LiquidTick {
	/** Strictly increasing integer. One tick = 1/60 s of simulation. */
	tick: number;
	/**
	 * Marker counts to emit this tick, jittered over `rect` with `velocity`.
	 * Counts are clamped to `capacityLeft`; `emitted` reports what was emitted.
	 * Markers landing in solid are pushed out like any other.
	 */
	emit: readonly { species: Species; count: number; rect: Rect; velocity: Vec }[];
	/** Applied before the step. Markers inside newly solid cells are pushed out, never deleted. */
	edits: readonly TerrainEdit[];
	/**
	 * Optional air velocity, cells/s, x right / y down, row-major from the top
	 * row, stretched over the whole grid. Drags airborne liquid toward it;
	 * pooled liquid is barely affected. Omitted = still air.
	 */
	wind?: Wind;
}

export interface Wind {
	/** At most 96×60. */
	width: number;
	height: number;
	/** width*height*2 interleaved (vx, vy), finite, |v| ≤ 400. */
	data: Float32Array;
}

export interface SensorReading {
	counts: Counts;
	/** Sum of the velocities of the markers inside, cells/s. */
	flux: Vec;
}

/** Asynchronous, tick-tagged snapshot (normally 1–3 ticks old). */
export interface SensorFrame {
	tick: number;
	/** Increments on every load(); frames from an older epoch are never returned. */
	epoch: number;
	sensors: Readonly<Record<string, SensorReading>>;
	/** Cumulative per drain since load. */
	drained: Readonly<Record<string, Counts>>;
	/** Markers still in the flow. alive + Σdrained == seeded + emitted. */
	alive: Counts;
	seeded: Counts;
	emitted: Counts;
	/** Mean marker speed, cells/s (audio and ambience). */
	activity: number;
	/** width*height markers per cell (capped 255), row-major from the top. */
	occupancy: Uint8Array;
}

export interface LiquidOptions {
	canvas: HTMLCanvasElement;
	seed: number;
	/** sRGB hex per species; mixtures are derived with Kubelka–Munk. */
	palette: readonly [string, string, string];
	onError?(error: unknown): void;
	onContextLost?(): void;
	onContextRestored?(): void;
}

export interface RenderOptions {
	/** Seconds, for shimmer. */
	time: number;
	/** 0..1 payoff brightening. */
	glow?: number;
}

/** What LiquidEngine implements; the game depends on this, not the class. */
export interface LiquidSim {
	load(scene: LiquidScene): void;
	step(tick: LiquidTick): void;
	/** Newest-last frames that completed since the previous call; never blocks. */
	pollSensors(): readonly SensorFrame[];
	/** Markers emitted this epoch, known synchronously. */
	readonly emitted: Counts;
	/** Free particle slots. */
	readonly capacityLeft: number;
	/** Repack drained slots (rare, synchronous readback); for unlimited sandbox play. */
	compact(): void;
	render(options: RenderOptions): void;
	resize(width: number, height: number): void;
	dispose(): void;
}
