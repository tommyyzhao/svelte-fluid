import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CONTOURS, contourLength, contourPoint, createContourWaves } from './contour-waves.js';
import type { LiquidExperiment } from './types.js';

let device: GPUDevice;
beforeAll(async () => { const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull(); device = await adapter!.requestDevice(); });
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => { await device.queue.onSubmittedWorkDone(); expect(await device.popErrorScope()).toBeNull(); });
afterAll(() => device?.destroy());

async function pixels(model: LiquidExperiment, width: number, height: number) {
	model.resize(width, height);
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
const difference = (a: Uint8Array, b: Uint8Array) => { let sum = 0; for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c++) sum += Math.abs(a[i + c] - b[i + c]); return sum / (a.length / 4 * 3); };

describe('native contour echoes', () => {
	it('renders a restrained dot pulse and loses the repeated spring motion within 0.3–0.6 seconds', async () => {
		const model = await createContourWaves(device, 'rgba8unorm');
		try {
			const width = 920, height = 540, rest = await pixels(model, width, height);
			model.pulse(1, 0.15); const initial = await model.inspect(), crest = await pixels(model, width, height);
			expect(initial.details.relativeEnvelope1).toBeLessThan(0.08); expect(initial.kinetic).toBe(0);
			// Explicit still-state rendering cannot secretly advance its motion.
			expect(difference(crest, await pixels(model, width, height))).toBe(0);
			const input = { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, tilt: 0 };
			model.step(device.createCommandEncoder(), 0.3, input); const middle = await model.inspect();
			expect(middle.details.energy1 / initial.details.energy1).toBeLessThan(0.025);
			model.step(device.createCommandEncoder(), 0.3, input); const late = await pixels(model, width, height), final = await model.inspect();
			expect(final.details.energy1 / initial.details.energy1).toBeLessThan(0.0005); expect(final.details.energy0).toBe(0);
			let crestChange = 0, lateChange = 0, samples = 0;
			for (let y = 205; y < 335; y++) for (let x = 700; x < 835; x++) for (let c = 0; c < 3; c++) {
				const i = (y * width + x) * 4 + c; crestChange += Math.abs(crest[i] - rest[i]); lateChange += Math.abs(late[i] - rest[i]); samples++;
			}
			expect(crestChange / samples).toBeGreaterThan(0.15); expect(lateChange / samples).toBeLessThan(crestChange / samples * 0.1);
			console.info('Restrained contour dot decay', { relativeEnvelope: initial.details.relativeEnvelope1, crestMean: crestChange / samples, lateMean: lateChange / samples, energy300ms: middle.details.energy1 / initial.details.energy1, energy600ms: final.details.energy1 / initial.details.energy1 });
		} finally { model.dispose(); }
	});
	it('shows independent repeated hover input, resizes without erasing waves, and differs from its highlight baseline', async () => {
		const model = await createContourWaves(device, 'rgba8unorm');
		try {
			model.resize(920, 540); const rest = await pixels(model, 920, 540);
			const inputAt = (fraction: number) => { const point = contourPoint(fraction * contourLength(CONTOURS[0]), CONTOURS[0]); return { x: point.x / 2.3 + 0.5, y: point.y / 1.35 + 0.5, vx: 0, vy: 0, active: true, tilt: 0 }; };
			model.step(device.createCommandEncoder(), 1 / 120, inputAt(0.1));
			const first = await model.inspect(); expect(first.details.impulses).toBe(1); expect(first.details.energy0).toBeGreaterThan(0); expect(first.details.energy1).toBe(0);
			model.step(device.createCommandEncoder(), 1 / 120, inputAt(0.1)); expect((await model.inspect()).details.impulses).toBe(1);
			model.step(device.createCommandEncoder(), 0.18, { ...inputAt(0.1), active: false });
			const one = await pixels(model, 920, 540); model.step(device.createCommandEncoder(), 1 / 120, inputAt(0.6));
			const two = await pixels(model, 920, 540); expect(difference(one, two)).toBeGreaterThan(0.03); expect(difference(rest, two)).toBeGreaterThan(0.1);
			const before = await model.inspect(); model.resize(1380, 810); const after = await model.inspect(); expect(after.details.energy0).toBe(before.details.energy0); expect(after.details.stateBytes).toBe(2112); expect(after.details.energy1).toBe(0);
			model.setOptions({ baseline: true }); const baseline = await pixels(model, 920, 540); expect(difference(two, baseline)).toBeGreaterThan(0.1);
			model.setOptions({ baseline: false }); model.pulse(1, 0.2); expect((await model.inspect()).details.energy1).toBeGreaterThan(0);
			expect(() => model.resize(5000, 5000)).toThrow('presentation budget'); expect((await model.inspect()).details.width).toBe(920);
			model.reset(); expect((await model.inspect()).kinetic).toBe(0);
			model.pulse(0); expect((await model.inspect()).kinetic).toBe(0); model.reset();
			const move = (x: number) => model.step(device.createCommandEncoder(), 1 / 120, { x: x / 2.3 + 0.5, y: 0.5, vx: 0, vy: 0, active: true, tilt: 0 });
			move(-1.05); move(1.1); const crossed = await model.inspect(); expect(crossed.details.energy0).toBeGreaterThan(0); expect(crossed.details.energy1).toBeGreaterThan(0);
			console.info('Contour echoes native / independent input', { repeatedDifference: difference(one, two), baselineDifference: difference(two, baseline), before: before.details, after: after.details });
		} finally { model.dispose(); }
	});
	it('filters curved beveled edges against a 4× sampling reference at fractional CSS 2× and 3×', async () => {
		const model = await createContourWaves(device, 'rgba8unorm');
		try {
			model.pulse(0, 0.035); model.pulse(1, 0.35);
			for (const dpr of [2, 3]) {
				const width = Math.round(300.5 * dpr), height = Math.round(180.5 * dpr);
				const actual = await pixels(model, width, height), reference = await pixels(model, width * 4, height * 4);
				let error = 0, rimError = 0, rimSamples = 0;
				for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
					for (let c = 0; c < 3; c++) {
						let average = 0; for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) average += reference[((y * 4 + sy) * width * 4 + x * 4 + sx) * 4 + c] / 16;
						const delta = Math.abs(actual[(y * width + x) * 4 + c] - average); error += delta;
						if (average > 30) { rimError += delta; rimSamples++; }
					}
				}
				expect(error / (width * height * 3)).toBeLessThan(0.7); expect(rimError / rimSamples).toBeLessThan(5);
				console.info('Contour native edge reference', { dpr, width, height, mean: error / (width * height * 3), rimMean: rimError / rimSamples });
			}
		} finally { model.dispose(); }
	});
});
