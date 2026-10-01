import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import Route from '../../routes/lab/interfaces/caustic-cover/+page.svelte';
import { LabSession } from './LabSession.js';
import type { LiquidExperiment } from './types.js';

const pause = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));
afterEach(async () => { vi.restoreAllMocks(); await page.viewport(1280, 720); });
async function fixture(reduced = false, fallback = false) {
	await page.viewport(1100, 1100); let ratio = 2, submissions = 0;
	const models: LiquidExperiment[] = [], queries: MediaQueryList[] = [];
	vi.spyOn(window, 'devicePixelRatio', 'get').mockImplementation(() => ratio);
	const media = window.matchMedia.bind(window); vi.spyOn(window, 'matchMedia').mockImplementation((text) => {
		const query = media(text); if (text.includes('prefers-reduced-motion')) Object.defineProperty(query, 'matches', { value: reduced });
		if (text.startsWith('(resolution:')) queries.push(query); return query;
	});
	if (fallback) vi.spyOn(navigator.gpu, 'requestAdapter').mockResolvedValue(null);
	const submit = GPUQueue.prototype.submit; vi.spyOn(GPUQueue.prototype, 'submit').mockImplementation(function(this: GPUQueue, commands) { submissions++; return submit.call(this, commands); });
	const load = LabSession.prototype.load; vi.spyOn(LabSession.prototype, 'load').mockImplementation(function(this: LabSession, factory) { return load.call(this, async (...args) => { const model = await factory(...args); models.push(model); return model; }); });
	const host = document.createElement('div'); host.style.width = '980.375px'; document.body.appendChild(host); const component = mount(Route, { target: host });
	const sheet = host.querySelector<HTMLElement>('.sheet')!;
	return { host, sheet, models, get submissions() { return submissions; }, async ready() { await expect.poll(() => host.querySelector('[data-caustic-cover-ready]')?.getAttribute('data-caustic-cover-ready')).toBe('true'); await pause(); },
		async ratio(value: number) { ratio = value; for (const query of [...queries]) query.dispatchEvent(new Event('change')); window.dispatchEvent(new Event('resize')); await pause(); },
		async dispose() { await unmount(component); host.remove(); await pause(30); } };
}
async function photograph(sheet: HTMLElement) {
	// A real compositor screenshot: no forced invalidation, model setter or
	// extra GPU render rescues the route. Status/footer regions are excluded.
	const screenshot = await page.elementLocator(sheet).screenshot({ base64: true });
	const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${screenshot.base64}`)).blob());
	const canvas = new OffscreenCanvas(image.width, image.height), context = canvas.getContext('2d')!; context.drawImage(image, 0, 0); image.close();
	return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
}
function difference(a: Awaited<ReturnType<typeof photograph>>, b: Awaited<ReturnType<typeof photograph>>) {
	expect([a.width, a.height]).toEqual([b.width, b.height]); let sum = 0, count = 0, changed = 0;
	for (let y = 25; y < a.height - 65; y++) for (let x = 25; x < a.width - 25; x++) {
		const index = (y * a.width + x) * 4, delta = Math.max(...[0, 1, 2].map((c) => Math.abs(a.data[index + c] - b.data[index + c])));
		sum += delta; count++; changed += Number(delta > 6);
	}
	return { mean: sum / count, fraction: changed / count };
}
function registered(a: Awaited<ReturnType<typeof photograph>>, b: Awaited<ReturnType<typeof photograph>>) {
	// The test overrides model DPR, not the compositor's physical DPR. Native
	// GPU+mip reconstruction and DOM image minification are not byte-identical.
	// Test local registration in four regions; independent known-color GPU
	// tests, rather than this screenshot comparison, prove color identity.
	expect([a.width, a.height]).toEqual([b.width, b.height]);
	const regions = [];
	for (let q = 0; q < 4; q++) {
		const scores = [];
		for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
			let sum = 0, count = 0;
			for (let y = 30 + (q >> 1) * (a.height / 2 - 45); y < 30 + ((q >> 1) + 1) * (a.height / 2 - 45); y++) for (let x = 25 + q % 2 * (a.width / 2 - 30); x < 25 + (q % 2 + 1) * (a.width / 2 - 30); x++) {
				const px = Math.floor(x), py = Math.floor(y);
				for (let c = 0; c < 3; c++) { sum += Math.abs(a.data[(py * a.width + px) * 4 + c] - b.data[((py + dy) * b.width + px + dx) * 4 + c]); count++; }
			}
			scores.push({ dx, dy, mean: sum / count });
		}
		scores.sort((a, b) => a.mean - b.mean); expect([scores[0].dx, scores[0].dy]).toEqual([0, 0]); expect(scores[0].mean).toBeLessThan(scores[1].mean * 0.9); regions.push(scores[0]);
	}
	console.info('Actual flat photo / DOM source local registration', regions);
}
const button = (host: HTMLElement, name: string) => [...host.querySelectorAll('button')].find((item) => item.textContent === name)!;
const control = (host: HTMLElement, text: string) => [...host.querySelectorAll('label')].find((label) => label.textContent?.includes(text))!.querySelector('input,select') as HTMLInputElement;

describe('actual caustic cover route', () => {
	it('draws the first native shift and pointer input, stays registered under flat light, and unmounts for cheap baselines', async () => {
		const f = await fixture();
		try {
			await f.ready(); const first = await photograph(f.sheet); await userEvent.click(button(f.host, 'Shift light')); await pause(); const shifted = await photograph(f.sheet);
			expect(difference(first, shifted).fraction).toBeGreaterThan(0.02);
			await userEvent.click(button(f.host, 'Reset')); await pause(); const beforePointer = await photograph(f.sheet), bounds = f.sheet.getBoundingClientRect();
			for (let i = 0; i < 6; i++) { await userEvent.hover(f.sheet, { force: true, position: { x: bounds.width * (0.25 + i * 0.09), y: bounds.height * (0.4 + i * 0.04) } }); await pause(20); }
			await pause(); expect(difference(beforePointer, await photograph(f.sheet)).fraction).toBeGreaterThan(0.005);
			const relief = control(f.host, 'Surface relief'); relief.value = '0'; relief.dispatchEvent(new Event('input', { bubbles: true })); await pause(); const flat = await photograph(f.sheet);
			await userEvent.selectOptions(control(f.host, 'View'), 'original'); await pause(); expect(f.sheet.querySelector('canvas')).toBeNull();
			const original = await photograph(f.sheet); registered(flat, original);
			// A whole-pixel regression cannot pass the registration contract.
			const moved = { ...original, data: new Uint8ClampedArray(original.data.length) };
			for (let y = 0; y < original.height; y++) moved.data.set(original.data.subarray(y * original.width * 4, ((y + 1) * original.width - 1) * 4), (y * original.width + 1) * 4);
			expect(() => registered(flat, moved)).toThrow();
			const count = f.submissions; await pause(); expect(f.submissions).toBe(count);
			await expect(f.models[0].inspect()).rejects.toThrow('disposed');
			await userEvent.selectOptions(control(f.host, 'View'), 'radial'); await pause(); const radial = await photograph(f.sheet); await userEvent.click(button(f.host, 'Shift light')); await pause(); expect(difference(radial, await photograph(f.sheet)).fraction).toBeGreaterThan(0.01);
			expect(f.sheet.querySelector('canvas')).toBeNull(); expect(f.submissions).toBe(count);
		} finally { await f.dispose(); }
	}, 30_000);
	it('preserves native fractional2x/3x photo state and gives reduced motion a still action with zero idle submissions', async () => {
		const f = await fixture(true);
		try {
			await f.ready(); const canvas = f.sheet.querySelector('canvas')!, before = await f.models[0].inspect();
			for (const ratio of [2, 3]) { await f.ratio(ratio); const rect = canvas.getBoundingClientRect(); expect([canvas.width, canvas.height]).toEqual([Math.round(rect.width * ratio), Math.round(rect.height * ratio)]); const state = await f.models[0].inspect(); for (const key of ['phase', 'centerX', 'centerY', 'sourceBytes', 'sourceWidth', 'sourceHeight', 'photonGrid']) expect(state.details[key]).toBe(before.details[key]); }
			const first = await photograph(f.sheet); await userEvent.click(button(f.host, 'Shift light')); await pause(); const after = await photograph(f.sheet); expect(difference(first, after).fraction).toBeGreaterThan(0.02);
			expect(f.sheet.querySelector('.material')?.getAttribute('data-reduced')).toBe('true'); const count = f.submissions; await pause(); expect(f.submissions).toBe(count); expect(difference(after, await photograph(f.sheet)).mean).toBe(0);
		} finally { await f.dispose(); }
	}, 30_000);
	it('retains the native photograph and functional cheap controls when WebGPU is unavailable', async () => {
		const f = await fixture(false, true);
		try {
			await expect.poll(() => f.host.textContent).toContain('WebGPU unavailable'); const source = new Image(); source.src = f.sheet.querySelector('image')!.getAttribute('href')!; await source.decode(); expect(source.naturalWidth).toBe(3803);
			expect(button(f.host, 'Shift light').disabled).toBe(true); await userEvent.selectOptions(control(f.host, 'View'), 'radial'); await pause(); expect(button(f.host, 'Shift light').disabled).toBe(false);
			expect(f.sheet.querySelector('canvas')).toBeNull(); const before = await photograph(f.sheet); await userEvent.click(button(f.host, 'Shift light')); await pause(); expect(difference(before, await photograph(f.sheet)).fraction).toBeGreaterThan(0.01); expect(f.submissions).toBe(0);
		} finally { await f.dispose(); }
	}, 30_000);
});
