import { describe, expect, it } from 'vitest';
import { appendCrackSegment, createCrackGraph, CRACK_RELIEF, pointSegmentDistance, seedCrack } from './crazed-enamel.js';

describe('explicit geometric crack history', () => {
	it('clips a growing branch to the first old edge regardless of insertion order', () => {
		const graph = createCrackGraph();
		graph.segments.push({ ax: 0.8, ay: 0.1, bx: 0.8, by: 0.9, generation: 0 }, { ax: 0.4, ay: 0.1, bx: 0.4, by: 0.9, generation: 1 });
		expect(appendCrackSegment(graph, { ax: 0.1, ay: 0.5, bx: 0.95, by: 0.5, generation: 2 })).toBe(true);
		expect(graph.segments[2].bx).toBeCloseTo(0.4, 10); expect(graph.segments[2].by).toBe(0.5);
		expect(graph.junctions).toBe(1);
		expect(pointSegmentDistance(graph.segments[2].bx, graph.segments[2].by, graph.segments[1])).toBeLessThan(1e-10);
	});
	it('does not nucleate inside relieved bands, including near segment endpoints', () => {
		const graph = createCrackGraph();
		graph.segments.push({ ax: 0.2, ay: 0.5, bx: 0.7, by: 0.5, generation: 0 });
		expect(seedCrack(graph, 0.4, 0.5 + CRACK_RELIEF * 0.9)).toBe(false);
		expect(seedCrack(graph, 0.72, 0.51)).toBe(false);
		expect(graph.seeds).toHaveLength(0); expect(graph.segments).toHaveLength(1);
		expect(seedCrack(graph, 0.4, 0.72)).toBe(true);
		expect(graph.seeds[0].clearance).toBeGreaterThanOrEqual(CRACK_RELIEF);
	});
	it('does not upload a sub-float32 span at a nearly coincident junction', () => {
		const graph = createCrackGraph();
		graph.segments.push({ ax: 0.10000004, ay: 0.2, bx: 0.10000004, by: 0.8, generation: 0 });
		expect(appendCrackSegment(graph, { ax: 0.1, ay: 0.5, bx: 0.101, by: 0.5, generation: 1 })).toBe(true);
		expect(graph.segments).toHaveLength(1);
	});
	it('is deterministic, finite, bounded, and leaves existing graph history untouched', () => {
		const graph = createCrackGraph(), duplicate = createCrackGraph();
		const points = [[0.38, 0.46], [0.68, 0.64], [0.69, 0.25], [0.23, 0.7], [0.24, 0.23], [0.78, 0.82], [0.53, 0.77]];
		for (const [x, y] of points) {
			const old = structuredClone(graph.segments);
			seedCrack(graph, x, y); seedCrack(duplicate, x, y);
			expect(graph.segments.slice(0, old.length)).toEqual(old);
		}
		expect(graph).toEqual(duplicate); expect(graph.segments.length).toBeLessThanOrEqual(240);
		expect(graph.junctions).toBeGreaterThan(0);
		for (const seed of graph.seeds) expect(seed.clearance).toBeGreaterThanOrEqual(CRACK_RELIEF);
		for (const edge of graph.segments) {
			expect(Object.values(edge).every(Number.isFinite)).toBe(true);
			expect(Math.min(edge.ax, edge.bx)).toBeGreaterThanOrEqual(0.03499);
			expect(Math.max(edge.ay, edge.by)).toBeLessThanOrEqual(0.96001);
		}
	});
});
