import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createWickAndSwell, type WickAndSwellExperiment } from './wick-and-swell.js';
import { WICK_WIDTH as W, WICK_HEIGHT as H, WICK_DROP, WICK_PIPETTE, wickDose, wickReference } from './wick-and-swell-model.js';

let device: GPUDevice;
beforeAll(async () => { const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull(); device = await adapter!.requestDevice(); });
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => { await device.queue.onSubmittedWorkDone(); const error = await device.popErrorScope(); expect(error?.message ?? null).toBeNull(); });
afterAll(() => device?.destroy());

async function pixels(model: WickAndSwellExperiment, width: number, height: number) {
	const row = Math.ceil(width * 4 / 256) * 256;
	const target = device.createTexture({ size: [width, height], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
	const read = device.createBuffer({ size: row * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	try {
		const encoder = device.createCommandEncoder(); model.render(encoder, target.createView()); encoder.copyTextureToBuffer({ texture: target }, { buffer: read, bytesPerRow: row }, [width, height]); device.queue.submit([encoder.finish()]);
		await read.mapAsync(GPUMapMode.READ); const mapped = new Uint8Array(read.getMappedRange()), result = new Uint8Array(width * height * 4);
		for (let y = 0; y < height; y++) result.set(mapped.subarray(y * row, y * row + width * 4), y * width * 4);
		return result;
	} finally { target.destroy(); read.destroy(); }
}
function difference(a: Uint8Array, b: Uint8Array) {
	let sum = 0, count = 0, visible = 0, alpha = 0;
	for (let i = 0; i < a.length; i += 4) {
		alpha = Math.max(alpha, Math.abs(a[i + 3] - b[i + 3])); if (a[i + 3] < 250) continue;
		const delta = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
		sum += delta; count++; if (delta > 12) visible++;
	}
	return { mean: sum / count, visible: visible / count, alpha };
}

describe('wick-and-swell native material', () => {
	it('advances eight seconds with the same bounded integration as normal steps and the CPU reference', async () => {
		const batch = await createWickAndSwell(device, 'rgba8unorm'), frames = await createWickAndSwell(device, 'rgba8unorm');
		try {
			for (const model of [batch, frames]) { model.resize(800, 500); model.drop(); }
			batch.advance(8);
			const encoder = device.createCommandEncoder(), idle = { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, tilt: 0 };
			for (let i = 0; i < 80; i++) frames.step(encoder, 0.1, idle);
			device.queue.submit([encoder.finish()]);
			const pulse = wickDose(0.67, 0.5); let reference = new Float32Array(W * H * 2);
			for (let i = 0; i < pulse.length; i++) reference[i * 2 + 1] = pulse[i];
			for (let i = 0; i < 960; i++) reference = wickReference(reference, 1 / 120);
			const actual = await batch.readState(), normal = await frames.readState(); let cpuError = 0, normalError = 0;
			for (let i = 0; i < actual.length; i++) { cpuError = Math.max(cpuError, Math.abs(actual[i] - reference[i])); normalError = Math.max(normalError, Math.abs(actual[i] - normal[i])); }
			const state = await batch.inspect(); console.info('wick-eight-second-agreement', { cpuError, normalError, steps: state.details.steps, ledger: state.details.ledger });
			expect(cpuError).toBeLessThan(0.00008); expect(normalError).toBe(0); expect(state.details.steps).toBe(960);
			expect(state.min).toBeGreaterThanOrEqual(0); expect(state.max).toBeLessThanOrEqual(1.000001); expect(state.details.ledger).toBeCloseTo(WICK_PIPETTE, 2);
			for (const invalid of [NaN, Infinity, 0, 8.01]) expect(() => batch.advance(invalid)).toThrow();
			expect(() => frames.step(device.createCommandEncoder(), 0.2, idle)).toThrow();
			expect(() => frames.step(device.createCommandEncoder(), 1 / 120, { ...idle, x: NaN })).toThrow();
		} finally { batch.dispose(); frames.dispose(); }
	});
	it('matches the conservative CPU step, limits capacity and accounts for all finite water', async () => {
		const model = await createWickAndSwell(device, 'rgba8unorm');
		try {
			model.resize(800, 500); expect(model.drop()).toBe(true);
			const pulse = wickDose(0.67, 0.5); let reference = new Float32Array(W * H * 2);
			for (let i = 0; i < pulse.length; i++) reference[i * 2 + 1] = pulse[i];
			model.advance(0.25); for (let i = 0; i < 30; i++) reference = wickReference(reference, 1 / 120);
			const actual = await model.readState(); let error = 0;
			for (let i = 0; i < actual.length; i++) error = Math.max(error, Math.abs(actual[i] - reference[i]));
			expect(error).toBeLessThan(0.00003);
			const early = await model.inspect(); model.advance(4); const later = await model.inspect();
			expect(later.finite).toBe(true); expect(later.min).toBeGreaterThanOrEqual(0); expect(later.max).toBeLessThanOrEqual(1.000001);
			expect(later.mass).toBeCloseTo(WICK_DROP, 2); expect(later.details.ledger).toBeCloseTo(WICK_PIPETTE, 2);
			expect(later.details.radius2).toBeGreaterThan(early.details.radius2 * 2); expect(later.details.wetCells).toBeGreaterThan(early.details.wetCells);
			expect(model.drop()).toBe(true); expect(model.drop()).toBe(true); expect(model.drop()).toBe(false); model.advance(4);
			expect(model.remaining).toBe(0); expect((await model.inspect()).mass).toBeCloseTo(WICK_PIPETTE, 2);
		} finally { model.dispose(); }
	});
	it('shows relightable swelling and deeper equal-pressure indentation without changing outline or albedo', async () => {
		const model = await createWickAndSwell(device, 'rgba8unorm'); const width = 1000, height = 625;
		try {
			model.resize(width, height); model.setColorless(true); const dry = await pixels(model, width, height);
			model.drop(); model.advance(0.8); const wet = await pixels(model, width, height), state = await model.inspect();
			const swell = difference(dry, wet); console.info('wick-visible-relief', swell);
			expect(swell.alpha).toBe(0); expect(swell.mean).toBeGreaterThan(1); expect(swell.visible).toBeGreaterThan(0.025);
			expect(state.details.heightMax).toBeGreaterThan(0.035); expect(state.details.complianceMax / state.details.complianceDry).toBeGreaterThan(7);
			model.setEqualPressure(true); const pressed = await pixels(model, width, height), press = difference(wet, pressed);
			expect(press.alpha).toBe(0); expect(press.mean).toBeGreaterThan(1);
			const localPress = (u: number) => {
				const center = (0.5 + (u - 0.5) * 0.78) * width; let sum = 0, count = 0;
				for (let y = Math.floor(height * 0.38); y < height * 0.62; y++) for (let x = Math.floor(center - width * 0.085); x < center + width * 0.085; x++) {
					const index = (y * width + x) * 4; for (let c = 0; c < 3; c++) { sum += Math.abs(pressed[index + c] - wet[index + c]); count++; }
				}
				return sum / count;
			};
			console.info('wick-equal-pressure', { dry: localPress(0.30), wet: localPress(0.67) });
			expect(localPress(0.67)).toBeGreaterThan(localPress(0.30) * 3);
			model.setEqualPressure(false); model.setLight(0.5); const relitWet = await pixels(model, width, height);
			// Rotating a light at fixed elevation must leave the large flat region
			// unchanged. Test visible local response, not an arbitrary whole-sheet
			// brightness shift; the nonseparable material/light proof follows.
			expect(difference(wet, relitWet).mean).toBeGreaterThan(5); expect((await model.inspect()).details.checksum).toBe(state.details.checksum);
			model.setBaseline(true); const relitDry = await pixels(model, width, height); let coupling = 0, count = 0;
			for (let i = 0; i < dry.length; i += 4) if (dry[i + 3] > 250) for (let c = 0; c < 3; c++) { coupling += Math.abs((wet[i + c] - dry[i + c]) - (relitWet[i + c] - relitDry[i + c])); count++; }
			expect(coupling / count).toBeGreaterThan(1.5);
			model.setBaseline(false); model.reset(); model.setLight(-2.3); expect(difference(dry, await pixels(model, width, height)).mean).toBe(0);
		} finally { model.dispose(); }
	});
	it('retains water and native analytic coverage at fractional CSS 2× to 3× without idle stepping', async () => {
		const model = await createWickAndSwell(device, 'rgba8unorm');
		try {
			model.resize(841, 521); model.drop(); model.advance(0.75); const state = await model.inspect();
			await pixels(model, 841, 521); model.resize(1261, 782); const high = await pixels(model, 1261, 782), after = await model.inspect();
			expect(after.details.checksum).toBe(state.details.checksum); expect(after.details.steps).toBe(state.details.steps); expect(after.details.fixedBytes).toBe(state.details.fixedBytes);
			let partial = 0; for (let i = 3; i < high.length; i += 4) if (high[i] > 0 && high[i] < 255) partial++;
			expect(partial).toBeGreaterThan(1000); expect(difference(high, await pixels(model, 1261, 782)).mean).toBe(0);
			const encoder = device.createCommandEncoder(); model.step(encoder, 1 / 120, { x: 0.67, y: 0.5, vx: 0, vy: 0, active: true, tilt: 0 }); device.queue.submit([encoder.finish()]);
			expect((await model.inspect()).details.probeLoad).toBe(1); model.endInput?.(); expect((await model.inspect()).details.probeLoad).toBe(0);
			expect(() => model.resize(20_000, 3)).toThrow('no downsampling'); expect((await model.inspect()).details.width).toBe(1261);
		} finally { model.dispose(); }
	});
});
