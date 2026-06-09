import { describe, expect, it } from 'vitest';
import { bakeSolidNeighborData, type MaskContext } from '../container-shapes.js';

/**
 * Phase 1b (epic 0001): the baked neighbor-solidity texture must reproduce
 * exactly what the GLSL solidAt() probes computed per fragment — clamp to
 * [0,1], y-flip, NEAREST sampling, > 0.5 threshold — so the solver change is
 * behavior-identical.
 */

/** Reference port of the GLSL solidAt() helper for a CPU mask. */
function solidAtRef(solid: MaskContext, u: number, v: number): number {
	const cu = Math.min(1, Math.max(0, u));
	const cv = 1 - Math.min(1, Math.max(0, v));
	const px = Math.min(solid.width - 1, Math.max(0, Math.floor(cu * solid.width)));
	const py = Math.min(solid.height - 1, Math.max(0, Math.floor(cv * solid.height)));
	return solid.data[py * solid.width + px] > 127 ? 255 : 0;
}

function maskWithSolidRect(
	w: number,
	h: number,
	x0: number,
	y0: number,
	x1: number,
	y1: number
): MaskContext {
	const data = new Uint8Array(w * h);
	for (let y = y0; y < y1; y++) {
		for (let x = x0; x < x1; x++) {
			data[y * w + x] = 255;
		}
	}
	return { data, width: w, height: h };
}

describe('bakeSolidNeighborData', () => {
	it('packs (L, R, T, B) neighbor solidity per sim texel', () => {
		// 8×8 mask with a solid 2×2 block in mask pixels [3..5)×[3..5).
		// Mask rows are canvas-top-down (y-flip applies on sampling).
		const solid = maskWithSolidRect(8, 8, 3, 3, 5, 5);
		const simW = 8;
		const simH = 8;
		const baked = bakeSolidNeighborData(solid, simW, simH);

		for (let j = 0; j < simH; j++) {
			const v = (j + 0.5) / simH;
			for (let i = 0; i < simW; i++) {
				const u = (i + 0.5) / simW;
				const o = (j * simW + i) * 4;
				expect(baked[o]).toBe(solidAtRef(solid, u - 1 / simW, v));
				expect(baked[o + 1]).toBe(solidAtRef(solid, u + 1 / simW, v));
				expect(baked[o + 2]).toBe(solidAtRef(solid, u, v + 1 / simH));
				expect(baked[o + 3]).toBe(solidAtRef(solid, u, v - 1 / simH));
			}
		}
	});

	it('clamps out-of-domain neighbor samples like the GLSL clamp()', () => {
		// Solid column along the left mask edge: at sim texel i=0, the L
		// neighbor sample clamps back into the same (solid) column.
		const solid = maskWithSolidRect(8, 8, 0, 0, 1, 8);
		const baked = bakeSolidNeighborData(solid, 8, 8);
		const o = (4 * 8 + 0) * 4;
		expect(baked[o]).toBe(255); // L clamps into the solid edge column
		expect(baked[o + 1]).toBe(0); // R sample lands in open fluid
	});

	it('handles a sim grid finer than the mask without drift', () => {
		// Mask 4×4 with the bottom-right mask pixel solid; sim grid 16×16.
		// The y-flip means mask row 3 (canvas bottom) is UV v near 0.
		const solid = maskWithSolidRect(4, 4, 3, 3, 4, 4);
		const simW = 16;
		const simH = 16;
		const baked = bakeSolidNeighborData(solid, simW, simH);
		for (let j = 0; j < simH; j++) {
			const v = (j + 0.5) / simH;
			for (let i = 0; i < simW; i++) {
				const u = (i + 0.5) / simW;
				const o = (j * simW + i) * 4;
				expect(baked[o]).toBe(solidAtRef(solid, u - 1 / simW, v));
				expect(baked[o + 1]).toBe(solidAtRef(solid, u + 1 / simW, v));
				expect(baked[o + 2]).toBe(solidAtRef(solid, u, v + 1 / simH));
				expect(baked[o + 3]).toBe(solidAtRef(solid, u, v - 1 / simH));
			}
		}
	});

	it('returns all-fluid for an empty mask', () => {
		const solid: MaskContext = { data: new Uint8Array(16), width: 4, height: 4 };
		const baked = bakeSolidNeighborData(solid, 4, 4);
		expect(baked.every((b) => b === 0)).toBe(true);
	});
});
