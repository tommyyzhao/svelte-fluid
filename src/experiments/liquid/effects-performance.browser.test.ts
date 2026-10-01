import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createMercury } from './mercury.js';
import { createMembrane } from './membrane.js';
import { measureEffectPerformance } from './effects-performance.js';
import type { LiquidExperiment, LiquidInput, LiquidSnapshot } from './types.js';

let device: GPUDevice;
const format: GPUTextureFormat = 'rgba8unorm';
const idle: LiquidInput = { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, press: 0, tilt: 0 };
const errors: string[] = [];

beforeAll(async () => {
	expect(navigator.gpu).toBeDefined();
	const adapter = await navigator.gpu.requestAdapter();
	expect(adapter).not.toBeNull();
	const timestamps = adapter!.features.has('timestamp-query');
	device = await adapter!.requestDevice({ requiredFeatures: timestamps ? ['timestamp-query'] : [] });
	device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
	console.info('Effect benchmark adapter', {
		vendor: adapter!.info.vendor, architecture: adapter!.info.architecture,
		timestampQuery: timestamps, userAgent: navigator.userAgent
	});
});
beforeEach(() => { errors.length = 0; device.pushErrorScope('validation'); });
afterEach(async () => {
	await device.queue.onSubmittedWorkDone();
	const validation = await device.popErrorScope();
	expect(validation?.message ?? null).toBeNull();
	expect(errors).toEqual([]);
});
afterAll(() => device?.destroy());

async function advance(engine: LiquidExperiment, count: number, inputAt: (step: number) => LiquidInput = () => idle) {
	for (let step = 0; step < count; step++) {
		const encoder = device.createCommandEncoder();
		engine.step(encoder, 1 / 120, inputAt(step));
		device.queue.submit([encoder.finish()]);
	}
	await device.queue.onSubmittedWorkDone();
}

function expectFinite(snapshot: LiquidSnapshot) {
	expect(snapshot.finite).toBe(true);
	for (const value of [snapshot.min, snapshot.max, snapshot.kinetic, ...Object.values(snapshot.details)]) {
		expect(Number.isFinite(value)).toBe(true);
	}
}

async function renderPixels(engine: LiquidExperiment): Promise<Uint8Array> {
	engine.resize(512, 320);
	const target = device.createTexture({ size: [512, 320], format,
		usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
	const readback = device.createBuffer({ size: 512 * 320 * 4,
		usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	try {
		const encoder = device.createCommandEncoder();
		engine.render(encoder, target.createView());
		encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow: 2048 }, [512, 320]);
		device.queue.submit([encoder.finish()]);
		await readback.mapAsync(GPUMapMode.READ);
		const pixels = new Uint8Array(readback.getMappedRange()).slice();
		let excess = 0, invisibleColor = 0;
		for (let i = 0; i < pixels.length; i += 4) for (let c = 0; c < 3; c++) {
			excess = Math.max(excess, pixels[i + c]! - pixels[i + 3]!);
			if (!pixels[i + 3]) invisibleColor = Math.max(invisibleColor, pixels[i + c]!);
		}
		expect(excess).toBeLessThanOrEqual(1);
		expect(invisibleColor).toBe(0);
		return pixels;
	} finally { target.destroy(); readback.destroy(); }
}

function alphaComponents(pixels: Uint8Array) {
	const width = 512, height = 320;
	const visited = new Uint8Array(width * height);
	const queue = new Int32Array(width * height);
	let components = 0, tinyComponentPixels = 0, materialPixels = 0;
	for (let seed = 0; seed < visited.length; seed++) {
		if (visited[seed] || pixels[seed * 4 + 3]! < 128) continue;
		let head = 0, tail = 1;
		queue[0] = seed; visited[seed] = 1;
		while (head < tail) {
			const index = queue[head++]!;
			const x = index % width, y = Math.floor(index / width);
			for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
				const nx = x + dx, ny = y + dy;
				if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
				const neighbor = ny * width + nx;
				if (visited[neighbor] || pixels[neighbor * 4 + 3]! < 128) continue;
				visited[neighbor] = 1; queue[tail++] = neighbor;
			}
		}
		materialPixels += tail;
		if (tail >= 4) components++; else tinyComponentPixels += tail;
	}
	return { components, tinyComponentPixels, materialPixels };
}

const benchmarkInput = (frame: number): LiquidInput => {
	const angle = frame / 60 * Math.PI * 2;
	return { ...idle, x: 0.5 + 0.24 * Math.sin(angle), y: 0.5 + 0.1 * Math.cos(angle),
		vx: 0.24 * Math.PI * 2 * Math.cos(angle), vy: -0.1 * Math.PI * 2 * Math.sin(angle), active: true, press: 0.8 };
};

async function measureSizes(label: string, engine: LiquidExperiment, configuration: Record<string, number>) {
	for (const [width, height] of [[512, 320], [1000, 640]]) {
		engine.reset();
		const result = await measureEffectPerformance(device, format, engine, width!, height!, benchmarkInput);
		expect(result.sampleFrames).toBe(60);
		expect(result.queuedWallMsPerFrame).toBeGreaterThan(0);
		expectFinite(await engine.inspect());
		if (device.features.has('timestamp-query')) {
			expect(result.gpuMs).not.toBeNull();
			expect(result.gpuMs!.p50).toBeGreaterThanOrEqual(0);
			expect(result.gpuMs!.p95).toBeGreaterThanOrEqual(result.gpuMs!.p50);
		}
		console.info('Effect warmed performance', { effect: label, ...configuration, ...result });
	}
}

describe('effect-first behavior and warmed performance', () => {
	it('deforms the membrane optics from live state and recovers after the gesture', async () => {
		const membrane = await createMembrane(device, format);
		try {
			const restPixels = await renderPixels(membrane);
			await advance(membrane, 60);
			expect((await membrane.inspect()).details.heightRms).toBe(0);
			await advance(membrane, 90, (step) => ({ ...idle, x: 0.3 + step / 300,
				y: 0.5, vx: 0.4, vy: 0.15, active: true }));
			const moved = await membrane.inspect();
			expectFinite(moved);
			expect(moved.details.heightRms).toBeGreaterThan(1e-5);
			expect(moved.details.maxAbsHeight).toBeLessThanOrEqual(0.090001);
			const movedPixels = await renderPixels(membrane);
			let movedImageError = 0;
			for (let i = 0; i < restPixels.length; i++) movedImageError += Math.abs(movedPixels[i]! - restPixels[i]!);
			expect(movedImageError / (512 * 320)).toBeGreaterThan(1);
			await advance(membrane, 360);
			const recovered = await membrane.inspect();
			expectFinite(recovered);
			expect(recovered.details.heightRms).toBeLessThan(moved.details.heightRms! * 0.05);
			const recoveredPixels = await renderPixels(membrane);
			let recoveredImageError = 0;
			for (let i = 0; i < restPixels.length; i++) recoveredImageError += Math.abs(recoveredPixels[i]! - restPixels[i]!);
			expect(recoveredImageError).toBeLessThan(movedImageError);
			console.info('Membrane recovery', { movedRms: moved.details.heightRms,
				recoveredRms: recovered.details.heightRms, movedImageError, recoveredImageError });
		} finally { membrane.dispose(); }
	});

	it('measures membrane state grids at fixed output sizes', async () => {
		for (const gridSize of [192, 256]) {
			const membrane = await createMembrane(device, format, { gridSize });
			try { await measureSizes('membrane', membrane, { simulationGrid: gridSize }); }
			finally { membrane.dispose(); }
		}
	});

	it('keeps portrait membrane forcing isotropic in world space and stable through sustained gestures', async () => {
		const membrane = await createMembrane(device, format, { gridSize: 256 });
		const target = device.createTexture({ size: [280, 480], format, usage: GPUTextureUsage.RENDER_ATTACHMENT });
		const view = target.createView();
		try {
			membrane.resize(280, 480);
			const aspect = 280 / 480;
			await advance(membrane, 1, () => ({ ...idle, active: true, vx: 1 / aspect }));
			const horizontal = await membrane.inspect();
			membrane.reset();
			await advance(membrane, 1, () => ({ ...idle, active: true, vy: 1 }));
			const vertical = await membrane.inspect();
			expect(horizontal.details.heightRms).toBeGreaterThan(0);
			// Equal physical speed at the center has equal integrated impulse up
			// to grid quadrature. Raw normalized vx/vy are not equal world speeds.
			expect(Math.abs(horizontal.details.heightRms! / vertical.details.heightRms! - 1)).toBeLessThan(0.02);
			membrane.reset();
			for (let frame = 0; frame < 900; frame++) {
				const angle = frame / 24;
				const input = { ...idle, active: true, x: 0.5 + 0.42 * Math.sin(angle),
					y: 0.5 + 0.4 * Math.cos(angle * 0.7), vx: 3 * Math.cos(angle), vy: -3 * Math.sin(angle * 0.7) };
				const encoder = device.createCommandEncoder();
				membrane.step(encoder, 1 / 120, input);
				membrane.step(encoder, 1 / 120, input);
				membrane.render(encoder, view);
				device.queue.submit([encoder.finish()]);
				if (frame % 150 === 149) {
					const running = await membrane.inspect();
					expectFinite(running);
					expect(running.details.maxAbsHeight).toBeLessThanOrEqual(0.090001);
				}
			}
			// This narrower aspect needs multiple CFL substeps at this resolution.
			membrane.resize(140, 480);
			await advance(membrane, 120, (step) => ({ ...idle, active: true,
				x: 0.5 + 0.4 * Math.sin(step / 8), vx: 3, vy: -3 }));
			const forced = await membrane.inspect();
			expectFinite(forced);
			expect(forced.details.maxAbsHeight).toBeLessThanOrEqual(0.090001);
			await advance(membrane, 480);
			const recovered = await membrane.inspect();
			expectFinite(recovered);
			expect(recovered.details.heightRms).toBeLessThan(forced.details.heightRms! * 0.05);
			console.info('Portrait membrane stress', {
				equalSpeedRmsRatio: horizontal.details.heightRms! / vertical.details.heightRms!,
				forcedRms: forced.details.heightRms, recoveredRms: recovered.details.heightRms
			});
		} finally { target.destroy(); membrane.dispose(); }
	});

	it('pulls the mercury silhouette and reports detached islands before recovering', async () => {
		const mercury = await createMercury(device, format);
		try {
			const restPixels = await renderPixels(mercury);
			const rest = alphaComponents(restPixels);
			expect(rest.materialPixels).toBeGreaterThan(0);
			await advance(mercury, 90, (step) => ({ ...idle,
				x: 0.25 + 0.4 * step / 90, y: 0.53 - 0.23 * step / 90,
				vx: 0.4 / 0.75, vy: -0.23 / 0.75, active: true }));
			const pulled = await mercury.inspect();
			expectFinite(pulled);
			expect(pulled.details.rmsDisplacement).toBeGreaterThan(0.001);
			expect(pulled.details.maxSpeed).toBeLessThanOrEqual(3.8 + 1e-5);
			const pulledPixels = await renderPixels(mercury);
			let silhouetteDifference = 0;
			for (let i = 3; i < restPixels.length; i += 4) silhouetteDifference += Math.abs(restPixels[i]! - pulledPixels[i]!);
			expect(silhouetteDifference).toBeGreaterThan(255 * 20);
			await advance(mercury, 720);
			const recovered = await mercury.inspect();
			expectFinite(recovered);
			expect(recovered.details.rmsDisplacement).toBeLessThan(pulled.details.rmsDisplacement! * 0.05);
			expect(recovered.kinetic).toBeLessThan(pulled.kinetic);
			const recoveredPixels = await renderPixels(mercury);
			const recoveredTopology = alphaComponents(recoveredPixels);
			expect(recoveredTopology.components).toBe(rest.components);
			console.info('Mercury alpha topology (8-connected, alpha >= 128; islands >= 4 pixels)', {
				rest, pulled: alphaComponents(pulledPixels), recovered: recoveredTopology,
				pulledRms: pulled.details.rmsDisplacement, recoveredRms: recovered.details.rmsDisplacement
			});
		} finally { mercury.dispose(); }
	});

	it('measures mercury particle/density configurations at fixed output sizes', async () => {
		for (const configuration of [{ gridSize: 768, particleCount: 1800 }, { gridSize: 1024, particleCount: 5400 }]) {
			const mercury = await createMercury(device, format, configuration);
			try { await measureSizes('mercury', mercury, configuration); }
			finally { mercury.dispose(); }
		}
	});
});
