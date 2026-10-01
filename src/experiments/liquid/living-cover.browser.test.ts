import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createLivingCover, loadCoverImage, type LivingCoverExperiment } from './living-cover.js';
import { presentationSize } from './presentation-size.js';
import type { LiquidInput } from './types.js';

let device: GPUDevice, bitmap: ImageBitmap;
const format: GPUTextureFormat = 'rgba8unorm';
const amplitude = [0.3, -0.3, 0.3, -0.3, 0.3, -0.3];
const idle: LiquidInput = { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, tilt: 0 };
beforeAll(async () => { const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull(); device = await adapter!.requestDevice(); bitmap = await loadCoverImage('/living-cover-arles.jpg'); });
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => { await device.queue.onSubmittedWorkDone(); expect(await device.popErrorScope()).toBeNull(); });
afterAll(() => { bitmap?.close(); device?.destroy(); });

async function pixels(engine: LivingCoverExperiment, width: number, height: number) {
	const row = Math.ceil(width * 4 / 256) * 256;
	const texture = device.createTexture({ size: [width, height], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
	const readback = device.createBuffer({ size: row * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	try {
		const encoder = device.createCommandEncoder(); engine.render(encoder, texture.createView());
		encoder.copyTextureToBuffer({ texture }, { buffer: readback, bytesPerRow: row }, [width, height]); device.queue.submit([encoder.finish()]);
		await readback.mapAsync(GPUMapMode.READ); const source = new Uint8Array(readback.getMappedRange()), result = new Uint8Array(width * height * 4);
		for (let y = 0; y < height; y++) result.set(source.subarray(y * row, y * row + width * 4), y * width * 4);
		return result;
	} finally { texture.destroy(); readback.destroy(); }
}

function error(a: Uint8Array, b: Uint8Array) { let sum = 0, max = 0; for (let i = 0; i < a.length; i++) { const difference = Math.abs(a[i] - b[i]); sum += difference; max = Math.max(max, difference); } return { mean: sum / a.length, max }; }
function coverage(image: Uint8Array) { let area = 0, partial = 0; for (let i = 3; i < image.length; i += 4) { area += image[i] / 255; if (image[i] > 0 && image[i] < 255) partial++; } return { area, partial }; }
function tick(engine: LivingCoverExperiment, frames: number) {
	// This model evolves only CPU coefficients; it emits no compute work.
	const encoder = device.createCommandEncoder(); for (let i = 0; i < frames; i++) engine.step(encoder, 1 / 120, idle);
	device.queue.submit([encoder.finish()]);
}

describe('native original-image aperture and reveal', () => {
	it('keeps native fractional 2x/3x output and source/state across resize; wet crop moves only its boundary', async () => {
		const engine = await createLivingCover(device, format, bitmap);
		try {
			expect((await engine.inspect()).details.variant).toBe(1);
			const areas: { dpr: number; area: number; partial: number }[] = [];
			for (const dpr of [2, 3]) {
				const size = presentationSize(420.375, 420.375, dpr); engine.resize(size.width, size.height); engine.clearMotion(); engine.setVariant('aperture');
				const rest = await pixels(engine, size.width, size.height); engine.setAmplitudes(amplitude); const before = await engine.inspect();
				const moved = await pixels(engine, size.width, size.height), measure = coverage(moved), base = coverage(rest);
				// The analytic area law is exact (CPU determinant test). A sampled
				// smoothstep rim has perimeter-scaled discretization error; bound
				// coverage by a fraction of one pixel along that perimeter.
				expect(Math.abs(measure.area - base.area)).toBeLessThan(0.4 * size.width);
				expect(error(rest, moved).mean).toBeGreaterThan(0.05);
				// The center remains well inside the cutout: not a warped photo.
				const start = (Math.floor(size.height / 2) * size.width + Math.floor(size.width / 2)) * 4;
				expect(moved.subarray(start, start + 4)).toEqual(rest.subarray(start, start + 4));
				engine.resize(size.width + 1, size.height + 1); const resized = await engine.inspect();
				for (let i = 0; i < 6; i++) expect(resized.details['a' + i]).toBe(before.details['a' + i]);
				expect(resized.details.sourceBytes).toBe(before.details.sourceBytes); expect(resized.details.sourceWidth).toBe(3803); expect(resized.details.sourceHeight).toBe(3162);
				expect(engine.memoryBytes).toBe(before.details.sourceBytes + 128); areas.push({ dpr, ...measure });
			}
			expect(areas[1].area / areas[0].area).toBeCloseTo((1261 / 841) ** 2, 2);
			expect(areas[1].partial).toBeGreaterThan(areas[0].partial);
			expect(() => engine.resize(4097, 4097)).toThrow('Native cover');
			console.info('Native moving aperture coverage', areas);
		} finally { engine.dispose(); }
	});
	it('has a finite directed reveal, independent native diagnostic, and origin-clean source rejection', async () => {
		const copy = await createImageBitmap(bitmap), engine = await createLivingCover(device, format, copy); copy.close();
		try {
			engine.resize(641, 641); engine.setVariant('reveal'); const hidden = await pixels(engine, 641, 641);
			engine.setReveal(true); tick(engine, 36); const halfway = await pixels(engine, 641, 641); expect((await engine.inspect()).details.reveal).toBeCloseTo(0.375, 5);
			tick(engine, 180); const shown = await pixels(engine, 641, 641); expect((await engine.inspect()).details.reveal).toBe(1);
			expect(error(hidden, halfway).mean).toBeGreaterThan(10); expect(error(halfway, shown).mean).toBeGreaterThan(10);
			engine.setDiagnostic(true); const grid = await pixels(engine, 641, 641); expect(error(shown, grid).mean).toBeGreaterThan(15);
			engine.setReveal(false, true); expect((await engine.inspect()).details.reveal).toBe(0); expect((await engine.inspect()).details.sourceWidth).toBe(3803);
			tick(engine, 1200); expect(engine.settled).toBe(true);
			const abort = new AbortController(); abort.abort(); await expect(loadCoverImage('/living-cover-arles.jpg', abort.signal)).rejects.toThrow();
			await expect(loadCoverImage('/missing-cover-source-for-test.jpg')).rejects.toThrow('origin-clean');
		} finally { engine.dispose(); }
	});
});
