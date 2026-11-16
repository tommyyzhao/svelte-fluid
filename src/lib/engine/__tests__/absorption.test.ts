import { describe, expect, it } from 'vitest';
import { DEFAULTS, resolveConfig } from '../FluidEngine.js';
import { displayShaderSource } from '../shaders.js';
import type { FlowVisualization, RGB } from '../types.js';

const absorbance: [RGB, RGB, RGB] = [
	{ r: 6, g: 2, b: 0.2 },
	{ r: 2, g: 0.05, b: 5 },
	{ r: 0.2, g: 0.02, b: 0.12 }
];
const transmit = (concentration: number[]) =>
	(['r', 'g', 'b'] as const).map((channel) =>
		Math.exp(-absorbance.reduce((tau, species, i) => tau + species[channel] * concentration[i], 0))
	);
const resolve = (absorption: FlowVisualization['absorption']) =>
	resolveConfig({ flow: { visualization: { absorption } } }, DEFAULTS);

describe('Beer–Lambert species transmission', () => {
	it('clear carrier transmits white; optical depths add, overlapping blue/green darkens green', () => {
		expect(transmit([0, 0, 0])).toEqual([1, 1, 1]);
		const blue = transmit([1, 0, 0]), green = transmit([0, 1, 0]), mixed = transmit([1, 1, 0]);
		for (let i = 0; i < 3; i++) {
			expect(mixed[i]).toBeCloseTo(blue[i] * green[i], 14);
			expect(mixed[i]).toBeLessThan(Math.min(blue[i], green[i]));
		}
		expect(mixed[1]).toBeGreaterThan(mixed[0] * 10);
		expect(mixed[1]).toBeGreaterThan(mixed[2] * 10);
		expect(displayShaderSource).toContain('uBacklight * exp(-tau)');
		expect(displayShaderSource).toContain('concentration.r * uAbsorbance0');
	});
	it('omission preserves defaults; zero coefficients/backlight are valid', () => {
		expect(resolve(undefined).FLOW?.visualization?.absorption).toBeUndefined();
		expect(() => resolve({ absorbance })).not.toThrow();
		expect(() => resolve({ absorbance: absorbance.map(() => ({ r: 0, g: 0, b: 0 })) as [RGB, RGB, RGB], backlight: { r: 0, g: 0, b: 0 } })).not.toThrow();
	});
	it.each([-1, NaN, Infinity, -Infinity, undefined])('rejects invalid RGB component %s before a transition', (value) => {
		for (const key of ['r', 'g', 'b']) {
			expect(() => resolve({ absorbance: [{ ...absorbance[0], [key]: value }, absorbance[1], absorbance[2]] })).toThrow(RangeError);
			expect(() => resolve({ absorbance, backlight: { r: 1, g: 1, b: 1, [key]: value } })).toThrow(RangeError);
		}
	});
	it('rejects malformed species matrices and simultaneous emission', () => {
		for (const matrix of [null, {}, [], [absorbance[0]], [...absorbance, absorbance[0]], [null, absorbance[1], absorbance[2]]])
			expect(() => resolve({ absorbance: matrix as [RGB, RGB, RGB] })).toThrow(RangeError);
		expect(() => resolveConfig({ flow: { visualization: { absorption: { absorbance }, emission: { scalar: 'temperature', intensity: 1, excitation: 1 } } } }, DEFAULTS)).toThrow(/mutually exclusive/);
	});
});
