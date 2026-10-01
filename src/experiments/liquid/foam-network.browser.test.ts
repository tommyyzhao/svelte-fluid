import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import { userEvent } from 'vitest/browser';
import FoamNetworkView from './FoamNetwork.svelte';
import { createFoamNetwork, type FoamNetwork } from './foam-network.js';
import { LabSession } from './LabSession.js';

let device: GPUDevice;
beforeAll(async () => { const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull(); device = await adapter!.requestDevice(); });
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => { vi.restoreAllMocks(); await device.queue.onSubmittedWorkDone(); expect(await device.popErrorScope()).toBeNull(); });
afterAll(() => device.destroy());
const idle = { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, tilt: 0 };
const frames = async (count = 3) => { for (let i = 0; i < count; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); };
function advance(model: FoamNetwork, count: number) {
	const encoder = device.createCommandEncoder(); for (let i = 0; i < count; i++) model.step(encoder, 1 / 120, idle); device.queue.submit([encoder.finish()]);
}
async function pixels(model: FoamNetwork, width: number, height: number) {
	const pitch = Math.ceil(width * 4 / 256) * 256;
	const output = device.createTexture({ size: [width, height], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
	const read = device.createBuffer({ size: pitch * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	try {
		const encoder = device.createCommandEncoder(); model.render(encoder, output.createView());
		encoder.copyTextureToBuffer({ texture: output }, { buffer: read, bytesPerRow: pitch }, [width, height]); device.queue.submit([encoder.finish()]);
		await read.mapAsync(GPUMapMode.READ); const raw = new Uint8Array(read.getMappedRange()), result = new Uint8Array(width * height * 4);
		for (let y = 0; y < height; y++) result.set(raw.subarray(y * pitch, y * pitch + width * 4), y * width * 4);
		return result;
	} finally { read.destroy(); output.destroy(); }
}
function light(image: Uint8Array, width: number, height: number, worldX: number, worldY: number) {
	const x = Math.round(width / 2 + worldX * Math.min(width, height) / 1.64);
	const y = Math.round(height / 2 + worldY * Math.min(width, height) / 1.64);
	let total = 0;
	for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
		const at = ((y + dy) * width + x + dx) * 4; total += (image[at] + image[at + 1] + image[at + 2]) / 3;
	}
	return total / 9;
}

describe('native explicit T1 rendering', () => {
	it('loses one visible contact and gains a perpendicular one with the same square boundary', async () => {
		const model = await createFoamNetwork(device, 'rgba8unorm', { strain: 0 });
		try {
			const width = 801, height = 701; model.resize(width, height);
			const before = await pixels(model, width, height); expect((await model.inspect()).details.contactBD).toBe(1);
			model.setStrain(1); advance(model, 180); model.setStrain(0); advance(model, 180);
			const after = await pixels(model, width, height), changed = await model.inspect();
			expect(changed.details.contactBD).toBe(0); expect(changed.details.contactAC).toBe(1); expect(changed.details.events).toBe(1);
			expect(changed.details.a).toBe(0.47); expect(changed.details.b).toBe(0.47);
			const oldBefore = light(before, width, height, 0.12, 0), oldAfter = light(after, width, height, 0.12, 0);
			const newBefore = light(before, width, height, 0, 0.12), newAfter = light(after, width, height, 0, 0.12);
			expect(oldBefore - oldAfter).toBeGreaterThan(25); expect(newAfter - newBefore).toBeGreaterThan(25);
			console.info('Foam actual contact pixels', { oldBefore, oldAfter, newBefore, newAfter, events: changed.details.events });
		} finally { model.dispose(); }
	});
	it('preserves the actual graph and resting image through native2×/3× presentation and idle', async () => {
		const model = await createFoamNetwork(device, 'rgba8unorm');
		try {
			model.resize(801, 701); model.setStrain(1); advance(model, 180); const before = await model.inspect();
			model.resize(1202, 1052); const resized = await model.inspect();
			for (const key of ['strain', 'targetStrain', 'halfLength', 'energy', 'contactBD', 'contactAC', 'events', 'steps']) expect(resized.details[key]).toBe(before.details[key]);
			expect(resized.details.resolvedCanvasBytes).toBe(1202 * 1052 * 4); expect(model.memoryBytes).toBe(112);
			expect(resized.details.stateBytes).toBe(112);
			const still = await pixels(model, 1202, 1052); advance(model, 120); const after = await pixels(model, 1202, 1052);
			let mismatch = 0; for (let i = 0; i < still.length; i++) if (still[i] !== after[i]) mismatch++;
			expect(mismatch).toBe(0); expect((await model.inspect()).details.steps).toBe(before.details.steps);
			expect(() => model.resize(5000, 5000)).toThrow('presentation budget'); expect((await model.inspect()).details.width).toBe(1202);
		} finally { model.dispose(); }
	});
});

async function fixture(reduced = false, pipelineGate?: Promise<void>) {
	const match = window.matchMedia.bind(window);
	vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
		const result = match(query); if (query.includes('prefers-reduced-motion')) Object.defineProperty(result, 'matches', { value: reduced }); return result;
	});
	let model: FoamNetwork | undefined, submissions = 0, pipelineEntered = false;
	const load = LabSession.prototype.load;
	vi.spyOn(LabSession.prototype, 'load').mockImplementation(async function(this: LabSession, factory) {
		await load.call(this, async (gpu, format) => {
			const submit = gpu.queue.submit.bind(gpu.queue);
			vi.spyOn(gpu.queue, 'submit').mockImplementation((commands) => { submissions++; submit(commands); });
			if (pipelineGate) {
				const create = gpu.createRenderPipelineAsync.bind(gpu);
				vi.spyOn(gpu, 'createRenderPipelineAsync').mockImplementation(async (descriptor) => { pipelineEntered = true; await pipelineGate; return create(descriptor); });
			}
			model = await factory(gpu, format) as FoamNetwork; return model;
		});
	});
	const host = document.createElement('div'); host.style.width = '620.375px'; document.body.append(host);
	const component = mount(FoamNetworkView, { target: host }); host.querySelector<HTMLElement>('.stage')!.style.height = '330.625px';
	return { host, model: () => model!, submissions: () => submissions, pipelineEntered: () => pipelineEntered,
		button(name: string) { return [...host.querySelectorAll('button')].find((button) => button.textContent === name)!; },
		ready: () => vi.waitFor(() => expect(host.querySelector('.material')?.getAttribute('data-ready')).toBe('true'), { timeout: 10_000 }),
		async dispose() { await unmount(component); host.remove(); }
	};
}

describe('native topology controls', () => {
	it('adopts the latest static topology and count after delayed startup, including a metastable square', async () => {
		let resume!: () => void; const gate = new Promise<void>((resolve) => { resume = resolve; });
		const f = await fixture(false, gate);
		try {
			await vi.waitFor(() => expect(f.pipelineEntered()).toBe(true));
			for (const name of ['Tall frame', 'Wide frame', 'Tall frame', 'Square frame']) f.button(name).click();
			await frames(2);
			expect(f.host.querySelector('.foam')?.getAttribute('data-contact')).toBe('AC');
			expect(f.host.querySelector('.foam')?.getAttribute('data-events')).toBe('3');
			resume(); await f.ready(); await frames(3);
			const snapshot = await f.model().inspect(); expect(snapshot.details.strain).toBe(0);
			expect(snapshot.details.contactAC).toBe(1); expect(snapshot.details.events).toBe(3);
			expect(f.host.querySelector('.foam')?.getAttribute('data-contact')).toBe('AC');
		} finally { resume(); await f.dispose(); }
	});
	it('reports the actual old contact until collapse, then relaxes and stops submitting', async () => {
		const f = await fixture();
		try {
			await f.ready(); await frames(); f.button('Tall frame').click();
			expect((await f.model().inspect()).details.targetStrain).toBe(1);
			expect((await f.model().inspect()).details.contactBD).toBe(1);
			await vi.waitFor(() => expect(f.host.querySelector('.foam')?.getAttribute('data-contact')).toBe('AC'), { timeout: 3000 });
			expect(f.button('Tall frame').getAttribute('aria-pressed')).toBe('true');
			await vi.waitFor(() => expect(f.host.querySelector('.material')?.getAttribute('data-sleeping')).toBe('true'), { timeout: 3000 });
			await frames(3); const before = f.submissions(); await frames(10); expect(f.submissions()).toBe(before);
			const range = f.host.querySelector<HTMLInputElement>('input[type=range]')!; range.focus(); await userEvent.keyboard('{ArrowLeft}');
			expect((await f.model().inspect()).details.targetStrain).toBeCloseTo(0.99);
		} finally { await f.dispose(); }
	});
	it('settles interrupted or reduced-motion geometry at the requested state without a continuing clock', async () => {
		const f = await fixture(true);
		try {
			await f.ready(); f.button('Tall frame').click(); await frames();
			const still = await f.model().inspect(); expect(still.details.contactAC).toBe(1); expect(still.details.steps).toBe(0);
			expect(f.host.querySelector('.foam')?.getAttribute('data-contact')).toBe('AC');
			const before = f.submissions(); await frames(8); expect(f.submissions()).toBe(before);
			f.button('Wide frame').click(); window.dispatchEvent(new Event('blur')); await frames(3);
			expect((await f.model().inspect()).details.contactBD).toBe(1);
		} finally { await f.dispose(); }
	});
	it('keeps an explicit, correctly connected native SVG still when no adapter exists', async () => {
		vi.spyOn(navigator.gpu, 'requestAdapter').mockResolvedValue(null);
		const f = await fixture();
		try {
			await vi.waitFor(() => expect(f.host.querySelector('.status.error')).not.toBeNull());
			f.button('Tall frame').click(); await frames();
			expect(f.host.querySelector('.foam')?.getAttribute('data-contact')).toBe('AC');
			expect(f.host.querySelectorAll('svg line').length).toBe(5);
			expect(f.host.querySelector('.readout')?.textContent).toContain('Native controls still work');
			expect(f.submissions()).toBe(0);
		} finally { await f.dispose(); }
	});
});
