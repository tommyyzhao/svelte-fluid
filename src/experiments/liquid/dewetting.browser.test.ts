import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import { createDewetting, type DewettingExperiment } from './dewetting.js';
import { dewettingState, seedDewetting, finishDewetting, dewettingHeight } from './dewetting-model.js';
import { LabSession } from './LabSession.js';
import Dewetting from './Dewetting.svelte';

let device: GPUDevice;
const errors: string[] = [];
beforeAll(async () => {
	const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull(); device = await adapter!.requestDevice();
	device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
});
beforeEach(() => { errors.length = 0; device.pushErrorScope('validation'); });
afterEach(async () => { vi.restoreAllMocks(); await device.queue.onSubmittedWorkDone(); expect(await device.popErrorScope()).toBeNull(); expect(errors).toEqual([]); });
afterAll(() => device.destroy());

async function pixels(model: DewettingExperiment, width: number, height: number) {
	model.resize(width, height); const pitch = Math.ceil(width * 4 / 256) * 256;
	const texture = device.createTexture({ size: [width, height], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
	const read = device.createBuffer({ size: pitch * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	try {
		const encoder = device.createCommandEncoder(); model.render(encoder, texture.createView());
		encoder.copyTextureToBuffer({ texture }, { buffer: read, bytesPerRow: pitch }, [width, height]); device.queue.submit([encoder.finish()]);
		await read.mapAsync(GPUMapMode.READ); const data = new Uint8Array(read.getMappedRange()), result = new Uint8Array(width * height * 4);
		for (let row = 0; row < height; row++) result.set(data.subarray(row * pitch, row * pitch + width * 4), row * width * 4);
		return result;
	} finally { texture.destroy(); read.destroy(); }
}

it('reconstructs the independently accounted height at fractional native 2× and 3×', async () => {
	const model = await createDewetting(device, 'rgba8unorm'), reference = dewettingState();
	try {
		model.seed(0.5, 0.5, true); seedDewetting(reference, 0.5, 0.5); finishDewetting(reference); model.setDiagnostic(true);
		for (const scale of [2, 3]) {
			const width = Math.round(420.375 * scale), height = Math.round(233.5416667 * scale);
			const image = await pixels(model, width, height), aspect = width / height / 1.8;
			let worst = 0, count = 0;
			for (let y = 3; y < height - 3; y += 7) for (let x = 3; x < width - 3; x += 7) {
				const wx = ((x + 0.5) / width - 0.5) * 1.8 * Math.max(1, aspect) + 0.9;
				const wy = ((y + 0.5) / height - 0.5) * Math.max(1, 1 / aspect) + 0.5;
				const expected = Math.round(dewettingHeight(reference, wx, wy) / 0.12 * 255);
				worst = Math.max(worst, Math.abs(image[(y * width + x) * 4] - expected)); count++;
			}
			expect(worst).toBeLessThanOrEqual(1);
			console.info('Native dewetting height proof', { scale, width, height, samples: count, maxByteError: worst });
		}
	} finally { model.dispose(); }
});

it('visibly opens a dry region, retains a raised rim and preserves held state across resizing', async () => {
	const model = await createDewetting(device, 'rgba8unorm');
	try {
		const rest = await pixels(model, 1080, 600); model.seed(0.5, 0.5);
		const input = { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, tilt: 0 };
		const encoder = device.createCommandEncoder();
		for (let i = 0; i < 720; i++) model.step(encoder, 1 / 120, input);
		const state = await model.inspect(), open = await pixels(model, 1080, 600);
		expect(state.finite).toBe(true); expect(state.details.moving).toBe(0); expect(state.details.radius).toBeGreaterThan(0.3);
		expect(state.details.energyResidual).toBeCloseTo(0, 10); expect(state.details.removedVolume).toBeCloseTo(state.details.rimVolume, 12);
		expect(state.max).toBeGreaterThan(0.03); expect(state.min).toBeGreaterThan(0);
		let dry = 0; for (let i = 3; i < open.length; i += 4) if (open[i] < 5 && rest[i] > 250) dry++;
		expect(dry / (1080 * 600)).toBeGreaterThan(0.1);
		expect(await pixels(model, 1080, 600)).toEqual(open);
		model.resize(1261, 701); const resized = await model.inspect();
		for (const key of ['radius', 'energy', 'dissipated', 'externalWork', 'removedVolume', 'rimVolume']) expect(resized.details[key]).toBe(state.details[key]);
		expect(model.memoryBytes).toBe(64); expect(resized.details.sourceBytes).toBe(0);
		expect(() => model.resize(5000, 5000)).toThrow(); expect((await model.inspect()).details.width).toBe(1261);
	} finally { model.dispose(); }
});

const frames = async (count = 3) => { for (let i = 0; i < count; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); };

it('sleeps after settling and leaves the SVG comparison free of hidden GPU work', async () => {
	let model: DewettingExperiment | undefined, renders = 0;
	const load = LabSession.prototype.load;
	vi.spyOn(LabSession.prototype, 'load').mockImplementation(async function (this: LabSession, factory) {
		await load.call(this, async (gpu, format) => {
			const candidate = await factory(gpu, format) as DewettingExperiment, render = candidate.render.bind(candidate);
			candidate.render = (encoder, target) => { renders++; render(encoder, target); }; model = candidate; return candidate;
		});
	});
	const host = document.createElement('div'); host.style.width = '540.375px'; document.body.append(host);
	const component = mount(Dewetting, { target: host });
	try {
		await vi.waitFor(() => expect(host.querySelector('.material')?.getAttribute('data-ready')).toBe('true'), { timeout: 10000 });
		await frames();
		host.querySelector<HTMLButtonElement>('.touch')!.click();
		expect(model!.moving).toBe(true);
		await vi.waitFor(() => expect(model!.moving).toBe(false), { timeout: 10000 });
		await vi.waitFor(() => expect(host.querySelector('.material')?.getAttribute('data-sleeping')).toBe('true'), { timeout: 2000 });
		await frames(); const held = renders; await frames(6); expect(renders).toBe(held);
		const radius = (await model!.inspect()).details.radius;
		host.querySelector<HTMLInputElement>('.actions input')!.click(); await frames(); const baseline = renders;
		host.querySelector<HTMLButtonElement>('.touch')!.click(); await frames(8);
		expect(host.querySelector('.study')?.getAttribute('data-baseline')).toBe('true'); expect(renders).toBe(baseline);
		expect((await model!.inspect()).details.radius).toBe(radius);
		const recoat = [...host.querySelectorAll<HTMLButtonElement>('.actions button')].find((button) => button.textContent === 'Recoat')!;
		recoat.click(); await frames(5); expect(renders).toBe(baseline); expect((await model!.inspect()).details.radius).toBe(radius);
	} finally { await unmount(component); host.remove(); }
});

it('keeps the native action and static wipe usable when the GPU is unavailable', async () => {
	vi.spyOn(navigator.gpu, 'requestAdapter').mockResolvedValue(null);
	const host = document.createElement('div'); host.style.width = '420px'; document.body.append(host);
	const component = mount(Dewetting, { target: host });
	try {
		await vi.waitFor(() => expect(host.querySelector('.gpu .status.error')?.textContent).toContain('WebGPU unavailable'));
		host.querySelector<HTMLButtonElement>('.touch')!.click(); await frames();
		expect(host.querySelector('.study')?.getAttribute('data-open')).toBe('true');
		expect(host.querySelector('.wipe.static circle')?.classList.contains('opened')).toBe(true);
	} finally { await unmount(component); host.remove(); }
});

it('resumes an unfinished commanded opening after focus returns without another click', async () => {
	let model: DewettingExperiment | undefined;
	const load = LabSession.prototype.load;
	vi.spyOn(LabSession.prototype, 'load').mockImplementation(async function (this: LabSession, factory) {
		await load.call(this, async (gpu, format) => { model = await factory(gpu, format) as DewettingExperiment; return model; });
	});
	const host = document.createElement('div'); host.style.width = '540px'; document.body.append(host);
	const component = mount(Dewetting, { target: host });
	try {
		await vi.waitFor(() => expect(host.querySelector('.material')?.getAttribute('data-ready')).toBe('true'), { timeout: 10000 }); await frames();
		host.querySelector<HTMLButtonElement>('.touch')!.click(); await frames(5);
		window.dispatchEvent(new Event('blur')); await frames();
		const held = (await model!.inspect()).details.radius; expect(model!.moving).toBe(true);
		await frames(8); expect((await model!.inspect()).details.radius).toBe(held);
		window.dispatchEvent(new Event('focus'));
		await vi.waitFor(() => expect((model!.moving)).toBe(false), { timeout: 10000 });
		expect((await model!.inspect()).details.radius).toBeGreaterThan(held);
	} finally { await unmount(component); host.remove(); }
});

it('cleans its fixed allocation when a bind-group construction fails', async () => {
	let allocation: GPUBuffer | undefined, destroyed = false;
	const proxy = new Proxy(device, { get(target, key) {
		if (key === 'createBuffer') return (descriptor: GPUBufferDescriptor) => {
			allocation = target.createBuffer(descriptor); const destroy = allocation.destroy.bind(allocation);
			vi.spyOn(allocation, 'destroy').mockImplementation(() => { destroyed = true; destroy(); }); return allocation;
		};
		if (key === 'createBindGroup') return () => { throw new Error('Injected bind failure'); };
		const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
	} });
	await expect(createDewetting(proxy, 'rgba8unorm')).rejects.toThrow('Injected bind failure');
	expect(allocation).toBeDefined(); expect(destroyed).toBe(true);
});

it('cleans its fixed allocation after an asynchronously reported OOM', async () => {
	let destroyed = false, pops = 0;
	const proxy = new Proxy(device, { get(target, key) {
		if (key === 'createBuffer') return (descriptor: GPUBufferDescriptor) => {
			const buffer = target.createBuffer(descriptor), destroy = buffer.destroy.bind(buffer);
			vi.spyOn(buffer, 'destroy').mockImplementation(() => { destroyed = true; destroy(); }); return buffer;
		};
		if (key === 'popErrorScope') return () => { const first = pops++ === 0; return target.popErrorScope().then((error) => first ? new GPUOutOfMemoryError('Injected scoped OOM') : error); };
		const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
	} });
	await expect(createDewetting(proxy, 'rgba8unorm')).rejects.toThrow('Injected scoped OOM');
	expect(pops).toBe(2); expect(destroyed).toBe(true);
});

it('cleans its candidate even if reporting an allocation error rejects', async () => {
	let destroyed = false, pops = 0;
	const proxy = new Proxy(device, { get(target, key) {
		if (key === 'createBuffer') return (descriptor: GPUBufferDescriptor) => {
			const buffer = target.createBuffer(descriptor), destroy = buffer.destroy.bind(buffer);
			vi.spyOn(buffer, 'destroy').mockImplementation(() => { destroyed = true; destroy(); }); return buffer;
		};
		if (key === 'popErrorScope') return () => { const first = pops++ === 0; return target.popErrorScope().then((error) => { if (first) throw new Error('Injected scope rejection'); return error; }); };
		const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
	} });
	await expect(createDewetting(proxy, 'rgba8unorm')).rejects.toThrow('Injected scope rejection');
	expect(pops).toBe(2); expect(destroyed).toBe(true);
});
