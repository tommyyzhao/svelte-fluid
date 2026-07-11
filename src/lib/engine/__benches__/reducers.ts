export type FluxOrientation = 'horizontal' | 'vertical';

export interface PeakSample {
	index: number;
	value: number;
}

export interface DivergenceStats {
	rms: number;
	max: number;
	fluidCells: number;
}

export interface SolidFaceFluxStats {
	meanAbs: number;
	maxAbs: number;
	faceCount: number;
}

export interface MirrorSymmetryStats {
	normalizedRms: number;
	pairs: number;
}

export interface ObstacleAdjacentSpectralStats {
	fraction: number;
	fluidCells: number;
}

export interface WeightedLineFluxStats {
	net: number;
	meanAbs: number;
	weight: number;
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
			const up = (yNext * width + x) * components;
			const down = (yPrev * width + x) * components;

			const vxL = velocity[left];
			const vxR = velocity[right];
			const vyD = velocity[down + 1];
			const vyU = velocity[up + 1];

			const divergence = 0.5 * (vxR - vxL + (vyU - vyD));
			sum += divergence * divergence;
		}
	}

	return Math.sqrt(sum / n);
}

/**
 * Measure the post-projection divergence of a collocated velocity field using
 * the same closed/solid ghost-value convention as `divergenceShader`.
 * `solid` is one byte/value per cell where values > 0.5 are blocked.
 */
export function divergenceStats(
	velocity: ArrayLike<number>,
	width: number,
	height: number,
	components: 2 | 4 = 2,
	solid?: ArrayLike<number>
): DivergenceStats {
	if (width <= 0 || height <= 0 || (components !== 2 && components !== 4)) {
		return { rms: 0, max: 0, fluidCells: 0 };
	}

	const isSolid = (x: number, y: number): boolean =>
		x < 0 || x >= width || y < 0 || y >= height || (solid?.[y * width + x] ?? 0) > 0.5;
	const sample = (x: number, y: number, component: 0 | 1): number =>
		velocity[(y * width + x) * components + component] as number;

	let sumSquares = 0;
	let max = 0;
	let fluidCells = 0;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (isSolid(x, y)) continue;
			const cx = sample(x, y, 0);
			const cy = sample(x, y, 1);
			const left = isSolid(x - 1, y) ? -cx : sample(x - 1, y, 0);
			const right = isSolid(x + 1, y) ? -cx : sample(x + 1, y, 0);
			const top = isSolid(x, y + 1) ? -cy : sample(x, y + 1, 1);
			const bottom = isSolid(x, y - 1) ? -cy : sample(x, y - 1, 1);
			const divergence = 0.5 * (right - left + top - bottom);
			const magnitude = Math.abs(divergence);
			sumSquares += divergence * divergence;
			max = Math.max(max, magnitude);
			fluidCells++;
		}
	}

	return {
		rms: fluidCells > 0 ? Math.sqrt(sumSquares / fluidCells) : 0,
		max,
		fluidCells
	};
}

/** Largest vector magnitude in a two-component velocity field. */
export function peakVectorMagnitude(
	velocity: ArrayLike<number>,
	width: number,
	height: number,
	components: 2 | 4 = 2
): number {
	if (width <= 0 || height <= 0 || (components !== 2 && components !== 4)) return 0;
	let peak = 0;
	for (let i = 0; i < width * height; i++) {
		const offset = i * components;
		peak = Math.max(peak, Math.hypot(velocity[offset] as number, velocity[offset + 1] as number));
	}
	return peak;
}

/**
 * Collocated no-through-flow proxy: absolute normal velocity in each fluid
 * cell adjacent to a solid cell. Each fluid/solid face is counted once.
 */
export function solidFaceFluxStats(
	velocity: ArrayLike<number>,
	width: number,
	height: number,
	solid: ArrayLike<number>,
	components: 2 | 4 = 2
): SolidFaceFluxStats {
	if (width <= 0 || height <= 0 || (components !== 2 && components !== 4)) {
		return { meanAbs: 0, maxAbs: 0, faceCount: 0 };
	}
	const isSolid = (x: number, y: number): boolean =>
		x >= 0 && x < width && y >= 0 && y < height && (solid[y * width + x] ?? 0) > 0.5;
	let total = 0;
	let maxAbs = 0;
	let faceCount = 0;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (isSolid(x, y)) continue;
			const offset = (y * width + x) * components;
			const vx = Math.abs(velocity[offset] as number);
			const vy = Math.abs(velocity[offset + 1] as number);
			for (const [dx, dy, normal] of [
				[-1, 0, vx],
				[1, 0, vx],
				[0, -1, vy],
				[0, 1, vy]
			] as const) {
				if (!isSolid(x + dx, y + dy)) continue;
				total += normal;
				maxAbs = Math.max(maxAbs, normal);
				faceCount++;
			}
		}
	}
	return { meanAbs: faceCount > 0 ? total / faceCount : 0, maxAbs, faceCount };
}

/**
 * Horizontal-mirror error for a vector field. A symmetric left-to-right flow
 * keeps `vx(x,y) = vx(x,1-y)` and flips `vy`; the result is normalized by the
 * mirrored signal energy so scenes with different forcing remain comparable.
 */
export function horizontalMirrorSymmetryStats(
	velocity: ArrayLike<number>,
	width: number,
	height: number,
	components: 2 | 4 = 2,
	solid?: ArrayLike<number>
): MirrorSymmetryStats {
	if (width <= 0 || height <= 1 || (components !== 2 && components !== 4)) {
		return { normalizedRms: 0, pairs: 0 };
	}
	let error = 0;
	let signal = 0;
	let pairs = 0;
	for (let y = 0; y < Math.floor(height / 2); y++) {
		const mirrorY = height - 1 - y;
		for (let x = 0; x < width; x++) {
			const aCell = y * width + x;
			const bCell = mirrorY * width + x;
			if ((solid?.[aCell] ?? 0) > 0.5 || (solid?.[bCell] ?? 0) > 0.5) continue;
			const a = aCell * components;
			const b = bCell * components;
			const ax = velocity[a] as number;
			const ay = velocity[a + 1] as number;
			const bx = velocity[b] as number;
			const by = velocity[b + 1] as number;
			error += (ax - bx) ** 2 + (ay + by) ** 2;
			signal += ax * ax + ay * ay + bx * bx + by * by;
			pairs++;
		}
	}
	return {
		normalizedRms: signal > 0 ? Math.sqrt(error / signal) : 0,
		pairs
	};
}

/**
 * High-pass energy restricted to fluid cells sharing a face with a solid.
 * This catches cell-scale boundary chatter without letting calm bulk fluid
 * dilute the signal.
 */
export function obstacleAdjacentGridScaleEnergyFraction(
	field: ArrayLike<number>,
	width: number,
	height: number,
	solid: ArrayLike<number>,
	components: 2 | 4 = 2
): ObstacleAdjacentSpectralStats {
	if (width <= 2 || height <= 2 || (components !== 2 && components !== 4)) {
		return { fraction: 0, fluidCells: 0 };
	}
	const isSolid = (x: number, y: number): boolean =>
		x < 0 || x >= width || y < 0 || y >= height || (solid[y * width + x] ?? 0) > 0.5;
	let totalEnergy = 0;
	let highPassEnergy = 0;
	let fluidCells = 0;
	for (let y = 1; y < height - 1; y++) {
		for (let x = 1; x < width - 1; x++) {
			if (isSolid(x, y)) continue;
			const solidLeft = isSolid(x - 1, y);
			const solidRight = isSolid(x + 1, y);
			const solidBottom = isSolid(x, y - 1);
			const solidTop = isSolid(x, y + 1);
			if (!solidLeft && !solidRight && !solidBottom && !solidTop) continue;
			const cell = (y * width + x) * components;
			for (let component = 0; component < components; component++) {
				const center = field[cell + component] as number;
				const accumulateTangentialResidual = (dx: number, dy: number): void => {
					if (isSolid(x - dx, y - dy) || isSolid(x + dx, y + dy)) return;
					const before = field[((y - dy) * width + x - dx) * components + component] as number;
					const after = field[((y + dy) * width + x + dx) * components + component] as number;
					const residual = (2 * center - before - after) * 0.25;
					totalEnergy += center * center;
					highPassEnergy += residual * residual;
				};
				// Remove the physical wall-normal boundary layer from the proxy:
				// only second differences tangent to the locally blocked face count.
				if (solidLeft || solidRight) accumulateTangentialResidual(0, 1);
				if (solidBottom || solidTop) accumulateTangentialResidual(1, 0);
			}
			fluidCells++;
		}
	}
	return {
		fraction: totalEnergy > 0 ? Math.sqrt(highPassEnergy / totalEnergy) : 0,
		fluidCells
	};
}

/**
 * Track the largest magnitude value on an index-specified path.
 */
export function trackPeakAlongPath(values: ArrayLike<number>, start: number, stop: number, step = 1): PeakSample {
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

/** Integrate a line flux with per-cell 0..1 weights (for intended subcell barriers). */
export function weightedFluxAcrossLine(
	field: ArrayLike<number>,
	width: number,
	height: number,
	weights: ArrayLike<number>,
	options: FluxAcrossLineOptions = {}
): WeightedLineFluxStats {
	const component = options.component ?? 0;
	const components = options.components ?? 1;
	const orientation = options.orientation ?? 'horizontal';
	if (width <= 0 || height <= 0 || component < 0 || component >= components) {
		return { net: 0, meanAbs: 0, weight: 0 };
	}
	const y = clampIndex(options.line ?? Math.floor((height - 1) / 2), height);
	const x = clampIndex(options.line ?? Math.floor((width - 1) / 2), width);
	let net = 0;
	let absolute = 0;
	let weight = 0;
	const accumulate = (cell: number): void => {
		const cellWeight = Math.max(0, Math.min(1, weights[cell] ?? 0));
		const value = field[cell * components + component] as number;
		net += value * cellWeight;
		absolute += Math.abs(value) * cellWeight;
		weight += cellWeight;
	};
	if (orientation === 'horizontal') {
		for (let i = 0; i < width; i++) accumulate(y * width + i);
	} else {
		for (let i = 0; i < height; i++) accumulate(i * width + x);
	}
	return { net, meanAbs: weight > 0 ? absolute / weight : 0, weight };
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

/**
 * Normalized grid-scale content of a field: the RMS amplitude of its high-pass
 * component (field minus its 3×3 box blur) over the RMS amplitude of the field
 * itself, i.e. √(gridScaleEnergy / totalEnergy).
 *
 * Note this is an *amplitude* ratio (the √ of the energy fraction), deliberately
 * so — it is bounded in ~[0, 1] and linear in per-cell contrast, which makes a
 * stable regression band trivial to set. High values mean sharp per-cell
 * alternation (the MacCormack grid-scale churn mode); low values mean smoother,
 * cell-scale-coherent flow. The checkerboard known-answer test (>0.8) and the
 * per-scene bench bands are tuned to this √ convention — drop the √ and every
 * threshold shifts.
 */
export function gridScaleEnergyFraction(
	field: ArrayLike<number>,
	width: number,
	height: number,
	components: 2 | 4 = 2
): number {
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 2 || height <= 2) return 0;
	if (components !== 2 && components !== 4) return 0;

	const n = width * height;
	const fieldCount = field.length;
	if (n === 0 || fieldCount < n * components) return 0;

	let totalEnergy = 0;
	let gridScaleEnergy = 0;

	const clampX = (x: number): number => Math.max(0, Math.min(width - 1, x));
	const clampY = (y: number): number => Math.max(0, Math.min(height - 1, y));

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const cell = (y * width + x) * components;
			for (let c = 0; c < components; c++) {
				const value = field[cell + c];
				totalEnergy += value * value;

				let neighborhoodSum = 0;
				for (let dy = -1; dy <= 1; dy++) {
					const sy = clampY(y + dy) * width;
					for (let dx = -1; dx <= 1; dx++) {
						const sx = clampX(x + dx);
						neighborhoodSum += field[sy * components + sx * components + c] as number;
					}
				}
				const smooth = neighborhoodSum / 9;
				const delta = value - smooth;
				gridScaleEnergy += delta * delta;
			}
		}
	}

	if (!Number.isFinite(totalEnergy) || totalEnergy <= 0) return 0;
	const ratio = Math.sqrt(gridScaleEnergy / totalEnergy);
	return Number.isFinite(ratio) ? ratio : 0;
}
