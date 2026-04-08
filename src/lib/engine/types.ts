/*
 * svelte-fluid — types module
 * Derivative work of WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017, MIT.
 * https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
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
 * dx/dy are pixel velocities, multiplied internally by SPLAT_FORCE.
 * Color components are in 0–1 range; values above 1 are valid and
 * useful for HDR-style bloom highlights.
 */
export interface PresetSplat {
	x: number;
	y: number;
	dx: number;
	dy: number;
	color: RGB;
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
	/** Background color (0–1 RGB). Default { r: 0, g: 0, b: 0 }. */
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
	 * velocity and color.
	 *
	 * @param x  X position in normalized coords (0 = left, 1 = right)
	 * @param y  Y position in normalized coords (0 = bottom, 1 = top)
	 * @param dx X velocity in pixels/frame (will be multiplied by SPLAT_FORCE)
	 * @param dy Y velocity in pixels/frame
	 * @param color RGB triple in 0–1 range
	 */
	splat(x: number, y: number, dx: number, dy: number, color: RGB): void;
	/** Push N additional random splats onto the splat queue. */
	randomSplats(count: number): void;
}
