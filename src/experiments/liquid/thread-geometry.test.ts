import { describe, expect, it } from 'vitest';
import { advanceRopeContact, braidClearance, braidPoint, braidTangent, ropeDerivative, RopeDeposition, THREAD_COIL_RADIUS, THREAD_HISTORY_CAPACITY, THREAD_SAMPLE_LENGTH } from './thread-geometry.js';

describe('reduced liquid-rope deposition', () => {
	it('reconstructs steady coiling from the contact ODE at zero belt speed', () => {
		const radius = THREAD_COIL_RADIUS; let contact = { x: radius, y: 0, theta: Math.PI / 2 }, length = 0;
		for (let i = 0; i < 1000; i++) { contact = advanceRopeContact(contact, 0.002, 0); length += 0.002; expect(Math.hypot(contact.x, contact.y)).toBeCloseTo(radius, 7); }
		expect(contact.x).toBeCloseTo(radius * Math.cos(length / radius), 6); expect(contact.y).toBeCloseTo(radius * Math.sin(length / radius), 6);
	});
	it('satisfies the no-slip feed tangent and converges under smaller arc steps', () => {
		const start = { x: 0.17, y: 0.04, theta: 1.2 };
		for (const ratio of [0, 0.4, 0.8, 1]) { const d = ropeDerivative(start, ratio); expect(Math.hypot(d.x - ratio, d.y)).toBeCloseTo(1, 14); }
		function solve(step: number) { let p = { ...start }; for (let i = 0; i < 0.4 / step; i++) p = advanceRopeContact(p, step, 0.45); return p; }
		const a = solve(0.004), b = solve(0.002), c = solve(0.001);
		expect(Math.hypot(a.x - c.x, a.y - c.y)).toBeLessThan(1e-6); expect(Math.hypot(b.x - c.x, b.y - c.y)).toBeLessThan(Math.hypot(a.x - c.x, a.y - c.y));
	});
	it('accounts for deposited arc length and stops before evicting history', () => {
		const rope = new RopeDeposition();
		for (let i = 0; i < 2000; i++) rope.advance(1 / 120, 0.6, 0.4);
		expect(rope.full).toBe(true); expect(rope.points).toHaveLength(THREAD_HISTORY_CAPACITY);
		expect(rope.length).toBeCloseTo((THREAD_HISTORY_CAPACITY - 1) * THREAD_SAMPLE_LENGTH, 10);
		const first = { ...rope.points[0] }, belt = rope.belt; rope.advance(1, 1, 1);
		expect(rope.belt).toBe(belt); expect(rope.points[0]).toEqual(first);
		let chordLength = 0;
		for (let i = 1; i < rope.points.length; i++) { const a = rope.position(i - 1), b = rope.position(i); chordLength += Math.hypot(a[0] - b[0], a[1] - b[1]); }
		expect(Math.abs(chordLength / rope.length - 1)).toBeLessThan(0.001);
	});
	it('changes its deposited path through belt/feed competition rather than a prescribed spiral', () => {
		const slow = new RopeDeposition(), fast = new RopeDeposition();
		for (let i = 0; i < 900; i++) { slow.advance(1 / 120, 0.5, 0.2); fast.advance(1 / 120, 0.5, 0.85); }
		expect(slow.length).toBe(fast.length); expect(Math.hypot(slow.contact.x - fast.contact.x, slow.contact.y - fast.contact.y)).toBeGreaterThan(0.025);
	});
	it('stays finite over the complete native speed controls, including abrupt speed reversals', () => {
		for (let k = 0; k <= 20; k++) {
			const rope = new RopeDeposition();
			for (let i = 0; i < 160; i++) rope.advance(0.05, 1.2, k === 20 ? Number(i % 20 < 10) : k / 19);
			expect(rope.full).toBe(true); expect(Object.values(rope.contact).every(Number.isFinite)).toBe(true);
			expect(rope.points.every((point) => Object.values(point).every(Number.isFinite))).toBe(true);
		}
	});
});
describe('authored braid separation', () => {
	it('has finite continuous tangents and a conservative positive surface gap at all control extremes', () => {
		for (const spacing of [0.075, 0.2]) for (const turns of [1.5, 4]) {
			const clearance = braidClearance(spacing, turns); expect(clearance.conservativeSurfaceGap).toBeGreaterThan(0);
			for (let strand = 0; strand < 3; strand++) for (let u = 0; u <= 1; u += 0.01) {
				const tangent = braidTangent(strand, u, spacing, turns), next = braidTangent(strand, u + 1e-5, spacing, turns);
				expect(Math.hypot(...tangent)).toBeCloseTo(1, 12); expect(Math.hypot(...tangent.map((x, i) => x - next[i]))).toBeLessThan(0.001);
				expect(braidPoint(strand, u, spacing, turns).every(Number.isFinite)).toBe(true);
			}
		}
	});
});
