import { describe, expect, it } from 'vitest';
import { attachPigment, pigmentSubsteps, pigmentTotals, transportPigment, pigmentPulse, pigmentBrushAt,
	PIGMENT_CAPACITY, PIGMENT_WIDTH, PIGMENT_HEIGHT, PIGMENT_DRAG, PIGMENT_DESORPTION } from './capillary-pigment-model.js';

describe('finite mobile and attached pigment', () => {
	it('conserves all three colors through bounded adsorption and desorption', () => {
		let mobile = [3, 1, 0.4], attached = [0, 0.2, 0];
		const total = mobile.map((value, c) => value + attached[c]);
		let minimum = Infinity, maximumAttached = 0;
		for (let step = 0; step < 4000; step++) {
			({ mobile, attached } = attachPigment(mobile, attached, 0.01));
			minimum = Math.min(minimum, ...mobile, ...attached);
			maximumAttached = Math.max(maximumAttached, attached.reduce((a, b) => a + b, 0));
		}
		expect(minimum).toBeGreaterThanOrEqual(0);
		expect(maximumAttached).toBeLessThanOrEqual(PIGMENT_CAPACITY + 1e-12);
		expect(attached.reduce((a, b) => a + b, 0)).toBeGreaterThan(0.7);
		mobile.forEach((value, c) => expect(value + attached[c]).toBeCloseTo(total[c], 10));
	});
	it('never moves more material than mobile amount or shared vacant sites, even for a large reaction interval', () => {
		const result = attachPigment([100, 100, 100], [0.2, 0.3, 0.29], 100, 0.8, 50, 0);
		expect(result.attached.reduce((a, b) => a + b, 0)).toBeCloseTo(0.8, 12);
		expect(result.mobile.reduce((a, b) => a + b, 0)).toBeCloseTo(299.99, 12);
		expect(attachPigment([0, 0, 0], [0, 0, 0], 100)).toEqual({ mobile: [0, 0, 0], attached: [0, 0, 0] });
		expect(() => attachPigment([-1, 0, 0], [0, 0, 0], 1)).toThrow();
	});
	it('separates attachment from transport: attached fields remain fixed and no color crosses a hole', () => {
		const width = 9, height = 7, mask = new Uint32Array(width * height).fill(1);
		for (let y = 0; y < height; y++) mask[y * width + 4] = 0;
		let state = new Float32Array(width * height * 8);
		state[(3 * width + 2) * 8] = 10; state[(3 * width + 2) * 8 + 4] = 0.6;
		for (let i = 0; i < 150; i++) state = transportPigment(state, mask, width, height, 0.008, () => 24);
		const total = pigmentTotals(state);
		expect(total.mass).toBeCloseTo(10.6, 4); expect(total.min).toBeGreaterThanOrEqual(0);
		expect(total.attached[0]).toBeCloseTo(0.6, 6);
		for (let y = 0; y < height; y++) for (let x = 4; x < width; x++) expect(state[(y * width + x) * 8]).toBe(0);
		expect(state[(3 * width + 2) * 8 + 4]).toBeCloseTo(0.6, 6);
	});
	it('enforces the worst-case multidimensional outgoing CFL without a corrective mass clamp', () => {
		const mask = new Uint32Array(9).fill(1), state = new Float32Array(72); state[4 * 8] = 1;
		const outward = (x: number, y: number, horizontal: boolean) => (horizontal ? x < 1 : y < 1) ? -24 : 24;
		expect(() => transportPigment(state, mask, 3, 3, 0.1, outward)).toThrow('CFL');
		const dt = 0.1 / pigmentSubsteps(0.1, 3, 3), out = transportPigment(state, mask, 3, 3, dt, outward);
		expect(pigmentTotals(out).min).toBeGreaterThanOrEqual(0); expect(pigmentTotals(out).mass).toBeCloseTo(1, 6);
		expect(() => pigmentSubsteps(NaN)).toThrow(); expect(() => pigmentSubsteps(0.2)).toThrow();
	});
	it('converts ordinary pointer movement to matching normalized material movement, not a grid-dependent weak gain', () => {
		const input = { x: 0.5, y: 0.5, vx: 0.4, vy: -0.2, active: true, tilt: 0 };
		const brush = pigmentBrushAt(0.5, 0.5, input);
		expect(brush.vx / PIGMENT_WIDTH).toBeCloseTo(input.vx * PIGMENT_DRAG, 12);
		expect(brush.vy / PIGMENT_HEIGHT).toBeCloseTo(input.vy * PIGMENT_DRAG, 12);
		expect(pigmentBrushAt(0.5, 0.5, { ...input, active: false })).toEqual({ vx: 0, vy: 0, lift: 0 });
		expect(pigmentBrushAt(1.5, 0.5, input).lift).toBeLessThan(1e-20);
		expect(pigmentSubsteps(1 / 120)).toBe(1);
		let maximumSubsteps = 0;
		for (let vx = -3; vx <= 3; vx += 0.25) for (let vy = -3; vy <= 3; vy += 0.25) maximumSubsteps = Math.max(maximumSubsteps, pigmentSubsteps(1 / 120, vx, vy));
		expect(maximumSubsteps).toBeLessThanOrEqual(9);
	});
	it('moves mobile mass in the drag direction by a visible distance without displacing attached color', () => {
		const width = 71, height = 3, mask = new Uint32Array(width * height).fill(1);
		let state = new Float32Array(width * height * 8); state[(width + 20) * 8] = 1; state[(width + 20) * 8 + 4] = 0.3;
		const input = { x: 0.5, y: 0.5, vx: 0.4, vy: 0, active: true, tilt: 0 };
		const speed = pigmentBrushAt(0.5, 0.5, input).vx;
		for (let frame = 0; frame < 30; frame++) state = transportPigment(state, mask, width, height, 1 / 120, (_x, _y, horizontal) => horizontal ? speed : 0, 0);
		let moment = 0; for (let i = 0; i < mask.length; i++) moment += (i % width) * state[i * 8];
		expect(moment - 20).toBeGreaterThan(15); expect(moment - 20).toBeCloseTo(speed / 4, 3);
		expect(pigmentTotals(state).mass).toBeCloseTo(1.3, 6); expect(pigmentTotals(state).min).toBeGreaterThanOrEqual(0);
		expect(state[(width + 20) * 8 + 4]).toBeCloseTo(0.3, 6);
	});
	it('a moving brush lifts previously attached color locally instead of silently exhausting interactivity', () => {
		const input = { x: 0.5, y: 0.5, vx: 0.4, vy: 0, active: true, tilt: 0 };
		const brush = pigmentBrushAt(0.5, 0.5, input);
		const near = attachPigment([0, 0, 0], [0.4, 0.2, 0.1], 0.25, PIGMENT_CAPACITY, 0, PIGMENT_DESORPTION + brush.lift);
		const far = attachPigment([0, 0, 0], [0.4, 0.2, 0.1], 0.25, PIGMENT_CAPACITY, 0, PIGMENT_DESORPTION);
		expect(near.mobile.reduce((a, b) => a + b, 0)).toBeGreaterThan(0.35);
		expect(far.mobile.reduce((a, b) => a + b, 0)).toBeLessThan(0.001);
		near.mobile.forEach((v, c) => expect(v + near.attached[c]).toBeCloseTo([0.4, 0.2, 0.1][c], 12));
	});
	it('normalizes each finite dose over open cells only', () => {
		const mask = new Uint32Array(PIGMENT_WIDTH * PIGMENT_HEIGHT);
		for (let y = 20; y < 76; y++) for (let x = 20; x < 170; x++) mask[y * PIGMENT_WIDTH + x] = 1;
		for (const geometry of ['type', 'emblem'] as const) for (const color of [0, 1, 2]) {
			const dose = pigmentPulse(mask, color, geometry); let total = 0, forbidden = 0, minimum = Infinity;
			for (let i = 0; i < mask.length; i++) for (let c = 0; c < 4; c++) {
				const value = dose[i * 4 + c]; total += value; minimum = Math.min(minimum, value);
				if (!mask[i] || c !== color) forbidden = Math.max(forbidden, Math.abs(value));
			}
			expect(total).toBeCloseTo(420, 4);
			expect(forbidden).toBe(0); expect(minimum).toBeGreaterThanOrEqual(0);
		}
	});
});
