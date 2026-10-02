import { flowCanDriveSolver } from './solver-activity.js';
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
	// Fully invisible dye: nothing left to move, whatever the velocity does.
	if (maxDye < SETTLE_EPSILON) return true;
	const perFrameFade = maxDye * (1 - 1 / (1 + dissipation / 60));
	return maxVelocity < SETTLE_VELOCITY && perFrameFade < SETTLE_EPSILON;
}
