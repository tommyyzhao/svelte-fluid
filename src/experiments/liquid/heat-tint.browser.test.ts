import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHeatTint, type HeatTintExperiment } from './heat-tint.js';
import { measureEffectPerformance } from './effects-performance.js';
import type { LiquidInput, LiquidSnapshot } from './types.js';

let device: GPUDevice;
const format: GPUTextureFormat = 'rgba8unorm';
const idle: LiquidInput = { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, tilt: 0 };
const errors: string[] = [];
beforeAll(async () => {
	expect(navigator.gpu).toBeDefined();
	const adapter = await navigator.gpu.requestAdapter();
	expect(adapter).not.toBeNull();
	const timestamps = adapter!.features.has('timestamp-query');
	device = await adapter!.requestDevice({ requiredFeatures: timestamps ? ['timestamp-query'] : [] });
	device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
	console.info('Heat tint adapter', { vendor: adapter!.info.vendor, architecture: adapter!.info.architecture,
		timestampQuery: timestamps, userAgent: navigator.userAgent });
});
beforeEach(() => { errors.length = 0; device.pushErrorScope('validation'); });
afterEach(async () => {
	await device.queue.onSubmittedWorkDone();
	expect((await device.popErrorScope())?.message ?? null).toBeNull();
	expect(errors).toEqual([]);
});
afterAll(() => device?.destroy());

async function advance(engine: HeatTintExperiment, count: number, inputAt: (step: number) => LiquidInput = () => idle) {
	for (let step = 0; step < count; step++) {
		const encoder = device.createCommandEncoder();
		engine.step(encoder, 1 / 120, inputAt(step));
		device.queue.submit([encoder.finish()]);
	}
	await device.queue.onSubmittedWorkDone();
}
function bounded(snapshot: LiquidSnapshot) {
	expect(snapshot.finite).toBe(true);
	for (const value of [snapshot.mass, snapshot.min, snapshot.max, ...Object.values(snapshot.details)]) expect(Number.isFinite(value)).toBe(true);
	expect(snapshot.min).toBeGreaterThanOrEqual(0);
	expect(snapshot.max).toBeLessThanOrEqual(1);
}
async function pixels(engine: HeatTintExperiment) {
	const target = device.createTexture({ size: [384, 224], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
	const staging = device.createBuffer({ size: 384 * 224 * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	try {
		const encoder = device.createCommandEncoder(); engine.render(encoder, target.createView());
		encoder.copyTextureToBuffer({ texture: target }, { buffer: staging, bytesPerRow: 1536 }, [384, 224]);
		device.queue.submit([encoder.finish()]); await staging.mapAsync(GPUMapMode.READ);
		return new Uint8Array(staging.getMappedRange()).slice();
	} finally { target.destroy(); staging.destroy(); }
}
function imageDifference(a: Uint8Array, b: Uint8Array) {
	let difference = 0;
	for (let i = 0; i < a.length; i++) difference += Math.abs(a[i]! - b[i]!);
	return difference / (a.length / 4);
}
const stroke = (step: number): LiquidInput => ({ ...idle, active: true,
	x: 0.25 + 0.5 * step / 120, y: 0.5 + 0.05 * Math.sin(step / 120 * Math.PI), vx: 0.5, vy: 0.05 * Math.PI * Math.cos(step / 120 * Math.PI) });

describe('persistent heat-tint experiment', () => {
	it('heats on movement, cools without erasing oxide, and resets only explicitly', async () => {
		const material = await createHeatTint(device, format);
		try {
			const original = await pixels(material);
			await advance(material, 60, () => ({ ...idle, active: true }));
			expect((await material.inspect()).details.maxHeat).toBe(0);
			expect((await material.inspect()).details.oxideHistory).toBe(0);
			await advance(material, 120, stroke);
			const hot = await material.inspect(); bounded(hot);
			expect(hot.details.maxHeat).toBeGreaterThan(0.1);
			expect(hot.details.oxideHistory).toBeGreaterThan(0);
			await advance(material, 240);
			const cooling = await material.inspect(); bounded(cooling);
			expect(cooling.details.maxHeat).toBeLessThan(hot.details.maxHeat! * 0.02);
			expect(cooling.details.oxideHistory).toBeGreaterThanOrEqual(hot.details.oxideHistory!);
			const history = cooling.details.oxideHistory;
			material.cool();
			const cold = await material.inspect(); bounded(cold);
			expect(cold.details.maxHeat).toBe(0);
			expect(cold.details.oxideHistory).toBe(history);
			const marked = await pixels(material);
			expect(imageDifference(original, marked)).toBeGreaterThan(1);
			material.resize(2000, 1167);
			await advance(material, 120);
			expect(await material.inspect()).toEqual(cold);
			expect(imageDifference(marked, await pixels(material))).toBe(0);
			material.reset();
			const fresh = await material.inspect(); bounded(fresh);
			expect(fresh.details.oxideHistory).toBe(0);
			expect(fresh.details.maxHeat).toBe(0);
			expect(imageDifference(original, await pixels(material))).toBe(0);
			console.info('Heat tint persistence', { hot: hot.details, cooling: cooling.details,
				coldImageDifference: imageDifference(original, marked) });
		} finally { material.dispose(); }
	});

	it('bounds repeated exposure and matches ordinary multi-step submissions', async () => {
		const material = await createHeatTint(device, format);
		try {
			const heat = { ...idle, active: true, vx: 0.6 };
			await advance(material, 480, () => heat);
			const separate = await material.inspect(); bounded(separate);
			material.reset();
			for (let frame = 0; frame < 120; frame++) {
				const encoder = device.createCommandEncoder();
				for (let step = 0; step < 4; step++) material.step(encoder, 1 / 120, heat);
				device.queue.submit([encoder.finish()]);
			}
			expect(await material.inspect()).toEqual(separate);
			expect(separate.details.maxOxideNm).toBeGreaterThan(100);
			expect(separate.details.maxOxideNm).toBeLessThanOrEqual(360);
		} finally { material.dispose(); }
	});

	it('measures warmed complete-frame cost at separate presentation sizes', async () => {
		const material = await createHeatTint(device, format);
		try {
			for (const [width, height] of [[1000, 584], [2000, 1168]]) {
				material.reset();
				const result = await measureEffectPerformance(device, format, material, width!, height!, (frame) => stroke(frame % 120));
				expect(result.sampleFrames).toBe(60);
				expect(result.queuedWallMsPerFrame).toBeGreaterThan(0);
				if (device.features.has('timestamp-query')) {
					expect(result.gpuMs).not.toBeNull();
					expect(result.timedPassesPerFrame).toEqual({ min: 3, max: 3 });
				}
				bounded(await material.inspect());
				console.info('Heat tint warmed performance', result);
			}
		} finally { material.dispose(); }
	});
});
