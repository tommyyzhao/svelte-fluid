import { hexToLinear, mixOverPaper, pigmentFromToken, WATERCOLOUR_S } from '../pigment/spectral.js';

/** Linear RGB simplex: x = sap fraction, y = rose fraction, remainder = dew. */
export function mixtureLut(palette: readonly [string, string, string], size = 64): Float32Array {
	if (!Number.isInteger(size) || size < 2 || size > 256) throw new RangeError('Liquid palette size must be an integer from 2 to 256');
	if (palette.length !== 3 || palette.some((c) => !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c))) {
		throw new TypeError('Liquid palette needs three sRGB hex colours');
	}
	const paper = '#fff7e8';
	const pigments = palette.map((hex) => pigmentFromToken(hex, WATERCOLOUR_S, 1));
	// The reduced spectral bands introduce a small endpoint error; preserve the supplied tokens.
	const correction = palette.map((hex, i) => {
		const pure = mixOverPaper(
			pigments,
			[0, 1, 2].map((j) => +(i === j)),
			paper
		);
		return hexToLinear(hex).map((v, j) => v - pure[j]);
	});
	const data = new Float32Array(size * size * 4);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const b = x / (size - 1);
			const c = y / (size - 1);
			const weights = [Math.max(0, 1 - b - c), b, c];
			const sum = weights.reduce((a, v) => a + v, 0);
			weights.forEach((v, i) => (weights[i] = v / sum));
			const rgb = mixOverPaper(pigments, weights, paper);
			const at = (y * size + x) * 4;
			for (let j = 0; j < 3; j++) {
				data[at + j] = Math.max(0, Math.min(1, rgb[j] + weights.reduce((s, w, i) => s + w * correction[i][j], 0)));
			}
			// A small mixture-only glaze lift keeps subtractive greens jewel-like; endpoints stay exact.
			const mixed = 1 - Math.max(...weights);
			const peak = Math.max(data[at], data[at + 1], data[at + 2]);
			const floor = Math.min(data[at], data[at + 1], data[at + 2]);
			for (let j = 0; j < 3; j++) {
				const chroma = peak > floor ? (data[at + j] - floor) / (peak - floor) : 0;
				data[at + j] = Math.max(0, Math.min(1, data[at + j] + mixed * 0.32 * (chroma - 0.28)));
			}
			data[at + 3] = 1;
		}
	}
	return data;
}
