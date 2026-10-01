import { mount, unmount, type Component } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Ink from '../../routes/lab/interfaces/ink/+page.svelte';
import Foil from '../../routes/lab/interfaces/foil/+page.svelte';
import Bridges from '../../routes/lab/interfaces/bridges/+page.svelte';
import Velvet from '../../routes/lab/interfaces/velvet/+page.svelte';
import Glass from '../../routes/lab/interfaces/glass/+page.svelte';
import Crazing from '../../routes/lab/interfaces/crazing/+page.svelte';
import { LabSession } from './LabSession.js';
import type { LiquidExperiment, LiquidSnapshot } from './types.js';

afterEach(() => vi.restoreAllMocks());

const frames = async (count = 3) => {
	for (let i = 0; i < count; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};

function click(host: HTMLElement, text: string) {
	const button = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes(text));
	expect(button, `The actual route needs its advertised “${text}” control`).toBeDefined();
	if (!button) throw new Error(`Missing ${text} button`);
	expect(button.disabled).toBe(false); button.click();
}

function slide(host: HTMLElement, index: number, value: number) {
	const input = host.querySelectorAll<HTMLInputElement>('input[type=range]')[index];
	expect(input).toBeDefined(); expect(input.disabled).toBe(false);
	input.value = String(value); input.dispatchEvent(new Event('input', { bubbles: true }));
}

const routes: Array<{ name: string; component: Component; hover?: false; control(host: HTMLElement): void;
	changed(snapshot: LiquidSnapshot): boolean }> = [
	{ name: 'ink', component: Ink, control: (host) => click(host, '8 passes'), changed: (s) => s.details.operations === 8 },
	{ name: 'foil', component: Foil, control: (host) => click(host, 'Turn down'), changed: (s) => s.details.amplitude < -0.5 },
	{ name: 'bridges', component: Bridges, hover: false, control: (host) => click(host, 'Pull apart'), changed: (s) => s.details.gap > 1.3 && s.details.joined === 0 },
	{ name: 'velvet', component: Velvet, control: (host) => click(host, 'Brush a ribbon'), changed: (s) => s.details.changedCells > 0 },
	{ name: 'glass', component: Glass, control: (host) => slide(host, 0, 0.82), changed: (s) => Math.abs(s.details.pressure - 0.82) < 0.001 },
	{ name: 'crazing', component: Crazing, control: (host) => click(host, 'Add a fracture'), changed: (s) => s.details.seeds > 1 }
];

function materialState(snapshot: LiquidSnapshot) {
	const presentation = new Set(['width', 'height', 'renders', 'uploads', 'outputBytes', 'resolvedCanvasBytes']);
	return { ...snapshot, details: Object.fromEntries(Object.entries(snapshot.details).filter(([key]) => !presentation.has(key))) };
}

async function fixture(component: Component, reduced: boolean) {
	let ratio = 2;
	vi.spyOn(window, 'devicePixelRatio', 'get').mockImplementation(() => ratio);
	const realMedia = window.matchMedia.bind(window), queries: MediaQueryList[] = [];
	vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
		const result = realMedia(query);
		if (query.includes('prefers-reduced-motion')) Object.defineProperty(result, 'matches', { value: reduced });
		if (query.startsWith('(resolution:')) queries.push(result);
		return result;
	});
	let session!: LabSession, model!: LiquidExperiment, gpu!: GPUDevice;
	const counts = { steps: 0, renders: 0, resets: 0, loads: 0, submissions: 0 };
	const errors: string[] = [];
	const load = LabSession.prototype.load;
	vi.spyOn(LabSession.prototype, 'load').mockImplementation(async function(this: LabSession, factory) {
		session = this; counts.loads++;
		await load.call(this, async (device, format) => {
			gpu = device;
			device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
			const submit = device.queue.submit.bind(device.queue);
			vi.spyOn(device.queue, 'submit').mockImplementation((commands) => { counts.submissions++; submit(commands); });
			model = await factory(device, format);
			const step = model.step.bind(model), render = model.render.bind(model), reset = model.reset.bind(model);
			vi.spyOn(model, 'step').mockImplementation((encoder, dt, input) => { counts.steps++; step(encoder, dt, input); });
			vi.spyOn(model, 'render').mockImplementation((encoder, target) => { counts.renders++; render(encoder, target); });
			vi.spyOn(model, 'reset').mockImplementation(() => { counts.resets++; reset(); });
			return model;
		});
	});
	const host = document.createElement('div'); host.style.width = '640.375px'; document.body.append(host);
	const page = mount(component, { target: host });
	const mountedSurface = host.querySelector<HTMLElement>('.material');
	if (!mountedSurface) { await unmount(page); host.remove(); throw new Error('The route did not mount its material surface.'); }
	const surface: HTMLElement = mountedSurface;
	// Fractional layout is intentional; retain the real page and its controls.
	// This is a wiring test, not a screenshot/performance measurement.
	surface.style.width = '480.375px'; surface.style.height = '280.625px'; surface.style.minHeight = '0';
	surface.scrollIntoView({ block: 'center' });
	const canvas = surface.querySelector('canvas')!;
	async function until(condition: () => boolean, timeout = 10_000) {
		await vi.waitFor(() => {
			expect(surface.querySelector('[role=status]')?.textContent).not.toContain('unavailable');
			expect(session?.state.error ?? '').toBe(''); expect(errors).toEqual([]);
			expect(condition()).toBe(true);
		}, { timeout, interval: 20 });
	}
	try { await until(() => surface.dataset.ready === 'true' && counts.renders > 0); await frames(); }
	catch (error) { await unmount(page); host.remove(); throw error; }
	return { host, surface, canvas, counts, errors, session, model, gpu, until,
		setDpr(value: number) { ratio = value; queries.at(-1)!.dispatchEvent(new Event('change')); },
		async dispose() {
			try { await gpu.queue.onSubmittedWorkDone(); }
			finally { await unmount(page); host.remove(); }
		}
	};
}

describe('the seven actual material-study routes', () => {
	for (const route of routes) {
		it(`${route.name}: native controls, hover, retained state, and no settled GPU loop`, async () => {
			const f = await fixture(route.component, false);
			try {
				expect(f.surface.dataset.reduced).toBe('false');
				expect(f.surface.dataset.sleeping).toBe('true');
				expect(f.counts.steps).toBe(0);
				expect([f.canvas.width, f.canvas.height]).toEqual([961, 561]);
				expect(getComputedStyle(f.surface).userSelect).toBe('none');
				const initialRenders = f.counts.renders;
				route.control(f.host);
				await f.until(() => f.counts.renders > initialRenders);
				await vi.waitFor(async () => expect(route.changed(await f.model.inspect())).toBe(true), { timeout: 5000, interval: 30 });
				if (route.name === 'velvet' || route.name === 'crazing') {
					const history = (await f.model.inspect()).details.checksum;
					slide(f.host, 0, 123); await frames();
					const lit = await f.model.inspect();
					expect(lit.details.light, 'The first input event must use its current value, not the previous Svelte binding').toBeCloseTo(123 * Math.PI / 180, 5);
					expect(lit.details.checksum).toBe(history);
				}
				// Real page event wiring, no click/capture: both points have buttons=0.
				const beforeHover = f.counts.steps, bounds = f.surface.getBoundingClientRect();
				for (const [x, y] of [[0.22, 0.3], [0.76, 0.7]]) {
					const clientX = bounds.left + bounds.width * x, clientY = bounds.top + bounds.height * y;
					const target = document.elementFromPoint(clientX, clientY)!;
					expect(target).not.toBeNull();
					if (route.hover === false) expect(f.surface.contains(target), 'Bridge hover must not secretly override its authoritative separation control').toBe(false);
					target.dispatchEvent(new PointerEvent('pointermove', { isPrimary: true, pointerType: 'mouse', buttons: 0, bubbles: true, clientX, clientY }));
					await frames(2);
				}
				f.surface.dispatchEvent(new PointerEvent('pointerleave', { isPrimary: true, pointerType: 'mouse' }));
				if (route.hover !== false) await f.until(() => f.counts.steps > beforeHover);
				await f.until(() => f.surface.dataset.sleeping === 'true', 6000);
				expect(f.session.state.paused).toBe(true);
				const state = materialState(await f.model.inspect()), seconds = f.session.state.seconds;
				if (route.hover === false) expect(state.details.gap).toBeCloseTo(1.5, 5);
				expect(state.finite).toBe(true);
				for (const change of [() => f.setDpr(3), () => { f.surface.style.width = '480.625px'; }]) {
					const rendered = f.counts.renders; change();
					await f.until(() => f.counts.renders > rendered);
					const actual = f.canvas.getBoundingClientRect();
					expect([f.canvas.width, f.canvas.height]).toEqual([Math.round(actual.width * 3), Math.round(actual.height * 3)]);
					expect(materialState(await f.model.inspect())).toEqual(state);
					expect(f.session.state.seconds).toBe(seconds); expect(f.session.state.paused).toBe(true);
				}
				expect([f.canvas.width, f.canvas.height]).toEqual([1442, 842]);
				expect(f.counts.loads).toBe(1); expect(f.counts.resets).toBe(0);
				await frames(); await f.gpu.queue.onSubmittedWorkDone();
				const idle = { ...f.counts }; await frames(8);
				expect(f.counts, 'A settled material must not keep submitting invisible GPU work').toEqual(idle);
				expect(f.errors).toEqual([]);
			} finally { await f.dispose(); }
		});

		it(`${route.name}: reduced motion retains useful static controls without simulation`, async () => {
			const f = await fixture(route.component, true);
			try {
				expect(f.surface.dataset.reduced).toBe('true');
				const rendered = f.counts.renders; route.control(f.host);
				await f.until(() => f.counts.renders > rendered);
				expect(route.changed(await f.model.inspect())).toBe(true);
				if (route.name === 'velvet' || route.name === 'crazing') {
					slide(f.host, 0, 123); await frames();
					expect((await f.model.inspect()).details.light).toBeCloseTo(123 * Math.PI / 180, 5);
				}
				const state = materialState(await f.model.inspect()), bounds = f.surface.getBoundingClientRect();
				f.surface.dispatchEvent(new PointerEvent('pointermove', { isPrimary: true, pointerType: 'mouse',
					clientX: bounds.left + bounds.width * 0.6, clientY: bounds.top + bounds.height * 0.4 }));
				await frames();
				expect(materialState(await f.model.inspect())).toEqual(state);
				expect(f.counts.steps).toBe(0); expect(f.session.state.seconds).toBe(0);
				expect(f.surface.dataset.sleeping).toBe('true');
				await frames(); await f.gpu.queue.onSubmittedWorkDone();
				const idle = { ...f.counts }; await frames(8); expect(f.counts).toEqual(idle);
				expect(f.errors).toEqual([]);
			} finally { await f.dispose(); }
		});
	}
});
