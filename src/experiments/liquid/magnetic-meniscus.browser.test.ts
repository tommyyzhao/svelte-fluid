import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createMagneticMeniscus, type MagneticMeniscus } from './magnetic-meniscus.js';
import { presentationSize } from './presentation-size.js';

let device: GPUDevice;
beforeAll(async () => { const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull(); device = await adapter!.requestDevice(); });
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => { await device.queue.onSubmittedWorkDone(); expect(await device.popErrorScope()).toBeNull(); });
afterAll(() => device?.destroy());

async function pixels(engine: MagneticMeniscus, width: number, height: number) {
	const row = Math.ceil(width * 4 / 256) * 256;
	const texture = device.createTexture({ size: [width, height], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
	const buffer = device.createBuffer({ size: row * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	try {
		const encoder = device.createCommandEncoder(); engine.render(encoder, texture.createView());
		encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: row }, [width, height]); device.queue.submit([encoder.finish()]);
		await buffer.mapAsync(GPUMapMode.READ); const result = new Uint8Array(width * height * 4), mapped = new Uint8Array(buffer.getMappedRange());
		for (let y = 0; y < height; y++) result.set(mapped.subarray(y * row, y * row + width * 4), y * width * 4);
		return result;
	} finally { texture.destroy(); buffer.destroy(); }
}

it('moves the native aperture edge without touching its transparent image interior and restores exactly', async () => {
	const engine = await createMagneticMeniscus(device, 'rgba8unorm');
	try {
		for (const dpr of [2, 3]) {
			const { width, height } = presentationSize(420.375, 280.25, dpr); engine.resize(width, height); engine.reset();
			const rest = await pixels(engine, width, height);
			engine.setMagnet(.76, .5, true, true); const moved = await pixels(engine, width, height);
			let changed = 0, innerAlpha = 0, partial = 0;
			for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
				const i = (y * width + x) * 4;
				if (Math.abs(rest[i + 3] - moved[i + 3]) > 30) changed++;
				if (Math.hypot((x - width / 2) / height, (y - height / 2) / height) < .12) innerAlpha += moved[i + 3];
				if (moved[i + 3] > 0 && moved[i + 3] < 255) partial++;
			}
			expect(changed / (width * height)).toBeGreaterThan(.015); expect(innerAlpha).toBe(0); expect(partial).toBeGreaterThan(100);
			expect((await engine.inspect()).mass).toBeCloseTo(Math.PI * .09, 12);
			engine.setMagnet(.5, .5, false, true); const restored = await pixels(engine, width, height);
			let max = 0; for (let i = 0; i < rest.length; i++) max = Math.max(max, Math.abs(rest[i] - restored[i])); expect(max).toBe(0);
		}
		expect(engine.memoryBytes).toBe(128);
	} finally { engine.dispose(); }
});

it('retains shape through native-only resize and finishes exactly without continued stepping', async () => {
	const engine = await createMagneticMeniscus(device, 'rgba8unorm');
	try {
		engine.resize(840, 560); engine.setMagnet(.75, .45, true, true);
		const before = await engine.inspect(); engine.resize(1260, 840); const after = await engine.inspect();
		for (let i = 0; i < 24; i++) expect(after.details['q' + i]).toBe(before.details['q' + i]);
		engine.setMagnet(.5, .5, false); const encoder = device.createCommandEncoder();
		for (let i = 0; i < 90; i++) engine.step(encoder, 1 / 120, { x: .5, y: .5, vx: 0, vy: 0, active: false, tilt: 0 });
		expect((await engine.inspect()).kinetic).toBe(0); expect((await engine.inspect()).details.q0).toBe(0);
		engine.setStrength(0); engine.setMagnet(.7, .5, true, true); expect((await engine.inspect()).details.q0).toBe(0);
	} finally { engine.dispose(); }
});

it('filters the steep attracted edge at its actual native footprint', async () => {
	const engine = await createMagneticMeniscus(device, 'rgba8unorm');
	try {
		for (const dpr of [2, 3]) {
			const { width, height } = presentationSize(210.375, 140.25, dpr);
			engine.resize(width, height); engine.setStrength(1.5); engine.setMagnet(.74, .34, true, true);
			const native = await pixels(engine, width, height);
			engine.resize(width * 4, height * 4); const refined = await pixels(engine, width * 4, height * 4);
			let error = 0, edges = 0, max = 0;
			for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
				let reference = 0;
				for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++)
					reference += refined[((y * 4 + sy) * width * 4 + x * 4 + sx) * 4 + 3] / 16;
				const value = native[(y * width + x) * 4 + 3];
				if ((value > 0 && value < 255) || (reference > 0 && reference < 255)) {
					const difference = Math.abs(value - reference); error += difference; max = Math.max(max, difference); edges++;
				}
			}
			// A footprint refinement comparison, not an exact optical reference.
			expect(edges).toBeGreaterThan(200); expect(error / edges).toBeLessThan(28); expect(max).toBeLessThan(80);
		}
	} finally { engine.dispose(); }
});

it('cleans its fixed buffer and balances device scopes on synchronous and asynchronous candidate failure', async () => {
	for (const mode of ['bind', 'late', 'rejected'] as const) {
		const buffers: GPUBuffer[] = []; let destroyed = 0, pops = 0;
		const proxy = new Proxy(device, { get(target, key) {
			if (key === 'createBuffer') return (descriptor: GPUBufferDescriptor) => {
				const buffer = target.createBuffer(descriptor); buffers.push(buffer); const destroy = buffer.destroy.bind(buffer);
				vi.spyOn(buffer, 'destroy').mockImplementation(() => { destroyed++; destroy(); }); return buffer;
			};
			if (key === 'createBindGroup' && mode === 'bind') return () => { throw new Error('Injected meniscus bind failure'); };
			if (key === 'popErrorScope') return () => {
				const actual = target.popErrorScope(); pops++;
				if (mode === 'rejected' && pops === 1) return actual.then(() => { throw new Error('Injected rejected meniscus scope'); });
				return mode === 'late' && pops === 1 ? actual.then(() => new GPUValidationError('Injected late meniscus rejection')) : actual;
			};
			const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
		} });
		await expect(createMagneticMeniscus(proxy, 'rgba8unorm')).rejects.toThrow(mode === 'bind' ? 'Injected meniscus bind failure' : mode === 'late' ? 'Injected late meniscus rejection' : 'Injected rejected meniscus scope');
		expect(buffers).toHaveLength(1); expect(destroyed).toBe(1); expect(pops).toBe(2);
	}
});
