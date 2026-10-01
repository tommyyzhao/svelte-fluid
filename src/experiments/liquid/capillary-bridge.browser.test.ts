import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createCapillaryBridge, BRIDGE_VOLUME, BRIDGE_REST_EXTENT } from './capillary-bridge.js';
import { presentationSize } from './presentation-size.js';
import type { LiquidExperiment, LiquidInput } from './types.js';

let device: GPUDevice;
const format = 'rgba8unorm' as const;
const idle: LiquidInput = { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, tilt: 0 };
beforeAll(async () => { const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull(); device = await adapter!.requestDevice(); });
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => { await device.queue.onSubmittedWorkDone(); expect(await device.popErrorScope()).toBeNull(); });
afterAll(() => device?.destroy());

async function pixels(engine: LiquidExperiment, width: number, height: number) {
	const rowBytes = Math.ceil(width * 4 / 256) * 256;
	const target = device.createTexture({ size: [width, height], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
	const buffer = device.createBuffer({ size: rowBytes * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	try {
		const encoder = device.createCommandEncoder(); engine.render(encoder, target.createView());
		encoder.copyTextureToBuffer({ texture: target }, { buffer, bytesPerRow: rowBytes }, [width, height]);
		device.queue.submit([encoder.finish()]); await buffer.mapAsync(GPUMapMode.READ);
		const source = new Uint8Array(buffer.getMappedRange()), data = new Uint8Array(width * height * 4);
		for (let y = 0; y < height; y++) data.set(source.subarray(y * rowBytes, y * rowBytes + width * 4), y * width * 4);
		return data;
	} finally { target.destroy(); buffer.destroy(); }
}
async function step(engine: LiquidExperiment, count: number, input = idle) {
	for (let i = 0; i < count; i++) { const encoder = device.createCommandEncoder(); engine.step(encoder, 1 / 120, input); device.queue.submit([encoder.finish()]); }
	await device.queue.onSubmittedWorkDone();
}
function bright(data: Uint8Array) { let area = 0, lowestAlpha = 255; for (let i = 0; i < data.length; i += 4) { if (data[i + 1] > 100) area++; lowestAlpha = Math.min(lowestAlpha, data[i + 3]); } expect(lowestAlpha).toBe(255); return area; }

describe('native volume-accounted bridge', () => {
	it('opens a visible dry gap, recoils and reconnects without deleting liquid', async () => {
		let separation = 0.46; const model = await createCapillaryBridge(device, format, () => separation);
		try {
			model.resize(560, 300); const before = await pixels(model, 560, 300);
			separation = 1.5; await step(model, 480); const broken = await model.inspect();
			expect(broken.finite).toBe(true); expect(broken.details.joined).toBe(0); expect(broken.mass).toBeCloseTo(BRIDGE_VOLUME, 12);
			expect(broken.details.extent).toBeCloseTo(BRIDGE_REST_EXTENT, 6);
			const after = await pixels(model, 560, 300), center = (150 * 560 + 280) * 4;
			expect(before[center + 1]).toBeGreaterThan(after[center + 1] + 40);
			separation = 0.42; await step(model, 480); const joined = await model.inspect();
			expect(joined.details.joined).toBe(1); expect(joined.details.joins).toBe(1); expect(joined.mass).toBeCloseTo(BRIDGE_VOLUME, 12);
			const restored = await pixels(model, 560, 300); expect(restored[center + 1]).toBeGreaterThan(after[center + 1] + 40);
			// Native controls are the sole separation source; hovering must not contradict their displayed value.
			await step(model, 180, { ...idle, active: true, vx: 0.8, x: 0.98 }); await step(model, 480);
			expect((await model.inspect()).details.joined).toBe(1);
			expect((await model.inspect()).details.gap).toBeCloseTo(separation, 10);
		} finally { model.dispose(); }
	});
	it('keeps split state and volume across fractional 2x/3x native output changes', async () => {
		const model = await createCapillaryBridge(device, format);
		try {
			model.settleSeparation(1.5);
			const two = presentationSize(700.25, 375.25, 2), three = presentationSize(700.25, 375.25, 3);
			model.resize(two.width, two.height); const state = await model.inspect(), a = bright(await pixels(model, two.width, two.height));
			model.resize(three.width, three.height); const high = await model.inspect(), b = bright(await pixels(model, three.width, three.height));
			for (const key of ['gap', 'joined', 'extent', 'fusion', 'breaks', 'joins']) expect(high.details[key]).toBe(state.details[key]);
			expect(high.mass).toBe(state.mass); expect(model.memoryBytes).toBe(32); expect(high.details.resolvedCanvasBytes).toBe(three.width * three.height * 4);
			expect(a).toBeGreaterThan(10000); expect(b / a).toBeCloseTo(2.25, 1);
			expect(() => model.resize(4097, 4097)).toThrow('budget'); expect(await model.inspect()).toEqual(high);
			console.info('Bridge native footprint', { two, three, area2x: a, area3x: b, stateBytes: model.memoryBytes });
		} finally { model.dispose(); }
	});
});
