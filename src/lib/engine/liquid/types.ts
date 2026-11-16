/*
 * Free-surface liquid engine contract (ADR-0114, experimental entry).
 * Coordinates are simulation cells: x right, y down, origin at the top-left;
 * velocities are cells per second. GL types never cross this boundary.
 */

/** Liquid species index: three independent liquids, mixed by the palette. */
export type LiquidSpecies = 0 | 1 | 2;
/** Per-species marker counts, indexed by {@link LiquidSpecies}. */
export type SpeciesCounts = readonly [number, number, number];

/**
 * Terrain cell kinds. The engine only distinguishes air (0) from solid (non-zero):
 * liquid collides with, and the renderer masks, every non-zero cell identically.
 * 2..6 are also solid and free for caller-defined tags; the engine stores and
 * validates them (0..6) but never gives them different physics or colour.
 */
export const Cell = {
	/** Empty cell: liquid can occupy it. */
	Air: 0,
	/** Solid cell. */
	Solid: 1
} as const;
/** Value stored in {@link LiquidScene.terrain}: 0 = air, 1 = solid, 2..6 = solid with a caller-defined tag. */
export type CellKind = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** @deprecated Use `Cell.Air`. */
export const AIR = Cell.Air;
/** @deprecated Use `Cell.Solid`. */
export const STONE = Cell.Solid;
/** @deprecated Solid tag 2; use a caller-defined constant. */
export const LOAM = 2 as const;
/** @deprecated Solid tag 3; use a caller-defined constant. */
export const INK = 3 as const;
/** @deprecated Solid tag 4; use a caller-defined constant. */
export const GATE = 4 as const;
/** @deprecated Solid tag 5; use a caller-defined constant. */
export const VINE = 5 as const;
/** @deprecated Solid tag 6; use a caller-defined constant. */
export const ROOT = 6 as const;

/** Integer cell rectangle. */
export interface CellRect {
	x: number;
	y: number;
	w: number;
	h: number;
}
/** @deprecated Use CellRect. */
export type Rect = CellRect;

/** A 2D vector in cell space (x right, y down). */
export interface CellVec {
	x: number;
	y: number;
}
/** @deprecated Use CellVec. */
export type Vec = CellVec;

/** @deprecated Use LiquidSpecies. */
export type Species = LiquidSpecies;
/** @deprecated Use SpeciesCounts. */
export type Counts = SpeciesCounts;
/** @deprecated Unused by the engine; declare your own `readonly [number, number, number]`. */
export type Rgb = readonly [number, number, number];

/** Liquid present at load. */
export interface LiquidFill {
	species: LiquidSpecies;
	/** Markers are jittered over the air cells of this rectangle. */
	rect: CellRect;
	markers: number;
}

/** A named rectangle: a counting sensor or a drain. */
export interface LiquidRegion {
	id: string;
	rect: CellRect;
}

/** Markers to emit in one tick. */
export interface LiquidEmit {
	species: LiquidSpecies;
	count: number;
	rect: CellRect;
	/** Initial marker velocity, cells/s. */
	velocity: CellVec;
}

export interface LiquidScene {
	/** Cells; at most 256×160. */
	width: number;
	height: number;
	/** width*height CellKind values, row-major from the top row. */
	terrain: Uint8Array;
	/** Liquid present at load, jittered over the air cells of `rect`. */
	fills: readonly LiquidFill[];
	/** Counting regions (≤ 32, may overlap). A marker counts where its cell lies. */
	sensors: readonly LiquidRegion[];
	/** Markers entering a drain (≤ 16) leave the flow and are tallied, never deleted. */
	drains: readonly LiquidRegion[];
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
	emit: readonly LiquidEmit[];
	/** Applied before the step. Markers inside newly solid cells are pushed out, never deleted. */
	edits: readonly TerrainEdit[];
	/**
	 * Optional air velocity, cells/s, x right / y DOWN, row-major from the TOP
	 * row, stretched over the whole grid. Drags airborne liquid toward it;
	 * pooled liquid is barely affected. Omitted = still air.
	 * Differs from `VelocitySnapshot` (normalized units/s, y up, bottom row
	 * first): to feed a snapshot back, `vx = width * ux`, `vy = -height * uy`
	 * with the rows reversed.
	 */
	wind?: LiquidWind;
}

/** Air velocity field for {@link LiquidTick.wind}. */
export interface LiquidWind {
	/** At most 96×60. */
	width: number;
	height: number;
	/** width*height*2 interleaved (vx, vy), finite, |v| ≤ 400. */
	data: Float32Array;
}

/** @deprecated Use LiquidWind. */
export type Wind = LiquidWind;

export interface SensorReading {
	counts: SpeciesCounts;
	/** Sum of the velocities of the markers inside, cells/s. */
	flux: CellVec;
}

/** Asynchronous, tick-tagged snapshot (normally 1–3 ticks old). */
export interface SensorFrame {
	tick: number;
	/** Increments on every load(); frames from an older epoch are never returned. */
	epoch: number;
	sensors: Readonly<Record<string, SensorReading>>;
	/** Cumulative per drain since load. */
	drained: Readonly<Record<string, SpeciesCounts>>;
	/** Markers still in the flow. alive + Σdrained == seeded + emitted. */
	alive: SpeciesCounts;
	seeded: SpeciesCounts;
	emitted: SpeciesCounts;
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

export interface LiquidRenderOptions {
	/** Seconds, for shimmer. */
	time: number;
	/** 0..1 payoff brightening. */
	glow?: number;
}

/** @deprecated Use LiquidRenderOptions. */
export type RenderOptions = LiquidRenderOptions;

/** What LiquidEngine implements; depend on this rather than the class. */
export interface LiquidSim {
	load(scene: LiquidScene): void;
	step(tick: LiquidTick): void;
	/** Newest-last frames that completed since the previous call; never blocks. */
	pollSensors(): readonly SensorFrame[];
	/** Markers emitted this epoch, known synchronously. */
	readonly emitted: SpeciesCounts;
	/** Free particle slots. */
	readonly capacityLeft: number;
	/** Repack drained slots (rare, synchronous readback); for unlimited sandbox play. */
	compact(): void;
	render(options: LiquidRenderOptions): void;
	resize(width: number, height: number): void;
	dispose(): void;
}
