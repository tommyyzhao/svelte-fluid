/*
 * Rasterise a plain DOM text node into an enamel coverage image (ADR-0097).
 * DOM only, no GL, no Svelte. The browser has already wrapped and placed the
 * text; each laid-out line is redrawn at its measured box with the computed
 * font, so the coverage sits on the DOM glyphs. Ported from the R&D
 * text-source (ADR-0072) with one change: white on opaque black, so the red
 * channel is coverage whatever the upload's alpha handling.
 */

export interface EnamelRaster {
	/** Device-px coverage image, R = coverage, sized exactly `width`×`height`. */
	canvas: HTMLCanvasElement;
	/** Computed font size, CSS px. */
	fontPx: number;
	/** Computed numeric font weight. */
	weight: number;
	/** Layout identity: equal keys rasterise identically. */
	key: string;
}

/** Display text only: longer copy stays plain DOM text. */
export const MAX_ENAMEL_CHARS = 512;

/**
 * Draw `source`'s single text node into a `width`×`height` image covering
 * `frame` (the canvas's CSS box). Throws for anything this treatment does not
 * reproduce exactly (nested markup, vertical writing, text-transform); the
 * caller then keeps the DOM text visible.
 */
export function rasterizeText(source: HTMLElement, frame: DOMRect, width: number, height: number): EnamelRaster {
	const text = source.textContent ?? '';
	if (!text.trim() || text.length > MAX_ENAMEL_CHARS) throw new Error('svelte-fluid: EnamelText needs short, nonempty display text');
	const node = source.firstChild;
	if (!node || node.nodeType !== Node.TEXT_NODE || source.childNodes.length !== 1) throw new Error('svelte-fluid: EnamelText needs one plain text node');
	const style = getComputedStyle(source);
	if (style.writingMode !== 'horizontal-tb' || style.textTransform !== 'none') {
		throw new Error('svelte-fluid: EnamelText supports horizontal, untransformed text');
	}
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('svelte-fluid: no 2D canvas for the enamel raster');
	ctx.fillStyle = '#000';
	ctx.fillRect(0, 0, width, height);
	ctx.scale(width / Math.max(1, frame.width), height / Math.max(1, frame.height));
	ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
	ctx.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
	ctx.wordSpacing = style.wordSpacing === 'normal' ? '0px' : style.wordSpacing;
	ctx.fontKerning = style.fontKerning as CanvasFontKerning;
	ctx.direction = style.direction === 'rtl' ? 'rtl' : 'ltr';
	ctx.textAlign = ctx.direction === 'rtl' ? 'right' : 'left';
	ctx.textBaseline = 'alphabetic';
	ctx.fillStyle = '#fff';

	// Group characters into the browser's line boxes.
	const range = document.createRange();
	const lines: { start: number; end: number; top: number }[] = [];
	let offset = 0;
	for (const char of text) {
		const start = offset;
		offset += char.length;
		if (char === '\n' || char === '\r') continue;
		range.setStart(node, start);
		range.setEnd(node, offset);
		const rect = range.getBoundingClientRect();
		const previous = lines.at(-1);
		if (previous && Math.abs(previous.top - rect.top) < 0.5 && !text.slice(previous.end, start).includes('\n')) previous.end = offset;
		else lines.push({ start, end: offset, top: rect.top });
	}
	const placed: number[] = [];
	for (const line of lines) {
		range.setStart(node, line.start);
		range.setEnd(node, line.end);
		const rect = range.getBoundingClientRect();
		const content = text.slice(line.start, line.end);
		const metrics = ctx.measureText(content);
		const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
		const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
		const baseline = rect.top - frame.top + (rect.height - ascent - descent) / 2 + ascent;
		const x = (ctx.direction === 'rtl' ? rect.right : rect.left) - frame.left;
		ctx.fillText(content, x, baseline);
		placed.push(x, baseline, rect.width);
	}
	const fontPx = parseFloat(style.fontSize) || 16;
	const weight = parseFloat(style.fontWeight) || 400;
	const key = JSON.stringify([text, ctx.font, ctx.letterSpacing, ctx.wordSpacing, ctx.direction, frame.width, frame.height, width, height, placed]);
	return { canvas, fontPx, weight, key };
}
