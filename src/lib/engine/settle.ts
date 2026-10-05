import { flowCanDriveSolver } from './solver-activity.js';
import { DYE_SPLAT_DOSE } from './shaders.js';
import type { ResolvedConfig } from './internal-types.js';

/** Fixed studio light / exponent in dyeSpecular: dot terms ≤1, Schlick <0.02001.
 * sRGB encode has derivative ≤12.92; 1-exp(-h/.06) ≤h/.06.
 * This bounds the whole highlight, including changing normals, not only fading.
 */
export const HEIGHT_SPECULAR_DISPLAY_BOUND = 12.92 * (130 / (8 * Math.PI)) * 0.02001 / DYE_SPLAT_DOSE;

/** sunraysMask alpha≤1; 16 ray taps, decay .95, exposure .7, convex blur. */
export function dyeVisibilityGain(c: { SUNRAYS: boolean; SUNRAYS_WEIGHT: number }): number {
	return c.SUNRAYS ? Math.max(1, 0.7 * (1 + Math.max(0, c.SUNRAYS_WEIGHT) * (1 - 0.95 ** 16) / 0.05)) : 1;
}

export function heightVisibilityScale(c: {
	SHADING: boolean; SPECULAR: number; REFRACTION: number; GLASS: boolean; CONTAINER_SHAPE: unknown;
	DISTORTION: boolean; REVEAL: boolean; TONE_MAPPING: string; BLOOM: boolean; SUNRAYS: boolean; MIN_CONTRAST: number;
}): number {
	// Diffuse alone multiplies RGB by [0.7,1], so the existing RGB bound holds.
	if (c.REFRACTION > 0 && (c.DISTORTION || (c.GLASS && c.CONTAINER_SHAPE && !c.REVEAL))) return -1;
	if (c.SHADING && !c.DISTORTION && !c.REVEAL && ((c.GLASS && c.CONTAINER_SHAPE) || c.TONE_MAPPING !== 'none' || c.MIN_CONTRAST > 1)) return -1;
	if (c.SPECULAR <= 0) return 0;
	// ponytail: arbitrary image/curve/composite amplification needs a separate bound.
	if (c.REVEAL || (!c.DISTORTION && c.GLASS && c.CONTAINER_SHAPE) || c.TONE_MAPPING !== 'none' || c.BLOOM || c.SUNRAYS || c.MIN_CONTRAST > 1) return -1;
	return c.SPECULAR * HEIGHT_SPECULAR_DISPLAY_BOUND;
}
import type { FlowConfig } from './types.js';

/** Below this max |value| (display units) a field cannot change a displayed 8-bit pixel. */
export const SETTLE_EPSILON = 0.5 / 255;
/** Frames between quiet checks. */
export const SETTLE_CHECK_INTERVAL = 30;
/** Consecutive quiet checks before the loop stops. */
export const SETTLE_CHECKS = 3;
/**
 * Max |velocity component| (texels/s) under which advection moves dye < ~0.01
 * texel per 1/60 s frame. Measured: a default decayed scene keeps |v| ~ 40
 * (vorticity confinement sustains it) long after dye is gone, so velocity only
 * gates settling while visible dye remains.
 */
export const SETTLE_VELOCITY = 0.5;

/**
 * Config that changes the image without input: these scenes never settle.
 * COLORFUL only recolours future splats, so it does not block settling.
 */
export function hasContinuousDriver(
	c: {
		AUTO_SPLAT_RATE: number;
		FLOW: FlowConfig | null | undefined;
		COLORFUL: boolean;
		INITIAL_DENSITY_DISSIPATION_DURATION: number;
	},
	elapsedSec: number
): boolean {
	if (c.AUTO_SPLAT_RATE > 0) return true;
	if (flowCanDriveSolver(c.FLOW)) return true;
	const p = c.FLOW?.prescribed;
	if (p && (p.velocity || Object.values(p.scalars ?? {}).some((f) => f !== undefined))) return true;
	return c.INITIAL_DENSITY_DISSIPATION_DURATION > 0 && elapsedSec < c.INITIAL_DENSITY_DISSIPATION_DURATION;
}

/**
 * Pure quiet test on readback maxima. Dye fades by 1/(1 + dissipation * dt)
 * per frame (advection shader `decay`), so fading is a visible change until
 * the per-frame delta drops under SETTLE_EPSILON.
 */
export function isQuiet(maxVelocity: number, maxDye: number, dissipation: number): boolean {
	if (![maxVelocity, maxDye, dissipation].every(Number.isFinite) || maxVelocity < 0 || maxDye < 0 || dissipation < 0) return false;
	// Fully invisible dye: nothing left to move, whatever the velocity does.
	if (maxDye < SETTLE_EPSILON) return true;
	const perFrameFade = maxDye * (1 - 1 / (1 + dissipation / 60));
	return maxVelocity < SETTLE_VELOCITY && perFrameFade < SETTLE_EPSILON;
}

/** Exact-zero velocity is a fixed point only with identity dye transport.
 * ponytail: power-of-two actual grids make texel-centre interpolation exact,
 * including manual bilerp; other grids need a separate numerical proof.
 */
export function isInertSolver(c: ResolvedConfig, elapsedSec: number, dimensions: readonly number[]): boolean {
	return c.FLOW === null && c.AUTO_SPLAT_RATE === 0 && c.CONTAINER_SHAPE === null &&
		c.OBSTRUCTIONS === null && c.STICKY_MASK === null && !c.REVEAL && !c.STICKY &&
		c.DENSITY_DISSIPATION === 0 && c.PRESSURE === 0 && c.CURL === 0 &&
		c.VISCOSITY === 0 && c.WALL_FRICTION === 0 &&
		Number.isFinite(c.VELOCITY_DISSIPATION) && c.VELOCITY_DISSIPATION >= 0 &&
		Number.isFinite(elapsedSec) && elapsedSec >= 0 &&
		Number.isFinite(c.INITIAL_DENSITY_DISSIPATION_DURATION) && c.INITIAL_DENSITY_DISSIPATION_DURATION >= 0 &&
		elapsedSec >= c.INITIAL_DENSITY_DISSIPATION_DURATION && dimensions.length === 4 &&
		dimensions.every((n) => Number.isInteger(n) && n > 0 && Number.isInteger(Math.log2(n)));
}

/** RGBA8 exact boolean reduction; untouched, partial or invalid readbacks fail closed. */
export function isQuietFlags(bytes: ArrayLike<number>, exactDye = false, inertSolver = false): boolean {
	if (bytes.length !== 8 || bytes[3] !== 255 || bytes[7] !== 255) return false;
	if (![bytes[0], bytes[1], bytes[2], bytes[4], bytes[5], bytes[6]].every((v) => v === 0 || v === 255)) return false;
	if (bytes[1] !== 0) return false;
	if (inertSolver) return bytes[2] === 0 && bytes[5] === 0;
	return exactDye ? bytes[6] === 0 : bytes[4] === 0 || (bytes[0] === 0 && bytes[5] === 0);
}
