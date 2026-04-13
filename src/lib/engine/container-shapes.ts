/*
 * svelte-fluid — container shape utilities
 *
 * Pure functions for container shape comparison and SDF evaluation.
 * The SDF functions are TypeScript mirrors of the GLSL in applyMaskShader
 * and the display shader's CONTAINER_MASK block, kept in sync by tests.
 */

import type { ContainerShape } from './types.js';

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
		return a.cx === b.cx && a.cy === b.cy && a.halfW === b.halfW && a.halfH === b.halfH;
	}
	return false;
}

/**
 * Evaluate the container mask at a UV coordinate. Returns 0–1 where
 * 1 = fluid allowed, 0 = fluid zeroed. Mirrors the GLSL applyMaskShader.
 *
 * @param shape - The container shape definition
 * @param uvX   - Horizontal UV coordinate (0 = left, 1 = right)
 * @param uvY   - Vertical UV coordinate (0 = bottom, 1 = top)
 * @param aspect - Canvas width / height
 */
export function containerMask(
	shape: ContainerShape,
	uvX: number,
	uvY: number,
	aspect: number
): number {
	switch (shape.type) {
		case 'circle':
			return circleMask(uvX, uvY, shape.cx, shape.cy, shape.radius, aspect);
		case 'frame':
			return frameMask(uvX, uvY, shape.cx, shape.cy, shape.halfW, shape.halfH);
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
 * Frame mask: 0 inside the inner rectangle, 1 outside, smooth edge.
 * The frame is the region between the canvas boundary and the inner cutout.
 *
 * Uses a box SDF (Chebyshev distance) in UV space — no aspect correction
 * because the rectangle is specified directly in UV coordinates.
 *
 * Matches the GLSL: `smoothstep(-0.005, 0.005, max(dx, dy))`
 */
function frameMask(
	uvX: number, uvY: number,
	cx: number, cy: number, halfW: number, halfH: number
): number {
	const dx = Math.abs(uvX - cx) - halfW;
	const dy = Math.abs(uvY - cy) - halfH;
	const d = Math.max(dx, dy);
	return glslSmoothstep(-0.005, 0.005, d);
}

/** GLSL smoothstep: Hermite interpolation clamped to [0,1]. */
export function glslSmoothstep(edge0: number, edge1: number, x: number): number {
	const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}
