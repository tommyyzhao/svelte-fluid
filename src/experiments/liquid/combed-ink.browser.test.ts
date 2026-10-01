import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createCombedInk, inkProgram, type CombedInk } from './combed-ink.js';
import { presentationSize } from './presentation-size.js';
import type { LiquidInput } from './types.js';

let device: GPUDevice;
const format: GPUTextureFormat = 'rgba8unorm';
beforeAll(async () => { const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull(); device = await adapter!.requestDevice({ requiredFeatures: adapter!.features.has('timestamp-query') ? ['timestamp-query'] : [] }); });
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => { await device.queue.onSubmittedWorkDone(); expect(await device.popErrorScope()).toBeNull(); });
afterAll(() => device?.destroy());

async function image(engine: CombedInk, width: number, height: number) {
	const bytesPerRow = Math.ceil(width * 4 / 256) * 256;
	const target = device.createTexture({ size: [width, height], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
	const readback = device.createBuffer({ size: bytesPerRow * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	try {
		const encoder = device.createCommandEncoder(); engine.render(encoder, target.createView());
		encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow }, [width, height]); device.queue.submit([encoder.finish()]);
		await readback.mapAsync(GPUMapMode.READ); const source = new Uint8Array(readback.getMappedRange()), result = new Uint8Array(width * height * 4);
		for (let y = 0; y < height; y++) result.set(source.subarray(y * bytesPerRow, y * bytesPerRow + width * 4), y * width * 4);
		return result;
	} finally { target.destroy(); readback.destroy(); }
}

function difference(a: Uint8Array, b: Uint8Array) {
	let sum = 0, squared = 0, max = 0, minAlpha = 255;
	for (let i = 0; i < a.length; i++) { if (i % 4 === 3) { minAlpha = Math.min(minAlpha, a[i], b[i]); continue; } const delta = Math.abs(a[i] - b[i]); sum += delta; squared += delta * delta; max = Math.max(max, delta); }
	expect(minAlpha).toBe(255);
	return { mean: sum / (a.length * 0.75), rms: Math.sqrt(squared / (a.length * 0.75)), max };
}

async function timing(engine: CombedInk, width: number, height: number) {
	const target = device.createTexture({ size: [width, height], format, usage: GPUTextureUsage.RENDER_ATTACHMENT });
	const query = device.features.has('timestamp-query') ? device.createQuerySet({ type: 'timestamp', count: 2 }) : undefined;
	const resolved = query ? device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }) : undefined;
	const readback = query ? device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }) : undefined;
	const gpuMs: number[] = [], cpuMs: number[] = [], completionMs: number[] = [];
	try {
		for (let i = 0; i < 8; i++) {
			const begin = performance.now(); const encoder = device.createCommandEncoder();
			const wrapped = query ? new Proxy(encoder, { get(target, key) {
				if (key === 'beginRenderPass') return (descriptor: GPURenderPassDescriptor) => target.beginRenderPass({ ...descriptor, timestampWrites: { querySet: query, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } });
				const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
			} }) : encoder;
			engine.render(wrapped, target.createView());
			if (query && resolved && readback) { encoder.resolveQuerySet(query, 0, 2, resolved, 0); encoder.copyBufferToBuffer(resolved, 0, readback, 0, 16); }
			device.queue.submit([encoder.finish()]); const submitted = performance.now(); await device.queue.onSubmittedWorkDone(); const completed = performance.now();
			if (i > 1) { cpuMs.push(submitted - begin); completionMs.push(completed - begin); }
			if (readback) { await readback.mapAsync(GPUMapMode.READ); const stamps = new BigUint64Array(readback.getMappedRange()); if (i > 1) gpuMs.push(Number(stamps[1] - stamps[0]) / 1e6); readback.unmap(); }
		}
		const median = (samples: number[]) => samples.toSorted((a, b) => a - b)[Math.floor(samples.length / 2)];
		return { gpuMedianMs: gpuMs.length ? median(gpuMs) : null, cpuMedianMs: median(cpuMs), completedMedianMs: median(completionMs), frames: cpuMs.length };
	} finally { target.destroy(); query?.destroy(); resolved?.destroy(); readback?.destroy(); }
}

describe('native combed ink', () => {
	it('preserves history on resize, no idle state upload, explicit saturation and reset', async () => {
		const engine = await createCombedInk(device, format);
		try {
			engine.resize(481, 261); engine.setProgram(inkProgram(4)); const initial = await image(engine, 481, 261);
			const first = await engine.inspect(); const stationary: LiquidInput = { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, tilt: 0 };
			for (let i = 0; i < 10; i++) engine.step(device.createCommandEncoder(), 1 / 120, stationary);
			const repeated = await image(engine, 481, 261); expect(difference(initial, repeated).max).toBe(0);
			expect((await engine.inspect()).details.uploads).toBe(first.details.uploads);
			engine.resize(1441, 782); expect((await engine.inspect()).details.operations).toBe(4); expect(engine.memoryBytes).toBe(528);
			expect(() => engine.resize(4097, 4097)).toThrow('Native ink size');
			engine.setProgram(inkProgram(16)); engine.step(device.createCommandEncoder(), 1 / 120, { ...stationary, active: true, x: 0.1 }); engine.step(device.createCommandEncoder(), 1 / 120, { ...stationary, active: true, x: 0.8 });
			expect((await engine.inspect()).details.operations).toBe(16); engine.undo(); expect((await engine.inspect()).details.operations).toBe(15);
			engine.reset(); expect((await engine.inspect()).details.operations).toBe(0);
			engine.step(device.createCommandEncoder(), 1 / 120, { ...stationary, active: true, x: 0.1 });
			engine.step(device.createCommandEncoder(), 1 / 120, { ...stationary, active: true, x: 0.2, vx: 1 });
			expect((await engine.inspect()).details.operations).toBe(1);
			// Release is synchronous even when the next paused frame has no step.
			engine.endInput(); expect((await engine.inspect()).details.operations).toBe(1);
			engine.step(device.createCommandEncoder(), 1 / 120, { ...stationary, active: true, x: 0.9, vx: 0 });
			expect((await engine.inspect()).details.operations).toBe(1);
			engine.step(device.createCommandEncoder(), 1 / 120, { ...stationary, active: true, x: 0.85, vx: -1 });
			expect((await engine.inspect()).details.operations).toBe(2);
		} finally { engine.dispose(); }
	});
	it('compares identical native 2x/3x stroke histories against tighter integration, including a long narrow stroke', async () => {
		const engine = await createCombedInk(device, format); const rows: object[] = [];
		try {
			for (const dpr of [2, 3]) {
				const size = presentationSize(480.25, 260.5, dpr); engine.resize(size.width, size.height);
				for (const count of [1, 4, 8, 16]) {
					engine.setProgram(inkProgram(count)); engine.setAccuracy('brush'); const brush = await image(engine, size.width, size.height); const brushCost = await timing(engine, size.width, size.height);
					engine.setAccuracy('reference'); const reference = await image(engine, size.width, size.height); const referenceCost = await timing(engine, size.width, size.height);
					const error = difference(brush, reference);
					// Byte-valued RGB error. Local folding singularities can have
					// larger isolated deltas; report maxima rather than hiding them.
					expect(error.mean).toBeLessThan(0.04); expect(error.rms).toBeLessThan(0.4);
					rows.push({ dpr, ...size, operations: count, error, brushCost, referenceCost, stateBytes: engine.memoryBytes, outputBytes: size.width * size.height * 4 });
				}
			}
			console.info('Ink native identical-program image error/cost (desktop, six timed frames, not mobile/thermal proof)', rows);
		} finally { engine.dispose(); }
	}, 60000);
	it('reports native large-sheet costs without lowering output resolution or baking history', async () => {
		const engine = await createCombedInk(device, format), rows: object[] = [];
		try {
			for (const dpr of [2, 3]) {
				const size = presentationSize(1128, 1128 / 1.8, dpr); engine.resize(size.width, size.height);
				for (const operations of [4, 16]) {
					engine.setProgram(inkProgram(operations));
					const cost = await timing(engine, size.width, size.height), snapshot = await engine.inspect();
					expect(snapshot.details.outputBytes).toBe(size.width * size.height * 4); expect(engine.memoryBytes).toBe(528);
					rows.push({ dpr, ...size, operations, cost, stateBytes: 528, outputBytes: size.width * size.height * 4 });
				}
			}
			console.info('Ink large native authored sheet (standard brush; any exceeded frame budget is visible, not downsampled)', rows);
		} finally { engine.dispose(); }
	}, 60000);
});
