import type { StickyMask } from './types.js';

export interface StickyMaskRaster {
	data: Uint8Array;
	width: number;
	height: number;
}

export function resampleStickyMask(source: StickyMaskRaster, width: number, height: number): Uint8Array {
	const output = new Uint8Array(width * height);
	for (let y = 0; y < height; y += 1) {
		const sourceY = ((y + 0.5) / height) * source.height - 0.5;
		const y0 = Math.max(0, Math.min(source.height - 1, Math.floor(sourceY)));
		const y1 = Math.max(0, Math.min(source.height - 1, y0 + 1));
		const fy = Math.max(0, Math.min(1, sourceY - y0));
		for (let x = 0; x < width; x += 1) {
			const sourceX = ((x + 0.5) / width) * source.width - 0.5;
			const x0 = Math.max(0, Math.min(source.width - 1, Math.floor(sourceX)));
			const x1 = Math.max(0, Math.min(source.width - 1, x0 + 1));
			const fx = Math.max(0, Math.min(1, sourceX - x0));
			const top = source.data[y0 * source.width + x0]! * (1 - fx) + source.data[y0 * source.width + x1]! * fx;
			const bottom =
				source.data[y1 * source.width + x0]! * (1 - fx) + source.data[y1 * source.width + x1]! * fx;
			output[y * width + x] = Math.round(top * (1 - fy) + bottom * fy);
		}
	}
	return output;
}

/** Up to three fixed separable box passes approximate a Gaussian in O(pixels). */
export function blurStickyMask(data: Uint8Array, width: number, height: number, radius: number): void {
	const safeRadius = Number.isFinite(radius) ? Math.max(0, Math.min(64, radius)) : 0;
	if (safeRadius === 0) return;
	const passes = Math.min(3, Math.max(1, Math.ceil(safeRadius / 2)));
	const span = Math.max(1, Math.round(safeRadius / Math.sqrt(passes)));
	const temporary = new Uint8Array(width * height);
	const prefix = new Uint32Array(Math.max(width, height) + 1);
	for (let pass = 0; pass < passes; pass += 1) {
		for (let y = 0; y < height; y += 1) {
			prefix[0] = 0;
			for (let x = 0; x < width; x += 1) prefix[x + 1] = prefix[x]! + data[y * width + x]!;
			for (let x = 0; x < width; x += 1) {
				const start = Math.max(0, x - span);
				const end = Math.min(width - 1, x + span);
				temporary[y * width + x] = ((prefix[end + 1]! - prefix[start]!) / (end - start + 1)) | 0;
			}
		}
		for (let x = 0; x < width; x += 1) {
			prefix[0] = 0;
			for (let y = 0; y < height; y += 1) prefix[y + 1] = prefix[y]! + temporary[y * width + x]!;
			for (let y = 0; y < height; y += 1) {
				const start = Math.max(0, y - span);
				const end = Math.min(height - 1, y + span);
				data[y * width + x] = ((prefix[end + 1]! - prefix[start]!) / (end - start + 1)) | 0;
			}
		}
	}
}

export function resolveMaskResolution(value: number | undefined, maximum = 4096): number {
	const requested = Number.isFinite(value) ? value! : 512;
	return Math.max(1, Math.min(maximum, Math.round(requested)));
}

export function rasterizeStickyMask(mask: StickyMask, canvasWidth: number, canvasHeight: number): StickyMaskRaster {
	const baseDimension = resolveMaskResolution(mask.maskResolution);
	const aspect = canvasWidth / Math.max(1, canvasHeight);
	const width = Math.max(1, aspect >= 1 ? baseDimension : Math.round(baseDimension * aspect));
	const height = Math.max(1, aspect >= 1 ? Math.round(baseDimension / aspect) : baseDimension);
	let context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
	if (typeof OffscreenCanvas !== 'undefined') context = new OffscreenCanvas(width, height).getContext('2d');
	else {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		context = canvas.getContext('2d');
	}
	if (!context) throw new Error('svelte-fluid: Canvas2D is unavailable for sticky-mask rasterization');
	context.fillStyle = 'white';
	if (mask.d) {
		const [viewX, viewY, viewWidth, viewHeight] = mask.viewBox ?? [0, 0, 100, 100];
		const scale = Math.min(width / viewWidth, height / viewHeight);
		context.translate((width - viewWidth * scale) / 2, (height - viewHeight * scale) / 2);
		context.scale(scale, scale);
		context.translate(-viewX, -viewY);
		context.fill(new Path2D(mask.d), mask.fillRule ?? 'nonzero');
	} else if (mask.text) {
		context.font = mask.font ?? 'bold 72px sans-serif';
		context.textAlign = 'center';
		context.textBaseline = 'alphabetic';
		const metrics = context.measureText(mask.text);
		const textHeight = Math.max(1, metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent);
		const requestedPadding = mask.padding ?? 0.9;
		const padding = Number.isFinite(requestedPadding) ? Math.max(0, Math.min(1, requestedPadding)) : 0.9;
		const scale = Math.min(
			(width * padding) / Math.max(1, metrics.width),
			(height * padding) / textHeight
		);
		context.setTransform(scale, 0, 0, scale, width / 2, height / 2);
		context.fillText(mask.text, 0, (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2);
	}
	const rgba = context.getImageData(0, 0, width, height).data;
	const data = new Uint8Array(width * height);
	for (let index = 0; index < data.length; index += 1) data[index] = rgba[index * 4 + 3]!;
	if ((mask.blur ?? 0) > 0) blurStickyMask(data, width, height, mask.blur!);
	return { data, width, height };
}
