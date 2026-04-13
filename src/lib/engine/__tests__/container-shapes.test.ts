import { describe, it, expect } from 'vitest';
import {
	containerShapeEqual,
	containerMask,
	glslSmoothstep,
	roundedRectSDF
} from '../container-shapes.js';
import type { ContainerShape } from '../types.js';

/* ------------------------------------------------------------------ */
/*                         glslSmoothstep                             */
/* ------------------------------------------------------------------ */

describe('glslSmoothstep', () => {
	it('returns 0 at the lower edge', () => {
		expect(glslSmoothstep(0, 1, 0)).toBe(0);
	});

	it('returns 1 at the upper edge', () => {
		expect(glslSmoothstep(0, 1, 1)).toBe(1);
	});

	it('returns 0.5 at the midpoint', () => {
		expect(glslSmoothstep(0, 1, 0.5)).toBe(0.5);
	});

	it('clamps below the lower edge', () => {
		expect(glslSmoothstep(0, 1, -5)).toBe(0);
	});

	it('clamps above the upper edge', () => {
		expect(glslSmoothstep(0, 1, 10)).toBe(1);
	});
});

/* ------------------------------------------------------------------ */
/*                       containerShapeEqual                          */
/* ------------------------------------------------------------------ */

describe('containerShapeEqual', () => {
	// --- null / undefined ---
	it('null === null', () => {
		expect(containerShapeEqual(null, null)).toBe(true);
	});

	it('undefined === undefined', () => {
		expect(containerShapeEqual(undefined, undefined)).toBe(true);
	});

	it('null !== circle', () => {
		expect(containerShapeEqual(null, { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 })).toBe(false);
	});

	it('circle !== null', () => {
		expect(containerShapeEqual({ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 }, null)).toBe(false);
	});

	// --- circle ---
	it('identical circles are equal', () => {
		const c: ContainerShape = { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 };
		expect(containerShapeEqual(c, { ...c })).toBe(true);
	});

	it('different circle radii are not equal', () => {
		const a: ContainerShape = { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 };
		const b: ContainerShape = { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.40 };
		expect(containerShapeEqual(a, b)).toBe(false);
	});

	it('same reference is equal', () => {
		const c: ContainerShape = { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 };
		expect(containerShapeEqual(c, c)).toBe(true);
	});

	// --- frame ---
	it('identical frames are equal', () => {
		const f: ContainerShape = { type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.2, halfH: 0.15 };
		expect(containerShapeEqual(f, { ...f })).toBe(true);
	});

	it('different frame halfW are not equal', () => {
		const a: ContainerShape = { type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.2, halfH: 0.15 };
		const b: ContainerShape = { type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.3, halfH: 0.15 };
		expect(containerShapeEqual(a, b)).toBe(false);
	});

	it('different frame halfH are not equal', () => {
		const a: ContainerShape = { type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.2, halfH: 0.15 };
		const b: ContainerShape = { type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.2, halfH: 0.25 };
		expect(containerShapeEqual(a, b)).toBe(false);
	});

	it('frame with cornerRadius=0 equals frame without cornerRadius', () => {
		const a: ContainerShape = { type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.2, halfH: 0.15, cornerRadius: 0 };
		const b: ContainerShape = { type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.2, halfH: 0.15 };
		expect(containerShapeEqual(a, b)).toBe(true);
	});

	it('frames with different cornerRadius are not equal', () => {
		const a: ContainerShape = { type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.2, halfH: 0.15, cornerRadius: 0.05 };
		const b: ContainerShape = { type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.2, halfH: 0.15, cornerRadius: 0.10 };
		expect(containerShapeEqual(a, b)).toBe(false);
	});

	it('frames with same cornerRadius are equal', () => {
		const a: ContainerShape = { type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.2, halfH: 0.15, cornerRadius: 0.05 };
		const b: ContainerShape = { type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.2, halfH: 0.15, cornerRadius: 0.05 };
		expect(containerShapeEqual(a, b)).toBe(true);
	});

	// --- cross-type ---
	it('circle !== frame', () => {
		const circle: ContainerShape = { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 };
		const frame: ContainerShape = { type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.2, halfH: 0.2 };
		expect(containerShapeEqual(circle, frame)).toBe(false);
	});

	it('null !== frame', () => {
		const frame: ContainerShape = { type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.2, halfH: 0.2 };
		expect(containerShapeEqual(null, frame)).toBe(false);
	});
});

/* ------------------------------------------------------------------ */
/*                    containerMask — circle (regression)             */
/* ------------------------------------------------------------------ */

describe('containerMask — circle', () => {
	const circle: ContainerShape = { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 };
	const aspect = 1.0; // square canvas

	it('returns 1 at the center', () => {
		expect(containerMask(circle, 0.5, 0.5, aspect)).toBe(1);
	});

	it('returns 1 well inside the circle', () => {
		expect(containerMask(circle, 0.5, 0.7, aspect)).toBe(1);
	});

	it('returns 0 well outside the circle', () => {
		expect(containerMask(circle, 0.0, 0.0, aspect)).toBe(0);
	});

	it('returns ~0.5 right at the radius boundary', () => {
		// At exactly d = radius, smoothstep midpoint
		const val = containerMask(circle, 0.5 + 0.4, 0.5, aspect);
		expect(val).toBeCloseTo(0.5, 1);
	});

	it('handles non-square aspect ratios', () => {
		// 2:1 aspect — x=0.7 is 0.2 UV units right of center, but 0.4 physical
		// distance due to aspect=2, which equals the radius → ~0.5
		const val = containerMask(circle, 0.7, 0.5, 2.0);
		expect(val).toBeCloseTo(0.5, 1);
	});

	it('returns 0 at canvas corners', () => {
		expect(containerMask(circle, 0, 0, aspect)).toBe(0);
		expect(containerMask(circle, 1, 0, aspect)).toBe(0);
		expect(containerMask(circle, 0, 1, aspect)).toBe(0);
		expect(containerMask(circle, 1, 1, aspect)).toBe(0);
	});
});

/* ------------------------------------------------------------------ */
/*                     containerMask — frame (TDD)                    */
/* ------------------------------------------------------------------ */

describe('containerMask — frame', () => {
	// Centered frame with inner cutout: 40% width x 30% height
	const frame: ContainerShape = { type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.2, halfH: 0.15 };
	const aspect = 1.0;

	it('returns 0 at the center (inside inner rect)', () => {
		expect(containerMask(frame, 0.5, 0.5, aspect)).toBe(0);
	});

	it('returns 0 well inside the inner rect', () => {
		// (0.55, 0.55) is inside: |0.55-0.5|=0.05 < 0.2 and 0.05 < 0.15
		expect(containerMask(frame, 0.55, 0.55, aspect)).toBe(0);
	});

	it('returns 1 well outside the inner rect (in the frame region)', () => {
		// (0.05, 0.05) is far outside the inner rect
		expect(containerMask(frame, 0.05, 0.05, aspect)).toBe(1);
	});

	it('returns 1 at canvas corners (outside inner rect)', () => {
		expect(containerMask(frame, 0, 0, aspect)).toBe(1);
		expect(containerMask(frame, 1, 0, aspect)).toBe(1);
		expect(containerMask(frame, 0, 1, aspect)).toBe(1);
		expect(containerMask(frame, 1, 1, aspect)).toBe(1);
	});

	it('returns ~0.5 at the inner rect boundary', () => {
		// Right edge of inner rect: x=0.5+0.2=0.7, y=0.5 (centered vertically)
		// dx = |0.7 - 0.5| - 0.2 = 0, dy = |0.5 - 0.5| - 0.15 = -0.15
		// d = max(0, -0.15) = 0 → smoothstep(-0.005, 0.005, 0) = 0.5
		const val = containerMask(frame, 0.7, 0.5, aspect);
		expect(val).toBeCloseTo(0.5, 1);
	});

	it('returns ~0.5 at top boundary of inner rect', () => {
		// Top edge: y=0.5+0.15=0.65, x=0.5 (centered horizontally)
		// dy = |0.65 - 0.5| - 0.15 = 0, dx = -0.2 → d = max(-0.2, 0) = 0
		const val = containerMask(frame, 0.5, 0.65, aspect);
		expect(val).toBeCloseTo(0.5, 1);
	});

	it('is independent of aspect ratio (rectangle in UV space)', () => {
		// Frame SDF operates in UV space, not physical space
		const val1 = containerMask(frame, 0.7, 0.5, 1.0);
		const val2 = containerMask(frame, 0.7, 0.5, 2.0);
		expect(val1).toBeCloseTo(val2, 5);
	});

	it('works with off-center frame', () => {
		const offCenter: ContainerShape = {
			type: 'frame', cx: 0.3, cy: 0.7, halfW: 0.1, halfH: 0.1
		};
		// Center of inner rect at (0.3, 0.7) → should be 0
		expect(containerMask(offCenter, 0.3, 0.7, aspect)).toBe(0);
		// Far from inner rect → should be 1
		expect(containerMask(offCenter, 0.9, 0.1, aspect)).toBe(1);
	});

	it('returns 1 just outside the inner rect border', () => {
		// 0.02 past the right edge: x = 0.72
		// dx = |0.72-0.5| - 0.2 = 0.02, dy = -0.15 → d = 0.02 >> 0.005
		const val = containerMask(frame, 0.72, 0.5, aspect);
		expect(val).toBeCloseTo(1.0, 2);
	});

	it('returns 0 just inside the inner rect border', () => {
		// 0.02 inside the right edge: x = 0.68
		// dx = |0.68-0.5| - 0.2 = -0.02, dy = -0.15 → d = -0.02 << -0.005
		const val = containerMask(frame, 0.68, 0.5, aspect);
		expect(val).toBeCloseTo(0.0, 2);
	});
});

/* ------------------------------------------------------------------ */
/*            containerMask — frame with cornerRadius                 */
/* ------------------------------------------------------------------ */

describe('containerMask — frame with cornerRadius', () => {
	// Centered frame with rounded inner cutout: 40% width x 30% height, corner radius 0.05
	const frameRounded: ContainerShape = {
		type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.2, halfH: 0.15, cornerRadius: 0.05
	};
	const aspect = 1.0;

	it('returns 0 at the center (inside inner rounded rect)', () => {
		expect(containerMask(frameRounded, 0.5, 0.5, aspect)).toBe(0);
	});

	it('returns 1 well outside the inner rect (in the frame region)', () => {
		expect(containerMask(frameRounded, 0.05, 0.05, aspect)).toBe(1);
	});

	it('returns 1 at canvas corners', () => {
		expect(containerMask(frameRounded, 0, 0, aspect)).toBe(1);
		expect(containerMask(frameRounded, 1, 1, aspect)).toBe(1);
	});

	it('returns ~0.5 at the flat edge boundary (right side)', () => {
		// Right edge midpoint: x = 0.5 + 0.2 = 0.7, y = 0.5
		const val = containerMask(frameRounded, 0.7, 0.5, aspect);
		expect(val).toBeCloseTo(0.5, 1);
	});

	it('bounding-box corner is outside the mask (rounded off)', () => {
		// The exact corner of the inner bounding box (0.7, 0.65) is outside
		// the rounded inner cutout, so the frame mask should be ~1 there
		// (fluid is allowed because the cutout corner is rounded away).
		const val = containerMask(frameRounded, 0.7, 0.65, aspect);
		expect(val).toBeCloseTo(1.0, 1);
	});

	it('without cornerRadius, bounding-box corner is inside the cutout', () => {
		// Same position with sharp-cornered frame: should be ~0.5 (on the edge)
		const frameSharp: ContainerShape = {
			type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.2, halfH: 0.15
		};
		const val = containerMask(frameSharp, 0.7, 0.65, aspect);
		expect(val).toBeCloseTo(0.5, 1);
	});
});

/* ------------------------------------------------------------------ */
/*                      roundedRectSDF (unit)                         */
/* ------------------------------------------------------------------ */

describe('roundedRectSDF', () => {
	// Centered rounded rect: 40% wide x 30% tall, corner radius 0.05
	const cx = 0.5, cy = 0.5, halfW = 0.2, halfH = 0.15, cr = 0.05;
	const aspect = 1.0;

	it('returns 1 at the center', () => {
		expect(roundedRectSDF(0.5, 0.5, cx, cy, halfW, halfH, cr, aspect)).toBe(1);
	});

	it('returns 1 well inside the rect', () => {
		expect(roundedRectSDF(0.55, 0.55, cx, cy, halfW, halfH, cr, aspect)).toBe(1);
	});

	it('returns 0 well outside the rect', () => {
		expect(roundedRectSDF(0.0, 0.0, cx, cy, halfW, halfH, cr, aspect)).toBe(0);
	});

	it('returns ~0.5 at the flat edge boundary (right side)', () => {
		// Right edge: x = 0.5 + 0.2 = 0.7, y = 0.5 (centered)
		// dx = |0.7-0.5| - 0.2 + 0.05 = 0.05, dy = |0.5-0.5| - 0.15 + 0.05 = -0.10
		// outsideDist = sqrt(0.05^2 + 0) = 0.05, insideDist = min(max(0.05,-0.10),0) = 0
		// d = 0.05 - 0.05 = 0 → smoothstep midpoint → ~0.5
		const val = roundedRectSDF(0.7, 0.5, cx, cy, halfW, halfH, cr, aspect);
		expect(val).toBeCloseTo(0.5, 1);
	});

	it('returns ~0.5 at the flat edge boundary (top side)', () => {
		// Top edge: y = 0.5 + 0.15 = 0.65, x = 0.5
		const val = roundedRectSDF(0.5, 0.65, cx, cy, halfW, halfH, cr, aspect);
		expect(val).toBeCloseTo(0.5, 1);
	});

	it('returns 0 at corners outside the rounding', () => {
		// The exact corner of the bounding box (0.7, 0.65) is outside
		// because the corner is rounded. The corner radius cuts it off.
		// dx = 0.05, dy = 0.05 → outsideDist = sqrt(0.05^2+0.05^2) ≈ 0.0707
		// d = 0.0707 - 0.05 ≈ 0.0207 >> 0.005 → mask ≈ 0
		const val = roundedRectSDF(0.7, 0.65, cx, cy, halfW, halfH, cr, aspect);
		expect(val).toBeCloseTo(0.0, 1);
	});

	it('returns 0 at canvas corners', () => {
		expect(roundedRectSDF(0, 0, cx, cy, halfW, halfH, cr, aspect)).toBe(0);
		expect(roundedRectSDF(1, 0, cx, cy, halfW, halfH, cr, aspect)).toBe(0);
		expect(roundedRectSDF(0, 1, cx, cy, halfW, halfH, cr, aspect)).toBe(0);
		expect(roundedRectSDF(1, 1, cx, cy, halfW, halfH, cr, aspect)).toBe(0);
	});

	it('is independent of aspect ratio (operates in UV space)', () => {
		const val1 = roundedRectSDF(0.6, 0.55, cx, cy, halfW, halfH, cr, 1.0);
		const val2 = roundedRectSDF(0.6, 0.55, cx, cy, halfW, halfH, cr, 2.0);
		expect(val1).toBeCloseTo(val2, 5);
	});
});

/* ------------------------------------------------------------------ */
/*                containerShapeEqual — roundedRect                   */
/* ------------------------------------------------------------------ */

describe('containerShapeEqual — roundedRect', () => {
	it('identical roundedRects are equal', () => {
		const a: ContainerShape = { type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.3, halfH: 0.2, cornerRadius: 0.05 };
		expect(containerShapeEqual(a, { ...a })).toBe(true);
	});

	it('same reference is equal', () => {
		const a: ContainerShape = { type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.3, halfH: 0.2, cornerRadius: 0.05 };
		expect(containerShapeEqual(a, a)).toBe(true);
	});

	it('different cornerRadius are not equal', () => {
		const a: ContainerShape = { type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.3, halfH: 0.2, cornerRadius: 0.05 };
		const b: ContainerShape = { type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.3, halfH: 0.2, cornerRadius: 0.10 };
		expect(containerShapeEqual(a, b)).toBe(false);
	});

	it('different halfW are not equal', () => {
		const a: ContainerShape = { type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.3, halfH: 0.2, cornerRadius: 0.05 };
		const b: ContainerShape = { type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.4, halfH: 0.2, cornerRadius: 0.05 };
		expect(containerShapeEqual(a, b)).toBe(false);
	});

	it('roundedRect !== circle', () => {
		const rr: ContainerShape = { type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.3, halfH: 0.2, cornerRadius: 0.05 };
		const c: ContainerShape = { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 };
		expect(containerShapeEqual(rr, c)).toBe(false);
	});

	it('roundedRect !== frame', () => {
		const rr: ContainerShape = { type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.3, halfH: 0.2, cornerRadius: 0.05 };
		const f: ContainerShape = { type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.3, halfH: 0.2 };
		expect(containerShapeEqual(rr, f)).toBe(false);
	});

	it('null !== roundedRect', () => {
		const rr: ContainerShape = { type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.3, halfH: 0.2, cornerRadius: 0.05 };
		expect(containerShapeEqual(null, rr)).toBe(false);
	});
});

/* ------------------------------------------------------------------ */
/*                  containerMask — roundedRect                       */
/* ------------------------------------------------------------------ */

describe('containerMask — roundedRect', () => {
	const rr: ContainerShape = { type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.2, halfH: 0.15, cornerRadius: 0.05 };
	const aspect = 1.0;

	it('returns 1 at the center', () => {
		expect(containerMask(rr, 0.5, 0.5, aspect)).toBe(1);
	});

	it('returns 0 well outside the rect', () => {
		expect(containerMask(rr, 0.0, 0.0, aspect)).toBe(0);
	});

	it('returns ~0.5 at the flat edge boundary', () => {
		const val = containerMask(rr, 0.7, 0.5, aspect);
		expect(val).toBeCloseTo(0.5, 1);
	});

	it('returns 0 at the bounding-box corner (rounded off)', () => {
		// The corner (0.7, 0.65) is cut by the rounding
		const val = containerMask(rr, 0.7, 0.65, aspect);
		expect(val).toBeCloseTo(0.0, 1);
	});

	it('returns 0 at canvas corners', () => {
		expect(containerMask(rr, 0, 0, aspect)).toBe(0);
		expect(containerMask(rr, 1, 1, aspect)).toBe(0);
	});

	it('delegates correctly (matches roundedRectSDF directly)', () => {
		const direct = roundedRectSDF(0.6, 0.55, 0.5, 0.5, 0.2, 0.15, 0.05, aspect);
		const viaContainer = containerMask(rr, 0.6, 0.55, aspect);
		expect(viaContainer).toBe(direct);
	});
});
