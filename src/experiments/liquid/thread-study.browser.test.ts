import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createThreadStudy, type ThreadStudyExperiment } from './thread-study.js';
import { presentationSize } from './presentation-size.js';
import { THREAD_HISTORY_CAPACITY } from './thread-geometry.js';

let device: GPUDevice;
const format = 'rgba8unorm' as const;
const idle = { x: 0.5, y: 0.5, vx: 0, vy: 0, active: false, tilt: 0 };
beforeAll(async () => { const adapter = await navigator.gpu.requestAdapter(); expect(adapter).not.toBeNull(); device = await adapter!.requestDevice(); });
beforeEach(() => device.pushErrorScope('validation'));
afterEach(async () => { await device.queue.onSubmittedWorkDone(); expect(await device.popErrorScope()).toBeNull(); });
afterAll(() => device?.destroy());

async function pixels(model: ThreadStudyExperiment, width: number, height: number) {
	const bytesPerRow = Math.ceil(width * 4 / 256) * 256;
	const target = device.createTexture({ size: [width, height], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
	const read = device.createBuffer({ size: bytesPerRow * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
	try {
		const encoder = device.createCommandEncoder(); model.render(encoder, target.createView());
		encoder.copyTextureToBuffer({ texture: target }, { buffer: read, bytesPerRow }, [width, height]);
		device.queue.submit([encoder.finish()]); await read.mapAsync(GPUMapMode.READ);
		const mapped = new Uint8Array(read.getMappedRange()), result = new Uint8Array(width * height * 4);
		for (let y = 0; y < height; y++) result.set(mapped.subarray(y * bytesPerRow, y * bytesPerRow + width * 4), y * width * 4);
		return result;
	} finally { target.destroy(); read.destroy(); }
}
function coverage(data: Uint8Array) { let area = 0; for (let i = 3; i < data.length; i += 4) area += data[i] / 255; return area; }
function difference(a: Uint8Array, b: Uint8Array) { let sum = 0; for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]); return sum / a.length; }
function islands(data: Uint8Array, width: number, height: number) {
	const seen = new Uint8Array(width * height), queue = new Int32Array(width * height); let count = 0;
	for (let seed = 0; seed < seen.length; seed++) {
		if (seen[seed] || data[seed * 4 + 3] < 128) continue;
		let head = 0, tail = 1; queue[0] = seed; seen[seed] = 1;
		while (head < tail) {
			const index = queue[head++], x = index % width, y = Math.floor(index / width);
			for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
				const nx = x + dx, ny = y + dy, neighbor = ny * width + nx;
				if (nx < 0 || ny < 0 || nx >= width || ny >= height || seen[neighbor] || data[neighbor * 4 + 3] < 128) continue;
				seen[neighbor] = 1; queue[tail++] = neighbor;
			}
		}
		if (tail > 3) count++;
	}
	return count;
}
function logical(details: Record<string, number>) {
	return ['count', 'full', 'feeding', 'depositedLength', 'beltDistance', 'contactX', 'contactY', 'contactTheta'].map((key) => details[key]);
}

describe('native continuous thread study', () => {
	it('renders the integrated deposit, preserves older history on mode/control changes, and stops full history without eviction', async () => {
		const model = await createThreadStudy(device, format, () => { throw new Error('A consumer callback is not the material owner.'); });
		try {
			model.resize(960, 540); const initial = await model.inspect();
			expect(initial.finite).toBe(true); expect(initial.details.count).toBeGreaterThan(300);
			const before = await pixels(model, 960, 540); expect(coverage(before)).toBeGreaterThan(1000); expect(islands(before, 960, 540)).toBe(1);
			model.setControls({ ratio: 0.75 }); expect(logical((await model.inspect()).details)).toEqual(logical(initial.details));
			model.setMode('braid'); await pixels(model, 960, 540); model.setMode('deposition');
			const restored = await pixels(model, 960, 540); let alphaChanges = 0, maxColor = 0, colorError = 0;
			for (let i = 0; i < before.length; i++) {
				const error = Math.abs(before[i] - restored[i]);
				if (i % 4 === 3) alphaChanges += Number(error > 0); else { maxColor = Math.max(maxColor, error); colorError += error; }
			}
			console.info('Thread mode round-trip exact coverage / color envelope', { alphaChanges, maxColor, meanColorError: colorError / (960 * 540 * 3) });
			expect(alphaChanges).toBe(0); expect(maxColor).toBeLessThanOrEqual(8); expect(colorError / (960 * 540 * 3)).toBeLessThan(0.002);
			const uploaded = (await model.inspect()).details.positionUploadBytes;
			model.setFeeding(true);
			const encoder = device.createCommandEncoder(); for (let i = 0; i < 150; i++) model.step(encoder, 1 / 120, idle); device.queue.submit([encoder.finish()]);
			model.setFeeding(false); const after = await model.inspect();
			expect(after.details.depositedLength).toBeGreaterThan(initial.details.depositedLength); expect(difference(before, await pixels(model, 960, 540))).toBeGreaterThan(0.5);
			expect((await model.inspect()).details.positionUploadBytes - uploaded).toBe((after.details.count - initial.details.count) * 16);
			model.setControls({ feed: 1.2 }); for (let i = 0; i < 3; i++) model.depositSample(3);
			const full = await model.inspect(); expect(full.finite).toBe(true); expect(full.details.count).toBe(THREAD_HISTORY_CAPACITY); expect(full.details.full).toBe(1);
			model.setFeeding(true); model.depositSample(3); expect(logical((await model.inspect()).details)).toEqual(logical(full.details));
			model.reset(); const reset = await model.inspect(); expect(reset.details.count).toBe(1); expect(reset.mass).toBe(0); expect(coverage(await pixels(model, 960, 540))).toBe(0);
		} finally { model.dispose(); }
	});
	it('renders three depth-separated smooth strands and updates native authored controls without running a solver', async () => {
		const model = await createThreadStudy(device, format);
		try {
			model.resize(960, 540); model.setMode('braid'); const before = await pixels(model, 960, 540), state = await model.inspect();
			expect(state.details.count).toBe(768); expect(state.details.conservativeSurfaceGap).toBeGreaterThan(0.02);
			expect(coverage(before)).toBeGreaterThan(8000); expect(coverage(before)).toBeLessThan(70000);
			model.setControls({ spacing: 0.075, turns: 4 }); const narrow = await pixels(model, 960, 540);
			expect(difference(before, narrow)).toBeGreaterThan(1); expect((await model.inspect()).details.conservativeSurfaceGap).toBeGreaterThan(0.02);
			model.setFeeding(true); const encoder = device.createCommandEncoder(); model.step(encoder, 0.05, idle); device.queue.submit([encoder.finish()]);
			expect(difference(narrow, await pixels(model, 960, 540))).toBe(0); expect((await model.inspect()).details.feeding).toBe(0);
		} finally { model.dispose(); }
	});
	it('preserves model state through fractional2x/3x native depth/MSAA sizing, and keeps a valid graph after a rejected native allocation', async () => {
		const model = await createThreadStudy(device, format);
		try {
			const two = presentationSize(421.25, 237.125, 2), three = presentationSize(421.25, 237.125, 3);
			model.resize(two.width, two.height); const area2 = coverage(await pixels(model, two.width, two.height)), before = await model.inspect();
			model.resize(three.width, three.height); const after = await model.inspect(), area3 = coverage(await pixels(model, three.width, three.height));
			expect(logical(after.details)).toEqual(logical(before.details)); expect(after.details.stateBytes).toBe(before.details.stateBytes);
			expect((await model.inspect()).details.positionUploadBytes).toBe(before.details.positionUploadBytes);
			expect(after.details.attachmentBytes).toBe(three.width * three.height * 24); expect(after.details.outputBytes).toBe(three.width * three.height * 4);
			expect(model.memoryBytes).toBe(after.details.stateBytes + after.details.attachmentBytes + after.details.indexBytes);
			expect(area3 / area2).toBeCloseTo(2.25, 1); expect(after.details.radialSegments).toBeGreaterThanOrEqual(before.details.radialSegments);
			expect(() => model.resize(8192, 8192)).toThrow('dimensions');
			expect(() => model.resize(4096, 4096)).toThrow('live budget');
			expect(logical((await model.inspect()).details)).toEqual(logical(after.details));
			expect(coverage(await pixels(model, three.width, three.height))).toBeCloseTo(area3, 4);
			console.info('Native thread resources', { two, three, after: after.details });
		} finally { model.dispose(); }
	});
});
