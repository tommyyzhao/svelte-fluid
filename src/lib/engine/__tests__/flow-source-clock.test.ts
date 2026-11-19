import { describe, expect, it } from 'vitest';
import { DEFAULTS, resolveConfig } from '../FluidEngine.js';
import { flowDyeAt, flowPulseGain } from '../flow-source-clock.js';
import type { FlowSource } from '../types.js';

const A = { r: 1, g: 0, b: 0 };
const B = { r: 0, g: 1, b: 0 };
const C = { r: 0, g: 0, b: 1 };

describe('flowPulseGain', () => {
	it('peaks at 1 at t=0 and sits at floor half a period later', () => {
		const p = { period: 1.2, floor: 1 / 3, sharpness: 12 };
		expect(flowPulseGain(p, 0)).toBeCloseTo(1, 12);
		expect(flowPulseGain(p, 0.6)).toBeCloseTo(1 / 3, 12);
	});
	it('is periodic', () => {
		const p = { period: 1.2, floor: 0.2 };
		for (const t of [0.05, 0.3, 0.9]) expect(flowPulseGain(p, t + 1.2)).toBeCloseTo(flowPulseGain(p, t), 9);
	});
	it('defaults floor to 0 and sharpness to 12', () => {
		expect(flowPulseGain({ period: 1 }, 0.5)).toBe(0);
		expect(flowPulseGain({ period: 1 }, 0.1)).toBeCloseTo(Math.cos(0.2 * Math.PI) ** 12, 12);
	});
});

describe('flowDyeAt', () => {
	const cycle = { period: 6, colors: [A, B, C] };
	it('visits each colour at its slot and wraps', () => {
		expect(flowDyeAt(cycle, 0)).toEqual(A);
		expect(flowDyeAt(cycle, 2)).toEqual(B);
		expect(flowDyeAt(cycle, 6)).toEqual(A);
		expect(flowDyeAt(cycle, -4)).toEqual(B);
	});
	it('interpolates linearly', () => {
		expect(flowDyeAt(cycle, 1)).toEqual({ r: 0.5, g: 0.5, b: 0 });
	});
});

describe('resolveConfig validation', () => {
	const src = (extra: Partial<FlowSource>): FlowSource => ({ kind: 'point', x: 0.5, y: 0.5, velocity: { x: 1, y: 0 }, ...extra }) as FlowSource;
	const resolve = (extra: Partial<FlowSource>) => resolveConfig({ flow: { sources: [src(extra)] } }, DEFAULTS);

	it('accepts a valid pulse and dyeCycle', () => {
		expect(() => resolve({ pulse: { period: 1, floor: 0, sharpness: 1 }, dyeCycle: { period: 3, colors: [A, B] } })).not.toThrow();
	});
	it.each([0, -1, NaN])('rejects pulse.period %s', (period) => {
		expect(() => resolve({ pulse: { period } })).toThrow(RangeError);
	});
	it.each([-0.1, 1.1])('rejects pulse.floor %s', (floor) => {
		expect(() => resolve({ pulse: { period: 1, floor } })).toThrow(/floor/);
	});
	it('rejects pulse.sharpness below 1', () => {
		expect(() => resolve({ pulse: { period: 1, sharpness: 0.5 } })).toThrow(/sharpness/);
	});
	it('rejects malformed dyeCycle', () => {
		expect(() => resolve({ dyeCycle: { period: 0, colors: [A, B] } })).toThrow(/dyeCycle.period/);
		expect(() => resolve({ dyeCycle: { period: 1, colors: [A] } })).toThrow(/at least two/);
		expect(() => resolve({ dyeCycle: { period: 1, colors: [A, { r: -1, g: 0, b: 0 }] } })).toThrow(/non-negative/);
	});
	it('validates sources that are not inflow', () => {
		expect(() => resolve({ inflow: false, pulse: { period: -1 } })).toThrow(RangeError);
	});
});
