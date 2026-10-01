/** Native display pixels, independently of the simulation's state density. */
export function presentationSize(cssWidth: number, cssHeight: number, pixelRatio: number,
	deviceLimit = 8192): { width: number; height: number } {
	const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
	if (!Number.isFinite(cssWidth) || !Number.isFinite(cssHeight) || cssWidth < 0 || cssHeight < 0) {
		throw new RangeError('Native presentation requires finite, non-negative CSS dimensions.');
	}
	const width = Math.max(1, Math.round(cssWidth * ratio));
	const height = Math.max(1, Math.round(cssHeight * ratio));
	// Safety rejection, never a lower-resolution mode. Individual renderers must
	// additionally bound their own attachments (e.g. MSAA/depth), not just pixels.
	if (width > deviceLimit || height > deviceLimit || width * height > 16_777_216) {
		throw new RangeError(`Native presentation ${width}×${height} exceeds this experiment's resource limit. Reduce the surface size and reload; no lower-resolution substitute is used.`);
	}
	return { width, height };
}
