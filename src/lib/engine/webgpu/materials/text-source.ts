import { enamelProfile } from './enamel-profile.js';
import type { MaterialSize } from './runtime.js';

/** Plain display text only: native DOM determines wrapping and bidi line placement. */
export function enamelTextSource(source: HTMLElement, canvas: HTMLCanvasElement, size: MaterialSize) {
	const text = source.textContent ?? '';
	if (text.length > 2048) throw new Error('Enamel is a display-text treatment. Long copy remains plain text.');
	const node = source.firstChild;
	if (!node || node.nodeType !== Node.TEXT_NODE || source.childNodes.length !== 1) throw new Error('Enamel requires nonempty plain display text.');
	const style = getComputedStyle(source), bounds = canvas.getBoundingClientRect();
	if (style.writingMode !== 'horizontal-tb' || style.textTransform !== 'none') throw new Error('This enamel treatment supports horizontal, untransformed display text. Plain text remains available.');
	const raster = document.createElement('canvas'); raster.width = size.width; raster.height = size.height;
	const ctx = raster.getContext('2d', { willReadFrequently: true });
	if (!ctx) throw new Error('Text coverage could not be prepared.');
	ctx.scale(size.width / Math.max(1, bounds.width), size.height / Math.max(1, bounds.height));
	ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
	ctx.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
	ctx.wordSpacing = style.wordSpacing === 'normal' ? '0px' : style.wordSpacing;
	ctx.fontKerning = style.fontKerning as CanvasFontKerning;
	ctx.direction = style.direction === 'rtl' ? 'rtl' : 'ltr';
	ctx.textAlign = ctx.direction === 'rtl' ? 'right' : 'left';
	ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff';
	const range = document.createRange();
	const lines: { start: number; end: number; top: number }[] = [];
	let offset = 0;
	for (const char of text) {
		const start = offset; offset += char.length;
		if (char === '\n' || char === '\r') continue;
		range.setStart(node, start); range.setEnd(node, offset);
		const rect = range.getBoundingClientRect();
		const previous = lines.at(-1);
		if (previous && Math.abs(previous.top - rect.top) < 0.5 && !text.slice(previous.end, start).includes('\n')) previous.end = offset;
		else lines.push({ start, end: offset, top: rect.top });
	}
	const positions: number[] = [];
	for (const line of lines) {
		range.setStart(node, line.start); range.setEnd(node, line.end);
		const rect = range.getBoundingClientRect(), content = text.slice(line.start, line.end), metrics = ctx.measureText(content);
		const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
		const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
		const baseline = rect.top - bounds.top + (rect.height - ascent - descent) / 2 + ascent;
		const x = (ctx.direction === 'rtl' ? rect.right : rect.left) - bounds.left;
		ctx.fillText(content, x, baseline);
		positions.push(x, baseline, rect.width);
	}
	const colorCanvas = document.createElement('canvas'); colorCanvas.width = colorCanvas.height = 1;
	const colorContext = colorCanvas.getContext('2d')!;
	colorContext.fillStyle = style.color; colorContext.fillRect(0, 0, 1, 1);
	const color = Array.from(colorContext.getImageData(0, 0, 1, 1).data).slice(0, 3).map((v) => v / 255) as [number, number, number];
	return { get profile() {
		const pixels = ctx.getImageData(0, 0, size.width, size.height).data;
		const coverage = new Uint8Array(size.width * size.height);
		for (let i = 0; i < coverage.length; i++) coverage[i] = pixels[i * 4 + 3];
		return enamelProfile(coverage, size.width, size.height);
	}, color,
		geometry: JSON.stringify([text, ctx.font, ctx.letterSpacing, ctx.wordSpacing, ctx.direction, size.cssWidth, size.cssHeight, positions]), lines: lines.length };
}
