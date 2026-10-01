import { describe, expect, it } from 'vitest';
import { advanceAnnular, annularProfile, mapAnnularPoint, ANNULAR_ANGLE, ANNULAR_INNER, ANNULAR_OUTER, ANNULAR_STRETCH_BOUND } from './annular-flow.js';
import type { LiquidInput } from './types.js';
const idle: LiquidInput = { active: false, x: .5, y: .5, vx: 0, vy: 0, tilt: 0 };
describe('prescribed circular circulation', () => {
	it('leaves the actual protected image and outer image exactly unchanged, including both boundaries', () => {
		for (const r of [0, .1, ANNULAR_INNER, ANNULAR_OUTER, .5, 1]) for (let i = 0; i < 17; i++) {
			const p = [.5 + r * Math.cos(i), .5 + r * Math.sin(i)] as const;
			// Exact boundary probes use one axis to avoid trig representation drift.
			if (r === ANNULAR_INNER || r === ANNULAR_OUTER) continue;
			expect(mapAnnularPoint(p, ANNULAR_ANGLE).point).toEqual(p);
		}
		for (const r of [ANNULAR_INNER, ANNULAR_OUTER]) { expect(annularProfile(r)).toEqual({ value: 0, derivative: 0 }); }
	});
	it('has the exact inverse, unit determinant and a bounded native footprint throughout the ring', () => {
		for (const angle of [-ANNULAR_ANGLE, .1, ANNULAR_ANGLE]) for (let y = 0; y <= 40; y++) for (let x = 0; x <= 40; x++) {
			const p = [x / 40, y / 40] as const, mapped = mapAnnularPoint(p, angle), restored = mapAnnularPoint(mapped.point, angle, false), [a,b,c,d] = mapped.jacobian;
			expect(Math.hypot(restored.point[0] - p[0], restored.point[1] - p[1])).toBeLessThan(1e-14);
			expect(mapped.determinant).toBeCloseTo(1, 12);
			const frobenius2 = a*a+b*b+c*c+d*d, sigma = Math.sqrt((frobenius2 + Math.sqrt(Math.max(0, frobenius2*frobenius2-4))) / 2);
			expect(sigma).toBeLessThanOrEqual(ANNULAR_STRETCH_BOUND + 1e-12);
		}
		expect(ANNULAR_STRETCH_BOUND ** 2).toBeLessThan(8);
	});
	it('matches analytic inverse gradients to finite differences rather than filtering an unwarped footprint', () => {
		const epsilon = 1e-6;
		for (let i = 0; i < 100; i++) {
			const r = .195 + (i % 20) / 20 * .24, p = [.5 + r*Math.cos(i), .5+r*Math.sin(i)] as const, exact = mapAnnularPoint(p, ANNULAR_ANGLE).jacobian;
			for (let axis = 0; axis < 2; axis++) {
				const minus: [number,number] = [...p], plus: [number,number] = [...p]; minus[axis]-=epsilon; plus[axis]+=epsilon;
				const a = mapAnnularPoint(minus, ANNULAR_ANGLE).point, b = mapAnnularPoint(plus, ANNULAR_ANGLE).point;
				for (let c = 0; c < 2; c++) expect((b[c]-a[c])/(2*epsilon)).toBeCloseTo(exact[axis*2+c], 6);
			}
		}
	});
	it('responds to tangential hover, rejects radial torque, settles monotonically to exact rest, and preserves native held states', () => {
		const state = { angle: 0, held: false };
		for (let i=0;i<60;i++) advanceAnnular(state,1/120,{...idle,active:true,x:.815,y:.5,vx:0,vy:2});
		expect(state.angle).toBeGreaterThan(.25);
		let previous=state.angle;
		for (let i=0;i<200;i++) { advanceAnnular(state,1/120,idle); expect(state.angle).toBeLessThanOrEqual(previous); expect(state.angle).toBeGreaterThanOrEqual(0); previous=state.angle; }
		expect(state.angle).toBe(0);
		for (let i=0;i<60;i++) advanceAnnular(state,1/120,{...idle,active:true,x:.815,y:.5,vx:2});
		expect(state.angle).toBe(0);
		state.angle = -.32; state.held = true; advanceAnnular(state, 1/120, idle); expect(state.angle).toBe(-.32);
	});
});
