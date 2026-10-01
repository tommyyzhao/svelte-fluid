import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createImprint, type ImprintExperiment } from './imprint.js';
import { presentationSize } from './presentation-size.js';
import type { ImprintMask } from './imprint-tools.js';

let device: GPUDevice;
const format = 'rgba8unorm' as const;
beforeAll(async () => { const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull(); device = await adapter!.requestDevice(); });
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => { await device.queue.onSubmittedWorkDone(); expect(await device.popErrorScope()).toBeNull(); });
afterAll(() => device?.destroy());
function source(size: number): ImprintMask {
	const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
	const context = canvas.getContext('2d')!; context.scale(size, size); context.fillStyle = '#fff';
	context.fillRect(0.25, 0.2, 0.13, 0.6); context.fillRect(0.25, 0.66, 0.5, 0.14);
	context.strokeStyle = '#fff'; context.lineWidth = 0.012; context.beginPath(); context.arc(0.5, 0.5, 0.43, 0, Math.PI * 2); context.stroke();
	const pixels = context.getImageData(0, 0, size, size).data;
	return { width: size, height: size, data: Uint8Array.from({ length: size * size }, (_, i) => pixels[i * 4 + 3]) };
}
async function pixels(model: ImprintExperiment, width: number, height: number) {
	const bytesPerRow = Math.ceil(width * 4 / 256) * 256;
	const target = device.createTexture({ size: [width, height], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
	const read = device.createBuffer({ size: bytesPerRow * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	try {
		const encoder = device.createCommandEncoder(); model.render(encoder, target.createView());
		encoder.copyTextureToBuffer({ texture: target }, { buffer: read, bytesPerRow }, [width, height]);
		device.queue.submit([encoder.finish()]); await read.mapAsync(GPUMapMode.READ);
		const mapped = new Uint8Array(read.getMappedRange()), result = new Uint8Array(width * height * 4);
		for (let y = 0; y < height; y++) result.set(mapped.subarray(y * bytesPerRow, y * bytesPerRow + width * 4), y * width * 4);
		return result;
	} finally { target.destroy(); read.destroy(); }
}
function difference(a: Uint8Array, b: Uint8Array) { let sum = 0, changed = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); sum += d; changed += Number(d > 0); } return { mean: sum / a.length, changed }; }
function coverage(data: Uint8Array) { let area = 0, invalid = 0; for (let i = 0; i < data.length; i += 4) { area += data[i + 3] / 255; for (let c = 0; c < 3; c++) invalid = Math.max(invalid, data[i + c] - data[i + 3]); } expect(invalid).toBeLessThanOrEqual(1); return area; }

describe('native retained imprint tools', () => {
	it('keeps earlier asymmetric tools unchanged and processes mixed stamps/clear in order', async () => {
		const model = await createImprint(device, format, source(512));
		try {
			model.resize(640, 640); const blank = await pixels(model, 640, 640);
			model.setTool({ size: 0.2 }); const empty = await model.inspect();
			expect(model.stamp(0.01, 0.01, true)).toBe(false); expect(model.count).toBe(0); expect(model.marked).toBe(false);
			expect((await model.inspect()).details.historyChecksum).toBe(empty.details.historyChecksum);
			expect(difference(blank, await pixels(model, 640, 640)).changed).toBe(0);
			model.setTool({ shape: 'ring' }); expect(model.stamp(0.86, 0.5, true)).toBe(true);
			expect((await model.inspect()).details.meanDepth).toBeGreaterThan(0); expect(difference(blank, await pixels(model, 640, 640)).changed).toBeGreaterThan(100);
			model.reset();
			model.setTool({ size: 0.24, shape: 'signet', rotation: 25 }); model.stamp(0.32, 0.5, true);
			const first = await pixels(model, 640, 640), firstState = await model.inspect();
			model.setTool({ shape: 'comb', size: 0.26, rotation: 75, bevel: 0.004 });
			expect(difference(first, await pixels(model, 640, 640)).changed).toBe(0);
			model.stamp(0.68, 0.5, true); const second = await pixels(model, 640, 640);
			let oldChanges = 0; for (let y = 220; y < 420; y++) for (let x = 130; x < 280; x++) for (let c = 0; c < 4; c++) oldChanges += Math.abs(first[(y * 640 + x) * 4 + c] - second[(y * 640 + x) * 4 + c]);
			expect(oldChanges).toBe(0); expect(difference(first, second).mean).toBeGreaterThan(0.1);
			expect((await model.inspect()).details.plasticDepth).toBeGreaterThan(firstState.details.plasticDepth);
			model.smooth(); model.setTool({ shape: 'rosette', size: 0.46, rotation: 15 }); model.stamp(0.5, 0.5); model.finish();
			const ordered = await pixels(model, 640, 640); expect(model.count).toBe(1);
			model.reset(); model.stamp(0.5, 0.5, true); expect(difference(ordered, await pixels(model, 640, 640)).changed).toBe(0);
			model.smooth(true); expect(difference(blank, await pixels(model, 640, 640)).changed).toBe(0);
		} finally { model.dispose(); }
	});
	it('retains the exact history across fractional2x/3x native source/presentation changes', async () => {
		const two = presentationSize(421.25, 421.25, 2), three = presentationSize(421.25, 421.25, 3);
		const model = await createImprint(device, format, source(Math.ceil(two.width * 0.6)));
		try {
			model.resize(two.width, two.height); model.stamp(0.45, 0.43, true);
			model.setTool({ shape: 'ring', size: 0.39, rotation: 50, bevel: 0.006 }); model.stamp(0.57, 0.57, true);
			const before = await model.inspect(), area2 = coverage(await pixels(model, two.width, two.height));
			model.resize(three.width, three.height); await model.updateMask(source(Math.ceil(three.width * 0.6)));
			const after = await model.inspect(), area3 = coverage(await pixels(model, three.width, three.height));
			expect(after.details.historyChecksum).toBe(before.details.historyChecksum); expect(after.details.impressions).toBe(2);
			expect(after.details.sourceWidth).toBe(Math.ceil(three.width * 0.6)); expect(after.details.sourceBytes).toBe(after.details.sourceWidth ** 2 * 4);
			expect(after.details.gpuHistoryBytes).toBe(before.details.gpuHistoryBytes); expect(after.details.outputBytes).toBe(three.width * three.height * 4);
			expect(area3 / area2).toBeCloseTo(2.25, 1);
			await expect(model.updateMask({ width: 50, height: 50, data: new Uint8Array(2) })).rejects.toThrow('mask');
			expect((await model.inspect()).details.historyChecksum).toBe(after.details.historyChecksum);
			expect(() => model.resize(4097, 4097)).toThrow('budget');
			console.info('Imprint native profile transition', { two, three, before: before.details, after: after.details });
		} finally { model.dispose(); }
	});
	it('renders distinct sharp/rounded profiles and rejects overflow instead of replacing earlier marks', async () => {
		const model = await createImprint(device, format, source(512));
		try {
			model.resize(960, 960); model.setTool({ shape: 'comb', bevel: 0.003, size: 0.55 }); model.stamp(0.5, 0.5, true);
			const sharp = await pixels(model, 960, 960);
			model.reset(); model.setTool({ bevel: 0.035 }); model.stamp(0.5, 0.5, true);
			const soft = await pixels(model, 960, 960); expect(difference(sharp, soft).mean).toBeGreaterThan(0.2);
			for (let i = 1; i < 32; i++) { model.setTool({ rotation: i * 13, shape: i % 2 ? 'rosette' : 'ring', size: 0.3 }); expect(model.stamp(0.35 + i % 4 * 0.1, 0.4 + i % 3 * 0.1, true)).toBe(true); }
			const full = await model.inspect(); expect(full.finite).toBe(true); expect(full.max).toBeLessThanOrEqual(1); expect(model.count).toBe(32);
			expect(model.stamp(0.5, 0.5, true)).toBe(false); expect((await model.inspect()).details.historyChecksum).toBe(full.details.historyChecksum);
			model.smooth(); model.finish(); expect(model.count).toBe(0); expect(model.stamp(0.5, 0.5, true)).toBe(true);
		} finally { model.dispose(); }
	});
});
