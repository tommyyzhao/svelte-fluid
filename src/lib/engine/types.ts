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
	| { type: 'frame'; cx: number; cy: number; halfW: number; halfH: number; innerCornerRadius?: number; outerHalfW?: number; outerHalfH?: number; outerCornerRadius?: number }
	| { type: 'roundedRect'; cx: number; cy: number; halfW: number; halfH: number; cornerRadius: number }
	| { type: 'annulus'; cx: number; cy: number; innerRadius: number; outerRadius: number }
	| { type: 'svgPath'; d?: string; text?: string; font?: string; viewBox?: [number, number, number, number]; fillRule?: 'nonzero' | 'evenodd'; maskResolution?: number };

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
	 * Where to attach pointer event listeners.
	 * - `'canvas'` (default): listens on the canvas element only.
	 * - `'window'`: listens on `window`, so pointer activity anywhere
	 *   on the page drives the simulation. Useful for background fluid
	 *   where the canvas is behind other content.
	 *
	 * When `'window'`, touch listeners are registered as passive
	 * (scrolling is not blocked). Bucket A (hot-updatable).
	 */
	pointerTarget?: 'canvas' | 'window';
	/**
	 * When true, moving the mouse over the canvas creates splats without
	 * requiring a click. The splat velocity follows the cursor movement.
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
	 * When true, distribute continuous splats evenly across the horizontal
	 * axis instead of placing them at random x positions. The `randomSplatCount`
	 * splats are spaced at `(i + 0.5) / count` for i in 0..count-1.
	 * Default false. Bucket A.
	 */
	randomSplatEvenSpacing?: boolean;
	/**
	 * When non-zero, random splats receive tangential velocity relative to
	 * the container center (or canvas center if no container shape).
	 * Positive = counter-clockwise, negative = clockwise.
	 * The magnitude controls speed. Default 0. Bucket A.
	 */
	randomSplatSwirl?: number;
	/**
	 * Vertical spread of continuous splat spawning. The y-coordinate is
	 * `spawnY + (random - 0.5) * spread`, clamped to [0, 1].
	 * Default 0.1 (±0.05 jitter). Set to 2.0 for full-canvas coverage
	 * (useful with container shapes where the mask discards out-of-bounds
	 * splats naturally). Bucket A.
	 */
	randomSplatSpread?: number;
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
	POINTER_TARGET: 'canvas' | 'window';
	SPLAT_ON_HOVER: boolean;
	SEED: number;
	RANDOM_SPLAT_RATE: number;
	RANDOM_SPLAT_COUNT: number;
	RANDOM_SPLAT_COLOR: RGB | null;
	RANDOM_SPLAT_DX: number;
	RANDOM_SPLAT_DY: number;
	RANDOM_SPLAT_SPAWN_Y: number;
	RANDOM_SPLAT_EVEN_SPACING: boolean;
	RANDOM_SPLAT_SWIRL: number;
	RANDOM_SPLAT_SPREAD: number;
	CONTAINER_SHAPE: ContainerShape | null;
	GLASS: boolean;
	GLASS_THICKNESS: number;
	GLASS_REFRACTION: number;
	GLASS_REFLECTIVITY: number;
	GLASS_CHROMATIC: number;
	REVEAL: boolean;
	REVEAL_SENSITIVITY: number;
	REVEAL_CURVE: number;
	REVEAL_COVER_COLOR: RGB;
	REVEAL_ACCENT_COLOR: RGB;
	REVEAL_FRINGE_COLOR: RGB;
	DISTORTION: boolean;
	DISTORTION_POWER: number;
	DISTORTION_IMAGE_URL: string | null;
	DISTORTION_FIT: 'cover' | 'contain';
	DISTORTION_SCALE: number;
	DISTORTION_BLEED_X: number;
	DISTORTION_BLEED_Y: number;
	OPEN_BOUNDARY: boolean;
	STICKY: boolean;
	STICKY_MASK: StickyMask | null;
	STICKY_STRENGTH: number;
	STICKY_PRESSURE: number;
	STICKY_AMPLIFY: number;
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
}
