import { mount, unmount, type Component } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page as browserPage, userEvent } from 'vitest/browser';
import { LabSession } from './LabSession.js';
import type { LiquidExperiment, LiquidSnapshot } from './types.js';

const pages = import.meta.glob<{ default: Component }>('../../routes/lab/interfaces/*/+page.svelte');
const routes = ['living-cover', 'capillary-type', 'colorway', 'material-type', 'tactile', 'contours'] as const;
type Route = typeof routes[number];
type Read = {
	buffer: GPUBuffer; width: number; height: number; pitch: number; encoded: boolean; armed: boolean;
	checking?: boolean; accept?: (snapshot: LiquidSnapshot, seconds: number) => boolean;
};
interface Record {
	canvas: HTMLCanvasElement;
	surface: HTMLElement;
	session: LabSession;
	model: LiquidExperiment;
	gpu: GPUDevice;
	read?: Read;
	steps: number;
	renders: number;
	resets: number;
	loads: number;
	submissions: number;
	moveTimes: number[];
	travel: { x: number; y: number; peak: number; active: number };
}
afterEach(() => vi.restoreAllMocks());
const frames = async (count = 3) => {
	for (let i = 0; i < count; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};
function button(host: HTMLElement, text: string) {
	const element = [...host.querySelectorAll('button')].find((item) => (item.getAttribute('aria-label') || item.textContent || '').includes(text));
	if (!element) throw new Error(`Missing native control: ${text}`);
	expect(element.disabled).toBe(false); return element;
}
const click = (host: HTMLElement, text: string) => userEvent.click(button(host, text));
function checkbox(host: HTMLElement, text: string) {
	const input = [...host.querySelectorAll('label')].find((label) => label.textContent?.includes(text))?.querySelector<HTMLInputElement>('input[type=checkbox]');
	if (!input) throw new Error(`Missing native checkbox: ${text}`);
	return input;
}
async function leaveSurface(surface: Element) {
	const outside = surface.closest('main')?.querySelector('header a');
	if (!outside) throw new Error('The real page needs an outside native link for pointer exit.');
	await userEvent.hover(outside, { force: true });
	expect(surface.matches(':hover'), 'The pointer must actually leave the specimen').toBe(false);
}
async function stroke(surface: HTMLElement, from: readonly number[], to: readonly number[], force = true, pauseMs = 0) {
	surface.scrollIntoView({ block: 'center' });
	const bounds = surface.getBoundingClientRect();
	for (let i = 0; i <= 12; i++) {
		await userEvent.hover(surface, { force, position: { x: bounds.width * (from[0] + (to[0] - from[0]) * i / 12), y: bounds.height * (from[1] + (to[1] - from[1]) * i / 12) } });
		if (pauseMs) await new Promise((resolve) => setTimeout(resolve, pauseMs)); else await frames(2);
	}
	// Keep the endpoint inside until the presented stroke is observed. Callers
	// that test exit use a real outside link, never body-center "unhover".
}
function sameOutline(before: Uint8Array, after: Uint8Array) {
	let differences = 0;
	for (let i = 3; i < before.length; i += 4) if (before[i] !== after[i]) differences++;
	expect(differences, 'Material interaction must not deform the default native outline').toBe(0);
}
function samePixels(before: Uint8Array, after: Uint8Array) {
	let differences = 0, maximum = 0;
	for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) { differences++; maximum = Math.max(maximum, Math.abs(before[i] - after[i])); }
	expect({ differences, maximum }, 'Reset must restore the presented finish').toEqual({ differences: 0, maximum: 0 });
}
function materialContrast(before: Uint8Array, after: Uint8Array) {
	let inside = 0, affected = 0, contrast = 0;
	for (let i = 0; i < before.length; i += 4) if (before[i + 3] > 245 && after[i + 3] > 245) {
		inside++;
		const difference = (Math.abs(after[i] - before[i]) + Math.abs(after[i + 1] - before[i + 1]) + Math.abs(after[i + 2] - before[i + 2])) / 3;
		if (difference > 12) { affected++; contrast += difference; }
	}
	expect(affected / inside, 'A local brush needs a clearly visible material mark, not a handful of changed pixels').toBeGreaterThan(0.05);
	expect(contrast / affected).toBeGreaterThan(18);
}
function blueCentroid(pixels: Uint8Array, width: number, region: readonly number[]) {
	const height = pixels.length / 4 / width, blue = navigator.gpu.getPreferredCanvasFormat().startsWith('bgra') ? 0 : 2, red = 2 - blue;
	let sum = 0, x = 0, y = 0;
	for (let row = Math.floor(height * region[1]); row < height * region[3]; row++) for (let column = Math.floor(width * region[0]); column < width * region[2]; column++) {
		const i = (row * width + column) * 4, weight = Math.max(0, pixels[i + blue] - pixels[i + red]);
		sum += weight; x += column / width * weight; y += row / height * weight;
	}
	expect(sum, 'The pointer path must actually start near visible blue pigment').toBeGreaterThan(1000);
	return { x: x / sum, y: y / sum };
}
function state(snapshot: LiquidSnapshot) {
	const presentation = new Set(['width', 'height', 'sourceWidth', 'sourceHeight', 'sourceBytes', 'profileBytes', 'pendingBytes',
		'nativeCoverageBytes', 'pendingCoverageBytes', 'outputBytes', 'resolvedCanvasBytes', 'renders', 'uploads', 'sourceUploads']);
	return { ...snapshot, details: Object.fromEntries(Object.entries(snapshot.details).filter(([key]) => !presentation.has(key))) };
}
function changed(before: Uint8Array, after: Uint8Array) {
	expect(after.length).toBe(before.length);
	let pixels = 0;
	for (let i = 0; i < before.length; i += 4) {
		if (Math.max(Math.abs(before[i] - after[i]), Math.abs(before[i + 1] - after[i + 1]), Math.abs(before[i + 2] - after[i + 2]), Math.abs(before[i + 3] - after[i + 3])) > 2) pixels++;
	}
	expect(pixels, 'The actual presented image must change, not just an inspect counter').toBeGreaterThan(30);
}

async function fixture(route: Route, reduced: boolean, natural = false) {
	let ratio = 2;
	const queries: MediaQueryList[] = [], records: Record[] = [], errors: string[] = [];
	vi.spyOn(window, 'devicePixelRatio', 'get').mockImplementation(() => ratio);
	const realMedia = window.matchMedia.bind(window);
	vi.spyOn(window, 'matchMedia').mockImplementation((source) => {
		const query = realMedia(source);
		if (source.includes('prefers-reduced-motion')) Object.defineProperty(query, 'matches', { value: reduced });
		if (source.startsWith('(resolution:')) queries.push(query);
		return query;
	});
	// Read the real swap chain in the same command submission as presentation.
	// This legal usage addition is test-only; no extra production render target.
	const configure = GPUCanvasContext.prototype.configure;
	vi.spyOn(GPUCanvasContext.prototype, 'configure').mockImplementation(function(this: GPUCanvasContext, options) {
		configure.call(this, { ...options, usage: (options.usage ?? GPUTextureUsage.RENDER_ATTACHMENT) | GPUTextureUsage.COPY_SRC });
	});
	const create = LabSession.create.bind(LabSession);
	vi.spyOn(LabSession, 'create').mockImplementation(async (...args) => {
		const session = await create(...args), canvas = args[0];
		const surface = canvas.closest<HTMLElement>('[data-ready]');
		if (!surface) throw new Error('The actual material needs an explicit readiness surface.');
		const record = { session, canvas, surface, model: undefined!, gpu: undefined!, steps: 0, renders: 0, resets: 0, loads: 0, submissions: 0,
			moveTimes: [] as number[], travel: { x: 0, y: 0, peak: 0, active: 0 } };
		surface.addEventListener('pointermove', (event) => { if (event.isPrimary) record.moveTimes.push(event.timeStamp); });
		records.push(record);
		return session;
	});
	const load = LabSession.prototype.load;
	vi.spyOn(LabSession.prototype, 'load').mockImplementation(async function(this: LabSession, factory) {
		const record = records.find((entry) => entry.session === this)!; record.loads++;
		await load.call(this, async (device, format) => {
			record.gpu = device; device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
			const submit = device.queue.submit.bind(device.queue);
			vi.spyOn(device.queue, 'submit').mockImplementation((commands) => { record.submissions++; submit(commands); });
			const model = record.model = await factory(device, format);
			const render = model.render.bind(model), step = model.step.bind(model), reset = model.reset.bind(model);
			vi.spyOn(model, 'render').mockImplementation((encoder, target) => {
				render(encoder, target); record.renders++;
				const read = record.read;
				if (read?.armed && !read.encoded && !read.checking) {
					encoder.copyTextureToBuffer({ texture: record.canvas.getContext('webgpu')!.getCurrentTexture() },
						{ buffer: read.buffer, bytesPerRow: read.pitch }, [read.width, read.height]);
					if (!read.accept) read.encoded = true;
					else {
						// Foil inspect is CPU-only. Associate its snapshot and time with
						// this encoded frame, never an actionability-delayed later read.
						read.checking = true;
						const seconds = record.session.state.seconds;
						void model.inspect().then((snapshot) => {
							if (record.read === read) read.encoded = read.accept!(snapshot, seconds);
						}).catch((error) => errors.push(String(error))).finally(() => { read.checking = false; });
					}
				}
			});
			vi.spyOn(model, 'step').mockImplementation((encoder, dt, input) => {
				record.steps++;
				if (input.active) { record.travel.x += input.vx * dt; record.travel.y += input.vy * dt; record.travel.peak = Math.max(record.travel.peak, Math.hypot(input.vx, input.vy)); record.travel.active++; }
				step(encoder, dt, input);
			});
			vi.spyOn(model, 'reset').mockImplementation(() => { record.resets++; reset(); });
			return model;
		});
	});
	const loader = pages[`../../routes/lab/interfaces/${route}/+page.svelte`];
	if (!loader) throw new Error(`The promised ${route} route is missing.`);
	const host = document.createElement('div'); host.style.width = natural ? '100%' : '1000.375px'; document.body.append(host);
	const page = mount((await loader()).default, { target: host });
	for (const canvas of natural ? [] : host.querySelectorAll('canvas')) {
		const surface = canvas.closest<HTMLElement>('[data-ready]')!;
		const size = surface.closest<HTMLElement>('.tactile') ?? surface;
		size.style.width = route === 'material-type' ? '900.375px' : route === 'tactile' ? '333.375px' : '600.375px';
		size.style.height = route === 'material-type' ? '400.625px' : '300.625px';
		size.style.minHeight = '0'; surface.style.minHeight = '0';
	}
	if (!natural) host.querySelector('canvas')?.scrollIntoView({ block: 'center' });
	async function until(condition: () => boolean, timeout = 12_000, label = 'Expected route condition') {
		await vi.waitFor(() => {
			expect(errors).toEqual([]);
			for (const record of records) expect(record.session.state.error).toBe('');
			expect(condition(), label).toBe(true);
		}, { timeout, interval: 20 });
	}
	try {
		await until(() => records.length === (route === 'tactile' ? 2 : 1) && records.every((record) => record.model && record.surface.dataset.ready === 'true' && record.renders > 0), 12_000, 'Route must become ready and present its first frame');
		await frames();
	} catch (error) { await unmount(page); host.remove(); throw error; }
	async function capture(record: Record, options: { trigger?: () => Promise<void>; passive?: boolean; after?: { target: EventTarget; type: string }; accept?: Read['accept'] } = {}) {
		const width = record.canvas.width, height = record.canvas.height, pitch = Math.ceil(width * 4 / 256) * 256;
		const read: Read = { width, height, pitch, encoded: false, armed: !options.after, accept: options.accept,
			buffer: record.gpu.createBuffer({ size: pitch * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }) };
		const arm = () => { read.armed = true; };
		options.after?.target.addEventListener(options.after.type, arm, { once: true });
		record.read = read;
		try {
			if (options.trigger) await options.trigger(); else if (!options.passive) record.session.invalidate();
			await until(() => read.encoded, 12_000, 'Native presentation must encode an accepted readback frame');
			await read.buffer.mapAsync(GPUMapMode.READ);
			const raw = new Uint8Array(read.buffer.getMappedRange()), pixels = new Uint8Array(width * height * 4);
			for (let y = 0; y < height; y++) pixels.set(raw.subarray(y * pitch, y * pitch + width * 4), y * width * 4);
			return pixels;
		} finally { options.after?.target.removeEventListener(options.after.type, arm); record.read = undefined; read.buffer.destroy(); }
	}
	return { route, host, records, errors, until, capture,
		setDpr(next: number) {
			const previous = ratio; ratio = next;
			for (const query of [...queries].filter((query) => query.media === `(resolution: ${previous}dppx)`)) query.dispatchEvent(new Event('change'));
		},
		async idle() {
			await until(() => records.every((record) => record.session.state.paused), 12_000, 'All route sessions must enter idle');
			// Pigment pages publish one deferred diagnostic after settling. It is
			// bounded work, not an idle loop; wait for that explicit readout too.
			if (route === 'capillary-type' || route === 'colorway') await new Promise((resolve) => setTimeout(resolve, 500));
			await frames(4); await Promise.all(records.map((record) => record.gpu.queue.onSubmittedWorkDone()));
			const submissions = records.map((record) => record.submissions);
			await frames(10); expect(records.map((record) => record.submissions)).toEqual(submissions);
		},
		async dispose() {
			try { await Promise.all(records.map((record) => record.gpu.queue.onSubmittedWorkDone())); }
			finally { await unmount(page); host.remove(); }
		}
	};
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const clickCapture = (f: Fixture, record: Record, label: string) => {
	const target = button(f.host, label);
	return f.capture(record, { after: { target, type: 'click' }, trigger: () => userEvent.click(target) });
};
async function conceal(f: Fixture, record: Record) {
	await click(f.host, 'Directed reveal'); await click(f.host, 'Hide photograph');
	record.canvas.scrollIntoView({ block: 'center' });
	await vi.waitFor(async () => expect((await record.model.inspect()).details.reveal).toBeLessThan(0.001), { timeout: 5000, interval: 20 });
}
async function control(f: Fixture, record: Record) {
	if (f.route === 'living-cover') {
		await click(f.host, 'Reveal photograph');
		// Native controls may scroll the image offscreen; observe its resumed
		// visible transition, not the deliberately suspended or pre-front frame.
		record.canvas.scrollIntoView({ block: 'center' });
		await vi.waitFor(async () => expect((await record.model.inspect()).details.reveal).toBeGreaterThan(0.2), { timeout: 5000, interval: 20 });
	}
	else if (f.route === 'capillary-type' || f.route === 'colorway') await click(f.host, 'Pour Vermilion');
	else if (f.route === 'material-type') {
		const brushes = (await record.model.inspect()).details.brushCount;
		await click(f.host, 'Brush the word');
		await vi.waitFor(async () => {
			expect((await record.model.inspect()).details.brushCount).toBeGreaterThan(brushes);
			expect(record.surface.dataset.sleeping).toBe('true');
		}, { timeout: 5000, interval: 20 });
	}
	else if (f.route === 'contours') await click(f.host, 'Pulse the loop');
	else {
		const tactile = record.surface.closest<HTMLElement>('.tactile')!;
		await userEvent.click(tactile.querySelector('button')!);
	}
}

describe('research effect pages, actual presentation and native interaction', () => {
	for (const reduced of [false, true]) {
		it(`first selection of Directed reveal presents the photograph without a second action (${reduced ? 'reduced' : 'normal'} motion)`, async () => {
			const viewport = [innerWidth, innerHeight] as const;
			await browserPage.viewport(1440, 900);
			const f = await fixture('living-cover', reduced, true);
			try {
				const record = f.records[0], select = button(f.host, 'Directed reveal');
				expect(select.getBoundingClientRect().bottom).toBeLessThan(innerHeight);
				expect(record.canvas.style.width).toBe('');
				let pixels: Uint8Array;
				if (reduced) pixels = await clickCapture(f, record, 'Directed reveal');
				else {
					await userEvent.click(select);
					await vi.waitFor(async () => expect((await record.model.inspect()).details.reveal).toBeGreaterThan(0.2), { timeout: 5000, interval: 20 });
					// This observes an already-running native transition. No explicit
					// invalidate, pause, model setter or second control rescues it.
					pixels = await f.capture(record, { passive: true });
				}
				const bounds = record.canvas.getBoundingClientRect();
				expect(getComputedStyle(record.canvas).visibility).toBe('visible');
				expect((Math.min(innerHeight, bounds.bottom) - Math.max(0, bounds.top)) / bounds.height,
					'The native first selection must leave the image substantially in view').toBeGreaterThan(0.4);
				let min = 255, max = 0, opaque = 0;
				for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 200) {
					const luminance = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
					min = Math.min(min, luminance); max = Math.max(max, luminance); opaque++;
				}
				expect(opaque).toBeGreaterThan(1000);
				if (!reduced) expect(opaque / (pixels.length / 4), 'Observe a real partial reveal, not an instant final image').toBeLessThan(0.95);
				expect(max - min, 'The first selection must show photographic detail, not a flat placeholder').toBeGreaterThan(40);
				await vi.waitFor(async () => expect((await record.model.inspect()).details.reveal).toBeGreaterThan(0.99), { timeout: 8000, interval: 30 });
				expect((await record.model.inspect()).finite).toBe(true);
				if (reduced) expect(record.steps).toBe(0);
				await f.idle();
			} finally { await f.dispose(); await browserPage.viewport(...viewport); }
		});
	}

	it('normal pointer brushing changes velvet material while its default native outline remains fixed', async () => {
		const f = await fixture('material-type', false);
		try {
			const record = f.records[0], before = await f.capture(record);
			expect(checkbox(f.host, 'Let the word bend').checked).toBe(false);
			await stroke(record.surface, [0.25, 0.5], [0.75, 0.5]);
			const brushed = await f.capture(record, { passive: true }), snapshot = await record.model.inspect();
			sameOutline(before, brushed); materialContrast(before, brushed);
			expect(snapshot.details.changedCells).toBeGreaterThan(0); expect(snapshot.max).toBe(0);
			expect(snapshot.details.geometryMotion).toBe(0);
			samePixels(before, await clickCapture(f, record, 'Reset material'));
			await userEvent.click(checkbox(f.host, 'Let the word bend')); await click(f.host, 'Brush the word');
			await vi.waitFor(async () => expect((await record.model.inspect()).max).toBeGreaterThan(0.001), { timeout: 3000 });
			expect((await record.model.inspect()).details.geometryMotion).toBe(1);
			changed(before, await f.capture(record, { passive: true })); await f.idle();
		} finally { await f.dispose(); }
	});

	for (const finish of ['Velvet nap', 'Polished glaze']) {
		it(`${finish}: deliberate 150ms pointer samples leave a visible fixed-outline mark without phantom reentry`, async () => {
			const f = await fixture('material-type', false);
			try {
				const record = f.records[0]; await click(f.host, finish);
				const before = await clickCapture(f, record, 'Reset material');
				await stroke(record.surface, [0.25, 0.5], [0.75, 0.5], true, 150);
				const after = await f.capture(record, { passive: true }); sameOutline(before, after); materialContrast(before, after);
				const marked = await record.model.inspect();
				expect(marked.details[finish === 'Velvet nap' ? 'changedCells' : 'polishSum']).toBeGreaterThan(0);
				expect(marked.max).toBe(0); await leaveSurface(record.surface); await f.idle();
				const previous = await record.model.inspect(), bounds = record.surface.getBoundingClientRect();
				await userEvent.hover(record.surface, { force: true, position: { x: bounds.width * 0.15, y: bounds.height * 0.8 } }); await frames(3);
				const entered = await record.model.inspect();
				expect([entered.details.checksum, entered.details.polishSum]).toEqual([previous.details.checksum, previous.details.polishSum]);
				await leaveSurface(record.surface); await f.idle();
			} finally { await f.dispose(); }
		});
	}

	it('polishing visibly changes the glaze reflection, survives lighting, and reset restores its finish', async () => {
		const f = await fixture('material-type', true);
		try {
			const record = f.records[0];
			const frosted = await clickCapture(f, record, 'Polished glaze'), initial = await record.model.inspect();
			const polished = await clickCapture(f, record, 'Brush the word');
			sameOutline(frosted, polished); materialContrast(frosted, polished);
			const history = await record.model.inspect(); expect(history.details.polishSum).toBeGreaterThan(0);
			expect(history.details.checksum).toBe(initial.details.checksum);
			samePixels(frosted, await clickCapture(f, record, 'Reset material'));
			expect((await record.model.inspect()).details.polishSum).toBe(0);
			const repeated = await clickCapture(f, record, 'Brush the word');
			const light = f.host.querySelector<HTMLInputElement>('input[type=range]')!;
			const relit = await f.capture(record, { after: { target: light, type: 'input' }, trigger: async () => { light.value = '123'; light.dispatchEvent(new Event('input', { bubbles: true })); } });
			sameOutline(repeated, relit); changed(repeated, relit);
			const final = await record.model.inspect(); expect(final.details.light).toBeCloseTo(123 * Math.PI / 180, 5);
			expect(final.details.polishSum).toBe(history.details.polishSum); expect(record.steps).toBe(0);
			await f.idle();
		} finally { await f.dispose(); }
	});

	it('a native foil activation visibly reaches its selected well within a short response', async () => {
		const f = await fixture('tactile', false);
		try {
			const record = f.records.find((item) => item.surface.closest<HTMLElement>('.tactile')?.dataset.kind === 'foil')!;
			const foil = button(f.host, 'Flip the foil'), before = await f.capture(record);
			let start = Infinity, reached = Infinity;
			foil.addEventListener('click', () => { start = record.session.state.seconds; }, { once: true });
			const after = await f.capture(record, {
				after: { target: foil, type: 'click' }, trigger: () => userEvent.click(foil),
				accept(snapshot, seconds) {
					if (snapshot.details.selected !== 1 || snapshot.details.amplitude >= -0.95) return false;
					reached = seconds; return true;
				}
			});
			expect(foil.getAttribute('aria-pressed')).toBe('true');
			expect(reached - start, 'The naturally presented selected well should arrive within a short response').toBeLessThan(0.4);
			changed(before, after); await leaveSurface(foil); await f.idle();
		} finally { await f.dispose(); }
	});

	it('the small contour pulse is visibly local and remains proportionate to the dot', async () => {
		const f = await fixture('contours', true);
		try {
			const record = f.records[0], before = await f.capture(record);
			const after = await clickCapture(f, record, 'Pulse the dot'); changed(before, after);
			let changedPixels = 0;
			for (let i = 0; i < before.length; i += 4) if (Math.max(...[0, 1, 2, 3].map((channel) => Math.abs(before[i + channel] - after[i + channel]))) > 2) changedPixels++;
			expect(changedPixels / (before.length / 4)).toBeLessThan(0.08);
			for (let i = 0; i < 5; i++) await click(f.host, 'Pulse the dot');
			const details = (await record.model.inspect()).details;
			expect(details.relativeEnvelope1).toBeGreaterThan(0); expect(details.relativeEnvelope1).toBeLessThanOrEqual(0.100001);
			expect(details.relativeEnvelope0).toBe(0); expect(record.steps).toBe(0); await f.idle();
		} finally { await f.dispose(); }
	});

	for (const route of ['capillary-type', 'colorway'] as const) {
		it(`${route}: a normal local pointer sweep visibly transports nearby existing pigment without a pour`, async () => {
			const f = await fixture(route, false);
			try {
				const record = f.records[0], before = await f.capture(record), snapshot = await record.model.inspect();
				const region = route === 'colorway' ? [0.3, 0.25, 0.75, 0.75] : [0.26, 0.1, 0.47, 0.75];
				const first = blueCentroid(before, record.canvas.width, region);
				if (route === 'colorway') await stroke(record.surface, [0.44, 0.5], [0.6, 0.5], false);
				else await stroke(record.surface, [0.36, 0.5], [0.36, 0.3], false);
				const after = await f.capture(record, { passive: true }), second = blueCentroid(after, record.canvas.width, region);
				sameOutline(before, after); changed(before, after);
				const gaps = record.moveTimes.slice(1).map((time, i) => time - record.moveTimes[i]);
				const delivery = JSON.stringify({ travel: record.travel, gaps, centroid: { first, second } });
				console.info('Pointer transport', route, { maxEventGapMs: Math.max(...gaps), integratedVelocity: record.travel,
					centroidShift: { x: second.x - first.x, y: second.y - first.y } });
				expect(record.travel.peak, delivery).toBeGreaterThan(0.05);
				if (route === 'colorway') expect(second.x - first.x, delivery).toBeGreaterThan(0.012);
				else expect(first.y - second.y, delivery).toBeGreaterThan(0.015);
				const moved = await record.model.inspect(); expect(moved.details.pours).toBe(snapshot.details.pours);
				expect(moved.initialMass).toBe(snapshot.initialMass); expect(moved.mass).toBeCloseTo(snapshot.mass, 2);
				await leaveSurface(record.surface); await f.idle();
			} finally { await f.dispose(); }
		});
	}

	it('deliberate in-host pigment movement survives force release and settled idle without a stale reentry impulse', async () => {
		const f = await fixture('colorway', false);
		try {
			const record = f.records[0], bounds = record.surface.getBoundingClientRect();
			const move = (x: number) => userEvent.hover(record.surface, { force: true, position: { x: bounds.width * x, y: bounds.height * 0.5 } });
			await move(0.44); await frames(3);
			for (const x of [0.46, 0.48, 0.5]) { await new Promise((resolve) => setTimeout(resolve, 120)); await move(x); }
			await frames(3); expect(record.travel.x).toBeGreaterThan(0.025);
			await f.idle(); const before = await f.capture(record), travel = record.travel.x;
			await move(0.53); const after = await f.capture(record, { passive: true });
			changed(before, after); expect(record.travel.x - travel).toBeGreaterThan(0.015);
			await leaveSurface(record.surface); await frames(3);
			const released = { ...record.travel };
			await move(0.82); await frames(3);
			expect(record.travel.x).toBe(released.x); expect(record.travel.y).toBe(released.y);
			await leaveSurface(record.surface); await f.idle();
		} finally { await f.dispose(); }
	});

	it('tactile CSS baseline keeps native commitment without hidden GPU work, then synchronizes once', async () => {
		const f = await fixture('tactile', false);
		try {
			const record = f.records.find((item) => item.surface.closest<HTMLElement>('.tactile')?.dataset.kind === 'foil')!;
			const foil = button(f.host, 'Flip the foil'), baseline = f.host.querySelector<HTMLInputElement>('input[type=checkbox]')!;
			await userEvent.click(baseline); await frames(6);
			const counts = f.records.map((item) => item.submissions);
			await userEvent.hover(foil); await userEvent.click(foil);
			expect(foil.getAttribute('aria-pressed')).toBe('true');
			await frames(8); expect(f.records.map((item) => item.submissions)).toEqual(counts);
			await userEvent.click(baseline);
			await f.until(() => record.submissions > counts[f.records.indexOf(record)]);
			expect((await record.model.inspect()).details.selected).toBe(1);
			await f.idle();
		} finally { await f.dispose(); }
	});

	it('material typography releases a hidden transient load without erasing its persistent nap', async () => {
		const f = await fixture('material-type', false);
		let hidden = false;
		vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
		try {
			const record = f.records[0]; await userEvent.click(checkbox(f.host, 'Let the word bend')); await click(f.host, 'Brush the word');
			await vi.waitFor(async () => expect((await record.model.inspect()).max).toBeGreaterThan(0.001), { timeout: 4000 });
			const before = await record.model.inspect(); hidden = true; document.dispatchEvent(new Event('visibilitychange'));
			const interrupted = await record.model.inspect();
			expect(interrupted.max).toBe(0); expect(interrupted.details.checksum).toBe(before.details.checksum);
			expect(record.session.state.paused).toBe(true);
			hidden = false; document.dispatchEvent(new Event('visibilitychange')); await frames(6);
			expect((await record.model.inspect()).max).toBe(0); await f.idle();
		} finally { hidden = false; await f.dispose(); }
	});

	it('a reveal requested while an already sleeping cover is hidden completes when it returns', async () => {
		const f = await fixture('living-cover', false);
		let hidden = false;
		vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
		try {
			const record = f.records[0]; await conceal(f, record);
			await f.idle(); const before = await f.capture(record);
			hidden = true; document.dispatchEvent(new Event('visibilitychange'));
			await click(f.host, 'Reveal photograph'); await frames(3);
			expect(record.session.state.paused).toBe(true);
			hidden = false; document.dispatchEvent(new Event('visibilitychange'));
			await vi.waitFor(async () => expect((await record.model.inspect()).details.reveal).toBeGreaterThan(0.99), { timeout: 8000, interval: 30 });
			changed(before, await f.capture(record)); await f.idle();
		} finally { hidden = false; await f.dispose(); }
	});

	for (const route of routes) {
		it(`${route}: live controls visibly change the canvas and return to idle`, async () => {
			const f = await fixture(route, false);
			try {
				for (const record of f.records) {
					record.canvas.scrollIntoView({ block: 'center' }); await frames();
					expect(record.canvas.classList.contains('unavailable')).toBe(false);
					const bounds = record.canvas.getBoundingClientRect();
					expect([record.canvas.width, record.canvas.height]).toEqual([Math.round(bounds.width * 2), Math.round(bounds.height * 2)]);
					if (route === 'living-cover') await conceal(f, record);
					const before = await f.capture(record); await control(f, record);
					changed(before, await f.capture(record));
				}
				// Use the browser provider's real pointer path through the native hit
				// target; no direct model calls stand in for interaction wiring.
				const record = f.records[0], hit = record.surface.closest('.tactile')?.querySelector('button') ?? record.surface;
				hit.scrollIntoView({ block: 'center' });
				const before = record.steps, bounds = hit.getBoundingClientRect();
				await userEvent.hover(hit, { force: true, position: { x: bounds.width * 0.3, y: bounds.height * 0.45 } }); await frames(2);
				await userEvent.hover(hit, { force: true, position: { x: bounds.width * 0.65, y: bounds.height * 0.55 } }); await frames(2);
				await vi.waitFor(() => expect(record.steps, `Actual pointer movement: ${JSON.stringify({ before, paused: record.session.state.paused, moves: record.moveTimes })}`).toBeGreaterThan(before), { timeout: 5000 });
				await leaveSurface(hit);
				await f.idle(); expect(f.errors).toEqual([]);
			} finally { await f.dispose(); }
		});

		it(`${route}: still controls work at reduced motion and disturbed state survives native DPR refresh`, async () => {
			const f = await fixture(route, true);
			try {
				for (const record of f.records) {
					expect(record.surface.dataset.reduced).toBe('true');
					if (route === 'living-cover') await conceal(f, record);
					const before = await f.capture(record); await control(f, record);
					changed(before, await f.capture(record));
					if (route === 'living-cover') {
						const revealed = await f.capture(record);
						await click(f.host, 'Wet aperture'); const aperture = await f.capture(record);
						changed(revealed, aperture); expect((await record.model.inspect()).details.variant).toBe(1);
						await click(f.host, 'Native grid'); changed(aperture, await f.capture(record));
						expect((await record.model.inspect()).details.diagnostic).toBe(1);
						await click(f.host, 'Native grid');
						expect((await record.model.inspect()).details.variant).toBe(1);
					}
					if (route === 'tactile' && record.surface.closest<HTMLElement>('.tactile')?.dataset.kind === 'foil') {
						const foil = button(f.host, 'Flip the foil'), committed = await f.capture(record);
						await userEvent.keyboard('{Enter}'); expect(foil.getAttribute('aria-pressed')).toBe('false');
						const raised = await f.capture(record); changed(committed, raised);
						await userEvent.keyboard(' '); expect(foil.getAttribute('aria-pressed')).toBe('true');
						changed(raised, await f.capture(record));
					}
					if (route === 'material-type') {
						const velvet = await f.capture(record), history = (await record.model.inspect()).details.checksum;
						await click(f.host, 'Polished glaze'); const enamel = await f.capture(record);
						changed(velvet, enamel); expect((await record.model.inspect()).details.finish).toBe(1);
						// A label/aria update cannot pass this actual green-channel test.
						let greenGain = 0;
						for (let i = 1; i < enamel.length; i += 4) greenGain += enamel[i] - velvet[i];
						expect(greenGain).toBeGreaterThan(1000);
						const light = f.host.querySelector<HTMLInputElement>('input[type=range]')!;
						light.value = '123'; light.dispatchEvent(new Event('input', { bubbles: true })); await frames();
						expect((await record.model.inspect()).details.light).toBeCloseTo(123 * Math.PI / 180, 5);
						const baseline = f.host.querySelector<HTMLInputElement>('input[type=checkbox]')!;
						await userEvent.click(baseline); await frames();
						expect((await record.model.inspect()).details.baseline).toBe(1);
						await userEvent.click(baseline); await frames();
						expect((await record.model.inspect()).details.baseline).toBe(0);
						expect((await record.model.inspect()).details.checksum).toBe(history);
					}
					expect(record.steps).toBe(0); expect(record.session.state.paused).toBe(true);
				}
				const before = await Promise.all(f.records.map(async (record) => ({ state: state(await record.model.inspect()), loads: record.loads, resets: record.resets, seconds: record.session.state.seconds })));
				f.setDpr(3);
				await f.until(() => f.records.every((record) => {
					const bounds = record.canvas.getBoundingClientRect();
					return record.canvas.width === Math.round(bounds.width * 3) && record.canvas.height === Math.round(bounds.height * 3);
				}));
				for (const [index, record] of f.records.entries()) {
					if (route === 'material-type' || route === 'capillary-type' || route === 'colorway') {
						await vi.waitFor(async () => {
							const details = (await record.model.inspect()).details;
							if (route === 'material-type') expect([details.sourceWidth, details.sourceHeight]).toEqual([record.canvas.width, record.canvas.height]);
							else expect(details.nativeCoverageBytes).toBe(record.canvas.width * record.canvas.height);
						}, { timeout: 5000, interval: 30 });
					}
					await f.capture(record);
					await vi.waitFor(async () => expect(state(await record.model.inspect())).toEqual(before[index].state), { timeout: 5000, interval: 30 });
					expect([record.loads, record.resets, record.session.state.seconds]).toEqual([before[index].loads, before[index].resets, before[index].seconds]);
					expect(record.steps).toBe(0);
				}
				await f.idle(); expect(f.errors).toEqual([]);
			} finally { await f.dispose(); }
		});

		it(`${route}: missing ordinary WebGPU leaves explicit fallback and native content`, async () => {
			vi.spyOn(navigator.gpu, 'requestAdapter').mockResolvedValue(null);
			const loader = pages[`../../routes/lab/interfaces/${route}/+page.svelte`];
			if (!loader) throw new Error(`Missing promised route ${route}`);
			const host = document.createElement('div'); document.body.append(host);
			const page = mount((await loader()).default, { target: host });
			try {
				await vi.waitFor(() => expect(host.textContent).toContain('No WebGPU adapter'), { timeout: 5000 });
				expect(host.querySelector('h1')?.textContent?.trim().length).toBeGreaterThan(0);
				for (const canvas of host.querySelectorAll('canvas')) expect(getComputedStyle(canvas).visibility).toBe('hidden');
				if (route === 'tactile') {
					const foil = button(host, 'Flip the foil'); const selected = foil.getAttribute('aria-pressed');
					await userEvent.click(foil); await frames(); expect(foil.getAttribute('aria-pressed')).not.toBe(selected);
				}
			} finally { await unmount(page); host.remove(); }
		});
	}
});
