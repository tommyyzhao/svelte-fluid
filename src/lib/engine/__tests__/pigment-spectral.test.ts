import { describe, expect, it } from 'vitest';
import {
	WATERCOLOUR_S,
	hexToLinear,
	hue,
	linearToHex,
	mixOverPaper,
	pigmentFromToken,
	parseHex
} from '../pigment/spectral.js';

const yellow = pigmentFromToken('#f2c230', WATERCOLOUR_S, 1);
const blue = pigmentFromToken('#1f3fbf', WATERCOLOUR_S, 1);
const maxDiff = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

describe('pigment spectral maths', () => {
	it('yellow + blue (2:1) glaze to a green hue', () => {
		const h = hue(mixOverPaper([yellow, blue], [1, 0.5], '#ffffff'));
		expect(h).toBeGreaterThan(110);
		expect(h).toBeLessThan(180);
	});

	it('mixing is commutative', () => {
		const ab = mixOverPaper([yellow, blue], [0.4, 0.7], '#f6f0e2');
		const ba = mixOverPaper([blue, yellow], [0.7, 0.4], '#f6f0e2');
		expect(maxDiff(ab, ba)).toBeLessThan(1e-9);
	});

	it('zero pigment shows the paper', () => {
		for (const paper of ['#f6f0e2', '#ffffff', '#15171c']) {
			const out = mixOverPaper([yellow, blue], [0, 0], paper);
			expect(maxDiff(out, hexToLinear(paper))).toBeLessThan(0.01);
		}
	});

	it('design tokens round-trip at unit concentration', () => {
		for (const token of ['#f2c230', '#1f3fbf', '#c23b68', '#2e9a5e', '#3b3f9e']) {
			const wc = mixOverPaper([pigmentFromToken(token, WATERCOLOUR_S, 1)], [1], '#ffffff');
			expect(maxDiff(parseHex(linearToHex(wc)), parseHex(token))).toBeLessThan(0.025);
		}
	});
});
