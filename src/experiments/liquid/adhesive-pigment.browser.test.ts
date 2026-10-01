import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdhesivePigment, type PigmentExperiment } from './capillary-pigment.js';
import { rasterPigmentGeometry, reactPigmentSheet, PIGMENT_WIDTH as W, PIGMENT_HEIGHT as H, PIGMENT_SHEET_DOSE, PIGMENT_CLEAR_SECONDS } from './capillary-pigment-model.js';
import type { LiquidInput, LiquidSnapshot } from './types.js';

let device: GPUDevice;
const still: LiquidInput = { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, tilt: 0 };
beforeAll(async () => { const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull(); device = await adapter!.requestDevice(); });
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => { vi.restoreAllMocks(); await device.queue.onSubmittedWorkDone(); expect((await device.popErrorScope())?.message).toBeUndefined(); });
afterAll(() => device?.destroy());
function steps(model: PigmentExperiment, count: number, input = still) { const encoder = device.createCommandEncoder(); for (let i = 0; i < count; i++) model.step(encoder, 1 / 120, input); device.queue.submit([encoder.finish()]); }
function ledger(snapshot: LiquidSnapshot) {
	expect(snapshot.finite).toBe(true); expect(snapshot.min).toBeGreaterThanOrEqual(0); expect(snapshot.details.capacityError).toBeLessThan(0.000002);
	for (let c = 0; c < 3; c++) expect(Math.abs(snapshot.details[`mobile${c}`] + snapshot.details[`attached${c}`] + snapshot.details[`removed${c}`] - snapshot.details[`injected${c}`])).toBeLessThan(0.1);
	expect(Math.abs(snapshot.mass + snapshot.details.removed - snapshot.initialMass)).toBeLessThan(0.2);
}
async function pixels(model: PigmentExperiment, width: number, height: number) {
	model.resize(width, height); await model.ready();
	const pitch = Math.ceil(width * 4 / 256) * 256, target = device.createTexture({ size: [width, height], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
	const read = device.createBuffer({ size: pitch * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	try { const encoder = device.createCommandEncoder(); model.render(encoder, target.createView()); encoder.copyTextureToBuffer({ texture: target }, { buffer: read, bytesPerRow: pitch }, [width, height]); device.queue.submit([encoder.finish()]); await read.mapAsync(GPUMapMode.READ); const raw = new Uint8Array(read.getMappedRange()), out = new Uint8Array(width * height * 4); for (let y = 0; y < height; y++) out.set(raw.subarray(y * pitch, y * pitch + width * 4), y * width * 4); return out; } finally { read.destroy(); target.destroy(); }
}

describe('adhesive glyph on a traversable WebGPU sheet', () => {
	it('releases native CPU raster backing, rejects oversized preparation before allocation, and reuses adopted same-size coverage', async () => {
		const canvas = document.createElement('canvas'), create = vi.spyOn(document, 'createElement').mockReturnValue(canvas);
		try {
			expect(rasterPigmentGeometry(801, 401, 'type').length).toBe(801 * 401); expect([canvas.width, canvas.height]).toEqual([0, 0]);
			const context = vi.spyOn(canvas, 'getContext').mockReturnValue(null); expect(() => rasterPigmentGeometry(801, 401, 'type')).toThrow(); expect([canvas.width, canvas.height]).toEqual([0, 0]); context.mockRestore();
		} finally { create.mockRestore(); }
		const model = await createAdhesivePigment(device, 'rgba8unorm');
		try {
			model.resize(801, 401); await model.ready(); model.clearWash(); const before = await model.inspect(); expect(before.details.cpuFixedBytes).toBe(W * H * 4);
			const textures = vi.spyOn(device, 'createTexture'); model.resize(801, 401); await model.ready(); expect(textures).not.toHaveBeenCalled();
			expect(() => model.resize(4000, 3000)).toThrow('working-set'); expect(textures).not.toHaveBeenCalled();
			const after = await model.inspect(); expect(after.mass).toBe(before.mass); expect(after.details.checksum).toBe(before.details.checksum); expect(after.details.removed).toBe(before.details.removed);
		} finally { model.dispose(); }
	});
	it('clears mobile background while keeping an attached glyph and accounting for every color', async () => {
		const model = await createAdhesivePigment(device, 'rgba8unorm');
		try {
			model.pour(1); model.pour(2); const before = await model.inspect(); expect(before.details.outside).toBeGreaterThan(1000); expect(before.details.attached).toBe(0);
			steps(model, 720); const after = await model.inspect(); ledger(after);
			expect(after.details.outside).toBeLessThan(before.details.outside * 0.003); expect(after.details.attached).toBeGreaterThan(700); expect(after.details.removed).toBeGreaterThan(3000);
			console.info('Adhesive sheet settled ledger', after);
		} finally { model.dispose(); }
	});
	it('direct clear is the same bounded local reaction, not an unstable giant transport step', async () => {
		const model = await createAdhesivePigment(device, 'rgba8unorm');
		try {
			const before = await model.readState(), coverage = rasterPigmentGeometry(W, H, 'type'); model.clearWash(); const after = await model.readState(); let error = 0;
			for (let i = 0; i < W * H; i++) { const expected = reactPigmentSheet([...before.subarray(i * 8, i * 8 + 3)], [...before.subarray(i * 8 + 4, i * 8 + 7)], coverage[i] / 255, PIGMENT_CLEAR_SECONDS); for (let c = 0; c < 3; c++) error = Math.max(error, Math.abs(after[i * 8 + c] - expected.mobile[c]), Math.abs(after[i * 8 + c + 4] - expected.attached[c])); }
			expect(error).toBeLessThan(0.000002); const snapshot = await model.inspect(); ledger(snapshot); expect(snapshot.details.steps).toBe(0); expect(snapshot.details.clears).toBe(1); expect(snapshot.details.attached).toBeGreaterThan(400);
		} finally { model.dispose(); }
	});
	it('a normal hover lifts and moves an already attached impression across the glyph boundary without fresh pigment', async () => {
		const idle = await createAdhesivePigment(device, 'rgba8unorm'), moved = await createAdhesivePigment(device, 'rgba8unorm');
		try {
			idle.clearWash(); moved.clearWash(); const baseline = await moved.inspect();
			for (let frame = 0; frame < 36; frame++) { steps(idle, 2); steps(moved, 2, { ...still, active: true, x: 0.32 + (frame + 1) / 36 * 0.26, y: 0.5, vx: 0.26 / 0.6 }); }
			const a = await idle.inspect(), b = await moved.inspect(); ledger(a); ledger(b);
			expect(b.details.pours).toBe(baseline.details.pours); expect(b.details.outside).toBeGreaterThan(a.details.outside + 5); expect(b.details.attached).toBeLessThan(a.details.attached - 20);
			const resting = await pixels(idle, 1202, 601), brushed = await pixels(moved, 1202, 601); let difference = 0, changed = 0;
			for (let i = 0; i < resting.length; i += 4) { let delta = 0; for (let c = 0; c < 3; c++) delta += Math.abs(resting[i + c] - brushed[i + c]); difference += delta; if (delta > 30) changed++; }
			expect(difference / (1202 * 601 * 3)).toBeGreaterThan(2); expect(changed / (1202 * 601)).toBeGreaterThan(0.025);
			console.info('Adhesive ordinary hover', { rgbDifference: difference / (1202 * 601 * 3), changedFraction: changed / (1202 * 601), outsideBefore: a.details.outside, outsideAfter: b.details.outside });
		} finally { idle.dispose(); moved.dispose(); }
	});
	it('preserves exact native glyph coverage and the full ledger across fractional2×/3× resizing', async () => {
		const model = await createAdhesivePigment(device, 'rgba8unorm');
		try {
			model.clearWash(); const before = await model.inspect(); model.setView('attached');
			for (const [width, height] of [[801, 401], [1202, 601]]) {
				const shown = await pixels(model, width, height), coverage = rasterPigmentGeometry(width, height, 'type'); let alphaErrors = 0, colored = 0;
				for (let i = 0; i < coverage.length; i++) { alphaErrors += Number(shown[i * 4 + 3] !== coverage[i]); if (coverage[i] === 255 && shown[i * 4 + 2] > shown[i * 4] + 30) colored++; }
				expect(alphaErrors).toBe(0); expect(colored / coverage.length).toBeGreaterThan(0.10); const after = await model.inspect(); ledger(after); expect(after.mass).toBe(before.mass); expect(after.details.removed).toBe(before.details.removed); expect(after.details.checksum).toBe(before.details.checksum); expect(after.details.nativeCoverageBytes).toBe(width * height);
			}
		} finally { model.dispose(); }
	});
	it('orders multiple same-frame pour/clear controls exactly and resets all retained and cleared history', async () => {
		const queued = await createAdhesivePigment(device, 'rgba8unorm'), flushed = await createAdhesivePigment(device, 'rgba8unorm');
		try {
			for (const model of [queued, flushed]) { model.pour(1); if (model === flushed) await model.readState(); model.clearWash(); if (model === flushed) await model.readState(); model.pour(2); }
			const a = await queued.readState(), b = await flushed.readState(); let errors = 0; for (let i = 0; i < a.length; i++) errors += Number(a[i] !== b[i]); expect(errors).toBe(0); ledger(await queued.inspect()); ledger(await flushed.inspect());
			queued.reset(); const empty = await queued.inspect(); expect(empty.mass).toBe(0); expect(empty.details.removed).toBe(0); expect(empty.initialMass).toBe(0); expect(queued.remaining).toEqual([3, 3, 3]);
			for (let i = 0; i < 3; i++) expect(queued.pour(0)).toBe(true); expect(queued.pour(0)).toBe(false); expect((await queued.inspect()).initialMass).toBe(3 * PIGMENT_SHEET_DOSE);
			for (let i = 0; i < 16; i++) expect(queued.clearWash()).toBe(true); expect(queued.clearWash()).toBe(false); ledger(await queued.inspect());
		} finally { queued.dispose(); flushed.dispose(); }
	});
	it('keeps the ledger positive under maximum permitted input and destroys all sheet-only startup resources on failure', async () => {
		const model = await createAdhesivePigment(device, 'rgba8unorm');
		try { model.pour(1); model.pour(2); for (let i = 0; i < 8; i++) steps(model, 24, { ...still, active: true, x: 0.25 + i * 0.07, y: 0.5, vx: i % 2 ? -3 : 3, vy: 3 }); ledger(await model.inspect()); } finally { model.dispose(); }
		const create = device.createBuffer.bind(device), destroyed: Array<ReturnType<typeof vi.spyOn>> = []; let count = 0;
		vi.spyOn(device, 'createBuffer').mockImplementation((descriptor) => { if (++count === 9) throw new Error('Injected final sheet pulse allocation failure'); const buffer = create(descriptor); destroyed.push(vi.spyOn(buffer, 'destroy')); return buffer; });
		await expect(createAdhesivePigment(device, 'rgba8unorm')).rejects.toThrow('Injected'); expect(destroyed.length).toBe(8); expect(destroyed.every((spy) => spy.mock.calls.length === 1)).toBe(true);
	});
});
