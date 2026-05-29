import { describe, it, expect } from 'vitest';
import { obstructionsEqual, obstructionMask } from '../container-shapes.js';
import type { MaskContext } from '../container-shapes.js';
import type { Obstruction } from '../types.js';

/* ------------------------------------------------------------------ */
/*                       obstructionsEqual                            */
/* ------------------------------------------------------------------ */

describe('obstructionsEqual', () => {
	// --- null / undefined / empty are all the "no obstructions" state ---
	it('both null returns true', () => {
		expect(obstructionsEqual(null, null)).toBe(true);
	});

	it('both undefined returns true', () => {
		expect(obstructionsEqual(undefined, undefined)).toBe(true);
	});

	it('null vs undefined returns true', () => {
		expect(obstructionsEqual(null, undefined)).toBe(true);
	});

	it('null vs empty array returns true', () => {
		expect(obstructionsEqual(null, [])).toBe(true);
	});

	it('undefined vs empty array returns true', () => {
		expect(obstructionsEqual(undefined, [])).toBe(true);
	});

	it('two empty arrays return true', () => {
		expect(obstructionsEqual([], [])).toBe(true);
	});

	// --- null/empty vs populated ---
	it('null vs single obstruction returns false', () => {
		expect(obstructionsEqual(null, [{ d: 'M0 0 L10 10' }])).toBe(false);
	});

	it('single obstruction vs null returns false', () => {
		expect(obstructionsEqual([{ d: 'M0 0 L10 10' }], null)).toBe(false);
	});

	it('empty array vs single obstruction returns false', () => {
		expect(obstructionsEqual([], [{ d: 'M0 0 L10 10' }])).toBe(false);
	});

	// --- length mismatch ---
	it('arrays of differing length return false', () => {
		const a: Obstruction[] = [{ d: 'M0 0' }];
		const b: Obstruction[] = [{ d: 'M0 0' }, { d: 'M1 1' }];
		expect(obstructionsEqual(a, b)).toBe(false);
	});

	// --- same content ---
	it('same single path returns true', () => {
		const a: Obstruction[] = [{ d: 'M0 0 L100 100' }];
		const b: Obstruction[] = [{ d: 'M0 0 L100 100' }];
		expect(obstructionsEqual(a, b)).toBe(true);
	});

	it('same reference returns true', () => {
		const a: Obstruction[] = [{ d: 'M0 0 L100 100' }];
		expect(obstructionsEqual(a, a)).toBe(true);
	});

	// --- field differences ---
	it('different d returns false', () => {
		expect(obstructionsEqual([{ d: 'M0 0' }], [{ d: 'M1 1' }])).toBe(false);
	});

	it('different text returns false', () => {
		expect(obstructionsEqual([{ text: 'A' }], [{ text: 'B' }])).toBe(false);
	});

	it('different font returns false', () => {
		expect(obstructionsEqual(
			[{ text: 'A', font: 'bold 72px sans-serif' }],
			[{ text: 'A', font: 'bold 100px sans-serif' }]
		)).toBe(false);
	});

	it('different fillRule returns false', () => {
		expect(obstructionsEqual(
			[{ d: 'M0 0', fillRule: 'nonzero' }],
			[{ d: 'M0 0', fillRule: 'evenodd' }]
		)).toBe(false);
	});

	it('different scale returns false', () => {
		expect(obstructionsEqual(
			[{ d: 'M0 0', scale: 1 }],
			[{ d: 'M0 0', scale: 2 }]
		)).toBe(false);
	});

	it('different fit returns false', () => {
		expect(obstructionsEqual(
			[{ d: 'M0 0', fit: 'contain' }],
			[{ d: 'M0 0', fit: 'fill' }]
		)).toBe(false);
	});

	it('fit default contain equals omitted fit', () => {
		expect(obstructionsEqual(
			[{ d: 'M0 0' }],
			[{ d: 'M0 0', fit: 'contain' }]
		)).toBe(true);
	});

	it('different offset.x returns false', () => {
		expect(obstructionsEqual(
			[{ d: 'M0 0', offset: { x: 0.1, y: 0 } }],
			[{ d: 'M0 0', offset: { x: 0.2, y: 0 } }]
		)).toBe(false);
	});

	it('different offset.y returns false', () => {
		expect(obstructionsEqual(
			[{ d: 'M0 0', offset: { x: 0, y: 0.1 } }],
			[{ d: 'M0 0', offset: { x: 0, y: 0.2 } }]
		)).toBe(false);
	});

	it('different viewBox returns false', () => {
		expect(obstructionsEqual(
			[{ d: 'M0 0', viewBox: [0, 0, 100, 100] }],
			[{ d: 'M0 0', viewBox: [0, 0, 200, 200] }]
		)).toBe(false);
	});

	// --- default equivalence ---
	it('bare {d} equals fully-defaulted form', () => {
		const a: Obstruction[] = [{ d: 'M0 0 L100 100' }];
		const b: Obstruction[] = [{
			d: 'M0 0 L100 100',
			font: '',
			fillRule: 'nonzero',
			scale: 1,
			offset: { x: 0, y: 0 },
			viewBox: [0, 0, 100, 100]
		}];
		expect(obstructionsEqual(a, b)).toBe(true);
	});

	it('omitted offset equals explicit {0,0}', () => {
		expect(obstructionsEqual(
			[{ d: 'M0 0' }],
			[{ d: 'M0 0', offset: { x: 0, y: 0 } }]
		)).toBe(true);
	});

	it('omitted scale equals explicit 1', () => {
		expect(obstructionsEqual(
			[{ d: 'M0 0' }],
			[{ d: 'M0 0', scale: 1 }]
		)).toBe(true);
	});

	// --- multi-element arrays ---
	it('two-element arrays with all matching elements return true', () => {
		const a: Obstruction[] = [{ d: 'M0 0' }, { text: 'X' }];
		const b: Obstruction[] = [{ d: 'M0 0' }, { text: 'X' }];
		expect(obstructionsEqual(a, b)).toBe(true);
	});

	it('two-element arrays with one differing element return false', () => {
		const a: Obstruction[] = [{ d: 'M0 0' }, { text: 'X' }];
		const b: Obstruction[] = [{ d: 'M0 0' }, { text: 'Y' }];
		expect(obstructionsEqual(a, b)).toBe(false);
	});

	it('order matters: swapped elements return false', () => {
		const a: Obstruction[] = [{ d: 'M0 0' }, { d: 'M1 1' }];
		const b: Obstruction[] = [{ d: 'M1 1' }, { d: 'M0 0' }];
		expect(obstructionsEqual(a, b)).toBe(false);
	});
});

/* ------------------------------------------------------------------ */
/*                  obstructionMask — CPU sampler                     */
/* ------------------------------------------------------------------ */

describe('obstructionMask — CPU sampler', () => {
	// 4x4 mask: top-left quadrant filled (255), rest empty.
	// maskData row 0 = uvY=1 (top), row 3 = uvY=0 (bottom), matching the
	// engine's Y-flipped rasterization. "Top-left quadrant filled" means
	// rows 0-1, cols 0-1 = 255.
	const maskData = new Uint8Array([
		255, 255, 0, 0,
		255, 255, 0, 0,
		0, 0, 0, 0,
		0, 0, 0, 0
	]);
	const ctx: MaskContext = { data: maskData, width: 4, height: 4 };

	it('returns 0 without a maskCtx', () => {
		expect(obstructionMask(0.5, 0.5, undefined)).toBe(0);
	});

	it('returns 1 in the filled region (top-left in UV space)', () => {
		// UV (0.1, 0.9) → pixel col 0, row 0 → top-left → 255 → 1
		expect(obstructionMask(0.1, 0.9, ctx)).toBe(1);
	});

	it('returns 0 in the empty region (bottom-right in UV space)', () => {
		// UV (0.9, 0.1) → bottom-right → 0
		expect(obstructionMask(0.9, 0.1, ctx)).toBe(0);
	});

	it('Y-flip: top-left UV maps to data row 0 (filled)', () => {
		// uvY=0.9 (near top) → py = floor((1-0.9)*3) = floor(0.3) = 0 → row 0
		expect(obstructionMask(0.0, 0.9, ctx)).toBe(1);
	});

	it('Y-flip: bottom-left UV maps to data bottom rows (empty)', () => {
		// uvY=0.1 (near bottom) → py = floor((1-0.1)*3) = floor(2.7) = 2 → row 2
		expect(obstructionMask(0.0, 0.1, ctx)).toBe(0);
	});

	it('top-right UV is empty (only left columns filled)', () => {
		// UV (0.9, 0.9) → col floor(0.9*3)=2, row 0 → empty
		expect(obstructionMask(0.9, 0.9, ctx)).toBe(0);
	});

	it('edge clamp: UV at the extreme corners stays in bounds', () => {
		// uvX=0,uvY=1 → col 0, row 0 → filled
		expect(obstructionMask(0, 1, ctx)).toBe(1);
		// uvX=1,uvY=1 → col 3, row 0 → empty
		expect(obstructionMask(1, 1, ctx)).toBe(0);
		// uvX=1,uvY=0 → col 3, row 3 → empty
		expect(obstructionMask(1, 0, ctx)).toBe(0);
		// uvX=0,uvY=0 → col 0, row 3 → empty
		expect(obstructionMask(0, 0, ctx)).toBe(0);
	});

	it('edge clamp: out-of-range UV is clamped, never indexes outside data', () => {
		// Negative / >1 UV must clamp rather than read garbage or NaN
		expect(obstructionMask(-0.5, 1.5, ctx)).toBe(1); // clamps to col 0, row 0
		expect(obstructionMask(1.5, -0.5, ctx)).toBe(0); // clamps to col 3, row 3
		expect(Number.isNaN(obstructionMask(2, 2, ctx))).toBe(false);
	});

	it('returns fractional value for a partially filled texel', () => {
		// A single mid-gray texel (128) → 128/255 ≈ 0.502
		const grayData = new Uint8Array(16).fill(0);
		grayData[0] = 128; // row 0, col 0
		const grayCtx: MaskContext = { data: grayData, width: 4, height: 4 };
		expect(obstructionMask(0.0, 1.0, grayCtx)).toBeCloseTo(128 / 255, 5);
	});

	it('matches svgPathMask texel logic on the same data (parity)', () => {
		// obstructionMask mirrors the private svgPathMask sampler; verify a
		// representative set of UV points yields identical reads.
		const points: Array<[number, number]> = [
			[0.1, 0.9], [0.9, 0.1], [0.5, 0.5], [0.0, 1.0], [1.0, 0.0]
		];
		for (const [u, v] of points) {
			const px = Math.floor(u * (ctx.width - 1));
			const py = Math.floor((1 - v) * (ctx.height - 1));
			const cx = Math.max(0, Math.min(ctx.width - 1, px));
			const cy = Math.max(0, Math.min(ctx.height - 1, py));
			const expected = ctx.data[cy * ctx.width + cx] / 255;
			expect(obstructionMask(u, v, ctx)).toBe(expected);
		}
	});
});

/* ------------------------------------------------------------------ */
/*              combined-mask math (GLSL applyMask mirror)            */
/* ------------------------------------------------------------------ */

describe('combined obstruction mask math (shader mirror)', () => {
	/**
	 * Mirror of the GLSL combine in applyMaskShader / glassShaderSource:
	 *   mask = clamp(containerMask, 0, 1) * (1 - obstruct)
	 * where containerMask is the (already 0–1) container value and obstruct
	 * is the sampled obstruction mask. allowed = container × (1 − obstruction).
	 */
	function combinedMask(containerMaskVal: number, obstruct: number): number {
		const c = Math.max(0, Math.min(1, containerMaskVal));
		return c * (1.0 - obstruct);
	}

	it('container=1, obstruct=1 → 0 (fully blocked by obstruction)', () => {
		expect(combinedMask(1, 1)).toBeCloseTo(0, 6);
	});

	it('container=1, obstruct=0 → 1 (unobstructed inside container)', () => {
		expect(combinedMask(1, 0)).toBeCloseTo(1, 6);
	});

	it('container=0, obstruct=0 → 0 (outside container)', () => {
		expect(combinedMask(0, 0)).toBeCloseTo(0, 6);
	});

	it('container=0, obstruct=1 → 0 (outside container and blocked)', () => {
		expect(combinedMask(0, 1)).toBeCloseTo(0, 6);
	});

	it('container=1, obstruct=0.5 → 0.5 (partial obstruction edge)', () => {
		expect(combinedMask(1, 0.5)).toBeCloseTo(0.5, 6);
	});

	it('container=0.5, obstruct=0 → 0.5 (container edge, no obstruction)', () => {
		expect(combinedMask(0.5, 0)).toBeCloseTo(0.5, 6);
	});

	it('clamps an out-of-range container value before multiplying', () => {
		// A container value above 1 is clamped to 1 first
		expect(combinedMask(1.4, 0)).toBeCloseTo(1, 6);
		// A negative container value is clamped to 0
		expect(combinedMask(-0.3, 0)).toBeCloseTo(0, 6);
	});

	it('no-container case: shapeType -1 leaves container at 1, obstruction acts alone', () => {
		// When obstructions exist but there is no container shape, the engine
		// sets uShapeType to a non-matching branch so mask stays 1.0, then
		// only (1 - obstruct) subtracts.
		const containerWhenNoShape = 1.0;
		expect(combinedMask(containerWhenNoShape, 0)).toBeCloseTo(1, 6);
		expect(combinedMask(containerWhenNoShape, 1)).toBeCloseTo(0, 6);
		expect(combinedMask(containerWhenNoShape, 0.25)).toBeCloseTo(0.75, 6);
	});
});
