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
