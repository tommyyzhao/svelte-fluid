import { describe, expect, it } from 'vitest';
import { presentationSize } from './presentation-size.js';

describe('private presentation size', () => {
	it('matches native 2x and 3x pixel density without changing simulation density', () => {
		expect(presentationSize(1400, 660, 2)).toEqual({ width: 2800, height: 1320 });
		expect(presentationSize(390, 844, 3)).toEqual({ width: 1170, height: 2532 });
		expect(presentationSize(1600, 900, 2)).toEqual({ width: 3200, height: 1800 });
	});
	it('uses actual 1x and fractional DPR rather than a quality preset', () => {
		expect(presentationSize(900, 480, 1)).toEqual({ width: 900, height: 480 });
		expect(presentationSize(900.5, 480.25, 1.25)).toEqual({ width: 1126, height: 600 });
	});
	it('rejects oversized targets rather than silently making them non-native', () => {
		expect(presentationSize(2560, 1440, 2)).toEqual({ width: 5120, height: 2880 });
		expect(() => presentationSize(2000, 1000, 2, 1024)).toThrow('no lower-resolution substitute');
		expect(() => presentationSize(3000, 3000, 2)).toThrow('resource limit');
		expect(() => presentationSize(1e9, 1, 1)).toThrow('resource limit');
	});
	it('handles hidden or fractional-size elements without an arbitrary 8px floor', () => {
		expect(presentationSize(0, 0, 2)).toEqual({ width: 1, height: 1 });
		expect(presentationSize(0.25, 0.5, 3)).toEqual({ width: 1, height: 2 });
		expect(() => presentationSize(NaN, Infinity, NaN)).toThrow('finite');
		expect(presentationSize(100, 100, -1)).toEqual({ width: 100, height: 100 });
	});
});
