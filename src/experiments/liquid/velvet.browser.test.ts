import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createVelvet, type VelvetExperiment } from './velvet.js';
import type { LiquidInput } from './types.js';

let device: GPUDevice;
beforeAll(async () => { const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull(); device = await adapter!.requestDevice(); });
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => { await device.queue.onSubmittedWorkDone(); expect(await device.popErrorScope()).toBeNull(); });
afterAll(() => device?.destroy());

async function pixels(engine: VelvetExperiment, width: number, height: number) {
	const row = Math.ceil(width * 4 / 256) * 256;
	const target = device.createTexture({ size: [width, height], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
	const readback = device.createBuffer({ size: row * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	try {
		const encoder = device.createCommandEncoder(); engine.render(encoder, target.createView());
		encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow: row }, [width, height]); device.queue.submit([encoder.finish()]);
		await readback.mapAsync(GPUMapMode.READ); const source = new Uint8Array(readback.getMappedRange()), output = new Uint8Array(width * height * 4);
		for (let y = 0; y < height; y++) output.set(source.subarray(y * row, y * row + width * 4), y * width * 4);
		return output;
	} finally { target.destroy(); readback.destroy(); }
}
function difference(a: Uint8Array, b: Uint8Array) { let error = 0; for (let i = 0; i < a.length; i++) error += Math.abs(a[i] - b[i]); return error / (a.length / 4); }

describe('native polar velvet', () => {
	it('changes appearance with frozen-state lighting and gives opposite strokes different reflection', async () => {
		const engine = await createVelvet(device, 'rgba8unorm');
		try {
			engine.resize(640, 360); engine.setLight(0); engine.brush([0.1, 0.5], [0.9, 0.5]);
			const right = await pixels(engine, 640, 360), state = await engine.inspect();
			engine.setLight(Math.PI); const reversedLight = await pixels(engine, 640, 360);
			expect((await engine.inspect()).details.checksum).toBe(state.details.checksum);
			expect((await engine.inspect()).details.uploads).toBe(state.details.uploads);
			expect(difference(right, reversedLight)).toBeGreaterThan(3);
			engine.reset(); engine.setLight(0); engine.brush([0.9, 0.5], [0.1, 0.5]);
			const left = await pixels(engine, 640, 360); expect(difference(right, left)).toBeGreaterThan(3);
			console.info('Velvet frozen-state light / opposite-nap differences', difference(right, reversedLight), difference(right, left));
		} finally { engine.dispose(); }
	});
	it('sweeps actual endpoints once across fixed substeps; preserves state through idle and native 2x/3x resizing', async () => {
		const engine = await createVelvet(device, 'rgba8unorm');
		try {
			engine.resize(1443, 761);
			const input: LiquidInput = { x: 0.1, y: 0.5, vx: 3, vy: 0, active: true, tilt: 0 };
			const encoder = device.createCommandEncoder(); engine.step(encoder, 1 / 120, input);
			for (let i = 0; i < 4; i++) engine.step(encoder, 1 / 120, { ...input, x: 0.9 });
			device.queue.submit([encoder.finish()]);
			const state = await engine.inspect(); expect(state.details.brushes).toBe(1); expect(state.details.changedCells).toBeGreaterThan(500);
			engine.endInput?.();
			const reentry = device.createCommandEncoder(); engine.step(reentry, 1 / 120, { ...input, x: 0.2, y: 0.2 }); device.queue.submit([reentry.finish()]);
			expect((await engine.inspect()).details.checksum).toBe(state.details.checksum);
			const two = await pixels(engine, 1443, 761); expect(two.length).toBe(1443 * 761 * 4);
			engine.resize(2164, 1142); const three = await pixels(engine, 2164, 1142); expect(three.length).toBe(2164 * 1142 * 4);
			const beforeIdle = await engine.inspect();
			const idle = device.createCommandEncoder(); for (let i = 0; i < 200; i++) engine.step(idle, 1 / 120, { ...input, active: false, vx: 0 }); device.queue.submit([idle.finish()]);
			const after = await engine.inspect();
			expect(after.finite).toBe(true); expect(after.details.checksum).toBe(state.details.checksum);
			expect(after.details.uploads).toBe(beforeIdle.details.uploads); expect(after.details.renders).toBe(beforeIdle.details.renders);
			expect(after.details.stateBytes).toBe(96 * 64 * 8); expect(after.details.resolvedCanvasBytes).toBe(2164 * 1142 * 4);
			expect(() => engine.resize(8192, 8192)).toThrow('no downsampling');
			expect((await engine.inspect()).details.width).toBe(2164);
			console.info('Velvet native allocations and idle preservation', after.details);
		} finally { engine.dispose(); }
	});
});
