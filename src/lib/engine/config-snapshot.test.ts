import { describe, expect, it } from 'vitest';
import { MAX_QUEUED_SPLATS, snapshotFluidConfig } from './config-snapshot.js';
import type { ContainerShape, FlowConfig, PresetSplat } from './types.js';

describe('owned fluid configuration snapshots', () => {
	it('owns mutable descriptors while retaining grid payload identity', () => {
		const shape: ContainerShape = { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 };
		const data = new Float32Array(8);
		const flow: FlowConfig = {
			sources: [{ kind: 'point', x: 0.2, y: 0.3, velocity: { x: 2, y: 3 } }],
			prescribed: { kind: 'grid', velocity: { width: 2, height: 2, data, version: 1 } }
		};
		const snapshot = snapshotFluidConfig({ containerShape: shape, flow });
		shape.radius = 0.1;
		(flow.sources![0] as { velocity?: { x: number } }).velocity!.x = 99;
		expect(snapshot.containerShape).toEqual({ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 });
		expect(snapshot.flow?.sources?.[0]?.velocity?.x).toBe(2);
		expect(snapshot.flow?.prescribed?.velocity?.data).toBe(data);
	});

	it('drops unknown cyclic descriptor metadata from signatures and recovery state', () => {
		const shape = { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 } as ContainerShape & {
			metadata?: unknown;
		};
		shape.metadata = shape;
		const snapshot = snapshotFluidConfig({ containerShape: shape });
		expect(snapshot.containerShape).toEqual({ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 });
		expect('metadata' in snapshot.containerShape!).toBe(false);
	});

	it('bounds opening work and rejects unbounded flow descriptor arrays', () => {
		const splat: PresetSplat = { x: 0.5, y: 0.5, dx: 0, dy: 0, color: { r: 1, g: 0, b: 0 } };
		expect(snapshotFluidConfig({ presetSplats: Array(100).fill(splat) }).presetSplats).toHaveLength(
			MAX_QUEUED_SPLATS
		);
		expect(() =>
			snapshotFluidConfig({
				flow: { sources: Array(65).fill({ kind: 'point', x: 0.5, y: 0.5 }) }
			})
		).toThrow(/at most 64/);
		expect(() =>
			snapshotFluidConfig({
				flow: {
					scalarFields: ['a', 'b', 'c', 'd'].map((name) => ({ name }))
				}
			})
		).toThrow(/at most 3/);
		expect(() =>
			snapshotFluidConfig({ flow: { scalarFields: [{ name: 'temperature' }, { name: 'temperature' }] } })
		).toThrow(/declared more than once/);
		expect(() =>
			snapshotFluidConfig({
				flow: {
					sources: [{ kind: 'point', x: 0.5, y: 0.5, scalars: { a: 1, b: 1, c: 1, d: 1 } }]
				}
			})
		).toThrow(/at most 3/);
		expect(() =>
			snapshotFluidConfig({
				flow: {
					sources: [{ kind: 'point', x: 0.5, y: 0.5, scalars: { smoke: 1, humidity: 1 } }]
				}
			})
		).toThrow(/alias packed channel/);
		expect(() =>
			snapshotFluidConfig({ obstructions: Array(65).fill({ d: 'M0 0' }) })
		).toThrow(/at most 64/);
		expect(() =>
			snapshotFluidConfig({
				containerShape: { type: 'svgPath', d: 'x'.repeat(512 * 1024 + 1) }
			})
		).toThrow(/containerShape\.d exceeds/);
	});

	it('rejects non-finite nested values before they reach uniforms', () => {
		expect(() =>
			snapshotFluidConfig({ flow: { forces: [{ kind: 'gravity', vector: { x: Number.NaN, y: 0 } }] } })
		).toThrow(/finite GPU-scale number/);
		expect(() => snapshotFluidConfig({ presetSplats: [
			{ x: 0.5, y: 0.5, dx: Number.POSITIVE_INFINITY, dy: 0, color: { r: 1, g: 0, b: 0 } }
		] })).toThrow(/finite GPU-scale number/);
		expect(() =>
			snapshotFluidConfig({
				flow: {
					prescribed: { kind: 'grid', velocity: { width: 1, height: 1, data: [0, 0], scale: 0 } }
				}
			})
		).toThrow(/scale must be greater than zero/);
	});
});
