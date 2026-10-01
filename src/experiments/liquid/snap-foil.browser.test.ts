import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSnapFoil } from './snap-foil.js';
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
function bright(data: Uint8Array) { let area = 0, lowestAlpha = 255; for (let i = 0; i < data.length; i += 4) { if (data[i] > 100) area++; lowestAlpha = Math.min(lowestAlpha, data[i + 3]); } expect(lowestAlpha).toBe(255); return area; }

describe('native snap-through foil', () => {
	it('renders genuinely different stable arches and preserves the snapped state on release', async () => {
		let load = 0; const model = await createSnapFoil(device, format, () => load);
		try {
			model.resize(560, 300); const before = await pixels(model, 560, 300);
			load = -22; await step(model, 360); load = 0; await step(model, 600);
			expect((await model.inspect()).details.amplitude).toBeCloseTo(-1, 6);
			const after = await pixels(model, 560, 300); let difference = 0;
			for (let i = 0; i < before.length; i++) difference += Math.abs(before[i] - after[i]);
			expect(difference / before.length).toBeGreaterThan(2);
			const state = await model.inspect(); await pixels(model, 560, 300);
			expect(await model.inspect()).toEqual(state);
			model.reset(); await step(model, 200, { ...idle, active: true }); expect((await model.inspect()).details.amplitude).toBe(1);
			await step(model, 360, { ...idle, active: true, vy: 0.8 }); await step(model, 600);
			expect((await model.inspect()).details.amplitude).toBeCloseTo(-1, 6);
		} finally { model.dispose(); }
	});
	it('renders fractional 2x/3x at exact native dimensions with identical fixed-size state', async () => {
		const model = await createSnapFoil(device, format);
		try {
			model.settleLoad(-22); model.settleLoad(0);
			const two = presentationSize(700.25, 375.25, 2), three = presentationSize(700.25, 375.25, 3);
			model.resize(two.width, two.height); const state = await model.inspect(), a = bright(await pixels(model, two.width, two.height));
			model.resize(three.width, three.height); const high = await model.inspect(), b = bright(await pixels(model, three.width, three.height));
			expect(high.details.amplitude).toBe(state.details.amplitude); expect(high.kinetic).toBe(state.kinetic);
			expect(high.details.stateBytes).toBe(32); expect(model.memoryBytes).toBe(32);
			expect(high.details.resolvedCanvasBytes).toBe(three.width * three.height * 4);
			expect(a).toBeGreaterThan(10000); expect(b / a).toBeCloseTo(2.25, 1);
			expect(() => model.resize(4097, 4097)).toThrow('budget'); expect(await model.inspect()).toEqual(high);
			console.info('Foil native footprint', { two, three, area2x: a, area3x: b, stateBytes: model.memoryBytes });
		} finally { model.dispose(); }
	});
});
