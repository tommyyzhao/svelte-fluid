import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createImprint } from './imprint.js';
import { createLiquidSelection } from './liquid-selection.js';
import { createSoftType } from './soft-type.js';
import type { LiquidExperiment, LiquidInput, LiquidSnapshot } from './types.js';

let device: GPUDevice;
const format: GPUTextureFormat = 'rgba8unorm';
const idle: LiquidInput = { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, press: 0, tilt: 0 };
const uncaptured: string[] = [];

beforeAll(async () => {
	expect(navigator.gpu).toBeDefined();
	const adapter = await navigator.gpu.requestAdapter();
	expect(adapter).not.toBeNull();
	console.info('Creative UI adapter', adapter!.info.vendor, adapter!.info.architecture);
	device = await adapter!.requestDevice();
	device.addEventListener('uncapturederror', (event) => uncaptured.push(event.error.message));
});
beforeEach(() => { uncaptured.length = 0; device.pushErrorScope('validation'); });
afterEach(async () => {
	await device.queue.onSubmittedWorkDone();
	expect(await device.popErrorScope()).toBeNull();
	expect(uncaptured).toEqual([]);
});
afterAll(() => device?.destroy());

async function advance(engine: LiquidExperiment, count: number, input = idle) {
	for (let step = 0; step < count; step += 4) {
		const encoder = device.createCommandEncoder();
		for (let i = 0; i < Math.min(4, count - step); i++) engine.step(encoder, 1 / 120, input);
		device.queue.submit([encoder.finish()]);
	}
	await device.queue.onSubmittedWorkDone();
}

async function pixels(engine: LiquidExperiment): Promise<Uint8Array> {
	engine.resize(128, 128);
	const target = device.createTexture({ size: [128, 128], format,
		usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
	const staging = device.createBuffer({ size: 128 * 128 * 4,
		usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	try {
		const encoder = device.createCommandEncoder();
		engine.render(encoder, target.createView());
		encoder.copyTextureToBuffer({ texture: target }, { buffer: staging, bytesPerRow: 512 }, [128, 128]);
		device.queue.submit([encoder.finish()]);
		await staging.mapAsync(GPUMapMode.READ);
		const result = new Uint8Array(staging.getMappedRange()).slice();
		let excess = 0, invisibleColor = 0;
		for (let i = 0; i < result.length; i += 4) for (let c = 0; c < 3; c++) {
			excess = Math.max(excess, result[i + c]! - result[i + 3]!);
			if (result[i + 3] === 0) invisibleColor = Math.max(invisibleColor, result[i + c]!);
		}
		expect(excess, 'Transparent output must be premultiplied').toBeLessThanOrEqual(1);
		expect(invisibleColor).toBe(0);
		return result;
	} finally { target.destroy(); staging.destroy(); }
}

function expectFinite(snapshot: LiquidSnapshot) {
	expect(snapshot.finite).toBe(true);
	for (const value of [snapshot.mass, snapshot.min, snapshot.max, snapshot.kinetic, ...Object.values(snapshot.details)]) {
		expect(Number.isFinite(value)).toBe(true);
	}
}

describe('creative liquid UI experiments', () => {
	it('moves the actual type silhouette on hover and recovers beneath a stationary pointer', async () => {
		const initial = new Float32Array(64 * 64);
		const solid = new Uint8Array(64 * 64).fill(1);
		const coverage = new Uint8Array(128 * 128);
		for (let y = 12; y < 52; y++) for (let x = 26; x < 38; x++) {
			initial[y * 64 + x] = 0.3;
			solid[y * 64 + x] = 0;
		}
		for (let y = 24; y < 104; y++) for (let x = 52; x < 76; x++) coverage[y * 128 + x] = 255;
		const type = await createSoftType(device, format, { width: 64, height: 64, initial, solid,
			coverage: { width: 128, height: 128, data: coverage }, transparent: true });
		try {
			const restPixels = await pixels(type);
			// A moving pointer applies no click pressure and needs no stored anchor.
			await advance(type, 90, { ...idle, vx: 0.8, active: true, press: 0 });
			const pulled = await type.inspect();
			expectFinite(pulled);
			expect(pulled.details.displacementRms).toBeGreaterThan(0.001);
			expect(pulled.details.maxDisplacement).toBeLessThan(0.2);
			expect(pulled.details.minJacobian).toBeGreaterThan(0);
			const pulledPixels = await pixels(type);
			let newlyOccupied = 0, vacated = 0;
			for (let i = 3; i < restPixels.length; i += 4) {
				if (restPixels[i]! < 5 && pulledPixels[i]! > 100) newlyOccupied++;
				if (restPixels[i]! > 100 && pulledPixels[i]! < 5) vacated++;
			}
			// An RGB highlight change cannot pass either silhouette assertion.
			expect(newlyOccupied).toBeGreaterThan(20);
			expect(vacated).toBeGreaterThan(20);
			// It remains over the same letter: stopping, not leaving, must release it.
			await advance(type, 60, { ...idle, active: true });
			const returning = await type.inspect();
			await advance(type, 180, { ...idle, active: true });
			const recovered = await type.inspect();
			expectFinite(recovered);
			expect(returning.details.displacementRms).toBeLessThan(pulled.details.displacementRms!);
			expect(recovered.details.displacementRms).toBeLessThan(returning.details.displacementRms!);
			expect(recovered.details.minJacobian).toBeGreaterThan(0);
			const recoveredPixels = await pixels(type);
			let alphaError = 0;
			for (let i = 3; i < restPixels.length; i += 4) alphaError += Math.abs(recoveredPixels[i]! - restPixels[i]!);
			expect(alphaError / (128 * 128)).toBeLessThan(1);
		} finally { type.dispose(); }
	});

	it('keeps the latest selection authoritative through rapid reversals and supports immediate placement', async () => {
		const selection = await createLiquidSelection(device, format, 0);
		try {
			const firstPixels = await pixels(selection);
			for (const target of [2, 0, 2, 1, 0, 1]) {
				selection.setSelection(target);
				await advance(selection, 8);
				const moving = await selection.inspect();
				expectFinite(moving);
				expect(moving.min).toBeGreaterThanOrEqual(0);
				expect(moving.max).toBeLessThanOrEqual(3);
				expect(moving.details.maxSpeed).toBeLessThanOrEqual(Math.sqrt(50) + 1e-5);
			}
			const turning = await selection.inspect();
			await advance(selection, 480);
			const settled = await selection.inspect();
			expectFinite(settled);
			expect(settled.details.target).toBe(1.5);
			expect(settled.details.targetError).toBeLessThan(turning.details.targetError!);
			expect(settled.details.targetError).toBeLessThan(0.01);
			expect(settled.kinetic).toBeLessThan(turning.kinetic);
			selection.setSelection(2, true);
			const immediatePixels = await pixels(selection);
			const immediate = await selection.inspect();
			expect(immediate.details.target).toBe(2.5);
			expect(immediate.details.targetError).toBeLessThan(1e-6);
			expect(immediate.kinetic).toBe(0);
			expect(immediatePixels.some((value, i) => value !== firstPixels[i])).toBe(true);
		} finally { selection.dispose(); }
	});

	it('retains multiple imprints until smoothing, with bounded depth and immediate reduced-motion updates', async () => {
		const mask = new Uint8Array(32 * 32);
		for (let y = 8; y < 24; y++) for (let x = 8; x < 24; x++) mask[y * 32 + x] = 255;
		const imprint = await createImprint(device, format, { width: 32, height: 32, data: mask });
		try {
			const blankPixels = await pixels(imprint);
			imprint.stamp(0.34, 0.5, true);
			const firstPixels = await pixels(imprint);
			const first = await imprint.inspect();
			expect(first.details.plasticDepth).toBeGreaterThan(0);
			expect(first.details.meanDepth).toBe(first.details.plasticDepth);
			expect(firstPixels.some((value, i) => value !== blankPixels[i])).toBe(true);
			await advance(imprint, 120);
			const retained = await imprint.inspect();
			expect(retained.details.plasticDepth).toBe(first.details.plasticDepth);
			expect(retained.details.meanDepth).toBe(first.details.meanDepth);

			imprint.stamp(0.66, 0.5, true);
			const secondPixels = await pixels(imprint);
			const second = await imprint.inspect();
			expect(second.details.plasticDepth).toBeGreaterThan(first.details.plasticDepth!);
			// The two small stamp footprints are disjoint. The original mark stays
			// visible while the new mark is added; it is not replaced by latest input.
			let originalMarkDifference = 0;
			for (let y = 48; y < 80; y++) for (let x = 24; x < 60; x++) {
				const offset = (y * 128 + x) * 4;
				for (let c = 0; c < 4; c++) originalMarkDifference += Math.abs(secondPixels[offset + c]! - firstPixels[offset + c]!);
			}
			expect(originalMarkDifference).toBe(0);
			for (let i = 0; i < 12; i++) {
				imprint.stamp(0.3 + (i % 3) * 0.2, 0.3 + (i % 2) * 0.4, true);
				await advance(imprint, 1);
			}
			const accumulated = await imprint.inspect();
			expectFinite(accumulated);
			expect(accumulated.min).toBeGreaterThanOrEqual(0);
			expect(accumulated.max).toBeLessThanOrEqual(1);
			expect(accumulated.details.plasticDepth).toBeGreaterThanOrEqual(second.details.plasticDepth!);
			imprint.smooth();
			const smoothing = await imprint.inspect();
			expect(smoothing.details.plasticDepth).toBe(0);
			expect(smoothing.details.meanDepth).toBe(accumulated.details.meanDepth);
			await advance(imprint, 1);
			const early = await imprint.inspect();
			expect(early.details.meanDepth).toBeGreaterThan(0);
			expect(early.details.meanDepth).toBeLessThan(smoothing.details.meanDepth!);
			await advance(imprint, 120);
			expect((await imprint.inspect()).details.meanDepth).toBeLessThan(early.details.meanDepth!);
			imprint.smooth(true);
			const smoothPixels = await pixels(imprint);
			expect((await imprint.inspect()).details.meanDepth).toBe(0);
			expect(smoothPixels).toEqual(blankPixels);

			// Discrete actions between display frames retain order; a single
			// pending-action slot would silently replace the first stamp here.
			imprint.stamp(0.34, 0.5, true);
			imprint.stamp(0.66, 0.5, true);
			expect(await pixels(imprint)).toEqual(secondPixels);
			expect((await imprint.inspect()).details.plasticDepth).toBe(second.details.plasticDepth);

			imprint.smooth(true);
			imprint.stamp(0.5, 0.65, true);
			const clearedThenStamped = await pixels(imprint);
			imprint.reset();
			imprint.stamp(0.5, 0.65, true);
			const cleanStamp = await pixels(imprint);
			expect(clearedThenStamped).toEqual(cleanStamp);

			imprint.reset();
			imprint.stamp(0.5, 0.65);
			const unfinished = await imprint.inspect();
			expect(unfinished.details.plasticDepth).toBeGreaterThan(0);
			expect(unfinished.details.meanDepth).toBe(0);
			imprint.finish();
			const finished = await imprint.inspect();
			expect(finished.details.plasticDepth).toBe(unfinished.details.plasticDepth);
			expect(finished.details.meanDepth).toBe(finished.details.plasticDepth);
			expect(await pixels(imprint)).toEqual(cleanStamp);

			imprint.smooth();
			const unfinishedSmoothing = await imprint.inspect();
			expect(unfinishedSmoothing.details.plasticDepth).toBe(0);
			expect(unfinishedSmoothing.details.meanDepth).toBe(finished.details.meanDepth);
			imprint.finish();
			const finishedSmoothing = await imprint.inspect();
			expect(finishedSmoothing.details.plasticDepth).toBe(unfinishedSmoothing.details.plasticDepth);
			expect(finishedSmoothing.details.meanDepth).toBe(0);
			expect(await pixels(imprint)).toEqual(blankPixels);
		} finally { imprint.dispose(); }
	});
});
