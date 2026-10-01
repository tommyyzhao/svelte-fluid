import type { LiquidExperiment, LiquidInput } from './types.js';

export interface EffectPerformance {
	width: number;
	height: number;
	engineBytes: number;
	outputBytes: number;
	warmupFrames: number;
	sampleFrames: number;
	throughputFrames: number;
	simulationStepsPerFrame: number;
	/** Includes JS encoding/submission and queued GPU completion, excludes readback. */
	queuedWallMsPerFrame: number;
	/** JS encoding + queue submission only; excludes waiting for GPU completion. */
	cpuEncodeSubmitMsPerFrame: number;
	/** Sum of real compute/render pass durations; excludes gaps between passes. */
	gpuMs: { p50: number; p95: number; min: number; max: number; zeroSamples: number } | null;
	timedPassesPerFrame: { min: number; max: number } | null;
}

/** Private, explicit R&D diagnostic. It runs two identical 1.5 s tapes, resetting between them.
 * These are warmed queued workloads, not RAF latency or sustained phone results.
 * Timestamp writes instrument actual passes, as defined in WebGPU §16.1.1:
 * https://gpuweb.github.io/gpuweb/#compute-pass-creation
 */
export async function measureEffectPerformance(
	device: GPUDevice,
	format: GPUTextureFormat,
	engine: LiquidExperiment,
	width: number,
	height: number,
	inputAt: (frame: number) => LiquidInput,
	maxPassesPerFrame = 8
): Promise<EffectPerformance> {
	const warmupFrames = 30;
	const sampleFrames = 60;
	const simulationStepsPerFrame = 2;
	// Explicit measurement capacity, never a reason to alter an effect's graph.
	// 60 frames × 32 passes × 2 timestamps = 3840, below WebGPU's 4096-query cap.
	if (!Number.isInteger(maxPassesPerFrame) || maxPassesPerFrame < 1 || maxPassesPerFrame > 32) {
		throw new RangeError('Timestamp pass capacity must be an integer in [1, 32].');
	}
	engine.resize(width, height);
	const target = device.createTexture({
		label: 'effect benchmark / fixed output', size: [width, height], format,
		usage: GPUTextureUsage.RENDER_ATTACHMENT
	});
	const view = target.createView();
	const querySet = device.features.has('timestamp-query')
		? device.createQuerySet({ type: 'timestamp', count: sampleFrames * maxPassesPerFrame * 2 }) : undefined;
	// resolveQuerySet's destination offset must be 256-byte aligned. One contiguous
	// resolve at offset zero avoids per-frame padding and readbacks entirely.
	const queryBytes = sampleFrames * maxPassesPerFrame * 2 * 8;
	const resolved = querySet ? device.createBuffer({
		size: queryBytes, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC
	}) : undefined;
	const readback = querySet ? device.createBuffer({
		size: queryBytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
	}) : undefined;
	try {
		let queryCount = 0;
		const queryRanges: Array<[number, number]> = [];
		const submitFrame = (frame: number, measured = false) => {
			const cpuStart = performance.now();
			const raw = device.createCommandEncoder({ label: 'effect benchmark / complete frame' });
			const firstQuery = queryCount;
			// A wrapper adds timestamps to real passes without changing factories.
			// Bind every other method to its WebGPU receiver; an unbound proxy fails
			// Web IDL brand checks. Empty timestamp-only passes were not reliable on
			// the tested Metal driver (their end query resolved to zero).
			const encoder = measured && querySet ? new Proxy(raw, {
				get(target, key) {
					if (key === 'beginComputePass' || key === 'beginRenderPass') {
						return (descriptor: GPUComputePassDescriptor | GPURenderPassDescriptor = {}) => {
							if (descriptor.timestampWrites) throw new Error('Benchmark cannot overwrite existing pass timestamps.');
							if (queryCount - firstQuery >= maxPassesPerFrame * 2) throw new Error('Effect exceeded benchmark pass capacity.');
							const beginningOfPassWriteIndex = queryCount++;
							const endOfPassWriteIndex = queryCount++;
							return Reflect.apply(target[key], target, [{ ...descriptor,
								timestampWrites: { querySet, beginningOfPassWriteIndex, endOfPassWriteIndex } }]);
						};
					}
					const value = Reflect.get(target, key, target);
					return typeof value === 'function' ? value.bind(target) : value;
				}
			}) : raw;
			const input = inputAt(frame);
			for (let step = 0; step < simulationStepsPerFrame; step++) engine.step(encoder, 1 / 120, input);
			engine.render(encoder, view);
			device.queue.submit([encoder.finish()]);
			if (measured && querySet) queryRanges.push([firstQuery, queryCount]);
			return performance.now() - cpuStart;
		};
		for (let frame = 0; frame < warmupFrames; frame++) submitFrame(frame);
		await device.queue.onSubmittedWorkDone();
		const start = performance.now();
		let cpuEncodeSubmitMs = 0;
		for (let sample = 0; sample < sampleFrames; sample++) cpuEncodeSubmitMs += submitFrame(warmupFrames + sample);
		await device.queue.onSubmittedWorkDone();
		const queuedWallMsPerFrame = (performance.now() - start) / sampleFrames;
		let gpuMs: EffectPerformance['gpuMs'] = null;
		let timedPassesPerFrame: EffectPerformance['timedPassesPerFrame'] = null;
		if (querySet && resolved && readback) {
			// Acquire pass intervals with one frame in flight. The tested Metal
			// backend gave inflated overlapping intervals for a deeply queued tape.
			// Throughput above is measured separately, without timestamp overhead.
			engine.reset();
			for (let frame = 0; frame < warmupFrames; frame++) submitFrame(frame);
			await device.queue.onSubmittedWorkDone();
			for (let sample = 0; sample < sampleFrames; sample++) {
				submitFrame(warmupFrames + sample, true);
				await device.queue.onSubmittedWorkDone();
			}
			const encoder = device.createCommandEncoder();
			encoder.resolveQuerySet(querySet, 0, queryCount, resolved, 0);
			encoder.copyBufferToBuffer(resolved, 0, readback, 0, queryCount * 8);
			device.queue.submit([encoder.finish()]);
			await readback.mapAsync(GPUMapMode.READ);
			const timestamps = new BigUint64Array(readback.getMappedRange());
			const samples: number[] = [];
			for (const [first, end] of queryRanges) {
				let total = 0n;
				for (let query = first; query < end; query += 2) {
					const startTime = timestamps[query]!;
					const endTime = timestamps[query + 1]!;
					if (endTime < startTime) throw new Error(`GPU pass timestamps are non-monotonic: ${startTime} -> ${endTime}; timing is invalid.`);
					total += endTime - startTime;
				}
				samples.push(Number(total) / 1e6);
			}
			samples.sort((a, b) => a - b);
			gpuMs = {
				p50: samples[Math.ceil(sampleFrames * 0.5) - 1]!,
				p95: samples[Math.ceil(sampleFrames * 0.95) - 1]!,
				min: samples[0]!, max: samples[samples.length - 1]!,
				// A zero is below the timestamp resolution, not a free frame.
				zeroSamples: samples.filter((sample) => sample === 0).length
			};
			const passCounts = queryRanges.map(([first, end]) => (end - first) / 2);
			timedPassesPerFrame = { min: Math.min(...passCounts), max: Math.max(...passCounts) };
		}
		return { width, height, engineBytes: engine.memoryBytes, outputBytes: width * height * 4,
			warmupFrames, sampleFrames, throughputFrames: sampleFrames, simulationStepsPerFrame,
			queuedWallMsPerFrame, cpuEncodeSubmitMsPerFrame: cpuEncodeSubmitMs / sampleFrames, gpuMs, timedPassesPerFrame };
	} finally {
		target.destroy(); querySet?.destroy(); resolved?.destroy(); readback?.destroy();
	}
}
