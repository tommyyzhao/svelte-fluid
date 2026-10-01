import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { createLivingCover, loadCoverImage, type CoverVariant } from './living-cover.js';
import { createCapillaryPigment } from './capillary-pigment.js';
import { pigmentSubsteps } from './capillary-pigment-model.js';
import { createMaterialType, smoothTypeProfile } from './material-type.js';
import { enamelProfile } from './enamel-profile.js';
import { createTactileMaterial, type TactileKind } from './tactile-materials.js';
import { createContourWaves } from './contour-waves.js';
import { measureEffectPerformance } from './effects-performance.js';
import { presentationSize } from './presentation-size.js';
import type { LiquidExperiment, LiquidInput, LiquidSnapshot } from './types.js';

// Hardware evidence, not a frame-rate gate or a ranking between different effects.
// Source construction/upload is measured separately from the warmed GPU tapes.
// The browser/driver shader cache is uncontrolled: factory wall time is NOT a
// repeatable cache-cold compilation benchmark, nor a network-startup measurement.
// A common normalized input tape measures each model's output-size scaling;
// different authored domains/coverage are not equivalent simulation workloads.
// The separately labelled fast pigment tape probes the bounded CFL work ceiling.
let device: GPUDevice;
let original: ImageBitmap;
const format: GPUTextureFormat = 'rgba8unorm';
const errors: string[] = [];
const cssSizes = [[420.375, 260.625], [900, 520]] as const;

beforeAll(async () => {
	expect(navigator.gpu).toBeDefined();
	const adapter = await navigator.gpu.requestAdapter();
	expect(adapter).not.toBeNull();
	const timestampQuery = adapter!.features.has('timestamp-query');
	device = await adapter!.requestDevice({ requiredFeatures: timestampQuery ? ['timestamp-query'] : [] });
	device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
	const started = performance.now();
	original = await loadCoverImage('/living-cover-arles.jpg');
	console.info('Research effects benchmark environment', JSON.stringify({
		vendor: adapter!.info.vendor, architecture: adapter!.info.architecture,
		userAgent: navigator.userAgent, timestampQuery, browserDevicePixelRatio: window.devicePixelRatio,
		originalWidth: original.width, originalHeight: original.height,
		originalFetchDecodeWallMs: performance.now() - started,
		clock: '90-frame throughput tape, repeated for timestamps when supported; 30 warmup + 60 measured; two 1/120 s steps/frame.',
		tape: 'Hover frames 0–59; held contact 30–35; activation 36; leave 60; rest through 89. The explicitly labelled fast pigment case replaces the ellipse with a bounded diagonal triangle wave at ±3 normalized units/s per axis.',
		limits: 'Queued desktop work, not RAF latency, phone throughput, or thermal endurance.',
		memory: 'Engine-owned GPU buffers/textures include source images/mips/coverage; one RGBA output is added once. CPU source preparation, driver/pipeline storage, and swapchain replicas excluded.'
	}));
});
beforeEach(() => { errors.length = 0; device.pushErrorScope('validation'); });
afterEach(async () => {
	await device.queue.onSubmittedWorkDone();
	expect((await device.popErrorScope())?.message ?? null).toBeNull();
	expect(errors).toEqual([]);
});
afterAll(() => { original?.close(); device?.destroy(); });

interface Size {
	cssWidth: number;
	cssHeight: number;
	dpr: number;
	width: number;
	height: number;
}
interface Fixture {
	engine: LiquidExperiment;
	/** Input-derived work counts are verified against the model's actual counter. */
	workload?: Record<string, number>;
	/** One DOM-style event delivery per frame, not once per fixed substep. */
	event?(frame: number, input: LiquidInput): void;
	validate(snapshot: LiquidSnapshot, size: Size): void;
}
interface Case {
	name: string;
	mechanism: string;
	inputAt?(frame: number): LiquidInput;
	create(size: Size): Promise<Fixture>;
}

function inputAt(frame: number): LiquidInput {
	const active = frame < 60;
	const angle = frame / 60 * Math.PI * 2;
	return { x: 0.5 + 0.28 * Math.sin(angle), y: 0.5 + 0.22 * Math.cos(angle),
		vx: active ? 0.28 * Math.PI * 2 * Math.cos(angle) : 0,
		vy: active ? -0.22 * Math.PI * 2 * Math.sin(angle) : 0,
		active, press: frame >= 30 && frame < 36 ? 0.85 : 0, tilt: 0 };
}

function fastPigmentInputAt(frame: number): LiquidInput {
	// 0.2→0.8→0.2 in 24 frames at 60 Hz: derivative magnitude is exactly 3/s.
	// This is a fast pointer-motion stress case, not a different device class.
	const phase = frame % 24 / 24, active = frame < 60;
	const position = 0.2 + 1.2 * (phase < 0.5 ? phase : 1 - phase);
	const velocity = active ? (phase < 0.5 ? 3 : -3) : 0;
	return { x: position, y: position, vx: velocity, vy: velocity, active, press: 0, tilt: 0 };
}

/** Forward the dynamic byte count; spreading an engine freezes its getter and
 * would under-report a source/coverage allocation made during native resize. */
function withReset(engine: LiquidExperiment, reset: () => void): LiquidExperiment {
	return {
		get memoryBytes() { return engine.memoryBytes; },
		resize: (width, height) => engine.resize(width, height), reset,
		endInput: () => engine.endInput?.(),
		step: (encoder, dt, input) => engine.step(encoder, dt, input),
		render: (encoder, target) => engine.render(encoder, target),
		inspect: () => engine.inspect(), dispose: () => engine.dispose()
	};
}

function expectFinite(snapshot: LiquidSnapshot): void {
	expect(snapshot.finite).toBe(true);
	for (const value of [snapshot.mass, snapshot.initialMass, snapshot.min, snapshot.max,
		snapshot.kinetic, ...Object.values(snapshot.details)]) expect(Number.isFinite(value)).toBe(true);
}

function materialSource(size: Size) {
	const canvas = document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height;
	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) throw new Error('Benchmark native type coverage is unavailable.');
	context.scale(size.width / size.cssWidth, size.height / size.cssHeight);
	context.fillStyle = '#fff'; context.font = `bold ${size.cssHeight * 0.72}px Georgia`;
	context.textAlign = 'center'; context.textBaseline = 'middle';
	context.fillText('Soft', size.cssWidth / 2, size.cssHeight * 0.52, size.cssWidth * 0.86);
	const rgba = context.getImageData(0, 0, size.width, size.height).data;
	const coverage = new Uint8Array(size.width * size.height);
	for (let i = 0; i < coverage.length; i++) coverage[i] = rgba[i * 4 + 3]!;
	return { ...smoothTypeProfile(enamelProfile(coverage, size.width, size.height)), aspect: size.cssWidth / size.cssHeight };
}

const cases: Case[] = [];
for (const variant of ['aperture', 'reveal'] satisfies CoverVariant[]) {
	cases.push({ name: `living-${variant}`, mechanism: 'Fixed original photograph + complete source mip chain; six bounded inverse-map modes move only the boundary; one native fragment pass.',
		async create() {
			const model = await createLivingCover(device, format, original);
			model.setVariant(variant);
			const reset = () => { model.reset(); model.setReveal(false, true); };
			return { engine: withReset(model, reset), event(frame) {
				if (variant === 'reveal' && frame === 36) model.setReveal(true);
				if (variant === 'reveal' && frame === 60) model.setReveal(false);
			}, validate(snapshot) {
				expect(snapshot.details.sourceWidth).toBe(original.width);
				expect(snapshot.details.sourceHeight).toBe(original.height);
				expect(snapshot.details.sourceBytes).toBeGreaterThanOrEqual(original.width * original.height * 4);
				expect(model.memoryBytes).toBe(snapshot.details.sourceBytes! + snapshot.details.uniformBytes!);
				for (let i = 0; i < 6; i++) expect(Math.abs(snapshot.details[`a${i}`]!)).toBeLessThanOrEqual(0.600001);
			} };
		} });
}

for (const [geometry, fast] of [['type', false], ['emblem', false], ['emblem', true]] as const) {
	const tape = fast ? fastPigmentInputAt : inputAt;
	const dispatches = Array.from({ length: 90 }, (_, frame) => {
		const input = tape(frame);
		return pigmentSubsteps(1 / 120, input.active ? input.vx : 0, input.active ? input.vy : 0);
	});
	const workload = {
		advanceDispatchesPerTape: dispatches.reduce((sum, count) => sum + count * 2, 0),
		advanceDispatchesPerLogicalStepMin: Math.min(...dispatches),
		advanceDispatchesPerLogicalStepMax: Math.max(...dispatches),
		advanceDispatchesPerMeasuredFrameMean: dispatches.slice(30).reduce((sum, count) => sum + count * 2, 0) / 60
	};
	cases.push({ name: `bounded-pigment-${geometry}${fast ? '-fast' : ''}`, inputAt: tape,
		mechanism: `192×96 conservative mobile/attached pigment in ${geometry} domain; two finite color doses; native R8 coverage; unit-correct pointer transport with adaptive CFL microdispatches in one compute pass per logical step, no ambient emitter. ${fast ? 'Fast diagonal input reaches the nine-microdispatch ceiling.' : 'Shared ellipse input.'} Empty native pixels skip material sampling, so covered area also changes fragment work.`,
		async create(size) {
			const model = await createCapillaryPigment(device, format, geometry);
			try {
				model.resize(size.width, size.height); await model.ready();
			} catch (error) { model.dispose(); throw error; }
			const reset = () => { model.reset(); model.pour(0); model.pour(1); };
			return { engine: withReset(model, reset), workload, validate(snapshot) {
				expect(snapshot.initialMass).toBeCloseTo(840, 2);
				expect(Math.abs(snapshot.mass - snapshot.initialMass)).toBeLessThan(0.1);
				expect(snapshot.min).toBeGreaterThanOrEqual(-1e-6);
				expect(snapshot.details.capacity).toBeLessThanOrEqual(0.80001);
				expect(snapshot.details.outside).toBe(0);
				expect(snapshot.details.nativeCoverageBytes).toBe(size.width * size.height);
				expect(snapshot.details.pendingCoverageBytes).toBe(0);
				expect(snapshot.details.steps).toBe(workload.advanceDispatchesPerTape);
				if (fast) expect(workload.advanceDispatchesPerLogicalStepMax).toBe(9);
			} };
		} });
}

for (const finish of ['enamel', 'velvet'] as const) {
	cases.push({ name: `material-type-${finish}`, mechanism: `Stationary native glyph profile; fixed 96×64 nap and polishing buffers; ${finish === 'enamel' ? 'persistent enamel micro-roughness polishing' : 'persistent directional velvet nap'} from pointer movement; filtered native finish.`,
		async create(size) {
			const model = await createMaterialType(device, format, materialSource(size));
			model.setFinish(finish);
			model.setGeometryMotion(false);
			return { engine: model, validate(snapshot) {
				expect(snapshot.min).toBeGreaterThan(0);
				expect(snapshot.details.sourceWidth).toBe(size.width);
				expect(snapshot.details.sourceHeight).toBe(size.height);
				expect(snapshot.details.profileBytes).toBe(size.width * size.height * 4);
				expect(snapshot.details.pendingBytes).toBe(0);
				expect(model.memoryBytes).toBe(snapshot.details.fixedBytes! + snapshot.details.profileBytes!);
				expect(snapshot.details.fixedBytes).toBe(96 * 64 * 12 + 48);
				expect(snapshot.details.geometryMotion).toBe(0);
				expect(snapshot.max).toBe(0);
				expect(snapshot.details.brushCount).toBeGreaterThan(0);
				if (finish === 'enamel') {
					expect(snapshot.details.polishedCells).toBeGreaterThan(0);
					expect(snapshot.details.polishSum).toBeGreaterThan(0);
					expect(snapshot.details.changedCells).toBe(0);
				} else {
					expect(snapshot.details.changedCells).toBeGreaterThan(0);
					expect(snapshot.details.polishSum).toBe(0);
				}
			} };
		} });
}

for (const kind of ['glass', 'foil'] satisfies TactileKind[]) {
	cases.push({ name: `tactile-${kind}`, mechanism: `DOM-style hover/contact/activation adapter; bounded 32-byte illustrative material; no simulation texture.${kind === 'foil' ? ' Controlled foil uses the authored 8× response timescale and scalar CPU microsteps.' : ''}`,
		async create() {
			const model = await createTactileMaterial(device, format, kind);
			const reset = () => { model.reset(); model.commit(false, true); model.interrupt(); };
			return { engine: withReset(model, reset), event(frame, input) {
				if (input.active) model.move(input.x, input.y);
				if (frame === 30) model.press(true);
				if (frame === 36) { model.press(false); if (kind === 'glass') model.pulse(); else model.commit(true); }
				if (frame === 60) { model.leave(); if (kind === 'foil') model.commit(false); }
			}, validate(snapshot) {
				expect(model.memoryBytes).toBe(32);
				expect(snapshot.details.held).toBe(0);
				expect(snapshot.details.selected).toBe(0);
				if (kind === 'glass') {
					expect(snapshot.details.pressure).toBeGreaterThanOrEqual(0);
					expect(snapshot.details.pressure).toBeLessThanOrEqual(1);
				} else {
					expect(snapshot.details.committed).toBe(1);
					expect(snapshot.details.hovered).toBe(0);
					expect(snapshot.details.responseRate).toBe(8);
				}
			} };
		} });
}

cases.push({ name: 'contour-echoes', mechanism: 'Two bounded periodic contour wave fields with size-specific amplitude and damping response; 24 modes and 256 samples each; native analytic rim reconstruction.',
	async create() {
		const model = await createContourWaves(device, format);
		return { engine: model, event(frame, input) {
			// The activation impulse hits an authored rim even if the generic
			// hover trajectory happens to miss it at a particular contain aspect.
			if (frame === 36) model.pulse(0, input.x);
		}, validate(snapshot) {
			expect(snapshot.details.impulses).toBeGreaterThan(0);
			expect(snapshot.details.envelope0).toBeLessThanOrEqual(snapshot.details.amplitudeLimit0! + 1e-6);
			expect(snapshot.details.envelope1).toBeLessThanOrEqual(snapshot.details.amplitudeLimit1! + 1e-6);
			expect(model.memoryBytes).toBe(snapshot.details.stateBytes);
		} };
	} });

for (const fixture of cases) {
	it(`records ${fixture.name} at component/large fractional-native 2×/3× sizes`, async () => {
		for (const [cssWidth, cssHeight] of cssSizes) for (const dpr of [2, 3]) {
			const native = presentationSize(cssWidth, cssHeight, dpr, device.limits.maxTextureDimension2D);
			const size = { cssWidth, cssHeight, dpr, ...native };
			const started = performance.now();
			const prepared = await fixture.create(size);
			const { engine } = prepared;
			try {
				engine.resize(size.width, size.height);
				await device.queue.onSubmittedWorkDone();
				const factoryNativePreparationWallMs = performance.now() - started;
				engine.reset();
				const result = await measureEffectPerformance(device, format, engine, size.width, size.height, (frame) => {
					const input = (fixture.inputAt ?? inputAt)(frame); prepared.event?.(frame, input); return input;
				});
				const snapshot = await engine.inspect();
				expectFinite(snapshot); prepared.validate(snapshot, size);
				expect(result.warmupFrames).toBe(30); expect(result.sampleFrames).toBe(60);
				expect(result.simulationStepsPerFrame).toBe(2);
				expect(result.outputBytes).toBe(size.width * size.height * 4);
				expect(result.engineBytes).toBe(engine.memoryBytes);
				expect(result.engineBytes).toBeGreaterThan(0);
				for (const value of [factoryNativePreparationWallMs, result.cpuEncodeSubmitMsPerFrame, result.queuedWallMsPerFrame]) {
					expect(Number.isFinite(value)).toBe(true); expect(value).toBeGreaterThanOrEqual(0);
				}
				if (device.features.has('timestamp-query')) {
					expect(result.gpuMs).not.toBeNull();
					expect(result.gpuMs!.p50).toBeGreaterThanOrEqual(0);
					expect(result.gpuMs!.p95).toBeGreaterThanOrEqual(result.gpuMs!.p50);
					expect(result.timedPassesPerFrame!.min).toBeGreaterThan(0);
				} else expect(result.gpuMs).toBeNull();
				console.info('Research effects warmed benchmark', JSON.stringify({ name: fixture.name,
					mechanism: fixture.mechanism, workload: prepared.workload, ...size, factoryNativePreparationWallMs,
					factoryCacheState: 'Uncontrolled browser/driver cache; combined source/profile preparation, pipeline setup and queued upload completion wall time, not isolated CPU raster cost.',
					...result, ownedGpuPlusOneOutputBytes: result.engineBytes + result.outputBytes,
					benchmarkQueryBufferBytes: device.features.has('timestamp-query') ? 2 * 60 * 8 * 2 * 8 : 0,
					snapshot }));
			} finally { engine.dispose(); }
		}
	});
}
