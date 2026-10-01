import { describe, expect, it } from 'vitest';
import { advanceBridge, bridgeAccountedVolume, bridgeCapRadiusSquared, bridgeRadiusSquared, initialBridge,
	BRIDGE_BREAK_GAP, BRIDGE_RADIUS, BRIDGE_REJOIN_GAP, BRIDGE_REST_EXTENT, BRIDGE_VOLUME } from './capillary-bridge.js';

function integrate(fn: (x: number) => number, a: number, b: number): number {
	const n = 2000, h = (b - a) / n; let sum = fn(a) + fn(b);
	for (let i = 1; i < n; i++) sum += fn(a + i * h) * (i % 2 ? 4 : 2);
	return sum * h / 3;
}
describe('volume-accounted bridge proxy', () => {
	it('conserves integrated geometry, not merely a reported mass constant', () => {
		for (const gap of [0.3, 0.5, 0.8, BRIDGE_BREAK_GAP]) for (const fusion of [0, 0.27, 1]) {
			const state = { ...initialBridge(), gap, fusion };
			const volume = Math.PI * gap / 2 * integrate((t) => bridgeRadiusSquared(state, t), -1, 1);
			expect(volume).toBeCloseTo(BRIDGE_VOLUME, 12); expect(bridgeAccountedVolume(state)).toBeCloseTo(volume, 12);
			expect(bridgeRadiusSquared(state, 1)).toBeCloseTo(BRIDGE_RADIUS ** 2, 12);
			for (let t = -1; t <= 1; t += 0.05) expect(bridgeRadiusSquared(state, t)).toBeGreaterThanOrEqual(-1e-14);
		}
		for (const extent of [BRIDGE_REST_EXTENT, BRIDGE_REST_EXTENT * 1.5, BRIDGE_REST_EXTENT * 2]) {
			const volume = 2 * Math.PI * extent * integrate((s) => bridgeCapRadiusSquared(extent, s), 0, 1);
			expect(volume).toBeCloseTo(BRIDGE_VOLUME, 12);
			expect(bridgeCapRadiusSquared(extent, 0)).toBeCloseTo(BRIDGE_RADIUS ** 2, 12);
			expect(bridgeCapRadiusSquared(extent, 1)).toBe(0);
		}
	});
	it('matches the connected cone exactly at breakup and then recoils without losing volume', () => {
		const threshold = { ...initialBridge(), gap: BRIDGE_BREAK_GAP };
		for (let t = 0; t <= 1; t += 0.01) expect(bridgeRadiusSquared(threshold, t)).toBeCloseTo(bridgeCapRadiusSquared(BRIDGE_BREAK_GAP / 2, 1 - t), 12);
		const state = initialBridge(); let firstExtent = 0;
		for (let i = 0; i < 1000; i++) {
			advanceBridge(state, 1 / 240, 1.6);
			if (!state.joined && !firstExtent) firstExtent = state.extent;
			expect(bridgeAccountedVolume(state)).toBeCloseTo(BRIDGE_VOLUME, 12);
		}
		expect(state.breaks).toBe(1); expect(state.joined).toBe(false);
		expect(firstExtent).toBeGreaterThan(state.extent * 1.8); expect(state.extent).toBeCloseTo(BRIDGE_REST_EXTENT, 8);
	});
	it('has contact hysteresis, fuses at fixed total volume and rejects nonfinite input', () => {
		const state = initialBridge();
		for (let i = 0; i < 1000; i++) advanceBridge(state, 1 / 240, 1.6);
		const middle = (BRIDGE_BREAK_GAP + BRIDGE_REJOIN_GAP) / 2;
		for (let i = 0; i < 1000; i++) advanceBridge(state, 1 / 240, middle);
		expect(state.joined).toBe(false);
		for (let i = 0; i < 1000; i++) { advanceBridge(state, 1 / 240, 0.3); expect(bridgeAccountedVolume(state)).toBeCloseTo(BRIDGE_VOLUME, 12); }
		expect(state.joined).toBe(true); expect(state.joins).toBe(1); expect(state.fusion).toBeCloseTo(1, 8);
		const saved = { ...state }; advanceBridge(state, NaN, 0.3); advanceBridge(state, 0.1, NaN); expect(state).toEqual(saved);
	});
});
