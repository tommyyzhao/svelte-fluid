/*
 * Fine-texture metric for liquid-control readback tests: RMS of 8-bit sRGB
 * luminance minus its 7×7 box mean, over the track interior (the straight
 * section, inset from the rim). Smooth shading at the wave scale passes the
 * box mean almost unchanged; grid-scale mottling and noise do not.
 */
export interface TrackRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export function mottle(canvas: HTMLCanvasElement, dpr: number, rect: TrackRect, inset = 8): number {
	const copy = document.createElement('canvas');
	copy.width = canvas.width;
	copy.height = canvas.height;
	const ctx = copy.getContext('2d')!;
	ctx.drawImage(canvas, 0, 0);
	const { data, width } = ctx.getImageData(0, 0, copy.width, copy.height);
	const lum = (x: number, y: number) => {
		const i = (y * width + x) * 4;
		return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
	};
	const cap = rect.height / 2;
	const x0 = Math.ceil((rect.x + cap + inset) * dpr) + 3;
	const x1 = Math.floor((rect.x + rect.width - cap - inset) * dpr) - 3;
	const y0 = Math.ceil((rect.y + inset) * dpr) + 3;
	const y1 = Math.floor((rect.y + rect.height - inset) * dpr) - 3;
	let sum = 0;
	let n = 0;
	for (let y = y0; y < y1; y++)
		for (let x = x0; x < x1; x++) {
			let m = 0;
			for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) m += lum(x + i, y + j);
			const d = lum(x, y) - m / 49;
			sum += d * d;
			n++;
		}
	return Math.sqrt(sum / n);
}
