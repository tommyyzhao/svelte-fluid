import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createMembrane } from './membrane.js';
import type { LiquidExperiment } from './types.js';

let device: GPUDevice;
const format: GPUTextureFormat = 'rgba8unorm';

beforeAll(async () => {
	const adapter = await navigator.gpu.requestAdapter();
	expect(adapter).not.toBeNull();
	device = await adapter!.requestDevice();
});
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => {
	await device.queue.onSubmittedWorkDone();
	expect(await device.popErrorScope()).toBeNull();
});
afterAll(() => device?.destroy());

async function pixels(engine: LiquidExperiment) {
	const width = 384, height = 192;
	engine.resize(width, height);
	const target = device.createTexture({ size: [width, height], format,
		usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
	const readback = device.createBuffer({ size: width * height * 4,
		usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	try {
		const encoder = device.createCommandEncoder();
		engine.render(encoder, target.createView());
		encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow: width * 4 }, [width, height]);
		device.queue.submit([encoder.finish()]);
		await readback.mapAsync(GPUMapMode.READ);
		return new Uint8Array(readback.getMappedRange()).slice();
	} finally { target.destroy(); readback.destroy(); }
}

describe('continuous optical reconstruction', () => {
	it('does not change the analytic resting material when the simulation grid changes', async () => {
		const low = await createMembrane(device, format, { gridSize: 192 });
		const high = await createMembrane(device, format, { gridSize: 256 });
		try {
			const a = await pixels(low), b = await pixels(high);
			let worst = 0, error = 0;
			for (let i = 0; i < a.length; i++) { const delta = Math.abs(a[i] - b[i]); worst = Math.max(worst, delta); error += delta; }
			// Resting drape is analytic, not finite-differenced at simulation-cell
			// spacing. Allow one byte for backend floating-point rounding only.
			expect(worst).toBeLessThanOrEqual(1);
			expect(error / a.length).toBeLessThan(0.01);
			console.info('Resting membrane optical grid invariance', { worstByteDifference: worst, meanByteDifference: error / a.length });
		} finally { low.dispose(); high.dispose(); }
	});

	it('keeps an ordinary sustained brush away from the emergency height clamp', async () => {
		for (const gridSize of [192, 256]) {
			const membrane = await createMembrane(device, format, { gridSize });
			try {
				membrane.resize(1536, 768);
				for (let step = 0; step < 90; step++) {
					const encoder = device.createCommandEncoder();
					membrane.step(encoder, 1 / 120, { x: 0.3 + step / 300, y: 0.5, vx: 0.4, vy: 0.15, active: true, tilt: 0 });
					device.queue.submit([encoder.finish()]);
					if (step % 15 === 14) {
						const snapshot = await membrane.inspect();
						expect(snapshot.finite).toBe(true);
						expect(snapshot.details.heightLimitCells).toBe(0);
						expect(snapshot.details.maxAbsHeight).toBeLessThan(0.085);
					}
				}
				const final = await membrane.inspect();
				expect(final.details.heightRms).toBeGreaterThan(0.003);
				console.info('Unclipped membrane gesture', final.details);
			} finally { membrane.dispose(); }
		}
	});
});
