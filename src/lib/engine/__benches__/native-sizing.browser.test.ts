import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import LiquidToggle from '../../LiquidToggle.svelte';
import EnamelText from '../../EnamelText.svelte';
import LiquidButton from '../../LiquidButton.svelte';
import fluidTextSrc from '../../FluidText.svelte?raw';
import Fluid from '../../Fluid.svelte';
import { FluidEngine } from '../FluidEngine.js';
import { activeFrameSubscribers } from '../frame-scheduler.js';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const dispose of cleanup.splice(0).reverse()) await dispose();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('native fractional component backing', () => {
	for (const absent of [true, false]) {
		it(`Fluid starts with ${absent ? 'matchMedia absent' : 'resolution listeners absent; reduced-motion listeners available'}`, async () => {
			vi.stubGlobal('matchMedia', absent ? undefined : (query: string) => ({
				matches: false,
				...(query.includes('prefers-reduced-motion') ? {
					addEventListener() {}, removeEventListener() {}
				} : {})
			}));
			const target = document.createElement('div');
			document.body.append(target);
			const onReady = vi.fn();
			const app = mount(Fluid, { target, props: {
				width: 96.375, height: 96.375, simResolution: 32, dyeResolution: 32,
				initialSplatCount: 0, onReady
			} });
			cleanup.push(async () => { await unmount(app); target.remove(); });
			await vi.waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
			expect(target.querySelector('canvas')!.width).toBe(Math.floor(96.375 * devicePixelRatio));
		});
	}

	for (const [maxPixelRatio, dyeResolution] of [[null, 32], [2, 32], [null, undefined]] as const) {
		it(`Fluid follows fixed-CSS DPR changes, cap ${maxPixelRatio}, dye ${dyeResolution ?? 'default'}, without waking its still`, async () => {
			vi.stubGlobal('devicePixelRatio', 1);
			const queries: { query: string; listeners: Set<() => void>; removed: (() => void)[] }[] = [];
			vi.stubGlobal('matchMedia', (query: string) => {
				const record = { query, listeners: new Set<() => void>(), removed: [] as (() => void)[] };
				queries.push(record);
				return {
					media: query,
					matches: query.includes('prefers-reduced-motion'),
					addEventListener: (_: string, listener: () => void) => record.listeners.add(listener),
					removeEventListener: (_: string, listener: () => void) => {
						record.listeners.delete(listener);
						record.removed.push(listener);
					}
				};
			});
			const target = document.createElement('div');
			document.body.append(target);
			const onReady = vi.fn();
			const still = vi.spyOn(FluidEngine.prototype, 'settleStill');
			const resize = vi.spyOn(FluidEngine.prototype, 'resize');
			const render = vi.spyOn(FluidEngine.prototype, 'renderOnce');
			const programs = vi.spyOn(WebGL2RenderingContext.prototype, 'createProgram');
			const app = mount(Fluid, { target, props: {
				width: 96.375, height: 96.375, maxPixelRatio,
				simResolution: 32, dyeResolution, initialSplatCount: 1, seed: 7, onReady
			} });
			let mounted = true;
			cleanup.push(async () => { if (mounted) await unmount(app); target.remove(); });
			await vi.waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
			const canvas = target.querySelector('canvas')!;
			expect(canvas.width).toBe(96);
			const dprQueries = () => queries.filter(({ query }) => query.includes('resolution:'));
			expect(dprQueries().at(-1)?.query).toBe('(resolution: 1dppx)');
			programs.mockClear();
			render.mockClear();
			const engine = still.mock.instances.at(-1) as unknown as {
				readField(field: 'dye'): { data: Float32Array };
				velocity: { read: { fbo: unknown } }; dye: { width: number; read: { fbo: unknown } };
			};
			const fields = [engine.velocity.read.fbo, engine.dye.read.fbo];
			const dyeMean = () => {
				const data = engine.readField('dye').data;
				return data.reduce((sum, value) => sum + Math.abs(value), 0) / data.length;
			};
			const initialDye = dyeResolution === undefined ? dyeMean() : 0;
			if (dyeResolution === undefined) {
				expect(engine.dye.width).toBe(96);
				expect(initialDye).toBeGreaterThan(0);
			}
			for (const dpr of [3, 2]) {
				vi.stubGlobal('devicePixelRatio', dpr);
				const resizeCount = resize.mock.calls.length;
				const previous = dprQueries().at(-1)!;
				const listener = [...previous.listeners][0];
				// Duplicate notification coalesces into one resize using the latest DPR.
				listener();
				listener();
				const pixels = Math.floor(96.375 * Math.min(dpr, maxPixelRatio ?? dpr));
				await vi.waitFor(() => expect(resize).toHaveBeenCalledTimes(resizeCount + 1));
				expect(canvas.width).toBe(pixels);
				expect(canvas.height).toBe(pixels);
				expect(previous.listeners.size).toBe(0);
				expect(dprQueries().at(-1)?.query).toBe(`(resolution: ${dpr}dppx)`);
				expect(dprQueries().filter(({ listeners }) => listeners.size)).toHaveLength(1);
				expect(engine.velocity.read.fbo).toBe(fields[0]);
				if (dyeResolution === undefined) {
					expect(engine.dye.width).toBe(pixels);
					expect(engine.dye.read.fbo).not.toBe(fields[1]);
					const retained = dyeMean();
					expect(Number.isFinite(retained)).toBe(true);
					expect(retained).toBeGreaterThan(initialDye * 0.8);
					expect(retained).toBeLessThan(initialDye * 1.2);
				} else expect(engine.dye.read.fbo).toBe(fields[1]);
				expect(activeFrameSubscribers()).toBe(0);
			}
			expect(resize).toHaveBeenCalledTimes(2);
			// resize renders changed buffers; the existing config refresh also renders the still.
			expect(render.mock.calls.length).toBeGreaterThanOrEqual(maxPixelRatio === null ? 2 : 1);
			expect(programs).not.toHaveBeenCalled();
			expect(onReady).toHaveBeenCalledTimes(1);
			const pending = [...dprQueries().at(-1)!.listeners][0];
			pending();
			await unmount(app);
			mounted = false;
			const queryCount = queries.length;
			const resizeCount = resize.mock.calls.length;
			for (const { removed } of dprQueries()) for (const listener of removed) listener();
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			expect(queries).toHaveLength(queryCount);
			expect(resize).toHaveBeenCalledTimes(resizeCount);
			expect(queries.every(({ listeners }) => listeners.size === 0)).toBe(true);
		});
	}

	it('defaults small text to AA without removing the explicit large-text override', () => {
		expect(fluidTextSrc).toContain('minContrast = 4.5,');
		expect(fluidTextSrc).toContain('{minContrast}');
	});

	for (const component of [LiquidToggle, EnamelText, LiquidButton]) {
		it(`${component.name} retains fractional layout pixels through resize and transforms`, async () => {
			const target = document.createElement('div');
			target.style.cssText = 'font:32px Arial;color:#222;background:#fff';
			document.body.append(target);
			const app = component === LiquidToggle
				? mount(LiquidToggle, { target, props: { checked: true } })
				: component === EnamelText
					? mount(EnamelText, { target, props: { text: 'Native' } })
					: mount(LiquidButton, { target });
			cleanup.push(async () => { await unmount(app); target.remove(); });
			const canvas = target.querySelector('canvas')!;
			const root = target.firstElementChild!;
			await vi.waitFor(() => expect(root.classList.contains('live')).toBe(true));
			for (const [width, height] of [[96, 48], [96.375, 48.625], [110.625, 55.375]]) {
				canvas.style.width = `${width}px`;
				canvas.style.height = `${height}px`;
				await vi.waitFor(() => {
					expect(canvas.width).toBe(Math.max(1, Math.floor(width * devicePixelRatio)));
					expect(canvas.height).toBe(Math.max(1, Math.floor(height * devicePixelRatio)));
				});
				console.info('native backing', component.name, devicePixelRatio, width, height, canvas.width, canvas.height);
			}
			// A transformed visual box must not replace logical layout dimensions.
			canvas.style.transform = 'scale(1.5)';
			canvas.style.width = '96.375px';
			canvas.style.height = '48.625px';
			await vi.waitFor(() => {
				expect(canvas.width).toBe(Math.floor(96.375 * devicePixelRatio));
				expect(canvas.height).toBe(Math.floor(48.625 * devicePixelRatio));
			});
			if (component === LiquidToggle) expect(target.querySelector('input')!.checked).toBe(true);
			if (component === EnamelText) expect(root.textContent).toBe('Native');
			expect(root.classList.contains('live')).toBe(true);
		});
	}
});
