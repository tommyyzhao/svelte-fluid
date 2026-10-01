import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { loadCoverImage } from './living-cover.js';
import { createImageWake, WAKE_CAPACITY, WAKE_ANGLE_BUDGET } from './image-wake.js';
import { createCausticLight } from './caustic-light.js';
import { createFoamNetwork } from './foam-network.js';
import { createImprint } from './imprint.js';
import { createThreadStudy } from './thread-study.js';
import { createWickAndSwell } from './wick-and-swell.js';
import { createFrostPhase } from './frost-phase.js';
import { createDendriticGrowth } from './dendritic-growth.js';
import { createDendriteCpu, dendriteTotals } from './dendritic-growth-model.js';
import { frostTypeCoverage } from './frost-type-source.js';
import { createPeelRibbon } from './peel-ribbon.js';
import { createDewetting } from './dewetting.js';
import { createMagneticMeniscus } from './magnetic-meniscus.js';
import { createAdhesivePigment } from './capillary-pigment.js';
import { pigmentSubsteps } from './capillary-pigment-model.js';
import { createMeniscusState, meniscusTarget, advanceMeniscus, meniscusArea } from './magnetic-meniscus-model.js';
import { svgMeniscusGeometry } from './svg-meniscus-geometry.js';
import { measureEffectPerformance } from './effects-performance.js';
import { presentationSize } from './presentation-size.js';
import type { LiquidExperiment, LiquidInput, LiquidSnapshot } from './types.js';

// Direct model cost evidence, not DOM interaction latency, a sustained frame-rate
// gate, or a competition between unlike effects. Actual-route tests own zero-idle
// proof: this diagnostic deliberately submits frames even for a held specimen.
let device: GPUDevice, original: ImageBitmap;
const format = 'rgba8unorm' as const, errors: string[] = [];
const cssSizes = [[420.375, 260.625], [900, 520]] as const;
interface Size { cssWidth: number; cssHeight: number; dpr: number; width: number; height: number }
interface Fixture {
	engine: LiquidExperiment;
	inputDerivedWorkload?: Record<string, number>;
	event?(frame: number, input: LiquidInput): void;
	validate?(snapshot: LiquidSnapshot, size: Size): void;
}
interface Case {
	name: string; mechanism: string; capacity?: number;
	tape?(frame: number): LiquidInput;
	create(size: Size): Promise<Fixture>;
}

beforeAll(async () => {
	const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull();
	const timestampQuery = adapter!.features.has('timestamp-query');
	device = await adapter!.requestDevice({ requiredFeatures: timestampQuery ? ['timestamp-query'] : [] });
	device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
	const started = performance.now(); original = await loadCoverImage('/living-cover-arles.jpg');
	console.info('Mega batch benchmark environment', JSON.stringify({
		vendor: adapter!.info.vendor, architecture: adapter!.info.architecture, userAgent: navigator.userAgent,
		timestampQuery, browserDevicePixelRatio: devicePixelRatio, originalWidth: original.width, originalHeight: original.height,
		originalFetchDecodeWallMs: performance.now() - started,
		clock: 'Two identical 90-frame tapes when timestamps exist; each 30 warmup + 60 measured, two fixed 1/120s steps/frame. Queue throughput and one-in-flight pass timestamps are separate.',
		cache: 'Factory setup includes CPU preparation, pipeline creation, upload and drain; shader/driver cache state uncontrolled, not isolated raster cost or cache-cold compilation.',
		scope: 'Ordinary desktop Chrome direct model calls; native-output scale is not browser DPR or phone hardware. Rectangular allocation tests cost, not square-authored composition fidelity. DOM, compositor filters, event delivery and thermal endurance excluded.',
		memory: 'Live owned GPU buffers/textures plus one RGBA output. Borrowed decoded image, CPU preparation, diagnostic readbacks, pipeline/driver storage and swapchain replicas separately labelled/excluded.',
		timestamps: 'Quantized durations; zero samples mean below resolution, not free rendering. Sum real pass intervals, excluding gaps and copies outside passes.'
	}));
});
beforeEach(() => { errors.length = 0; device.pushErrorScope('validation'); });
afterEach(async () => { await device.queue.onSubmittedWorkDone(); expect(await device.popErrorScope()).toBeNull(); expect(errors).toEqual([]); });
afterAll(() => { original?.close(); device?.destroy(); });

function inputAt(frame: number): LiquidInput {
	const angle = frame / 60 * Math.PI * 2, active = frame < 75;
	return { x: 0.5 + 0.28 * Math.sin(angle), y: 0.5 + 0.2 * Math.cos(angle),
		vx: active ? 0.28 * Math.PI * 2 * Math.cos(angle) : 0, vy: active ? -0.2 * Math.PI * 2 * Math.sin(angle) : 0, active, press: active ? 0.5 : 0, tilt: 0 };
}
function withReset(engine: LiquidExperiment, reset: () => void): LiquidExperiment {
	return { get memoryBytes() { return engine.memoryBytes; }, resize: (w, h) => engine.resize(w, h), reset,
		step: (encoder, dt, input) => engine.step(encoder, dt, input), render: (encoder, target) => engine.render(encoder, target),
		inspect: () => engine.inspect(), dispose: () => engine.dispose() };
}
function finite(snapshot: LiquidSnapshot) {
	expect(snapshot.finite).toBe(true);
	for (const value of [snapshot.mass, snapshot.initialMass, snapshot.min, snapshot.max, snapshot.kinetic, ...Object.values(snapshot.details)]) expect(Number.isFinite(value)).toBe(true);
}
function imprintSource(size: Size) {
	// Same native maximum-tool footprint as the route; deterministic L + fine ring.
	const width = Math.ceil(Math.max(size.width, size.height) * 0.6), height = width;
	const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
	const context = canvas.getContext('2d', { willReadFrequently: true })!; context.scale(width, height); context.fillStyle = '#fff';
	context.fillRect(0.25, 0.2, 0.13, 0.6); context.fillRect(0.25, 0.66, 0.5, 0.14);
	context.strokeStyle = '#fff'; context.lineWidth = 0.012; context.beginPath(); context.arc(0.5, 0.5, 0.43, 0, Math.PI * 2); context.stroke();
	const rgba = context.getImageData(0, 0, width, height).data, data = new Uint8Array(width * height);
	for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4 + 3]!;
	return { width, height, data };
}
function frostGlyphSource(size: Size) {
	// Authored square typography is contained in this rectangular cost fixture.
	// Raster is genuinely native; only the physical seed is reduced to192².
	const canvas = document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height;
	try {
		const context = canvas.getContext('2d', { willReadFrequently: true })!, edge = Math.min(size.width, size.height);
		context.translate((size.width - edge) / 2, (size.height - edge) / 2); context.scale(edge / 1000, edge / 1000);
		context.fillStyle = '#fff'; context.font = '900 250px "Arial Black", Arial, sans-serif'; context.letterSpacing = '-18.75px';
		const metrics = context.measureText('Cold'), ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent,
			descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent, baseline = 250 + (220 - ascent - descent) / 2 + ascent;
		context.fillText('Cold', 80, baseline); context.fillText('type.', 80, baseline + 220);
		return frostTypeCoverage(context.getImageData(0, 0, size.width, size.height).data, size.width, size.height);
	} finally { canvas.width = canvas.height = 1; }
}

const cases: Case[] = [];
for (const stress of [false, true]) cases.push({ name: `image-wake-${stress ? 'capacity' : 'stroke'}`,
	mechanism: `Immutable source+mips, at most ${WAKE_CAPACITY} local packet pairs and total angle budget ${WAKE_ANGLE_BUDGET}; one fragment pass. ${stress ? 'Continuous ellipse, reporting refused packets at capacity.' : 'One short stroke then retained tail.'}`,
	tape: stress ? inputAt : (frame) => ({ x: 0.25 + Math.min(frame, 30) * 0.014, y: 0.43, vx: frame < 30 ? 0.84 : 0, vy: 0, active: frame < 30, tilt: 0 }),
	async create() { const model = await createImageWake(device, format, original); return { engine: model, validate(s) { expect(s.details.packets).toBeLessThanOrEqual(WAKE_CAPACITY); expect(s.details.accepted).toBeGreaterThan(0); expect(s.details.angleSum).toBeLessThanOrEqual(WAKE_ANGLE_BUDGET + 1e-6); } }; }
});
for (const [photonGrid, photo, interleaved] of [[128, false, true], [256, false, true], [128, false, false], [128, true, true], [256, true, true]] as const) cases.push({ name: `caustic-${photo ? 'cover-' : ''}${photonGrid}${interleaved ? '' : '-single-lattice'}`,
	mechanism: `${photonGrid}² forward photons; ${interleaved ? 'interleaved diamond footprints' : 'diagnostic single-lattice footprints'}; projection compute + additive native scalar receiver + ${photo ? 'original photograph/mip' : 'matte receiver'} presentation. Pointer moves the lens throughout the measured interval. Same photon counts do not imply the same splat fragment work.`,
	tape: (frame) => ({ ...inputAt(frame), active: true }),
	async create() { const model = await createCausticLight(device, format, { photonGrid, interleaved, ...(photo ? { image: original } : {}) }); return { engine: model, validate(s, size) { expect(s.details.photonCount).toBe(photonGrid ** 2); expect(s.details.attachmentBytes).toBe(size.width * size.height * 2); expect(s.details.projectionDispatches).toBeGreaterThan(0); if (photo) expect(s.details.sourceBytes).toBeGreaterThanOrEqual(original.width * original.height * 4); else expect(s.details.sourceBytes).toBe(0); } }; }
});
for (const stress of [false, true]) cases.push({ name: `foam-${stress ? 'rapid-strain' : 'exchange'}`,
	mechanism: 'Five equal-tension edges with a changing contact graph; bounded scalar descent, no volumetric fluid solve.',
	async create() { const model = await createFoamNetwork(device, format); return { engine: withReset(model, () => model.setStrain(-1, true)), event(frame) {
		if (stress && frame % 5 === 0) model.setStrain(Math.floor(frame / 5) % 2 ? -1 : 1);
		else if (!stress && frame === 0) model.setStrain(1); else if (!stress && frame === 60) model.setStrain(0);
	}, validate(s) { expect(s.details.halfLength).toBeGreaterThanOrEqual(0); } }; }
});
for (const count of [1, 8, 32]) cases.push({ name: `imprint-${count}`,
	mechanism: `${count} retained maximum-depth impressions; ${count === 32 ? 'all native signet samples for shader stress' : 'mixed analytic/native tools'}. Native source setup separate; route CSS drop-shadow compositor cost excluded.`,
	async create(size) { const model = await createImprint(device, format, imprintSource(size)); const reset = () => {
		model.reset(); for (let i = 0; i < count; i++) { model.setTool({ shape: count === 32 ? 'signet' : (['signet', 'rosette', 'comb', 'ring'] as const)[i % 4], size: 0.30 + 0.05 * (i % 3), rotation: i * 19, depth: 1, bevel: 0.006 }); model.stamp(0.35 + (i % 4) * 0.1, 0.4 + (i % 3) * 0.1, true); }
	}; return { engine: withReset(model, reset), validate(s) { expect(s.details.impressions).toBe(count); expect(s.max).toBeLessThanOrEqual(1); } }; }
});
for (const mode of ['feeding', 'full-history', 'braid'] as const) cases.push({ name: `thread-${mode}`,
	mechanism: 'Native adaptive tube triangles with4×MSAA color+depth; retained belt-material coordinates, appended-node uploads only. Full history/braid are deliberately forced static-render cost, not idle scheduling.',
	async create() { const model = await createThreadStudy(device, format); const reset = () => {
		model.reset(); model.setMode(mode === 'braid' ? 'braid' : 'deposition');
		if (mode === 'braid') model.setControls({ spacing: 0.2, turns: 4 });
		else { model.setControls({ ratio: 0.35, feed: mode === 'feeding' ? 0.55 : 1.2 }); model.depositSample(3); if (mode === 'full-history') { model.depositSample(3); model.depositSample(3); } else model.setFeeding(true); }
	}; return { engine: withReset(model, reset), validate(s, size) { expect(s.details.count).toBeGreaterThan(0); expect(s.details.attachmentBytes).toBe(size.width * size.height * 24); } }; }
});
cases.push({ name: 'wick-and-swell', mechanism: '128×80 mobile/absorbed material with a finite pipette, two compute passes/frame plus16-tap native relief; wet priming repeated identically after reset.',
	async create() { const model = await createWickAndSwell(device, format); return { engine: withReset(model, () => { model.reset(); model.drop(0.67, 0.5); model.advance(0.75); }), validate(s) { expect(Math.abs(s.details.ledger - s.details.initialLedger)).toBeLessThan(0.1); expect(s.min).toBeGreaterThanOrEqual(-1e-6); expect(s.details.absorbed).toBeGreaterThan(0); } }; }
});
for (const glyph of [false, true]) cases.push({ name: glyph ? 'frost-type' : 'frost-phase', capacity: 16,
	mechanism: `192² two-field kinetics; ${glyph ? 'native typography raster reduced once into a retained192² glyph seed; full native canvas/readback discarded' : 'localized circular nucleus'}; six compute passes per fixed step,13actualpasses/frame with native16-tap reconstruction. Timestamp capacity16, not a changed model.`,
	async create(size) { const model = await createFrostPhase(device, format, glyph ? frostGlyphSource(size) : undefined); return { engine: withReset(model, () => { model.reset(); model.seed(); }), validate(s) { expect(s.min).toBeGreaterThanOrEqual(-1e-6); expect(s.max).toBeLessThanOrEqual(1.00001); expect(s.details.steps).toBeGreaterThan(0); } }; }
});
cases.push({ name: 'dendritic-growth', capacity: 16,
	mechanism: 'Sealed192² phase/heat fields; positive anisotropic approximation, four coupled compute passes per fixed step and one native16-tap contour render (9passes/frame). Canonical seed restart repeated;1.5UI seconds measures active early-arm growth, not the later Show grown state. Thermal view uses the same field reads and is not a second workload.',
	async create() { const model = await createDendriticGrowth(device, format), initial = dendriteTotals(createDendriteCpu().cells); return {
		engine: withReset(model, () => model.restart()), validate(s) {
			expect(s.min).toBeGreaterThanOrEqual(-1e-7); expect(s.max).toBeLessThanOrEqual(1.000001);
			expect(Math.abs(s.details.enthalpy - initial.enthalpy)).toBeLessThan(8e-6);
			expect(s.details.steps).toBe(720); expect(s.details.modelSeconds).toBeCloseTo(0.81, 10);
			expect(s.details.phaseFraction).toBeGreaterThan(initial.phase);
		} };
	}
});
cases.push({ name: 'peel-ribbon', mechanism: '96 constrained arc-length segments, bounded CPU bending descent and native ribbon/shadow triangles, retained authored rest-angle memory.',
	async create() { const model = await createPeelRibbon(device, format); return { engine: model, event(frame, input) { if (frame < 75) model.set(0.32 + input.x * 0.5, 0.35 + input.y * 0.6); if (frame === 36) model.remember(); } }; }
});
cases.push({ name: 'dewetting', mechanism: 'One positive, exactly volume-accounted geometric hole/rim with bounded scalar energy descent;64B and one analytic native pass. Not the thin-film PDE.',
	async create() { const model = await createDewetting(device, format); return { engine: withReset(model, () => { model.reset(); model.seed(0.5, 0.5); }), validate(s) { expect(s.details.removedVolume).toBeCloseTo(s.details.rimVolume, 10); expect(s.details.energyResidual).toBeCloseTo(0, 9); expect(s.min).toBeGreaterThan(0); } }; }
});
cases.push({ name: 'magnetic-meniscus', mechanism: 'Area-preserving reduced contour modes around a pointer-driven magnet;128B, native analytic silhouette.',
	async create() { const model = await createMagneticMeniscus(device, format); return { engine: model, event(_frame, input) { model.setMagnet(input.x, input.y, input.active); }, validate(s) { expect(s.mass).toBeCloseTo(s.initialMass, 6); } }; }
});
for (const stress of [false, true]) {
	const tape = (frame: number): LiquidInput => {
		if (!stress) return { x: 0.25 + Math.min(frame, 75) / 150, y: 0.5, vx: frame < 75 ? 0.4 : 0, vy: 0, active: frame < 75, tilt: 0 };
		const phase = frame % 24 / 24, x = 0.2 + 1.2 * (phase < 0.5 ? phase : 1 - phase), speed = phase < 0.5 ? 3 : -3;
		return { x, y: x, vx: speed, vy: speed, active: true, tilt: 0 };
	};
	const dispatches = Array.from({ length: 90 }, (_, frame) => { const input = tape(frame); return pigmentSubsteps(1 / 120, input.vx, input.vy); });
	cases.push({ name: `adhesive-type-${stress ? 'fast-diagonal' : 'brush'}`, tape,
		mechanism: `Whole traversable192×96 sheet, finite blue2400dose and per-channel removed ledger, glyph adhesion capacity not walls. Clear-wash reaction primes each tape during warmup; ${stress ? 'bounded ±3/s diagonal transport stress' : 'ordinary .4/s horizontal brushing'}, adaptive CFL microdispatches in one compute pass per step.`,
		async create(size) {
			const model = await createAdhesivePigment(device, format);
			try { model.resize(size.width, size.height); await model.ready(); } catch (error) { model.dispose(); throw error; }
			return { engine: withReset(model, () => { model.reset(); model.pour(0); model.clearWash(); }),
				inputDerivedWorkload: { advanceDispatchesPerMeasuredFrameMean: dispatches.slice(30).reduce((sum, value) => sum + value * 2, 0) / 60,
					advanceDispatchesPerLogicalStepMax: Math.max(...dispatches) }, validate(s) {
				expect(Math.abs(s.mass + s.details.removed - s.initialMass)).toBeLessThan(0.1);
				for (let c = 0; c < 3; c++) expect(Math.abs(s.details[`injected${c}`] - s.details[`mobile${c}`] - s.details[`attached${c}`] - s.details[`removed${c}`])).toBeLessThan(0.1);
				expect(s.details.capacityError).toBeLessThanOrEqual(2e-6); expect(s.min).toBeGreaterThanOrEqual(-1e-6);
				expect(s.details.steps).toBe(dispatches.reduce((sum, value) => sum + value * 2, 0));
			} };
		}
	});
}

for (const testCase of cases) it(`records megabatch ${testCase.name} at component/large native2×3×`, async () => {
	for (const [cssWidth, cssHeight] of cssSizes) for (const dpr of [2, 3]) {
		const size = { cssWidth, cssHeight, dpr, ...presentationSize(cssWidth, cssHeight, dpr, device.limits.maxTextureDimension2D) };
		const started = performance.now(), fixture = await testCase.create(size), engine = fixture.engine;
		try {
			engine.resize(size.width, size.height); await device.queue.onSubmittedWorkDone();
			const factoryNativeSetupWallMs = performance.now() - started;
			engine.reset();
			const result = await measureEffectPerformance(device, format, engine, size.width, size.height, (frame) => {
				const input = (testCase.tape ?? inputAt)(frame); fixture.event?.(frame, input); return input;
			}, testCase.capacity ?? 8);
			const snapshot = await engine.inspect(); finite(snapshot); fixture.validate?.(snapshot, size);
			expect(result.engineBytes).toBe(engine.memoryBytes); expect(result.outputBytes).toBe(size.width * size.height * 4);
			if (testCase.name.startsWith('frost-') && result.timedPassesPerFrame) expect(result.timedPassesPerFrame).toEqual({ min: 13, max: 13 });
			if (testCase.name === 'dendritic-growth' && result.timedPassesPerFrame) expect(result.timedPassesPerFrame).toEqual({ min: 9, max: 9 });
			console.info('Mega batch benchmark row', JSON.stringify({ name: testCase.name, mechanism: testCase.mechanism, ...size, factoryNativeSetupWallMs,
				...result, inputDerivedWorkload: fixture.inputDerivedWorkload, ownedGpuPlusOutputBytes: result.engineBytes + result.outputBytes,
				queryInstrumentationBufferBytes: device.features.has('timestamp-query') ? 2 * 60 * (testCase.capacity ?? 8) * 2 * 8 : 0,
				snapshot }));
		} finally { engine.dispose(); }
	}
}, 60000);

it('records finite dendritic Show grown preparation separately from active frames', async () => {
	for (const [cssWidth, cssHeight] of cssSizes) for (const dpr of [2, 3]) {
		const size = { cssWidth, cssHeight, dpr, ...presentationSize(cssWidth, cssHeight, dpr, device.limits.maxTextureDimension2D) };
		const model = await createDendriticGrowth(device, format);
		const target = device.createTexture({ size: [size.width, size.height], format, usage: GPUTextureUsage.RENDER_ATTACHMENT });
		try {
			model.resize(size.width, size.height); model.restart(); await device.queue.onSubmittedWorkDone();
			const before = await model.inspect(), started = performance.now(); model.advanceStill(6.5);
			const encoder = device.createCommandEncoder(); model.render(encoder, target.createView()); device.queue.submit([encoder.finish()]);
			const encodeSubmitWallMs = performance.now() - started; await device.queue.onSubmittedWorkDone(); const queuedWallMs = performance.now() - started;
			const snapshot = await model.inspect(); finite(snapshot); expect(snapshot.details.steps).toBe(3120);
			expect(Math.abs(snapshot.details.enthalpy - before.details.enthalpy)).toBeLessThan(8e-6);
			console.info('Mega batch dendrite action row', JSON.stringify({ name: 'dendritic-show-grown', ...size,
				requestedUiSeconds: 6.5, modelSeconds: snapshot.details.modelSeconds, computePasses: snapshot.details.steps, nativeRenderPasses: 1,
				encodeSubmitWallMs, queuedWallMs, ownedGpuBytes: model.memoryBytes, outputBytes: size.width * size.height * 4, snapshot,
				scope: 'One explicit finite growth action followed by one native presentation; not per-frame cost. Factory, seed reset/upload drain, and diagnostic readbacks excluded. No isolated pass timestamps or cache-cold claim.' }));
		} finally { target.destroy(); model.dispose(); }
	}
}, 60000);

it('records native SVG contour generation as CPU work, not as a GPU-frame comparison', () => {
	for (const [cssWidth, cssHeight] of cssSizes) for (const dpr of [2, 3]) {
		const size = { cssWidth, cssHeight, dpr, ...presentationSize(cssWidth, cssHeight, dpr, device.limits.maxTextureDimension2D) };
		const state = createMeniscusState(), minimum = Math.min(size.width, size.height), times: number[] = [];
		let maxSegments = 0, maxErrorBound = 0, maxSerializedPathCodeUnits = 0;
		for (let frame = 0; frame < 90; frame++) {
			const input = inputAt(frame), started = performance.now();
			if (input.active) state.target.set(meniscusTarget((input.x - 0.5) * size.width / minimum, (input.y - 0.5) * size.height / minimum));
			else state.target.fill(0);
			advanceMeniscus(state, 1 / 120); advanceMeniscus(state, 1 / 120);
			const geometry = svgMeniscusGeometry(state.modes, size.width, size.height), elapsed = performance.now() - started;
			if (frame >= 30) times.push(elapsed);
			maxSegments = Math.max(maxSegments, geometry.segments); maxErrorBound = Math.max(maxErrorBound, geometry.errorBound);
			maxSerializedPathCodeUnits = Math.max(maxSerializedPathCodeUnits, geometry.clip.length + geometry.ring.length);
		}
		times.sort((a, b) => a - b); expect(times).toHaveLength(60); expect(maxErrorBound).toBeLessThan(0.2);
		expect(meniscusArea(state.modes)).toBeCloseTo(Math.PI * 0.09, 10);
		console.info('Mega batch SVG geometry row', JSON.stringify({ name: 'meniscus-svg-cpu-geometry', ...size,
			cpuMs: { p50: times[29], p95: times[56], min: times[0], max: times[59], mean: times.reduce((sum, value) => sum + value, 0) / 60, zeroSamples: times.filter((value) => value === 0).length },
			maxSegments, maxErrorBound, maxSerializedPathCodeUnits, typedStateBytes: state.modes.byteLength + state.target.byteLength,
			scope: 'Synchronous shared attraction/mode update and native path generation only. No mounted SVG, DOM mutation, photograph decode, layout, rasterization, compositor or GPU timings. Not an end-to-end winner claim over WebGPU; string/driver heap unmeasured.' }));
	}
});
