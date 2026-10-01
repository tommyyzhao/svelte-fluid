import type { FilmOptions } from './film.js';
import { coarseEnamel, enamelProfile } from './enamel-profile.js';
import { presentationSize } from './presentation-size.js';

/** Explicit display-type adapter, not a general DOM-to-image implementation. */
export function surfaceGeometry(host: HTMLElement, geometry: HTMLElement | undefined,
	color: string): FilmOptions {
	const bounds = host.getBoundingClientRect();
	const aspect = bounds.width / Math.max(1, bounds.height);
	const width = 384;
	const height = Math.max(32, Math.min(256, Math.round(width / aspect)));
	const hex = color.replace('#', '');
	const rgb = [0, 2, 4].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255) as [number, number, number];
	const enamel = surfaceEnamelProfile(host, geometry);
	// Packed profile alpha is the coverage; no second full-size mask texture.
	return { width, height, transparent: true, color: rgb,
		...coarseEnamel(enamel, width, height), enamel, brushRadius: 0.04 };
}

/** DPR changes refresh only presentation: keep the deposited coarse material. */
export function surfaceEnamelProfile(host: HTMLElement, geometry: HTMLElement | undefined): ReturnType<typeof enamelProfile> {
	if (!geometry) throw new Error('The typography study needs a native heading.');
	const bounds = host.getBoundingClientRect();
	// Glyph coverage is a presentation raster, not a simulation grid. A native
	// display pixel gets a native coverage sample; unsafe sizes fail explicitly.
	const native = presentationSize(bounds.width, bounds.height, window.devicePixelRatio);
	const mask = document.createElement('canvas');
	mask.width = native.width;
	mask.height = native.height;
	const ctx = mask.getContext('2d', { willReadFrequently: true })!;
	ctx.scale(mask.width / bounds.width, mask.height / bounds.height);
	ctx.fillStyle = '#fff';
	ctx.textBaseline = 'alphabetic';
	const lines = geometry.querySelectorAll<HTMLElement>('[data-liquid-line]');
	for (const line of lines.length ? lines : [geometry]) {
		const style = getComputedStyle(line);
		const rect = line.getBoundingClientRect();
		ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
		ctx.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
		const content = line.textContent?.trim() ?? '';
		const metrics = ctx.measureText(content);
		const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
		const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
		const lineHeight = parseFloat(style.lineHeight) || rect.height;
		const baseline = (lineHeight - ascent - descent) / 2 + ascent;
		let x = rect.left - bounds.left;
		if (style.textAlign === 'center') x += (rect.width - metrics.width) / 2;
		if (style.textAlign === 'right' || style.textAlign === 'end') x += rect.width - metrics.width;
		ctx.fillText(content, x, rect.top - bounds.top + baseline);
	}
	const pixels = ctx.getImageData(0, 0, mask.width, mask.height).data;
	const coverage = new Uint8Array(mask.width * mask.height);
	for (let i = 0; i < coverage.length; i++) {
		coverage[i] = pixels[i * 4 + 3];
	}
	return enamelProfile(coverage, mask.width, mask.height);
}
