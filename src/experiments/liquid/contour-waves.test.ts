import { describe, expect, it } from 'vitest';
import { advanceContour, CONTOURS, CONTOUR_AMPLITUDE_LIMIT, CONTOUR_MODES, DEFAULT_CONTOUR_OPTIONS, contourEnergy, contourEnvelope, contourLength, contourPoint, contourResponse, contourStroke, createContourState, nearestContour, pulseContour, sampleContour } from './contour-waves.js';

describe('periodic arc-length contour waves', () => {
	it('scales the default pulse and energy with contour size instead of giving the dot the large loop’s shove', () => {
		const { speed, damping } = DEFAULT_CONTOUR_OPTIONS;
		for (const shape of CONTOURS) {
			const response = contourResponse(shape), state = createContourState(contourLength(shape));
			const decay = damping * response.dampingScale;
			pulseContour(state, state.length * 0.15, 0.037 * response.inputScale, speed, decay, response.amplitudeLimit);
			let peak = 0; for (let s = 0; s < 256; s++) peak = Math.max(peak, Math.abs(sampleContour(state, state.length * s / 256)));
			expect(peak / Math.min(shape.hx, shape.hy)).toBeLessThan(0.08);
			expect(contourEnvelope(state, speed, decay)).toBeLessThanOrEqual(response.amplitudeLimit + 1e-12);
			const previous = createContourState(state.length); pulseContour(previous, state.length * 0.15, 0.037, speed, damping);
			expect(contourEnergy(state, speed)).toBeLessThan(contourEnergy(previous, speed));
		}
		const small = contourResponse(CONTOURS[1]);
		expect(small.inputScale).toBeCloseTo(0.22514, 4);
		// Equal decay per traveled circuit, rather than equal wall-clock decay
		// allowing the small dot to ring through 4.44× as many laps.
		expect(small.dampingScale * contourLength(CONTOURS[1])).toBeCloseTo(contourLength(CONTOURS[0]), 12);
	});
	it('the default dot relaxes over 0.3–0.6 seconds without rebound regrowth while retaining propagating modes', () => {
		const shape = CONTOURS[1], response = contourResponse(shape), state = createContourState(contourLength(shape));
		const { speed, damping } = DEFAULT_CONTOUR_OPTIONS, decay = damping * response.dampingScale;
		pulseContour(state, state.length * 0.15, 0.037 * response.inputScale, speed, decay, response.amplitudeLimit);
		const initialEnergy = contourEnergy(state, speed); let previousEnergy = initialEnergy, latePeak = 0;
		for (let step = 1; step <= 144; step++) {
			advanceContour(state, 1 / 240, speed, decay);
			const energy = contourEnergy(state, speed); expect(energy).toBeLessThanOrEqual(previousEnergy + 1e-12); previousEnergy = energy;
			if (step >= 72) for (let s = 0; s < 256; s++) latePeak = Math.max(latePeak, Math.abs(sampleContour(state, state.length * s / 256)));
			if (step === 72) expect(energy / initialEnergy).toBeLessThan(0.025);
		}
		expect(latePeak / shape.radius).toBeLessThan(0.01);
		expect(contourEnergy(state, speed) / initialEnergy).toBeLessThan(0.0005);
		const lingering = createContourState(state.length); pulseContour(lingering, state.length * 0.15, 0.037 * response.inputScale, speed, 0.8 * response.dampingScale, response.amplitudeLimit);
		advanceContour(lingering, 0.6, speed, 0.8 * response.dampingScale);
		expect(contourEnergy(lingering, speed)).toBeGreaterThan(contourEnergy(state, speed) * 10);
	});
	it('retains contour-relative displacement caps under sustained input throughout the configurable regime', () => {
		for (const shape of CONTOURS) for (const [speed, damping] of [[1.2, 1.8], [3.5, 0.8]]) {
			const state = createContourState(contourLength(shape)), response = contourResponse(shape), decay = damping * response.dampingScale;
			for (let i = 0; i < 900; i++) {
				pulseContour(state, i * 0.041, 0.045 * response.inputScale, speed, decay, response.amplitudeLimit);
				advanceContour(state, 1 / 120, speed, decay);
				expect(contourEnvelope(state, speed, decay) / Math.min(shape.hx, shape.hy)).toBeLessThanOrEqual(0.1 + 1e-12);
			}
		}
	});
	it('catches fast swept crossings with both endpoints away from the rim and bounds sampling work', () => {
		const from = { x: -1.05, y: 0 }, to = { x: 1.1, y: 0 };
		expect(contourStroke(from, from)).toHaveLength(0); expect(contourStroke(to, to)).toHaveLength(0);
		const hits = contourStroke(from, to); expect(hits.some((hit) => hit.contour === 0)).toBe(true); expect(hits.some((hit) => hit.contour === 1)).toBe(true);
		expect(hits.length).toBeLessThanOrEqual(96); expect(contourStroke({ x: NaN, y: 0 }, to)).toHaveLength(0);
	});
	it('maps the complete rounded path to uniform arc length, including its seam and circle axes', () => {
		for (const shape of CONTOURS) {
			const length = contourLength(shape);
			for (let i = 0; i < 1000; i++) {
				const s = length * i / 1000, point = contourPoint(s, shape), nearest = nearestContour(point.x, point.y, shape);
				expect(Math.abs(nearest.distance)).toBeLessThan(1e-12);
				const delta = Math.abs(nearest.s - s); expect(Math.min(delta, length - delta)).toBeLessThan(1e-12);
			}
		}
	});
	it('divides a displacement into two equal counter-propagating waves and reunites after a lap', () => {
		const state = createContourState(contourLength(CONTOURS[0])), speed = 1.8, center = state.length * 0.1;
		pulseContour(state, center, 0.028, speed, 0); const initial = state.modes.slice();
		const at = (s: number) => { const original = createContourState(state.length); original.modes.set(initial); return sampleContour(original, s); };
		const time = state.length / speed * 0.2; advanceContour(state, time, speed, 0);
		for (let i = 0; i < 90; i++) { const s = state.length * i / 90; expect(sampleContour(state, s)).toBeCloseTo((at(s - speed * time) + at(s + speed * time)) / 2, 12); }
		advanceContour(state, state.length / speed - time, speed, 0);
		for (let i = 0; i < initial.length; i++) expect(state.modes[i]).toBeCloseTo(initial[i], 10);
	});
	it('preserves linear superposition below the safety limit and never couples separate loops', () => {
		const length = contourLength(CONTOURS[0]), a = createContourState(length), b = createContourState(length), together = createContourState(length), other = createContourState(contourLength(CONTOURS[1]));
		pulseContour(a, 0.3, 0.009, 1.8, 1.5); pulseContour(b, 1.3, -0.011, 1.8, 1.5);
		pulseContour(together, 0.3, 0.009, 1.8, 1.5); pulseContour(together, 1.3, -0.011, 1.8, 1.5);
		for (const state of [a, b, together, other]) advanceContour(state, 0.23, 1.8, 1.5);
		for (let i = 0; i < CONTOUR_MODES * 4; i++) { expect(together.modes[i]).toBeCloseTo(a.modes[i] + b.modes[i], 12); expect(Math.abs(other.modes[i])).toBe(0); }
	});
	it('has exact frame segmentation, dissipates energy, and bounds pointer-spam excitation', () => {
		const a = createContourState(contourLength(CONTOURS[0])), b = createContourState(a.length);
		pulseContour(a, 0.3, 0.035, 1.8, 1.5); b.modes.set(a.modes); let energy = contourEnergy(b, 1.8);
		advanceContour(a, 0.73, 1.8, 1.5);
		for (let i = 0; i < 73; i++) { advanceContour(b, 0.01, 1.8, 1.5); const next = contourEnergy(b, 1.8); expect(next).toBeLessThanOrEqual(energy + 1e-12); energy = next; }
		for (let i = 0; i < a.modes.length; i++) expect(a.modes[i]).toBeCloseTo(b.modes[i], 11);
		for (let i = 0; i < 2000; i++) { pulseContour(a, i * 0.046, 0.035, 1.8, 1.5); advanceContour(a, 1 / 120, 1.8, 1.5); expect(contourEnvelope(a, 1.8, 1.5)).toBeLessThanOrEqual(CONTOUR_AMPLITUDE_LIMIT + 1e-12); }
		advanceContour(a, Math.log(6000) / 1.5, 1.8, 1.5); expect(contourEnvelope(a, 1.8, 1.5)).toBeLessThan(CONTOUR_AMPLITUDE_LIMIT / 5900);
	});
	it('preserves periodicity and zero mean normal displacement', () => {
		const state = createContourState(contourLength(CONTOURS[0])); pulseContour(state, 0, 0.03, 1.8, 1.5);
		let mean = 0; for (let i = 0; i < 512; i++) mean += sampleContour(state, i / 512 * state.length);
		expect(Math.abs(mean)).toBeLessThan(1e-12); expect(sampleContour(state, 0)).toBeCloseTo(sampleContour(state, state.length), 14);
	});
});
