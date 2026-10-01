import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createCrazedEnamel, type CrazedEnamelExperiment } from './crazed-enamel.js';

let device: GPUDevice;
beforeAll(async () => { const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull(); device = await adapter!.requestDevice(); });
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => { await device.queue.onSubmittedWorkDone(); expect(await device.popErrorScope()).toBeNull(); });
afterAll(() => device?.destroy());

async function pixels(engine: CrazedEnamelExperiment, width: number, height: number) {
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

describe('persistent native crack graph', () => {
	it('has visible history, T junctions, and frozen graph under changed light', async () => {
		const engine = await createCrazedEnamel(device, 'rgba8unorm');
		try {
			engine.resize(800, 480); engine.reset(); const clean = await pixels(engine, 800, 480);
			for (const [x, y] of [[0.38, 0.46], [0.68, 0.64], [0.69, 0.25], [0.23, 0.7]]) engine.seed(x, y);
			const cracked = await pixels(engine, 800, 480), state = await engine.inspect();
			expect(state.finite).toBe(true); expect(state.details.segments).toBeGreaterThan(70); expect(state.details.junctions).toBeGreaterThan(0);
			expect(state.details.minSeedClearance).toBeGreaterThanOrEqual(state.details.reliefRadius);
			expect(difference(clean, cracked)).toBeGreaterThan(0.5);
			engine.setLight(1.1); const relit = await pixels(engine, 800, 480);
			expect(difference(cracked, relit)).toBeGreaterThan(4);
			expect((await engine.inspect()).details.checksum).toBe(state.details.checksum);
			expect((await engine.inspect()).details.uploads).toBe(state.details.uploads);
			console.info('Crazed enamel visible graph / frozen-state light differences', difference(clean, cracked), difference(cracked, relit), state.details);
		} finally { engine.dispose(); }
	});
	it('renders native filtered bevels at fractional-layout 2x/3x without rebuilding or idle uploads', async () => {
		const engine = await createCrazedEnamel(device, 'rgba8unorm');
		try {
			engine.seed(0.68, 0.64); engine.resize(1443, 761); const state = await engine.inspect();
			const two = await pixels(engine, 1443, 761); expect(two.length).toBe(1443 * 761 * 4);
			engine.resize(2164, 1142); const three = await pixels(engine, 2164, 1142); expect(three.length).toBe(2164 * 1142 * 4);
			const beforeIdle = await engine.inspect();
			const encoder = device.createCommandEncoder(); for (let i = 0; i < 200; i++) engine.step(encoder, 1 / 120, { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, tilt: 0 }); device.queue.submit([encoder.finish()]);
			const after = await engine.inspect();
			expect(after.details.checksum).toBe(state.details.checksum); expect(after.details.uploads).toBe(beforeIdle.details.uploads);
			expect(after.details.renders).toBe(beforeIdle.details.renders); expect(after.details.stateBytes).toBe(240 * 48);
			expect(after.details.resolvedCanvasBytes).toBe(2164 * 1142 * 4);
			expect(() => engine.resize(8192, 8192)).toThrow('no downsampling'); expect((await engine.inspect()).details.width).toBe(2164);
			console.info('Crazed enamel native allocations and idle preservation', after.details);
		} finally { engine.dispose(); }
	});
});
