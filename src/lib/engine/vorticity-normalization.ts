import { VORTICITY_ADAPTIVE_HI, VORTICITY_ADAPTIVE_LO } from './shaders.js';

export const VORTICITY_REFERENCE_RESOLUTION = 128;

/** Scale an unscaled centered-difference curl sample into the reference gauge. */
export function vorticityNormalizationScale(
	width: number,
	height: number,
	referenceResolution = VORTICITY_REFERENCE_RESOLUTION
): number {
	const actual = Math.max(1, Math.min(width, height));
	const reference = Math.max(1, referenceResolution);
	return actual / reference;
}

/**
 * Curl shader samples are unscaled centered differences and therefore shrink
 * in proportion to grid spacing. Convert them to the reference-grid magnitude
 * before applying a physical threshold band.
 */
export function normalizedVorticityMagnitude(
	curlSample: number,
	width: number,
	height: number,
	referenceResolution = VORTICITY_REFERENCE_RESOLUTION
): number {
	return Math.abs(curlSample * 2) * vorticityNormalizationScale(width, height, referenceResolution);
}

export function adaptiveVorticityWeight(
	curlSample: number,
	width: number,
	height: number,
	lo = VORTICITY_ADAPTIVE_LO,
	hi = VORTICITY_ADAPTIVE_HI,
	referenceResolution = VORTICITY_REFERENCE_RESOLUTION
): number {
	if (!(hi > lo)) return 1;
	const omega = normalizedVorticityMagnitude(curlSample, width, height, referenceResolution);
	const t = Math.max(0, Math.min(1, (omega - lo) / (hi - lo)));
	return t * t * (3 - 2 * t);
}
