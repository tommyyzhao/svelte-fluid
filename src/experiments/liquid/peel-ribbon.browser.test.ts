import { mount, unmount } from 'svelte';
import { userEvent } from 'vitest/browser';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Peel from '../../routes/lab/interfaces/peel/+page.svelte';
import { createPeelRibbon, type PeelRibbonModel } from './peel-ribbon.js';
import { LabSession } from './LabSession.js';

let device: GPUDevice;
const format = 'rgba8unorm' as const;
beforeAll(async () => { const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull(); device = await adapter!.requestDevice(); });
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => { vi.restoreAllMocks(); await device.queue.onSubmittedWorkDone(); expect(await device.popErrorScope()).toBeNull(); });
afterAll(() => device.destroy());
const frames = async (count = 3) => { for (let i = 0; i < count; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); };

async function pixels(model: PeelRibbonModel, width: number, height: number) {
	const row = Math.ceil(width * 4 / 256) * 256;
	const texture = device.createTexture({ size: [width, height], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
	const buffer = device.createBuffer({ size: row * height, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
	try {
		const encoder = device.createCommandEncoder(); model.render(encoder, texture.createView()); encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: row }, [width, height]);
		device.queue.submit([encoder.finish()]); await buffer.mapAsync(GPUMapMode.READ);
		const mapped = new Uint8Array(buffer.getMappedRange()), output = new Uint8Array(width * height * 4);
		for (let y = 0; y < height; y++) output.set(mapped.subarray(y * row, y * row + width * 4), y * width * 4);
		return output;
	} finally { buffer.destroy(); texture.destroy(); }
}
function covered(data: Uint8Array) { let area = 0; for (let i = 3; i < data.length; i += 4) if (data[i] > 180) area++; return area; }
function difference(a: Uint8Array, b: Uint8Array) { let sum = 0; for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]); return sum / a.length; }
const button = (host: HTMLElement, label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === label)!;

async function fixture(reduced = false, unavailable = false) {
	let ratio = 2, model!: PeelRibbonModel, gpu: GPUDevice | undefined;
	const counts = { steps: 0, renders: 0, submissions: 0, loads: 0 }, errors: string[] = [];
	vi.spyOn(window, 'devicePixelRatio', 'get').mockImplementation(() => ratio);
	const media = window.matchMedia.bind(window), queries: MediaQueryList[] = [];
	vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
		const result = media(query); if (query.includes('prefers-reduced-motion')) Object.defineProperty(result, 'matches', { value: reduced });
		if (query.startsWith('(resolution:')) queries.push(result); return result;
	});
	if (unavailable) vi.spyOn(navigator.gpu, 'requestAdapter').mockResolvedValue(null);
	const load = LabSession.prototype.load;
	vi.spyOn(LabSession.prototype, 'load').mockImplementation(async function(this: LabSession, factory) {
		counts.loads++;
		await load.call(this, async (native, nativeFormat) => {
			gpu = native; native.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
			const submit = native.queue.submit.bind(native.queue); vi.spyOn(native.queue, 'submit').mockImplementation((commands) => { counts.submissions++; submit(commands); });
			model = await factory(native, nativeFormat) as PeelRibbonModel;
			const step = model.step.bind(model), render = model.render.bind(model);
			vi.spyOn(model, 'step').mockImplementation((encoder, dt, input) => { counts.steps++; step(encoder, dt, input); });
			vi.spyOn(model, 'render').mockImplementation((encoder, target) => { counts.renders++; render(encoder, target); }); return model;
		});
	});
	const host = document.createElement('div'); host.style.width = '640.375px'; document.body.append(host);
	const component = mount(Peel, { target: host }), surface = host.querySelector<HTMLElement>('.material')!, canvas = surface.querySelector('canvas')!;
	surface.scrollIntoView({ block: 'center' });
	try { await vi.waitFor(() => expect(unavailable ? surface.querySelector('.status')?.textContent?.includes('No WebGPU adapter') : surface.dataset.ready === 'true' && counts.renders > 0).toBe(true), { timeout: 10000 }); await frames(); }
	catch (error) { await unmount(component); host.remove(); throw error; }
	return { host, surface, canvas, counts, errors, model: () => model,
		setDpr(value: number) { ratio = value; queries.at(-1)!.dispatchEvent(new Event('change')); },
		async dispose() { await gpu?.queue.onSubmittedWorkDone(); await unmount(component); host.remove(); }
	};
}

describe('native geometry peel and rest-curvature memory', () => {
	it('changes rendered geometry at matched controls, retains the same material crease through lay-down, and clears it exactly', async () => {
		const model = await createPeelRibbon(device, format);
		try {
			model.resize(1001, 601); const virgin = await pixels(model, 1001, 601), before = await model.inspect();
			expect(model.remember(true)).toBe(true); const creased = await pixels(model, 1001, 601), remembered = await model.inspect();
			expect(difference(virgin, creased)).toBeGreaterThan(0.5); expect(remembered.details.shape).not.toBe(before.details.shape);
			model.set(0, 0.8, true); const flat = await pixels(model, 1001, 601); expect(covered(flat)).toBeGreaterThan(covered(creased));
			model.set(0.62, 0.8, true); expect(await pixels(model, 1001, 601)).toEqual(creased); expect((await model.inspect()).details.crease).toBe(remembered.details.crease);
			model.clearMemory(true); expect(await pixels(model, 1001, 601)).toEqual(virgin);
		} finally { model.dispose(); }
	});
	it('uses exact fractional 2x/3x native output with constant geometry and explicit rejection, not a hidden resolution cap', async () => {
		const model = await createPeelRibbon(device, format);
		try {
			model.remember(true); model.resize(1401, 751); const a = covered(await pixels(model, 1401, 751)), before = await model.inspect();
			model.resize(2101, 1126); const b = covered(await pixels(model, 2101, 1126)), after = await model.inspect();
			expect(b / a).toBeCloseTo(2.25, 1); expect(after.details.shape).toBe(before.details.shape); expect(after.details.crease).toBe(before.details.crease);
			expect(after.details.uploads).toBe(before.details.uploads);
			expect(model.memoryBytes).toBe(1568); expect(after.details.outputBytes).toBe(2101 * 1126 * 4);
			expect(() => model.resize(4097, 4097)).toThrow('allocation'); expect((await model.inspect()).details.width).toBe(2101);
			console.info('Peel native output footprint; no performance claim', { area2x: a, area3x: b, stateBytes: model.memoryBytes, outputBytes3x: after.details.outputBytes });
		} finally { model.dispose(); }
	});

	it('actual route preserves geometric crease history over native keyboard control, DPR migration and zero settled GPU work', async () => {
		const f = await fixture();
		try {
			await userEvent.click(button(f.host, 'Press a crease'));
			await vi.waitFor(() => expect(f.surface.dataset.sleeping).toBe('true'), { timeout: 3000 }); await frames();
			const before = await f.model().inspect(); expect(before.details.crease).toBeGreaterThan(0);
			await userEvent.click(button(f.host, 'Lay down')); await frames(); expect(f.host.querySelector('.peel')?.getAttribute('data-peel')).toBe('0');
			await userEvent.click(button(f.host, 'Lift again')); await vi.waitFor(() => expect(f.surface.dataset.sleeping).toBe('true'), { timeout: 3000 });
			const repeated = await f.model().inspect(); expect(repeated.details.tipX).toBeCloseTo(before.details.tipX, 4); expect(repeated.details.tipHeight).toBeCloseTo(before.details.tipHeight, 4); expect(repeated.details.crease).toBe(before.details.crease);
			const count = f.counts.renders; f.setDpr(3); await vi.waitFor(() => expect(f.counts.renders).toBeGreaterThan(count)); await frames();
			const bounds = f.canvas.getBoundingClientRect(); expect([f.canvas.width, f.canvas.height]).toEqual([Math.round(bounds.width * 3), Math.round(bounds.height * 3)]);
			expect((await f.model().inspect()).details.shape).toBe(repeated.details.shape); expect(f.counts.loads).toBe(1);
			const control = f.host.querySelectorAll<HTMLInputElement>('input[type=range]')[0]; control.focus(); await userEvent.keyboard('{ArrowLeft}'); await frames();
			expect(f.host.querySelector('.peel')?.getAttribute('data-peel')).toBe('0.61');
			await vi.waitFor(() => expect(f.surface.dataset.sleeping).toBe('true'), { timeout: 3000 }); await frames(); const settled = { ...f.counts }; await frames(10); expect(f.counts).toEqual(settled); expect(f.errors).toEqual([]);
		} finally { await f.dispose(); }
	});

	it('reduced motion commits static geometric endpoints and baseline reveals without hidden GPU stepping', async () => {
		const f = await fixture(true);
		try {
			await userEvent.click(button(f.host, 'Press a crease')); await frames(); const crease = await f.model().inspect();
			expect(crease.details.crease).toBeGreaterThan(0); expect(crease.kinetic).toBe(0); expect(f.counts.steps).toBe(0);
			await userEvent.click(button(f.host, 'Flatten memory')); await frames(); expect((await f.model().inspect()).details.crease).toBe(-1);
			await userEvent.click(f.host.querySelector('input[type=checkbox]')!); await frames(5); const baseline = { ...f.counts };
			await userEvent.click(button(f.host, 'Lay down')); await frames(8); expect(f.counts).toEqual(baseline);
			expect(f.host.querySelector('.flat')?.classList.contains('visible')).toBe(true); expect((f.host.querySelector('.flat') as HTMLElement).style.width).toBe('76%');
			expect(button(f.host, 'Press a crease').disabled).toBe(true); expect(f.errors).toEqual([]);
		} finally { await f.dispose(); }
	});

	it('commits a static endpoint when a native control is used while the material clock cannot wake', async () => {
		const f = await fixture();
		try {
			let hidden = true;
			vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
			document.dispatchEvent(new Event('visibilitychange')); await frames();
			const count = f.counts.steps;
			// Direct native activation isolates the lifecycle branch: a real browser
			// automation click would first foreground the page and remove the state.
			button(f.host, 'Lay down').click(); await frames();
			const state = await f.model().inspect(); expect(state.details.peel).toBe(0); expect(state.details.tipHeight).toBe(0); expect(state.kinetic).toBe(0);
			expect(f.counts.steps).toBe(count);
			hidden = false; document.dispatchEvent(new Event('visibilitychange')); await frames(5);
			expect((await f.model().inspect()).details.shape).toBe(state.details.shape); expect(f.counts.steps).toBe(count);
			expect(f.errors).toEqual([]);
		} finally { await f.dispose(); }
	});

	it('unavailable graphics keeps a native flat-reveal fallback and does not pretend crease authoring worked', async () => {
		const f = await fixture(false, true);
		try {
			expect(button(f.host, 'Press a crease').disabled).toBe(true);
			await userEvent.click(button(f.host, 'Lay down')); await frames(); expect(f.host.querySelector('.peel')?.getAttribute('data-peel')).toBe('0');
			await userEvent.click(button(f.host, 'Lift again')); await frames(); expect(f.host.querySelector('.peel')?.getAttribute('data-peel')).toBe('0.62');
			expect(f.host.querySelector('.flat')?.classList.contains('visible')).toBe(true); expect(f.counts.submissions).toBe(0);
		} finally { await f.dispose(); }
	});
});
