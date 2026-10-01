import { describe, expect, it } from 'vitest';
import { advanceCover, COVER_MODES, coverImageBytes, createCoverState, mapCoverPoint } from './living-cover.js';
import type { LiquidInput } from './types.js';
const idle: LiquidInput = { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, tilt: 0 };
const amplitude = [0.3, -0.3, 0.3, -0.3, 0.3, -0.3];

describe('responsive aperture and reveal boundary maps', () => {
	it('has an exact inverse, preserves area and leaves the boundary domain invariant', () => {
		for (let y = 0; y <= 30; y++) for (let x = 0; x <= 30; x++) {
			const point = [x / 30, y / 30] as const, mapped = mapCoverPoint(point, amplitude), recovered = mapCoverPoint(mapped.point, amplitude, false);
			expect(Math.hypot(recovered.point[0] - point[0], recovered.point[1] - point[1])).toBeLessThan(1e-12);
			expect(mapped.determinant).toBeCloseTo(1, 12);
			for (const coordinate of mapped.point) { expect(coordinate).toBeGreaterThanOrEqual(0); expect(coordinate).toBeLessThanOrEqual(1); }
			if (x === 0 || x === 30 || y === 0 || y === 30) expect(mapped.point).toEqual(point);
		}
	});
	it('chains analytic derivatives consistently with finite differences at support boundaries', () => {
		for (const [x, y] of [[0.3, 0.3], [0.42, 0.39], [0.5, 0.55], [0.7, 0.7], [0.3 + COVER_MODES[0].radius, 0.3]]) {
			const map = mapCoverPoint([x, y], amplitude), eps = 1e-6;
			for (let axis = 0; axis < 2; axis++) {
				const before = mapCoverPoint([x - (axis === 0 ? eps : 0), y - (axis === 1 ? eps : 0)], amplitude).point;
				const after = mapCoverPoint([x + (axis === 0 ? eps : 0), y + (axis === 1 ? eps : 0)], amplitude).point;
				for (let component = 0; component < 2; component++) expect((after[component] - before[component]) / (2 * eps)).toBeCloseTo(map.jacobian[axis * 2 + component], 7);
			}
		}
	});
	it('catches crossing input, bounds amplitudes, ignores stationary hover and fully recovers', () => {
		const state = createCoverState();
		for (let step = 0; step < 240; step++) advanceCover(state, 1 / 120, { ...idle, active: true, x: 0.15 + step % 120 / 120 * 0.7, y: step < 120 ? 0.45 : 0.62, vx: step < 120 ? 2 : -2, vy: 0.4 });
		expect(Math.max(...state.amplitude.map(Math.abs))).toBeGreaterThan(0.04);
		expect(state.amplitude.reduce((sum, a) => sum + Math.abs(a), 0)).toBeLessThanOrEqual(1.800001);
		for (const a of state.amplitude) expect(Math.abs(a)).toBeLessThanOrEqual(0.6);
		const stationary = { amplitude: state.amplitude.slice(), velocity: state.velocity.slice() };
		for (let i = 0; i < 1200; i++) { advanceCover(state, 1 / 120, idle); advanceCover(stationary, 1 / 120, { ...idle, active: true }); }
		expect(Array.from(state.amplitude)).toEqual([0, 0, 0, 0, 0, 0]);
		// Active zero velocity still has no force; its unsnapped tail is negligible.
		expect(Math.max(...stationary.amplitude.map(Math.abs))).toBeLessThan(1e-14);
	});
	it('accounts exact original mip storage without resizing the source to a fake native texture', () => {
		expect(coverImageBytes(4, 4)).toEqual({ bytes: 84, levels: 3 });
		expect(coverImageBytes(1254, 1254).bytes).toBeGreaterThan(1254 ** 2 * 4);
		expect(() => coverImageBytes(0, 1254)).toThrow(); expect(() => coverImageBytes(9000, 1254)).toThrow();
	});
});
