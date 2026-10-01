import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createStressGlass } from './stress-glass.js';
import type { LiquidExperiment } from './types.js';

let device: GPUDevice;
beforeAll(async () => { const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull(); device = await adapter!.requestDevice(); });
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => { await device.queue.onSubmittedWorkDone(); expect(await device.popErrorScope()).toBeNull(); });
afterAll(() => device?.destroy());

async function pixels(model: LiquidExperiment, width: number, height: number) {
	const bytesPerRow = Math.ceil(width * 4 / 256) * 256;
	const target = device.createTexture({ size: [width, height], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
	const read = device.createBuffer({ size: bytesPerRow * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	try {
		const encoder = device.createCommandEncoder(); model.render(encoder, target.createView()); encoder.copyTextureToBuffer({ texture: target }, { buffer: read, bytesPerRow }, [width, height]); device.queue.submit([encoder.finish()]); await read.mapAsync(GPUMapMode.READ);
		const source = new Uint8Array(read.getMappedRange()), result = new Uint8Array(width * height * 4);
		for (let y = 0; y < height; y++) result.set(source.subarray(y * bytesPerRow, y * bytesPerRow + width * 4), y * width * 4);
		return result;
	} finally { target.destroy(); read.destroy(); }
}

describe('native finite-contact glass', () => {
	it('renders symmetric load bands, releases, and keeps pressure across fractional 2x/3x sizing', async () => {
		const model = await createStressGlass(device, 'rgba8unorm');
		try {
			// CSS 400.5 × 320.5; multiply first, round once.
			model.resize(801, 641); model.setLoad(0.71); const loaded = await pixels(model, 801, 641);
			let symmetry = 0, count = 0;
			for (let y = 200; y < 441; y++) for (let x = 260; x < 541; x++) for (let c = 0; c < 3; c++) {
				symmetry += Math.abs(loaded[(y * 801 + x) * 4 + c] - loaded[(y * 801 + 800 - x) * 4 + c]); count++;
			}
			expect(symmetry / count).toBeLessThan(0.15);
			const before = await model.inspect(); model.resize(1202, 962); const after = await model.inspect();
			expect(after.details.pressure).toBe(before.details.pressure); expect(after.details.stateBytes).toBe(32); expect(model.memoryBytes).toBe(32);
			expect(after.details.resolvedCanvasBytes).toBe(1202 * 962 * 4); expect((await pixels(model, 1202, 962)).length).toBe(1202 * 962 * 4);
			expect(() => model.resize(5000, 5000)).toThrow('output budget'); expect((await model.inspect()).details.width).toBe(1202);
			model.resize(801, 641); model.reset(); const released = await pixels(model, 801, 641);
			let change = 0; for (let i = 0; i < loaded.length; i += 4) for (let c = 0; c < 3; c++) change += Math.abs(loaded[i + c] - released[i + c]);
			expect(change / (801 * 641 * 3)).toBeGreaterThan(15); expect((await model.inspect()).details.pressure).toBe(0);
			console.info('Glass finite-contact native rendering', { symmetryMean: symmetry / count, releasedMeanDifference: change / (801 * 641 * 3), two: before.details, three: after.details });
		} finally { model.dispose(); }
	});
	it('removes gesture load after release without needing a reset', async () => {
		const model = await createStressGlass(device, 'rgba8unorm');
		try {
			model.reset();
			for (let i = 0; i < 700; i++) { const encoder = device.createCommandEncoder(); model.step(encoder, 1 / 120, { x: 0.5, y: 0.5, vx: 0, vy: 0, active: i < 80, tilt: 0 }); device.queue.submit([encoder.finish()]); }
			expect((await model.inspect()).details.pressure).toBe(0);
		} finally { model.dispose(); }
	});
});
