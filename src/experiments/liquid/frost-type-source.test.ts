import { describe, expect, it } from 'vitest';
import { frostTypeCoverage } from './frost-type-source.js';
import { advanceFrostCpu, createFrostCpu, FROST_COLD, FROST_TIME_SCALE, FROST_WARM,
	frostOptions, frostSubsteps, frostTotals, plantFrostCoverageCpu } from './frost-phase-model.js';

describe('action-time native glyph coverage', () => {
	it('conserves native alpha area through noninteger downsampling and upsampling', () => {
		for (const [width, height, size] of [[53, 37, 16], [7, 5, 32]]) {
			const rgba = new Uint8ClampedArray(width * height * 4); let mean = 0;
			for (let i = 0; i < width * height; i++) { const alpha = (i * 71 + 19) % 256; rgba[i * 4 + 3] = alpha; mean += alpha / 255 / (width * height); }
			const coverage = frostTypeCoverage(rgba, width, height, size);
			// Exact area integration is rounded once into the Float32 model source;
			// its absolute error is bounded by half an ULP on [0,1], not Float64.
			expect(Math.abs(coverage.reduce((sum, value) => sum + value, 0) / size ** 2 - mean)).toBeLessThan(3e-8);
			expect(Math.min(...coverage)).toBeGreaterThanOrEqual(0); expect(Math.max(...coverage)).toBeLessThanOrEqual(1);
		}
	});
	it('preserves an empty raster exactly and never grows coverage beyond the sampled glyph', () => {
		const rgba = new Uint8ClampedArray(64 * 64 * 4);
		expect(frostTypeCoverage(rgba, 64, 64, 32).some(Boolean)).toBe(false);
		for (let y = 8; y < 56; y++) for (let x = 24; x < 40; x++) rgba[(y * 64 + x) * 4 + 3] = 255;
		const coverage = frostTypeCoverage(rgba, 64, 64, 32);
		for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) expect(coverage[y * 32 + x]).toBe(y >= 4 && y < 28 && x >= 12 && x < 20 ? 1 : 0);
	});
	it('rejects incomplete or invalid native source dimensions', () => {
		expect(() => frostTypeCoverage(new Uint8ClampedArray(4), 2, 2)).toThrow('complete');
		expect(() => frostTypeCoverage(new Uint8ClampedArray(4), 1, 1, 0)).toThrow('complete');
	});
	it('plants only contributed cold phase, preserving unrelated heat and rejecting bad sources atomically', () => {
		const state = createFrostCpu(32, false, FROST_WARM), source = new Float32Array(32 ** 2);
		for (let y = 9; y < 23; y++) for (let x = 8; x < 13; x++) source[y * 32 + x] = 1;
		plantFrostCoverageCpu(state, source); const planted = state.cells.slice();
		expect(state.cells[1]).toBe(FROST_WARM); expect(state.cells[(10 * 32 + 10) * 2 + 1]).toBe(FROST_COLD);
		plantFrostCoverageCpu(state, source); expect(state.cells).toEqual(planted);
		source[1023] = NaN; expect(() => plantFrostCoverageCpu(state, source)).toThrow('[0,1]'); expect(state.cells).toEqual(planted);
	});
	it('lets content-seeded phase grow beyond its source, then melt without reconstructing the letters', () => {
		const size = 48, state = createFrostCpu(size, false), source = new Float32Array(size ** 2), options = frostOptions();
		for (let y = 12; y < 36; y++) for (let x = 10; x < 15; x++) source[y * size + x] = 1;
		plantFrostCoverageCpu(state, source); const initial = frostTotals(state.cells).phase;
		function evolve(seconds: number) { const count = frostSubsteps(0.1, size); for (let t = 0; t < Math.round(seconds * 10); t++) for (let i = 0; i < count; i++) advanceFrostCpu(state, 0.1 * FROST_TIME_SCALE / count, options); }
		evolve(1); const cold = frostTotals(state.cells); expect(cold.phase).toBeGreaterThan(initial * 2);
		expect(state.cells[(24 * size + 17) * 2]).toBeGreaterThan(0.5);
		options.bath = FROST_WARM; evolve(8); const warm = frostTotals(state.cells);
		expect(warm.phase).toBeLessThan(cold.phase * 0.02); expect(warm.min).toBeGreaterThanOrEqual(0); expect(warm.max).toBeLessThanOrEqual(1);
	});
});
