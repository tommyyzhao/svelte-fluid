import { describe, expect, it, vi } from 'vitest';
import { LabSession } from './LabSession.js';

// Exercise the real pointer policy without manufacturing a GPU device or RAF.
function fixture() {
	const endInput = vi.fn();
	const state = {
		drag: { x: 0.2, y: 0.4, dx: 0, dy: 0, down: true },
		dragSeconds: 0.03, endPointerPending: false,
		engine: { endInput }, nudgeTime: 0, nudgePoint: undefined
	};
	const session = Object.create(LabSession.prototype) as LabSession;
	Object.assign(session, state);
	return { session, state: session as unknown as typeof state, endInput };
}

describe('private lab pointer ownership', () => {
	it('retains a release endpoint before ending material continuity', () => {
		const { session, state, endInput } = fixture();
		session.pointer(0.35, 0.45, false);
		expect(state.drag.dx).toBeCloseTo(0.15);
		expect(state.drag.dy).toBeCloseTo(0.05);
		expect(state.endPointerPending).toBe(true);
		expect(endInput).not.toHaveBeenCalled();
	});
	it('ends a stationary release immediately', () => {
		const { session, state, endInput } = fixture();
		session.pointer(0.2, 0.4, false);
		expect(state.endPointerPending).toBe(false);
		expect(endInput).toHaveBeenCalledOnce();
	});
	it('does not transfer an unconsumed previous gesture to a new entry', () => {
		const { session, state, endInput } = fixture();
		session.pointer(0.3, 0.4, true);
		session.pointer(0.3, 0.4, false);
		expect(state.endPointerPending).toBe(true);
		session.pointer(0.8, 0.1, true);
		expect(state.drag.dx).toBe(0);
		expect(state.drag.dy).toBe(0);
		expect(state.dragSeconds).toBe(0);
		expect(state.endPointerPending).toBe(false);
		expect(endInput).toHaveBeenCalledOnce();
		session.pointer(0.85, 0.12, true);
		expect(state.drag.dx).toBeCloseTo(0.05);
		expect(state.drag.dy).toBeCloseTo(0.02);
	});
});
