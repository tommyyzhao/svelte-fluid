import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import FrostType from './FrostType.svelte';
import { createFrostPhase, type FrostPhaseExperiment } from './frost-phase.js';
import { FROST_SIZE, FROST_WARM, frostTotals } from './frost-phase-model.js';
import { rasterFrostType } from './frost-type-source.js';
import type { LiquidInput } from './types.js';

let device: GPUDevice;
beforeAll(async () => { const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull(); device = await adapter!.requestDevice(); });
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => { try { await device.queue.onSubmittedWorkDone(); expect(await device.popErrorScope()).toBeNull(); } finally { vi.restoreAllMocks(); } });
afterAll(() => device?.destroy());
const idle: LiquidInput = { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, tilt: 0 };
const frames = async () => { for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); };

function specimen() {
	const host = document.createElement('div'); host.style.cssText = 'position:relative;width:300.25px;height:300.25px;container-type:inline-size';
	const heading = document.createElement('h2'); heading.style.cssText = 'position:absolute;left:8%;right:8%;top:25%;margin:0;font:900 25cqw/.88 "Arial Black",Arial,sans-serif;letter-spacing:-.075em';
	for (const text of ['Cold', 'type.']) { const line = document.createElement('span'); line.dataset.frostLine = ''; line.textContent = text; line.style.display = 'block'; heading.append(line); }
	host.append(heading); document.body.append(host); return { host, heading };
}
async function evolve(model: FrostPhaseExperiment, seconds: number, input = idle) {
	const count = Math.round(seconds * 120);
	for (let start = 0; start < count; start += 120) {
		const encoder = device.createCommandEncoder();
		for (let i = start; i < Math.min(count, start + 120); i++) model.step(encoder, 1 / 120, input);
		device.queue.submit([encoder.finish()]);
	}
	await device.queue.onSubmittedWorkDone();
}
function stillMotion() {
	const original = window.matchMedia.bind(window);
	vi.spyOn(window, 'matchMedia').mockImplementation((query) => { const media = original(query); if (query.includes('prefers-reduced-motion')) Object.defineProperty(media, 'matches', { value: true }); return media; });
}
function controls(host: HTMLElement) {
	return (name: string) => { const button = [...host.querySelectorAll('button')].find(item => item.textContent === name); expect(button, name).toBeDefined(); return button!; };
}

describe('native content-nucleated frost', () => {
	it('samples actual fractional-size glyphs at 2× / 3× without changing the independent grid', () => {
		const { host, heading } = specimen(); const dpr = vi.spyOn(window, 'devicePixelRatio', 'get');
		try {
			for (const ratio of [2, 3]) {
				dpr.mockReturnValue(ratio); const source = rasterFrostType(host, heading);
				expect(source.width).toBe(Math.round(300.25 * ratio)); expect(source.height).toBe(source.width); expect(source.coverage.length).toBe(FROST_SIZE ** 2);
				const area = source.coverage.reduce((sum, value) => sum + value, 0) / FROST_SIZE ** 2;
				expect(area).toBeGreaterThan(0.07); expect(area).toBeLessThan(0.18);
				// Native font hinting/coverage can change with physical size. It is
				// wrong to require equal seed area from two different native rasters;
				// each raster's area integration is tested independently on the CPU.
				// The retained simulation MUST remain identical on DPR change below.
				expect(source.lines.map(line => line.text)).toEqual(['Cold', 'type.']);
				console.info('Frost native glyph seed', { ratio, native: source.width, grid: FROST_SIZE, area });
			}
		} finally { host.remove(); }
	});
	it('initializes from glyph coverage, grows independently, melts, and preserves state through native resize', async () => {
		const { host, heading } = specimen(), source = rasterFrostType(host, heading), model = await createFrostPhase(device, 'rgba8unorm', source.coverage);
		try {
			const initial = await model.readState();
			for (let i = 0; i < source.coverage.length; i++) expect(initial[i * 2]).toBe(source.coverage[i]);
			const initialArea = frostTotals(initial).phase; await evolve(model, 1); const grown = await model.readState(), cold = frostTotals(grown);
			expect(cold.phase).toBeGreaterThan(initialArea * 1.5); let beyondSource = 0;
			for (let i = 0; i < source.coverage.length; i++) if (source.coverage[i] === 0 && grown[i * 2] > 0.5) beyondSource++;
			expect(beyondSource).toBeGreaterThan(1000);
			model.resize(601, 601); model.resize(901, 901); expect(await model.readState()).toEqual(grown); expect(model.memoryBytes).toBe(737344);
			model.setOptions({ bath: FROST_WARM }); await evolve(model, 8); const warm = frostTotals(await model.readState());
			expect(warm.phase).toBeLessThan(cold.phase * 0.03); model.reset(); await evolve(model, 1); expect(frostTotals(await model.readState()).phase).toBe(0);
			console.info('Content phase is not a permanent mask', { initialArea, cold: cold.phase, warm: warm.phase, beyondSource });
		} finally { model.dispose(); host.remove(); }
	});
	it('replants only newly contributed cold material, keeps empty corners warm, and rejects invalid source without mutation', async () => {
		const { host, heading } = specimen(), source = rasterFrostType(host, heading), model = await createFrostPhase(device, 'rgba8unorm', source.coverage);
		try {
			model.setOptions({ bath: FROST_WARM }); model.reset(); const before = await model.readState();
			const allocations = vi.spyOn(device, 'createBuffer'); model.seedFromCoverage!(source.coverage); expect(allocations).not.toHaveBeenCalled();
			const planted = await model.readState(); expect(planted[1]).toBe(before[1]);
			model.seed(); expect(await model.readState()).toEqual(planted);
			const invalid = source.coverage.slice(); invalid[invalid.length - 1] = NaN;
			expect(() => model.seedFromCoverage!(invalid)).toThrow('[0,1]'); expect(await model.readState()).toEqual(planted);
			model.setOptions({ bath: -0.65 }); model.advanceStill(); expect(frostTotals(await model.readState()).max).toBeGreaterThan(0.7);
		} finally { model.dispose(); host.remove(); }
	});
	it('naturally grows on first use, sleeps, and keeps physical history when native DPR changes', async () => {
		const host = document.createElement('div'); host.style.width = '360.25px'; document.body.append(host);
		const dpr = vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2), media: MediaQueryList[] = [], original = window.matchMedia.bind(window);
		vi.spyOn(window, 'matchMedia').mockImplementation(query => { const value = original(query); if (query.includes('resolution:')) media.push(value); return value; });
		const component = mount(FrostType, { target: host });
		try {
			await vi.waitFor(() => expect(host.querySelector('section')?.getAttribute('data-ready')).toBe('true'));
			await vi.waitFor(() => expect(host.querySelector('.material')?.getAttribute('data-sleeping')).toBe('false'));
			await vi.waitFor(() => expect(host.querySelector('.material')?.getAttribute('data-sleeping')).toBe('true'), { timeout: 4000 });
			const before = await component.inspect(); expect(before!.details.seconds).toBeGreaterThan(0.1); expect(before!.details.phaseFraction).toBeGreaterThan(0.15);
			expect(getComputedStyle(host.querySelector('h2')!).userSelect).toBe('none');
			const writes = vi.spyOn(GPUQueue.prototype, 'writeBuffer'), submits = vi.spyOn(GPUQueue.prototype, 'submit'); await frames(); const quiet = submits.mock.calls.length;
			await new Promise(resolve => setTimeout(resolve, 150)); expect(submits.mock.calls.length).toBe(quiet);
			dpr.mockReturnValue(3); media[media.length - 1].dispatchEvent(new Event('change')); await frames();
			expect(host.querySelector('canvas')!.width).toBe(Math.round(360.25 * 3));
			expect(host.querySelector('section')?.getAttribute('data-source-width')).toBe(String(Math.round(360.25 * 2)));
			const after = await component.inspect(); expect(after!.details.checksum).toBe(before!.details.checksum); expect(after!.details.seeds).toBe(before!.details.seeds);
			// DPR redraw writes only the native display uniform, never the seed source.
			expect(writes.mock.calls.every(call => (call[2] as ArrayBufferView).byteLength <= 16)).toBe(true);
		} finally { await unmount(component); host.remove(); }
	});
	it('keeps reduced controls useful and removes WebGPU entirely for the adjustable SVG baseline', async () => {
		stillMotion(); const host = document.createElement('div'); host.style.width = '360px'; document.body.append(host);
		const component = mount(FrostType, { target: host }), button = controls(host);
		try {
			await vi.waitFor(() => expect(host.querySelector('section')?.getAttribute('data-ready')).toBe('true'));
			const initial = await component.inspect(); button('Cold grows').click(); await tick(); const grown = await component.inspect(); expect(grown!.details.phaseFraction).toBeGreaterThan(initial!.details.phaseFraction * 1.15);
			button('Warm melts').click(); for (let i = 0; i < 19; i++) button('Advance one snapshot').click();
			const melted = await component.inspect(); expect(melted!.details.phaseFraction).toBeLessThan(grown!.details.phaseFraction * 0.03);
			button('Clear frost').click(); button('Cold grows').click(); button('Reseed the letters').click();
			const replanted = await component.inspect(); expect(replanted!.max).toBeGreaterThan(0.7);
			const baseline = host.querySelector<HTMLInputElement>('input[type=checkbox]')!; baseline.click(); await frames();
			expect(host.querySelector('canvas')).toBeNull(); expect(host.querySelector('svg')).not.toBeNull();
			const writes = vi.spyOn(GPUQueue.prototype, 'writeBuffer'), submits = vi.spyOn(GPUQueue.prototype, 'submit');
			const slider = host.querySelector<HTMLInputElement>('input[type=range]')!; slider.value = '45'; slider.dispatchEvent(new Event('input', { bubbles: true })); await frames();
			expect(host.querySelector('feMorphology')?.getAttribute('radius')).toBe('45'); expect(writes).not.toHaveBeenCalled(); expect(submits).not.toHaveBeenCalled();
			baseline.click(); await vi.waitFor(() => expect(host.querySelector('section')?.getAttribute('data-ready')).toBe('true'));
			expect((await component.inspect())!.details.phaseFraction).toBeCloseTo(initial!.details.phaseFraction, 6);
		} finally { await unmount(component); host.remove(); }
	});
	it('preserves clear native typography and a usable SVG reference when no adapter is available', async () => {
		vi.spyOn(navigator.gpu, 'requestAdapter').mockResolvedValue(null); const host = document.createElement('div'); host.style.width = '360px'; document.body.append(host);
		const component = mount(FrostType, { target: host });
		try {
			await vi.waitFor(() => expect(host.textContent).toContain('No WebGPU adapter'));
			expect(host.querySelector('h2')?.textContent).toBe('Coldtype.'); expect(controls(host)('Reseed the letters').disabled).toBe(true);
			host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click(); await tick(); expect(host.querySelector('svg text')?.textContent).toBe('Cold'); expect(host.querySelector('canvas')).toBeNull();
		} finally { await unmount(component); host.remove(); }
	});
});
