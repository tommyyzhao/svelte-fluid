import { mount, unmount, type Component } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page as browserPage, userEvent } from 'vitest/browser';
import { LabSession } from './LabSession.js';
import type { LiquidExperiment, LiquidSnapshot } from './types.js';

const pages = import.meta.glob<{ default: Component }>('../../routes/lab/interfaces/*/+page.svelte');
const frames = async (count = 3) => {
	for (let i = 0; i < count; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};
interface Frame {
	version: number;
	action: number;
	seconds: number;
	width: number;
	height: number;
}
interface CanvasRecord {
	canvas: HTMLCanvasElement;
	device: GPUDevice;
	session?: LabSession;
	model?: LiquidExperiment;
	steps: number;
	resets: number;
	loads: number;
	presentations: number;
	active: boolean;
	reading?: boolean;
	frame?: Frame;
	read?: { buffer: GPUBuffer; width: number; height: number; pitch: number; mapping: boolean };
}
interface Image extends Frame { pixels: Uint8Array }
afterEach(async () => { vi.restoreAllMocks(); await browserPage.viewport(1280, 720); });

function button(host: HTMLElement, label: string) {
	const buttons = [...host.querySelectorAll('button')];
	const name = (item: HTMLButtonElement) => (item.getAttribute('aria-label') || item.textContent || '').trim();
	const result = buttons.find((item) => name(item) === label) ?? buttons.find((item) => name(item).includes(label));
	if (!result) throw new Error(`Missing native button: ${label}`);
	return result;
}
function difference(before: Image, after: Image, threshold = 8) {
	expect([after.width, after.height]).toEqual([before.width, before.height]);
	let affected = 0, total = 0;
	for (let i = 0; i < before.pixels.length; i += 4) {
		const delta = Math.max(Math.abs(before.pixels[i] - after.pixels[i]), Math.abs(before.pixels[i + 1] - after.pixels[i + 1]),
			Math.abs(before.pixels[i + 2] - after.pixels[i + 2]), Math.abs(before.pixels[i + 3] - after.pixels[i + 3]));
		if (delta > threshold) { affected++; total += delta; }
	}
	return { affected, fraction: affected / (before.width * before.height), mean: affected ? total / affected : 0 };
}
function alphaCentroid(image: Image) {
	let weight = 0, x = 0;
	for (let y = 0; y < image.height; y++) for (let column = 0; column < image.width; column++) {
		const alpha = image.pixels[(y * image.width + column) * 4 + 3];
		weight += alpha; x += column / image.width * alpha;
	}
	expect(weight, 'The presented indicator must contain visible material').toBeGreaterThan(1000);
	return x / weight;
}
function native(record: CanvasRecord, ratio: number) {
	const css = record.canvas.getBoundingClientRect();
	expect([record.canvas.width, record.canvas.height], 'Canvas backing size must follow the actual fractional CSS rectangle × DPR')
		.toEqual([Math.round(css.width * ratio), Math.round(css.height * ratio)]);
}
function history(snapshot: LiquidSnapshot) {
	const presentation = new Set(['width', 'height', 'outputBytes', 'resolvedCanvasBytes', 'renders']);
	return { ...snapshot, details: Object.fromEntries(Object.entries(snapshot.details).filter(([key]) => !presentation.has(key))) };
}
function outsideDifference(before: Image, after: Image, top: number, bottom: number) {
	let changed = 0;
	for (let y = 0; y < before.height; y++) if (y < top * before.height || y > bottom * before.height) {
		for (let x = 0; x < before.width; x++) {
			const i = (y * before.width + x) * 4;
			if (Math.max(Math.abs(before.pixels[i] - after.pixels[i]), Math.abs(before.pixels[i + 1] - after.pixels[i + 1]),
				Math.abs(before.pixels[i + 2] - after.pixels[i + 2]), Math.abs(before.pixels[i + 3] - after.pixels[i + 3])) > 2) changed++;
		}
	}
	return changed;
}
function labeledInput(host: HTMLElement, label: string) {
	const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
	if (!input) throw new Error(`Missing native input: ${label}`);
	return input;
}
function labelControl(host: HTMLElement, text: string) {
	const control = [...host.querySelectorAll('label')].find((label) => label.textContent?.includes(text))?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
	if (!control) throw new Error(`Missing labeled native control: ${text}`);
	return control;
}
function visibleArea(image: Image) {
	let pixels = 0;
	for (let i = 3; i < image.pixels.length; i += 4) if (image.pixels[i] > 64) pixels++;
	return pixels / (image.width * image.height);
}
function regionAlpha(image: Image, x: number, y: number, radius: number, channel = 3) {
	let total = 0, count = 0;
	for (let row = Math.floor((y - radius) * image.height); row < (y + radius) * image.height; row++) {
		for (let column = Math.floor((x - radius) * image.width); column < (x + radius) * image.width; column++) {
			total += image.pixels[(row * image.width + column) * 4 + channel]; count++;
		}
	}
	return total / count / 255;
}
function opaqueChange(before: Image, after: Image) {
	let count = 0;
	for (let i = 0; i < before.pixels.length; i += 4) if (before.pixels[i + 3] === 255 && after.pixels[i + 3] === 255 &&
		Math.max(Math.abs(before.pixels[i] - after.pixels[i]), Math.abs(before.pixels[i + 1] - after.pixels[i + 1]), Math.abs(before.pixels[i + 2] - after.pixels[i + 2])) > 12) count++;
	return count;
}
function sameThreadGeometry(before: Image, after: Image) {
	expect([after.width, after.height]).toEqual([before.width, before.height]);
	let alphaChanged = 0, colorTotal = 0, colorMax = 0;
	for (let i = 0; i < before.pixels.length; i += 4) {
		if (before.pixels[i + 3] !== after.pixels[i + 3]) alphaChanged++;
		for (let channel = 0; channel < 3; channel++) { const delta = Math.abs(before.pixels[i + channel] - after.pixels[i + channel]); colorTotal += delta; colorMax = Math.max(colorMax, delta); }
	}
	// Owner readback observed sparse <=5 byte shading differences; its cause is
	// unproven. Match the explicit <=8 byte envelope while requiring bit-exact
	// geometry/coverage and <.002 mean RGB error, so broad drift still fails.
	expect(alphaChanged).toBe(0); expect(colorMax).toBeLessThanOrEqual(8);
	expect(colorTotal / (before.width * before.height * 3)).toBeLessThan(0.002);
}

/** Observe actual submitted presentation, including wrappers without LabSession.
 * One latest-frame staging buffer follows each canvas. A mapped read may retain
 * its previous buffer while one replacement captures new natural presentations;
 * at most two exist, and the previous one is destroyed on unmap. Copies are
 * appended only when a real command buffer rendered that canvas; this never schedules a model frame.
 * The observer adds bandwidth, so these are behavioral—not timing benchmarks.
 */
async function fixture(route: string, reduced = false, options: {
	ratio?: number;
	fallback?: boolean;
	readyWithoutPresentation?: boolean;
	startupGate?: { entered: (model: LiquidExperiment) => void; released: Promise<void> };
} = {}) {
	expect(navigator.gpu, 'These preservation checks require ordinary WebGPU').toBeDefined();
	let ratio = options.ratio ?? 2, action = 0;
	const records: CanvasRecord[] = [], queries: MediaQueryList[] = [], errors: string[] = [];
	const byCanvas = new Map<HTMLCanvasElement, CanvasRecord>();
	const textures = new WeakMap<GPUTexture, CanvasRecord>(), views = new WeakMap<GPUTextureView, { record: CanvasRecord; texture: GPUTexture }>();
	const renderTargets = new WeakMap<GPUCommandEncoder, Map<CanvasRecord, GPUTexture>>();
	const submittedTargets = new WeakMap<GPUCommandBuffer, Map<CanvasRecord, GPUTexture>>();
	const submissions = new Map<GPUQueue, number>(), writes = new Map<GPUQueue, number>();
	vi.spyOn(window, 'devicePixelRatio', 'get').mockImplementation(() => ratio);
	const matchMedia = window.matchMedia.bind(window);
	vi.spyOn(window, 'matchMedia').mockImplementation((source) => {
		const query = matchMedia(source);
		if (source.includes('prefers-reduced-motion')) Object.defineProperty(query, 'matches', { value: reduced });
		if (source.startsWith('(resolution:')) queries.push(query);
		return query;
	});
	if (options.fallback) vi.spyOn(navigator.gpu, 'requestAdapter').mockResolvedValue(null);
	const configure = GPUCanvasContext.prototype.configure;
	vi.spyOn(GPUCanvasContext.prototype, 'configure').mockImplementation(function(this: GPUCanvasContext, descriptor) {
		const canvas = this.canvas as HTMLCanvasElement;
		if (!byCanvas.has(canvas)) {
			const record: CanvasRecord = { canvas, device: descriptor.device, steps: 0, resets: 0, loads: 0, presentations: 0, active: true };
			byCanvas.set(canvas, record); records.push(record);
			descriptor.device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
		}
		byCanvas.get(canvas)!.active = true;
		configure.call(this, { ...descriptor, usage: (descriptor.usage ?? GPUTextureUsage.RENDER_ATTACHMENT) | GPUTextureUsage.COPY_SRC });
	});
	const unconfigure = GPUCanvasContext.prototype.unconfigure;
	vi.spyOn(GPUCanvasContext.prototype, 'unconfigure').mockImplementation(function(this: GPUCanvasContext) {
		const record = byCanvas.get(this.canvas as HTMLCanvasElement);
		if (record) record.active = false;
		unconfigure.call(this);
	});
	const getTexture = GPUCanvasContext.prototype.getCurrentTexture;
	vi.spyOn(GPUCanvasContext.prototype, 'getCurrentTexture').mockImplementation(function(this: GPUCanvasContext) {
		const texture = getTexture.call(this), record = byCanvas.get(this.canvas as HTMLCanvasElement);
		if (record) textures.set(texture, record);
		return texture;
	});
	const createView = GPUTexture.prototype.createView;
	vi.spyOn(GPUTexture.prototype, 'createView').mockImplementation(function(this: GPUTexture, descriptor) {
		const view = createView.call(this, descriptor), record = textures.get(this);
		if (record) views.set(view, { record, texture: this });
		return view;
	});
	const beginRender = GPUCommandEncoder.prototype.beginRenderPass;
	vi.spyOn(GPUCommandEncoder.prototype, 'beginRenderPass').mockImplementation(function(this: GPUCommandEncoder, descriptor) {
		for (const attachment of descriptor.colorAttachments) {
			const output = attachment?.resolveTarget ?? attachment?.view;
			const target = output && (output instanceof GPUTexture
				? { record: textures.get(output), texture: output } : views.get(output));
			if (target?.record) {
				const targets = renderTargets.get(this) ?? new Map<CanvasRecord, GPUTexture>();
				targets.set(target.record, target.texture); renderTargets.set(this, targets);
			}
		}
		return beginRender.call(this, descriptor);
	});
	const finish = GPUCommandEncoder.prototype.finish;
	vi.spyOn(GPUCommandEncoder.prototype, 'finish').mockImplementation(function(this: GPUCommandEncoder, descriptor) {
		const commands = finish.call(this, descriptor), targets = renderTargets.get(this);
		if (targets) submittedTargets.set(commands, targets);
		return commands;
	});
	const submit = GPUQueue.prototype.submit;
	const writeBuffer = GPUQueue.prototype.writeBuffer;
	vi.spyOn(GPUQueue.prototype, 'writeBuffer').mockImplementation(function(this: GPUQueue, ...args) {
		writes.set(this, (writes.get(this) ?? 0) + 1); writeBuffer.call(this, ...args);
	});
	vi.spyOn(GPUQueue.prototype, 'submit').mockImplementation(function(this: GPUQueue, input) {
		const commands = Array.from(input), targets = new Map<CanvasRecord, GPUTexture>();
		for (const command of commands) for (const [record, texture] of submittedTargets.get(command) ?? []) targets.set(record, texture);
		for (const [record, texture] of targets) {
			record.presentations++;
			const width = texture.width, height = texture.height, pitch = Math.ceil(width * 4 / 256) * 256;
			if (!record.read || record.read.mapping || record.read.width !== width || record.read.height !== height) {
				// Do not lose the terminal natural frame just because the previous
				// submitted frame is being read. The mapped reader owns its cleanup.
				if (!record.read?.mapping) record.read?.buffer.destroy();
				record.read = { width, height, pitch, mapping: false, buffer: record.device.createBuffer({
					label: 'route observer / latest natural frame', size: pitch * height,
					usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }) };
			}
			const encoder = record.device.createCommandEncoder({ label: 'route observer / copy only' });
			encoder.copyTextureToBuffer({ texture }, { buffer: record.read.buffer, bytesPerRow: pitch }, [width, height]);
			commands.push(encoder.finish());
			record.frame = { version: record.presentations, action, seconds: record.session?.state.seconds ?? 0, width, height };
		}
		submissions.set(this, (submissions.get(this) ?? 0) + 1);
		submit.call(this, commands);
	});
	const create = LabSession.create.bind(LabSession);
	vi.spyOn(LabSession, 'create').mockImplementation(async (...args) => {
		const session = await create(...args), record = byCanvas.get(args[0]);
		if (record) record.session = session;
		return session;
	});
	const load = LabSession.prototype.load;
	vi.spyOn(LabSession.prototype, 'load').mockImplementation(async function(this: LabSession, factory) {
		const record = records.find((item) => item.session === this);
		if (record) record.loads++;
		return load.call(this, async (device, format) => {
			const model = await factory(device, format);
			if (record) {
				record.model = model;
				const step = model.step.bind(model), reset = model.reset.bind(model);
				vi.spyOn(model, 'step').mockImplementation((...args) => { record.steps++; step(...args); });
				vi.spyOn(model, 'reset').mockImplementation(() => { record.resets++; reset(); });
			}
			if (options.startupGate) { options.startupGate.entered(model); await options.startupGate.released; }
			return model;
		});
	});
	const loader = pages[`../../routes/lab/interfaces/${route}/+page.svelte`];
	if (!loader) throw new Error(`Missing promised route: ${route}`);
	const host = document.createElement('div'); host.style.width = '100%'; document.body.append(host);
	const page = mount((await loader()).default, { target: host });
	async function until(condition: () => boolean, label: string, timeout = 12_000) {
		await vi.waitFor(() => {
			expect(errors).toEqual([]);
			for (const record of records) expect(record.session?.state.error ?? '').toBe('');
			expect(condition(), label).toBe(true);
		}, { timeout, interval: 20 });
	}
	try {
		if (options.fallback) await vi.waitFor(() => expect(host.textContent).toMatch(/unavailable|could not start/i), { timeout: 12_000 });
		else if (options.readyWithoutPresentation) await until(() => records.length > 0 && records.every((record) => record.session?.state.ready === true), 'The delayed hidden page must finish adopting its prepared model');
		else await until(() => records.length > 0 && records.every((record) => (record.frame?.version ?? 0) > 0), 'The natural page must present its first frame');
		await frames();
	} catch (error) { await unmount(page); host.remove(); throw error; }
	async function pixels(record: CanvasRecord): Promise<Image> {
		const read = record.read, frame = record.frame;
		if (!read || !frame) throw new Error('No actual presented frame exists to observe.');
		if (record.reading) throw new Error('Concurrent reads of the same canvas are not supported.');
		expect(frame.version, 'The observer must not mistake an earlier captured frame for the latest presentation').toBe(record.presentations);
		read.mapping = true; record.reading = true;
		try {
			await record.device.queue.onSubmittedWorkDone();
			await read.buffer.mapAsync(GPUMapMode.READ);
			const raw = new Uint8Array(read.buffer.getMappedRange()), pixels = new Uint8Array(frame.width * frame.height * 4);
			for (let y = 0; y < frame.height; y++) pixels.set(raw.subarray(y * read.pitch, y * read.pitch + frame.width * 4), y * frame.width * 4);
			read.buffer.unmap();
			return { ...frame, pixels };
		} finally {
			if (read.buffer.mapState === 'mapped') read.buffer.unmap();
			read.mapping = false; record.reading = false;
			if (record.read !== read) read.buffer.destroy();
		}
	}
	return { host, records, pixels, until,
		activity(record = records[0]) { return { submissions: submissions.get(record.device.queue) ?? 0, writes: writes.get(record.device.queue) ?? 0 }; },
		async action(target: HTMLElement, trigger: () => Promise<void>, event = 'click', record = records[0]) {
			let revision = 0, before = 0;
			const delivered = () => { revision = ++action; before = record?.frame?.version ?? 0; };
			target.addEventListener(event, delivered, { once: true });
			try {
				await trigger();
				expect(revision, 'The real native control event must be delivered').toBeGreaterThan(0);
				if (record) await until(() => (record.frame?.action ?? 0) >= revision && (record.frame?.version ?? 0) > before,
					'The native control must cause a newly presented frame, not reuse a pre-action sample');
				return revision;
			} finally { target.removeEventListener(event, delivered); }
		},
		async dpr(next: number) {
			const current = records.filter((record) => record.active);
			const previous = ratio, versions = current.map((record) => record.frame?.version ?? 0); ratio = next;
			for (const query of [...queries].filter((query) => query.media === `(resolution: ${previous}dppx)`)) query.dispatchEvent(new Event('change'));
			await until(() => current.every((record, i) => (record.frame?.version ?? 0) > versions[i]), 'DPR refresh must actually present its native replacement');
			for (const record of current) native(record, next);
		},
		async idle() {
			await until(() => records.every((record) => !record.active || !record.session || record.session.state.paused), 'The route must stop its simulation clock');
			await frames(4); await Promise.all(records.filter((record) => record.active).map((record) => record.device.queue.onSubmittedWorkDone()));
			const before = [...submissions.values()];
			await frames(10);
			expect([...submissions.values()], 'A settled route must not submit invisible GPU work').toEqual(before);
		},
		async dispose() {
			await unmount(page);
			await Promise.all(records.map((record) => record.device.queue.onSubmittedWorkDone()));
			for (const record of records) record.read?.buffer.destroy();
			host.remove();
		}
	};
}

describe('retained and new studies, natural-page preservation', () => {
	it('Afterheat keeps a real hover trace after cooling and native DPR refresh, and only Start fresh erases it', async () => {
		await browserPage.viewport(1440, 900);
		const f = await fixture('heat-tint');
		try {
			const record = f.records[0], surface = f.host.querySelector<HTMLElement>('.heat-surface')!;
			native(record, 2); surface.scrollIntoView({ block: 'center' }); await frames();
			const original = await f.pixels(record), bounds = surface.getBoundingClientRect();
			for (let i = 0; i <= 16; i++) {
				await userEvent.hover(surface, { force: true, position: { x: bounds.width * (0.25 + i * 0.03), y: bounds.height * 0.5 } });
				await frames(2);
			}
			await f.idle();
			const marked = await f.pixels(record), contrast = difference(original, marked);
			expect(contrast.fraction, 'A real no-click gesture must leave a plainly visible cold trace').toBeGreaterThan(0.001);
			expect(contrast.mean).toBeGreaterThan(10);
			const retained = await record.model!.inspect(), seconds = record.session!.state.seconds;
			expect(retained.details.maxHeat).toBe(0); expect(retained.details.oxideHistory).toBeGreaterThan(0);
			f.host.style.width = 'calc(100% - 0.375px)'; await frames();
			await f.dpr(3);
			expect(await record.model!.inspect()).toEqual(retained);
			expect(record.session!.state.seconds).toBe(seconds); expect(record.session!.state.paused).toBe(true);
			expect(record.loads).toBe(1); expect(record.resets).toBe(0);
			await f.dpr(2); f.host.style.width = '100%'; await frames(4);
			const reset = button(f.host, 'Start fresh');
			await f.action(reset, () => userEvent.click(reset));
			expect(difference(original, await f.pixels(record), 0).affected, 'The actual reset presentation must restore the original finish').toBe(0);
			expect((await record.model!.inspect()).details.oxideHistory).toBe(0);
			await f.idle();
		} finally { await f.dispose(); }
	});

	it('liquid selection changes the shelf immediately, visibly travels, then keeps its final native indicator at 3x', async () => {
		await browserPage.viewport(1440, 900);
		const f = await fixture('selection');
		try {
			const record = f.records[0], control = f.host.querySelector<HTMLElement>('.selection')!;
			control.scrollIntoView({ block: 'center' }); await frames(); native(record, 2);
			const initial = await f.pixels(record), destination = button(f.host, 'Finished');
			await f.action(destination, () => userEvent.click(destination));
			expect(destination.getAttribute('aria-checked')).toBe('true');
			expect(f.host.querySelector('#shelf-title')?.textContent).toBe('Still with you.');
			expect(record.session!.state.paused, 'Shelf content must not wait for the decorative material to settle').toBe(false);
			await f.until(() => record.steps > 20, 'The native selection must run its transition');
			const moving = await f.pixels(record), x = alphaCentroid(moving);
			expect(x).toBeGreaterThan(alphaCentroid(initial) + 0.015);
			expect(x, 'Observe an intermediate liquid position, not only the eventual snap').toBeLessThan(0.81);
			await f.idle();
			const settled = await f.pixels(record);
			expect(alphaCentroid(settled)).toBeCloseTo(5 / 6, 2);
			const retained = await record.model!.inspect(), seconds = record.session!.state.seconds;
			f.host.style.width = 'calc(100% - 0.375px)'; await frames(); await f.dpr(3);
			expect(await record.model!.inspect()).toEqual(retained);
			expect(record.session!.state.seconds).toBe(seconds); expect(record.session!.state.paused).toBe(true);
			expect(alphaCentroid(await f.pixels(record))).toBeCloseTo(alphaCentroid(settled), 3);
			expect(record.loads).toBe(1); expect(record.resets).toBe(0);
			await f.action(destination, () => userEvent.keyboard('{ArrowLeft}'), 'keydown');
			expect(button(f.host, 'Saved').getAttribute('aria-checked')).toBe('true');
			expect(document.activeElement).toBe(button(f.host, 'Saved'));
			expect(f.host.querySelector('#shelf-title')?.textContent).toBe('Something for later.');
			await f.idle();
		} finally { await f.dispose(); }
	});

	for (const route of ['heat-tint', 'selection']) {
		it(`${route}: reduced motion preserves useful native controls and has no idle work at a natural 3x phone viewport`, async () => {
			await browserPage.viewport(390, 844);
			const f = await fixture(route, true, { ratio: 3 });
			try {
				const record = f.records[0]; native(record, 3);
				if (route === 'heat-tint') {
					expect(button(f.host, 'Draw a trace').disabled).toBe(true);
					const reset = button(f.host, 'Start fresh'); expect(reset.disabled).toBe(false);
					await f.action(reset, () => userEvent.click(reset));
					expect(f.host.textContent).toContain('Still finish · reduced motion');
				} else {
					const choice = button(f.host, 'Finished');
					await f.action(choice, () => userEvent.click(choice));
					expect(f.host.querySelector('#shelf-title')?.textContent).toBe('Still with you.');
					expect(getComputedStyle(choice, '::after').opacity, 'The reduced-motion shelf needs a visible static native indicator').toBe('1');
					expect(getComputedStyle(record.canvas).visibility).toBe('hidden');
				}
				expect(record.steps).toBe(0); expect(record.session!.state.seconds).toBe(0);
				await f.idle();
			} finally { await f.dispose(); }
		});

		it(`${route}: an ordinary adapter failure retains honest fallback and the route's native content`, async () => {
			await browserPage.viewport(390, 844);
			const f = await fixture(route, false, { ratio: 3, fallback: true });
			try {
				expect(f.host.querySelector('h1')?.textContent?.trim()).not.toBe('');
				expect(getComputedStyle(f.host.querySelector('canvas')!).visibility).toBe('hidden');
				if (route === 'selection') {
					const choice = button(f.host, 'Saved'); await userEvent.click(choice);
					expect(choice.getAttribute('aria-checked')).toBe('true');
					expect(f.host.querySelector('#shelf-title')?.textContent).toBe('Something for later.');
					expect(getComputedStyle(choice, '::after').opacity).toBe('1');
				} else expect(button(f.host, 'Draw a trace').disabled).toBe(true);
				expect(f.records).toHaveLength(0);
			} finally { await f.dispose(); }
		});
	}
});

describe('new material proofs, actual first-use controls', () => {
	for (const route of ['frost', 'frost-type', 'dendritic-growth']) {
		it(`${route}: delayed startup while hidden preserves its unspent first visible growth interval`, async () => {
			await browserPage.viewport(1440, 900);
			let hidden = false;
			vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
			let release!: () => void, entered!: (model: LiquidExperiment) => void;
			const released = new Promise<void>((resolve) => { release = resolve; });
			const prepared = new Promise<LiquidExperiment>((resolve) => { entered = resolve; });
			const mounting = fixture(route, false, { readyWithoutPresentation: true, startupGate: { entered, released } });
			try {
				const candidate = await Promise.race([prepared, mounting.then(() => { throw new Error('The startup gate was not observed.'); })]);
				const seed = await candidate.inspect();
				// Resource creation and the initial seed happened before this gate;
				// hidden work below measures only adoption/automatic evolution.
				hidden = true; document.dispatchEvent(new Event('visibilitychange')); await frames(4); release();
				const f = await mounting, record = f.records[0];
				expect(record.session!.state.paused).toBe(true); expect(record.steps).toBe(0); expect(record.presentations).toBe(0);
				const adopted = await candidate.inspect();
				expect(adopted.details.seconds).toBe(0); expect(adopted.details.steps).toBe(0);
				if (route !== 'dendritic-growth') expect(adopted.details.seeds).toBe(seed.details.seeds);
				expect(adopted.details.checksum).toBe(seed.details.checksum);
				await record.device.queue.onSubmittedWorkDone(); const quiet = f.activity(record);
				await frames(12); expect(f.activity(record), 'A hidden first-use opportunity must not issue automatic GPU work').toEqual(quiet);
				hidden = false; document.dispatchEvent(new Event('visibilitychange'));
				await f.until(() => record.steps > 0 && Boolean(record.frame), 'First visibility must start the unspent finite growth interval without another click');
				const first = await f.pixels(record); await f.idle();
				const grown = await candidate.inspect(), settled = await f.pixels(record);
				expect(grown.details.seconds).toBeGreaterThan(route === 'frost-type' ? 0.15 : 0.5);
				expect(grown.details.phaseFraction).toBeGreaterThan(seed.details.phaseFraction * 1.2);
				expect(difference(first, settled).affected, 'The delayed first-use interval must visibly evolve the actual phase field').toBeGreaterThan(500);
				const steps = record.steps, checksum = grown.details.checksum;
				hidden = true; document.dispatchEvent(new Event('visibilitychange')); await frames(4);
				hidden = false; document.dispatchEvent(new Event('visibilitychange')); await frames(12); await f.idle();
				expect(record.steps, 'Subsequent visibility must not replay the one-time introductory burst').toBe(steps);
				expect((await candidate.inspect()).details.checksum).toBe(checksum); expect(record.loads).toBe(1); expect(record.resets).toBe(0);
			} finally { release(); hidden = false; const f = await mounting.catch(() => undefined); await f?.dispose(); }
		});

		it(`${route}: a normal-motion native snapshot below the offscreen specimen remains useful without starting a hidden animation`, async () => {
			await browserPage.viewport(390, 500);
			const f = await fixture(route);
			try {
				const record = f.records[0], glass = f.host.querySelector<HTMLElement>(route === 'dendritic-growth' ? '.specimen' : '.glass')!;
				glass.scrollIntoView({ block: 'center' }); await frames(); await f.idle();
				const original = await f.pixels(record);
				// Expand real page content so document-end scroll clamping cannot
				// leave a sliver of the specimen visible above these controls.
				await userEvent.click(f.host.querySelector('details summary')!); await frames();
				const controls = f.host.querySelector<HTMLElement>(route === 'frost' ? '.readout' : route === 'frost-type' ? '.references' : '.tools')!;
				controls.scrollIntoView({ block: 'start' }); window.scrollBy(0, 2); await frames(4);
				expect(record.canvas.getBoundingClientRect().bottom, 'The native control must genuinely be used below an offscreen canvas').toBeLessThanOrEqual(0);
				const snapshot = button(f.host, 'Advance one snapshot'); expect(snapshot.disabled).toBe(false);
				const before = await record.model!.inspect(), normalSteps = record.steps;
				await f.action(snapshot, () => userEvent.click(snapshot));
				const after = await record.model!.inspect();
				expect(after.details.steps, 'An enabled, explicitly requested snapshot must advance material even without reduced-motion preference').toBeGreaterThan(before.details.steps);
				expect(after.details.seconds - before.details.seconds).toBeCloseTo(0.4, 8);
				expect(after.details.phaseFraction).toBeGreaterThan(before.details.phaseFraction);
				expect(after.details.checksum).not.toBe(before.details.checksum);
				expect(record.session!.state.paused).toBe(true); expect(record.steps, 'A still request is not permission for offscreen continuous animation').toBe(normalSteps);
				await f.idle(); glass.scrollIntoView({ block: 'center' }); await frames(4); await f.idle();
				expect(difference(original, await f.pixels(record)).affected, 'Returning to the actual canvas must show the explicitly advanced phase state').toBeGreaterThan(100);
				expect((await record.model!.inspect()).details.checksum).toBe(after.details.checksum); expect(record.loads).toBe(1);
			} finally { await f.dispose(); }
		});
	}

	for (const route of ['capillary-type', 'colorway']) it(`${route}: a delayed diagnostic cannot restore an erased native balance after Clean plate`, async () => {
		await browserPage.viewport(1440, 900);
		const f = await fixture(route, true);
		let release: (() => void) | undefined;
		try {
			const record = f.records[0], previous = await record.model!.inspect();
			expect(previous.mass).toBeGreaterThan(0);
			vi.spyOn(record.model!, 'inspect').mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(previous); }));
			const view = button(f.host, 'Only moving ink'); await f.action(view, () => userEvent.click(view));
			expect(release, 'The native view must have genuinely requested the held diagnostic').toBeDefined();
			const painted = await f.pixels(record), clean = button(f.host, 'Clean plate'); await f.action(clean, () => userEvent.click(clean));
			const empty = await f.pixels(record), values = () => [...f.host.querySelectorAll('.balance b')].map((cell) => cell.textContent);
			expect(difference(painted, empty).affected, 'The actual native reset must visibly remove the finite pigment').toBeGreaterThan(100);
			expect(values()).toEqual(['0.0', '0.0', '0.0']); release!(); await frames(6);
			expect(values(), 'An old GPU snapshot cannot resurrect the erased native balance').toEqual(['0.0', '0.0', '0.0']);
			expect([...f.host.querySelectorAll('.dose small')].map((item) => item.textContent)).toEqual(['3/3', '3/3', '3/3']);
			expect((await record.model!.inspect()).mass).toBe(0);
			const after = (await f.pixels(record)).pixels; let changedBytes = 0;
			expect(after.length).toBe(empty.pixels.length);
			for (let i = 0; i < after.length; i++) if (after[i] !== empty.pixels[i]) changedBytes++;
			expect(changedBytes).toBe(0); await f.idle();
		} finally { release?.(); await f.dispose(); }
	});

	it('capillary diagnostics serialize overlapping native requests, show the latest balance, and stop after unmount', async () => {
		await browserPage.viewport(1440, 900);
		const f = await fixture('capillary-type', true);
		const releases: Array<() => void> = [];
		let disposed = false;
		try {
			const record = f.records[0], inspect = record.model!.inspect.bind(record.model!);
			let calls = 0, active = 0, peak = 0;
			vi.spyOn(record.model!, 'inspect').mockImplementation(async () => {
				const index = calls++; active++; peak = Math.max(peak, active);
				try { const snapshot = await inspect(); await new Promise<void>((resolve) => { releases[index] = resolve; }); return snapshot; }
				finally { active--; }
			});
			const moving = button(f.host, 'Only moving ink'); await f.action(moving, () => userEvent.click(moving));
			await f.until(() => Boolean(releases[0]), 'The first real diagnostic must reach its held completion');
			const pour = button(f.host, 'Pour Vermilion'); await f.action(pour, () => userEvent.click(pour));
			const attached = button(f.host, 'Only attached ink'); await f.action(attached, () => userEvent.click(attached));
			const combined = button(f.host, 'The impression'); await f.action(combined, () => userEvent.click(combined));
			expect(calls, 'View and pour requests must coalesce behind the one active GPU read').toBe(1); expect(peak).toBe(1);
			releases[0](); await f.until(() => calls === 2 && Boolean(releases[1]), 'Exactly one follow-up must inspect the latest poured material');
			releases[1](); await f.until(() => active === 0, 'The follow-up must complete');
			await vi.waitFor(() => expect([...f.host.querySelectorAll('.balance b')].at(-1)?.textContent).toBe('840.0'));
			expect(calls).toBe(2); expect(peak).toBe(1);
			await f.action(moving, () => userEvent.click(moving));
			await f.until(() => calls === 3 && Boolean(releases[2]), 'The unmount case must hold another actual read');
			await f.action(attached, () => userEvent.click(attached)); expect(calls).toBe(3);
			await f.dispose(); disposed = true;
			const activity = f.activity(record); releases[2](); await frames(6);
			expect(active).toBe(0); expect(calls, 'Unmount must discard the coalesced follow-up').toBe(3);
			expect(f.activity(record)).toEqual(activity); expect(f.host.isConnected).toBe(false);
		} finally { releases.forEach((release) => release()); if (!disposed) await f.dispose(); }
	});

	it('adhesive type: a delayed old diagnostic cannot overwrite the native empty-sheet ledger after Clean sheet', async () => {
		await browserPage.viewport(1440, 900);
		const f = await fixture('adhesive-type', true);
		try {
			const record = f.records[0], table = f.host.querySelector('.ledger table')!;
			await vi.waitFor(() => expect(table.textContent).toContain('2400.0')); await frames();
			const previous = await record.model!.inspect(); let release: (() => void) | undefined;
			vi.spyOn(record.model!, 'inspect').mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(previous); }));
			const view = button(f.host, 'Only attached pigment'); await f.action(view, () => userEvent.click(view));
			expect(release, 'The test must genuinely hold an earlier diagnostic read').toBeDefined();
			const clean = button(f.host, 'Clean sheet'); await f.action(clean, () => userEvent.click(clean));
			const values = () => [...table.querySelectorAll('td')].map((cell) => cell.textContent);
			expect(values()).toEqual(Array(12).fill('0.0')); release!(); await frames(6);
			expect(values(), 'Completed diagnostics from an earlier document revision must not resurrect erased pigment in the native readout').toEqual(Array(12).fill('0.0'));
			expect([...f.host.querySelectorAll('.dose small')].map((item) => item.textContent)).toEqual(['3/3', '3/3', '3/3']);
			expect((await record.model!.inspect()).mass).toBe(0); await f.idle();
		} finally { await f.dispose(); }
	});

	for (const reduced of [false, true]) {
		it(`adhesive type: one native clear reveals retained letters, and native rendering preserves the pigment ledger (${reduced ? 'reduced' : 'normal'} motion)`, async () => {
			await browserPage.viewport(reduced ? 390 : 1440, reduced ? 844 : 900);
			const f = await fixture('adhesive-type', reduced);
			try {
				const record = f.records[0], original = await f.pixels(record), clear = button(f.host, 'Clear wash');
				await f.action(clear, () => userEvent.click(clear)); const revealed = await f.pixels(record), retained = await record.model!.inspect();
				expect(difference(original, revealed).fraction, 'The first clear must visibly expose the retained word, not merely relabel the wash').toBeGreaterThan(0.1);
				expect(retained.details.attached).toBeGreaterThan(100); expect(retained.details.removed).toBeGreaterThan(100);
				const ledger = (snapshot: LiquidSnapshot) => {
					for (let c = 0; c < 3; c++) expect(Math.abs(snapshot.details[`mobile${c}`] + snapshot.details[`attached${c}`] + snapshot.details[`removed${c}`] - snapshot.details[`injected${c}`])).toBeLessThan(0.1);
					expect(Math.abs(snapshot.mass + snapshot.details.removed - snapshot.initialMass)).toBeLessThan(0.2);
					return Object.fromEntries(['checksum', 'clears', 'pours', 'mobile0', 'mobile1', 'mobile2', 'attached0', 'attached1', 'attached2', 'removed0', 'removed1', 'removed2', 'injected0', 'injected1', 'injected2'].map((key) => [key, snapshot.details[key]]));
				};
				const colors = ledger(retained), seconds = record.session!.state.seconds;
				const attached = button(f.host, 'Only attached pigment'); await f.action(attached, () => userEvent.click(attached));
				const letters = await f.pixels(record); expect(visibleArea(letters)).toBeGreaterThan(0.1); expect(visibleArea(letters)).toBeLessThan(0.5);
				f.host.style.width = 'calc(100% - 0.375px)'; await frames(); await f.dpr(3);
				await vi.waitFor(async () => expect((await record.model!.inspect()).details.nativeCoverageBytes).toBe(record.canvas.width * record.canvas.height));
				expect(ledger(await record.model!.inspect())).toEqual(colors); expect(record.session!.state.seconds).toBe(seconds);
				if (!reduced) {
					const whole = button(f.host, 'Whole wash'); await f.action(whole, () => userEvent.click(whole));
					const surface = f.host.querySelector<HTMLElement>('.material')!; surface.scrollIntoView({ block: 'center' }); await frames();
					const before = await f.pixels(record), r = surface.getBoundingClientRect();
					for (let i = 0; i <= 18; i++) { await userEvent.hover(surface, { force: true, position: { x: r.width * (0.32 + 0.26 * i / 18), y: r.height * 0.5 } }); await new Promise((resolve) => setTimeout(resolve, 33)); }
					const brushed = await f.pixels(record), moved = await record.model!.inspect(); ledger(moved);
					expect(difference(before, brushed).fraction, 'Ordinary pointer movement must visibly lift and move the attached impression').toBeGreaterThan(0.01);
					expect(moved.details.pours).toBe(retained.details.pours); expect(moved.details.attached).toBeLessThan(retained.details.attached - 10);
					await userEvent.hover(f.host.querySelector('header')!, { force: true }); expect(surface.matches(':hover')).toBe(false);
					await new Promise((resolve) => setTimeout(resolve, 5450));
				} else expect(record.steps).toBe(0);
				const clean = button(f.host, 'Clean sheet'); await f.action(clean, () => userEvent.click(clean));
				const empty = await record.model!.inspect(); expect(empty.mass).toBe(0); expect(empty.details.removed).toBe(0); expect(empty.initialMass).toBe(0); await f.idle();
			} finally { await f.dispose(); }
		});
	}

	it('adhesive type: missing GPU leaves an honest static page and disables pigment changes', async () => {
		await browserPage.viewport(390, 844);
		const f = await fixture('adhesive-type', true, { ratio: 3, fallback: true });
		try { expect(button(f.host, 'Clear wash').disabled).toBe(true); expect(button(f.host, 'Fresh blue wash').disabled).toBe(true); expect(f.host.querySelector('h1')?.textContent).toContain('What stays'); expect(f.records).toHaveLength(0); }
		finally { await f.dispose(); }
	});

	it('imprint: a native corner miss does not consume material history or claim success, while a real partial edge overlap still marks', async () => {
		await browserPage.viewport(1440, 900);
		const f = await fixture('imprint', true);
		try {
			const record = f.records[0], pad = f.host.querySelector<HTMLButtonElement>('.pad')!;
			await f.until(() => !pad.disabled, 'The native seal must finish preparing');
			const size = labeledInput(f.host, 'Tool size'); size.focus(); await userEvent.keyboard('{Home}');
			await userEvent.selectOptions(labelControl(f.host, 'Tool head'), 'ring'); await frames();
			pad.scrollIntoView({ block: 'center' }); await frames(); const original = await f.pixels(record), retained = await record.model!.inspect(), r = pad.getBoundingClientRect();
			await userEvent.click(pad, { position: { x: r.width * 0.01, y: r.height * 0.01 } }); await frames();
			expect(pad.dataset.impressions).toBe('0'); expect((await record.model!.inspect()).details.historyChecksum).toBe(retained.details.historyChecksum);
			expect(difference(original, await f.pixels(record), 0).affected).toBe(0);
			expect(f.host.querySelector('.letter-status')?.textContent).not.toContain('Your impression');
			await f.action(pad, () => userEvent.click(pad, { position: { x: r.width * 0.86, y: r.height * 0.5 } }));
			expect(pad.dataset.impressions).toBe('1'); expect(difference(original, await f.pixels(record)).affected).toBeGreaterThan(50);
			expect(f.host.querySelector('.letter-status')?.textContent).toContain('Your impression'); await f.idle();
		} finally { await f.dispose(); }
	});

	for (const reduced of [false, true]) {
		it(`threads: native controls append a visible retained trace, preserve it across braid and DPR, and stop at explicit capacity (${reduced ? 'reduced' : 'normal'} motion)`, async () => {
			await browserPage.viewport(reduced ? 390 : 1440, reduced ? 844 : 900);
			const f = await fixture('threads', reduced);
			let stage = 'first presentation';
			try {
				const record = f.records[0], surface = f.host.querySelector<HTMLElement>('.thread-surface')!;
				await f.idle(); native(record, 2); let initial = await f.pixels(record);
				expect(visibleArea(initial), 'The first page must already contain a real retained thread, not an empty canvas').toBeGreaterThan(0.001);
				stage = 'native feed'; const start = button(f.host, 'Start feed');
				if (reduced) expect(start.disabled).toBe(true);
				else {
					surface.scrollIntoView({ block: 'center' }); await frames(4);
					expect(record.canvas.getBoundingClientRect().bottom).toBeGreaterThan(0); expect(start.disabled).toBe(false);
					const beforeFeed = Number(surface.dataset.count); await f.action(start, () => userEvent.click(start));
					await f.until(() => Number(surface.dataset.count) > beforeFeed + 20, 'Start feed must run the natural deposition clock, not only change its label');
					const pause = button(f.host, 'Pause feed'); await f.action(pause, () => userEvent.click(pause)); await f.idle();
					const stopped = Number(surface.dataset.count); await frames(10); expect(Number(surface.dataset.count)).toBe(stopped);
					expect(record.steps).toBeGreaterThan(0); initial = await f.pixels(record);
				}
				stage = 'append sample'; const count = Number(surface.dataset.count), add = button(f.host, 'Add a short sample');
				await f.action(add, () => userEvent.click(add)); await f.idle(); const deposited = await f.pixels(record);
				expect(Number(surface.dataset.count)).toBeGreaterThan(count); expect(difference(initial, deposited).affected).toBeGreaterThan(500);
				const semantic = (snapshot: LiquidSnapshot) => Object.fromEntries(['count', 'full', 'feeding', 'feed', 'beltRatio', 'depositedLength', 'beltDistance', 'contactX', 'contactY', 'contactTheta']
					.map((key) => [key, snapshot.details[key]]));
				const retained = semantic(await record.model!.inspect()), seconds = record.session!.state.seconds;
				stage = 'select braid'; const mode = f.host.querySelector<HTMLSelectElement>('select[aria-label="Thread study"]')!;
				await f.action(mode, () => userEvent.selectOptions(mode, 'braid'), 'change');
				expect(surface.dataset.mode).toBe('braid'); expect(difference(deposited, await f.pixels(record)).affected).toBeGreaterThan(500);
				stage = 'select deposition'; await f.action(mode, () => userEvent.selectOptions(mode, 'deposition'), 'change');
				expect(semantic(await record.model!.inspect())).toEqual(retained); sameThreadGeometry(deposited, await f.pixels(record));
				f.host.style.width = 'calc(100% - 0.375px)'; await frames(); await f.dpr(3);
				expect(semantic(await record.model!.inspect())).toEqual(retained); expect(record.session!.state.seconds).toBe(seconds);
				stage = 'native ratio'; const ratio = labeledInput(f.host, 'Belt to feed ratio'); ratio.focus(); await f.action(ratio, () => userEvent.keyboard('{Home}'), 'input');
				expect((await record.model!.inspect()).details.beltRatio, 'The first native ratio input must reach the actual contact model').toBe(0);
				// Changing modes legitimately replaces the conditional controls.
				stage = 'capacity'; const append = button(f.host, 'Add a short sample');
				for (let i = 0; i < 10 && !append.disabled; i++) await f.action(append, () => userEvent.click(append));
				expect(surface.dataset.full).toBe('true'); expect(surface.dataset.count).toBe('1536'); expect(append.disabled).toBe(true);
				expect(button(f.host, 'Start feed').disabled).toBe(true); await f.idle();
				stage = 'reset'; const reset = button(f.host, 'New thread'); await f.action(reset, () => userEvent.click(reset)); await f.idle();
				expect(surface.dataset.full).toBe('false'); expect(visibleArea(await f.pixels(record))).toBe(0);
				if (reduced) expect(record.steps).toBe(0); expect(record.loads).toBe(1);
			} catch (error) { throw new Error(`Thread native route failed during ${stage}: ${String(error)}\n${error instanceof Error ? error.stack : ''}`); }
			finally { await f.dispose(); }
		});
	}

	it('threads: unavailable native geometry disables feed and leaves an explicitly static study', async () => {
		await browserPage.viewport(390, 844);
		const f = await fixture('threads', true, { ratio: 3, fallback: true });
		try {
			expect(button(f.host, 'Start feed').disabled).toBe(true); expect(button(f.host, 'Add a short sample').disabled).toBe(true);
			expect(getComputedStyle(f.host.querySelector('canvas')!).visibility).toBe('hidden');
			expect(f.host.querySelector('.thread-surface')?.textContent).toContain('Static study'); expect(f.records).toHaveLength(0);
		} finally { await f.dispose(); }
	});

	it('peel: a native control used below an offscreen specimen commits the geometry shown when the user returns', async () => {
		await browserPage.viewport(390, 500);
		const f = await fixture('peel');
		try {
			const record = f.records[0], stage = f.host.querySelector<HTMLElement>('.stage')!;
			stage.scrollIntoView({ block: 'center' }); await frames(4); const original = await f.pixels(record);
			f.host.querySelector('details')!.setAttribute('open', '');
			const controls = f.host.querySelector<HTMLElement>('.controls')!; controls.scrollIntoView({ block: 'start' }); await frames(4);
			window.scrollBy(0, 2); await frames();
			expect(record.canvas.getBoundingClientRect().bottom, 'This regression must genuinely use controls while the specimen is outside the viewport').toBeLessThanOrEqual(0);
			await f.idle(); const down = button(f.host, 'Lay down'); await userEvent.click(down);
			expect(f.host.querySelector('.peel')?.getAttribute('data-peel')).toBe('0');
			stage.scrollIntoView({ block: 'center' }); await frames(4);
			await f.until(() => record.canvas.getBoundingClientRect().bottom > 0, 'The specimen must actually return to view');
			const flattened = await f.pixels(record); expect(difference(original, flattened).affected).toBeGreaterThan(500);
			expect((await record.model!.inspect()).details.tipHeight).toBe(0); await f.idle();
		} finally { await f.dispose(); }
	});

	it('dewetting: a native opening interrupted while hidden resumes its retained rim and naturally settles on return', async () => {
		await browserPage.viewport(1440, 900);
		let hidden = false;
		vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
		const f = await fixture('dewetting');
		try {
			const record = f.records[0], scene = f.host.querySelector<HTMLElement>('.scene')!;
			scene.scrollIntoView({ block: 'center' }); await frames();
			const initial = await f.pixels(record), open = button(f.host, 'Open at the centre');
			await f.action(open, () => userEvent.click(open));
			expect((await record.model!.inspect()).details.moving, 'Interruption must happen during a real native transition').toBe(1);
			hidden = true; document.dispatchEvent(new Event('visibilitychange')); await f.idle();
			const held = history(await record.model!.inspect()), steps = record.steps, heldPixels = await f.pixels(record);
			expect(held.details.moving).toBe(1); expect(record.session!.state.paused).toBe(true);
			await frames(10); expect(record.steps).toBe(steps); expect(history(await record.model!.inspect())).toEqual(held);
			hidden = false; document.dispatchEvent(new Event('visibilitychange'));
			await f.until(() => record.steps > steps, 'Visibility return must resume the retained physical opening without another click');
			await f.idle(); const final = await record.model!.inspect(), settled = await f.pixels(record);
			expect(final.details.moving).toBe(0); expect(final.details.radius).toBeGreaterThan(held.details.radius);
			expect(visibleArea(settled)).toBeLessThan(visibleArea(heldPixels) - 0.01);
			expect(opaqueChange(initial, settled)).toBeGreaterThan(200);
			expect(final.details.removedVolume).toBeCloseTo(final.details.rimVolume, 9);
			expect(record.loads).toBe(1); expect(record.resets).toBe(0);
		} finally { hidden = false; await f.dispose(); }
	});

	it('wick and swell: forced blur presents a neutral dry sheet once and does not retain an invisible pressure load', async () => {
		await browserPage.viewport(1440, 900);
		const f = await fixture('wick-and-swell');
		try {
			const record = f.records[0], surface = f.host.querySelector<HTMLElement>('.material')!;
			surface.scrollIntoView({ block: 'center' }); await frames(); const original = await f.pixels(record), r = surface.getBoundingClientRect();
			await userEvent.hover(surface, { force: true, position: { x: r.width * 0.67, y: r.height * 0.5 } });
			await vi.waitFor(async () => expect((await record.model!.inspect()).details.probeLoad).toBe(1), { timeout: 2000 });
			const pressed = await f.pixels(record), probe = await record.model!.inspect();
			// Dry compliance is deliberately small: c=.006 and sigma=.095
			// bound its diffuse RGB response around 5 bytes, unlike a wet dent.
			expect(difference(original, pressed, 2).affected, JSON.stringify({ contrast: difference(original, pressed, 0), frame: { version: pressed.version, seconds: pressed.seconds }, probe })).toBeGreaterThan(100);
			const before = record.frame!.version; window.dispatchEvent(new Event('blur'));
			await f.until(() => record.frame!.version > before, 'Forced interruption must actually present its neutral material state');
			expect((await record.model!.inspect()).details.probeLoad).toBe(0);
			expect(difference(original, await f.pixels(record), 0).affected).toBe(0); await f.idle();
		} finally { await f.dispose(); }
	});

	for (const reduced of [false, true]) {
		it(`foam: native boundary changes exchange actual neighbours and preserve the metastable square (${reduced ? 'reduced' : 'normal'} motion)`, async () => {
			await browserPage.viewport(reduced ? 390 : 1440, reduced ? 844 : 900);
			const f = await fixture('foam', reduced);
			try {
				const record = f.records[0], root = f.host.querySelector<HTMLElement>('.foam')!, wide = await f.pixels(record);
				expect(root.dataset.contact).toBe('BD'); const tall = button(f.host, 'Tall frame');
				await f.action(tall, () => userEvent.click(tall));
				expect(tall.getAttribute('aria-pressed')).toBe('true'); expect(labeledInput(f.host, 'Boundary strain').valueAsNumber).toBe(1);
				await f.idle(); expect(root.dataset.contact).toBe('AC'); expect(Number(root.dataset.events)).toBeGreaterThan(0);
				expect(difference(wide, await f.pixels(record)).fraction).toBeGreaterThan(0.02);
				const square = button(f.host, 'Square frame'); await f.action(square, () => userEvent.click(square)); await f.idle();
				expect(root.dataset.contact, 'Returning to square retains the actual new adjacency, not a hard-coded default').toBe('AC');
				const retained = history(await record.model!.inspect()), seconds = record.session!.state.seconds;
				f.host.style.width = 'calc(100% - 0.375px)'; await frames(); await f.dpr(3);
				expect(history(await record.model!.inspect())).toEqual(retained); expect(record.session!.state.seconds).toBe(seconds);
				const squareAC = await f.pixels(record);
				const back = button(f.host, 'Wide frame'); await f.action(back, () => userEvent.click(back)); await f.idle();
				expect(root.dataset.contact).toBe('BD'); expect(record.loads).toBe(1); expect(record.resets).toBe(0);
				await f.action(square, () => userEvent.click(square)); await f.idle(); expect(root.dataset.contact).toBe('BD');
				expect(difference(squareAC, await f.pixels(record)).affected,
					'At the same square boundary, different retained neighbours must be visible in the actual internal films—not only in the labels').toBeGreaterThan(200);
				if (reduced) expect(record.steps).toBe(0);
			} finally { await f.dispose(); }
		});

		it(`dewetting: one native activation exposes the underprint, retains its rim through DPR, and Recoat restores the film (${reduced ? 'reduced' : 'normal'} motion)`, async () => {
			await browserPage.viewport(reduced ? 390 : 1440, reduced ? 844 : 900);
			const f = await fixture('dewetting', reduced);
			try {
				const record = f.records[0], original = await f.pixels(record), open = button(f.host, 'Open at the centre');
				await f.action(open, () => userEvent.click(open)); await f.idle();
				const opened = await f.pixels(record), snapshot = await record.model!.inspect();
				expect(visibleArea(opened), 'The actual coating must become transparent over a meaningful opening').toBeLessThan(visibleArea(original) - 0.03);
				expect(difference(original, opened).fraction).toBeGreaterThan(0.04);
				expect(opaqueChange(original, opened), 'The still-opaque outer film must show its raised rim, not just a flat transparent wipe').toBeGreaterThan(200);
				expect(snapshot.details.removedVolume).toBeGreaterThan(0); expect(snapshot.details.rimVolume).toBeCloseTo(snapshot.details.removedVolume, 9);
				const retained = history(snapshot), seconds = record.session!.state.seconds;
				await f.dpr(3); expect(history(await record.model!.inspect())).toEqual(retained); expect(record.session!.state.seconds).toBe(seconds);
				await f.dpr(2);
				const plain = labelControl(f.host, 'Compare simple wipe'); await userEvent.click(plain); await f.idle();
				expect(getComputedStyle(f.host.querySelector('.gpu')!).visibility).toBe('hidden');
				await f.action(plain, () => userEvent.click(plain)); await f.idle();
				expect(history(await record.model!.inspect())).toEqual(retained);
				expect(difference(opened, await f.pixels(record), 0).affected, 'Inspecting the cheap wipe must not erase the retained physical rim').toBe(0);
				const reset = button(f.host, 'Recoat'); await f.action(reset, () => userEvent.click(reset)); await f.idle();
				expect(difference(original, await f.pixels(record), 0).affected).toBe(0); expect(f.host.querySelector('.study')?.getAttribute('data-open')).toBe('false');
				if (reduced) expect(record.steps).toBe(0); expect(record.loads).toBe(1);
			} finally { await f.dispose(); }
		});

		it(`wick and swell: native finite water changes actual relief and spreads without inventing water (${reduced ? 'reduced' : 'normal'} motion)`, async () => {
			await browserPage.viewport(reduced ? 390 : 1440, reduced ? 844 : 900);
			const f = await fixture('wick-and-swell', reduced);
			try {
				const record = f.records[0], original = await f.pixels(record), drop = button(f.host, 'Add one drop');
				await f.action(drop, () => userEvent.click(drop));
				const wet = await f.pixels(record), first = await record.model!.inspect();
				expect(difference(original, wet).affected, `One finite drop must visibly alter the native sheet: ${JSON.stringify({ contrast: difference(original, wet, 0), frame: { version: wet.version, seconds: wet.seconds }, first })}`).toBeGreaterThan(500);
				expect(drop.textContent).toContain('2 left'); expect(first.details.absorbed).toBeGreaterThan(0);
				expect(first.details.complianceMax).toBeGreaterThan(first.details.complianceDry); expect(first.details.ledger).toBeCloseTo(first.details.initialLedger, 3);
				// Compare material response while the finite drop is concentrated;
				// later diffusion deliberately removes its large local gradients.
				const relief = button(f.host, 'Relief only'); await f.action(relief, () => userEvent.click(relief));
				const equal = button(f.host, 'Equal pressure'); await f.action(equal, () => userEvent.click(equal));
				const soft = await f.pixels(record), baseline = button(f.host, 'Dry-material baseline');
				await f.action(baseline, () => userEvent.click(baseline));
				expect(difference(soft, await f.pixels(record)).affected, 'Equal pressure and fixed albedo must reveal a genuine fresh material difference').toBeGreaterThan(500);
				await f.action(baseline, () => userEvent.click(baseline));
				await f.action(equal, () => userEvent.click(equal)); await f.action(relief, () => userEvent.click(relief));
				await f.idle();
				const settled = await record.model!.inspect();
				// Conserved water spreads into a lower-contrast, flatter patch. It
				// must remain visible, but need not retain its initial steep relief.
				expect(difference(original, await f.pixels(record), 1).affected).toBeGreaterThan(500);
				expect(settled.details.ledger).toBeCloseTo(first.details.ledger, 3);
				expect(settled.details.radius2).toBeGreaterThanOrEqual(first.details.radius2);
				const advance = button(f.host, 'Advance wicking'); await f.action(advance, () => userEvent.click(advance));
				const spread = await record.model!.inspect(); expect(spread.details.radius2).toBeGreaterThan(settled.details.radius2);
				expect(spread.details.emitted).toBe(first.details.emitted); expect(spread.details.ledger).toBeCloseTo(first.details.ledger, 3);
				const retained = history(await record.model!.inspect()), seconds = record.session!.state.seconds;
				f.host.style.width = 'calc(100% - 0.375px)'; await frames(); await f.dpr(3);
				expect(history(await record.model!.inspect())).toEqual(retained); expect(record.session!.state.seconds).toBe(seconds);
				const reset = button(f.host, 'Fresh dry sheet'); await f.action(reset, () => userEvent.click(reset));
				const dry = await record.model!.inspect(); expect(dry.details.emitted).toBe(0); expect(dry.details.absorbed).toBe(0);
				expect(drop.textContent).toContain('3 left'); if (reduced) expect(record.steps).toBe(0); await f.idle();
			} finally { await f.dispose(); }
		});

		it(`meniscus: native field controls move only the aperture boundary, keep their held shape through DPR, and remove exactly (${reduced ? 'reduced' : 'normal'} motion)`, async () => {
			await browserPage.viewport(reduced ? 390 : 1440, reduced ? 844 : 900);
			const f = await fixture('meniscus', reduced);
			try {
				// Establish fractional layout before creating the held field. A
				// subsequent DPR-only refresh must not be conflated with a CSS resize.
				f.host.style.width = 'calc(100% - 0.375px)'; await frames(4);
				const record = f.records[0], original = await f.pixels(record), photo = f.host.querySelector<HTMLImageElement>('.aperture img')!;
				await vi.waitFor(() => expect(photo.naturalWidth).toBe(3803)); const source = photo.currentSrc;
				const field = button(f.host, 'Magnet at right'); await f.action(field, () => userEvent.click(field)); await f.idle();
				const held = await f.pixels(record), retained = history(await record.model!.inspect()), seconds = record.session!.state.seconds;
				expect(difference(original, held).affected).toBeGreaterThan(500); expect(retained.details.active).toBe(1);
				expect(photo.currentSrc).toBe(source); expect(getComputedStyle(photo).transform).toBe('none');
				if (reduced) {
					const aperture = f.host.querySelector<HTMLElement>('.aperture')!; aperture.scrollIntoView({ block: 'center' }); await frames();
					await userEvent.hover(aperture, { force: true }); await userEvent.hover(f.host.querySelector('.caption')!, { force: true });
					expect(aperture.matches(':hover')).toBe(false); await frames(4);
					expect(history(await record.model!.inspect()), 'Incidental hover/leave must not erase an explicitly selected reduced-motion field').toEqual(retained);
					expect(difference(held, await f.pixels(record), 0).affected).toBe(0);
				}
				await f.dpr(3);
				const resized = history(await record.model!.inspect());
				// The exact retained outline is the state authority. The reported
				// kinetic field is a derived target residual; native integer aspect
				// rounding can change that residual without changing any of 24 modes.
				expect({ ...resized, kinetic: retained.kinetic }).toEqual(retained);
				expect(resized.kinetic).toBeLessThan(1e-7); expect(record.session!.state.seconds).toBe(seconds);
				await f.dpr(2); await frames(4);
				const remove = button(f.host, 'Remove field'); await f.action(remove, () => userEvent.click(remove)); await f.idle();
				expect(difference(original, await f.pixels(record), 0).affected).toBe(0);
				if (!reduced) {
					const aperture = f.host.querySelector<HTMLElement>('.aperture')!; aperture.scrollIntoView({ block: 'center' }); await frames();
					const r = aperture.getBoundingClientRect(); await userEvent.hover(aperture, { force: true, position: { x: r.width * 0.82, y: r.height * 0.5 } });
					await f.idle(); expect(difference(original, await f.pixels(record)).affected, 'A real no-click nearby pointer must attract the edge').toBeGreaterThan(500);
					await userEvent.hover(f.host.querySelector('.caption')!, { force: true }); expect(aperture.matches(':hover')).toBe(false); await f.idle();
					expect(difference(original, await f.pixels(record), 0).affected).toBe(0);
				}
				const plain = labelControl(f.host, 'Plain circular aperture'); await userEvent.click(plain);
				await f.until(() => !record.active && !f.host.querySelector('canvas'), 'The plain circular baseline must actually unmount its GPU model');
				expect(getComputedStyle(photo).clipPath).not.toBe('none'); await f.idle();
				if (reduced) expect(record.steps).toBe(0);
			} finally { await f.dispose(); }
		});
	}

	for (const route of ['foam', 'dewetting', 'wick-and-swell', 'meniscus']) {
		it(`${route}: ordinary missing-GPU fallback exposes useful native content and honest control authority`, async () => {
			await browserPage.viewport(390, 844);
			const f = await fixture(route, true, { ratio: 3, fallback: true });
			try {
				if (route === 'foam') {
					await userEvent.click(button(f.host, 'Tall frame')); expect(f.host.querySelector('.foam')?.getAttribute('data-contact')).toBe('AC');
					expect(f.host.querySelectorAll('svg line')).toHaveLength(5);
				} else if (route === 'dewetting') {
					await userEvent.click(button(f.host, 'Open at the centre')); expect(f.host.querySelector('.wipe circle')?.classList.contains('opened')).toBe(true);
					expect(f.host.querySelector('.print')?.textContent).toContain('curious');
				} else if (route === 'wick-and-swell') {
					expect(button(f.host, 'Add one drop').disabled).toBe(true); expect(f.host.querySelector('h1')?.textContent).toContain('Water changes');
				} else {
					expect(button(f.host, 'Magnet at right').disabled).toBe(true);
					const photo = f.host.querySelector<HTMLImageElement>('.aperture img')!;
					await vi.waitFor(() => expect(photo.naturalWidth).toBe(3803)); expect(getComputedStyle(photo).clipPath).not.toBe('none');
				}
				expect(f.records).toHaveLength(0);
			} finally { await f.dispose(); }
		});
	}

	for (const reduced of [false, true]) {
		it(`peel: a real native crease changes the returning ribbon, survives DPR, and explicit flattening restores virgin material (${reduced ? 'reduced' : 'normal'} motion)`, async () => {
			await browserPage.viewport(reduced ? 390 : 1440, reduced ? 844 : 900);
			const f = await fixture('peel', reduced);
			try {
				const record = f.records[0], original = await f.pixels(record), crease = button(f.host, 'Press a crease');
				await f.action(crease, () => userEvent.click(crease));
				const down = button(f.host, 'Lay down'); await f.action(down, () => userEvent.click(down)); await f.idle();
				expect(f.host.querySelector<HTMLElement>('.peel')!.dataset.peel).toBe('0');
				const lift = button(f.host, 'Lift again'); await f.action(lift, () => userEvent.click(lift)); await f.idle();
				const remembered = await f.pixels(record);
				expect(difference(original, remembered).fraction, 'A stored material crease must visibly change the returning ribbon').toBeGreaterThan(0.001);
				const retained = history(await record.model!.inspect()), seconds = record.session!.state.seconds;
				await f.dpr(3); expect(history(await record.model!.inspect())).toEqual(retained); expect(record.session!.state.seconds).toBe(seconds);
				await f.dpr(2);
				const clear = button(f.host, 'Flatten memory'); await f.action(clear, () => userEvent.click(clear)); await f.idle();
				expect(difference(original, await f.pixels(record), 0).affected, 'Explicitly clearing memory must recover the same virgin profile at unchanged peel and lift').toBe(0);
				expect(f.host.querySelector<HTMLElement>('.peel')!.dataset.crease).toBe('false');
				if (reduced) expect(record.steps).toBe(0); expect(record.loads).toBe(1); expect(record.resets).toBe(0);
			} finally { await f.dispose(); }
		});
	}

	it('peel fallback keeps its native flat reveal usable and does not offer unavailable crease memory', async () => {
		await browserPage.viewport(390, 844);
		const f = await fixture('peel', true, { ratio: 3, fallback: true });
		try {
			expect(button(f.host, 'Press a crease').disabled).toBe(true);
			const flat = f.host.querySelector<HTMLElement>('.flat')!, before = flat.getBoundingClientRect().width;
			expect(getComputedStyle(flat).opacity).toBe('1');
			await userEvent.click(button(f.host, 'Lay down'));
			expect(flat.getBoundingClientRect().width).toBeGreaterThan(before);
			expect(f.host.querySelector<HTMLElement>('.peel')!.dataset.peel).toBe('0'); expect(f.records).toHaveLength(0);
		} finally { await f.dispose(); }
	});

	it('frost begins a visible finite growth interval on first viewing and keeps its actual phase field through native DPR refresh', async () => {
		await browserPage.viewport(1440, 900);
		const f = await fixture('frost');
		try {
			const record = f.records[0], initial = await f.pixels(record);
			expect(visibleArea(initial), 'The initial specimen needs an explicit visible crystal seed').toBeGreaterThan(0.001);
			await f.until(() => record.steps > 0, 'The first visible specimen must begin its finite growth without a second action');
			await f.idle();
			const grown = await f.pixels(record);
			expect(visibleArea(grown), 'The bounded first interval must visibly grow the actual ice front').toBeGreaterThan(visibleArea(initial) + 0.05);
			expect(difference(initial, grown).fraction).toBeGreaterThan(0.05);
			const retained = history(await record.model!.inspect()), seconds = record.session!.state.seconds;
			await f.dpr(3); expect(history(await record.model!.inspect())).toEqual(retained);
			expect(record.session!.state.seconds).toBe(seconds); expect(record.loads).toBe(1); expect(record.resets).toBe(0);
			await f.dpr(2);
			const surface = f.host.querySelector<HTMLElement>('.material')!; surface.scrollIntoView({ block: 'center' }); await frames();
			const beforeHeat = await f.pixels(record), r = surface.getBoundingClientRect();
			for (let i = 0; i <= 25; i++) {
				await userEvent.hover(surface, { force: true, position: { x: r.width * (0.48 + 0.04 * i / 25), y: r.height * 0.5 } });
				await new Promise((resolve) => setTimeout(resolve, 60));
			}
			const warmed = await f.pixels(record);
			expect(regionAlpha(warmed, 0.5, 0.5, 0.025), 'A genuine slow no-click brush must open the frozen interior').toBeLessThan(regionAlpha(beforeHeat, 0.5, 0.5, 0.025) - 0.35);
			expect(visibleArea(warmed), 'Local warming must leave visible ice elsewhere rather than globally erasing the specimen').toBeGreaterThan(0.1);
			await userEvent.hover(f.host.querySelector('header')!, { force: true }); expect(surface.matches(':hover')).toBe(false); await f.idle();
		} finally { await f.dispose(); }
	});

	it('frost reduced-motion controls show real cold growth and delayed warm melting without creating an idle clock', async () => {
		await browserPage.viewport(390, 844);
		const f = await fixture('frost', true, { ratio: 3 });
		try {
			const record = f.records[0], initial = await f.pixels(record), advance = button(f.host, 'Advance one snapshot');
			native(record, 3); await f.action(advance, () => userEvent.click(advance));
			const cold = await f.pixels(record);
			expect(visibleArea(cold)).toBeGreaterThan(visibleArea(initial));
			const warm = button(f.host, 'Warm melts'); await f.action(warm, () => userEvent.click(warm));
			// Heat must cross the phase-transition temperature; immediate removal
			// would erase the thermal state instead of demonstrating melting.
			for (let i = 0; i < 4; i++) await f.action(advance, () => userEvent.click(advance));
			const melted = await f.pixels(record);
			expect(visibleArea(melted)).toBeLessThan(visibleArea(cold) * 0.1);
			const clear = button(f.host, 'Clear glass'); await f.action(clear, () => userEvent.click(clear));
			const coldBath = button(f.host, 'Cold grows'); await f.action(coldBath, () => userEvent.click(coldBath));
			await f.action(advance, () => userEvent.click(advance));
			expect(visibleArea(await f.pixels(record)), 'Cold alone must not manufacture a seed after the user clears the glass').toBe(0);
			const seed = button(f.host, 'Plant a cold crystal'); await f.action(seed, () => userEvent.click(seed));
			expect(visibleArea(await f.pixels(record)), 'A deliberately planted cold crystal must remain visible after Warm → Clear → Cold, without erasing the whole temperature field').toBeGreaterThan(0.001);
			expect(record.steps).toBe(0); expect(record.session!.state.seconds).toBe(0); await f.idle();
		} finally { await f.dispose(); }
	});

	it('frost fallback exposes the native underprint and disables unavailable growth controls', async () => {
		await browserPage.viewport(390, 844);
		const f = await fixture('frost', true, { ratio: 3, fallback: true });
		try {
			expect(f.host.querySelector('.underprint')?.textContent).toContain('NOTHING');
			expect(button(f.host, 'Plant a cold crystal').disabled).toBe(true);
			expect(getComputedStyle(f.host.querySelector('canvas')!).visibility).toBe('hidden'); expect(f.records).toHaveLength(0);
		} finally { await f.dispose(); }
	});

	for (const reduced of [false, true]) {
		it(`imprint tools: native tool selection changes the next mark, never the old one, and native-source replacement retains the program (${reduced ? 'reduced' : 'normal'} motion)`, async () => {
			await browserPage.viewport(reduced ? 390 : 1440, reduced ? 844 : 900);
			const f = await fixture('imprint', reduced);
			try {
				const record = f.records[0], pad = f.host.querySelector<HTMLButtonElement>('.pad')!;
				await f.until(() => !pad.disabled, 'Native tool controls must wait for the usable signet source');
				native(record, 2); const empty = await f.pixels(record);
				const tool = labelControl(f.host, 'Tool head'); await userEvent.selectOptions(tool, 'ring');
				const press = button(f.host, 'Press current tool'); await f.action(press, () => userEvent.click(press));
				await f.idle(); const ring = await f.pixels(record), first = await record.model!.inspect();
				expect(difference(empty, ring).affected, 'The first native tool must leave a visible retained impression').toBeGreaterThan(500);
				expect(first.details.impressions).toBe(1);
				await userEvent.selectOptions(tool, 'comb'); await frames(3);
				expect((await record.model!.inspect()).details.historyChecksum).toBe(first.details.historyChecksum);
				expect(difference(ring, await f.pixels(record), 0).affected, 'Choosing the next head must not rewrite a retained mark').toBe(0);
				const smooth = button(f.host, 'Warm & smooth'); await f.action(smooth, () => userEvent.click(smooth)); await f.idle();
				expect(difference(empty, await f.pixels(record), 0).affected).toBe(0);
				await f.action(press, () => userEvent.click(press)); await f.idle();
				const comb = await f.pixels(record);
				expect(difference(ring, comb).affected, 'The actual next comb impression must differ from the same-position ring').toBeGreaterThan(500);
				const trio = button(f.host, 'Add a mixed trio'); await f.action(trio, () => userEvent.click(trio)); await f.idle();
				const retained = await record.model!.inspect(), seconds = record.session!.state.seconds;
				expect(retained.details.impressions).toBe(4);
				const source = Number(pad.dataset.nativeSource); f.host.style.width = 'calc(100% - 0.375px)'; await frames(); await f.dpr(3);
				await f.until(() => !pad.disabled && Number(pad.dataset.nativeSource) > source, 'The new native signet source must finish before the tool becomes usable');
				const refreshed = await record.model!.inspect();
				expect(refreshed.details.impressions).toBe(4); expect(refreshed.details.historyChecksum).toBe(retained.details.historyChecksum);
				expect(refreshed.details.sourceWidth).toBe(Number(pad.dataset.nativeSource));
				expect(record.session!.state.seconds).toBe(seconds); expect(record.loads).toBe(1);
				if (reduced) expect(record.steps).toBe(0);
				const original = button(f.host, 'Original seal'); await f.action(original, () => userEvent.click(original)); await f.idle();
				expect((await record.model!.inspect()).details.impressions).toBe(1); expect((tool as HTMLSelectElement).value).toBe('signet');
			} finally { await f.dispose(); }
		});
	}

	it('imprint tools retain a meaningful static seal and disable only unavailable marking when GPU startup fails', async () => {
		await browserPage.viewport(390, 844);
		const f = await fixture('imprint', true, { ratio: 3, fallback: true });
		try {
			expect(f.host.querySelector<HTMLButtonElement>('.pad')!.disabled).toBe(true);
			expect(button(f.host, 'Press current tool').disabled).toBe(true);
			expect(f.host.querySelector('.letter')?.textContent).toContain('An invitation waiting for your touch');
			expect(getComputedStyle(f.host.querySelector('canvas')!).visibility).toBe('hidden');
			expect(f.records).toHaveLength(0);
		} finally { await f.dispose(); }
	});

	for (const reduced of [false, true]) {
		it(`caustics: native surface changes visibly redistribute light and preserve the native receiver through DPR (${reduced ? 'reduced' : 'normal'} motion)`, async () => {
			await browserPage.viewport(reduced ? 390 : 1440, reduced ? 844 : 900);
			const f = await fixture('caustics', reduced);
			try {
				const record = f.records[0], surface = f.host.querySelector<HTMLElement>('.material')!;
				const samples = labelControl(f.host, 'Light samples') as HTMLSelectElement;
				expect(samples.value, 'The initial native selection must match the active 128² light grid').toBe('128');
				await f.action(samples, () => userEvent.selectOptions(samples, '64'), 'change');
				expect(samples.value).toBe('64'); expect((await record.model!.inspect()).details.photonGrid).toBe(64);
				await f.action(samples, () => userEvent.selectOptions(samples, '128'), 'change');
				surface.scrollIntoView({ block: 'center' }); await frames(); native(record, 2);
				const original = await f.pixels(record), shift = button(f.host, 'Shift surface');
				await f.action(shift, () => userEvent.click(shift));
				expect(difference(original, await f.pixels(record)).fraction, 'A shifted refracting surface must move visible focused light').toBeGreaterThan(0.005);
				if (!reduced) {
					surface.scrollIntoView({ block: 'center' }); await frames();
					const before = await f.pixels(record), r = surface.getBoundingClientRect();
					for (const [x, y] of [[0.3, 0.35], [0.7, 0.65]]) {
						await userEvent.hover(surface, { force: true, position: { x: r.width * x, y: r.height * y } }); await frames(2);
					}
					await f.idle();
					expect(difference(before, await f.pixels(record)).affected, 'The actual hover lens must change the receiver, without clicking').toBeGreaterThan(500);
				} else expect(record.steps).toBe(0);
				const relief = labelControl(f.host, 'Surface relief'); relief.focus();
				await f.action(relief, () => userEvent.keyboard('{Home}'), 'input');
				expect((await record.model!.inspect()).details.relief, 'The first native input must use its current value').toBe(0);
				await f.idle();
				const geometry = (snapshot: LiquidSnapshot) => Object.fromEntries(['relief', 'depth', 'phase', 'centerX', 'centerY', 'index', 'photonGrid']
					.map((key) => [key, snapshot.details[key]]));
				const retained = geometry(await record.model!.inspect()), seconds = record.session!.state.seconds;
				f.host.style.width = 'calc(100% - 0.375px)'; await frames(); await f.dpr(3);
				const nativeLight = await record.model!.inspect();
				expect(geometry(nativeLight)).toEqual(retained); expect(record.session!.state.seconds).toBe(seconds);
				expect(nativeLight.details.attachmentBytes).toBe(record.canvas.width * record.canvas.height * 2);
				expect(record.loads).toBe(1); expect(record.resets).toBe(0); await f.idle();
			} finally { await f.dispose(); }
		});
	}

	it('caustics: unsupported GPU shows a static receiver and disables unavailable optical controls', async () => {
		await browserPage.viewport(390, 844);
		const f = await fixture('caustics', true, { ratio: 3, fallback: true });
		try {
			expect(getComputedStyle(f.host.querySelector('canvas')!).visibility).toBe('hidden');
			expect(button(f.host, 'Shift surface').disabled).toBe(true);
			expect(f.host.querySelector('h1')?.textContent).toContain('sunlight');
			expect(f.records).toHaveLength(0);
		} finally { await f.dispose(); }
	});

	it('image wake leaves a visible local no-click memory while distant photographic pixels stay fixed', async () => {
		await browserPage.viewport(1440, 900);
		const f = await fixture('image-wake');
		try {
			const record = f.records[0], surface = f.host.querySelector<HTMLElement>('.image-wake')!;
			surface.scrollIntoView({ block: 'center' }); await frames(); native(record, 2);
			const original = await f.pixels(record), bounds = surface.getBoundingClientRect();
			for (let i = 0; i <= 15; i++) {
				await userEvent.hover(surface, { force: true, position: { x: bounds.width * (0.25 + i * 0.028), y: bounds.height * 0.43 } });
				await new Promise((resolve) => setTimeout(resolve, 40));
			}
			await userEvent.hover(f.host.querySelector('figcaption')!, { force: true });
			expect(surface.matches(':hover'), 'The local-memory measurement follows a real pointer exit').toBe(false);
			await new Promise((resolve) => setTimeout(resolve, 500));
			const remembered = await f.pixels(record), contrast = difference(original, remembered);
			expect(contrast.fraction, 'The recent stroke must remain visibly locatable half a second after leaving').toBeGreaterThan(0.005);
			expect(contrast.mean).toBeGreaterThan(12);
			expect(outsideDifference(original, remembered, 0.2, 0.7), 'A local wake must not skew the distant top and bottom of the photograph').toBe(0);
			await f.idle();
			expect(difference(original, await f.pixels(record), 0).affected, 'After the finite tail the original photograph must be restored exactly').toBe(0);
		} finally { await f.dispose(); }
	});

	for (const reduced of [false, true]) {
		it(`image wake: a native held trace survives comparisons and fractional DPR changes (${reduced ? 'reduced' : 'normal'} motion)`, async () => {
			await browserPage.viewport(reduced ? 390 : 1440, reduced ? 844 : 900);
			const f = await fixture('image-wake', reduced);
			try {
				const record = f.records[0], original = await f.pixels(record), held = button(f.host, 'Show a held trace');
				await f.action(held, () => userEvent.click(held));
				const marked = await f.pixels(record);
				expect(difference(original, marked).fraction).toBeGreaterThan(0.005);
				expect(record.session!.state.paused).toBe(true);
				const retained = history(await record.model!.inspect()), seconds = record.session!.state.seconds;
				expect(retained.details.packets).toBe(5);
				const still = button(f.host, 'Unchanged source'); await f.action(still, () => userEvent.click(still));
				expect(difference(original, await f.pixels(record), 0).affected).toBe(0);
				const returnTo = button(f.host, 'Return to motion'); await f.action(returnTo, () => userEvent.click(returnTo));
				expect(difference(marked, await f.pixels(record), 0).affected).toBe(0);
				expect(history(await record.model!.inspect())).toEqual(retained);
				f.host.style.width = 'calc(100% - 0.375px)'; await frames(); await f.dpr(3);
				expect(history(await record.model!.inspect())).toEqual(retained);
				expect(record.session!.state.seconds).toBe(seconds); expect(record.loads).toBe(1); expect(record.resets).toBe(0);
				if (reduced) { expect(record.steps).toBe(0); expect(button(f.host, 'Send a sweep').disabled).toBe(true); }
				const reset = button(f.host, 'Reset'); await f.action(reset, () => userEvent.click(reset));
				expect((await record.model!.inspect()).details.packets).toBe(0);
				await f.idle();
			} finally { await f.dispose(); }
		});
	}

	it('image-wake: unavailable GPU preserves the actual native page rather than a misleading blank specimen', async () => {
		await browserPage.viewport(390, 844);
		const f = await fixture('image-wake', true, { ratio: 3, fallback: true });
		try {
			const photo = f.host.querySelector<HTMLImageElement>('.image-wake img')!;
			await vi.waitFor(() => expect(photo.naturalWidth).toBeGreaterThan(1000));
			expect(getComputedStyle(photo).visibility).toBe('visible');
			expect(button(f.host, 'Show a held trace').disabled).toBe(true);
			expect(f.records).toHaveLength(0);
		} finally { await f.dispose(); }
	});
});
