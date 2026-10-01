import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CAUSTIC_DEFAULTS, causticJacobian, causticPhoton, createCausticLight, projectCausticRay, type CausticLight, type PhotonGrid } from './caustic-light.js';
import { measureEffectPerformance } from './effects-performance.js';

let device: GPUDevice;
beforeAll(async () => {
	const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull();
	device = await adapter!.requestDevice({ requiredFeatures: adapter!.features.has('timestamp-query') ? ['timestamp-query'] : [] });
});
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => { await device.queue.onSubmittedWorkDone(); expect(await device.popErrorScope()).toBeNull(); });
afterAll(() => device?.destroy());

async function draw(model: CausticLight, width: number, height: number) {
	const target = device.createTexture({ size: [width, height], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT });
	try { const encoder = device.createCommandEncoder(); model.render(encoder, target.createView()); device.queue.submit([encoder.finish()]); await device.queue.onSubmittedWorkDone(); }
	finally { target.destroy(); }
}

/** CPU-only 512² ray-cell refinement oracle. This is the same bounded optical
 * approximation at higher quadrature density, not exact optical ground truth
 * and not a new runtime/GPU sample-count option. */
function refinedLight(width: number, height: number): Float32Array {
	const grid = 512, light = new Float32Array(width * height);
	for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) {
		const p = causticPhoton(i, j, grid as PhotonGrid, width, height, CAUSTIC_DEFAULTS, false), [ax, ay, bx, by] = p.basis;
		const determinant = ax * by - ay * bx, rx = Math.abs(ax) + Math.abs(bx), ry = Math.abs(ay) + Math.abs(by), power = p.flux * height ** 2 / Math.abs(determinant);
		for (let y = Math.max(0, Math.ceil(p.y - ry - 0.5)); y <= Math.min(height - 1, Math.floor(p.y + ry - 0.5)); y++) for (let x = Math.max(0, Math.ceil(p.x - rx - 0.5)); x <= Math.min(width - 1, Math.floor(p.x + rx - 0.5)); x++) {
			const dx = x + 0.5 - p.x, dy = y + 0.5 - p.y, u = (by * dx - bx * dy) / determinant, v = (-ay * dx + ax * dy) / determinant;
			light[y * width + x] += power * Math.max(0, 1 - Math.abs(u)) * Math.max(0, 1 - Math.abs(v));
		}
	}
	return light;
}

describe('forward focused caustic light', () => {
	it('conserves linear flux for all sample budgets at fractional 2x/3x and does not create light under repeated draws', async () => {
		const model = await createCausticLight(device, 'rgba8unorm');
		try {
			for (const [width, height] of [[801, 641], [1202, 962]]) {
				model.resize(width, height);
				for (const photonGrid of [64, 128, 256] as const) {
					model.setPhotonGrid(photonGrid); await draw(model, width, height);
					const light = await model.readLight(), snapshot = await model.inspect();
					const relativeError = Math.abs(light.flux - snapshot.details.capturedFlux) / snapshot.details.expectedFlux;
					expect(light.finite).toBe(true); expect(relativeError).toBeLessThan(0.012); expect(light.maximum).toBeGreaterThan(2);
					expect(snapshot.details.attachmentBytes).toBe(width * height * 2); expect(snapshot.details.photonCount).toBe(photonGrid ** 2);
					console.info('Caustic flux/native budget', { width, height, photonGrid, flux: light.flux, expectedCaptured: snapshot.details.capturedFlux, escaped: snapshot.details.escapedFlux, relativeError, maximum: light.maximum, bytes: model.memoryBytes });
				}
			}
			const before = await model.inspect(), light = await model.readLight();
			await draw(model, 1202, 962); await draw(model, 1202, 962);
			const after = await model.inspect(); expect(after.details.projectionDispatches).toBe(before.details.projectionDispatches); expect(after.details.splatPasses).toBe(before.details.splatPasses); expect((await model.readLight()).values).toEqual(light.values);
			expect(() => model.resize(5000, 5000)).toThrow(); expect((await model.inspect()).details.width).toBe(1202);
		} finally { model.dispose(); }
	}, 30_000);

	it('flattens illumination with flat water/index-one and brightness agrees with actual area contraction before folds', async () => {
		const width = 1000, height = 800, model = await createCausticLight(device, 'rgba8unorm', { photonGrid: 256 });
		try {
			model.resize(width, height); model.setRelief(0); await draw(model, width, height); const flat = await model.readLight();
			let maxFlatError = 0; for (let y = 120; y < height - 120; y += 7) for (let x = 130; x < width - 130; x += 7) maxFlatError = Math.max(maxFlatError, Math.abs(flat.values[y * width + x] - 1));
			expect(maxFlatError).toBeLessThan(0.05);
			model.setRelief(1); model.setIndex(1); await draw(model, width, height); const nullRefraction = await model.readLight();
			let nullError = 0; for (let i = 0; i < flat.values.length; i++) nullError += Math.abs(flat.values[i] - nullRefraction.values[i]);
			expect(nullError / flat.values.length).toBeLessThan(0.004);
			model.setIndex(1.333); model.setRelief(0.45); model.setDepth(0.45); await draw(model, width, height); const focused = await model.readLight();
			const geometry = { ...CAUSTIC_DEFAULTS, relief: 0.45, depth: 0.45 };
			const samples: Array<{ expected: number; actual: number }> = [];
			for (let y = -0.22; y < 0.23; y += 0.045) for (let x = -0.35; x < 0.36; x += 0.065) {
				const [a, b, c, d] = causticJacobian(x, y, width / height, geometry), determinant = a * d - b * c;
				const p = projectCausticRay(x, y, width / height, geometry), px = Math.round(width / 2 + p[0] * height), py = Math.round(height / 2 + p[1] * height);
				let actual = 0; for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) actual += focused.values[(py + oy) * width + px + ox] / 25;
				samples.push({ expected: 1 / determinant, actual });
			}
			const relativeError = samples.reduce((sum, p) => sum + Math.abs(p.actual - p.expected) / p.expected, 0) / samples.length;
			expect(relativeError).toBeLessThan(0.12); expect(Math.max(...samples.map((p) => p.actual))).toBeGreaterThan(1.8);
			console.info('Caustic area-compression proof', { maxFlatError, nullError: nullError / flat.values.length, relativeError, samples: samples.length, maximum: focused.maximum });
		} finally { model.dispose(); }
	}, 30_000);

	it('bounds strong focusing, reports escaped flux and retains optical state through resize/reset', async () => {
		const model = await createCausticLight(device, 'rgba8unorm');
		try {
			model.resize(801, 641); model.setRelief(1); model.setDepth(1); model.setIndex(1.6); model.setPosition(0.9, 0.1); model.setPhase(1.4);
			await draw(model, 801, 641); const light = await model.readLight(), before = await model.inspect();
			expect(light.finite).toBe(true); expect(before.details.escapedFlux).toBeGreaterThan(0); expect(Math.abs(light.flux - before.details.capturedFlux) / before.details.expectedFlux).toBeLessThan(0.015);
			model.resize(1202, 962); await draw(model, 1202, 962); const after = await model.inspect();
			for (const key of ['relief', 'depth', 'index', 'centerX', 'centerY', 'phase', 'photonGrid']) expect(after.details[key]).toBe(before.details[key]);
			model.reset(); const reset = await model.inspect(); expect(reset.details.phase).toBe(0); expect(reset.details.centerX).toBe(CAUSTIC_DEFAULTS.centerX); expect(reset.details.relief).toBe(1); expect(reset.details.depth).toBe(1);
			expect(() => model.setRelief(NaN)).toThrow(); expect(() => model.setDepth(-1)).toThrow(); expect(() => model.setPhotonGrid(512 as PhotonGrid)).toThrow();
			console.info('Caustic stress flux', { flux: light.flux, expectedCaptured: before.details.capturedFlux, escaped: before.details.escapedFlux, maximum: light.maximum });
		} finally { model.dispose(); }
	}, 30_000);

	it('buys measurable visible refinement with additional photons, not a change in total light', async () => {
		const model = await createCausticLight(device, 'rgba8unorm');
		const single = await createCausticLight(device, 'rgba8unorm', { photonGrid: 256, interleaved: false });
		try {
			for (const [width, height] of [[801, 641], [1202, 962]]) {
				const reference = refinedLight(width, height), errors = [];
				const expose = (value: number) => 255 * (1 - Math.exp(-0.026 - 0.37 * 0.24 * value)) ** (1 / 2.2);
				model.resize(width, height);
				for (const grid of [64, 128, 256] as const) {
					model.setPhotonGrid(grid); await draw(model, width, height); const actual = await model.readLight();
					let sum = 0; for (let i = 0; i < reference.length; i++) sum += Math.abs(expose(actual.values[i]) - expose(reference[i]));
					errors.push(sum / reference.length);
				}
				expect(errors[2]).toBeLessThan(errors[0] * 0.65);
				single.resize(width, height); await draw(single, width, height); const old = await single.readLight(); let oldError = 0;
				for (let i = 0; i < reference.length; i++) oldError += Math.abs(expose(old.values[i]) - expose(reference[i])); oldError /= reference.length;
				expect(errors[2]).toBeLessThan(oldError * 0.9);
				console.info('Caustic refinement versus CPU512² ray-cell reference', { width, height, meanGreenChannelError64: errors[0], meanGreenChannelError128: errors[1], meanGreenChannelError256: errors[2], singleLattice256: oldError });
			}
		} finally { model.dispose(); single.dispose(); }
	}, 30_000);

	it('measures complete active frames across photon counts, with native receiver held fixed', async () => {
		const results = [];
		for (const { photonGrid, interleaved } of [{ photonGrid: 64, interleaved: true }, { photonGrid: 128, interleaved: true }, { photonGrid: 256, interleaved: true }, { photonGrid: 256, interleaved: false }] as const) {
			const model = await createCausticLight(device, 'rgba8unorm', { photonGrid, interleaved });
			try {
				const result = await measureEffectPerformance(device, 'rgba8unorm', model, 1002, 642, (frame) => ({ x: 0.5 + 0.25 * Math.sin(frame * 0.053), y: 0.5 + 0.17 * Math.cos(frame * 0.071), vx: 0.1, vy: 0.1, active: true, tilt: 0 }));
				results.push({ photonGrid, interleaved, ...result }); expect(result.engineBytes).toBe(256 ** 2 * 32 + 64 + 1002 * 642 * 2); expect(result.timedPassesPerFrame?.min ?? 3).toBe(3);
			} finally { model.dispose(); }
		}
		console.info('Caustic photon-count performance (not RAF/phone latency)', JSON.stringify(results));
	}, 60_000);
});
