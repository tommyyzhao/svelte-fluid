import { describe, expect, it } from 'vitest';
import { GlassGesture } from './tactile-materials.js';
import { advanceCommittedFoil, advanceFoil, type FoilState } from './snap-foil.js';

describe('tactile interaction laws', () => {
	it('keeps a between-frame glass tap visible, then releases it without a reset', () => {
		const gesture = new GlassGesture(); gesture.press(true); gesture.press(false); gesture.pulse();
		expect(gesture.pressure).toBe(0.94);
		for (let i = 0; i < 12; i++) gesture.advance(1 / 120);
		expect(gesture.pressure).toBeGreaterThan(0.9);
		for (let i = 0; i < 240; i++) gesture.advance(1 / 120);
		expect(gesture.pressure).toBe(0); expect(gesture.pulseRemaining).toBe(0);
	});
	it('maps pointer angle in physical layout coordinates and cancels all temporary input', () => {
		const gesture = new GlassGesture(); gesture.move(0.75, 0.25, 2);
		expect(gesture.angle).toBeCloseTo(Math.atan2(0.5, 0.25));
		gesture.press(true); gesture.pulse(); gesture.cancel(); gesture.advance(1);
		expect([gesture.pressure, gesture.pulseRemaining, Number(gesture.held), Number(gesture.hovered)]).toEqual([0, 0, 0, 0]);
	});
	it.each([60, 120, 240])('crosses within 85ms and captures within 220ms at %i Hz, without a slow tail', (hz) => {
		// Authored simulation-time targets, not a calibrated metal response or
		// a claim about wall-clock browser input latency. Test both directions.
		for (const target of [-1, 1] as const) {
			const state: FoilState = { amplitude: -target, velocity: 0 };
			let active = true, crossing = Infinity, near = Infinity, captured = Infinity;
			let maximum = 1;
			for (let frame = 1; frame <= hz; frame++) {
				active = advanceCommittedFoil(state, 1 / hz, target, active);
				maximum = Math.max(maximum, Math.abs(state.amplitude));
				if (state.amplitude * target >= 0) crossing = Math.min(crossing, frame / hz);
				if (Math.abs(state.amplitude - target) < 0.02) near = Math.min(near, frame / hz);
				if (!active) captured = Math.min(captured, frame / hz);
				expect(Number.isFinite(state.velocity)).toBe(true);
			}
			expect(crossing).toBeLessThanOrEqual(0.085);
			expect(near).toBeLessThanOrEqual(0.13);
			expect(captured).toBeLessThanOrEqual(0.22);
			expect(maximum).toBeLessThan(1.08);
			// Capture removes the actuator; idle does not leave a fading tail.
			expect(state).toEqual({ amplitude: target, velocity: 0 });
			expect(active).toBe(false);
		}
	});
	it.each([1 / 60, 1 / 30, 0.075])('settles the latest intent after rapid %fs reversals without growing overshoot', (interval) => {
		for (const hz of [60, 120, 240]) {
			const state: FoilState = { amplitude: 1, velocity: 0 };
			let active = false, maximum = 1, target: -1 | 1 = -1;
			const step = () => {
				active = advanceCommittedFoil(state, 1 / hz, target, active);
				maximum = Math.max(maximum, Math.abs(state.amplitude));
				expect(Number.isFinite(state.velocity)).toBe(true);
			};
			for (let flip = 0; flip < 13; flip++) {
				target = flip % 2 === 0 ? -1 : 1; active = true;
				for (let frame = 0; frame < Math.round(interval * hz); frame++) step();
			}
			for (let frame = 0; frame < Math.ceil(0.22 * hz); frame++) step();
			expect(maximum).toBeLessThan(1.08);
			expect(state).toEqual({ amplitude: target, velocity: 0 });
			expect(active).toBe(false);
		}
	});
	it('preserves the original uncommitted foil response exactly', () => {
		// Golden samples captured before changing the committed UI actuator.
		const state: FoilState = { amplitude: 1, velocity: 0 };
		for (let i = 0; i < 24; i++) advanceFoil(state, 1 / 120, -30);
		expect(state.amplitude).toBeCloseTo(0.6910567050233728, 12);
		expect(state.velocity).toBeCloseTo(-1.9937845464962936, 12);
		for (let i = 24; i < 96; i++) advanceFoil(state, 1 / 120, -30);
		expect(state.amplitude).toBeCloseTo(-1.0170767322484453, 12);
		expect(state.velocity).toBeCloseTo(-4.671921427912027, 12);
	});
	it('teases curvature with bounded hover without escaping either committed well', () => {
		for (const target of [-1, 1] as const) {
			const state = { amplitude: target, velocity: 0 } as FoilState;
			for (let i = 0; i < 1200; i++) {
				advanceCommittedFoil(state, 1 / 120, target, false, 6 * Math.sin(i / 30));
				expect(state.amplitude * target).toBeGreaterThan(0.8);
			}
			for (let i = 0; i < 360; i++) advanceCommittedFoil(state, 1 / 120, target, false, 0);
			expect(state.amplitude).toBeCloseTo(target, 7);
		}
	});
});
