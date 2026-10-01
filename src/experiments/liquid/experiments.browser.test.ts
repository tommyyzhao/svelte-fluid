import { describe, expect, it } from 'vitest';
import { createFilm } from './film.js';
import { createVessel } from './vessel.js';
import type { LiquidExperiment, LiquidInput, LiquidSnapshot } from './types.js';

const idle: LiquidInput = { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, tilt: 0 };
const fixedStep = 1 / 120;

async function withDevice(
	check: (device: GPUDevice, format: GPUTextureFormat) => Promise<void>
): Promise<void> {
	expect(navigator.gpu, 'These experiments require an actual WebGPU adapter').toBeDefined();
	const adapter = await navigator.gpu.requestAdapter();
	expect(adapter, 'The browser must expose a usable WebGPU adapter').not.toBeNull();
	console.info('WebGPU adapter', {
		vendor: adapter!.info.vendor,
		architecture: adapter!.info.architecture,
		device: adapter!.info.device
	});
	const device = await adapter!.requestDevice();
	const uncaptured: string[] = [];
	device.addEventListener('uncapturederror', (event) => uncaptured.push(event.error.message));
	device.pushErrorScope('validation');
	try {
		await check(device, navigator.gpu.getPreferredCanvasFormat());
		await device.queue.onSubmittedWorkDone();
		expect(await device.popErrorScope()).toBeNull();
		expect(uncaptured).toEqual([]);
	} finally {
		device.destroy();
	}
}

async function advance(
	device: GPUDevice,
	experiment: LiquidExperiment,
	steps: number,
	inputAt: (step: number) => LiquidInput,
	batchSize = 1
): Promise<void> {
	for (let step = 0; step < steps; step += batchSize) {
		const encoder = device.createCommandEncoder();
		const input = inputAt(step);
		for (let offset = 0; offset < Math.min(batchSize, steps - step); offset++) {
			experiment.step(encoder, fixedStep, input);
		}
		// Every step in one submission has identical dt/input, matching the RAF
		// contract. queue.writeBuffer cannot capture different inputs per dispatch.
		device.queue.submit([encoder.finish()]);
		if ((step / batchSize) % 30 === 29) await device.queue.onSubmittedWorkDone();
	}
	await device.queue.onSubmittedWorkDone();
}

async function renderPixels(
	device: GPUDevice,
	format: GPUTextureFormat,
	experiment: LiquidExperiment,
	width = 128,
	height = 96
): Promise<Uint8Array> {
	experiment.resize(width, height);
	const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
	const texture = device.createTexture({
		size: [width, height],
		format,
		usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
	});
	const readback = device.createBuffer({
		size: bytesPerRow * height,
		usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
	});
	try {
		const encoder = device.createCommandEncoder();
		experiment.render(encoder, texture.createView());
		encoder.copyTextureToBuffer(
			{ texture },
			{ buffer: readback, bytesPerRow },
			[width, height]
		);
		device.queue.submit([encoder.finish()]);
		await readback.mapAsync(GPUMapMode.READ);
		return new Uint8Array(readback.getMappedRange()).slice();
	} finally {
		readback.destroy();
		texture.destroy();
	}
}

function expectFinite(snapshot: LiquidSnapshot): void {
	expect(snapshot.finite).toBe(true);
	for (const value of [snapshot.mass, snapshot.min, snapshot.max, snapshot.kinetic]) {
		expect(Number.isFinite(value)).toBe(true);
	}
	for (const [name, value] of Object.entries(snapshot.details)) {
		expect(Number.isFinite(value), `${name} must remain finite`).toBe(true);
	}
}

function expectFilmMass(snapshot: LiquidSnapshot, initialMass: number): void {
	expectFinite(snapshot);
	expect(snapshot.min).toBeGreaterThanOrEqual(0);
	expect(snapshot.mass).toBeGreaterThan(0);
	// Pair transfers conserve mass algebraically; storage rounds to f32. This
	// permits accumulated roundoff, not intentional sources, sinks, or clipping.
	expect(Math.abs(snapshot.mass - initialMass) / initialMass).toBeLessThan(1e-5);
}

function expectVesselCompression(snapshot: LiquidSnapshot): void {
	expectFinite(snapshot);
	// Initial regression envelope for these fixed tapes, not an accuracy claim:
	// Metal measured about 0.6% mean / 6.2% peak compression in the stress tape.
	// Positivity alone cannot catch a disabled or ineffective pressure solve.
	expect(snapshot.details.meanDensityError).toBeGreaterThanOrEqual(0);
	expect(snapshot.details.meanDensityError).toBeLessThan(0.025);
	expect(snapshot.details.maxCompression).toBeGreaterThanOrEqual(0);
	expect(snapshot.details.maxCompression).toBeLessThan(0.15);
}

describe('cleanroom compute liquid experiments', () => {
	it('moves a finite film downhill and with the brush without losing or creating liquid', async () => {
		await withDevice(async (device, format) => {
			const film = await createFilm(device, format);
			try {
				const initial = await film.inspect();
				expect(initial.mass).toBeGreaterThan(0);
				const initialPixels = await renderPixels(device, format, film);
				await advance(device, film, 120, () => idle);
				const level = await film.inspect();
				expectFilmMass(level, initial.mass);
				// With a level plate and no brush, overdamped hydrostatic leveling
				// must dissipate gravitational energy while preserving liquid volume.
				expect(initial.details.gravitationalEnergy).toBeGreaterThan(0);
				expect(level.details.gravitationalEnergy).toBeLessThan(initial.details.gravitationalEnergy!);
				expect(level.details.limiterFraction).toBe(0);

				film.reset();
				const reset = await film.inspect();
				expect(reset.mass).toBe(initial.mass);
				expect(reset.details.centroidX).toBe(initial.details.centroidX);
				expect(reset.details.centroidY).toBe(initial.details.centroidY);
				await advance(device, film, 120, () => ({ ...idle, tilt: 0.8 }));
				const tilted = await film.inspect();
				expectFilmMass(tilted, initial.mass);
				expect(tilted.details.limiterFraction).toBe(0);
				// Compare equal elapsed time against the level plate: asymmetric
				// initial puddles can move their centroid merely while spreading.
				expect(tilted.details.centroidY).toBeGreaterThan(level.details.centroidY!);

				film.reset();
				await advance(device, film, 120, () => ({ ...idle, tilt: 0.8 }), 4);
				const batched = await film.inspect();
				expect(batched.mass).toBe(tilted.mass);
				expect(batched.min).toBe(tilted.min);
				expect(batched.max).toBe(tilted.max);
				expect(batched.details.centroidY).toBe(tilted.details.centroidY);

				film.reset();
				await advance(device, film, 120, (step) => ({
					...idle,
					x: 0.25 + step / 240,
					y: 0.5,
					vx: 0.5,
					active: true
				}));
				const brushed = await film.inspect();
				expectFilmMass(brushed, initial.mass);
				expect(brushed.details.limiterFraction).toBe(0);
				expect(brushed.details.centroidX).toBeGreaterThan(level.details.centroidX!);
				const movedPixels = await renderPixels(device, format, film);
				expect(movedPixels.some((value, index) => value !== initialPixels[index])).toBe(true);

				// Output pixel dimensions are not a physical resize of the plate.
				await renderPixels(device, format, film, 192, 96);
				const resized = await film.inspect();
				expect(resized.mass).toBe(brushed.mass);
				expect(resized.details.centroidY).toBe(brushed.details.centroidY);
				console.info('film measurements', {
					relativeMassDrift: (brushed.mass - initial.mass) / initial.mass,
					levelEnergyRatio: level.details.gravitationalEnergy! / initial.details.gravitationalEnergy!,
					levelLimiterFraction: level.details.limiterFraction,
					tiltLimiterFraction: tilted.details.limiterFraction,
					brushLimiterFraction: brushed.details.limiterFraction,
					downhillCentroidTravel: tilted.details.centroidY! - level.details.centroidY!,
					brushCentroidTravel: brushed.details.centroidX! - level.details.centroidX!
				});
			} finally {
				film.dispose();
			}
		});
	});

	it('keeps moving vessel particles finite and enclosed without silently dropping neighbors', async () => {
		await withDevice(async (device, format) => {
			const vessel = await createVessel(device, format);
			try {
				const initial = await vessel.inspect();
				expect(initial.mass).toBeGreaterThan(0);
				const initialPixels = await renderPixels(device, format, vessel);
				await advance(device, vessel, 240, (step) => ({
					...idle,
					x: 0.35 + Math.min(step, 60) / 200,
					y: 0.5,
					vx: step < 60 ? 0.6 : 0,
					vy: step < 60 ? -0.2 : 0,
					active: step < 60,
					tilt: 0.8
				}));
				const moved = await vessel.inspect();
				expectFinite(moved);
				expect(moved.mass).toBe(initial.mass);
				expect(moved.details.particleCount).toBe(initial.details.particleCount);
				expect(moved.details.outOfBounds).toBe(0);
				expect(moved.details.neighborOverflow).toBe(0);
				// Constant particle count proves mass conservation but says nothing
				// about compression. Require separate, live density diagnostics.
				expect(moved.details.occupiedVolume).toBeGreaterThan(0);
				expectVesselCompression(moved);
				const movedPixels = await renderPixels(device, format, vessel);
				expect(movedPixels.some((value, index) => value !== initialPixels[index])).toBe(true);
				await renderPixels(device, format, vessel, 192, 96);
				expect((await vessel.inspect()).mass).toBe(moved.mass);

				vessel.reset();
				const reset = await vessel.inspect();
				expect(reset.mass).toBe(initial.mass);
				expect(reset.details.maxHeight).toBe(initial.details.maxHeight);
				console.info('vessel measurements', {
					meanCompression: moved.details.meanDensityError,
					maxCompression: moved.details.maxCompression,
					occupiedVolume: moved.details.occupiedVolume,
					particleMass: moved.mass
				});
			} finally {
				vessel.dispose();
			}
		});
	});

	it('settles unforced water and responds to the paddle with consistent batched stepping', async () => {
		await withDevice(async (device, format) => {
			const vessel = await createVessel(device, format);
			try {
				vessel.resize(128, 96);
				const initial = await vessel.inspect();
				await advance(device, vessel, 60, () => idle);
				const falling = await vessel.inspect();
				await advance(device, vessel, 60, () => idle);
				const idleAtOneSecond = await vessel.inspect();
				await advance(device, vessel, 360, () => idle);
				const settled = await vessel.inspect();
				expectVesselCompression(settled);
				expect(falling.kinetic).toBeGreaterThan(0);
				expect(settled.kinetic).toBeLessThan(falling.kinetic);
				expect(settled.details.maxHeight).toBeLessThan(initial.details.maxHeight!);
				expect(settled.details.outOfBounds).toBe(0);
				expect(settled.details.neighborOverflow).toBe(0);

				const paddle = { ...idle, active: true, vx: 0.25 };
				vessel.reset();
				await advance(device, vessel, 120, () => paddle);
				const pushed = await vessel.inspect();
				expectVesselCompression(pushed);
				// Screen-right paddle motion maps to world +x/-z. Compare with the
				// same initial block after equal time, so gravity cannot pass this test.
				// A 5 mm minimum excludes mere f32 symmetry drift (spacing is 115 mm).
				expect(pushed.details.centroidX! - idleAtOneSecond.details.centroidX!).toBeGreaterThan(0.005);
				expect(pushed.details.centroidZ! - idleAtOneSecond.details.centroidZ!).toBeLessThan(-0.005);

				vessel.reset();
				await advance(device, vessel, 120, () => paddle, 4);
				const batched = await vessel.inspect();
				expectVesselCompression(batched);
				// Atomic neighbor insertion changes f32 accumulation order. Compare
				// aggregate response, allowing 1 cm center drift and 5% energy drift;
				// these are regression margins, not physical-accuracy specifications.
				for (const coordinate of ['centroidX', 'centroidZ']) {
					expect(Math.abs(batched.details[coordinate]! - pushed.details[coordinate]!)).toBeLessThan(0.01);
				}
				expect(Math.abs(batched.kinetic - pushed.kinetic) / pushed.kinetic).toBeLessThan(0.05);
				console.info('vessel behavior measurements', {
					fallingEnergy: falling.kinetic,
					settledEnergy: settled.kinetic,
					paddleCentroidX: pushed.details.centroidX! - idleAtOneSecond.details.centroidX!,
					paddleCentroidZ: pushed.details.centroidZ! - idleAtOneSecond.details.centroidZ!,
					batchedEnergyRelativeDifference: (batched.kinetic - pushed.kinetic) / pushed.kinetic
				});
			} finally {
				vessel.dispose();
			}
		});
	});
});
