import { flowCanDriveSolver } from './solver-activity.js';
import { DYE_SPLAT_DOSE } from './shaders.js';

/** Fixed studio light / exponent in dyeSpecular: dot terms ≤1, Schlick <0.02001.
 * sRGB encode has derivative ≤12.92; 1-exp(-h/.06) ≤h/.06.
 * This bounds the whole highlight, including changing normals, not only fading.
 */
export const HEIGHT_SPECULAR_DISPLAY_BOUND = 12.92 * (130 / (8 * Math.PI)) * 0.02001 / DYE_SPLAT_DOSE;

export function heightVisibilityScale(c: {
	SHADING: boolean; SPECULAR: number; REFRACTION: number; GLASS: boolean; CONTAINER_SHAPE: unknown;
	DISTORTION: boolean; REVEAL: boolean; TONE_MAPPING: string; BLOOM: boolean; SUNRAYS: boolean; MIN_CONTRAST: number;
}): number {
	// Diffuse alone multiplies RGB by [0.7,1], so the existing RGB bound holds.
	if (c.REFRACTION > 0 && (c.DISTORTION || (c.GLASS && c.CONTAINER_SHAPE && !c.REVEAL))) return -1;
	if (c.SPECULAR <= 0) return 0;
	// ponytail: arbitrary image/curve/composite amplification needs a separate bound.
	if (c.REVEAL || c.TONE_MAPPING !== 'none' || c.BLOOM || c.SUNRAYS || c.MIN_CONTRAST > 1) return -1;
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

/** RGBA8 exact boolean reduction; untouched, partial or invalid readbacks fail closed. */
export function isQuietFlags(bytes: ArrayLike<number>, exactDye = false): boolean {
	if (bytes.length !== 8 || bytes[3] !== 255 || bytes[7] !== 255) return false;
	if (![bytes[0], bytes[1], bytes[2], bytes[4], bytes[5], bytes[6]].every((v) => v === 0 || v === 255)) return false;
	if (bytes[1] !== 0) return false;
	return exactDye ? bytes[6] === 0 : bytes[4] === 0 || (bytes[0] === 0 && bytes[5] === 0);
}
