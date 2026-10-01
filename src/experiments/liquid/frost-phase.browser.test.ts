import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFrostPhase, type FrostPhaseExperiment } from './frost-phase.js';
import { advanceFrostCpu, createFrostCpu, FROST_SIZE, FROST_TIME_SCALE, FROST_WARM,
	frostOptions, frostSubsteps, frostTotals } from './frost-phase-model.js';
import type { LiquidInput } from './types.js';

let device: GPUDevice;
beforeAll(async () => { const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull(); device = await adapter!.requestDevice(); });
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => { try { await device.queue.onSubmittedWorkDone(); expect(await device.popErrorScope()).toBeNull(); } finally { vi.restoreAllMocks(); } });
afterAll(() => device?.destroy());
const idle: LiquidInput = { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, tilt: 0 };

async function evolve(model: FrostPhaseExperiment, seconds: number, input = idle) {
	const frames = Math.round(seconds * 120);
	// All steps in each submitted encoder share input/dt, matching LabSession's
	// uniform capture contract. Cap encoded work, not the simulation's timestep.
	for (let start = 0; start < frames; start += 120) {
		const encoder = device.createCommandEncoder();
		for (let i = start; i < Math.min(start + 120, frames); i++) model.step(encoder, 1 / 120, input);
		device.queue.submit([encoder.finish()]);
	}
	await device.queue.onSubmittedWorkDone();
}

async function pixels(model: FrostPhaseExperiment, size: number) {
	model.resize(size, size);
	const bytesPerRow = Math.ceil(size * 4 / 256) * 256;
	const target = device.createTexture({ size: [size, size], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
	const read = device.createBuffer({ size: bytesPerRow * size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	try {
		const encoder = device.createCommandEncoder(); model.render(encoder, target.createView()); encoder.copyTextureToBuffer({ texture: target }, { buffer: read, bytesPerRow }, [size, size]); device.queue.submit([encoder.finish()]); await read.mapAsync(GPUMapMode.READ);
		const source = new Uint8Array(read.getMappedRange()), result = new Uint8Array(size * size * 4);
		for (let y = 0; y < size; y++) result.set(source.subarray(y * bytesPerRow, y * bytesPerRow + size * 4), y * size * 4);
		return result;
	} finally { target.destroy(); read.destroy(); }
}

describe('native bounded frost phase change', () => {
	it('cleans owned fields after rejected scope promises without replacing the original allocation failure', async () => {
		for (const allocationFailure of [false, true]) {
			let allocations=0,pops=0;const destroyed:Array<ReturnType<typeof vi.spyOn>>=[];
			const primary=new Error('Original frost allocation failure'),late=new Error('Late frost scope rejection');
			const proxy=new Proxy(device,{get(target,key){
				if(key==='createBuffer')return(descriptor:GPUBufferDescriptor)=>{
					if(++allocations===2&&allocationFailure)throw primary;
					const buffer=target.createBuffer(descriptor);destroyed.push(vi.spyOn(buffer,'destroy'));return buffer;
				};
				if(key==='popErrorScope')return()=>{const index=pops++;return target.popErrorScope().then(error=>{if(index===0)throw late;return error;});};
				const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
			}});
			await expect(createFrostPhase(proxy,'rgba8unorm')).rejects.toBe(allocationFailure?primary:late);
			expect(pops).toBe(2);expect(destroyed).toHaveLength(allocationFailure?1:5);destroyed.forEach(spy=>expect(spy).toHaveBeenCalledOnce());
		}
	});
	it('matches the two-field CPU law including latent heat and does not nucleate an empty cold plate', async () => {
		const model = await createFrostPhase(device, 'rgba8unorm');
		try {
			const cpu = createFrostCpu(FROST_SIZE), options = frostOptions(), count = frostSubsteps(1 / 120);
			const encoder = device.createCommandEncoder(); model.step(encoder, 1 / 120, idle); device.queue.submit([encoder.finish()]);
			for (let i = 0; i < count; i++) advanceFrostCpu(cpu, FROST_TIME_SCALE / 120 / count, options);
			const actual = await model.readState(); let maxError = 0;
			for (let i = 0; i < actual.length; i++) maxError = Math.max(maxError, Math.abs(actual[i] - cpu.cells[i]));
			expect(maxError).toBeLessThan(2e-6);
			model.reset(); await evolve(model, 2); const empty = frostTotals(await model.readState());
			expect(empty.phase).toBe(0); expect(empty.finite).toBe(true);
			console.info('Frost CPU/GPU first step', { count, maxError, emptyPhase: empty.phase });
		} finally { model.dispose(); }
	});
	it('grows in cold, then genuinely melts that already cold-grown crystal when the bath changes', async () => {
		const model = await createFrostPhase(device, 'rgba8unorm');
		try {
			const initial = frostTotals(await model.readState()); await evolve(model, 3.5); const grown = frostTotals(await model.readState());
			expect(grown.phase).toBeGreaterThan(initial.phase * 12); expect(grown.finite).toBe(true); expect(grown.min).toBeGreaterThanOrEqual(-1e-7); expect(grown.max).toBeLessThanOrEqual(1 + 1e-7);
			model.setOptions({ bath: FROST_WARM }); await evolve(model, 8); const melted = frostTotals(await model.readState());
			expect(melted.phase).toBeLessThan(grown.phase * 0.25); expect(melted.heat).toBeGreaterThan(0.3);
			console.info('Frost true cold-to-warm transition', { initial: initial.phase, grown: grown.phase, melted: melted.phase, temperature: melted.heat });
		} finally { model.dispose(); }
	});
	it('keeps a newly planted cold crystal visible after the reduced Warm→Clear→Cold sequence', async () => {
		const model = await createFrostPhase(device, 'rgba8unorm');
		try {
			model.setOptions({ bath: FROST_WARM }); model.reset(); model.setOptions({ bath: -0.65 }); model.advanceStill();
			const before = await model.readState(); model.seed(); const planted = await model.readState();
			expect(planted[1]).toBe(before[1]); model.seed(); expect(await model.readState()).toEqual(planted);
			model.advanceStill(); const next = frostTotals(await model.readState()); expect(next.max).toBeGreaterThan(0.5);
			console.info('Frost reduced cold-material edit', { untouchedCornerTemperature: planted[1], retainedPhaseMax: next.max });
		} finally { model.dispose(); }
	});
	it('conserves sealed enthalpy and a warm local pointer changes the actual phase, not just its color', async () => {
		const model = await createFrostPhase(device, 'rgba8unorm');
		try {
			model.setOptions({ bathRate: 0 }); const initial = frostTotals(await model.readState()); await evolve(model, 2);
			// Float32 temperature accumulation over 1440 substeps is not the
			// Float64 reference's 1e-11 ledger; bound its measured few-ppm drift.
			const sealed = frostTotals(await model.readState()); expect(Math.abs(sealed.enthalpy - initial.enthalpy)).toBeLessThan(3e-6); expect(sealed.heat).toBeGreaterThan(initial.heat);
			const before = await model.readState(); await evolve(model, 5, { ...idle, active: true }); const after = await model.readState();
			let beforeCenter = 0, afterCenter = 0, count = 0;
			for (let y = 85; y < 107; y++) for (let x = 85; x < 107; x++) { const i = (y * FROST_SIZE + x) * 2; beforeCenter += before[i]; afterCenter += after[i]; count++; }
			expect(afterCenter / count).toBeLessThan(beforeCenter / count * 0.25);
			console.info('Frost enthalpy / warm window', { enthalpyDrift: sealed.enthalpy - initial.enthalpy, beforeCenter: beforeCenter / count, afterCenter: afterCenter / count });
		} finally { model.dispose(); }
	});
	it('preserves phase and heat bit-for-bit across native fractional 2× / 3× output and filters the real boundary', async () => {
		const model = await createFrostPhase(device, 'rgba8unorm');
		try {
			await evolve(model, 1.5); const before = await model.readState(), memory = model.memoryBytes;
			for (const dpr of [2, 3]) {
				const size = Math.round(200.25 * dpr), actual = await pixels(model, size), reference = await pixels(model, size * 4);
				let fractional = 0, solid = 0, error = 0, rimError = 0, rimCount = 0;
				for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
					const alpha = actual[(y * size + x) * 4 + 3]; if (alpha > 0 && alpha < 100) fractional++; if (alpha > 120) solid++;
					let average = 0; for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) average += reference[((y * 4 + dy) * size * 4 + x * 4 + dx) * 4 + 3] / 16;
					const delta = Math.abs(alpha - average); error += delta; if (average > 1 && average < 120) { rimError += delta; rimCount++; }
				}
				expect(fractional).toBeGreaterThan(20); expect(solid).toBeGreaterThan(size * size * 0.005); expect(error / size ** 2).toBeLessThan(0.15); expect(rimError / rimCount).toBeLessThan(18);
				expect(await model.readState()).toEqual(before); expect(model.memoryBytes).toBe(memory);
				console.info('Frost native actual-front coverage', { dpr, size, meanAlphaError: error / size ** 2, rimAlphaError: rimError / rimCount, fractional, memory });
			}
			expect(() => model.resize(5000, 5000)).toThrow('no downsampling'); expect(await model.readState()).toEqual(before);
		} finally { model.dispose(); }
	});
});
