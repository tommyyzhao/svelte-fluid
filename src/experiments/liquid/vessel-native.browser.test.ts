import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVessel } from './vessel.js';
import type { LiquidExperiment, LiquidInput } from './types.js';

let device: GPUDevice;
const errors: string[] = [];
const idle: LiquidInput = { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, tilt: 0 };
beforeAll(async () => {
	expect(navigator.gpu).toBeDefined();
	const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull();
	device = await adapter!.requestDevice();
	device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
});
beforeEach(() => { errors.length = 0; device.pushErrorScope('validation'); });
afterEach(async () => {
	await device.queue.onSubmittedWorkDone();
	expect((await device.popErrorScope())?.message ?? null).toBeNull();
	expect(errors).toEqual([]);
});
afterAll(() => device?.destroy());

async function render(engine: LiquidExperiment, width: number, height: number) {
	const target = device.createTexture({ size: [width, height], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT });
	try {
		const encoder = device.createCommandEncoder(); engine.render(encoder, target.createView());
		device.queue.submit([encoder.finish()]); await device.queue.onSubmittedWorkDone();
	} finally { target.destroy(); }
}
async function readState(buffers: GPUBuffer[]) {
	const bytes = buffers.reduce((sum, buffer) => sum + buffer.size, 0);
	const readback = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	try {
		const encoder = device.createCommandEncoder(); let offset = 0;
		for (const buffer of buffers) { encoder.copyBufferToBuffer(buffer, 0, readback, offset, buffer.size); offset += buffer.size; }
		device.queue.submit([encoder.finish()]); await readback.mapAsync(GPUMapMode.READ);
		return new Uint32Array(readback.getMappedRange()).slice();
	} finally { readback.destroy(); }
}

describe('vessel native presentation attachments', () => {
	it('allocates lazily at exact same-aspect 2×/3× sizes and preserves every particle-state byte', async () => {
		const descriptors: GPUTextureDescriptor[] = [];
		const particleState: GPUBuffer[] = [];
		const originalTexture = device.createTexture.bind(device), originalBuffer = device.createBuffer.bind(device);
		const textures = vi.spyOn(device, 'createTexture').mockImplementation((descriptor) => {
			if (descriptor.label?.startsWith('liquid-vessel/')) descriptors.push(descriptor);
			return originalTexture(descriptor);
		});
		const buffers = vi.spyOn(device, 'createBuffer').mockImplementation((descriptor) => {
			const buffer = originalBuffer(descriptor);
			if (descriptor.label === 'liquid-vessel/positions' || descriptor.label === 'liquid-vessel/velocities') particleState.push(buffer);
			return buffer;
		});
		const vessel = await createVessel(device, 'rgba8unorm');
		try {
			expect(descriptors).toEqual([]);
			expect(particleState).toHaveLength(2);
			const fixedBytes = vessel.memoryBytes;
			for (let step = 0; step < 24; step++) {
				const encoder = device.createCommandEncoder(); vessel.step(encoder, 1 / 120, { ...idle, tilt: 0.4 });
				device.queue.submit([encoder.finish()]);
			}
			const before = await readState(particleState), snapshot = await vessel.inspect();
			expect(snapshot.finite).toBe(true); expect(snapshot.details.particleCount).toBe(3840);
			expect(snapshot.kinetic).toBeGreaterThan(0);
			for (const ratio of [2, 3, 1]) {
				const width = 640 * ratio, height = 448 * ratio;
				vessel.resize(width, height);
				expect(descriptors.slice(-5).map((descriptor) => descriptor.size)).toEqual(Array(5).fill([width, height]));
				expect(vessel.memoryBytes).toBe(fixedBytes + width * height * 18);
				const allocations = descriptors.length; vessel.resize(width, height);
				expect(descriptors.length).toBe(allocations);
				await render(vessel, width, height);
				expect(await readState(particleState)).toEqual(before);
				expect(await vessel.inspect()).toEqual(snapshot);
			}
		} finally { vessel.dispose(); textures.mockRestore(); buffers.mockRestore(); }
	});

	it('rejects steady and old-plus-new transition budgets before allocation, keeping the old graph', async () => {
		const vessel = await createVessel(device, 'rgba8unorm');
		const textures = vi.spyOn(device, 'createTexture');
		try {
			const fixedBytes = vessel.memoryBytes;
			expect(() => vessel.resize(5000, 2500)).toThrow('256 MiB steady');
			expect(textures).not.toHaveBeenCalled(); expect(vessel.memoryBytes).toBe(fixedBytes);
			expect(() => vessel.resize(100_000, 100)).toThrow('Native presentation');
			expect(textures).not.toHaveBeenCalled();
			vessel.resize(4000, 2000); // 8 MP, nominally 168.4 MiB including output and fixed fields.
			const before = await vessel.inspect();
			const oldBytes = vessel.memoryBytes, allocations = textures.mock.calls.length;
			expect(() => vessel.resize(5000, 2200)).toThrow('384 MiB transition');
			expect(textures.mock.calls.length).toBe(allocations);
			expect(vessel.memoryBytes).toBe(oldBytes);
			expect(await vessel.inspect()).toEqual(before);
			// A modest replacement still works; rejection is not an implicit reset.
			vessel.resize(640, 320); await render(vessel, 640, 320);
			expect(await vessel.inspect()).toEqual(before);
		} finally { textures.mockRestore(); vessel.dispose(); }
	});

	it('cleans partial candidate attachments and retains usable old attachments after synchronous failure', async () => {
		const vessel = await createVessel(device, 'rgba8unorm');
		vessel.resize(640, 448);
		const oldBytes = vessel.memoryBytes, before = await vessel.inspect();
		const original = device.createTexture.bind(device);
		const cleanup: Array<ReturnType<typeof vi.spyOn>> = [];
		let attempts = 0;
		const failure = vi.spyOn(device, 'createTexture').mockImplementation((descriptor) => {
			if (++attempts === 3) throw new Error('Intentional vessel attachment allocation failure');
			const texture = original(descriptor); cleanup.push(vi.spyOn(texture, 'destroy')); return texture;
		});
		try {
			expect(() => vessel.resize(1280, 896)).toThrow('Intentional vessel');
			expect(cleanup).toHaveLength(2);
			for (const destroy of cleanup) expect(destroy).toHaveBeenCalledOnce();
			expect(vessel.memoryBytes).toBe(oldBytes);
			failure.mockRestore();
			await render(vessel, 640, 448);
			expect(await vessel.inspect()).toEqual(before);
		} finally { failure.mockRestore(); cleanup.forEach((destroy) => destroy.mockRestore()); vessel.dispose(); }
	});
});
