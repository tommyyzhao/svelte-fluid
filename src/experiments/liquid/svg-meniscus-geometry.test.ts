import { describe, expect, it } from 'vitest';
import { MENISCUS_BUDGET, createMeniscusState, meniscusArea, meniscusRadius, meniscusTarget } from './magnetic-meniscus-model.js';
import { meniscusNativeSize, SVG_MENISCUS_RIM, svgMeniscusGeometry } from './svg-meniscus-geometry.js';

function point(modes: ArrayLike<number>, angle: number, offset: number, width: number, height: number) {
	const r = Math.min(width, height) * (meniscusRadius(modes, angle) + offset);
	return [width / 2 + r * Math.cos(angle), height / 2 + r * Math.sin(angle)];
}
function pathPoints(path: string): number[][] {
	return [...path.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

describe('native SVG rendering of the shared twelve-mode meniscus', () => {
	it('rounds fractional CSS dimensions at actual DPR without a hidden cap', () => {
		expect(meniscusNativeSize(900.375, 600.25, 2)).toEqual([1801, 1201]);
		expect(meniscusNativeSize(900.375, 600.25, 3)).toEqual([2701, 1801]);
		expect(meniscusNativeSize(900.375, 600.25, 4)).toEqual([3602, 2401]);
		for (const value of [0, -1, NaN, Infinity]) expect(() => meniscusNativeSize(900, 600, value)).toThrow();
	});
	it('bounds every serialized contour to less than 0.2 native pixel, including adversarial mode twelve', () => {
		const highest = new Float64Array(24); highest[22] = MENISCUS_BUDGET * Math.cos(0.413); highest[23] = MENISCUS_BUDGET * Math.sin(0.413);
		const modes = [createMeniscusState().modes, meniscusTarget(.48, 0, 1), meniscusTarget(-.27, -.3, 1.5), highest];
		for (const [width, height] of [[1801, 1201], [2701, 1801], [1171, 1171]]) for (const state of modes) {
			const geometry = svgMeniscusGeometry(state, width, height);
			expect(geometry.segments).toBeGreaterThanOrEqual(48); expect(geometry.errorBound).toBeLessThan(0.2);
			const ring = pathPoints(geometry.ring), clip = pathPoints(geometry.clip).map(([x, y]) => [x * width, y * height]);
			for (const [points, offset] of [[ring.slice(0, geometry.segments), SVG_MENISCUS_RIM], [ring.slice(geometry.segments), -SVG_MENISCUS_RIM], [clip, -SVG_MENISCUS_RIM]] as [number[][], number][]) {
				for (let i = 0; i < geometry.segments; i++) for (const fraction of [.125, .25, .5, .75, .875]) {
					const reference = point(state, (i + fraction) * 2 * Math.PI / geometry.segments, offset, width, height), a = points[i], b = points[(i + 1) % geometry.segments];
					const error = Math.hypot(reference[0] - (a[0] + fraction * (b[0] - a[0])), reference[1] - (a[1] + fraction * (b[1] - a[1])));
					expect(error).toBeLessThanOrEqual(geometry.errorBound + 1e-8);
				}
			}
			expect(meniscusArea(state)).toBeCloseTo(Math.PI * .3 ** 2, 14);
		}
	});
	it('increases geometric work with native density and curvature instead of assuming SVG is free', () => {
		const state = createMeniscusState().modes;
		const circle = svgMeniscusGeometry(state, 1801, 1201);
		expect(svgMeniscusGeometry(state, 2701, 1801).segments).toBeGreaterThan(circle.segments);
		state[22] = MENISCUS_BUDGET;
		expect(svgMeniscusGeometry(state, 1801, 1201).segments).toBeGreaterThan(circle.segments * 3);
	});
	it('rejects invalid modes and impractical native geometry rather than producing a degraded contour', () => {
		const state = createMeniscusState().modes;
		expect(() => svgMeniscusGeometry(state, 0, 1200)).toThrow();
		expect(() => svgMeniscusGeometry(state, 100.5, 1200)).toThrow();
		expect(() => svgMeniscusGeometry([0], 100, 100)).toThrow();
		state[0] = NaN; expect(() => svgMeniscusGeometry(state, 100, 100)).toThrow();
		state[0] = .5; expect(() => svgMeniscusGeometry(state, 100, 100)).toThrow();
		state[0] = 0; expect(() => svgMeniscusGeometry(state, 1e12, 1e12)).toThrow('geometry budget');
	});
});
