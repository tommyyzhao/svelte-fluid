/*
 * Straight-edge discontinuity metric for overlay frames (ADR-0094).
 *
 * The overlay is composited onto its page colour and reduced to 8-bit sRGB
 * luma. A seam is a one-pixel spike in the luma step (a C⁰ cut or a C¹
 * crease) across a vertical or horizontal line, present along the whole line:
 * for every column boundary (and row boundary) the median spike over each
 * 120 CSS px run of rows (columns). A straight hard cut of height S gives ≈ S;
 * caustic lines (curved, so tangent to one boundary only briefly) and dither
 * give ≈ 0. `interior` is the worst such run median. `border` is the worst luma step from
 * the page to the canvas's outermost pixel row or column: a hard cut where
 * the canvas ends.
 */
import { LOOKS, hexToSrgb, overlayPixel } from '../surface/look.js';
import type { Srgb, SurfaceTone } from '../surface/look.js';

export function seams(canvas: HTMLCanvasElement, tone: SurfaceTone): { interior: number; border: number; where: string } {
	const w = canvas.width;
	const h = canvas.height;
	const copy = document.createElement('canvas');
	copy.width = w;
	copy.height = h;
	const ctx = copy.getContext('2d')!;
	ctx.drawImage(canvas, 0, 0);
	const px = ctx.getImageData(0, 0, w, h).data;
	const page = hexToSrgb(LOOKS.button[tone].page);
	const luma = (c: Srgb) => 255 * (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]);
	const base = luma(page);
	const L = new Float64Array(w * h);
	for (let i = 0; i < w * h; i++) L[i] = luma(overlayPixel(page, px[i * 4 + 3] / 255, tone));
	const run = Math.round((120 * w) / (canvas.getBoundingClientRect().width || w / 2));
	// Second difference across the boundary after pixel i: the one-pixel jump minus
	// the mean of the jumps either side. A hard cut (C⁰) or a crease (C¹, e.g. a
	// clipped fade) spikes on exactly one boundary; smooth light does not.
	const spike = (at: (i: number) => number, i: number) => at(i + 1) - at(i) - (at(i + 2) - at(i - 1)) / 3;
	// Median along the run, not the mean: a straight seam spikes on every pixel of
	// the run, a curved caustic line only where it happens to run tangent, and
	// zero-mean dither not at all, so only the seam moves the median.
	const vals = new Float64Array(run);
	const median = () => {
		vals.sort();
		return vals[run >> 1];
	};
	let interior = 0;
	let where = '';
	for (let x = 1; x + 2 < w; x++)
		for (let y0 = 0; y0 + run <= h; y0 += run >> 1) {
			for (let k = 0; k < run; k++) vals[k] = spike((i) => L[(y0 + k) * w + i], x);
			const m = Math.abs(median());
			if (m > interior) [interior, where] = [m, `col ${x} rows ${y0}+${run}`];
		}
	for (let y = 1; y + 2 < h; y++)
		for (let x0 = 0; x0 + run <= w; x0 += run >> 1) {
			for (let k = 0; k < run; k++) vals[k] = spike((i) => L[i * w + x0 + k], y);
			const m = Math.abs(median());
			if (m > interior) [interior, where] = [m, `row ${y} cols ${x0}+${run}`];
		}
	let border = 0;
	for (let x = 0; x < w; x++) border = Math.max(border, Math.abs(L[x] - base), Math.abs(L[(h - 1) * w + x] - base));
	for (let y = 0; y < h; y++) border = Math.max(border, Math.abs(L[y * w] - base), Math.abs(L[y * w + w - 1] - base));
	return { interior, border, where };
}
