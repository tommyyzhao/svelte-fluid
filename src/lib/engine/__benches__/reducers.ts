export type FluxOrientation = 'horizontal' | 'vertical';

export interface PeakSample {
	index: number;
	value: number;
}

const clampIndex = (value: number, size: number): number => {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(size - 1, Math.floor(value)));
};

export function l2Norm(values: ArrayLike<number>): number {
	let sum = 0;
	for (let i = 0; i < values.length; i++) {
		const value = values[i];
		sum += value * value;
	}
	return Math.sqrt(sum);
}

/**
 * Compute the RMS divergence of a vector field represented as `[vx, vy]` pairs.
 */
export function divergenceL2(
	velocity: ArrayLike<number>,
	width: number,
	height: number,
	components: 2 | 4 = 2
): number {
	if (width <= 1 || height <= 1) return 0;
	if (components !== 2 && components !== 4) return 0;

	const n = width * height;
	let sum = 0;

	for (let y = 0; y < height; y++) {
		const yPrev = (y - 1 + height) % height;
		const yNext = (y + 1) % height;
		for (let x = 0; x < width; x++) {
			const xPrev = (x - 1 + width) % width;
			const xNext = (x + 1) % width;

			const here = (y * width + x) * components;
			const left = (y * width + xPrev) * components;
			const right = (y * width + xNext) * components;
			const up = ((yNext * width + x) * components);
			const down = ((yPrev * width + x) * components);

			const vxL = velocity[left];
			const vxR = velocity[right];
			const vyD = velocity[down + 1];
			const vyU = velocity[up + 1];

			const divergence = 0.5 * ((vxR - vxL) + (vyU - vyD));
			sum += divergence * divergence;
		}
	}

	return Math.sqrt(sum / n);
}

/**
 * Track the largest magnitude value on an index-specified path.
 */
export function trackPeakAlongPath(
	values: ArrayLike<number>,
	start: number,
	stop: number,
	step = 1
): PeakSample {
	if (!Number.isFinite(start) || !Number.isFinite(stop) || step === 0) {
		return { index: -1, value: 0 };
	}
	const n = values.length;
	if (n === 0) return { index: -1, value: 0 };

	const lo = clampIndex(Math.min(start, stop), n);
	const hi = clampIndex(Math.max(start, stop), n);
	const direction = stop >= start ? 1 : -1;
	const stride = Math.max(1, Math.floor(Math.abs(step))) * direction;

	// Walk from the requested start toward the stop. A descending path must seed
	// at `hi` and step down into [lo, hi]; seeding at `lo` with a negative stride
	// stepped straight out of range, so the reverse scan never ran.
	const from = direction > 0 ? lo : hi;
	const to = direction > 0 ? hi : lo;

	let peakIndex = from;
	let peakValue = Math.abs(values[from]);
	for (let i = from + stride; direction > 0 ? i <= to : i >= to; i += stride) {
		const value = Math.abs(values[i]);
		if (value > peakValue) {
			peakIndex = i;
			peakValue = value;
		}
	}

	return { index: peakIndex, value: peakValue };
}

/**
 * Count strict sign flips in a sequence.
 */
export function signChangeCount(values: ArrayLike<number>): number {
	let count = 0;
	let previous: number | null = null;

	for (let i = 0; i < values.length; i++) {
		const value = values[i];
		if (!Number.isFinite(value)) continue;
		if (value === 0) continue;
		const sign = value < 0 ? -1 : 1;
		if (previous !== null && sign !== previous) {
			count++;
		}
		previous = sign;
	}

	return count;
}

export interface FluxAcrossLineOptions {
	component?: number;
	components?: 1 | 2 | 3 | 4;
	orientation?: FluxOrientation;
	line?: number;
}

/**
 * Sum a single component along a horizontal or vertical line through a field.
 */
export function fluxAcrossLine(
	field: ArrayLike<number>,
	width: number,
	height: number,
	options: FluxAcrossLineOptions = {}
): number {
	const component = options.component ?? 0;
	const components = options.components ?? 1;
	const orientation = options.orientation ?? 'horizontal';
	if (width <= 0 || height <= 0) return 0;
	if (components <= component || component < 0) return 0;

	const y = clampIndex(options.line ?? Math.floor((height - 1) / 2), height);
	const x = clampIndex(options.line ?? Math.floor((width - 1) / 2), width);

	let total = 0;
	if (orientation === 'horizontal') {
		for (let i = 0; i < width; i++) {
			total += field[(y * width + i) * components + component] as number;
		}
		return total;
	}

	for (let i = 0; i < height; i++) {
		total += field[(i * width + x) * components + component] as number;
	}
	return total;
}

/**
 * Detect invalid numbers (`NaN`, `Infinity`, `-Infinity`) in readback buffers.
 */
export function hasNonFinite(field: ArrayLike<number>): boolean {
	for (let i = 0; i < field.length; i++) {
		if (!Number.isFinite(field[i])) return true;
	}
	return false;
}

/**
 * Field energy as RMS magnitude.
 */
export function fieldEnergy(field: ArrayLike<number>): number {
	const n = field.length;
	if (n === 0) return 0;
	let sum = 0;
	for (let i = 0; i < n; i++) {
		const value = field[i];
		sum += value * value;
	}
	return Math.sqrt(sum / n);
}
