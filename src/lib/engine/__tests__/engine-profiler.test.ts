import { describe, expect, it } from 'vitest';
import {
	EngineProfiler,
	estimateTextureBytes,
	type ProfileEnvironment,
	type TimerQueryAdapter
} from '../engine-profiler.js';
import type { GL } from '../gl-utils.js';

const environment: ProfileEnvironment = {
	browser: 'test',
	webglVersion: 'WebGL2',
	renderer: 'test-renderer',
	vendor: 'test-vendor',
	devicePixelRatio: 2,
	effectivePixelRatioX: 2,
	effectivePixelRatioY: 2,
	cssWidth: 100,
	cssHeight: 50,
	drawingBufferWidth: 200,
	drawingBufferHeight: 100,
	canvasPixels: 20_000,
	simWidth: 128,
	simHeight: 64,
	dyeWidth: 256,
	dyeHeight: 128,
	linearFiltering: true,
	timerQuery: 'cpu',
	contextLost: false
};

const resources = { estimatedTextureBytes: 4096, canvasPixels: 20_000 };

function clock(...values: number[]): () => number {
	let index = 0;
	return () => values[Math.min(index++, values.length - 1)] ?? 0;
}

function queryAdapter(options: { disjoint?: boolean; available?: boolean; nanos?: number | null } = {}) {
	const deleted: WebGLQuery[] = [];
	const query = {} as WebGLQuery;
	const adapter: TimerQueryAdapter = {
		kind: 'webgl2',
		create: () => query,
		begin: () => {},
		end: () => {},
		available: () => options.available ?? true,
		resultNanos: () => options.nanos ?? 2_000_000,
		disjoint: () => options.disjoint ?? false,
		delete: (item) => deleted.push(item)
	};
	return { adapter, deleted };
}

describe('EngineProfiler', () => {
	it('aggregates CPU groups, draws, pixels, and lifecycle samples', () => {
		const profiler = new EngineProfiler(null, clock(0, 1, 3, 5), 8);
		profiler.recordLifecycle('shaderCompile', 4.5);
		profiler.beginFrame();
		profiler.beginGroup('solver');
		profiler.recordDraw(64);
		profiler.recordDraw(32);
		profiler.endGroup();
		profiler.endFrame();

		const snapshot = profiler.snapshot(environment, resources);
		expect(snapshot.valid).toBe(true);
		expect(snapshot.timingSource).toBe('cpu');
		expect(snapshot.frames).toHaveLength(1);
		expect(snapshot.frames[0]).toMatchObject({ cpuMs: 5, draws: 2, pixels: 96, gpuMs: null });
		expect(snapshot.frames[0]?.groups.solver).toMatchObject({ cpuMs: 2, draws: 2, pixels: 96 });
		expect(snapshot.lifecycle.shaderCompile).toEqual([4.5]);
		expect(snapshot.resources).toEqual(resources);
	});

	it('rejects blank frames instead of publishing misleading samples', () => {
		const profiler = new EngineProfiler(null, clock(0, 1));
		profiler.beginFrame();
		profiler.endFrame();

		const snapshot = profiler.snapshot(environment, resources);
		expect(snapshot.valid).toBe(false);
		expect(snapshot.frames).toEqual([]);
		expect(snapshot.invalidReasons).toContain('blank-frame');
		expect(snapshot.rejected['blank-frame']).toBe(1);
	});

	it('drops every pending query and rejects the frame after a disjoint event', () => {
		const { adapter, deleted } = queryAdapter({ disjoint: true, available: false });
		const profiler = new EngineProfiler(adapter, clock(0, 1, 2, 3));
		profiler.beginFrame();
		profiler.beginGroup('solver');
		profiler.recordDraw(16);
		profiler.endGroup();
		profiler.endFrame();

		const snapshot = profiler.snapshot({ ...environment, timerQuery: 'webgl2' }, resources);
		expect(snapshot.valid).toBe(false);
		expect(snapshot.invalidReasons).toContain('disjoint');
		expect(snapshot.rejected.disjoint).toBe(1);
		expect(deleted).toHaveLength(1);
	});

	it('publishes completed GPU timing and bounds retained samples', () => {
		const { adapter } = queryAdapter({ nanos: 2_500_000 });
		let now = 0;
		const profiler = new EngineProfiler(adapter, () => now++, 2);
		for (let i = 0; i < 3; i++) {
			profiler.beginFrame();
			profiler.beginGroup('display');
			profiler.recordDraw(100);
			profiler.endGroup();
			profiler.endFrame();
			profiler.poll();
		}

		const snapshot = profiler.snapshot({ ...environment, timerQuery: 'webgl2' }, resources);
		expect(snapshot.valid).toBe(true);
		expect(snapshot.timingSource).toBe('gpu');
		expect(snapshot.frames).toHaveLength(2);
		expect(snapshot.frames.map((frame) => frame.id)).toEqual([1, 2]);
		expect(snapshot.frames.every((frame) => frame.gpuMs === 2.5)).toBe(true);
	});

	it('estimates channel and component sizes without allocating', () => {
		const gl = {
			RGB: 0x1907,
			RGBA: 0x1908,
			LUMINANCE: 0x1909,
			ALPHA: 0x1906,
			LUMINANCE_ALPHA: 0x190a,
			RED: 0x1903,
			RG: 0x8227,
			FLOAT: 0x1406
		} as GL;
		const half = 0x140b;
		expect(estimateTextureBytes(gl, 10, 5, gl.RGBA, half, half)).toBe(400);
		expect(estimateTextureBytes(gl, 10, 5, (gl as WebGL2RenderingContext).RG, gl.FLOAT, half)).toBe(400);
		expect(estimateTextureBytes(gl, 10, 5, (gl as WebGL2RenderingContext).RED, gl.UNSIGNED_BYTE, half)).toBe(50);
	});
});
