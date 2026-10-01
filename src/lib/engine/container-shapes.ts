/*
 * svelte-fluid — container shape utilities
 *
 * Pure CPU-side shape-mask evaluation for rejection sampling and mask baking.
 */

import type { ContainerShape } from './types.js';

/**
 * CPU-side mask data for svgPath shapes, used for rejection sampling
 * during automatic splat spawning. The engine rasterizes the SVG path into
 * this array and passes it through to containerMask().
 */
export interface MaskContext {
	data: Uint8Array;
	width: number;
	height: number;
}

/**
 * Evaluate the container mask at a UV coordinate. Returns 0–1 where
 * 1 = fluid allowed, 0 = fluid zeroed. Mirrors the GPU mask pass.
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
				shape.innerCornerRadius, shape.outerHalfW, shape.outerHalfH, shape.outerCornerRadius, aspect);
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
 * Matches the WGSL expression: `1.0 - smoothstep(radius - 0.005, radius + 0.005, length(p))`.
 */
function circleMask(
	uvX: number, uvY: number,
	cx: number, cy: number, radius: number, aspect: number
): number {
	const px = (uvX - cx) * aspect;
	const py = uvY - cy;
	const d = Math.sqrt(px * px + py * py);
	return 1.0 - shaderSmoothstep(radius - 0.005, radius + 0.005, d);
}

/**
 * Frame mask: fluid fills the region between an inner and outer rectangle.
 * Returns 0 inside the inner cutout, 0 outside the outer boundary, 1 in the frame region.
 *
 * Both inner and outer boundaries support rounded corners via their respective
 * corner radius params. Uses the Inigo Quilez rounded-box SDF when radius > 0.
 *
 * Rounded corners are aspect-corrected so they appear circular in physical
 * space (like CSS border-radius), not elliptical due to non-square UV space.
 * Sharp corners (radius = 0) use L∞ distance and need no correction.
 *
 * When outer params are omitted (defaults: outerHalfW=0.5, outerHalfH=0.5,
 * outerCornerRadius=0), the outer boundary covers the full canvas.
 */
function frameMask(
	uvX: number, uvY: number,
	cx: number, cy: number, halfW: number, halfH: number,
	innerCornerRadius?: number,
	outerHalfW?: number, outerHalfH?: number, outerCornerRadius?: number,
	aspect?: number
): number {
	const a = aspect ?? 1;

	// Inner mask: 0 inside inner rect, 1 outside
	const icr = innerCornerRadius ?? 0;
	let innerMask: number;
	if (icr > 0) {
		const px = (uvX - cx) * a;
		const py = uvY - cy;
		const dx = Math.abs(px) - halfW * a + icr;
		const dy = Math.abs(py) - halfH + icr;
		const outsideDist = Math.sqrt(Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2);
		const insideDist = Math.min(Math.max(dx, dy), 0);
		const dist = outsideDist + insideDist - icr;
		innerMask = shaderSmoothstep(-0.005, 0.005, dist);
	} else {
		const dx = Math.abs(uvX - cx) - halfW;
		const dy = Math.abs(uvY - cy) - halfH;
		innerMask = shaderSmoothstep(-0.005, 0.005, Math.max(dx, dy));
	}

	// Outer mask: 1 inside outer rect, 0 outside
	const ohw = outerHalfW ?? 0.5;
	const ohh = outerHalfH ?? 0.5;
	const ocr = outerCornerRadius ?? 0;
	let outerMask: number;
	if (ocr > 0) {
		const px = (uvX - cx) * a;
		const py = uvY - cy;
		const dx = Math.abs(px) - ohw * a + ocr;
		const dy = Math.abs(py) - ohh + ocr;
		const outsideDist = Math.sqrt(Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2);
		const insideDist = Math.min(Math.max(dx, dy), 0);
		const dist = outsideDist + insideDist - ocr;
		outerMask = 1.0 - shaderSmoothstep(-0.005, 0.005, dist);
	} else {
		const dx = Math.abs(uvX - cx) - ohw;
		const dy = Math.abs(uvY - cy) - ohh;
		outerMask = 1.0 - shaderSmoothstep(-0.005, 0.005, Math.max(dx, dy));
	}

	return innerMask * outerMask;
}

/**
 * Rounded-rect mask: 1 inside the rounded rectangle, 0 outside, smooth edge.
 * Uses the Inigo Quilez rounded-box SDF:
 *   d = length(max(abs(p - center) - halfSize + cornerRadius, 0)) - cornerRadius
 *
 * Aspect-corrected so corners are circular in physical space (like CSS
 * border-radius). The corner radius is in height-normalized units.
 */
export function roundedRectSDF(
	uvX: number, uvY: number,
	cx: number, cy: number,
	halfW: number, halfH: number,
	cornerRadius: number,
	aspect: number
): number {
	const px = (uvX - cx) * aspect;
	const py = uvY - cy;
	const dx = Math.abs(px) - halfW * aspect + cornerRadius;
	const dy = Math.abs(py) - halfH + cornerRadius;
	const outsideDist = Math.sqrt(Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2);
	const insideDist = Math.min(Math.max(dx, dy), 0);
	const d = outsideDist + insideDist - cornerRadius;
	return 1.0 - shaderSmoothstep(-0.005, 0.005, d);
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
	return 1.0 - shaderSmoothstep(-0.005, 0.005, sdf);
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

/**
 * Sample the combined obstruction mask at a UV coordinate. Returns 0–1 where
 * 1 = fully blocked (fluid rejected), 0 = unobstructed. Mirrors svgPathMask's
 * texel logic (Y-flip, floor, edge clamp). Returns 0 when no maskCtx exists.
 */
export function obstructionMask(uvX: number, uvY: number, ctx?: MaskContext): number {
	if (!ctx) return 0;
	const { data, width, height } = ctx;
	const px = Math.floor(uvX * (width - 1));
	const py = Math.floor((1 - uvY) * (height - 1));
	const cx = Math.max(0, Math.min(width - 1, px));
	const cy = Math.max(0, Math.min(height - 1, py));
	return data[cy * width + cx] / 255;
}

/** Shader smoothstep: Hermite interpolation clamped to [0,1]. */
export function shaderSmoothstep(edge0: number, edge1: number, x: number): number {
	const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

/**
 * Convert a grid whose solid cells are already zero into an exact, capped
 * Chebyshev distance field. This lower-level form avoids resampling or changing
 * row orientation when the caller already owns a simulation-aligned mask.
 */
export function bakeChebyshevDistanceField(
	seeded: Uint8Array,
	width: number,
	height: number
): Uint8Array {
	if (seeded.length !== width * height) {
		throw new Error('svelte-fluid: solid-clearance seed size does not match its extent');
	}
	const out = new Uint8Array(seeded);

	// Unit-weight 8-neighbor chamfer passes are the exact L-infinity distance
	// transform on this Cartesian grid.
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = y * width + x;
			let d = out[i];
			if (x > 0) d = Math.min(d, out[i - 1] + 1);
			if (y > 0) {
				d = Math.min(d, out[i - width] + 1);
				if (x > 0) d = Math.min(d, out[i - width - 1] + 1);
				if (x + 1 < width) d = Math.min(d, out[i - width + 1] + 1);
			}
			out[i] = Math.min(255, d);
		}
	}
	for (let y = height - 1; y >= 0; y--) {
		for (let x = width - 1; x >= 0; x--) {
			const i = y * width + x;
			let d = out[i];
			if (x + 1 < width) d = Math.min(d, out[i + 1] + 1);
			if (y + 1 < height) {
				d = Math.min(d, out[i + width] + 1);
				if (x > 0) d = Math.min(d, out[i + width - 1] + 1);
				if (x + 1 < width) d = Math.min(d, out[i + width + 1] + 1);
			}
			out[i] = Math.min(255, d);
		}
	}

	return out;
}
