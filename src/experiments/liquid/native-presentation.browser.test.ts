import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LabSession } from './LabSession.js';
import { createMembrane } from './membrane.js';
import { createMercury } from './mercury.js';
import { createFilament } from './filament.js';
import { measureEffectPerformance } from './effects-performance.js';
import { presentationSize } from './presentation-size.js';
import type { LiquidExperiment, LiquidInput } from './types.js';

let device: GPUDevice;
const format: GPUTextureFormat = 'rgba8unorm';
const errors: string[] = [];

beforeAll(async () => {
	expect(navigator.gpu, 'Presentation checks require an actual WebGPU implementation').toBeDefined();
	const adapter = await navigator.gpu.requestAdapter();
	expect(adapter).not.toBeNull();
	const timestampQuery = adapter!.features.has('timestamp-query');
	device = await adapter!.requestDevice({ requiredFeatures: timestampQuery ? ['timestamp-query'] : [] });
	device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
	console.info('Presentation adapter', { vendor: adapter!.info.vendor, architecture: adapter!.info.architecture,
		timestampQuery, userAgent: navigator.userAgent });
});
beforeEach(() => { errors.length = 0; device.pushErrorScope('validation'); });
afterEach(async () => {
	await device.queue.onSubmittedWorkDone();
	expect((await device.popErrorScope())?.message ?? null).toBeNull();
	expect(errors).toEqual([]);
});
afterAll(() => device?.destroy());

async function until(condition: () => boolean, session: LabSession) {
	for (let frame = 0; frame < 90 && !condition(); frame++) {
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		expect(session.state.error).toBe('');
	}
	expect(condition(), 'The live session must eventually submit the requested frame').toBe(true);
}

const benchmarkInput = (frame: number): LiquidInput => {
	const angle = frame / 60 * Math.PI * 2;
	return { x: 0.5 + 0.24 * Math.sin(angle), y: 0.5 + 0.1 * Math.cos(angle),
		vx: 0.24 * Math.PI * 2 * Math.cos(angle), vy: -0.1 * Math.PI * 2 * Math.sin(angle),
		active: true, press: 0.8, tilt: 0 };
};

it('gives a real pointer ownership over scripted input and keeps canceled nudges canceled after pause', async () => {
	const canvas = document.createElement('canvas');
	document.body.append(canvas);
	const session = await LabSession.create(canvas, () => {});
	const samples: LiquidInput[] = [];
	let resets = 0;
	try {
		session.resize(160, 100);
		await session.load(async (gpu, targetFormat) => {
			const engine = await createMembrane(gpu, targetFormat, { gridSize: 128 });
			return { ...engine,
				reset() { resets++; engine.reset(); },
				step(encoder, dt, input) { samples.push({ ...input }); engine.step(encoder, dt, input); }
			};
		});
		session.nudge({ x: 0.2, y: 0.3 });
		await until(() => samples.some((input) => input.x === 0.2 && (input.press ?? 0) > 0), session);
		const takeover = samples.length;
		session.pointer(0.8, 0.7, true);
		await until(() => samples.length >= takeover + 4, session);
		for (const input of samples.slice(takeover)) {
			expect([input.x, input.y, input.press, input.active]).toEqual([0.8, 0.7, 0, true]);
		}

		const secondNudge = samples.length;
		session.nudge({ x: 0.2, y: 0.3 });
		await until(() => samples.slice(secondNudge).some((input) => (input.press ?? 0) > 0), session);
		session.cancelNudge();
		session.pause();
		const canceled = samples.length;
		session.pause();
		await until(() => samples.length >= canceled + 4, session);
		for (const input of samples.slice(canceled)) {
			expect([input.x, input.y, input.press, input.active]).toEqual([0.8, 0.7, 0, false]);
		}
		expect(resets, 'Canceling input must not erase persistent material state').toBe(0);
		expect(session.state.error).toBe('');
	} finally { session.dispose(); canvas.remove(); }
});

describe('native-pixel presentation', () => {
	it('follows DPR-only changes, rearms the resolution query, and removes it on disposal', async () => {
		let ratio = 1;
		const pixelRatio = vi.spyOn(window, 'devicePixelRatio', 'get').mockImplementation(() => ratio);
		const realMatchMedia = window.matchMedia.bind(window);
		const queries: MediaQueryList[] = [];
		const removals: Array<ReturnType<typeof vi.spyOn>> = [];
		const media = vi.spyOn(window, 'matchMedia').mockImplementation((source) => {
			const query = realMatchMedia(source);
			queries.push(query);
			removals.push(vi.spyOn(query, 'removeEventListener'));
			return query;
		});
		const canvas = document.createElement('canvas');
		canvas.style.width = '320px'; canvas.style.height = '180px';
		document.body.append(canvas);
		let session: LabSession | undefined;
		let renders = 0;
		try {
			session = await LabSession.create(canvas, () => {});
			session.pause();
			session.resize(320, 180);
			await session.load(async (gpu, targetFormat) => {
				const engine = await createMembrane(gpu, targetFormat, { gridSize: 128 });
				return { ...engine, render(encoder, target) { renders++; engine.render(encoder, target); } };
			});
			await until(() => renders > 0, session);
			expect([canvas.width, canvas.height]).toEqual([320, 180]);
			expect(queries[0]!.media).toBe('(resolution: 1dppx)');
			for (const [index, nextRatio] of [2, 3, 1.5].entries()) {
				const before = renders;
				ratio = nextRatio;
				// Dispatch only the monitor-resolution event: no ResizeObserver,
				// CSS resize is allowed to mask a missing watcher. The 3x transition
				// must not be silently reduced to a 2x backing canvas.
				queries[index]!.dispatchEvent(new Event('change'));
				expect([canvas.width, canvas.height]).toEqual([320 * ratio, 180 * ratio]);
				expect([canvas.clientWidth, canvas.clientHeight]).toEqual([320, 180]);
				expect(session.state.pixels).toBe(320 * 180 * ratio ** 2);
				expect(session.state.paused).toBe(true);
				expect(session.state.seconds).toBe(0);
				expect(removals[index]).toHaveBeenCalledOnce();
				expect(queries[index + 1]!.media).toBe(`(resolution: ${ratio}dppx)`);
				await until(() => renders > before, session);
			}
			session.dispose(); session = undefined;
			expect(removals.at(-1)).toHaveBeenCalledOnce();
			ratio = 1;
			queries.at(-1)!.dispatchEvent(new Event('change'));
			expect([canvas.width, canvas.height]).toEqual([480, 270]);
		} finally {
			session?.dispose(); canvas.remove();
			media.mockRestore(); pixelRatio.mockRestore();
			for (const removal of removals) removal.mockRestore();
		}
	});

	it('resizes the real canvas without resetting or reallocating a paused native membrane', async () => {
		const pixelRatio = vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2);
		const canvas = document.createElement('canvas');
		canvas.style.width = '1400px'; canvas.style.height = '700px';
		document.body.append(canvas);
		const session = await LabSession.create(canvas, () => {});
		let engine!: LiquidExperiment;
		let sessionDevice!: GPUDevice;
		let allocations = 0, resets = 0, steps = 0, renders = 0, resizes = 0;
		try {
			expect([canvas.width, canvas.height], 'Raw session creation must already measure native CSS pixels').toEqual([2800, 1400]);
			session.resize(1400, 700);
			session.pause();
			await session.load(async (gpu, targetFormat) => {
				sessionDevice = gpu;
				gpu.pushErrorScope('validation');
				// Count real model allocations, including those hidden by an unchanged
				// memoryBytes total. Bind methods to the real WebGPU receiver.
				const observed = new Proxy(gpu, {
					get(target, key) {
						const value = Reflect.get(target, key, target);
						if (key === 'createBuffer' || key === 'createTexture') return (...args: unknown[]) => {
							allocations++;
							return Reflect.apply(value, target, args);
						};
						return typeof value === 'function' ? value.bind(target) : value;
					}
				});
				engine = await createMembrane(observed, targetFormat, { gridSize: 128 });
				return {
					get memoryBytes() { return engine.memoryBytes; },
					resize(width, height) { resizes++; engine.resize(width, height); },
					reset() { resets++; engine.reset(); },
					step(encoder, dt, input) { steps++; engine.step(encoder, dt, input); },
					render(encoder, target) { renders++; engine.render(encoder, target); },
					inspect: () => engine.inspect(), dispose: () => engine.dispose()
				};
			});
			await until(() => renders > 0, session);
			session.pause();
			session.pointer(0.4, 0.5, true);
			session.pointer(0.6, 0.5, true);
			await until(() => steps > 0, session);
			session.pause();
			const frozen = await engine.inspect();
			expect(frozen.finite).toBe(true);
			expect(frozen.details.heightRms).toBeGreaterThan(0);
			const seconds = session.state.seconds;
			const stepCount = steps;
			const bytes = engine.memoryBytes;
			expect(seconds).toBeGreaterThan(0);

			for (const [cssWidth, cssHeight] of [[700, 350], [1600, 800]]) {
				const before = { allocations, renders, resizes };
				canvas.style.width = `${cssWidth}px`; canvas.style.height = `${cssHeight}px`;
				session.resize(cssWidth!, cssHeight!);
				// The larger request exceeds the removed 4M-pixel cap. Check the
				// native dimensions independently of the sizing helper under test.
				expect([canvas.width, canvas.height]).toEqual([cssWidth! * 2, cssHeight! * 2]);
				expect(session.state.pixels).toBe(cssWidth! * cssHeight! * 4);
				await until(() => renders > before.renders, session);
				expect(resizes).toBe(before.resizes + 1);
				expect(allocations, 'Output resizing must not allocate fresh simulation buffers or textures').toBe(before.allocations);
				expect(resets).toBe(0);
				expect(steps).toBe(stepCount);
				expect(session.state.paused).toBe(true);
				expect(session.state.seconds).toBe(seconds);
				expect(engine.memoryBytes).toBe(bytes);
				expect(await engine.inspect()).toEqual(frozen);
			}
			session.pause();
			await until(() => session.state.seconds > seconds, session);
			session.pause();
			expect((await engine.inspect()).finite).toBe(true);
			expect(resets).toBe(0);
			await sessionDevice.queue.onSubmittedWorkDone();
			expect((await sessionDevice.popErrorScope())?.message ?? null).toBeNull();
			expect(session.state.error).toBe('');
		} finally { session.dispose(); canvas.remove(); pixelRatio.mockRestore(); }
	});

	it('keeps an unsupported native-size failure visible when initialization follows resize', async () => {
		const pixelRatio = vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2);
		const canvas = document.createElement('canvas');
		const session = await LabSession.create(canvas, () => {});
		let factoryCalls = 0;
		try {
			const factory = async (gpu: GPUDevice, targetFormat: GPUTextureFormat) => {
				factoryCalls++;
				return createMembrane(gpu, targetFormat, { gridSize: 128 });
			};
			const original = [canvas.width, canvas.height];
			// Wrappers resize before load. A rejected native request must not be
			// forgotten by load and replaced with the old/default undersized output.
			session.resize(5000, 5000);
			const failure = session.state.error;
			expect(failure).not.toBe('');
			expect(session.state.ready).toBe(false);
			await session.load(factory);
			expect(session.state.error).toBe(failure);
			expect(session.state.ready).toBe(false);
			expect([canvas.width, canvas.height]).toEqual(original);
			expect(factoryCalls, 'A known unsupported output should stop GPU initialization').toBe(0);
			// Recovery is explicit: a supported size alone must not quietly restart
			// work, but the next load should succeed at its actual native dimensions.
			session.resize(320, 180);
			expect(session.state.ready).toBe(false);
			await session.load(factory);
			expect(factoryCalls).toBe(1);
			expect(session.state.ready).toBe(true);
			expect(session.state.error).toBe('');
			expect([canvas.width, canvas.height]).toEqual([640, 360]);
		} finally { session.dispose(); pixelRatio.mockRestore(); }
	});

	it('disposes an in-flight candidate after a size failure even if the size becomes valid again', async () => {
		const canvas = document.createElement('canvas');
		canvas.style.width = '320px'; canvas.style.height = '180px';
		document.body.append(canvas);
		const session = await LabSession.create(canvas, () => {});
		let enter!: () => void, release!: () => void;
		const entered = new Promise<void>((resolve) => { enter = resolve; });
		const held = new Promise<void>((resolve) => { release = resolve; });
		let disposedCandidates = 0;
		const pending = session.load(async (gpu, targetFormat) => {
			enter();
			const engine = await createMembrane(gpu, targetFormat, { gridSize: 128 });
			await held;
			return { ...engine, dispose() { disposedCandidates++; engine.dispose(); } };
		});
		try {
			await entered;
			session.resize(1_000_000, 1_000_000);
			const failure = session.state.error;
			expect(failure).not.toBe('');
			session.resize(320, 180);
			release();
			await pending;
			expect(disposedCandidates).toBe(1);
			expect(session.state.ready).toBe(false);
			expect(session.state.error).toBe(failure);
			// Only a new explicit load may clear the failure and commit a model.
			await session.load((gpu, targetFormat) => createMembrane(gpu, targetFormat, { gridSize: 128 }));
			expect(session.state.ready).toBe(true);
			expect(session.state.error).toBe('');
		} finally { release(); await pending; session.dispose(); canvas.remove(); }
	});

	it('measures native 2x and 3x outputs with unchanged default simulation sizes', async () => {
		for (const [effect, factory] of [['membrane', createMembrane], ['mercury', createMercury], ['filament', createFilament]] as const) {
			const engine = await factory(device, format);
			try {
				const engineBytes = engine.memoryBytes;
				const initial = await engine.inspect();
				for (const pixelRatio of [2, 3]) {
					// Same 1400×660 CSS specimen and solver state. The 3x case is a
					// high-density desktop-sized stress case, not a phone benchmark.
					const output = presentationSize(1400, 660, pixelRatio, device.limits.maxTextureDimension2D);
					expect(output).toEqual({ width: 1400 * pixelRatio, height: 660 * pixelRatio });
					engine.reset();
					const result = await measureEffectPerformance(device, format, engine, output.width, output.height, benchmarkInput);
					if (effect !== 'filament') expect(result.engineBytes).toBe(engineBytes);
					expect(result.sampleFrames).toBe(60);
					expect(result.queuedWallMsPerFrame).toBeGreaterThan(0);
					if (result.gpuMs) {
						// Ordinary Chrome coarsens timestamps. A tiny pass may resolve
						// to zero; retain that limit in the report instead of failing or
						// silently substituting CPU timing as a GPU measurement.
						expect(Number.isFinite(result.gpuMs.p50)).toBe(true);
						expect(result.gpuMs.p50).toBeGreaterThanOrEqual(0);
						expect(result.gpuMs.p95).toBeGreaterThanOrEqual(result.gpuMs.p50);
					}
					const snapshot = await engine.inspect();
					expect(snapshot.finite).toBe(true);
					if (effect === 'filament') {
						// Native-error-bounded tessellation and MSAA are presentation
						// resources. They may grow; the simulated curve must not.
						expect(snapshot.details.nodes).toBe(initial.details.nodes);
						expect(snapshot.details.stateBytes).toBe(initial.details.stateBytes);
						expect(snapshot.details.resolvedCanvasBytes).toBe(result.outputBytes);
						expect(result.engineBytes).toBe(snapshot.details.stateBytes! + snapshot.details.attachmentBytes! + snapshot.details.meshBytes!);
					}
					console.info('Native presentation warmed performance', { effect, cssWidth: 1400, cssHeight: 660,
						pixelRatio, ...result,
						...(effect === 'filament' ? { resources: {
							nodes: snapshot.details.nodes, simulationBytes: snapshot.details.stateBytes,
							attachmentBytes: snapshot.details.attachmentBytes, meshBytes: snapshot.details.meshBytes,
							triangles: snapshot.details.triangles, segments: snapshot.details.segments,
							radialSegments: snapshot.details.radialSegments
						} } : {}) });
				}
			} finally { engine.dispose(); }
		}
	});
});
