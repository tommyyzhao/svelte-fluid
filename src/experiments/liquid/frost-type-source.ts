import { FROST_SIZE } from './frost-phase-model.js';
import { presentationSize } from './presentation-size.js';

/** Integrate the actual native raster over each model cell. This is coverage,
 * not a dilated silhouette or a hidden higher-resolution simulation. */
export function frostTypeCoverage(pixels: Uint8ClampedArray, width: number, height: number,
	size = FROST_SIZE): Float32Array<ArrayBuffer> {
	if (![width, height, size].every(Number.isInteger) || width < 1 || height < 1 || size < 1 ||
		pixels.length !== width * height * 4) throw new Error('Frost type needs a complete native RGBA raster.');
	const result = new Float32Array(size * size), dx = width / size, dy = height / size;
	for (let y = 0; y < size; y++) {
		const top = y * dy, bottom = (y + 1) * dy;
		for (let x = 0; x < size; x++) {
			const left = x * dx, right = (x + 1) * dx;
			let sum = 0;
			for (let sy = Math.floor(top); sy < Math.min(height, Math.ceil(bottom)); sy++) {
				const wy = Math.min(bottom, sy + 1) - Math.max(top, sy);
				for (let sx = Math.floor(left); sx < Math.min(width, Math.ceil(right)); sx++) {
					const wx = Math.min(right, sx + 1) - Math.max(left, sx);
					sum += pixels[(sy * width + sx) * 4 + 3] * wx * wy;
				}
			}
			result[y * size + x] = sum / (255 * dx * dy);
		}
	}
	return result;
}

export interface FrostTypeLine {
	text: string; x: number; y: number; size: number; spacing: number;
	family: string; weight: string; style: string;
}

/** Deliberately limited to our explicit display lines, not DOM rasterization. */
export function measureFrostType(host: HTMLElement, heading: HTMLElement): FrostTypeLine[] {
	const bounds = host.getBoundingClientRect();
	if (bounds.width <= 0 || bounds.height <= 0) throw new Error('Size the frost typography before planting it.');
	const canvas = document.createElement('canvas');
	const context = canvas.getContext('2d')!;
	try {
		return [...heading.querySelectorAll<HTMLElement>('[data-frost-line]')].map((line) => {
			const style = getComputedStyle(line), rect = line.getBoundingClientRect(), text = line.textContent?.trim() ?? '';
			context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
			context.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
			const metrics = context.measureText(text), ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent,
				descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
			let x = rect.left - bounds.left;
			if (style.textAlign === 'center') x += (rect.width - metrics.width) / 2;
			if (style.textAlign === 'right' || style.textAlign === 'end') x += rect.width - metrics.width;
			const baseline = ((parseFloat(style.lineHeight) || rect.height) - ascent - descent) / 2 + ascent;
			// The authored square and container-unit type keep these coordinates
			// invariant through CSS/DPR resize. SVG remains a native vector reference.
			return { text, x: x / bounds.width * 1000, y: (rect.top - bounds.top + baseline) / bounds.height * 1000,
				size: parseFloat(style.fontSize) / bounds.width * 1000,
				spacing: (parseFloat(style.letterSpacing) || 0) / bounds.width * 1000,
				family: style.fontFamily, weight: style.fontWeight, style: style.fontStyle };
		});
	} finally { canvas.width = canvas.height = 1; }
}

/** Action-time raster only: release native Canvas/readback immediately after
 * reducing. A later DPR change never rereads, resets or resamples live ice. */
export function rasterFrostType(host: HTMLElement, heading: HTMLElement) {
	const bounds = host.getBoundingClientRect(), native = presentationSize(bounds.width, bounds.height, window.devicePixelRatio);
	// Temporary Canvas + readback + presented canvas, with a conservative 2 MiB
	// reserve for fixed fields, seed and initialization arrays. Reject, never cap DPR.
	if (native.width * native.height * 12 + 2_097_152 > 201_326_592) throw new Error('Native glyph planting exceeds the 192 MiB transition budget; no lower-resolution source was substituted.');
	const lines = measureFrostType(host, heading), canvas = document.createElement('canvas');
	canvas.width = native.width; canvas.height = native.height;
	try {
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (!context) throw new Error('Native glyph rasterization is unavailable.');
		context.scale(native.width / 1000, native.height / 1000); context.fillStyle = '#fff'; context.textBaseline = 'alphabetic';
		for (const line of lines) {
			context.font = `${line.style} ${line.weight} ${line.size}px ${line.family}`;
			context.letterSpacing = `${line.spacing}px`; context.fillText(line.text, line.x, line.y);
		}
		const pixels = context.getImageData(0, 0, native.width, native.height).data;
		const coverage = frostTypeCoverage(pixels, native.width, native.height);
		return { coverage, lines, width: native.width, height: native.height };
	} finally { canvas.width = canvas.height = 1; }
}
