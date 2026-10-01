import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { causticPhotoColor, causticPhotoCrop, createCausticLight, type CausticLight } from './caustic-light.js';
import { coverImageBytes, loadCoverImage } from './living-cover.js';

let device: GPUDevice, photo: ImageBitmap;
beforeAll(async () => { const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull(); device = await adapter!.requestDevice(); photo = await loadCoverImage('/living-cover-arles.jpg'); });
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => { vi.restoreAllMocks(); await device.queue.onSubmittedWorkDone(); expect(await device.popErrorScope()).toBeNull(); });
afterAll(() => { photo?.close(); device?.destroy(); });
async function pixels(model: CausticLight, width: number, height: number) {
	const row = Math.ceil(width * 4 / 256) * 256, texture = device.createTexture({ size: [width, height], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
	const read = device.createBuffer({ size: row * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	try {
		const encoder = device.createCommandEncoder(); model.render(encoder, texture.createView()); encoder.copyTextureToBuffer({ texture }, { buffer: read, bytesPerRow: row }, [width, height]); device.queue.submit([encoder.finish()]); await read.mapAsync(GPUMapMode.READ);
		const data = new Uint8Array(read.getMappedRange()), result = new Uint8Array(width * height * 4);
		for (let y = 0; y < height; y++) result.set(data.subarray(y * row, y * row + width * 4), y * width * 4);
		return result;
	} finally { texture.destroy(); read.destroy(); }
}
const decode = (value: number) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
const encode = (value: number) => value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;

describe('fixed native photograph receiving caustic illumination', () => {
	it('registers known source colors and applies the measured light in linear rather than encoded space', async () => {
		const colors = [[170, 40, 30], [25, 155, 60], [35, 70, 180], [120, 130, 140]], width = 641, height = 641, sourceWidth = 240, sourceHeight = 200;
		const data = new Uint8ClampedArray(sourceWidth * sourceHeight * 4);
		for (let y = 0; y < sourceHeight; y++) for (let x = 0; x < sourceWidth; x++) data.set([...colors[Number(x >= sourceWidth / 2) + 2 * Number(y >= sourceHeight / 2)], 255], (y * sourceWidth + x) * 4);
		const image = await createImageBitmap(new ImageData(data, sourceWidth, sourceHeight)), model = await createCausticLight(device, 'rgba8unorm', { image, photonGrid: 128 }); image.close();
		try {
			model.resize(width, height); let maxFlatError = 0, maxRelitError = 0;
			for (const relief of [0, 0.85]) {
				model.setRelief(relief); model.setPhase(0.7); model.setPosition(0.25, 0.65);
				const actual = await pixels(model, width, height), light = await model.readLight(), [sx, sy] = causticPhotoCrop(width / height, sourceWidth / sourceHeight);
				for (let y = 30; y < height - 30; y += 23) for (let x = 30; x < width - 30; x += 19) {
					const u = ((x + 0.5) / width - 0.5) * sx + 0.5, v = ((y + 0.5) / height - 0.5) * sy + 0.475;
					if (Math.abs(u - 0.5) < 0.03 || Math.abs(v - 0.5) < 0.03) continue;
					const color = colors[Number(u >= 0.5) + 2 * Number(v >= 0.5)];
					for (let c = 0; c < 3; c++) {
						const expected = 255 * encode(causticPhotoColor(decode(color[c] / 255), light.values[y * width + x]));
						maxRelitError = Math.max(maxRelitError, Math.abs(actual[(y * width + x) * 4 + c] - expected));
						if (relief === 0) maxFlatError = Math.max(maxFlatError, Math.abs(actual[(y * width + x) * 4 + c] - color[c]));
					}
				}
			}
			expect(maxFlatError).toBeLessThanOrEqual(1); expect(maxRelitError).toBeLessThan(1.6);
			console.info('Photograph registration / independent linear-light color oracle', { maxFlatError, maxRelitError });
		} finally { model.dispose(); }
	});
	it('preserves the immutable native original and shared optical flux at fractional2x/3x', async () => {
		const copy = await createImageBitmap(photo), model = await createCausticLight(device, 'rgba8unorm', { image: copy }), matte = await createCausticLight(device, 'rgba8unorm'); copy.close();
		try {
			model.setPhase(0.75); matte.setPhase(0.75); model.setPosition(0.2, 0.7); matte.setPosition(0.2, 0.7);
			for (const native of [Math.round(420.375 * 2), Math.round(420.375 * 3)]) {
				model.resize(native, native); matte.resize(native, native);
				await pixels(model, native, native); await pixels(matte, native, native);
				const state = await model.inspect(), light = await model.readLight(), reference = await matte.readLight();
				expect(light.values).toEqual(reference.values); expect(state.details.sourceWidth).toBe(3803); expect(state.details.sourceHeight).toBe(3162); expect(state.details.sourceBytes).toBe(64_123_008); expect(state.details.mipLevels).toBe(12);
				expect(state.details.phase).toBe(0.75); expect(state.details.centerX).toBe(0.2); expect(model.memoryBytes).toBe(64_123_008 + 256 ** 2 * 32 + 64 + native ** 2 * 2);
				const before = await model.inspect(); await pixels(model, native, native); const after = await model.inspect(); expect(after.details.projectionDispatches).toBe(before.details.projectionDispatches); expect(after.details.splatPasses).toBe(before.details.splatPasses);
			}
			expect(() => model.resize(4097, 4097)).toThrow('attachment budget'); expect((await model.inspect()).details.width).toBe(1261);
		} finally { model.dispose(); matte.dispose(); }
	});
	it('destroys already allocated resources when native photo creation fails synchronously', async () => {
		const create = device.createTexture.bind(device), destroy = vi.spyOn(GPUBuffer.prototype, 'destroy');
		const pop = device.popErrorScope.bind(device);
		vi.spyOn(device, 'popErrorScope').mockImplementation(async () => { await pop(); throw new Error('Secondary scope-pop rejection'); });
		vi.spyOn(device, 'createTexture').mockImplementation((descriptor) => { if (descriptor.label?.includes('Immutable native caustic photograph')) throw new Error('Injected photo allocation failure'); return create(descriptor); });
		await expect(createCausticLight(device, 'rgba8unorm', { image: photo })).rejects.toThrow('Injected photo allocation failure');
		expect(destroy).toHaveBeenCalledTimes(2); expect(coverImageBytes(photo.width, photo.height).bytes).toBe(64_123_008);
	});
});
