/*
 * svelte-fluid — types module
 * Derivative work of WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017, MIT.
 * https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
 */

import type { Snippet } from 'svelte';
import type { HTMLButtonAttributes, HTMLCanvasAttributes } from 'svelte/elements';
import type { WebGLUnavailableReason } from './gl-support.js';

/**
 * RGB triple. Unit conventions vary by call site:
 *
 * - {@link FluidConfig.backColor} — **0–255** (CSS-style). Normalized
 *   internally by `normalizeColor` before reaching the shader.
 * - {@link PresetSplat.color} and {@link FluidHandle.splat} — **0–1**
 *   (linear). Values above 1 are valid HDR and read as bloom highlights.
 * - All RGB values returned by `generateColor` / `HSVtoRGB` — 0–1.
 *
 * Each consumer documents its own range explicitly.
 */
/** Display tone map selector. See {@link FluidConfig.toneMapping}. */
export type ToneMapping = 'neutral' | 'agx' | 'none';

export interface RGB {
	r: number;
	g: number;
	b: number;
}

/** 2D vector in normalized flow space. `y` follows the fluid convention: positive is upward. */
export interface Vec2 {
	x: number;
	y: number;
}

export type FlowMode = 'live' | 'prescribed' | 'hybrid';
export type FlowBoundaryKind = 'wall' | 'open';
export type FlowSourceKind = 'point' | 'line' | 'rect';
export type FlowProfile = 'uniform' | 'parabolic';
export type FlowScalarName = 'temperature' | 'ink' | string;
export type FlowAdvection = 'standard' | 'low-dissipation';
export type FlowVisualizationField = 'dye' | 'speed' | 'pressure' | 'temperature' | 'scalar';
export type FlowTransfer = 'fire' | 'water' | 'ink' | 'viridis' | 'cfd';

export interface FlowBoundary {
	left?: FlowBoundaryKind;
	right?: FlowBoundaryKind;
	top?: FlowBoundaryKind;
	bottom?: FlowBoundaryKind;
}

interface FlowSourceBase {
	/** Raw velocity injected every frame, in the same units as {@link PresetSplat.dx}. */
	velocity?: Vec2;
	/** RGB dye injected every frame. Components use the same 0-1/HDR range as {@link PresetSplat.color}. */
	dye?: RGB;
	/** Named scalar values injected every frame, e.g. `{ temperature: 1 }` or `{ ink: 0.8 }`. */
	scalars?: Partial<Record<FlowScalarName, number>>;
	/**
	 * Source strength in "full-strength frames per second". Default 60 means
	 * the configured velocity/dye/scalar values are applied once per 60 Hz frame.
	 */
	rate?: number;
	/** Gaussian splat radius in the same public units as `splatRadius`. Defaults to the component's `splatRadius`. */
	radius?: number;
	/** Optional profile across line/rect sources. Default `uniform`. */
	profile?: FlowProfile;
	/**
	 * Deprecated compatibility hint from the earlier sampled-source
	 * implementation. Line/rect sources now render through one analytic shader
	 * pass per target and ignore this value.
	 */
	samples?: number;
}

export type FlowSource =
	| (FlowSourceBase & { kind: 'point'; x: number; y: number })
	| (FlowSourceBase & {
			kind: 'line';
			from: Vec2;
			to: Vec2;
			thickness?: number;
	  })
	| (FlowSourceBase & {
			kind: 'rect';
			x: number;
			y: number;
			width: number;
			height: number;
	  });

export interface FlowOutlet {
	edge: 'left' | 'right' | 'top' | 'bottom';
	/** Normalized interval along the outlet edge. Defaults to 0. */
	from?: number;
	/** Normalized interval along the outlet edge. Defaults to 1. */
	to?: number;
	/** Edge-zone width in UV units. Default 0.035. */
	width?: number;
	/** Multiplier applied to dye in the outlet zone. Default 0. */
	clearDye?: number;
	/** Whether to damp velocity in the outlet zone. Default false. */
	clearVelocity?: boolean;
	/** Whether to damp scalar fields in the outlet zone. Default true. */
	clearScalars?: boolean;
}

export interface FlowScalarField {
	name: FlowScalarName;
	/** Scalar dissipation. Defaults to `densityDissipation` semantics. */
	dissipation?: number;
	/** `low-dissipation` reduces explicit scalar dissipation; it is not MacCormack/BFECC advection. Default `standard`. */
	advection?: FlowAdvection;
	/** Display color used by scalar visualization transfer functions. */
	color?: RGB;
	/** Input range mapped into visualization. Default `[0, 1]`. */
	range?: [number, number];
}

export type FlowForce =
	| { kind: 'gravity'; vector: Vec2 }
	| { kind: 'pressureGradient'; vector: Vec2 }
	| {
			kind: 'buoyancy';
			scalar: FlowScalarName;
			direction?: Vec2;
			strength: number;
			ambient?: number;
	  };

export interface FlowGridField {
	width: number;
	height: number;
	/** Row-major values. Velocity grids use x/y pairs; scalar grids use one value per cell. */
	data: ArrayLike<number>;
	/** Decode scale for normalized texture uploads. Default 1. */
	scale?: number;
	/**
	 * Optional immutable-data revision. Increment or replace it when reusing the
	 * same `data` object with changed values so `setConfig()` knows to re-upload.
	 */
	version?: number | string;
}

export type PrescribedFlowField = {
	kind: 'grid';
	velocity?: FlowGridField;
	scalars?: Partial<Record<FlowScalarName, FlowGridField>>;
};

export interface FlowVisualization {
	colorBy?: FlowVisualizationField;
	scalar?: FlowScalarName;
	/** Add a small display-only glow from either speed or the selected scalar. */
	glowBy?: 'speed' | 'scalar' | 'none';
	/** Color transfer function. `cfd` maps low→high as blue→cyan→green→yellow→red for velocity/pressure plots. */
	transfer?: FlowTransfer;
	/** Optional raw field range mapped to the selected transfer function before `scale` is applied. */
	range?: [number, number];
	scale?: number;
}

export interface FlowConfig {
	mode?: FlowMode;
	boundary?: FlowBoundary;
	sources?: ReadonlyArray<FlowSource>;
	outlets?: ReadonlyArray<FlowOutlet>;
	scalarFields?: ReadonlyArray<FlowScalarField>;
	forces?: ReadonlyArray<FlowForce>;
	prescribed?: PrescribedFlowField;
	visualization?: FlowVisualization;
}

/**
 * Declarative initial splat. Consumed once at engine construction
 * (after the random initial splats), then forgotten. Used by preset
 * wrappers to paint a deterministic opening scene.
 *
 * Coordinates are normalized: x ∈ [0,1] (left → right),
 * y ∈ [0,1] (**bottom → top**, y-inverted from DOM space).
 *
 * `dx` / `dy` are raw velocity values written directly to the splat
 * shader uniform (in pixels per frame). Unlike pointer-driven splats,
 * preset velocities are **not** multiplied by `splatForce` — pick the
 * absolute magnitude you want.
 *
 * `color` components are in **0–1** linear range; values above 1 are
 * valid and useful for HDR-style bloom highlights.
 */
export interface PresetSplat {
	x: number;
	y: number;
	dx: number;
	dy: number;
	color: RGB;
}

/**
 * Describes the shape of a fluid container. The simulation keeps fluid
 * within the shape — velocity has zero normal component at the wall and
 * dye cannot escape — rather than merely clipping the rendered output.
 *
 * Coordinates follow the same convention as splat positions:
 * `cx`/`cy` ∈ [0, 1] (left→right, bottom→top). `radius` is normalised
 * by canvas height: `radius: 0.45` gives a physical radius of 45% of
 * the canvas height, which fits comfortably inside landscape canvases.
 *
 * **`circle`** — fluid contained inside a circle. Everything outside is zeroed.
 *
 * **`frame`** — fluid flows everywhere *except* inside a rectangular cutout.
 * `halfW`/`halfH` are in UV space (0–1), so `halfW: 0.2` means the inner
 * rectangle extends 20% of canvas width on each side of `cx`.
 * Think of it as a picture frame: fluid fills the border region.
 * `innerCornerRadius` rounds the inner cutout corners.
 * `outerHalfW`/`outerHalfH`/`outerCornerRadius` define the outer boundary
 * (defaults to full canvas when omitted). Both boundaries are fluid-conforming.
 *
 * **`roundedRect`** — like `frame` but with rounded corners, and the fluid
 * stays *inside* the rounded rectangle rather than outside it.
 * `halfW`/`halfH` define the rectangle extents in UV space (same as `frame`),
 * and `cornerRadius` (also in UV space) controls how rounded the corners are.
 *
 * **`annulus`** — fluid contained within a circular ring between `innerRadius`
 * and `outerRadius`. Both radii are normalised by canvas height (same as
 * `circle`). Everything inside the inner circle and outside the outer circle
 * is zeroed. Aspect correction is applied, matching the `circle` type.
 *
 * **`svgPath`** — fluid contained within the filled region of an SVG path
 * string or Canvas 2D text. The shape is rasterized to a mask texture at
 * `maskResolution` (default 512). Two rasterization modes:
 *
 * - **Path mode** (`d`): uses `Path2D(d)` with `viewBox` mapping
 *   (default `[0, 0, 100, 100]`). Use `fillRule: 'evenodd'` for font
 *   outlines with counters.
 * - **Text mode** (`text`): uses `ctx.fillText()` with `font` (default
 *   `'bold 72px sans-serif'`). The text is centered in the mask texture.
 *   Great for fluid-filled letters without needing SVG path data.
 *
 * At least one of `d` or `text` must be provided. If both are given,
 * `d` takes precedence. See ADR-0024.
 */
export type ContainerShape =
	| { type: 'circle'; cx: number; cy: number; radius: number }
	| {
			type: 'frame';
			cx: number;
			cy: number;
			halfW: number;
			halfH: number;
			innerCornerRadius?: number;
			outerHalfW?: number;
			outerHalfH?: number;
			outerCornerRadius?: number;
	  }
	| {
			type: 'roundedRect';
			cx: number;
			cy: number;
			halfW: number;
			halfH: number;
			cornerRadius: number;
	  }
	| {
			type: 'annulus';
			cx: number;
			cy: number;
			innerRadius: number;
			outerRadius: number;
	  }
	| {
			type: 'svgPath';
			d?: string;
			text?: string;
			font?: string;
			viewBox?: [number, number, number, number];
			fillRule?: 'nonzero' | 'evenodd';
			maskResolution?: number;
	  };

/**
 * An interior obstacle the fluid flows around. Reuses the same svgPath/text
 * descriptor as {@link ContainerShape}'s `svgPath` variant, so the filled
 * region of `d` (or rasterized `text`) marks where fluid is *blocked* rather
 * than where it is *contained*.
 *
 * `offset` and `scale` place and size the obstruction in UV space (0–1,
 * bottom-to-top): `offset` shifts it after the base fit transform, `scale`
 * multiplies the fit scale (1 = fit as-is, 2 = double size, 0.5 = half).
 *
 * All obstructions in {@link FluidConfig.obstructions} are rasterized into a
 * single combined mask (their filled regions union together). This is
 * orthogonal to `containerShape`: the allowed fluid region is
 * `container × (1 − obstruction)`. See ADR-0034.
 */
export interface Obstruction {
	/** SVG path data string (path mode). Takes precedence over `text`. */
	d?: string;
	/** Text to rasterize as the obstruction (text mode). */
	text?: string;
	/** CSS font string for text mode. Default `'bold 72px sans-serif'`. */
	font?: string;
	/** viewBox for path mode. Default `[0, 0, 100, 100]`. */
	viewBox?: [number, number, number, number];
	/** Fill rule for path mode. Default `'nonzero'`. */
	fillRule?: 'nonzero' | 'evenodd';
	/** UV-space translation applied after the base fit transform. Default `{ x: 0, y: 0 }`. */
	offset?: { x: number; y: number };
	/** Multiplier on the base fit scale. Default 1. */
	scale?: number;
	/**
	 * How the `viewBox` maps onto the (non-square) canvas. Default `'contain'`.
	 * - `'contain'`: uniform-fit + center — shape-accurate, but letterboxes
	 *   into the canvas's narrower axis, leaving open margins. Best for
	 *   discrete obstacles placed via `offset`/`scale`.
	 * - `'fill'`: stretch each axis independently to fill the whole canvas at
	 *   any aspect (no margins). Best for canvas-spanning geometry like a maze
	 *   or a nozzle channel, where the fluid must be confined edge-to-edge and
	 *   injection coordinates must line up regardless of the card's shape.
	 *   Path mode only; text mode always centers.
	 */
	fit?: 'contain' | 'fill';
}

/**
 * Describes a sticky mask shape. The mask is rasterized to a texture and
 * used to modulate physics shaders so dye "sticks" to the masked region.
 *
 * Two rasterization modes:
 * - **Text mode** (`text`): uses `ctx.fillText()` with `font`.
 * - **Path mode** (`d`): uses `Path2D(d)` with `viewBox` mapping.
 *
 * At least one of `d` or `text` must be provided. If both are given,
 * `d` takes precedence (same as `ContainerShape.svgPath`).
 */
export interface StickyMask {
	/** SVG path data string. */
	d?: string;
	/** Text to rasterize as the mask. Takes precedence over `d`. */
	text?: string;
	/** CSS font string for text mode. Default `'bold 72px sans-serif'`. */
	font?: string;
	/** viewBox for path mode. Default `[0, 0, 100, 100]`. */
	viewBox?: [number, number, number, number];
	/** Fill rule for path mode. Default `'nonzero'`. */
	fillRule?: 'nonzero' | 'evenodd';
	/** Rasterization resolution (longest dimension). Default 512. */
	maskResolution?: number;
	/** Blur radius in mask pixels. Softens edges for smoother physics. Default 0. */
	blur?: number;
	/**
	 * How much of the mask texture the text fills (text mode only).
	 * 0.9 = text fills 90% of the texture (default). Use smaller values
	 * when combining with a container shape (e.g. 0.5 to fit inside a
	 * circle with radius 0.45). Ignored in path mode. Default 0.9.
	 */
	padding?: number;
}

/**
 * Public, camelCase fluid configuration. Every field is optional;
 * the engine fills in defaults at construction time.
 */
export interface FluidConfig {
	/** Velocity grid resolution. Default 128. */
	simResolution?: number;
	/** Dye grid resolution. Default 1024 (clamped to 512 if linear filtering is unsupported). */
	dyeResolution?: number;
	/** How fast dye fades. Default 1. */
	densityDissipation?: number;
	/**
	 * Initial value for density dissipation, used during the first
	 * `initialDensityDissipationDuration` seconds. Linearly interpolates
	 * to `densityDissipation` over the duration, then holds steady.
	 *
	 * Useful when you want a vivid persistent scene
	 * (`densityDissipation: 0`) but the opening splats are bright enough
	 * to overwhelm the canvas — set a temporary higher dissipation that
	 * "burns in" the initial dye before locking to zero.
	 *
	 * Default: same as `densityDissipation` (no ramp).
	 */
	initialDensityDissipation?: number;
	/**
	 * Duration in seconds over which to ramp from
	 * `initialDensityDissipation` to `densityDissipation`. Default: 0
	 * (no ramp — `initialDensityDissipation` is ignored).
	 */
	initialDensityDissipationDuration?: number;
	/** How fast velocity fades. Default 0.2. */
	velocityDissipation?: number;
	/**
	 * Velocity advection scheme. Default `semilagrangian`.
	 *
	 * `maccormack` uses second-order velocity advection for crisper flow and
	 * structured scenes, but it can look angular/cubey on diffuse decorative dye.
	 * Dye and scalar advection remain semi-Lagrangian, and devices without linear
	 * filtering are capability-gated back to `semilagrangian`.
	 *
	 * Construct-only (Bucket D): `setConfig()` ignores runtime changes.
	 */
	advectionScheme?: 'semilagrangian' | 'maccormack';
	/**
	 * Maximum simulated seconds per solver substep. Default 1/60.
	 * Pair with `substeps` for steadier high-speed or narrow-channel flows.
	 */
	maxTimeStep?: number;
	/**
	 * Minimum solver substeps per rendered frame. Default 1.
	 * Higher values improve stability at the cost of extra GPU passes.
	 */
	substeps?: number;
	/**
	 * Dimensionless velocity diffusion. Default 0 (off).
	 * Implemented as an implicit Jacobi solve so small values remain stable.
	 */
	viscosity?: number;
	/** Jacobi iterations for the viscosity solve. Default 8. */
	viscosityIterations?: number;
	/**
	 * Tangential damping near interior obstruction masks. Default 0 (off).
	 * Approximates no-slip wall shear while preserving the existing mask model.
	 */
	wallFriction?: number;
	/** Width of the obstruction-adjacent wall-friction band in simulation cells. Default 1. */
	wallFrictionWidth?: number;
	/** Pressure solver weight. Default 0.8. */
	pressure?: number;
	/** Pressure solver iterations. Default 20. */
	pressureIterations?: number;
	/**
	 * Opt-in frame-time governor. When sustained live RAF frames exceed the
	 * internal budget, the engine sheds Bucket-A quality only: pressure
	 * iterations first, then solver substeps. It never auto-restores quality;
	 * call `setConfig()` with explicit values to raise them again. Ignored by
	 * deterministic `advance()` harness runs. Default false.
	 */
	autoPerformance?: boolean;
	/**
	 * Average live-frame duration, in milliseconds, that autoPerformance aims
	 * to stay at or below. Set approximately 33.33 for 30 Hz, 16.67 for 60 Hz,
	 * or 8.33 for 120 Hz. Default 1000/60. Bucket A.
	 */
	autoPerformanceTargetFrameMs?: number;
	/**
	 * Lower bound for autoPerformance pressure-iteration shedding.
	 * Default 8. Bucket A.
	 */
	autoPerformanceMinPressureIterations?: number;
	/**
	 * Lower bound for autoPerformance substep shedding.
	 * Default 1. Bucket A.
	 */
	autoPerformanceMinSubsteps?: number;
	/** Vorticity confinement strength. Default 30. */
	curl?: number;
	/**
	 * Adaptive confinement blend. `0` disables adaptive gating (legacy confinement
	 * magnitude); `1` fully gates the magnitude by local normalized vorticity.
	 * Note: confinement is independently attenuated next to solid boundaries (a fix
	 * so it no longer injects momentum into walls / fights projection), so output
	 * near obstructions differs from prior versions regardless of this value.
	 * Default 0. Bucket A.
	 */
	vorticityAdaptive?: number;
	/** Splat radius (NDC units). Default 0.25. */
	splatRadius?: number;
	/** Splat impulse force. Default 6000. */
	splatForce?: number;
	/** Optical-depth surface diffuse, preserving the 0.8.0 shading envelope. Default true. */
	shading?: boolean;
	/**
	 * Dielectric surface highlight intensity, 0–1. Default 0 (opt-in).
	 * Uses an optical-depth height normal, normalized Blinn-Phong and Schlick Fresnel.
	 * Independent of `shading`. Crossing zero recompiles only the display shader;
	 * positive intensity changes are hot uniforms, with no framebuffer allocation.
	 */
	specular?: number;
	/**
	 * Screen-space dye-layer refraction strength, 0–1. Default 0 (opt-in).
	 * Refracts the existing image in distortion mode or scene under glass;
	 * no effect on plain fluid/reveal or on DOM content behind the canvas.
	 * Crossing zero recompiles only the distortion display variant; positive
	 * changes are hot uniforms. Never allocates a scene texture of its own.
	 */
	refraction?: number;
	/**
	 * Rotate pointer/touch splat colors over time. Does not affect
	 * hand-authored `presetSplats` colors. Automatic splats use their
	 * own fresh generated colors unless `autoSplatColor` is set.
	 * Default true.
	 */
	colorful?: boolean;
	/** Color rotation rate (1/seconds). Default 10. */
	colorUpdateSpeed?: number;
	/** Pause simulation stepping; RAF stays live and renders only after invalidation. Default false. */
	paused?: boolean;
	/**
	 * Background color in **0–255 RGB** (CSS-style). Normalized internally
	 * by `normalizeColor` before reaching the shader. Default
	 * `{ r: 0, g: 0, b: 0 }` (pure black).
	 *
	 * Example: `{ r: 222, g: 218, b: 215 }` is a warm silver.
	 *
	 * Note that this differs from {@link PresetSplat.color} and
	 * {@link FluidHandle.splat}, which use 0–1 linear color. See
	 * {@link RGB} for the full convention table.
	 */
	backColor?: RGB;
	/** Render with transparent background (checkerboard fallback). Default false. */
	transparent?: boolean;
	/**
	 * Minimum WCAG contrast ratio (1–21) against
	 * `contrastColor`. Pixels that miss it are lifted toward white (against a
	 * dark reference) or darkened keeping hue (against a light one) until they
	 * pass; passing pixels are untouched. Values ≤ 1 / `undefined` disable it,
	 * which is the `<Fluid>` default, so the 0.8.0 look is unchanged.
	 * `<FluidText>` defaults it to 4.5 (AA for all text sizes) using an outline halo. With a transparent
	 * canvas the reference is the page behind it, so set `contrastColor` to the
	 * real page colour (`<FluidText>` measures it for you); without one it does nothing. Bucket B (keyword recompile on
	 * enable/disable; the value is a hot uniform). See ADR-0086.
	 */
	minContrast?: number;
	/**
	 * Reference colour for {@link FluidConfig.minContrast}, in **0–255 RGB**.
	 * No default: without it the correction is off (the engine cannot guess the
	 * page behind a transparent canvas, and a wrong guess paints the canvas grey).
	 * Set it to the page colour for a transparent canvas, or the text colour when
	 * text is drawn over an opaque fluid canvas (`<FluidBackground>` does this).
	 * Exception: an `outline` halo on an opaque canvas uses `backColor`.
	 */
	contrastColor?: RGB | null;
	/** Outline an svgPath mask (thin halo; interiors untouched, WebGL1 included) instead of correcting fill. FluidText defaults to outline. Bucket B. */
	contrastMode?: 'floor' | 'outline';
	/**
	 * Display tone map for bright dye and bloom (ADR-0081).
	 * - `'none'` (default): per-channel clip, exactly the 0.8.0 look.
	 * - `'neutral'`: Khronos PBR Neutral shoulder applied once in linear light.
	 *   Colours below it are unchanged; highlights roll off smoothly instead of
	 *   clipping to white.
	 * - `'agx'`: AgX filmic curve. Softer contrast and stronger highlight
	 *   desaturation, closer to a photographic look.
	 *
	 * Hot-updatable: changing it recompiles only the display program.
	 */
	toneMapping?: ToneMapping;
	/** Enable bloom effect. Default true. */
	bloom?: boolean;
	/** Bloom blur iterations. Default 8. */
	bloomIterations?: number;
	/** Bloom resolution. Default 256. */
	bloomResolution?: number;
	/** Bloom intensity. Default 0.8. */
	bloomIntensity?: number;
	/** Bloom luminance threshold. Default 0.6. */
	bloomThreshold?: number;
	/** Bloom soft-knee. Default 0.7. */
	bloomSoftKnee?: number;
	/** Enable sunrays effect. Default true. */
	sunrays?: boolean;
	/** Sunrays resolution. Default 196. */
	sunraysResolution?: number;
	/** Sunrays weight. Default 1. */
	sunraysWeight?: number;
	/** Minimum number of initial random splats. Default 5. */
	initialSplatCountMin?: number;
	/** Maximum number of initial random splats. Default 25. */
	initialSplatCountMax?: number;
	/** Exact initial splat count (overrides min/max if set). */
	initialSplatCount?: number;
	/**
	 * Enable mouse / touch / pen input (Pointer Events). Default true.
	 * A canvas-target instance sets `touch-action: none` on its canvas only
	 * while this is true; otherwise touch scrolling is not blocked. Pen
	 * pressure scales splat force 0.5x-1.5x. See ADR 0083.
	 */
	pointerInput?: boolean;
	/**
	 * Where to attach pointer event listeners.
	 * - `'canvas'` (default): listens on the canvas element only.
	 * - `'window'`: listens on `window`, so pointer activity anywhere
	 *   on the page drives the simulation. Useful for background fluid
	 *   where the canvas is behind other content.
	 *
	 * When `'window'`, touch scrolling is never blocked. When `'canvas'`,
	 * drags that leave the canvas keep splatting until release.
	 * Bucket A (hot-updatable).
	 */
	pointerTarget?: 'canvas' | 'window';
	/**
	 * When true, moving a mouse or pen over the canvas creates splats without
	 * requiring a press (never for touch). The splat velocity follows the cursor movement.
	 * Has no effect when `pointerInput` is false. Default false.
	 */
	splatOnHover?: boolean;
	/**
	 * 32-bit unsigned integer seed for the deterministic PRNG. If omitted,
	 * the Svelte component generates one once per mount and reuses it
	 * across resizes so the same initial splat pattern reappears.
	 */
	seed?: number;
	/**
	 * Reject a software/SwiftShader rendering path by passing
	 * `failIfMajorPerformanceCaveat` to the WebGL context. When `true` and only
	 * a software renderer is available, context creation fails and the component
	 * shows its WebGL fallback instead of animating on a slow CPU path.
	 *
	 * Off by default — many legitimate integrated GPUs would otherwise be
	 * misclassified. Construct-only (consumed once at context creation;
	 * `setConfig` ignores it). See ADR-0041.
	 */
	requireHardwareAcceleration?: boolean;
	/**
	 * Hand-crafted initial splats applied immediately after the random
	 * initial splats. Construct-only — `setConfig` ignores this field.
	 * Intended for preset wrapper components that paint a deterministic
	 * opening scene; combine with `initialSplatCount: 0` to suppress the
	 * random splats entirely. See {@link PresetSplat}.
	 */
	presetSplats?: ReadonlyArray<PresetSplat>;
	/**
	 * Automatic splat generation. Splats per second; 0 = disabled.
	 * Default 0. Bucket A (hot-updatable).
	 */
	autoSplatRate?: number;
	/** Number of splats emitted each automatic burst. Default 1. Bucket A. */
	autoSplatCount?: number;
	/**
	 * Fixed color for automatic splats. Null = fresh random color for
	 * each splat via generateColor(). Components are in 0–1 linear range;
	 * the engine applies a 10× HDR multiplier before injecting.
	 * Default null. Bucket A.
	 */
	autoSplatColor?: RGB | null;
	/** X velocity for automatic splats (raw, NOT scaled by splatForce). Ignored when `autoSplatSwirl` is nonzero. Default 0. Bucket A. */
	autoSplatVelocityX?: number;
	/** Y velocity for automatic splats (raw, NOT scaled by splatForce). Negative = downward in DOM. Ignored when `autoSplatSwirl` is nonzero. Default 0. Bucket A. */
	autoSplatVelocityY?: number;
	/**
	 * Vertical center of the automatic splat spawn band, in 0–1
	 * (bottom-to-top): 0 = bottom edge, 0.5 = center, 1 = top edge.
	 * Default 0.5. Actual y positions also use `autoSplatBandHeight`.
	 * Bucket A.
	 */
	autoSplatCenterY?: number;
	/**
	 * Horizontal center of the automatic splat spawn band, in 0–1
	 * (left-to-right): 0 = left edge, 0.5 = center, 1 = right edge.
	 * Default 0.5. Actual x positions also use `autoSplatBandWidth`
	 * unless `autoSplatEvenX` is true. Bucket A.
	 */
	autoSplatCenterX?: number;
	/**
	 * When true, each burst uses equal x positions across the horizontal
	 * axis instead of random x positions. The `autoSplatCount` splats
	 * are spaced at `(i + 0.5) / count` for i in 0..count-1.
	 * Default false. Bucket A.
	 */
	autoSplatEvenX?: boolean;
	/**
	 * When non-zero, automatic splats receive orbital velocity around the
	 * container center (or canvas center if no container shape). Positive =
	 * counter-clockwise, negative = clockwise. This replaces
	 * `autoSplatVelocityX` / `autoSplatVelocityY`. The magnitude controls speed.
	 * Default 0. Bucket A.
	 */
	autoSplatSwirl?: number;
	/**
	 * Height of the automatic splat spawn band. The y-coordinate is
	 * `autoSplatCenterY + (random - 0.5) * autoSplatBandHeight`, clamped
	 * to [0, 1]. Default 0.1 (±5% of canvas height). Set to 0 for a
	 * single horizontal line or 2.0 for full-canvas coverage
	 * (useful with container shapes where the mask discards out-of-bounds
	 * splats naturally). Bucket A.
	 */
	autoSplatBandHeight?: number;
	/**
	 * Width of the automatic splat spawn band. The x-coordinate is
	 * `autoSplatCenterX + (random - 0.5) * autoSplatBandWidth`, clamped
	 * to [0, 1]. Default 1.0 (full canvas width). Set near 0 for a
	 * left/right inlet plume. Ignored when `autoSplatEvenX` is true.
	 * Bucket A.
	 */
	autoSplatBandWidth?: number;
	/**
	 * Confine the fluid to a geometric shape. The simulation physically
	 * enforces the boundary — velocity is zeroed outside after every physics
	 * pass, and dye is masked after advection. `null` (default) = full
	 * rectangle with no masking.
	 *
	 * Changing this field at runtime triggers a mask-FBO rebuild (Bucket C)
	 * and a display-shader keyword recompile (Bucket B). Both are cheap
	 * (~one GPU blit + ~1 ms shader compile).
	 *
	 * See {@link ContainerShape} for coordinate conventions.
	 */
	containerShape?: ContainerShape | null;
	/**
	 * Enable glass vessel effect on the container shape. Adds a
	 * post-processing pass that simulates refraction and specular
	 * highlights at the container boundary. Requires a `containerShape`
	 * to be set — ignored when `containerShape` is null.
	 * Default false. See ADR-0025.
	 */
	glass?: boolean;
	/**
	 * Glass wall thickness in UV units. For non-circle shapes, controls
	 * how wide the refraction band is at the boundary. For circles,
	 * boosts refraction, specular, and glow toward the rim of the
	 * hemisphere dome. Default 0.04. Bucket A.
	 */
	glassThickness?: number;
	/**
	 * Refraction strength, 0–1. 0 = no distortion, 1 = heavy bending.
	 * Mapped internally to IOR 1.0–2.0. Default 0.4. Bucket A.
	 */
	glassRefraction?: number;
	/**
	 * Specular reflectivity (Fresnel F0), 0–1. Controls the intensity
	 * of specular highlights on the glass surface. 0 = matte,
	 * 1 = mirror. Default 0.12. Bucket A.
	 */
	glassReflectivity?: number;
	/**
	 * Chromatic aberration strength, 0–1. Splits refraction into
	 * separate R/G/B channels for a prismatic rainbow fringe.
	 * 0 = monochrome refraction, 1 = strong color separation.
	 * Default 0.15. Bucket A.
	 */
	glassChromatic?: number;
	/**
	 * Enable reveal mode. The fluid acts as an opacity mask: where dye
	 * exists the canvas becomes transparent, revealing content behind it.
	 * Where there is no dye, the canvas shows an opaque white cover.
	 * The display shader outputs inverted dye color `(1 - C)` which
	 * produces iridescent fringes at reveal edges. See ADR-0027/0028.
	 * Default false. Bucket B (keyword recompile).
	 */
	reveal?: boolean;
	/**
	 * Multiplier on dye intensity before the power curve. Higher values
	 * make areas reveal more easily (less dye needed). Default 0.1.
	 * Bucket A.
	 */
	revealSensitivity?: number;
	/**
	 * Power exponent for the reveal alpha curve. Higher values create a
	 * crisper edge (more binary reveal), lower values create a softer
	 * gradient with wider fringes. Default 0.5. Bucket A.
	 */
	revealCurve?: number;
	/**
	 * Solid color of the reveal cover layer (visible before scratching).
	 * RGB components in 0–1 linear range. Default `{ r: 1, g: 1, b: 1 }`
	 * (white). Bucket A.
	 */
	revealCoverColor?: RGB;
	/**
	 * Accent color shown in the fringe zone between the solid cover and
	 * the fully revealed content. Controls the colored gradient at reveal
	 * edges. RGB components in 0–1 linear range. Default
	 * `{ r: 0.05, g: 0.16, b: 0.32 }` (deep navy). Bucket A.
	 */
	revealAccentColor?: RGB;
	/**
	 * Fringe color at the outer edge of the reveal boundary, between
	 * the cover color and the accent color. Creates a two-tone fringe:
	 * cover → fringeColor → accentColor → transparent. RGB components
	 * in 0–1 linear range. Default `{ r: 0.6, g: 0.7, b: 0.85 }`
	 * (soft blue). Bucket A.
	 */
	revealFringeColor?: RGB;
	/**
	 * Enable distortion mode. The fluid velocity field warps an underlying
	 * image instead of rendering dye colors. Cursor movement creates
	 * velocity splats that ripple and distort the image like liquid glass.
	 * Mutually exclusive with `reveal`. Default false. Bucket B (keyword recompile).
	 */
	distortion?: boolean;
	/**
	 * How strongly the velocity field warps the image UV coordinates.
	 * 0 = no distortion, 1 = very strong. Default 0.4. Bucket A.
	 */
	distortionPower?: number;
	/**
	 * URL of the image to distort. The engine loads the image asynchronously
	 * and uploads it as a WebGL texture. Changing the URL at runtime triggers
	 * a new load + texture re-upload. Required when `distortion` is true.
	 */
	distortionImageUrl?: string;
	/**
	 * How the distortion image fits the canvas.
	 * - `'cover'`: image fills the canvas, cropping if needed (default)
	 * - `'contain'`: image fits within the canvas, may have empty borders
	 */
	distortionFit?: 'cover' | 'contain';
	/**
	 * Scale factor for the distortion image. Values > 1 zoom out (more
	 * image visible, less edge smearing during distortion). Values < 1
	 * zoom in. Default 1.0. Bucket A.
	 */
	distortionScale?: number;
	/**
	 * Horizontal bleed fraction (0–0.5). The canvas extends invisibly
	 * beyond the visible area by this fraction on each side, so the
	 * fluid velocity field doesn't bounce at the content edges.
	 * The image is mapped to the visible sub-region only.
	 * Typically computed by `FluidDistortion` from a pixel `bleed` prop.
	 * Default 0. Bucket A.
	 */
	distortionBleedX?: number;
	/**
	 * Vertical bleed fraction (0–0.5). See `distortionBleedX`.
	 * Default 0. Bucket A.
	 */
	distortionBleedY?: number;
	/**
	 * Open boundary conditions. When `true`, fluid flows freely
	 * instead of bouncing back at boundaries. Affects both the canvas
	 * edges (divergence solver skips no-penetration enforcement) and
	 * container shapes (shape becomes a visual crop rather than a
	 * physical wall — dye and velocity are not zeroed outside the shape).
	 *
	 * Default `false` (closed — fluid bounces at all boundaries).
	 * {@link FluidReveal} defaults to `true` for natural scratch behavior.
	 * Bucket A (hot-updatable).
	 */
	openBoundary?: boolean;
	/**
	 * Enable sticky mode. Dye clings to the `stickyMask` region by
	 * modulating advection dissipation (dye persists on the mask),
	 * pressure (fluid flows around the mask), and splat strength
	 * (more dye deposited on the mask). Composable with container
	 * shapes, bloom, sunrays, glass. Mutually exclusive with reveal
	 * and distortion. Default false. Triggers mask texture rebuild.
	 */
	sticky?: boolean;
	/**
	 * The mask shape that dye sticks to. Rasterized to a texture via
	 * OffscreenCanvas. Supports text, SVG paths, or both. Changing
	 * this at runtime triggers a texture rebuild. Required when
	 * `sticky` is true.
	 */
	stickyMask?: StickyMask;
	/**
	 * How strongly dye dissipation is reduced on the mask.
	 * 0 = no effect, 1 = dye never fades on mask (dissipation → 0).
	 * Default 0.9. Bucket A.
	 */
	stickyStrength?: number;
	/**
	 * Artificial pressure injected on the mask to push fluid around
	 * the shape. Creates a high-pressure zone that repels incoming
	 * velocity. 0 = no pressure effect. Default 0.15. Bucket A.
	 */
	stickyPressure?: number;
	/**
	 * Splat intensity multiplier on the mask region. 0 = no extra
	 * amplification, higher = more dye deposited on mask.
	 * Default 0.3. Bucket A.
	 */
	stickyAmplify?: number;
	/**
	 * Interior obstacles the fluid flows around. Each {@link Obstruction}
	 * marks a *blocked* region (the inverse of `containerShape`, which marks
	 * a *contained* region). They union into a single combined mask, so the
	 * allowed fluid region is `container × (1 − obstruction)`.
	 *
	 * Orthogonal to `containerShape` — works with any container (or none,
	 * e.g. a full-rect maze). Changing this at runtime rebuilds the combined
	 * obstruction mask texture. Default `undefined` (no obstructions).
	 * See ADR-0034.
	 */
	obstructions?: ReadonlyArray<Obstruction>;
	/**
	 * Fill color painted over obstruction footprints in the display pass,
	 * in **0–255 RGB** (CSS-style, same convention as `backColor`). Makes
	 * solid bodies read as visible objects instead of `backColor`-colored
	 * silhouettes — e.g. a cylinder in a vortex-street scene. Uses the
	 * anti-aliased obstruction mask, so edges stay smooth. `null` (default)
	 * keeps the legacy silhouette behavior. Bucket B (keyword recompile).
	 * See ADR-0039.
	 */
	obstructionColor?: RGB | null;
	/**
	 * Additive v1 flow-scene controls for physically-plausible presets:
	 * persistent sources, edge-drain outlets, scalar fields, forces, prescribed fields,
	 * and field-aware visualization. `undefined` preserves legacy behavior.
	 */
	flow?: FlowConfig | null;
}

export type PerformanceTier = 'none' | 'pressure' | 'substeps';
export type PerformanceAction = 'none' | 'shed-pressure' | 'shed-substeps';

export interface PerformanceState {
	readonly enabled: boolean;
	readonly tier: PerformanceTier;
	readonly emaMs: number;
	readonly msSinceLastChange: number;
	readonly targetFrameMs: number;
	readonly pressureIterations: number;
	readonly substeps: number;
	readonly minPressureIterations: number;
	readonly minSubsteps: number;
	readonly lastAction: PerformanceAction;
}

/**
 * Imperative API exposed to parents via `bind:this`. Mirror of the
 * engine's public methods that make sense to call from outside.
 */
export interface FluidHandle {
	/**
	 * Inject a splat at the given normalized coordinates with optional
	 * velocity and color. Identical semantics to {@link PresetSplat}.
	 *
	 * @param x  X position in normalized coords (0 = left, 1 = right)
	 * @param y  Y position in normalized coords (0 = bottom, 1 = top)
	 * @param dx X velocity (raw value, **not** scaled by `splatForce`)
	 * @param dy Y velocity (raw value, **not** scaled by `splatForce`)
	 * @param color RGB triple in 0–1 linear range; HDR (>1) is valid
	 *
	 * Calls with any non-finite argument are ignored (one console warning).
	 */
	splat(x: number, y: number, dx: number, dy: number, color: RGB): void;
	/**
	 * Queue N additional random splats. The backlog holds at most 64 and at
	 * most 16 run per frame; non-finite or negative counts are ignored.
	 */
	randomSplats(count: number): void;
	/**
	 * Stop the animation loop. The WebGL context stays alive but no frames
	 * are requested. Call {@link resume} to restart. Idempotent.
	 */
	pause(): void;
	/**
	 * Restart the animation loop after a {@link pause}. Idempotent —
	 * calling resume on an already-running engine is a no-op.
	 */
	resume(): void;
	/** Whether the engine's animation loop is currently paused. */
	readonly isPaused: boolean;
	/**
	 * Current frame-time governor state. Pull-based by design: no events are
	 * emitted, so applications can read this when rendering diagnostics.
	 */
	getPerformanceState(): PerformanceState;
}

// ---------------------------------------------------------------------------
// Component props (moved from the .svelte module scripts; re-exported there).
// ---------------------------------------------------------------------------

/** Public props for the `<Fluid />` component. */
export interface FluidProps
	extends Omit<HTMLCanvasAttributes, 'width' | 'height'>,
		FluidConfig {
	/** Optional fixed width in CSS pixels. Omit to fill the parent container. */
	width?: number;
	/** Optional fixed height in CSS pixels. Omit to fill the parent container. */
	height?: number;
	/** Class applied to the wrapper container. */
	class?: string;
	/** Inline style applied to the wrapper container. */
	style?: string;
	/**
	 * Maximum physical pixels per CSS pixel. Default `null`: the device's
	 * native DPR, so edges stay crisp on DPR 3 displays. Pass `2` to cap
	 * physical pixels (and canvas-sized GPU work) on DPR 3+ screens. CSS-based
	 * quality tiers are unchanged either way. Construct-only.
	 */
	maxPixelRatio?: number | null;
	/**
	 * Defer engine creation until the container enters the viewport,
	 * and tear it down when it leaves. Frees the WebGL context for
	 * other instances on dense pages, at the cost of a shader-recompile
	 * pause when scrolled back into view. Default `false` (immediate
	 * instantiation) so the library default matches naive usage.
	 *
	 * Recommended `true` for any page with more than ~6 simultaneous
	 * `<Fluid />` instances. Browsers cap WebGL contexts at 8–16 per
	 * tab, so dense layouts hit the ceiling otherwise.
	 *
	 * The IntersectionObserver uses `rootMargin: 50px` so the engine
	 * comes alive shortly before it would be visible, hiding the
	 * recompile pause behind the user's scroll momentum while
	 * minimizing simultaneous context creation.
	 */
	lazy?: boolean;
	/**
	 * Automatically pause the animation loop when the canvas is not
	 * visible — either scrolled out of the viewport or on a hidden
	 * browser tab. Resumes when visibility is restored. Default `true`.
	 *
	 * This is lighter than `lazy`: the WebGL context stays alive (no
	 * recompile pause on resume) but the RAF loop stops, freeing CPU
	 * and GPU cycles. When both `lazy` and `autoPause` are set, `lazy`
	 * takes precedence for scroll visibility (full teardown), while
	 * `autoPause` still handles tab-level visibility (Page Visibility API).
	 */
	autoPause?: boolean;
	/**
	 * Custom UI rendered when WebGL is permanently unavailable (no WebGL,
	 * or no half-float texture support). Receives the typed failure
	 * `reason`. Takes precedence over {@link poster}. Transient failures
	 * (e.g. hitting the browser's live-context limit) do NOT trigger it —
	 * those stay blank and retry on the next reconcile — EXCEPT in `reveal`
	 * mode, where any failure (including transient) surfaces the fallback,
	 * because the transparent reveal canvas would otherwise expose the
	 * covered content. See ADR-0041. A frame that throws at runtime evicts the
	 * engine and surfaces this fallback with reason `render-failed` (and one
	 * `onError` call); it is not retried. See ADR-0085.
	 */
	fallback?: Snippet<[{ reason: WebGLUnavailableReason }]>;
	/**
	 * Static image shown (object-fit: cover) when WebGL is permanently
	 * unavailable and no {@link fallback} snippet is provided. A graceful
	 * still of what the animation would have rendered.
	 */
	poster?: string;
	/**
	 * Alt text for the {@link poster} image. Defaults to `''` (decorative) —
	 * the poster is a graceful still of a decorative visual, so it is not
	 * announced unless you describe it. Set this when the poster conveys
	 * meaning a screen-reader user needs.
	 */
	posterAlt?: string;
	/**
	 * Visually-hidden message for the default fallback, discoverable (not
	 * announced) by assistive tech when WebGL is permanently unavailable. It
	 * is rendered for the `backColor`-fill fallback AND alongside a
	 * {@link poster} (since the dead canvas is `aria-hidden`), but NOT for a
	 * custom {@link fallback} snippet (which owns its own semantics). Set `''`
	 * to suppress for a purely decorative instance. Default: "This animation
	 * requires WebGL, which isn't available in your browser."
	 */
	fallbackText?: string;
	/**
	 * Called after the engine is constructed and its first frame is
	 * scheduled. Fires again whenever a `lazy` instance rebuilds its engine.
	 * A throwing callback is caught and logged.
	 */
	onReady?: () => void;
	/**
	 * Called when engine construction fails — a {@link WebGLUnavailableError}
	 * (check `.reason`) or any other initialization error such as a shader
	 * compile failure. Also fires for transient failures that the component
	 * retries. A throwing callback is caught and logged.
	 */
	onError?: (error: Error) => void;
}

export interface FluidBackgroundProps
	extends FluidConfig,
		Pick<FluidProps, 'fallback' | 'poster' | 'posterAlt' | 'fallbackText' | 'onReady' | 'onError'> {
	/** Maximum physical pixels per CSS pixel. Default null (native DPR); pass 2 to cap. */
	maxPixelRatio?: number | null;
	/**
	 * CSS selector for elements within the content slot to exclude
	 * from the fluid. Matched elements become "holes" — the fluid
	 * pools around them. Queried on scroll, resize, and DOM mutation.
	 * Example: `".card, .sidebar"`
	 */
	exclude?: string;
	/** Border radius of exclusion zones in CSS px. Default 16. */
	excludeRadius?: number;
	/** Padding around exclusion zones in CSS px. Default 4. */
	excludePad?: number;
	/** Class applied to the outer wrapper div. */
	class?: string;
	/** Inline style applied to the outer wrapper div. */
	style?: string;
	/** Page content rendered above the fluid canvas. */
	children?: Snippet;
}

export interface FluidDistortionProps
	extends FluidConfig,
		Pick<FluidProps, 'fallback' | 'poster' | 'posterAlt' | 'fallbackText' | 'onReady' | 'onError'> {
	/** Maximum physical pixels per CSS pixel. Default null (native DPR); pass 2 to cap. */
	maxPixelRatio?: number | null;
	/**
	 * URL of the image to distort. Required.
	 * The image is loaded asynchronously and uploaded as a WebGL texture.
	 */
	src: string;
	/**
	 * How strongly the velocity field warps the image UV coordinates.
	 * 0 = no distortion, 1 = very strong. Default 0.4.
	 */
	strength?: number;
	/**
	 * How much distortion dye each pointer interaction injects.
	 * Higher values create more dramatic warping per gesture.
	 * Default 24.
	 */
	intensity?: number;
	/**
	 * How the image fits the canvas.
	 * - `'cover'`: image fills the canvas, cropping if needed (default)
	 * - `'contain'`: full image visible, may have empty borders
	 */
	fit?: 'cover' | 'contain';
	/**
	 * Scale factor for the image. Values > 1 zoom out (more image
	 * visible, less edge smearing during distortion). Values < 1
	 * zoom in. Default 1.0.
	 */
	scale?: number;
	/**
	 * Enable automatic Lissajous curve animation before user interaction.
	 * Creates a gentle, continuous distortion effect. Stops on the first
	 * pointer/touch event. Default false.
	 */
	autoDistort?: boolean;
	/**
	 * Speed multiplier for the auto-distort animation. Higher values
	 * make the Lissajous curve trace faster. Default 1.0.
	 */
	autoDistortSpeed?: number;
	/**
	 * Number of random high-velocity splats injected at startup.
	 * Creates a chaotic distortion that settles into the undistorted
	 * image over ~1 second. Set to 0 to start undistorted.
	 * Default 20.
	 */
	initialSplats?: number;
	/**
	 * Extra canvas pixels beyond each visible edge. The canvas
	 * extends invisibly by this amount so the fluid velocity field
	 * doesn't bounce at the content boundaries. The image is mapped
	 * to the visible sub-region only — no extra cropping.
	 * Default 60.
	 */
	bleed?: number;
	/** Optional fixed width in CSS pixels. Omit to fill the parent container. */
	width?: number;
	/** Optional fixed height in CSS pixels. Omit to fill the parent container. */
	height?: number;
	/**
	 * Defer engine creation until the container enters the viewport.
	 * Recommended on pages with many instances. Default false.
	 */
	lazy?: boolean;
	/**
	 * Automatically pause when not visible. Default true.
	 */
	autoPause?: boolean;
	/** Class applied to the outer wrapper div. */
	class?: string;
	/** Inline style applied to the outer wrapper div. */
	style?: string;
	/**
	 * Content rendered behind the distorted image. Visible where the
	 * image has transparent regions or at edges when using `contain` fit.
	 *
	 * **Note:** The canvas sits on top of the content. Interactive elements
	 * (links, buttons) inside children will not receive pointer events
	 * because the canvas layer intercepts them.
	 */
	children?: Snippet;
}

export interface FluidRevealProps
	extends FluidConfig,
		Pick<FluidProps, 'fallback' | 'poster' | 'posterAlt' | 'fallbackText' | 'onReady' | 'onError'> {
	/** Maximum physical pixels per CSS pixel. Default null (native DPR); pass 2 to cap. */
	maxPixelRatio?: number | null;
	/**
	 * How easily areas reveal. Multiplier on dye intensity before
	 * the power curve. Higher = less dye needed. Default 0.1.
	 */
	sensitivity?: number;
	/**
	 * Power exponent for the reveal alpha curve. Higher values create
	 * a crisper edge (more binary), lower values create a softer
	 * gradient with wider fringes. Default 0.5.
	 */
	curve?: number;
	/**
	 * Solid color of the reveal cover layer (visible before scratching).
	 * RGB components in 0–1 linear range. Default white `{ r: 1, g: 1, b: 1 }`.
	 */
	coverColor?: RGB;
	/**
	 * Accent color of the reveal fringe (visible at scratch edges).
	 * RGB components in 0–1 linear range. Default blue `{ r: 0.2, g: 0.35, b: 0.7 }`.
	 */
	accentColor?: RGB;
	/**
	 * Fringe color at the outer edge of the reveal boundary, between
	 * cover and accent. Creates a two-tone fringe. RGB components in
	 * 0–1 linear range. Default soft blue `{ r: 0.6, g: 0.7, b: 0.85 }`.
	 */
	fringeColor?: RGB;
	/**
	 * Whether revealed areas gradually fade back to covered.
	 * `true` → multiplicative dissipation 0.995 (slow fade-back).
	 * `false` → multiplicative dissipation 1.0 (permanent reveal).
	 * Overridden by `fadeSpeed` if both are provided.
	 * Default `true`.
	 */
	fadeBack?: boolean;
	/**
	 * Explicit density dissipation value (multiplicative).
	 * 1.0 = permanent reveal, 0.99 = slow fade-back, 0.9 = fast fade.
	 * Takes precedence over `fadeBack` when provided.
	 */
	fadeSpeed?: number;
	/**
	 * Enable automatic Lissajous curve animation before user interaction.
	 * The animation injects dye along a smooth path, gradually revealing
	 * content. Stops on the first pointer/touch event. Default `false`.
	 */
	autoReveal?: boolean;
	/**
	 * Speed multiplier for the auto-reveal animation. Higher values
	 * make the Lissajous curve trace faster. Default `1.0`.
	 */
	autoRevealSpeed?: number;
	/** Optional fixed width in CSS pixels. Omit to fill the parent container. */
	width?: number;
	/** Optional fixed height in CSS pixels. Omit to fill the parent container. */
	height?: number;
	/**
	 * Defer engine creation until the container enters the viewport.
	 * Recommended on pages with many instances. Default `false`.
	 */
	lazy?: boolean;
	/**
	 * Automatically pause when not visible. Default `true`.
	 */
	autoPause?: boolean;
	/** Class applied to the outer wrapper div. */
	class?: string;
	/** Inline style applied to the outer wrapper div. */
	style?: string;
	/**
	 * Content rendered behind the fluid mask, revealed by interaction.
	 *
	 * **Note:** The canvas sits on top of the content for alpha compositing.
	 * Interactive elements (links, buttons) inside children will not receive
	 * pointer events because the canvas layer intercepts them. Use FluidReveal
	 * for visual/decorative content. For interactive content, set
	 * `pointerInput={false}` and drive splats manually via `handle.splat()`.
	 */
	children?: Snippet;
}

export interface FluidStickProps
	extends FluidConfig,
		Pick<FluidProps, 'fallback' | 'poster' | 'posterAlt' | 'fallbackText' | 'onReady' | 'onError'> {
	/** Maximum physical pixels per CSS pixel. Default null (native DPR); pass 2 to cap. */
	maxPixelRatio?: number | null;
	/** Text to render as the sticky mask. `d` takes precedence if both are set. */
	text?: string;
	/** CSS font string for text mode. Default `'bold 72px sans-serif'`. */
	font?: string;
	/** SVG path data for the sticky mask. */
	d?: string;
	/** viewBox for path mode. Default `[0, 0, 100, 100]`. */
	maskViewBox?: [number, number, number, number];
	/** Fill rule for path mode. Default `'nonzero'`. */
	maskFillRule?: 'nonzero' | 'evenodd';
	/** Mask rasterization resolution. Default 512. */
	maskResolution?: number;
	/** Blur radius on the mask (mask pixels). Default 4. */
	maskBlur?: number;
	/**
	 * How much of the mask texture the text fills (text mode only).
	 * 0.9 = text fills 90% of the texture (default). Use smaller
	 * values when combining with a container shape (e.g. 0.5 to fit
	 * text inside a circle). Default 0.9.
	 */
	maskPadding?: number;
	/**
	 * How strongly dye dissipation is reduced on the mask.
	 * 0 = no effect, 1 = dye never fades on mask. Default 0.95.
	 */
	strength?: number;
	/**
	 * Artificial pressure on the mask to push fluid around it.
	 * 0 = no effect. Default 0.15.
	 */
	stickyPressureAmount?: number;
	/**
	 * Splat intensity multiplier on the mask. Default 2.0.
	 */
	amplify?: number;
	/**
	 * Enable automatic Lissajous curve animation. Splats trace
	 * a path to deposit dye on the mask before user interaction.
	 * Default `true`.
	 */
	autoAnimate?: boolean;
	/** Speed multiplier for auto-animation. Default 2.0. */
	autoAnimateSpeed?: number;
	/**
	 * How many seconds auto-animation runs before stopping.
	 * Once stopped, off-mask dye fades away, revealing the sticky shape.
	 * 0 = run indefinitely (until user interacts). Default 5.0.
	 */
	autoAnimateDuration?: number;
	/** Optional fixed width in CSS pixels. */
	width?: number;
	/** Optional fixed height in CSS pixels. */
	height?: number;
	/** Defer engine creation until visible. Default false. */
	lazy?: boolean;
	/** Auto-pause when not visible. Default true. */
	autoPause?: boolean;
	/** Class applied to the outer wrapper. */
	class?: string;
	/** Inline style applied to the outer wrapper. */
	style?: string;
}

export interface FluidTextProps
	extends FluidConfig,
		Pick<FluidProps, 'fallback' | 'poster' | 'posterAlt' | 'fallbackText' | 'onReady' | 'onError'> {
	/** Maximum physical pixels per CSS pixel. Default null (native DPR); pass 2 to cap. */
	maxPixelRatio?: number | null;
	/** The text to render as fluid-filled letterforms. */
	text: string;
	/**
	 * CSS font string for the mask rasterization.
	 * Default `'bold 100px "Helvetica Neue", Arial, sans-serif'`.
	 */
	font?: string;
	/** Mask rasterization resolution. Default 512. */
	maskResolution?: number;
	/** Optional fixed height in CSS pixels. */
	height?: number;
	/** Defer engine creation until visible. Default false. */
	lazy?: boolean;
	/** Auto-pause when not visible. Default true. */
	autoPause?: boolean;
	/** Class applied to the outer wrapper. */
	class?: string;
	/** Inline style applied to the outer wrapper. */
	style?: string;
}

/* ---------------------------------------------------------------------------
 * InkPaper (ADR-0090): pigment on paper.
 * ------------------------------------------------------------------------- */

/** Brush for {@link InkPaperProps.brush}. Omitted fields keep their current value. */
export interface InkBrush {
	/** Brush radius in CSS px at full pressure. Default 23; clamped to 2–120. */
	size?: number;
	/** Water per dab relative to the default load. Default 1; clamped to 0.1–3. */
	water?: number;
	/**
	 * Index into `pigments` for every stroke, or `null` (default) to pick up the
	 * next pigment after each pause.
	 */
	pigment?: number | null;
}

export interface InkPaperProps extends Omit<import('svelte/elements').HTMLAttributes<HTMLDivElement>, 'children'> {
	/**
	 * Paper colour, any CSS colour (normalised to opaque sRGB over white). Also
	 * the fallback background. Default `#f4ecdc`.
	 */
	paper?: string;
	/** Up to four pigment colours (`#rgb`/`#rrggbb`), mixed subtractively. */
	pigments?: string[];
	brush?: InkBrush;
	/** Seeds the paper grain and the opening wash. Default 1. */
	seed?: number;
	/**
	 * Content above the paper. Descendants marked `data-ink-resist` stay dry
	 * (pigment meets their border-radius outline); focusing or hovering a
	 * `data-ink-wick` descendant blooms pigment around it (an integer
	 * value picks the pigment).
	 */
	children?: Snippet;
}

/* ------------------------------------------------------------------------ */
/*              Liquid controls (height-field surface, ADR-0091)            */
/* ------------------------------------------------------------------------ */

/** `'auto'` follows the page colour behind the control. */
export type LiquidTone = 'light' | 'dark' | 'auto';

/** A real `<button>`; every native attribute is forwarded. `type` defaults to `'button'`. */
export interface LiquidButtonProps extends HTMLButtonAttributes {
	/** Palette. Default `'auto'`. */
	tone?: LiquidTone;
	/** Label content, drawn by the DOM above the liquid. */
	children?: Snippet;
}

export interface LiquidSegmentedOption {
	value: string;
	label: string;
}

/** `<fieldset>` of native radios; the selected option carries a liquid lens. */
export interface LiquidSegmentedProps {
	options: LiquidSegmentedOption[];
	/** Selected value (`bind:value`). */
	value?: string;
	/** Radio group name; unique on the page. */
	name: string;
	/** Visible group label (`<legend>`). */
	legend: string;
	/** Palette. Default `'auto'`. */
	tone?: LiquidTone;
	disabled?: boolean;
	/** Class applied to the `<fieldset>`. */
	class?: string;
}

/* ------------------------------------------------------------------------ */
/*           Liquid drop zone and caustics (height-field surface, ADR-0094)  */
/* ------------------------------------------------------------------------ */

/**
 * A `<label>` around a visually hidden native `<input type="file">`: keyboard,
 * touch and pen use the browser's picker. Other attributes go to the `<label>`.
 */
export interface LiquidDropZoneProps extends Omit<import('svelte/elements').HTMLLabelAttributes, 'children'> {
	/** Native `accept` list; dropped files are filtered by it too. */
	accept?: string;
	/** Allow more than one file. Default `false` (a drop keeps the first match). */
	multiple?: boolean;
	/** Visible text; `children` replaces it. */
	label?: string;
	children?: Snippet;
	/** Picked or dropped files (never empty). Exceptions are caught and logged. */
	onfiles?: (files: File[]) => void;
	/** Polite live-region text for a result. Default `'2 files selected'`. */
	announce?: (files: File[]) => string;
	/** Palette. Default `'auto'`. */
	tone?: LiquidTone;
	disabled?: boolean;
	/** Native input `name`, for form submission. */
	name?: string;
}

/* ------------------------------------------------------------------------ */
/*                      Foil switch (snap foil, ADR-0096)                    */
/* ------------------------------------------------------------------------ */

/**
 * A native `<button type="button" role="switch">` whose state is drawn as a
 * bistable metal arch (arched = off, bowed = on). The label is `children`;
 * other button attributes are forwarded.
 */
export interface FoilSwitchProps extends Omit<HTMLButtonAttributes, 'type' | 'role' | 'aria-checked' | 'onchange' | 'children'> {
	/** On/off (`bind:checked`). Default `false`. */
	checked?: boolean;
	/** Palette for the focus ring and vector fallback. Default `'auto'`. */
	tone?: LiquidTone;
	disabled?: boolean;
	/** Called with the new state after a user toggle. Exceptions are caught and logged. */
	onchange?: (checked: boolean) => void;
	/** Visible label, part of the switch's accessible name. */
	children?: Snippet;
}

/** Caustic light (dark tone) or a soft caustic shading net (light tone) over live content. */
export interface LiquidCausticsProps extends Omit<import('svelte/elements').HTMLAttributes<HTMLDivElement>, 'children'> {
	/** Palette. Default `'auto'` (from the page colour behind the block). */
	tone?: LiquidTone;
	/**
	 * Strength 0–1. Default 0.75. Always clamped so body text (the block's
	 * `color`) keeps ≥ 4.5:1 against its measured background.
	 */
	intensity?: number;
	children?: Snippet;
}

// ---- Preset component props (re-exported by each preset .svelte module) ----

/** Props consumed by `<FrameFluid />`. */
export type FrameFluidProps = Pick<
	FluidProps,
	'width' | 'height' | 'maxPixelRatio' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
> & { innerCornerRadius?: number; outerCornerRadius?: number };

/** Props consumed by `<GasFlare />`. Sizing/seed/styling are forwarded; flare geometry and plume behavior are pinned. */
export type GasFlareProps = Pick<
	FluidProps,
	| 'width'
	| 'height'
	| 'maxPixelRatio'
	| 'class'
	| 'style'
	| 'seed'
	| 'lazy'
	| 'pointerInput'
	| 'splatOnHover'
	| 'aria-label'
	| 'backColor'
>;

/** Props consumed by `<LavaLamp />`. Sizing/seed/styling are forwarded; all other physics props are hard-coded. */
export type LavaLampProps = Pick<
	FluidProps,
	'width' | 'height' | 'maxPixelRatio' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
>;

/** Props consumed by `<InkInWater />`. */
export type InkInWaterProps = Pick<
	FluidProps,
	'width' | 'height' | 'maxPixelRatio' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
>;

/** Props consumed by `<Venturi />`. Sizing/seed/styling are forwarded; all physics props are pinned. */
export type VenturiProps = Pick<
	FluidProps,
	| 'width'
	| 'height'
	| 'maxPixelRatio'
	| 'class'
	| 'style'
	| 'seed'
	| 'lazy'
	| 'pointerInput'
	| 'splatOnHover'
	| 'aria-label'
	| 'backColor'
>;

/** Props consumed by `<Toroidal />`. Sizing/seed/styling are forwarded; all other physics props are hard-coded. */
export type ToroidalProps = Pick<
	FluidProps,
	'width' | 'height' | 'maxPixelRatio' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
>;

/** Props consumed by `<Plasma />`. Sizing/seed/styling are forwarded, and `backColor` may be overridden so the preset adapts to its host page; all other physics props are hard-coded. */
export type PlasmaProps = Pick<
	FluidProps,
	'width' | 'height' | 'maxPixelRatio' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
>;

/** Props consumed by `<Aurora />`. */
export type AuroraProps = Pick<
	FluidProps,
	'width' | 'height' | 'maxPixelRatio' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
>;

/** Props consumed by `<TeslaValve />`. Sizing/seed/styling are forwarded; valve geometry and flow settings are pinned. */
export type TeslaValveProps = Pick<
	FluidProps,
	| 'width'
	| 'height'
	| 'maxPixelRatio'
	| 'class'
	| 'style'
	| 'seed'
	| 'lazy'
	| 'pointerInput'
	| 'splatOnHover'
	| 'aria-label'
	| 'backColor'
>;

/** Props consumed by `<CircularFluid />`. */
export type CircularFluidProps = Pick<
	FluidProps,
	'width' | 'height' | 'maxPixelRatio' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
>;

/** Props consumed by `<FrozenSwirl />`. */
export type FrozenSwirlProps = Pick<
	FluidProps,
	'width' | 'height' | 'maxPixelRatio' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
>;

/** Props consumed by `<SvgPathFluid />`. */
export type SvgPathFluidProps = Pick<
	FluidProps,
	'width' | 'height' | 'maxPixelRatio' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
>;

/** Props consumed by `<AnnularFluid />`. */
export type AnnularFluidProps = Pick<
	FluidProps,
	'width' | 'height' | 'maxPixelRatio' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
>;

/** Props consumed by `<Karman />`. Sizing/seed/styling are forwarded; all physics is pinned. */
export type KarmanProps = Pick<
	FluidProps,
	| 'width'
	| 'height'
	| 'maxPixelRatio'
	| 'class'
	| 'style'
	| 'seed'
	| 'lazy'
	| 'pointerInput'
	| 'splatOnHover'
	| 'aria-label'
	| 'backColor'
>;

/* ------------------------------------------------------------------------ */
/*                 Enamel text (compliant enamel, ADR-0097)                  */
/* ------------------------------------------------------------------------ */

/**
 * A native `<span>` whose text is shaded as soft, molded enamel; a press
 * dents it and it relaxes. Put it inside your heading: the heading supplies
 * the role. Other attributes go to the `<span>`.
 */
export interface EnamelTextProps extends Omit<import('svelte/elements').HTMLAttributes<HTMLSpanElement>, 'children' | 'color'> {
	/** Display text: short, plain (one line or a few wrapped lines). */
	text: string;
	/** Studio lighting. Default `'auto'` (follows the page colour). */
	tone?: LiquidTone;
	/** Enamel body colour, any CSS colour. Default: the inherited text colour. */
	color?: string;
}

