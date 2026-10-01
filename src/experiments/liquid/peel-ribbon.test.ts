import { describe, expect, it } from 'vitest';
import { RibbonGeometry, RIBBON_SEGMENTS } from './peel-ribbon.js';

function validate(model: RibbonGeometry) {
	let length = 0;
	for (let i = 1; i <= RIBBON_SEGMENTS; i++) {
		const previous = (i - 1) * 4, current = i * 4;
		const dx = model.points[current] - model.points[previous], dy = model.points[current + 1] - model.points[previous + 1];
		expect(dx).toBeGreaterThan(0); expect(dy).toBeGreaterThanOrEqual(0);
		const segment = Math.hypot(dx, dy); expect(segment).toBeCloseTo(1 / RIBBON_SEGMENTS, 6); length += segment;
		expect(model.angles[i - 1]).toBeGreaterThanOrEqual(0); expect(model.angles[i - 1]).toBeLessThanOrEqual(Math.PI * 5 / 12);
		if (i <= model.boundary + 1) expect(model.points[current + 1]).toBe(0);
	}
	expect(length).toBeCloseTo(1, 6); expect(model.points.every(Number.isFinite)).toBe(true);
}

describe('bounded rest-curvature ribbon geometry', () => {
	it('preserves material arc length, plane contact and no intersections over its entire declared envelope', () => {
		const model = new RibbonGeometry();
		for (const peel of [0, 0.01, 0.18, 0.4, 0.62, 0.82]) for (const lift of [0, 0.2, 0.6, 1]) {
			model.set(peel, lift, true); validate(model);
			model.remember(); model.finish(); validate(model); model.clearMemory();
		}
	});
	it('stores the crease in material coordinates and visibly changes a repeated peel at matched controls', () => {
		const model = new RibbonGeometry(), virgin = model.points.slice();
		expect(model.remember()).toBe(true); model.finish(); const creased = model.points.slice(), location = model.crease;
		let distance = 0; for (let i = 0; i < virgin.length; i += 4) distance = Math.max(distance, Math.hypot(virgin[i] - creased[i], virgin[i + 1] - creased[i + 1]));
		expect(distance).toBeGreaterThan(0.03);
		model.set(0, 0.8, true); validate(model); expect(model.crease).toBe(location); expect(model.rest[location]).toBe(0.9);
		model.set(0.62, 0.8, true); expect(model.points).toEqual(creased);
		model.clearMemory(); model.finish(); expect(model.points).toEqual(virgin); expect(model.peel).toBe(0.62); expect(model.lift).toBe(0.8);
	});
	it('never stretches or penetrates during a boundary change and has cadence-independent bounded settling', () => {
		const a = new RibbonGeometry(), b = new RibbonGeometry(); a.remember(); b.remember();
		a.step(0.5); for (let i = 0; i < 60; i++) b.step(1 / 120);
		for (let i = 0; i < RIBBON_SEGMENTS; i++) expect(a.angles[i]).toBeCloseTo(b.angles[i], 12);
		for (const peel of [0.2, 0.8, 0.41, 0]) { a.set(peel, 0.9); for (let i = 0; i < 30; i++) { a.step(1 / 60); validate(a); } }
		a.finish(); expect(a.remaining).toBe(0); expect(a.remember()).toBe(false);
		expect(() => a.set(0.9, 0.5)).toThrow(); expect(() => a.set(0.4, -1)).toThrow(); expect(() => a.step(Number.NaN)).toThrow();
	});
});
