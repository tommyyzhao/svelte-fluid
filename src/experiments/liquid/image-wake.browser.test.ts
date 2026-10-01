import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createImageWake, WAKE_CAPACITY, WAKE_ANGLE_BUDGET, type ImageWakeExperiment, type WakeAdmission } from './image-wake.js';
import { loadCoverImage } from './living-cover.js';
import { presentationSize } from './presentation-size.js';
import { measureEffectPerformance } from './effects-performance.js';
import type { LiquidInput } from './types.js';

let device: GPUDevice, bitmap: ImageBitmap;
const format: GPUTextureFormat = 'rgba8unorm';
const idle: LiquidInput = { active: false, x: 0.5, y: 0.5, vx: 0, vy: 0, tilt: 0 };
beforeAll(async () => { const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull(); device = await adapter!.requestDevice({ requiredFeatures: adapter!.features.has('timestamp-query') ? ['timestamp-query'] : [] }); bitmap = await loadCoverImage('/living-cover-arles.jpg'); });
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => { await device.queue.onSubmittedWorkDone(); expect(await device.popErrorScope()).toBeNull(); });
afterAll(() => { bitmap?.close(); device?.destroy(); });
async function pixels(engine: ImageWakeExperiment, width: number, height: number) {
	const row = Math.ceil(width * 4 / 256) * 256, texture = device.createTexture({ size: [width, height], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
	const readback = device.createBuffer({ size: row * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	try { const encoder = device.createCommandEncoder(); engine.render(encoder, texture.createView()); encoder.copyTextureToBuffer({ texture }, { buffer: readback, bytesPerRow: row }, [width, height]); device.queue.submit([encoder.finish()]);
		await readback.mapAsync(GPUMapMode.READ); const source = new Uint8Array(readback.getMappedRange()), result = new Uint8Array(width * height * 4);
		for (let y = 0; y < height; y++) result.set(source.subarray(y * row, y * row + width * 4), y * width * 4); return result;
	} finally { texture.destroy(); readback.destroy(); }
}
function difference(a: Uint8Array, b: Uint8Array) { let sum = 0, max = 0; for (let i = 0; i < a.length; i++) { const value = Math.abs(a[i] - b[i]); sum += value; max = Math.max(max, value); } return { mean: sum / a.length, max }; }
function corridor(a: Uint8Array, b: Uint8Array, width: number) {
	let inside = 0, outside = 0, count = 0, changed = 0;
	for (let i = 0; i < a.length; i += 4) { const x = i / 4 % width / width, y = Math.floor(i / 4 / width) / width, local = x > 0.1 && x < 0.85 && y > 0.22 && y < 0.65;
		const amount = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
		if (local) { inside += amount; count++; if (amount > 36) changed++; } else outside += amount;
	} return { fraction: inside / Math.max(1, inside + outside), mean: inside / count / 3, visiblyChanged: changed / count, outside };
}
function tick(engine: ImageWakeExperiment, count: number, input: (i: number) => LiquidInput = () => idle) { const encoder = device.createCommandEncoder(); for (let i = 0; i < count; i++) engine.step(encoder, 1 / 120, input(i)); device.queue.submit([encoder.finish()]); }
function stroke(engine: ImageWakeExperiment) { tick(engine, 61, (i) => ({ ...idle, active: true, x: 0.25 + i * 0.007, y: 0.43, vx: 0.84 })); }
function fillOverlapping(engine: ImageWakeExperiment) {
	engine.reset();
	for (let i = 0; i < WAKE_CAPACITY; i++) { engine.breakStroke(); engine.primeInput(0.485, 0.5); tick(engine, 1, () => ({ ...idle, active: true, x: 0.515, y: 0.5, vx: 1 })); }

	tick(engine, 10);
}
function endpointDifference(a: Uint8Array, b: Uint8Array, width: number, end: readonly [number, number]) {
	let sum = 0, count = 0, changed = 0;
	for (let y = Math.floor((end[1] - 0.06) * width); y < (end[1] + 0.06) * width; y++) for (let x = Math.floor((end[0] - 0.06) * width); x < (end[0] + 0.06) * width; x++) {
		const index = (y * width + x) * 4, delta = Math.abs(a[index] - b[index]) + Math.abs(a[index + 1] - b[index + 1]) + Math.abs(a[index + 2] - b[index + 2]);
		sum += delta; count++; changed += Number(delta > 24);
	}
	return { mean: sum / (count * 3), changed: changed / count };
}
function downsample(high: Uint8Array, width: number) {
	const result = new Uint8Array(width * width * 4), decoded = Array.from({ length: 256 }, (_, n) => { const x = n / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
	const encode = (n: number) => n <= 0.0031308 ? n * 12.92 : 1.055 * n ** (1 / 2.4) - 0.055;
	for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
		for (let c = 0; c < 3; c++) { let sum = 0; for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) sum += decoded[high[((y * 2 + dy) * width * 2 + x * 2 + dx) * 4 + c]]; result[(y * width + x) * 4 + c] = Math.round(encode(sum / 4) * 255); }
		result[(y * width + x) * 4 + 3] = 255;
	}
	return result;
}
async function referenceError(engine: ImageWakeExperiment, width: number, local = false) {
	engine.resize(width, width); const shown = await pixels(engine, width, width);
	engine.resize(width * 2, width * 2); const reference = downsample(await pixels(engine, width * 2, width * 2), width);
	const histogram = new Uint32Array(256); let n = 0, p99 = 0, sum = 0, count = 0, max = 0;
	for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
		if (local && (x / width < 0.32 || x / width > 0.68 || y / width < 0.3 || y / width > 0.7)) continue;
		for (let c = 0; c < 3; c++) { const i = (y * width + x) * 4 + c, delta = Math.abs(shown[i] - reference[i]); histogram[delta]++; sum += delta; count++; max = Math.max(max, delta); }
	}
	for (; p99 < 255; p99++) { n += histogram[p99]; if (n >= count * 0.99) break; }
	return { mean: sum / count, max, p99 };
}

describe('local retained original-image wake', () => {
	it('visibly locates a stroke at500ms, distinguishes the broad reference, and restores the original', async () => {
		const engine = await createImageWake(device, format, bitmap), width = 641;
		try { engine.resize(width, width); const rest = await pixels(engine, width, width); stroke(engine); const immediate = await pixels(engine, width, width); tick(engine, 60);
			const retained = await pixels(engine, width, width), local = corridor(rest, retained, width);
			expect(local.fraction).toBeGreaterThan(0.99); expect(local.mean).toBeGreaterThan(3); expect(local.visiblyChanged).toBeGreaterThan(0.08); expect(difference(immediate, retained).mean).toBeGreaterThan(0.2);
			engine.setReference(true); const broad = await pixels(engine, width, width), broadRegion = corridor(rest, broad, width); expect(broadRegion.fraction).toBeLessThan(0.9); expect(difference(retained, broad).mean).toBeGreaterThan(1);
			engine.setReference(false); engine.setStill(true); expect(difference(rest, await pixels(engine, width, width)).max).toBe(0); engine.setStill(false);
			tick(engine, 1400); expect(engine.settled).toBe(true); expect(difference(rest, await pixels(engine, width, width)).max).toBeLessThanOrEqual(1);
			console.info('Image wake at500ms / unchanged source / broad reference', { local, broad: broadRegion, immediateVsRetained: difference(immediate, retained) });
		} finally { engine.dispose(); }
	});
	it('retains native fractional2x/3x state and original source, with explicit memory rejection', async () => {
		const copy = await createImageBitmap(bitmap), engine = await createImageWake(device, format, copy); copy.close();
		try { engine.showTrace(); const before = await engine.inspect();
			for (const dpr of [2, 3]) { const size = presentationSize(420.375, 420.375, dpr); engine.resize(size.width, size.height); const image = await pixels(engine, size.width, size.height), after = await engine.inspect();
				expect(image.length).toBe(size.width * size.height * 4); expect(after.details.width).toBe(size.width); expect(after.details.height).toBe(size.height);
				for (let i = 0; i < 5; i++) { expect(after.details['age' + i]).toBe(before.details['age' + i]); expect(after.details['x' + i]).toBe(before.details['x' + i]); }
				expect(after.details.sourceWidth).toBe(3803); expect(after.details.sourceHeight).toBe(3162); expect(after.details.sourceBytes).toBe(64123008); expect(engine.memoryBytes).toBe(64123008 + 32 + WAKE_CAPACITY * 32);
			} expect(() => engine.resize(4097, 4097)).toThrow('Native image wake');
		} finally { engine.dispose(); }
	});
	it('bounds maximum history, preserves separate strokes, and never paints a stationary endpoint repeatedly', async () => {
		const engine = await createImageWake(device, format, bitmap);
		try { engine.resize(641, 641); stroke(engine); const first = await engine.inspect(); engine.endInput?.();
			tick(engine, 1, () => ({ ...idle, active: true, x: 0.92, y: 0.92, vx: 3 })); expect((await engine.inspect()).details.accepted).toBe(first.details.accepted);
			engine.primeInput(0.92, 0.92); tick(engine, 1, () => ({ ...idle, active: true, x: 0.2, y: 0.7, vx: -3 }));
			engine.breakStroke(); engine.primeInput(0.2, 0.7); tick(engine, 1, () => ({ ...idle, active: true, x: 0.9, y: 0.2, vx: 3 }));
			const filled = await engine.inspect(); expect(filled.details.packets).toBe(WAKE_CAPACITY); expect(filled.details.rejected).toBeGreaterThan(0); expect(filled.details.angleSum).toBeLessThanOrEqual(WAKE_ANGLE_BUDGET + 1e-8);
			tick(engine, 30, () => ({ ...idle, active: true, x: 0.9, y: 0.2 })); expect((await engine.inspect()).details.accepted).toBe(filled.details.accepted);
			await pixels(engine, 641, 641); tick(engine, 1400); expect(engine.settled).toBe(true);
		} finally { engine.dispose(); }
	});
	 it('filters full local history against a2x-per-axis linear-light reference without lowering native pixels', async () => {
		const engine = await createImageWake(device, format, bitmap), width = 401;
		try { engine.setDiagnostic(true); fillOverlapping(engine);
			expect((await engine.inspect()).details.packets).toBe(WAKE_CAPACITY);
			const error = await referenceError(engine, width); expect(error.mean).toBeLessThan(0.8); expect(error.max).toBeLessThanOrEqual(8); console.info('Image wake fully overlapping native grid vs2x-per-axis reference', error);
		} finally { engine.dispose(); }
	});
	it('retains useful500ms contrast with fewer ordinary packets and reaches full-stroke endpoints atnative2x/3x', async () => {
		const sparse = await createImageWake(device, format, bitmap), dense = await createImageWake(device, format, bitmap, 'dense-baseline');
		try {
			for (const dpr of [2, 3]) {
				const { width } = presentationSize(420.375, 420.375, dpr); sparse.resize(width, width); dense.resize(width, width);
				sparse.reset(); dense.reset(); const rest = await pixels(sparse, width, width);
				stroke(sparse); stroke(dense); tick(sparse, 60); tick(dense, 60);
				const after = corridor(rest, await pixels(sparse, width, width), width), before = corridor(rest, await pixels(dense, width, width), width);
				expect(after.fraction).toBeGreaterThan(0.99); expect(after.mean).toBeGreaterThan(3); expect(after.mean).toBeGreaterThan(before.mean * 0.5); expect(after.visiblyChanged).toBeGreaterThan(0.08);
				expect((await sparse.inspect()).details.packets).toBe(4); expect((await dense.inspect()).details.packets).toBe(7);
				console.info('Image wake sparse vs dense admission / same native renderer', { dpr, width, sparse: after, dense: before });
				for (const diagonal of [false, true]) {
					for (const engine of [sparse, dense]) {
						engine.reset(); engine.primeInput(0.1, diagonal ? 0.1 : 0.5);
						tick(engine, 96, (i) => ({ ...idle, active: true, x: 0.1 + (i + 1) / 96 * 0.8, y: diagonal ? 0.1 + (i + 1) / 96 * 0.8 : 0.5, vx: 1, vy: diagonal ? 1 : 0 })); tick(engine, 60);
					}
					const end = [0.9, diagonal ? 0.9 : 0.5] as const;
					const reached = endpointDifference(rest, await pixels(sparse, width, width), width, end), missed = endpointDifference(rest, await pixels(dense, width, width), width, end);
					expect((await sparse.inspect()).details.rejected).toBe(0); expect(missed.mean).toBe(0); expect(reached.mean).toBeGreaterThan(0.8); expect(reached.changed).toBeGreaterThan(0.025);
					console.info('Image wake full-stroke500ms endpoint', { dpr, diagonal, reached, missed });
				}
			}
		} finally { sparse.dispose(); dense.dispose(); }
	});
	it('checks real-photo footprint error in the stressed region, not just a grid or mostly unchanged background', async () => {
		const engine = await createImageWake(device, format, bitmap);
		try {
			for (const dpr of [2, 3]) {
				const { width } = presentationSize(420.375, 420.375, dpr);
				engine.reset(); const undeformed = await referenceError(engine, width, true); fillOverlapping(engine);
				const warped = await referenceError(engine, width, true); engine.setDiagnostic(true); const grid = await referenceError(engine, width, true); engine.setDiagnostic(false);
				// The source mip chain has its own baseline filtering error. Bound
				// additional error under twelve repeated local maps separately.
				expect(warped.mean).toBeLessThan(undeformed.mean * 1.5 + 0.5); expect(warped.p99).toBeLessThanOrEqual(undeformed.p99 + 8);
				expect(grid.mean).toBeLessThan(0.8); expect(grid.max).toBeLessThanOrEqual(8);
				console.info('Image wake local native photo footprint /12overlapping pairs', { dpr, width, undeformed, warped, grid, snapshot: await engine.inspect() });
			}
		} finally { engine.dispose(); }
	}, 30_000);
	it('measures sparse admission against the dense baseline at identical ordinary and capacity tapes', async () => {
		const results: Array<{ admission: WakeAdmission; dpr: number; tape: string; packets: number; timing: Awaited<ReturnType<typeof measureEffectPerformance>> }> = [];
		for (const admission of ['dense-baseline', 'sparse'] as const) {
			const engine = await createImageWake(device, format, bitmap, admission);
			try {
				for (const dpr of [2, 3]) for (const stress of [false, true]) {
					const { width } = presentationSize(420.375, 420.375, dpr); engine.reset();
					const timing = await measureEffectPerformance(device, format, engine, width, width, (frame) => {
						if (!stress) return { ...idle, active: frame <= 30, x: 0.25 + Math.min(frame, 30) * 0.014, y: 0.43, vx: frame <= 30 ? 0.84 : 0 };
						const angle = frame / 90 * Math.PI * 4; return { ...idle, active: true, x: 0.5 + 0.28 * Math.sin(angle), y: 0.5 + 0.23 * Math.cos(angle), vx: 2 * Math.cos(angle), vy: -2 * Math.sin(angle) };
					}, 1);
					if (timing.timedPassesPerFrame) expect(timing.timedPassesPerFrame).toEqual({ min: 1, max: 1 });
					const snapshot = await engine.inspect(); expect(snapshot.details.packets).toBe(stress ? snapshot.details.capacity : admission === 'sparse' ? 4 : 7);
					results.push({ admission, dpr, tape: stress ? 'capacity ellipse' : 'ordinary short stroke', packets: snapshot.details.packets, timing });
				}
			} finally { engine.dispose(); }
		}
		console.info('Image wake admission cost / warmed queued workload, not phone RAF or thermal performance', results);
	}, 60_000);
});
