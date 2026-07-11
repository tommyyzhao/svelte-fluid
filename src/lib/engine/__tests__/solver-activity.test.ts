import { describe, expect, it } from 'vitest';
import { flowCanDriveSolver } from '../solver-activity.js';

describe('conservative flow activity proof', () => {
	it('keeps declarations that can create fields active', () => {
		expect(flowCanDriveSolver({ sources: [{ kind: 'point', x: 0.5, y: 0.5, dye: { r: 1, g: 0, b: 0 } }] })).toBe(true);
		expect(flowCanDriveSolver({ forces: [{ kind: 'gravity', vector: { x: 0, y: -1 } }] })).toBe(true);
		expect(flowCanDriveSolver({ forces: [{ kind: 'pressureGradient', vector: { x: 1, y: 0 } }] })).toBe(true);
		expect(flowCanDriveSolver({ forces: [{ kind: 'buoyancy', scalar: 'temperature', strength: 1 }] })).toBe(true);
		expect(flowCanDriveSolver({ prescribed: { kind: 'grid', velocity: { width: 1, height: 1, data: [0, 0] } } })).toBe(true);
	});

	it('allows empty and outlet/boundary-only declarations to stay idle', () => {
		expect(flowCanDriveSolver(null)).toBe(false);
		expect(flowCanDriveSolver({})).toBe(false);
		expect(flowCanDriveSolver({ boundary: { left: 'open' }, outlets: [{ edge: 'right' }] })).toBe(false);
	});
});
