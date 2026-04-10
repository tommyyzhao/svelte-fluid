/*
 * svelte-fluid — types module
 * Derivative work of WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017, MIT.
 * https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
 */

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
export interface RGB {
	r: number;
	g: number;
	b: number;
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
 * Describes the shape of a fluid container. The simulation physically
 * confines fluid within the shape — velocity has zero normal component
 * at the wall and dye cannot escape — rather than merely clipping the
 * rendered output.
 *
 * Coordinates follow the same convention as splat positions:
 * `cx`/`cy` ∈ [0, 1] (left→right, bottom→top). `radius` is normalised
 * by canvas height: `radius: 0.45` gives a physical radius of 45% of
 * the canvas height, which fits comfortably inside landscape canvases.
 *
 * Additional variants can be added to this union in future ADRs without
 * changing any physics shader — only `applyMaskShader` needs updating.
 */
export type ContainerShape =
	| { type: 'circle'; cx: number; cy: number; radius: number };

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
	 * "burns in" the initial energy before locking to zero.
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
	/** Pressure solver weight. Default 0.8. */
	pressure?: number;
	/** Pressure solver iterations. Default 20. */
	pressureIterations?: number;
	/** Vorticity confinement strength. Default 30. */
	curl?: number;
	/** Splat radius (NDC units). Default 0.25. */
	splatRadius?: number;
	/** Splat impulse force. Default 6000. */
	splatForce?: number;
	/** 3D-style shading. Default true. */
	shading?: boolean;
	/** Cycle pointer color over time. Default true. */
	colorful?: boolean;
	/** Color rotation rate (1/seconds). Default 10. */
	colorUpdateSpeed?: number;
	/** Pause the simulation step (rendering still occurs). Default false. */
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
	/** Enable mouse / touch input. Default true. */
	pointerInput?: boolean;
	/**
	 * 32-bit unsigned integer seed for the deterministic PRNG. If omitted,
	 * the Svelte component generates one once per mount and reuses it
	 * across resizes so the same initial splat pattern reappears.
	 */
	seed?: number;
	/**
	 * Hand-crafted initial splats applied immediately after the random
	 * initial splats. Construct-only — `setConfig` ignores this field.
	 * Intended for preset wrapper components that paint a deterministic
	 * opening scene; combine with `initialSplatCount: 0` to suppress the
	 * random splats entirely. See {@link PresetSplat}.
	 */
	presetSplats?: ReadonlyArray<PresetSplat>;
	/**
	 * Continuous random splat generation. Splats per second; 0 = disabled.
	 * Default 0. Bucket A (hot-updatable).
	 */
	randomSplatRate?: number;
	/** Number of splats per continuous burst. Default 1. Bucket A. */
	randomSplatCount?: number;
	/**
	 * Fixed color for continuous splats. Null = random via generateColor().
	 * Components are in 0–1 linear range; the engine applies a 10× HDR
	 * multiplier before injecting. Default null. Bucket A.
	 */
	randomSplatColor?: RGB | null;
	/** X velocity for continuous splats (raw, NOT scaled by splatForce). Default 0. Bucket A. */
	randomSplatDx?: number;
	/** Y velocity for continuous splats (raw, NOT scaled by splatForce). Negative = downward in DOM. Default 0. Bucket A. */
	randomSplatDy?: number;
	/**
	 * Vertical spawn center for continuous splats, in 0–1 (bottom-to-top).
	 * Default 0.5. The engine adds ±0.05 jitter around this value.
	 * Bucket A.
	 */
	randomSplatSpawnY?: number;
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
}

/**
 * Internal, fully resolved configuration. Uses the original SCREAMING_CASE
 * field names so the porting from script.js stays mechanical and obvious.
 */
export interface ResolvedConfig {
	SIM_RESOLUTION: number;
	DYE_RESOLUTION: number;
	DENSITY_DISSIPATION: number;
	INITIAL_DENSITY_DISSIPATION: number;
	INITIAL_DENSITY_DISSIPATION_DURATION: number;
	VELOCITY_DISSIPATION: number;
	PRESSURE: number;
	PRESSURE_ITERATIONS: number;
	CURL: number;
	SPLAT_RADIUS: number;
	SPLAT_FORCE: number;
	SHADING: boolean;
	COLORFUL: boolean;
	COLOR_UPDATE_SPEED: number;
	PAUSED: boolean;
	BACK_COLOR: RGB;
	TRANSPARENT: boolean;
	BLOOM: boolean;
	BLOOM_ITERATIONS: number;
	BLOOM_RESOLUTION: number;
	BLOOM_INTENSITY: number;
	BLOOM_THRESHOLD: number;
	BLOOM_SOFT_KNEE: number;
	SUNRAYS: boolean;
	SUNRAYS_RESOLUTION: number;
	SUNRAYS_WEIGHT: number;
	INITIAL_SPLAT_MIN: number;
	INITIAL_SPLAT_MAX: number;
	POINTER_INPUT: boolean;
	SEED: number;
	RANDOM_SPLAT_RATE: number;
	RANDOM_SPLAT_COUNT: number;
	RANDOM_SPLAT_COLOR: RGB | null;
	RANDOM_SPLAT_DX: number;
	RANDOM_SPLAT_DY: number;
	RANDOM_SPLAT_SPAWN_Y: number;
	CONTAINER_SHAPE: ContainerShape | null;
}

/** Pixel format pair returned by `getSupportedFormat`. */
export interface SupportedFormat {
	internalFormat: number;
	format: number;
}

/** WebGL extension / capability info gathered at context creation. */
export interface ExtInfo {
	formatRGBA: SupportedFormat;
	formatRG: SupportedFormat;
	formatR: SupportedFormat;
	halfFloatTexType: number;
	supportLinearFiltering: boolean;
	isWebGL2: boolean;
}

/** A single framebuffer object plus the texture it owns. */
export interface FBO {
	texture: WebGLTexture;
	fbo: WebGLFramebuffer;
	width: number;
	height: number;
	texelSizeX: number;
	texelSizeY: number;
	attach(id: number): number;
}

/** Read/write FBO pair used for ping-pong shader passes. */
export interface DoubleFBO {
	width: number;
	height: number;
	texelSizeX: number;
	texelSizeY: number;
	read: FBO;
	write: FBO;
	swap(): void;
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
	 */
	splat(x: number, y: number, dx: number, dy: number, color: RGB): void;
	/** Push N additional random splats onto the splat queue. */
	randomSplats(count: number): void;
}
