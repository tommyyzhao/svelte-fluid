import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCapillaryPigment, type PigmentExperiment } from './capillary-pigment.js';
import { attachPigment, pigmentSubsteps, transportPigment, rasterPigmentGeometry, pigmentTotals, pigmentBrushAt,
	PIGMENT_WIDTH as W, PIGMENT_HEIGHT as H, PIGMENT_CAPACITY, PIGMENT_ADSORPTION, PIGMENT_DESORPTION } from './capillary-pigment-model.js';
import type { LiquidInput } from './types.js';

let device: GPUDevice;
const still: LiquidInput = { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, tilt: 0 };
beforeAll(async () => { const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull(); device = await adapter!.requestDevice(); });
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => { vi.restoreAllMocks(); await device.queue.onSubmittedWorkDone(); const error = await device.popErrorScope(); expect(error?.message).toBeUndefined(); });
afterAll(() => device?.destroy());

function steps(model: PigmentExperiment, count: number, input = still) {
	const encoder = device.createCommandEncoder();
	for (let i = 0; i < count; i++) model.step(encoder, 1 / 120, input);
	device.queue.submit([encoder.finish()]);
}

async function pixels(model: PigmentExperiment, width: number, height: number) {
	model.resize(width, height); await model.ready();
	const bytesPerRow = Math.ceil(width * 4 / 256) * 256;
	const target = device.createTexture({ size: [width, height], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
	const read = device.createBuffer({ size: bytesPerRow * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	try {
		const encoder = device.createCommandEncoder(); model.render(encoder, target.createView());
		encoder.copyTextureToBuffer({ texture: target }, { buffer: read, bytesPerRow }, [width, height]); device.queue.submit([encoder.finish()]);
		await read.mapAsync(GPUMapMode.READ); const source = new Uint8Array(read.getMappedRange()), result = new Uint8Array(width * height * 4);
		for (let y = 0; y < height; y++) result.set(source.subarray(y * bytesPerRow, y * bytesPerRow + width * 4), y * width * 4);
		return result;
	} finally { target.destroy(); read.destroy(); }
}

describe('bounded WebGPU pigment', () => {
	it('ordinary hovering visibly displaces finite pigment compared with the same elapsed idle time', async () => {
		for (const geometry of ['type', 'emblem'] as const) {
			const idle = await createCapillaryPigment(device, 'rgba8unorm', geometry);
			const hovered = await createCapillaryPigment(device, 'rgba8unorm', geometry);
			try {
				const from = geometry === 'type' ? [0.39, 0.37] : [0.49, 0.5];
				const to = geometry === 'type' ? [0.54, 0.67] : [0.64, 0.34];
				const seconds = 0.6, frames = 36;
				for (let frame = 0; frame < frames; frame++) {
					const t = (frame + 1) / frames;
					steps(hovered, 2, { ...still, active: true, x: from[0] + (to[0] - from[0]) * t, y: from[1] + (to[1] - from[1]) * t,
						vx: (to[0] - from[0]) / seconds, vy: (to[1] - from[1]) / seconds });
					steps(idle, 2);
				}
				const idleState = await idle.readState(), movedState = await hovered.readState();
				let moved = 0; for (let i = 0; i < movedState.length; i += 8) for (let c = 0; c < 3; c++) moved += Math.abs(movedState[i + c] - idleState[i + c]);
				expect(moved / 420, `${geometry}: ordinary movement must relocate substantial existing pigment`).toBeGreaterThan(0.25);
				const resting = await pixels(idle, 1202, 601), dragged = await pixels(hovered, 1202, 601);
				let difference = 0, changed = 0, covered = 0;
				for (let i = 0; i < resting.length; i += 4) if (resting[i + 3] === 255) {
					let delta = 0; for (let c = 0; c < 3; c++) delta += Math.abs(resting[i + c] - dragged[i + c]);
					difference += delta; covered++; if (delta / 3 > 15) changed++;
				}
				expect(difference / (covered * 3), `${geometry}: visible native pixels, not just input counters`).toBeGreaterThan(8);
				expect(changed / covered).toBeGreaterThan(0.10);
				const total = pigmentTotals(movedState); expect(total.mass).toBeCloseTo(420, 1); expect(total.min).toBeGreaterThanOrEqual(0);
				console.info('Ordinary pigment hover versus idle', { geometry, movedFraction: moved / 420, rgbDifference: difference / (covered * 3), changedFraction: changed / covered });
			} finally { idle.dispose(); hovered.dispose(); }
		}
	});

	it('a later brush lifts previously attached pigment without a new pour or mass loss', async () => {
		const model = await createCapillaryPigment(device, 'rgba8unorm', 'emblem');
		try {
			steps(model, 1800); const before = await model.inspect();
			expect(before.details.attached).toBeGreaterThan(100);
			for (let frame = 0; frame < 30; frame++) steps(model, 2, { ...still, active: true, x: 0.43 + frame / 30 * 0.15, y: 0.5, vx: 0.3, vy: 0 });
			const after = await model.inspect();
			expect(after.details.attached).toBeLessThan(before.details.attached * 0.75);
			expect(after.details.mobile).toBeGreaterThan(before.details.mobile + 25);
			expect(after.mass).toBeCloseTo(before.mass, 1); expect(after.details.pours).toBe(before.details.pours);
			expect(after.details.outside).toBe(0); expect(after.details.capacity).toBeLessThanOrEqual(0.80001);
		} finally { model.dispose(); }
	});

	it('matches the conservative CPU reference, including mobile/attached reaction', async () => {
		const model = await createCapillaryPigment(device, 'rgba8unorm', 'type');
		try {
			model.pour(1); let reference = await model.readState();
			const mask = Uint32Array.from(rasterPigmentGeometry(W, H, 'type'), (value) => Number(value > 25));
			const input = { ...still, active: true, vx: 0.45, vy: -0.23 };
			const count = pigmentSubsteps(1 / 120, input.vx, input.vy), dt = 1 / 120 / count;
			for (let substep = 0; substep < count; substep++) {
				reference = transportPigment(reference, mask, W, H, dt, (x, y, horizontal) => {
					const velocity = pigmentBrushAt((x + 0.5) / W, (y + 0.5) / H, input); return horizontal ? velocity.vx : velocity.vy;
				});
				for (let i = 0; i < W * H; i++) {
					const lift = pigmentBrushAt((i % W + 0.5) / W, (Math.floor(i / W) + 0.5) / H, input).lift;
					const { mobile, attached } = attachPigment([...reference.subarray(i * 8, i * 8 + 3)], [...reference.subarray(i * 8 + 4, i * 8 + 7)], dt, PIGMENT_CAPACITY, PIGMENT_ADSORPTION, PIGMENT_DESORPTION + lift);
					reference.set(mobile, i * 8); reference.set(attached, i * 8 + 4);
				}
			}
			steps(model, 1, input); const result = await model.readState();
			let maximum = 0; for (let i = 0; i < result.length; i++) maximum = Math.max(maximum, Math.abs(result[i] - reference[i]));
			expect(maximum).toBeLessThan(0.000003); expect(pigmentTotals(result).mass).toBeCloseTo(840, 2);
		} finally { model.dispose(); }
	});

	it('keeps a finite pulse positive, conserves all colors and confines them while leaving attached pigment', async () => {
		const model = await createCapillaryPigment(device, 'rgba8unorm', 'emblem');
		try {
			model.pour(1); model.pour(2); const before = pigmentTotals(await model.readState());
			for (let batch = 0; batch < 10; batch++) steps(model, 60, { ...still, active: true, x: 0.2 + batch * 0.06, y: 0.5, vx: batch % 2 ? 3 : -3, vy: 1.2 });
			const after = pigmentTotals(await model.readState()), snapshot = await model.inspect();
			expect(snapshot.finite).toBe(true); expect(snapshot.min).toBeGreaterThanOrEqual(0); expect(snapshot.details.outside).toBe(0);
			expect(snapshot.details.capacity).toBeLessThanOrEqual(0.80001);
			expect(snapshot.details.mobile).toBeGreaterThan(300); expect(snapshot.details.attached).toBeGreaterThan(1);
			for (let c = 0; c < 3; c++) expect(after.mobile[c] + after.attached[c]).toBeCloseTo(before.mobile[c] + before.attached[c], 1);
			expect(Math.abs(snapshot.mass - snapshot.initialMass)).toBeLessThan(0.1);
			console.info('Finite pigment pulse', snapshot);
			model.reset(); expect((await model.inspect()).mass).toBe(0); expect(model.remaining).toEqual([3, 3, 3]);
			for (let i = 0; i < 3; i++) expect(model.pour(0)).toBe(true);
			expect(model.pour(0)).toBe(false); expect((await model.inspect()).mass).toBeCloseTo(1260, 2);
		} finally { model.dispose(); }
	});

	it('renders exact fractional 2×/3× glyph and SVG coverage, separate observable states, and retains mass on resize', async () => {
		for (const geometry of ['type', 'emblem'] as const) {
			const model = await createCapillaryPigment(device, 'rgba8unorm', geometry);
			try {
				model.pour(1); steps(model, 450);
				const before = await model.inspect();
				for (const [width, height] of [[801, 401], [1202, 601]]) {
					const image = await pixels(model, width, height), mask = rasterPigmentGeometry(width, height, geometry);
					let covered = 0, blue = 0, alphaErrors = 0, outside = 0;
					for (let i = 0; i < mask.length; i++) {
						if (image[i * 4 + 3] !== mask[i]) alphaErrors++;
						if (mask[i] === 0) outside += image[i * 4] + image[i * 4 + 1] + image[i * 4 + 2];
						if (mask[i] === 255) { covered++; if (image[i * 4 + 2] > image[i * 4] + 15) blue++; }
					}
					expect(alphaErrors).toBe(0); expect(outside).toBe(0);
					expect(covered).toBeGreaterThan(width * height * 0.1); expect(blue).toBeGreaterThan(covered * 0.015);
					const after = await model.inspect(); expect(after.mass).toBe(before.mass); expect(after.details.checksum).toBe(before.details.checksum);
					expect(after.details.nativeCoverageBytes).toBe(width * height); expect(after.details.pendingCoverageBytes).toBe(0);
				}
				model.setView('mobile'); const mobile = await pixels(model, 801, 401);
				model.setView('attached'); const attached = await pixels(model, 801, 401);
				let difference = 0, count = 0;
				for (let i = 0; i < mobile.length; i += 4) if (mobile[i + 3] === 255) { for (let c = 0; c < 3; c++) difference += Math.abs(mobile[i + c] - attached[i + c]); count += 3; }
				expect(difference / count).toBeGreaterThan(4);
				expect(() => model.resize(5000, 5000)).toThrow('budget'); expect((await model.inspect()).details.width).toBe(801);
			} finally { model.dispose(); }
		}
	}, 30_000);

	it('has no arbitrary visual bootstrap and coalesces pending native coverage without resetting state', async () => {
		const textures = vi.spyOn(device, 'createTexture');
		const model = await createCapillaryPigment(device, 'rgba8unorm');
		try {
			expect(textures).not.toHaveBeenCalled(); const before = await model.inspect();
			model.resize(801, 401); model.resize(900, 450); model.resize(1202, 601); await model.ready();
			expect(textures).toHaveBeenCalledTimes(2);
			const after = await model.inspect(); expect(after.details.width).toBe(1202); expect(after.mass).toBe(before.mass);
			expect(after.details.pendingCoverageBytes).toBe(0);
		} finally { model.dispose(); }
	});

	it('cleans fixed resources on initialization failure and retains adopted coverage after a rejected candidate', async () => {
		const createBuffer = device.createBuffer.bind(device), destroy: Array<ReturnType<typeof vi.spyOn>> = [];
		let allocations = 0;
		const buffers = vi.spyOn(device, 'createBuffer').mockImplementation((descriptor) => {
			if (++allocations === 3) throw new Error('Injected pigment allocation failure');
			const buffer = createBuffer(descriptor); destroy.push(vi.spyOn(buffer, 'destroy')); return buffer;
		});
		await expect(createCapillaryPigment(device, 'rgba8unorm')).rejects.toThrow('Injected pigment allocation failure');
		expect(destroy).toHaveLength(2); destroy.forEach((spy) => expect(spy).toHaveBeenCalledOnce()); buffers.mockRestore();
		const model = await createCapillaryPigment(device, 'rgba8unorm');
		try {
			model.resize(801, 401); await model.ready(); const before = await model.inspect();
			const createTexture = vi.spyOn(device, 'createTexture').mockImplementationOnce(() => { throw new Error('Injected native coverage failure'); });
			model.resize(1202, 601); await expect(model.ready()).rejects.toThrow('Injected native coverage failure');
			const after = await model.inspect(); expect(after.details.width).toBe(801); expect(after.mass).toBe(before.mass);
			expect(after.details.nativeCoverageBytes).toBe(801 * 401); expect(after.details.pendingCoverageBytes).toBe(0);
			const target = device.createTexture({ size: [801, 401], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT });
			try { expect(() => model.render(device.createCommandEncoder(), target.createView())).toThrow('Injected native coverage failure'); }
			finally { target.destroy(); }
			createTexture.mockRestore();
		} finally { model.dispose(); }
	});

	it('destroys a driver-rejected coverage candidate without losing the adopted resource or leaving scopes active', async () => {
		const model = await createCapillaryPigment(device, 'rgba8unorm');
		try {
			model.resize(801, 401); await model.ready(); const before = await model.inspect();
			const createTexture = device.createTexture.bind(device), destroyed: Array<ReturnType<typeof vi.spyOn>> = [];
			const textures = vi.spyOn(device, 'createTexture').mockImplementation((descriptor) => {
				const texture = createTexture(descriptor); destroyed.push(vi.spyOn(texture, 'destroy')); return texture;
			});
			const pop = device.popErrorScope.bind(device);
			const scopes = vi.spyOn(device, 'popErrorScope').mockImplementationOnce(async () => { await pop(); return new GPUValidationError('Injected late coverage rejection'); });
			model.resize(1202, 601); await expect(model.ready()).rejects.toThrow('Injected late coverage rejection');
			expect(scopes).toHaveBeenCalledTimes(2); expect(destroyed).toHaveLength(1); expect(destroyed[0]).toHaveBeenCalledOnce();
			const after = await model.inspect(); expect(after.mass).toBe(before.mass); expect(after.details.nativeCoverageBytes).toBe(801 * 401);
			scopes.mockRestore(); textures.mockRestore();
		} finally { model.dispose(); }
	});
});
