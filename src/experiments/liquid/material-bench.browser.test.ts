import { afterAll, beforeAll, expect, it } from 'vitest';
import { createCombedInk, inkProgram } from './combed-ink.js';
import { createSnapFoil } from './snap-foil.js';
import { createCapillaryBridge } from './capillary-bridge.js';
import { createVelvet } from './velvet.js';
import { createCrazedEnamel } from './crazed-enamel.js';
import { createStressGlass } from './stress-glass.js';
import { measureEffectPerformance } from './effects-performance.js';
import type { LiquidExperiment, LiquidInput } from './types.js';

let device: GPUDevice;
const errors: string[] = [];
const format: GPUTextureFormat = 'rgba8unorm';
beforeAll(async () => {
	expect(navigator.gpu).toBeDefined();
	const adapter = await navigator.gpu.requestAdapter();
	expect(adapter).not.toBeNull();
	const timestampQuery = adapter!.features.has('timestamp-query');
	device = await adapter!.requestDevice({ requiredFeatures: timestampQuery ? ['timestamp-query'] : [] });
	device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
	console.info('Material bench adapter', { vendor: adapter!.info.vendor, architecture: adapter!.info.architecture,
		timestampQuery, userAgent: navigator.userAgent });
});
afterAll(() => device?.destroy());

const factories: [string, (device: GPUDevice, format: GPUTextureFormat) => Promise<LiquidExperiment>][] = [
	['ink', async (gpu, target) => {
		const engine = await createCombedInk(gpu, target);
		// Hold the source program fixed in both measured tapes. Brush accuracy
		// and operation-count sweeps have their own matched-error test.
		engine.setProgram(inkProgram(8));
		return { ...engine, reset() { engine.setProgram(inkProgram(8)); }, step() {} };
	}],
	['foil', createSnapFoil], ['bridge', async (gpu, target) => {
		let gap = 0.6;
		const engine = await createCapillaryBridge(gpu, target, () => gap);
		return { ...engine, reset() { gap = 0.6; engine.reset(); },
			step(encoder, dt, input) { gap = 0.3 + 1.35 * input.x; engine.step(encoder, dt, input); } };
	}], ['velvet', createVelvet],
	['crazing', createCrazedEnamel], ['glass', createStressGlass]
];
const gesture = (frame: number): LiquidInput => {
	const angle = frame / 60 * Math.PI * 2;
	return { x: 0.5 + 0.28 * Math.sin(angle), y: 0.5 + 0.22 * Math.cos(angle),
		vx: 0.28 * Math.PI * 2 * Math.cos(angle), vy: -0.22 * Math.PI * 2 * Math.sin(angle), active: true, press: 0, tilt: 0 };
};

for (const [name, factory] of factories) {
	it(`measures ${name} at component and large native 2×/3× output`, async () => {
		device.pushErrorScope('validation');
		const engine = await factory(device, format);
		try {
			for (const [cssWidth, cssHeight] of [[420.375, 260.625], [900, 520]]) {
				for (const dpr of [2, 3]) {
					engine.reset();
					const width = Math.round(cssWidth! * dpr), height = Math.round(cssHeight! * dpr);
					const result = await measureEffectPerformance(device, format, engine, width, height, gesture);
					expect(result.sampleFrames).toBe(60);
					expect(result.outputBytes).toBe(width * height * 4);
					expect(result.engineBytes).toBeGreaterThan(0);
					expect(result.cpuEncodeSubmitMsPerFrame).toBeGreaterThanOrEqual(0);
					expect((await engine.inspect()).finite).toBe(true);
					console.info('Material bench', JSON.stringify({ name, cssWidth, cssHeight, dpr, ...result }));
				}
			}
			await device.queue.onSubmittedWorkDone();
		} finally {
			engine.dispose();
			expect((await device.popErrorScope())?.message ?? null).toBeNull();
		}
		expect(errors).toEqual([]);
	});
}
