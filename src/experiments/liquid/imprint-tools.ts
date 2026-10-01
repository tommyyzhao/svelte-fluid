export type ImprintToolShape = 'signet' | 'rosette' | 'comb' | 'ring';
export interface ImprintTool { shape: ImprintToolShape; size: number; rotation: number; depth: number; bevel: number }
export interface ImprintMask { width: number; height: number; data: Uint8Array }
export interface ImprintProfile { width: number; height: number; data: Float32Array<ArrayBuffer> }
export interface Impression extends ImprintTool { x: number; y: number; response: number; clear?: boolean }
export const IMPRINT_CAPACITY = 32;
export const IMPRINT_COMMANDS = IMPRINT_CAPACITY * 2 + 1;
export const IMPRINT_MARK_RADIUS = 0.375;
export const ORIGINAL_SIGNET: Readonly<ImprintTool> = Object.freeze({ shape: 'signet', size: 0.46, rotation: 0, depth: 1, bevel: 0.012 });

export function imprintTool(tool: Partial<ImprintTool> = {}): ImprintTool {
	const result = { ...ORIGINAL_SIGNET, ...tool };
	if (!['signet', 'rosette', 'comb', 'ring'].includes(result.shape) ||
		![result.size, result.rotation, result.depth, result.bevel].every(Number.isFinite) ||
		result.size < 0.2 || result.size > 0.6 || result.depth < 0.15 || result.depth > 1 || result.bevel < 0.003 || result.bevel > 0.06) throw new Error('Invalid bounded imprint tool.');
	result.rotation = ((result.rotation % 360) + 360) % 360;
	return result;
}

/**
 * Separable lower-envelope squared Euclidean distance transform.
 * Algorithm: Felzenszwalb/Huttenlocher, Distance Transforms of Sampled Functions
 * https://theoryofcomputing.org/articles/v008a019/ (2012), independently implemented.
 * Exact distances to binary raster sample centers, NOT exact distances to font outlines.
 */
export function imprintDistanceProfile(mask: ImprintMask): ImprintProfile {
	const { width, height, data } = mask;
	if (![width, height].every((n) => Number.isInteger(n) && n > 0) || width * height > 16_777_216 || data.length !== width * height) throw new Error('Invalid native signet mask.');
	const count = width * height, far = width * width + height * height + 1;
	const outside = new Float32Array(count), inside = new Float32Array(count);
	for (let i = 0; i < count; i++) { outside[i] = data[i] >= 128 ? far : 0; inside[i] = data[i] >= 128 ? 0 : far; }
	const span = Math.max(width, height), f = new Float64Array(span), d = new Float64Array(span);
	const centers = new Int32Array(span), boundaries = new Float64Array(span + 1);
	function line(length: number) {
		let k = 0; centers[0] = 0; boundaries[0] = -Infinity; boundaries[1] = Infinity;
		for (let q = 1; q < length; q++) {
			let intersection = 0;
			do {
				const center = centers[k]; intersection = (f[q] + q * q - f[center] - center * center) / (2 * (q - center));
				if (intersection > boundaries[k]) break;
				k--;
			} while (k >= 0);
			k++; centers[k] = q; boundaries[k] = intersection; boundaries[k + 1] = Infinity;
		}
		k = 0;
		for (let q = 0; q < length; q++) { while (boundaries[k + 1] < q) k++; d[q] = (q - centers[k]) ** 2 + f[centers[k]]; }
	}
	for (const field of [outside, inside]) {
		for (let y = 0; y < height; y++) { for (let x = 0; x < width; x++) f[x] = field[y * width + x]; line(width); for (let x = 0; x < width; x++) field[y * width + x] = d[x]; }
		for (let x = 0; x < width; x++) { for (let y = 0; y < height; y++) f[y] = field[y * width + x]; line(height); for (let y = 0; y < height; y++) field[y * width + x] = d[y]; }
	}
	// Partial coverage estimates subpixel boundary location; fully covered cells
	// retain center-distance minus half a pixel. Rectangular masks use x units;
	// the component supplies a square signet, while supplied test images remain valid.
	for (let i = 0; i < count; i++) {
		const signed = Math.sqrt(outside[i]) - Math.sqrt(inside[i]);
		inside[i] = (data[i] > 0 && data[i] < 255 ? data[i] / 255 - 0.5 : Math.sign(signed) * Math.max(0, Math.abs(signed) - 0.5)) / width;
	}
	return { width, height, data: inside };
}

export class ImprintHistory {
	readonly impressions: Impression[] = [];
	get count() { return this.impressions.reduce((sum, item) => sum + Number(!item.clear), 0); }
	get marked() { return this.impressions.length > 0 && !this.impressions.at(-1)!.clear; }
	get settled() { return this.impressions.every((item) => item.response === 1); }
	stamp(x: number, y: number, tool: ImprintTool, immediate = false): boolean {
		if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
		const checked = imprintTool(tool);
		x = Math.max(0, Math.min(1, x)); y = Math.max(0, Math.min(1, y));
		// Press on the wax, not the surrounding square hit target. Tool bodies may
		// straddle the edge, but off-wax centers are intentionally not operations.
		if (Math.hypot(x - 0.5, y - 0.5) > IMPRINT_MARK_RADIUS) return false;
		if (this.count >= IMPRINT_CAPACITY && !(immediate && this.impressions.some((item) => item.clear))) return false;
		if (immediate) this.finish();
		if (this.count >= IMPRINT_CAPACITY) return false;
		this.impressions.push({ ...checked, x, y, response: Number(immediate) });
		return true;
	}
	smooth(immediate = false) {
		if (immediate) { this.impressions.length = 0; return; }
		if (this.impressions.length && !this.impressions.at(-1)!.clear) this.impressions.push({ ...ORIGINAL_SIGNET, x: 0.5, y: 0.5, response: 0, clear: true });
	}
	advance(dt: number) {
		if (!Number.isFinite(dt) || dt <= 0) return;
		const decay = Math.exp(-14 * Math.min(dt, 0.05));
		for (const item of this.impressions) if (item.response < 1) item.response = 1 - (1 - item.response) * decay;
	}
	finish() {
		const clear = this.impressions.findLastIndex((item) => item.clear);
		if (clear >= 0) this.impressions.splice(0, clear + 1);
		for (const item of this.impressions) item.response = 1;
	}
	reset() { this.impressions.length = 0; }
}

function profileDistance(profile: ImprintProfile, x: number, y: number) {
	const px = x * profile.width - 0.5, py = y * profile.height - 0.5, ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
	const at = (a: number, b: number) => profile.data[Math.max(0, Math.min(profile.height - 1, b)) * profile.width + Math.max(0, Math.min(profile.width - 1, a))];
	return (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy;
}
export function impressionDepth(item: Impression, x: number, y: number, profile: ImprintProfile, footprint = 0): number {
	const angle = item.rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle), dx = (x - item.x) / item.size, dy = (y - item.y) / item.size;
	const u = dx * c + dy * s, v = -dx * s + dy * c;
	if (Math.abs(u) > 0.5 || Math.abs(v) > 0.5 || Math.hypot(x - 0.5, y - 0.5) > IMPRINT_MARK_RADIUS) return 0;
	const r = Math.hypot(u, v); let distance = 0;
	if (item.shape === 'signet') distance = profileDistance(profile, u + 0.5, v + 0.5);
	else if (item.shape === 'ring') distance = 0.025 - Math.abs(r - 0.31);
	else if (item.shape === 'rosette') distance = 0.024 - Math.abs(r - (0.285 + 0.055 * Math.cos(8 * Math.atan2(v, u))));
	else { const tooth = ((u + 0.0375) % 0.075 + 0.075) % 0.075 - 0.0375; distance = Math.min(0.011 - Math.abs(tooth), 0.30 - Math.abs(v), 0.31 - Math.abs(u)); }
	distance = Math.min(distance, 0.5 - Math.abs(u), 0.5 - Math.abs(v));
	const t = Math.max(0, Math.min(1, 0.5 + distance / Math.max(item.bevel, footprint / item.size)));
	return item.depth * t * t * (3 - 2 * t);
}

/** Exact first-order response to ordered changes in maximum-depth plastic rest. */
export function imprintAt(history: readonly Impression[], x: number, y: number, profile: ImprintProfile, footprint = 0) {
	let rest = 0, height = 0, exact = true;
	for (const item of history) {
		const next = item.clear ? 0 : Math.max(rest, impressionDepth(item, x, y, profile, footprint));
		height += (next - rest) * item.response; rest = next; exact &&= item.response === 1;
	}
	return { rest, height: exact ? rest : Math.max(0, Math.min(1, height)) };
}
