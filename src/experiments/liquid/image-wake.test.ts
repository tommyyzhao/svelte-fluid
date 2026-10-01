import { describe, expect, it } from 'vitest';
import { advanceWake, breakWakeStroke, createWakeState, endWakeInput, mapWakePoint, primeWakeInput, WAKE_ANGLE_BUDGET, WAKE_CAPACITY, WAKE_SPACING, WAKE_STRETCH_BOUND, wakeEnvelope, wakeModes, type WakeMode } from './image-wake.js';
import type { LiquidInput } from './types.js';
const idle: LiquidInput = { active: false, x: 0.5, y: 0.5, vx: 0, vy: 0, tilt: 0 };
function stroke(state: ReturnType<typeof createWakeState>, y = 0.43) { for (let i = 0; i <= 60; i++) advanceWake(state, 1 / 120, { ...idle, active: true, x: 0.25 + i * 0.007, y, vx: 0.84 }); }
function maximumSingular(j: readonly number[]) { const trace = j.reduce((s, n) => s + n * n, 0), det = j[0] * j[3] - j[1] * j[2]; return Math.sqrt((trace + Math.sqrt(Math.max(0, trace * trace - 4 * det * det))) / 2); }
describe('bounded local image wake', () => {
	it('locates a recent stroke, retains material movement at 500ms and recovers exactly', () => {
		const state = createWakeState(); stroke(state); for (let i = 0; i < 60; i++) advanceWake(state, 1 / 120, idle);
		const modes = wakeModes(state); expect(modes.length).toBeGreaterThan(4);
		let largest = 0; for (let x = 0.2; x < 0.8; x += 0.02) { const p = mapWakePoint([x, 0.43], modes).point; largest = Math.max(largest, Math.hypot(p[0] - x, p[1] - 0.43)); }
		expect(largest).toBeGreaterThan(0.008); // >8 native pixels in a 1062px phone specimen.
		for (const y of [0.1, 0.2, 0.7, 0.9]) for (let x = 0; x <= 1; x += 0.1) expect(mapWakePoint([x, y], modes).point).toEqual([x, y]);
		for (let i = 0; i < 400; i++) advanceWake(state, 1 / 120, idle);
		expect(state.packets).toHaveLength(0); expect(mapWakePoint([0.45, 0.43], wakeModes(state)).point).toEqual([0.45, 0.43]);
	});
	it('has exact inverse/Jacobian and a strain bound even for maximally overlapping history', () => {
		const state = createWakeState();
		for (let i = 0; i < WAKE_CAPACITY; i++) state.packets.push({ x: 0.5 + Math.cos(i) * 0.01, y: 0.5 + Math.sin(i) * 0.01, radius: 0.13, tx: Math.cos(i), ty: Math.sin(i), age: 0.1 });
		const modes = wakeModes(state); expect(modes.reduce((sum, m) => sum + Math.abs(m.angle), 0)).toBeLessThanOrEqual(WAKE_ANGLE_BUDGET);
		for (let y = 0.34; y <= 0.66; y += 0.013) for (let x = 0.34; x <= 0.66; x += 0.013) {
			const mapped = mapWakePoint([x, y], modes), restored = mapWakePoint(mapped.point, modes, false);
			expect(mapped.determinant).toBeCloseTo(1, 12); expect(Math.hypot(restored.point[0] - x, restored.point[1] - y)).toBeLessThan(1e-12); expect(maximumSingular(mapped.jacobian)).toBeLessThanOrEqual(WAKE_STRETCH_BOUND);
			const h = 1e-6, px = mapWakePoint([x + h, y], modes).point, mx = mapWakePoint([x - h, y], modes).point, py = mapWakePoint([x, y + h], modes).point, my = mapWakePoint([x, y - h], modes).point;
			for (const [actual, reference] of mapped.jacobian.map((n, i) => [n, [(px[0] - mx[0]) / (2 * h), (px[1] - mx[1]) / (2 * h), (py[0] - my[0]) / (2 * h), (py[1] - my[1]) / (2 * h)][i]])) expect(actual).toBeCloseTo(reference, 7);
		}
	});
	 it('does not rescale an old wake when a distant new packet is added', () => {
		const state = createWakeState(); state.packets.push({ x: 0.3, y: 0.3, tx: 1, ty: 0, radius: 0.13, age: 0.5 });
		const before = wakeModes(state); for (let i = 1; i < WAKE_CAPACITY; i++) state.packets.push({ x: 0.75, y: 0.75, tx: 1, ty: 0, radius: 0.13, age: 0.1 });
		expect(wakeModes(state).slice(0, 2)).toEqual(before);
		expect(mapWakePoint([0.3, 0.3], wakeModes(state)).point).toEqual(mapWakePoint([0.3, 0.3], before).point);
	});
	it('does not multiply stationary endpoints, preserves sparse in-host segments, and breaks actual reentry', () => {
		const state = createWakeState(); primeWakeInput(state, 0.3, 0.5);
		const point = { ...idle, active: true, x: 0.42, y: 0.5, vx: 1 };
		advanceWake(state, 1 / 120, point); const count = state.accepted;
		for (let i = 0; i < 20; i++) advanceWake(state, 1 / 120, point); expect(state.accepted).toBe(count);
		endWakeInput(state); primeWakeInput(state, 0.42, 0.5); advanceWake(state, 1 / 120, { ...point, x: 0.55 }); expect(state.accepted).toBeGreaterThan(count);
		const beforeEntry = state.accepted; breakWakeStroke(state); advanceWake(state, 1 / 120, { ...point, x: 0.9 }); expect(state.accepted).toBe(beforeEntry);
		expect(state.packets.every((packet) => packet.x < 0.56)).toBe(true);
		const coalesced = createWakeState(); primeWakeInput(coalesced, 0.2, 0.5); primeWakeInput(coalesced, 0.3, 0.5); primeWakeInput(coalesced, 0.4, 0.5);
		advanceWake(coalesced, 1 / 120, { ...point, x: 0.5 }); expect(coalesced.accepted).toBe(3); expect(coalesced.packets[0].x).toBeCloseTo(0.215, 12);
	});
	it('admits full horizontal, diagonal and one-bend strokes without losing their final region', () => {
		expect(WAKE_CAPACITY).toBe(Math.ceil(Math.SQRT2 / WAKE_SPACING) + 1);
		for (const points of [[[0.1, 0.5], [0.9, 0.5]], [[0.1, 0.1], [0.9, 0.9]], [[0.15, 0.2], [0.85, 0.2], [0.85, 0.85]]] as const) {
			const state = createWakeState(); primeWakeInput(state, points[0][0], points[0][1]);
			for (let segment = 1; segment < points.length; segment++) {
				const a = points[segment - 1], b = points[segment];
				for (let i = 1; i <= 60; i++) advanceWake(state, 1 / 120, { ...idle, active: true, x: a[0] + (b[0] - a[0]) * i / 60, y: a[1] + (b[1] - a[1]) * i / 60 });
			}
			for (let i = 0; i < 60; i++) advanceWake(state, 1 / 120, idle);
			expect(state.rejected).toBe(0); const end = points.at(-1)!, modes = wakeModes(state); let peak = 0;
			for (let y = end[1] - 0.05; y <= end[1] + 0.05; y += 0.005) for (let x = end[0] - 0.05; x <= end[0] + 0.05; x += 0.005) {
				const mapped = mapWakePoint([x, y], modes).point; peak = Math.max(peak, Math.hypot(mapped[0] - x, mapped[1] - y));
			}
			expect(peak).toBeGreaterThan(0.004); // Meaningful endpoint-area motion, not just a nonzero tail.
		}
		const dense = createWakeState('dense-baseline'); primeWakeInput(dense, 0.1, 0.5);
		advanceWake(dense, 1 / 120, { ...idle, active: true, x: 0.9 });
		for (let i = 0; i < 60; i++) advanceWake(dense, 1 / 120, idle);
		expect(dense.rejected).toBe(5); expect(dense.packets.at(-1)!.x).toBeCloseTo(0.57, 12);
		expect(mapWakePoint([0.9, 0.5], wakeModes(dense)).point).toEqual([0.9, 0.5]);
	});
	 it('places the same packets for one coalesced event or many subdivisions of the same path', () => {
		// Exact boundaries previously lost the third packet for2/3events but
		// not one event: the endpoint comparison and modulo rounded differently.
		for (let boundary = 0; boundary <= 6; boundary++) for (const samples of [1, 2, 3, 7, 60]) {
			const state = createWakeState(), length = 0.015 + boundary * WAKE_SPACING; primeWakeInput(state, 0.1, 0.5);
			for (let i = 1; i <= samples; i++) advanceWake(state, 1 / 120, { ...idle, active: true, x: 0.1 + length * i / samples });
			expect(state.accepted).toBe(boundary + 1); expect(state.packets.at(-1)!.x).toBeCloseTo(0.1 + length, 12);
		}
		for (const end of [[0.9, 0.5], [0.9, 0.9]] as const) {
			const start = [0.1, end[1] === 0.5 ? 0.5 : 0.1] as const;
			const states = [1, 12, 120].map((samples) => {
				const state = createWakeState(); primeWakeInput(state, ...start);
				for (let i = 1; i <= samples; i++) advanceWake(state, 1 / 120, { ...idle, active: true, x: start[0] + (end[0] - start[0]) * i / samples, y: start[1] + (end[1] - start[1]) * i / samples });
				return state;
			});
			for (const state of states) {
				expect(state.rejected).toBe(0); expect(state.packets.length).toBe(states[0].packets.length);
				for (let i = 0; i < state.packets.length; i++) for (const key of ['x', 'y', 'tx', 'ty', 'radius'] as const) expect(state.packets[i][key]).toBeCloseTo(states[0].packets[i][key], 12);
			}
		}
	});
	it('refuses excess history without replacing a visible packet, and keeps edge support inside the source', () => {
		const state = createWakeState(); stroke(state); const first = state.packets[0];
		stroke(state, 0.48); stroke(state, 0.6); expect(state.packets.length).toBe(WAKE_CAPACITY); expect(state.rejected).toBeGreaterThan(0); expect(state.packets[0]).toBe(first);
		const edge = createWakeState(); primeWakeInput(edge, 0.03, 0.04); advanceWake(edge, 1 / 120, { ...idle, active: true, x: 0.15, y: 0.04 });
		for (let i = 0; i < 60; i++) advanceWake(edge, 1 / 120, idle);
		for (const mode of wakeModes(edge)) { expect(mode.x - mode.radius).toBeGreaterThanOrEqual(0); expect(mode.y - mode.radius).toBeGreaterThanOrEqual(0); expect(mode.x + mode.radius).toBeLessThanOrEqual(1); expect(mode.y + mode.radius).toBeLessThanOrEqual(1); }
		expect(wakeEnvelope(0)).toBe(0); expect(wakeEnvelope(3)).toBe(0);
		// Smooth retirement approaches zero quadratically; no finite eviction jump.
		expect(wakeEnvelope(2.9995) / wakeEnvelope(2.999)).toBeCloseTo(0.25, 3);
	});
	it('bounds derivative sensitivity at compact support edges and rejects invalid maps', () => {
		const mode: WakeMode = { x: 0.5, y: 0.5, radius: 0.13, angle: 0.7 };
		const inside = mapWakePoint([0.63 - 1e-7, 0.5], [mode]); expect(inside.jacobian[0]).toBeCloseTo(1, 10); expect(inside.jacobian[1]).toBeCloseTo(0, 9);
		expect(mapWakePoint([0.63, 0.5], [mode]).point).toEqual([0.63, 0.5]); expect(() => mapWakePoint([0, 0], [{ ...mode, radius: 0 }])).toThrow();
	});
});
