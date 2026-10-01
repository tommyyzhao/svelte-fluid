import {
	bakeChebyshevDistanceField,
	containerMask,
	obstructionMask,
	type MaskContext
} from './container-shapes.js';
import type { ContainerShape, Obstruction } from './types.js';

export interface CanonicalMaskFields {
	readonly allowed: MaskContext;
	readonly solid: MaskContext;
	readonly obstruction: MaskContext;
}

/**
 * Pack all simulation-aligned masks into one RGBA8 texture. The low five red
 * bits are the center/cardinal solid stencil. The otherwise-unused high three
 * bits conservatively encode solid clearance from 0–7 cells for MacCormack.
 */
export function packCanonicalMaskTextureData(
	fields: CanonicalMaskFields,
	sticky: Uint8Array | null = null
): Uint8Array {
	const { width, height } = fields.solid;
	if (
		fields.solid.data.length !== width * height ||
		fields.allowed.data.length !== width * height ||
		fields.obstruction.data.length !== width * height ||
		(sticky !== null && sticky.length !== width * height)
	) {
		throw new Error('svelte-fluid: canonical mask fields do not share one extent');
	}
	const seededClearance = new Uint8Array(width * height);
	for (let index = 0; index < seededClearance.length; index += 1) {
		seededClearance[index] = fields.solid.data[index]! > 127 ? 0 : 255;
	}
	const clearance = bakeChebyshevDistanceField(seededClearance, width, height);
	const solidAt = (x: number, y: number): number => {
		const clampedX = Math.max(0, Math.min(width - 1, x));
		const clampedY = Math.max(0, Math.min(height - 1, y));
		return fields.solid.data[clampedY * width + clampedX]! > 127 ? 1 : 0;
	};
	const data = new Uint8Array(width * height * 4);
	for (let index = 0; index < fields.solid.data.length; index += 1) {
		const x = index % width;
		const y = Math.floor(index / width);
		const stencil =
			solidAt(x, y) |
			(solidAt(x - 1, y) << 1) |
			(solidAt(x + 1, y) << 2) |
			(solidAt(x, y - 1) << 3) |
			(solidAt(x, y + 1) << 4);
		data[index * 4] = stencil | (Math.min(clearance[index]!, 7) << 5);
		data[index * 4 + 1] = fields.allowed.data[index]!;
		data[index * 4 + 2] = fields.obstruction.data[index]!;
		data[index * 4 + 3] = sticky?.[index] ?? 0;
	}
	return data;
}

/** Visual/dye masks need coverage only; omit solver stencils and distance baking. */
export function packVisualMaskTextureData(
	fields: CanonicalMaskFields,
	sticky: Uint8Array | null = null
): Uint8Array {
	const { width, height } = fields.solid;
	if (
		fields.solid.data.length !== width * height ||
		fields.allowed.data.length !== width * height ||
		fields.obstruction.data.length !== width * height ||
		(sticky !== null && sticky.length !== width * height)
	) {
		throw new Error('svelte-fluid: visual mask fields do not share one extent');
	}
	const data = new Uint8Array(width * height * 4);
	const solidAt = (x: number, y: number): number => {
		const clampedX = Math.max(0, Math.min(width - 1, x));
		const clampedY = Math.max(0, Math.min(height - 1, y));
		return fields.solid.data[clampedY * width + clampedX]! > 127 ? 1 : 0;
	};
	for (let index = 0; index < width * height; index += 1) {
		const x = index % width;
		const y = Math.floor(index / width);
		data[index * 4] =
			solidAt(x, y) |
			(solidAt(x - 1, y) << 1) |
			(solidAt(x + 1, y) << 2) |
			(solidAt(x, y - 1) << 3) |
			(solidAt(x, y + 1) << 4);
		data[index * 4 + 1] = fields.allowed.data[index]!;
		data[index * 4 + 2] = fields.obstruction.data[index]!;
		data[index * 4 + 3] = sticky?.[index] ?? 0;
	}
	return data;
}

interface MaskFieldOptions {
	containerShape: ContainerShape | null;
	obstructions: ReadonlyArray<Obstruction> | null;
	openBoundary: boolean;
	width: number;
	height: number;
}

function canvasContext(width: number, height: number): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
	if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height).getContext('2d')!;
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas.getContext('2d')!;
}

function alphaChannel(
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	width: number,
	height: number
): Uint8Array {
	const rgba = context.getImageData(0, 0, width, height).data;
	const alpha = new Uint8Array(width * height);
	for (let index = 0; index < alpha.length; index += 1) alpha[index] = rgba[index * 4 + 3]!;
	return alpha;
}

function rasterizeSvgContainer(shape: Extract<ContainerShape, { type: 'svgPath' }>, width: number, height: number): MaskContext {
	const context = canvasContext(width, height);
	context.fillStyle = 'white';
	if (shape.d) {
		const [vx, vy, vw, vh] = shape.viewBox ?? [0, 0, 100, 100];
		const scale = Math.min(width / vw, height / vh);
		context.translate((width - vw * scale) / 2, (height - vh * scale) / 2);
		context.scale(scale, scale);
		context.translate(-vx, -vy);
		context.fill(new Path2D(shape.d), shape.fillRule ?? 'nonzero');
	} else if (shape.text) {
		context.font = shape.font ?? 'bold 72px sans-serif';
		context.textAlign = 'center';
		context.textBaseline = 'alphabetic';
		const metrics = context.measureText(shape.text);
		const textHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
		const scale = Math.min((width * 0.9) / metrics.width, (height * 0.9) / textHeight);
		context.setTransform(scale, 0, 0, scale, width / 2, height / 2);
		context.fillText(shape.text, 0, (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2);
	}
	return { data: alphaChannel(context, width, height), width, height };
}

function rasterizeObstructions(
	obstructions: ReadonlyArray<Obstruction>,
	width: number,
	height: number
): MaskContext {
	const context = canvasContext(width, height);
	context.fillStyle = 'white';
	for (const obstruction of obstructions) {
		context.save();
		const extraScale = obstruction.scale ?? 1;
		const offsetX = (obstruction.offset?.x ?? 0) * width;
		const offsetY = -(obstruction.offset?.y ?? 0) * height;
		if (obstruction.d) {
			context.translate(offsetX, offsetY);
			const [vx, vy, vw, vh] = obstruction.viewBox ?? [0, 0, 100, 100];
			if ((obstruction.fit ?? 'contain') === 'fill') {
				context.scale((width / vw) * extraScale, (height / vh) * extraScale);
				context.translate(-vx, -vy);
			} else {
				const scale = Math.min(width / vw, height / vh) * extraScale;
				context.translate((width - vw * scale) / 2, (height - vh * scale) / 2);
				context.scale(scale, scale);
				context.translate(-vx, -vy);
			}
			context.fill(new Path2D(obstruction.d), obstruction.fillRule ?? 'nonzero');
		} else if (obstruction.text) {
			context.font = obstruction.font ?? 'bold 72px sans-serif';
			context.textAlign = 'center';
			context.textBaseline = 'alphabetic';
			const metrics = context.measureText(obstruction.text);
			const textHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
			const scale = Math.min((width * 0.9) / metrics.width, (height * 0.9) / textHeight) * extraScale;
			context.setTransform(scale, 0, 0, scale, width / 2 + offsetX, height / 2 + offsetY);
			context.fillText(
				obstruction.text,
				0,
				(metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2
			);
		}
		context.restore();
	}
	return { data: alphaChannel(context, width, height), width, height };
}

export function buildCanonicalMaskFields(options: MaskFieldOptions): CanonicalMaskFields {
	const width = Math.max(1, Math.floor(options.width));
	const height = Math.max(1, Math.floor(options.height));
	const aspect = width / height;
	const containerContext =
		options.containerShape?.type === 'svgPath'
			? rasterizeSvgContainer(options.containerShape, width, height)
			: undefined;
	const obstructionContext = options.obstructions?.length
		? rasterizeObstructions(options.obstructions, width, height)
		: undefined;
	const allowed = new Uint8Array(width * height);
	const solid = new Uint8Array(width * height);
	const obstruction = new Uint8Array(width * height);
	for (let y = 0; y < height; y += 1) {
		const uvY = 1 - (y + 0.5) / height;
		for (let x = 0; x < width; x += 1) {
			const uvX = (x + 0.5) / width;
			const containerCoverage = options.containerShape
				? containerMask(options.containerShape, uvX, uvY, aspect, containerContext)
				: 1;
			const obstructionCoverage = obstructionMask(uvX, uvY, obstructionContext);
			const insideContainer = containerCoverage >= 0.5;
			const obstructed = obstructionCoverage >= 0.5;
			const index = y * width + x;
			allowed[index] = Math.round(containerCoverage * (1 - obstructionCoverage) * 255);
			solid[index] = obstructed || (!options.openBoundary && !insideContainer) ? 255 : 0;
			obstruction[index] = Math.round(obstructionCoverage * 255);
		}
	}
	return {
		allowed: { data: allowed, width, height },
		solid: { data: solid, width, height },
		obstruction: { data: obstruction, width, height }
	};
}
