/*
 * svelte-fluid — container shape utilities
 *
 * Pure functions for container shape comparison and SDF evaluation.
 * The SDF functions are TypeScript mirrors of the GLSL in applyMaskShader
 * and the display shader's CONTAINER_MASK block, kept in sync by tests.
 */

import type { ContainerShape, StickyMask } from './types.js';

/**
 * CPU-side mask data for svgPath shapes, used for rejection sampling
 * during random splat spawning. The engine rasterizes the SVG path into
 * this array and passes it through to containerMask().
 */
export interface MaskContext {
	data: Uint8Array;
	width: number;
	height: number;
}

/** Deep equality for ContainerShape values. */
export function containerShapeEqual(
	a: ContainerShape | null | undefined,
	b: ContainerShape | null | undefined
): boolean {
	if (a === b) return true;
	if (a == null || b == null) return false;
	if (a.type !== b.type) return false;
	if (a.type === 'circle' && b.type === 'circle') {
		return a.cx === b.cx && a.cy === b.cy && a.radius === b.radius;
	}
	if (a.type === 'frame' && b.type === 'frame') {
		return a.cx === b.cx && a.cy === b.cy && a.halfW === b.halfW && a.halfH === b.halfH &&
			(a.innerCornerRadius ?? 0) === (b.innerCornerRadius ?? 0) &&
			(a.outerHalfW ?? 0.5) === (b.outerHalfW ?? 0.5) &&
			(a.outerHalfH ?? 0.5) === (b.outerHalfH ?? 0.5) &&
			(a.outerCornerRadius ?? 0) === (b.outerCornerRadius ?? 0);
	}
	if (a.type === 'roundedRect' && b.type === 'roundedRect') {
		return (
			a.cx === b.cx &&
			a.cy === b.cy &&
			a.halfW === b.halfW &&
			a.halfH === b.halfH &&
			a.cornerRadius === b.cornerRadius
		);
	}
	if (a.type === 'annulus' && b.type === 'annulus') {
		return a.cx === b.cx && a.cy === b.cy && a.innerRadius === b.innerRadius && a.outerRadius === b.outerRadius;
	}
	if (a.type === 'svgPath' && b.type === 'svgPath') {
		return a.d === b.d &&
			a.text === b.text &&
			(a.font ?? '') === (b.font ?? '') &&
			(a.fillRule ?? 'nonzero') === (b.fillRule ?? 'nonzero') &&
			(a.maskResolution ?? 512) === (b.maskResolution ?? 512) &&
			viewBoxEqual(a.viewBox, b.viewBox);
	}
	return false;
}

/**
 * Evaluate the container mask at a UV coordinate. Returns 0–1 where
 * 1 = fluid allowed, 0 = fluid zeroed. Mirrors the GLSL applyMaskShader.
 *
 * @param shape   - The container shape definition
 * @param uvX     - Horizontal UV coordinate (0 = left, 1 = right)
 * @param uvY     - Vertical UV coordinate (0 = bottom, 1 = top)
 * @param aspect  - Canvas width / height
 * @param maskCtx - CPU-side mask data for svgPath shapes (ignored for analytical shapes)
 */
export function containerMask(
	shape: ContainerShape,
	uvX: number,
	uvY: number,
	aspect: number,
	maskCtx?: MaskContext
): number {
	switch (shape.type) {
		case 'circle':
			return circleMask(uvX, uvY, shape.cx, shape.cy, shape.radius, aspect);
		case 'frame':
			return frameMask(uvX, uvY, shape.cx, shape.cy, shape.halfW, shape.halfH,
				shape.innerCornerRadius, shape.outerHalfW, shape.outerHalfH, shape.outerCornerRadius);
		case 'roundedRect':
			return roundedRectSDF(uvX, uvY, shape.cx, shape.cy, shape.halfW, shape.halfH, shape.cornerRadius, aspect);
		case 'annulus':
			return annulusMask(uvX, uvY, shape.cx, shape.cy, shape.innerRadius, shape.outerRadius, aspect);
		case 'svgPath':
			return svgPathMask(uvX, uvY, maskCtx);
	}
}

/**
 * Circle mask: 1 inside the circle, 0 outside, smooth edge.
 * Matches the GLSL: `1.0 - smoothstep(uRadius - 0.005, uRadius + 0.005, length(p))`
 */
function circleMask(
	uvX: number, uvY: number,
	cx: number, cy: number, radius: number, aspect: number
): number {
	const px = (uvX - cx) * aspect;
	const py = uvY - cy;
	const d = Math.sqrt(px * px + py * py);
	return 1.0 - glslSmoothstep(radius - 0.005, radius + 0.005, d);
}

/**
 * Frame mask: fluid fills the region between an inner and outer rectangle.
 * Returns 0 inside the inner cutout, 0 outside the outer boundary, 1 in the frame region.
 *
 * Both inner and outer boundaries support rounded corners via their respective
 * corner radius params. Uses the Inigo Quilez rounded-box SDF when radius > 0.
 *
 * Uses a box SDF in UV space — no aspect correction because the rectangles
 * are specified directly in UV coordinates.
 *
 * When outer params are omitted (defaults: outerHalfW=0.5, outerHalfH=0.5,
 * outerCornerRadius=0), the outer boundary covers the full canvas.
 */
function frameMask(
	uvX: number, uvY: number,
	cx: number, cy: number, halfW: number, halfH: number,
	innerCornerRadius?: number,
	outerHalfW?: number, outerHalfH?: number, outerCornerRadius?: number
): number {
	// Inner mask: 0 inside inner rect, 1 outside
	const icr = innerCornerRadius ?? 0;
	let innerMask: number;
	if (icr > 0) {
		const dx = Math.abs(uvX - cx) - halfW + icr;
		const dy = Math.abs(uvY - cy) - halfH + icr;
		const outsideDist = Math.sqrt(Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2);
		const insideDist = Math.min(Math.max(dx, dy), 0);
		const dist = outsideDist + insideDist - icr;
		innerMask = glslSmoothstep(-0.005, 0.005, dist);
	} else {
		const dx = Math.abs(uvX - cx) - halfW;
		const dy = Math.abs(uvY - cy) - halfH;
		innerMask = glslSmoothstep(-0.005, 0.005, Math.max(dx, dy));
	}

	// Outer mask: 1 inside outer rect, 0 outside
	const ohw = outerHalfW ?? 0.5;
	const ohh = outerHalfH ?? 0.5;
	const ocr = outerCornerRadius ?? 0;
	let outerMask: number;
	if (ocr > 0) {
		const dx = Math.abs(uvX - cx) - ohw + ocr;
		const dy = Math.abs(uvY - cy) - ohh + ocr;
		const outsideDist = Math.sqrt(Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2);
		const insideDist = Math.min(Math.max(dx, dy), 0);
		const dist = outsideDist + insideDist - ocr;
		outerMask = 1.0 - glslSmoothstep(-0.005, 0.005, dist);
	} else {
		const dx = Math.abs(uvX - cx) - ohw;
		const dy = Math.abs(uvY - cy) - ohh;
		outerMask = 1.0 - glslSmoothstep(-0.005, 0.005, Math.max(dx, dy));
	}

	return innerMask * outerMask;
}

/**
 * Rounded-rect mask: 1 inside the rounded rectangle, 0 outside, smooth edge.
 * Uses the Inigo Quilez rounded-box SDF:
 *   d = length(max(abs(p - center) - halfSize + cornerRadius, 0)) - cornerRadius
 *
 * No aspect correction — halfW/halfH are specified directly in UV space.
 */
export function roundedRectSDF(
	uvX: number, uvY: number,
	cx: number, cy: number,
	halfW: number, halfH: number,
	cornerRadius: number,
	_aspect: number
): number {
	const dx = Math.abs(uvX - cx) - halfW + cornerRadius;
	const dy = Math.abs(uvY - cy) - halfH + cornerRadius;
	const outsideDist = Math.sqrt(Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2);
	const insideDist = Math.min(Math.max(dx, dy), 0);
	const d = outsideDist + insideDist - cornerRadius;
	return 1.0 - glslSmoothstep(-0.005, 0.005, d);
}

/**
 * Annulus mask: 1 inside the ring (between inner and outer circles), 0 outside.
 * Uses aspect correction like circleMask since it's circular.
 *
 * SDF: max(d - outerRadius, innerRadius - d) is negative inside the ring,
 * positive outside. smoothstep provides soft antialiased edges.
 */
function annulusMask(
	uvX: number, uvY: number,
	cx: number, cy: number,
	innerRadius: number, outerRadius: number,
	aspect: number
): number {
	const px = (uvX - cx) * aspect;
	const py = uvY - cy;
	const d = Math.sqrt(px * px + py * py);
	const sdf = Math.max(d - outerRadius, innerRadius - d);
	return 1.0 - glslSmoothstep(-0.005, 0.005, sdf);
}

/**
 * SVG path mask: sample the pre-rasterized mask texture at UV coordinates.
 * Returns 0 if no maskCtx is available (reject all splats).
 */
function svgPathMask(uvX: number, uvY: number, maskCtx?: MaskContext): number {
	if (!maskCtx) return 0;
	const { data, width, height } = maskCtx;
	// UV (0–1, bottom-to-top) → pixel coords. The mask was rasterized with
	// a Y-flip so row 0 corresponds to uvY=1 (top).
	const px = Math.floor(uvX * (width - 1));
	const py = Math.floor((1 - uvY) * (height - 1));
	const cx = Math.max(0, Math.min(width - 1, px));
	const cy = Math.max(0, Math.min(height - 1, py));
	return data[cy * width + cx] / 255;
}

/** Deep equality for StickyMask values. */
export function stickyMaskEqual(
	a: StickyMask | null | undefined,
	b: StickyMask | null | undefined
): boolean {
	if (a === b) return true;
	if (a == null || b == null) return false;
	return a.d === b.d && a.text === b.text &&
		(a.font ?? '') === (b.font ?? '') &&
		(a.fillRule ?? 'nonzero') === (b.fillRule ?? 'nonzero') &&
		(a.maskResolution ?? 512) === (b.maskResolution ?? 512) &&
		(a.blur ?? 0) === (b.blur ?? 0) &&
		(a.padding ?? 0.9) === (b.padding ?? 0.9) &&
		viewBoxEqual(a.viewBox, b.viewBox);
}

/** Compare two optional viewBox tuples. Defaults to [0,0,100,100]. */
export function viewBoxEqual(
	a: [number, number, number, number] | undefined,
	b: [number, number, number, number] | undefined
): boolean {
	const va = a ?? [0, 0, 100, 100];
	const vb = b ?? [0, 0, 100, 100];
	return va[0] === vb[0] && va[1] === vb[1] && va[2] === vb[2] && va[3] === vb[3];
}

/**
 * Compute area fraction from mask data for hdrMultiplier calculation.
 * Counts pixels above threshold and returns ratio to total pixels.
 */
export function maskAreaFraction(maskCtx: MaskContext): number {
	let count = 0;
	for (let i = 0; i < maskCtx.data.length; i++) {
		if (maskCtx.data[i] > 127) count++;
	}
	return count / maskCtx.data.length;
}

/** GLSL smoothstep: Hermite interpolation clamped to [0,1]. */
export function glslSmoothstep(edge0: number, edge1: number, x: number): number {
	const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}
