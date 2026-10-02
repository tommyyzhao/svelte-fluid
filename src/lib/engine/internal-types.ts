/*
 * svelte-fluid — internal engine types (NOT part of the public API).
 * These mention WebGL handles, so they must never be reachable from
 * `src/lib/index.ts` or any root-exported declaration.
 */

import type { ContainerShape, FlowConfig, Obstruction, RGB, StickyMask, ToneMapping } from './types.js';

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
	ADVECTION_SCHEME: 'semilagrangian' | 'maccormack';
	MAX_TIME_STEP: number;
	SUBSTEPS: number;
	VISCOSITY: number;
	VISCOSITY_ITERATIONS: number;
	WALL_FRICTION: number;
	WALL_FRICTION_WIDTH: number;
	PRESSURE: number;
	PRESSURE_ITERATIONS: number;
	AUTO_PERFORMANCE: boolean;
	AUTO_PERFORMANCE_TARGET_FRAME_MS: number;
	AUTO_PERFORMANCE_MIN_PRESSURE_ITERATIONS: number;
	AUTO_PERFORMANCE_MIN_SUBSTEPS: number;
	CURL: number;
	VORTICITY_ADAPTIVE: number;
	SPLAT_RADIUS: number;
	SPLAT_FORCE: number;
	SHADING: boolean;
	SPECULAR: number;
	REFRACTION: number;
	COLORFUL: boolean;
	COLOR_UPDATE_SPEED: number;
	PAUSED: boolean;
	BACK_COLOR: RGB;
	TRANSPARENT: boolean;
	MIN_CONTRAST: number;
	CONTRAST_COLOR: RGB | null;
	CONTRAST_MODE: 'floor' | 'outline';
	TONE_MAPPING: ToneMapping;
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
	REQUIRE_HARDWARE_ACCELERATION: boolean;
	AUTO_SPLAT_RATE: number;
	AUTO_SPLAT_COUNT: number;
	AUTO_SPLAT_COLOR: RGB | null;
	AUTO_SPLAT_VELOCITY_X: number;
	AUTO_SPLAT_VELOCITY_Y: number;
	AUTO_SPLAT_CENTER_Y: number;
	AUTO_SPLAT_CENTER_X: number;
	AUTO_SPLAT_EVEN_X: boolean;
	AUTO_SPLAT_SWIRL: number;
	AUTO_SPLAT_BAND_HEIGHT: number;
	AUTO_SPLAT_BAND_WIDTH: number;
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
	OBSTRUCTIONS: ReadonlyArray<Obstruction> | null;
	OBSTRUCTION_COLOR: RGB | null;
	FLOW: FlowConfig | null;
}

/** Pixel format pair returned by `getSupportedFormat`. */
export interface SupportedFormat {
	internalFormat: number;
	format: number;
}

/**
 * WebGL extension / capability info gathered at context creation.
 */
export interface ExtInfo {
	formatRGBA: SupportedFormat;
	formatRG: SupportedFormat;
	formatR: SupportedFormat;
	halfFloatTexType: number;
	supportLinearFiltering: boolean;
	isWebGL2: boolean;
}

/**
 * A single framebuffer object plus the texture it owns.
 */
export interface FBO {
	texture: WebGLTexture;
	fbo: WebGLFramebuffer;
	width: number;
	height: number;
	texelSizeX: number;
	texelSizeY: number;
	attach(id: number): number;
}

/**
 * Read/write FBO pair used for ping-pong shader passes.
 */
export interface DoubleFBO {
	width: number;
	height: number;
	texelSizeX: number;
	texelSizeY: number;
	read: FBO;
	write: FBO;
	swap(): void;
}
