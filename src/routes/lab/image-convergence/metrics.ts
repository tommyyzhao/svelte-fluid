export const images = [
	'the-kiss.jpg',
	'earth.jpg',
	'fluid-text.png',
	'great-wave.jpg',
	'pearl-earring.jpg',
	'starry-night.jpg',
	'water-lilies.jpg',
	'mona-lisa.jpg',
	'flat.png',
	'birth-of-venus.png',
];
export const seeds = [5, 11, 23];
export function restProof(
	a: { settled: boolean; paused: boolean; draws: number; frameCount: number },
	b: { settled: boolean; paused: boolean; draws: number; frameCount: number }
): boolean {
	return (
		a.settled &&
		a.paused &&
		b.settled &&
		b.paused &&
		a.draws === b.draws &&
		a.frameCount === b.frameCount
	);
}
export function flatTransportPair(
	baselineChange: number,
	candidateChange: number
): boolean {
	return baselineChange < 1 / 255 && candidateChange < 1 / 255;
}
export function settledTimestamp(
	previous: number,
	final: boolean,
	elapsed: number
): number {
	return final ? previous || elapsed : 0;
}
export function median(values: number[]): number {
	const a = [...values].sort((x, y) => x - y);
	return a.length
		? (a[Math.floor(a.length / 2)] + a[Math.ceil(a.length / 2) - 1]) / 2
		: NaN;
}
export function noise(values: number[], zeroDenominator = 1): number {
	return (
		(Math.max(...values) - Math.min(...values)) /
		(median(values) || zeroDenominator)
	);
}
export function lab(r: number, g: number, b: number): number[] {
	const linear = (v: number) =>
		v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4;
	[r, g, b] = [r, g, b].map(linear);
	const f = (v: number) =>
		v > (6 / 29) ** 3 ? Math.cbrt(v) : v / (3 * (6 / 29) ** 2) + 4 / 29;
	const x = f((r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047);
	const y = f(r * 0.2126729 + g * 0.7151522 + b * 0.072175);
	const z = f((r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883);
	return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function fidelity(
	a: ArrayLike<number>,
	b: ArrayLike<number>,
	width: number,
	height: number
): { ssim: number; deltaE76: number; exact: boolean } {
	if (
		!Number.isInteger(width) ||
		!Number.isInteger(height) ||
		width <= 0 ||
		height <= 0 ||
		a.length !== width * height * 4 ||
		b.length !== a.length
	)
		throw new RangeError('Invalid RGBA image dimensions');
	let delta = 0,
		ssim = 0,
		windows = 0,
		exact = true;
	const luma = (p: ArrayLike<number>, i: number) =>
		(p[i] * 0.2126 + p[i + 1] * 0.7152 + p[i + 2] * 0.0722) / 255;
	for (let i = 0; i < a.length; i += 4) {
		const x = lab(a[i], a[i + 1], a[i + 2]),
			y = lab(b[i], b[i + 1], b[i + 2]);
		delta += Math.hypot(...x.map((v, j) => v - y[j]));
		for (let c = 0; c < 4; c++) exact &&= a[i + c] === b[i + c];
	}
	for (let yy = 0; yy < height; yy += 8)
		for (let xx = 0; xx < width; xx += 8) {
			let n = 0,
				x = 0,
				y = 0,
				x2 = 0,
				y2 = 0,
				xy = 0;
			for (let j = yy; j < Math.min(height, yy + 8); j++)
				for (let k = xx; k < Math.min(width, xx + 8); k++) {
					const i = (j * width + k) * 4,
						u = luma(a, i),
						v = luma(b, i);
					n++;
					x += u;
					y += v;
					x2 += u * u;
					y2 += v * v;
					xy += u * v;
				}
			x /= n;
			y /= n;
			ssim +=
				((2 * x * y + 0.0001) * (2 * (xy / n - x * y) + 0.0009)) /
				((x * x + y * y + 0.0001) * (x2 / n - x * x + y2 / n - y * y + 0.0009));
			windows++;
		}
	return { ssim: ssim / windows, deltaE76: delta / (width * height), exact };
}
