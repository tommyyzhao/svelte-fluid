import { afterEach, describe, expect, it, vi } from 'vitest';
import { commands } from 'vitest/browser';
import { FluidEngine, _setContextTier } from '../FluidEngine.js';
import type { FluidConfig } from '../types.js';

interface Harness {
	rafRunning: boolean;
	lastUpdateTime: number;
	deterministicMode: boolean;
	renderDirty: boolean;
	autoStart: boolean;
	settleQuietChecks: number;
	update(now?: number): void;
	renderCore(target: null): void;
	renderProfiled(target: null): void;
	simulateFrame(dt: number): void;
	pollSettleProbe(): boolean;
	stopRaf(): void;
	gl: WebGL2RenderingContext;
	presentationGate: { reset(): void };
}
const engines: FluidEngine[] = [];
const canvases: HTMLCanvasElement[] = [];
const harness = (engine: FluidEngine) => engine as unknown as Harness;
const config: FluidConfig = {
	seed: 5, initialSplatCount: 2, pointerInput: false,
	simResolution: 32, dyeResolution: 64, bloomResolution: 32, bloomIterations: 3,
	sunraysResolution: 32, autoSplatRate: 8, autoSplatCount: 2,
	colorUpdateSpeed: 4, substeps: 2,
	glass: true, containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 }
};
function build(shared: boolean, patch: FluidConfig = {}, instrument = false): FluidEngine {
	_setContextTier(shared);
	const canvas = document.createElement('canvas');
	canvas.width = 96;
	canvas.height = 64;
	document.body.append(canvas);
	canvases.push(canvas);
	try {
		const engine = new FluidEngine({ canvas, autoStart: false, instrument, config: { ...config, ...patch } });
		engines.push(engine);
		expect(engine.sharedContext).toBe(shared);
		return engine;
	} finally { _setContextTier('auto'); }
}
function frame(engine: FluidEngine, now: number): void {
	const h = harness(engine);
	h.rafRunning = true;
	h.lastUpdateTime = performance.now() - 1000 / 120;
	h.update(now);
}
function snapshot(canvas: HTMLCanvasElement): Uint8ClampedArray {
	const copy = document.createElement('canvas');
	copy.width = canvas.width;
	copy.height = canvas.height;
	const ctx = copy.getContext('2d')!;
	ctx.drawImage(canvas, 0, 0);
	return ctx.getImageData(0, 0, copy.width, copy.height).data;
}
const raf = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
afterEach(() => {
	vi.restoreAllMocks();
	for (const engine of engines.splice(0)) engine.dispose();
	for (const canvas of canvases.splice(0)) canvas.remove();
	_setContextTier('auto');
});

describe('presentation-only cap', () => {
	for (const shared of [false, true]) {
		for (const instrument of [false, true]) {
			it(`identical velocity/dye after every 120 Hz solve; half renders (${shared ? 'shared' : 'own'}, profiled=${instrument})`, async () => {
				const capped = build(shared, { maxFps: 60 }, instrument);
				const uncapped = build(shared, { maxFps: null }, instrument);
				const cappedRender = vi.spyOn(harness(capped), instrument ? 'renderProfiled' : 'renderCore');
				const uncappedRender = vi.spyOn(harness(uncapped), instrument ? 'renderProfiled' : 'renderCore');
				const cappedSolve = vi.spyOn(harness(capped), 'simulateFrame');
				const uncappedSolve = vi.spyOn(harness(uncapped), 'simulateFrame');
				let clock = 0;
				vi.spyOn(performance, 'now').mockImplementation(() => clock);
				for (let i = 0; i < 120; i++) {
					clock = i * 1000 / 120;
					if (i % 17 === 0) { capped.randomSplats(1); uncapped.randomSplats(1); }
					frame(capped, clock);
					frame(uncapped, clock);
				}
				for (const field of ['velocity', 'dye'] as const) {
					const a = capped.readField(field).data;
					const b = uncapped.readField(field).data;
					expect(a.some((v) => v !== 0)).toBe(true);
					expect(new Uint8Array(a.buffer)).toEqual(new Uint8Array(b.buffer));
				}
				expect(cappedSolve).toHaveBeenCalledTimes(120);
				expect(uncappedSolve).toHaveBeenCalledTimes(120);
				expect(cappedSolve.mock.calls).toEqual(uncappedSolve.mock.calls);
				expect(cappedRender).toHaveBeenCalledTimes(60);
				expect(uncappedRender).toHaveBeenCalledTimes(120);
				await Promise.all([capped.presented(), uncapped.presented()]);
			});
		}
		it(`no default-framebuffer writes or blank composited image on skipped RAFs (${shared ? 'shared' : 'own'})`, async () => {
			const engine = build(shared, { maxFps: 60, bloom: false, sunrays: false, glass: false });
			const canvas = canvases.at(-1)!;
			const render = vi.spyOn(harness(engine), 'renderCore');
			await raf();
			frame(engine, 0);
			await engine.presented();
			const drawn = snapshot(canvas);
			expect(drawn.some((v, i) => i % 4 !== 3 && v > 0)).toBe(true);
			const screenshot = (commands as unknown as Record<string, (rect: { x: number; y: number; width: number; height: number }) => Promise<string>>).captureCanvasScreenshot;
			const rect = canvas.getBoundingClientRect();
			const clip = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
			const previous = await screenshot(clip);
			const gl = harness(engine).gl;
			let screenWrites = 0;
			for (const name of ['drawElements', 'drawArrays', 'clear'] as const) {
				const original = gl[name].bind(gl) as (...args: number[]) => void;
				vi.spyOn(gl, name).mockImplementation(((...args: number[]) => {
					if (gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) === null) screenWrites++;
					original(...args);
				}) as never);
			}
			await raf();
			frame(engine, 1000 / 120);
			await engine.presented();
			expect(render).toHaveBeenCalledTimes(1);
			expect(screenWrites).toBe(0);
			expect(harness(engine).renderDirty).toBe(true);
			// Own WebGL readback may be cleared after compositing; only the page screenshot
			// observes the retained displayed image. Shared bitmap canvases also support drawImage.
			if (shared) expect(snapshot(canvas)).toEqual(drawn);
			expect(await screenshot(clip)).toBe(previous);
		});
	}
	it('paused-dirty, resize, resume, explicit rendering bypass presentation deadlines', () => {
		const engine = build(false, { maxFps: 1, paused: true, autoSplatRate: 0 });
		const h = harness(engine);
		const render = vi.spyOn(h, 'renderCore');
		frame(engine, 0);
		frame(engine, 8);
		expect(render).toHaveBeenCalledTimes(1);
		engine.setConfig({ backColor: { r: 16, g: 32, b: 48 } });
		frame(engine, 16);
		expect(render).toHaveBeenCalledTimes(2);
		engine.setConfig({ paused: false });
		frame(engine, 24);
		expect(render).toHaveBeenCalledTimes(3);
		engine.resize(128, 64);
		frame(engine, 32);
		expect(render).toHaveBeenCalledTimes(4);
		engine.pause();
		engine.resume();
		frame(engine, 40);
		expect(render).toHaveBeenCalledTimes(5);
		engine.pause();
		engine.advance(1, 1 / 120);
		engine.renderOnce();
		expect(render).toHaveBeenCalledTimes(6);
	});
	it('settle presents its final skipped solve before stopping', () => {
		const engine = build(false, { maxFps: 1, initialSplatCount: 0, autoSplatRate: 0, glass: false });
		const h = harness(engine);
		const render = vi.spyOn(h, 'renderCore');
		frame(engine, 0);
		h.autoStart = true;
		h.deterministicMode = false;
		h.settleQuietChecks = 2;
		vi.spyOn(h, 'pollSettleProbe').mockReturnValue(true);
		const stop = vi.spyOn(h, 'stopRaf').mockImplementation(() => {
			expect(h.renderDirty).toBe(false);
			expect(render).toHaveBeenCalledTimes(2);
			h.rafRunning = false;
		});
		frame(engine, 8);
		expect(stop).toHaveBeenCalledTimes(1);
		expect(engine.isSettled).toBe(true);
	});
	it('governor sees every display interval, not presentation gaps or submission costs', () => {
		const capped = build(false, { maxFps: 60, autoPerformance: true });
		const uncapped = build(false, { maxFps: null, autoPerformance: true });
		let now = 0;
		vi.spyOn(performance, 'now').mockImplementation(() => now);
		for (const engine of [capped, uncapped]) {
			harness(engine).deterministicMode = false;
			harness(engine).lastUpdateTime = 0;
		}
		for (let i = 1; i <= 80; i++) {
			now += i < 40 ? 1000 / 120 : 32;
			for (const engine of [capped, uncapped]) { harness(engine).rafRunning = true; harness(engine).update(now); }
			expect(capped.getPerformanceState()).toEqual(uncapped.getPerformanceState());
		}
	});
});
