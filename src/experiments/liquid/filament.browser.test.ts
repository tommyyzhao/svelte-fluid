import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFilament } from './filament.js';
import type { LiquidExperiment, LiquidInput } from './types.js';

let device: GPUDevice;
const format: GPUTextureFormat = 'rgba8unorm';
const idle: LiquidInput = { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, tilt: 0 };
beforeAll(async () => { const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull(); device = await adapter!.requestDevice(); });
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => { await device.queue.onSubmittedWorkDone(); expect(await device.popErrorScope()).toBeNull(); });
afterAll(() => device?.destroy());

async function advance(engine: LiquidExperiment, steps: number, inputAt: (step: number) => LiquidInput = () => idle) {
	for (let step = 0; step < steps; step++) { const encoder = device.createCommandEncoder(); engine.step(encoder, 1 / 120, inputAt(step)); device.queue.submit([encoder.finish()]); }
	await device.queue.onSubmittedWorkDone();
}
const gesture = (step: number): LiquidInput => ({ ...idle, x: 0.2 + step / 150, y: 0.48, vx: 0.8, vy: 0.2, active: true });

async function pixels(engine: LiquidExperiment, width: number, height: number) {
	const rowBytes = Math.ceil(width * 4 / 256) * 256;
	const target = device.createTexture({ size: [width, height], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
	const readback = device.createBuffer({ size: rowBytes * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	try {
		const encoder = device.createCommandEncoder(); engine.render(encoder, target.createView());
		encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow: rowBytes }, [width, height]);
		device.queue.submit([encoder.finish()]); await readback.mapAsync(GPUMapMode.READ);
		const source = new Uint8Array(readback.getMappedRange()), result = new Uint8Array(width * height * 4);
		for (let y = 0; y < height; y++) result.set(source.subarray(y * rowBytes, y * rowBytes + width * 4), y * width * 4);
		return result;
	} finally { target.destroy(); readback.destroy(); }
}

function coverage(data: Uint8Array) {
	let area = 0, partialPixels = 0, worstPremult = 0;
	for (let i = 0; i < data.length; i += 4) {
		const alpha = data[i + 3]; area += alpha / 255;
		if (alpha > 0 && alpha < 255) partialPixels++;
		for (let c = 0; c < 3; c++) worstPremult = Math.max(worstPremult, data[i + c] - alpha);
	}
	expect(worstPremult).toBeLessThanOrEqual(1);
	return { area, partialPixels };
}

function islands(data: Uint8Array, width: number, height: number) {
	const visited = new Uint8Array(width * height), queue = new Int32Array(width * height); let components = 0;
	for (let seed = 0; seed < visited.length; seed++) {
		if (visited[seed] || data[seed * 4 + 3] < 128) continue;
		let head = 0, tail = 1; queue[0] = seed; visited[seed] = 1;
		while (head < tail) {
			const index = queue[head++], x = index % width, y = Math.floor(index / width);
			for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
				const nx = x + dx, ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
				const neighbor = ny * width + nx;
				if (visited[neighbor] || data[neighbor * 4 + 3] < 128) continue;
				visited[neighbor] = 1; queue[tail++] = neighbor;
			}
		}
		if (tail >= 4) components++;
	}
	return components;
}

describe('coherent lit filament', () => {
	it('bends a connected, lit surface and recovers with no stationary-pointer force', async () => {
		const engine = await createFilament(device, format);
		try {
			engine.resize(640, 360);
			const rest = await pixels(engine, 640, 360); expect(islands(rest, 640, 360)).toBe(1); coverage(rest);
			await advance(engine, 90, gesture); const moved = await engine.inspect();
			expect(moved.finite).toBe(true); expect(moved.details.rmsDisplacement).toBeGreaterThan(0.01);
			expect(moved.details.maxSpeed).toBeLessThanOrEqual(2.50001); expect(moved.details.maxDisplacement).toBeLessThanOrEqual(0.55001);
			expect(moved.details.limitNodes).toBe(0);
			const changed = await pixels(engine, 640, 360); expect(islands(changed, 640, 360)).toBe(1); coverage(changed);
			let difference = 0; for (let i = 0; i < rest.length; i++) difference += Math.abs(rest[i] - changed[i]);
			expect(difference / (640 * 360)).toBeGreaterThan(1);
			await advance(engine, 120); const absentPointer = await engine.inspect();
			engine.reset(); await advance(engine, 90, gesture); await advance(engine, 120, () => ({ ...idle, active: true }));
			const stationaryPointer = await engine.inspect();
			expect(stationaryPointer.details.rmsDisplacement).toBe(absentPointer.details.rmsDisplacement);
			expect(stationaryPointer.kinetic).toBe(absentPointer.kinetic);
			await advance(engine, 600); const recovered = await engine.inspect();
			expect(recovered.finite).toBe(true); expect(recovered.details.rmsDisplacement).toBeLessThan(moved.details.rmsDisplacement * 0.001);
			engine.reset(); expect((await engine.inspect()).details.rmsDisplacement).toBe(0);
			const resetPixels = await pixels(engine, 640, 360);
			let worstColor = 0, colorError = 0, worstAlpha = 0;
			for (let i = 0; i < rest.length; i++) {
				const delta = Math.abs(rest[i] - resetPixels[i]);
				if (i % 4 === 3) worstAlpha = Math.max(worstAlpha, delta);
				else { worstColor = Math.max(worstColor, delta); colorError += delta; }
			}
			// State and geometric coverage reset exactly. Shader floating-point
			// lighting/UNORM rounding need not reproduce every color byte.
			expect(worstAlpha).toBe(0); expect(worstColor).toBeLessThanOrEqual(3);
			expect(colorError / (640 * 360 * 3)).toBeLessThan(0.05);
			console.info('Filament reset color envelope', { worstColor, meanColorError: colorError / (640 * 360 * 3) });
			console.info('Filament recovery', { moved: moved.details.rmsDisplacement, recovered: recovered.details.rmsDisplacement });
		} finally { engine.dispose(); }
	});

	it('renders exact 2x and 3x geometry coverage with fixed curve state and explicit allocation bounds', async () => {
		const engine = await createFilament(device, format);
		try {
			engine.resize(2800, 1320); await advance(engine, 40, gesture); const state = await engine.inspect();
			const two = coverage(await pixels(engine, 2800, 1320));
			engine.resize(4200, 1980); const high = await engine.inspect();
			expect(high.details.nodes).toBe(128); expect(high.details.stateBytes).toBe(state.details.stateBytes);
			expect(high.details.rmsDisplacement).toBe(state.details.rmsDisplacement); expect(high.kinetic).toBe(state.kinetic);
			expect(high.details.segments).toBeGreaterThan(state.details.segments);
			expect(high.details.radialSegments).toBeGreaterThan(state.details.radialSegments);
			expect(high.details.attachmentBytes).toBe(4200 * 1980 * 24);
			expect(high.details.resolvedCanvasBytes).toBe(4200 * 1980 * 4);
			const three = coverage(await pixels(engine, 4200, 1980));
			expect(Math.abs(three.area / two.area - 2.25)).toBeLessThan(0.015);
			expect(three.partialPixels / two.partialPixels).toBeGreaterThan(1.2);
			expect(three.partialPixels / two.partialPixels).toBeLessThan(1.8);
			const memory = engine.memoryBytes;
			expect(() => engine.resize(4096, 4096)).toThrow('safe budget');
			// The final 3072² renderer fits live, but replacing an already-live
			// 4200×1980 renderer exceeds the explicitly budgeted transition peak.
			expect(() => engine.resize(3072, 3072)).toThrow('transition budget');
			expect(engine.memoryBytes).toBe(memory);
			expect((await engine.inspect()).details.rmsDisplacement).toBe(state.details.rmsDisplacement);
			console.info('Filament native coverage and allocations', { two, three, at2x: state.details, at3x: high.details });
		} finally { engine.dispose(); }
	});
});
