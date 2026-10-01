/** Radii beyond this already flatten a 512-pixel mask; it also bounds hostile input. */
export const MAX_STICKY_BLUR_RADIUS = 64;
const MAX_PASSES = 3;

/**
 * In-place separable box blur of a single-channel mask, O(pixels) per pass via
 * prefix sums and at most three passes.
 *
 * The historical blur ran `ceil(radius / 2)` passes of an O(radius) kernel. Up
 * to three passes (radius ≤ 6, including FluidStick's default 4) this
 * reproduces it bit-for-bit. Beyond that, three passes use the span whose
 * combined variance matches the historical pass stack, so the softness stays
 * comparable while cost no longer grows with radius.
 */
export function blurMaskData(data: Uint8Array, w: number, h: number, radius: number): void {
	if (!Number.isFinite(radius) || radius <= 0 || w <= 0 || h <= 0) return;
	const clamped = Math.min(MAX_STICKY_BLUR_RADIUS, radius);
	const legacyPasses = Math.max(1, Math.ceil(clamped / 2));
	const r = Math.max(1, Math.round(clamped));
	const passes = Math.min(MAX_PASSES, legacyPasses);
	let span = r;
	if (legacyPasses > MAX_PASSES) {
		// A box of radius s has variance s(s+1)/3; n passes add variances.
		const target = (legacyPasses * r * (r + 1)) / MAX_PASSES;
		span = Math.max(1, Math.round((Math.sqrt(1 + 4 * target) - 1) / 2));
	}
	const temp = new Uint8Array(w * h);
	const prefix = new Uint32Array(Math.max(w, h) + 1);
	for (let pass = 0; pass < passes; pass++) {
		for (let y = 0; y < h; y++) {
			const row = y * w;
			for (let x = 0; x < w; x++) prefix[x + 1] = prefix[x] + data[row + x];
			for (let x = 0; x < w; x++) {
				const start = Math.max(0, x - span);
				const end = Math.min(w - 1, x + span);
				temp[row + x] = ((prefix[end + 1] - prefix[start]) / (end - start + 1)) | 0;
			}
		}
		for (let x = 0; x < w; x++) {
			for (let y = 0; y < h; y++) prefix[y + 1] = prefix[y] + temp[y * w + x];
			for (let y = 0; y < h; y++) {
				const start = Math.max(0, y - span);
				const end = Math.min(h - 1, y + span);
				data[y * w + x] = ((prefix[end + 1] - prefix[start]) / (end - start + 1)) | 0;
			}
		}
	}
}
