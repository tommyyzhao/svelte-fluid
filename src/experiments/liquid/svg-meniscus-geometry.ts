import { MENISCUS_BUDGET, MENISCUS_MODES, meniscusRadius, meniscusScale } from './magnetic-meniscus-model.js';

export const SVG_MENISCUS_RIM = 0.018;
const CHORD_BUDGET = 0.18;
const MAX_SEGMENTS = 16384;
export interface SvgMeniscusGeometry {
	width: number;
	height: number;
	segments: number;
	errorBound: number;
	clip: string;
	ring: string;
}

/** Same rounded native presentation dimensions as the GPU surface. No DPR cap. */
export function meniscusNativeSize(cssWidth: number, cssHeight: number, dpr: number): [number, number] {
	if (![cssWidth, cssHeight, dpr].every((value) => Number.isFinite(value) && value > 0)) throw new Error('A positive native SVG size is required.');
	const width = Math.max(1, Math.round(cssWidth * dpr)), height = Math.max(1, Math.round(cssHeight * dpr));
	if (![width, height].every(Number.isSafeInteger)) throw new Error('Native SVG size cannot be represented precisely.');
	return [width, height];
}

/**
 * P(theta) = centre + minSize * (r(theta) + offset) * (cos(theta), sin(theta)).
 * ||P''|| <= minSize * [scale * (1 + sum (n+1)^2 * amplitude_n) + |offset|].
 * Linear interpolation error is at most ||P''|| * deltaTheta^2 / 8. This
 * analytic bound sees all 12 modes; midpoint-only subdivision can alias them.
 * A 0.18 native-pixel chord budget leaves room for serialized coordinates.
 */
export function svgMeniscusGeometry(modes: ArrayLike<number>, width: number, height: number): SvgMeniscusGeometry {
	if (![width, height].every((value) => Number.isSafeInteger(value) && value > 0)) throw new Error('Native SVG dimensions must be positive integers.');
	if (modes.length !== MENISCUS_MODES * 2 || !Array.from(modes).every(Number.isFinite)) throw new Error('Expected twelve finite meniscus modes.');
	let amplitudes = 0, curvature = 1;
	for (let n = 1; n <= MENISCUS_MODES; n++) {
		const amplitude = Math.hypot(modes[(n - 1) * 2], modes[(n - 1) * 2 + 1]);
		amplitudes += amplitude; curvature += (n + 1) ** 2 * amplitude;
	}
	if (amplitudes > MENISCUS_BUDGET + 1e-10) throw new Error('Meniscus modes exceed the shared radial budget.');
	const minimum = Math.min(width, height);
	const secondDerivativeBound = minimum * (meniscusScale(modes) * curvature + SVG_MENISCUS_RIM);
	const segments = Math.max(4 * MENISCUS_MODES, Math.ceil(2 * Math.PI * Math.sqrt(secondDerivativeBound / (8 * CHORD_BUDGET))));
	// Explicitly fail an impractical geometry request rather than secretly reduce
	// density or weaken the advertised error bound.
	if (segments > MAX_SEGMENTS) throw new Error('Native SVG contour exceeds the 16384-segment geometry budget.');
	const normalizedDigits = Math.max(2, Math.ceil(Math.log10(Math.max(width, height) * Math.SQRT2 / 0.02)));
	const contours = [[], []] as string[][], clip: string[] = [];
	for (let i = 0; i < segments; i++) {
		const angle = i * 2 * Math.PI / segments, c = Math.cos(angle), s = Math.sin(angle), radius = meniscusRadius(modes, angle);
		for (let j = 0; j < contours.length; j++) {
			const radial = minimum * (radius + (j * 2 - 1) * SVG_MENISCUS_RIM);
			const x = width / 2 + radial * c, y = height / 2 + radial * s;
			contours[j].push(`${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`);
			if (j === 0) clip.push(`${i ? 'L' : 'M'}${(x / width).toFixed(normalizedDigits)} ${(y / height).toFixed(normalizedDigits)}`);
		}
	}
	const chordError = secondDerivativeBound * (2 * Math.PI / segments) ** 2 / 8;
	const serializationError = Math.max(Math.SQRT2 * 0.005, Math.hypot(width, height) * 0.5 * 10 ** -normalizedDigits);
	return { width, height, segments, errorBound: chordError + serializationError,
		clip: clip.join('') + 'Z', ring: contours[1].join('') + 'Z' + contours[0].join('') + 'Z' };
}
