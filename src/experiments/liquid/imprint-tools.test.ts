import { describe, expect, it } from 'vitest';
import { IMPRINT_CAPACITY, IMPRINT_COMMANDS, ImprintHistory, ORIGINAL_SIGNET, imprintAt, imprintDistanceProfile, imprintTool, impressionDepth } from './imprint-tools.js';

function mask() {
	const width = 19, height = 15, data = new Uint8Array(width * height);
	for (let y = 3; y < 12; y++) for (let x = 4; x < 13; x++) if (x < 8 || y > 8) data[y * width + x] = 255;
	return { width, height, data };
}
const profile = imprintDistanceProfile(mask());

describe('native imprint tool representation', () => {
	it('matches brute-force signed raster distances and retains partial coverage', () => {
		const input = mask(), result = imprintDistanceProfile(input);
		for (let y = 0; y < input.height; y++) for (let x = 0; x < input.width; x++) {
			const inside = input.data[y * input.width + x] >= 128; let nearest = Infinity;
			for (let sy = 0; sy < input.height; sy++) for (let sx = 0; sx < input.width; sx++) {
				if ((input.data[sy * input.width + sx] >= 128) !== inside) nearest = Math.min(nearest, Math.hypot(x - sx, y - sy));
			}
			expect(result.data[y * input.width + x]).toBeCloseTo((inside ? 1 : -1) * (nearest - 0.5) / input.width, 7);
		}
		input.data[5] = 91; expect(imprintDistanceProfile(input).data[5]).toBeCloseTo((91 / 255 - 0.5) / input.width, 7);
		for (const value of [0, 255]) {
			const uniform = imprintDistanceProfile({ width: 7, height: 5, data: new Uint8Array(35).fill(value) });
			expect([...uniform.data].every(Number.isFinite)).toBe(true); expect(Math.sign(uniform.data[17])).toBe(value ? 1 : -1);
		}
	});
	it('captures tools by value, keeps rotated tools distinct, and never changes older impressions', () => {
		const history = new ImprintHistory(), tool = imprintTool({ shape: 'comb', rotation: 0 });
		history.stamp(0.5, 0.5, tool, true); const stored = structuredClone(history.impressions[0]);
		tool.rotation = 90; tool.shape = 'rosette'; history.stamp(0.65, 0.5, tool, true);
		expect(history.impressions[0]).toEqual(stored);
		const rotated = { ...stored, rotation: 90 };
		let difference = 0;
		for (let y = 0.35; y < 0.65; y += 0.007) for (let x = 0.35; x < 0.65; x += 0.007) difference += Math.abs(impressionDepth(stored, x, y, profile) - impressionDepth(rotated, x, y, profile));
		expect(difference).toBeGreaterThan(100);
	});
	it('reproduces first-order compliance under ordered stamp/stamp/smooth/stamp events', () => {
		const history = new ImprintHistory(); let expectedHeight = 0, expectedRest = 0;
		const point = { x: 0.5, y: 0.5 }, dt = 1 / 240;
		for (let step = 0; step < 240; step++) {
			if ([0, 15, 70, 90].includes(step)) {
				const tool = imprintTool({ shape: 'comb', depth: step === 70 ? 0.5 : 1 });
				history.stamp(0.5, 0.5, tool); expectedRest = Math.max(expectedRest, tool.depth);
			}
			if (step === 40 || step === 85) { history.smooth(); expectedRest = 0; }
			const before = imprintAt(history.impressions, point.x, point.y, profile);
			expect(before.height).toBeCloseTo(expectedHeight, 12); expect(before.rest).toBeCloseTo(expectedRest, 12);
			history.advance(dt); expectedHeight += (expectedRest - expectedHeight) * (1 - Math.exp(-14 * dt));
		}
		history.finish(); expect(history.count).toBe(1);
		expect(imprintAt(history.impressions, 0.5, 0.5, profile)).toEqual({ rest: 1, height: 1 });
		history.smooth(true); expect(history.impressions).toHaveLength(0);
	});
	it('has explicit capacity with no history eviction and recovers it by smoothing', () => {
		const history = new ImprintHistory();
		for (let i = 0; i < IMPRINT_CAPACITY; i++) expect(history.stamp(0.3 + i / 100, 0.5, imprintTool(), true)).toBe(true);
		const retained = structuredClone(history.impressions);
		expect(history.stamp(0.5, 0.5, imprintTool(), true)).toBe(false); expect(history.impressions).toEqual(retained);
		history.smooth(); expect(history.impressions.length).toBeLessThanOrEqual(IMPRINT_COMMANDS);
		expect(history.stamp(0.5, 0.5, imprintTool())).toBe(false);
		history.finish(); expect(history.count).toBe(0); expect(history.stamp(0.5, 0.5, imprintTool())).toBe(true);
		for (let i = 0; i < 30; i++) { history.smooth(); history.stamp(0.5, 0.5, imprintTool()); }
		expect(history.impressions.length).toBeLessThanOrEqual(IMPRINT_COMMANDS);
	});
	it('rejects invalid tools, keeps edge clipping local, and treats bevel as authored geometry', () => {
		expect(() => imprintTool({ size: NaN })).toThrow(); expect(() => imprintTool({ bevel: 0 })).toThrow();
		const history = new ImprintHistory(); expect(history.stamp(NaN, 0.5, imprintTool())).toBe(false);
		history.stamp(0.86, 0.5, imprintTool({ shape: 'ring', bevel: 0.003 }), true);
		expect(imprintAt(history.impressions, 0.99, 0.5, profile).rest).toBe(0);
		const sharp = { ...ORIGINAL_SIGNET, shape: 'comb' as const, x: 0.5, y: 0.5, response: 1, bevel: 0.003 };
		const soft = { ...sharp, bevel: 0.05 };
		expect(impressionDepth(sharp, 0.5 + 0.46 * 0.009, 0.5, profile)).toBeGreaterThan(impressionDepth(soft, 0.5 + 0.46 * 0.009, 0.5, profile));
	});
	it('requires the press center on wax without consuming history, while retaining edge-straddling tool bodies', () => {
		const history = new ImprintHistory();
		for (const rotation of [0, 45, 90, 135]) {
			expect(history.stamp(0.01, 0.01, imprintTool({ size: 0.2, rotation }), true)).toBe(false);
			expect(history.count).toBe(0); expect(history.marked).toBe(false);
		}
		for (const shape of ['signet', 'ring', 'comb', 'rosette'] as const) {
			expect(history.stamp(0.1, 0.1, imprintTool({ size: 0.3, shape }), true)).toBe(false);
			expect(history.stamp(0.9, 0.5, imprintTool({ size: 0.3, shape }), true)).toBe(false);
		}
		expect(history.stamp(0.86, 0.5, imprintTool({ size: 0.2, shape: 'ring', rotation: 45 }), true)).toBe(true);
		expect(history.count).toBe(1); expect(history.marked).toBe(true);
		history.smooth(); const warming = structuredClone(history.impressions);
		expect(history.stamp(0.01, 0.01, imprintTool({ size: 0.2 }), true)).toBe(false);
		expect(history.impressions).toEqual(warming); // Invalid presses cannot finish or compact earlier commands either.
	});
});
