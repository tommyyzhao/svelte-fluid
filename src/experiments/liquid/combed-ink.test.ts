import { describe, expect, it } from 'vitest';
import { inkProgram, reverseInkPoint } from './combed-ink.js';

describe('bounded reverse-drift ink', () => {
	it('uses identical prefixes and refuses silent history eviction', () => {
		for (const count of [1, 4, 8, 16]) expect(inkProgram(count)).toEqual(inkProgram(16).slice(0, count));
		expect(() => inkProgram(17)).toThrow('16'); expect(() => inkProgram(NaN)).toThrow();
		expect(() => reverseInkPoint([0, 0], [{ ax: 0, ay: 0, bx: 1, by: 1, radius: 0 }])).toThrow('bounded');
	});
	it('preserves identity away from strokes and reverses operation order', () => {
		expect(reverseInkPoint([0.5, 0.5], []).point).toEqual([0.5, 0.5]);
		expect(reverseInkPoint([8, 8], inkProgram(16))).toEqual({ point: [8, 8], iterations: 0 });
		const program = inkProgram(4), point = [0.6, 0.45] as const;
		let reversed: readonly [number, number] = point;
		for (let i = program.length - 1; i >= 0; i--) reversed = reverseInkPoint(reversed, [program[i]]).point;
		expect(reverseInkPoint(point, program).point).toEqual(reversed);
	});
	it('converges under tighter integration for 1/4/8/16 operations including a long narrow path', () => {
		const metrics: object[] = [];
		for (const count of [1, 4, 8, 16]) {
			let brushSquared = 0, referenceSquared = 0, brushWork = 0, referenceWork = 0;
			for (let y = 0; y < 15; y++) for (let x = 0; x < 21; x++) {
				const point = [(x + 0.37) / 21 * 1.8, (y + 0.61) / 15] as const;
				const brush = reverseInkPoint(point, inkProgram(count), 0.1), reference = reverseInkPoint(point, inkProgram(count), 0.025), finer = reverseInkPoint(point, inkProgram(count), 0.00625);
				brushSquared += Math.hypot(brush.point[0] - finer.point[0], brush.point[1] - finer.point[1]) ** 2;
				referenceSquared += Math.hypot(reference.point[0] - finer.point[0], reference.point[1] - finer.point[1]) ** 2;
				brushWork += brush.iterations; referenceWork += reference.iterations;
			}
			expect(referenceSquared).toBeLessThan(brushSquared * 0.08);
			expect(Math.sqrt(referenceSquared / 315)).toBeLessThan(0.000002);
			metrics.push({ operations: count, brushRms: Math.sqrt(brushSquared / 315), referenceRms: Math.sqrt(referenceSquared / 315), brushIterations: brushWork, referenceIterations: referenceWork });
		}
		console.info('Ink integration convergence (model coordinates, not image error)', metrics);
	});
});
