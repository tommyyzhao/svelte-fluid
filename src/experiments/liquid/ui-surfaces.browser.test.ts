import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFilm, type FilmExperiment, type FilmOptions } from './film.js';
import { LabSession } from './LabSession.js';
import type { LiquidExperiment, LiquidInput, LiquidSnapshot } from './types.js';

let device: GPUDevice;
const format: GPUTextureFormat = 'rgba8unorm';
const uncaptured: string[] = [];
const idle: LiquidInput = { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, tilt: 0 };

beforeAll(async () => {
	expect(navigator.gpu, 'The surface tests require WebGPU').toBeDefined();
	const adapter = await navigator.gpu.requestAdapter();
	expect(adapter).not.toBeNull();
	console.info('UI surface adapter', adapter!.info.vendor, adapter!.info.architecture);
	device = await adapter!.requestDevice();
	device.addEventListener('uncapturederror', (event) => uncaptured.push(event.error.message));
});

beforeEach(() => {
	uncaptured.length = 0;
	device.pushErrorScope('validation');
});

afterEach(async () => {
	await device.queue.onSubmittedWorkDone();
	expect(await device.popErrorScope()).toBeNull();
	expect(uncaptured).toEqual([]);
});

afterAll(() => device?.destroy());

async function usingFilms(options: FilmOptions[], check: (films: FilmExperiment[]) => Promise<void>) {
	const films: FilmExperiment[] = [];
	try {
		for (const option of options) films.push(await createFilm(device, format, option));
		await check(films);
	} finally {
		for (const film of films) film.dispose();
	}
}

async function advance(film: FilmExperiment, steps: number, input = idle) {
	for (let step = 0; step < steps; step += 4) {
		const encoder = device.createCommandEncoder();
		for (let offset = 0; offset < Math.min(4, steps - step); offset++) film.step(encoder, 1 / 120, input);
		device.queue.submit([encoder.finish()]);
	}
	await device.queue.onSubmittedWorkDone();
}

async function pixels(film: FilmExperiment): Promise<Uint8Array> {
	film.resize(64, 64);
	const texture = device.createTexture({
		size: [64, 64], format,
		usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
	});
	const readback = device.createBuffer({
		size: 64 * 64 * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
	});
	try {
		const encoder = device.createCommandEncoder();
		film.render(encoder, texture.createView());
		encoder.copyTextureToBuffer({ texture }, { buffer: readback, bytesPerRow: 256 }, [64, 64]);
		device.queue.submit([encoder.finish()]);
		await readback.mapAsync(GPUMapMode.READ);
		return new Uint8Array(readback.getMappedRange()).slice();
	} finally {
		texture.destroy();
		readback.destroy();
	}
}

function expectConserved(snapshot: LiquidSnapshot, mass: number) {
	expect(snapshot.finite).toBe(true);
	expect(snapshot.min).toBeGreaterThanOrEqual(0);
	expect(Math.abs(snapshot.mass - mass) / mass).toBeLessThan(1e-5);
	expect(snapshot.details.solidMass).toBe(0);
}

describe('liquid UI surfaces', () => {
	it('delivers a between-frame tap once and discards canceled contact before simulation', async () => {
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 32;
		document.body.append(canvas);
		const samples: LiquidInput[] = [];
		const contactFrames: number[] = [];
		let renderedFrames = 0;
		let disposed = false;
		const recorder: LiquidExperiment = {
			memoryBytes: 0,
			resize() {},
			reset() {},
			step(_encoder, _dt, input) {
				samples.push({ ...input });
				if (input.press) contactFrames.push(renderedFrames);
			},
			render() { renderedFrames++; },
			async inspect() {
				return { finite: true, mass: 0, initialMass: 0, min: 0, max: 0, kinetic: 0, details: {} };
			},
			dispose() { disposed = true; }
		};
		const session = await LabSession.create(canvas, () => {});
		const until = async (condition: () => boolean) => {
			for (let frame = 0; frame < 60 && !condition(); frame++) {
				await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
				expect(session.state.error).toBe('');
			}
			expect(condition(), 'The live frame scheduler must eventually deliver the input').toBe(true);
		};
		try {
			await session.load(async () => recorder);
			session.setContact(1);
			session.setContact(0);
			await until(() => samples.some((input) => input.press === 1) && samples.at(-1)?.press === 0);
			const firstRelease = samples.findIndex((input) => input.press === 0);
			expect(firstRelease).toBeGreaterThan(0);
			expect(samples.slice(0, firstRelease).every((input) => input.press === 1)).toBe(true);
			// A frame may execute several fixed steps; the retained pulse ends at
			// the next submission rather than sticking through later idle frames.
			const afterTap = samples.length;
			await until(() => samples.length >= afterTap + 4);
			expect(samples.slice(firstRelease).every((input) => input.press === 0)).toBe(true);
			expect(new Set(contactFrames).size).toBe(1);

			const beforeCancellation = samples.length;
			session.setContact(1);
			session.setContact(0);
			session.cancelContact();
			await until(() => samples.length >= beforeCancellation + 4);
			expect(samples.slice(beforeCancellation).every((input) => input.press === 0)).toBe(true);
		} finally {
			session.dispose();
			canvas.remove();
		}
		expect(disposed).toBe(true);
	});

	it('uses glyph boundaries in transport rather than merely clipping the rendered liquid', async () => {
		const width = 48, height = 32;
		const solid = new Uint8Array(width * height).fill(1);
		const initial = new Float32Array(width * height);
		for (let y = 4; y < 28; y++) {
			for (let x = 6; x < 42; x++) {
				// A U-shaped channel has connected strokes and a hollow interior.
				if (x < 12 || x >= 36 || y >= 22) solid[y * width + x] = 0;
				if (x >= 7 && x < 11 && y >= 8 && y < 18) initial[y * width + x] = 0.6;
			}
		}
		await usingFilms([
			{ width, height, initial, solid, brushRadius: 0.5 },
			{ width, height, initial, brushRadius: 0.5 }
		], async ([channel, open]) => {
			const initialMass = (await channel.inspect()).mass;
			const brush = { ...idle, x: 0.2, y: 0.4, vx: 1, vy: 0.2, active: true };
			await advance(channel, 120, brush);
			await advance(open, 120, brush);
			const confined = await channel.inspect();
			const unconstrained = await open.inspect();
			expectConserved(confined, initialMass);
			expectConserved(unconstrained, initialMass);
			// The same force carries unconfined liquid into the hollow region;
			// a display-only mask would not change this center-of-mass measurement.
			expect(unconstrained.details.centroidX! - confined.details.centroidX!).toBeGreaterThan(0.04);
		});
	});

	it('preserves fine coverage, thickness-dependent transparency, and black material color', async () => {
		const data = new Uint8Array(64 * 64);
		for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
			data[y * 64 + x] = x < 16 ? 0 : x < 32 ? 128 : x % 2 === 0 ? 255 : 0;
		}
		const options: FilmOptions = {
			width: 16, height: 16,
			initial: new Float32Array(16 * 16).fill(0.4),
			coverage: { width: 64, height: 64, data }, transparent: true
		};
		await usingFilms([
			{ ...options, color: [0, 0, 0] },
			{ ...options, color: [0, 0.7, 0.35] },
			{ ...options, initial: new Float32Array(16 * 16).fill(0.05), color: [0, 0.7, 0.35] }
		], async ([black, green, thinGreen]) => {
			const blackPixels = await pixels(black);
			const greenPixels = await pixels(green);
			const thinPixels = await pixels(thinGreen);
			expect((await green.inspect()).finite).toBe(true);
			expect((await thinGreen.inspect()).finite).toBe(true);
			const coveredAlpha = (32 * 64 + 40) * 4 + 3;
			// Same pigment and geometric coverage: less liquid must expose more
			// of the underlying DOM. No particular extinction coefficient is required.
			expect(thinPixels[coveredAlpha]).toBeGreaterThan(0);
			expect(thinPixels[coveredAlpha]).toBeLessThan(greenPixels[coveredAlpha]!);
			const alphaAt = (x: number, y: number) => blackPixels[(y * 64 + x) * 4 + 3]!;
			expect(alphaAt(8, 32)).toBe(0);
			expect(alphaAt(24, 32)).toBeGreaterThan(0);
			expect(alphaAt(24, 32)).toBeLessThan(alphaAt(40, 32));
			// Adjacent coverage pixels live in the same coarse simulation cell.
			expect(alphaAt(40, 32)).toBeGreaterThan(0);
			expect(alphaAt(41, 32)).toBe(0);
			let blackGreen = 0, coloredGreen = 0, premultiplicationExcess = 0, invisibleColor = 0;
			for (let i = 0; i < blackPixels.length; i += 4) {
				for (const rendered of [blackPixels, greenPixels, thinPixels]) {
					for (let channel = 0; channel < 3; channel++) {
						premultiplicationExcess = Math.max(premultiplicationExcess, rendered[i + channel]! - rendered[i + 3]!);
						if (rendered[i + 3] === 0) invisibleColor = Math.max(invisibleColor, rendered[i + channel]!);
					}
				}
				blackGreen += blackPixels[i + 1]!;
				coloredGreen += greenPixels[i + 1]!;
			}
			expect(premultiplicationExcess).toBeLessThanOrEqual(1);
			expect(invisibleColor).toBe(0);
			expect(blackGreen).toBeLessThan(coloredGreen);
		});
	});

	it('depresses enamel under stationary contact and restores it through conserved redistribution', async () => {
		const width = 32, height = 32;
		const initial = new Float32Array(width * height);
		const solid = new Uint8Array(width * height).fill(1);
		const profile = new Uint8Array(64 * 64 * 4);
		for (let y = 4; y < height - 4; y++) for (let x = 4; x < width - 4; x++) {
			solid[y * width + x] = 0;
			// A nonuniform deposited profile must remain at rest; ordinary film
			// leveling would flatten this dome even without contact.
			const radiusSquared = ((x + 0.5) / width - 0.5) ** 2 + ((y + 0.5) / height - 0.5) ** 2;
			initial[y * width + x] = 0.3 + 0.1 * Math.exp(-radiusSquared / 0.025);
		}
		for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
			const cell = Math.floor(y / 2) * width + Math.floor(x / 2);
			profile.set([128, 128, Math.round(initial[cell]! * 255), solid[cell] ? 0 : 255], (y * 64 + x) * 4);
		}
		await usingFilms([{
			width, height, initial, solid, transparent: true, brushRadius: 0.13,
			enamel: { width: 64, height: 64, data: profile }
		}], async ([enamel]) => {
			const rest = await enamel.inspect();
			expect(rest.details.restError).toBe(0);
			await advance(enamel, 60);
			const unforced = await enamel.inspect();
			expectConserved(unforced, rest.mass);
			expect(unforced.details.restError).toBe(0);
			await advance(enamel, 60, { ...idle, active: true, press: 0 });
			const hovered = await enamel.inspect();
			expect(hovered.details.restError).toBe(0);
			expect(hovered.details.localMean).toBe(rest.details.localMean);

			// No velocity or active brush: explicit contact alone must displace
			// existing material out of the center, with compensating accumulation.
			await advance(enamel, 120, { ...idle, active: false, press: 1 });
			const pressed = await enamel.inspect();
			expectConserved(pressed, rest.mass);
			expect(pressed.details.restError).toBeGreaterThan(1e-7);
			expect(rest.details.localMean! - pressed.details.localMean!).toBeGreaterThan(0.001);
			expect(pressed.details.minRestDelta).toBeLessThan(-0.001);
			expect(pressed.details.maxRestDelta).toBeGreaterThan(0.001);

			const reliefPixels = await pixels(enamel);
			enamel.setRelief(false);
			const flatPixels = await pixels(enamel);
			expect(await enamel.inspect()).toEqual(pressed);
			expect(flatPixels.some((value, index) => value !== reliefPixels[index])).toBe(true);
			enamel.setRelief(true);
			await pixels(enamel);
			expect(await enamel.inspect()).toEqual(pressed);

			let previousError = pressed.details.restError!;
			for (const steps of [30, 60, 120]) {
				await advance(enamel, steps);
				const released = await enamel.inspect();
				expectConserved(released, rest.mass);
				expect(released.details.restError).toBeLessThan(previousError);
				previousError = released.details.restError!;
			}
			console.info('enamel contact measurements', {
				centerDepression: rest.details.localMean! - pressed.details.localMean!,
				pressedRestError: pressed.details.restError,
				releasedRestError: previousError
			});
		});
	});
});
