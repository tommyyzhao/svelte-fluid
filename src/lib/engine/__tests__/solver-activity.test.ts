import { describe, expect, it } from 'vitest';
import { flowCanDriveSolver } from '../solver-activity.js';

describe('conservative flow activity proof', () => {
	it('keeps declarations that can create fields active', () => {
		expect(flowCanDriveSolver({ sources: [{ kind: 'point', x: 0.5, y: 0.5, dye: { r: 1, g: 0, b: 0 } }] })).toBe(true);
		expect(flowCanDriveSolver({ sources: [{ kind: 'point', x: 0.5, y: 0.5, dye: { r: 0, g: 0, b: 0 } }] })).toBe(true);
		expect(flowCanDriveSolver({ sources: [{ kind: 'point', x: 0.5, y: 0.5, velocity: { x: 0, y: 2 } }] })).toBe(true);
		expect(flowCanDriveSolver({ sources: [{ kind: 'point', x: 0.5, y: 0.5, scalars: { temperature: 1 } }] })).toBe(true);
		expect(flowCanDriveSolver({ forces: [{ kind: 'gravity', vector: { x: 0, y: -1 } }] })).toBe(true);
		expect(flowCanDriveSolver({ forces: [{ kind: 'pressureGradient', vector: { x: 1, y: 0 } }] })).toBe(true);
		expect(flowCanDriveSolver({ forces: [{ kind: 'buoyancy', scalar: 'temperature', strength: 1 }] })).toBe(true);
		expect(flowCanDriveSolver({ prescribed: { kind: 'grid', velocity: { width: 1, height: 1, data: [0, 0] } } })).toBe(true);
		expect(
			flowCanDriveSolver({ prescribed: { kind: 'grid', scalars: { ink: { width: 1, height: 1, data: [0] } } } })
		).toBe(true);
	});

	it('allows empty and outlet/boundary-only declarations to stay idle', () => {
		expect(flowCanDriveSolver(null)).toBe(false);
		expect(flowCanDriveSolver({})).toBe(false);
		expect(flowCanDriveSolver({ boundary: { left: 'open' }, outlets: [{ edge: 'right' }] })).toBe(false);
	});

	it('treats numerically inert declarations as idle', () => {
		const dye = { r: 1, g: 1, b: 1 };
		for (const rate of [-1, NaN, Infinity]) expect(flowCanDriveSolver({ sources: [{ kind: 'point', x: 0.5, y: 0.5, dye, rate }] })).toBe(false);
		expect(flowCanDriveSolver({ sources: [{ kind: 'point', x: 0.5, y: 0.5, dye, rate: 0 }] })).toBe(false);
		expect(flowCanDriveSolver({ sources: [{ kind: 'point', x: 0.5, y: 0.5 }] })).toBe(false);
		expect(
			flowCanDriveSolver({
				sources: [
					{
						kind: 'line',
						from: { x: 0, y: 0 },
						to: { x: 1, y: 1 },
						velocity: { x: 0, y: 0 },
						scalars: { temperature: 0 }
					}
				]
			})
		).toBe(false);
		expect(flowCanDriveSolver({ forces: [{ kind: 'gravity', vector: { x: 0, y: 0 } }] })).toBe(false);
		expect(flowCanDriveSolver({ forces: [{ kind: 'buoyancy', scalar: 'temperature', strength: 0 }] })).toBe(false);
		expect(flowCanDriveSolver({ prescribed: { kind: 'grid' } })).toBe(false);
		expect(flowCanDriveSolver({ prescribed: { kind: 'grid', scalars: {} } })).toBe(false);
		expect(flowCanDriveSolver({ prescribed: { kind: 'grid', scalars: { ink: undefined } } })).toBe(false);
	});

	it('one active entry keeps a mixed declaration active', () => {
		expect(
			flowCanDriveSolver({
				sources: [
					{ kind: 'point', x: 0.2, y: 0.5, rate: 0, dye: { r: 1, g: 0, b: 0 } },
					{ kind: 'point', x: 0.8, y: 0.5, dye: { r: 0, g: 1, b: 0 } }
				]
			})
		).toBe(true);
	});
});
