import { afterEach, describe, expect, it, vi } from 'vitest';
import { LabSession } from './LabSession.js';
import type { LiquidExperiment, LiquidSnapshot } from './types.js';

const snapshot: LiquidSnapshot = { finite: true, mass: 0, initialMass: 0, min: 0, max: 0, kinetic: 0, details: {} };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function fixture() {
	let hidden = false, id = 0, time = 100, defer = false;
	const callbacks = new Map<number, FrameRequestCallback>(), completions: (() => void)[] = [];
	const document = new EventTarget(); Object.defineProperty(document, 'hidden', { get: () => hidden });
	vi.stubGlobal('document', document); vi.stubGlobal('window', { devicePixelRatio: 2 });
	vi.stubGlobal('matchMedia', () => new EventTarget());
	vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { callbacks.set(++id, callback); return id; }));
	vi.stubGlobal('cancelAnimationFrame', vi.fn((handle: number) => callbacks.delete(handle)));
	const queue = { submit: vi.fn(), onSubmittedWorkDone: vi.fn(() => defer ? new Promise<void>((resolve) => completions.push(resolve)) : Promise.resolve()) };
	const device = Object.assign(new EventTarget(), { queue, limits: { maxTextureDimension2D: 8192 }, lost: new Promise(() => {}),
		createCommandEncoder: vi.fn(() => ({ finish: () => ({}) })), destroy: vi.fn() });
	const context = { configure: vi.fn(), unconfigure: vi.fn(), getCurrentTexture: () => ({ createView: () => ({}) }) };
	const canvas = { width: 0, height: 0, getContext: () => context, getBoundingClientRect: () => ({ width: 300.25, height: 180.25 }) };
	vi.stubGlobal('navigator', { gpu: { requestAdapter: async () => ({ info: {}, requestDevice: async () => device }), getPreferredCanvasFormat: () => 'rgba8unorm' } });
	const model = { memoryBytes: 16, resize: vi.fn(), reset: vi.fn(), step: vi.fn(), render: vi.fn(), endInput: vi.fn(), inspect: vi.fn(async () => snapshot), dispose: vi.fn() } satisfies LiquidExperiment;
	const session = await LabSession.create(canvas as unknown as HTMLCanvasElement, () => {});
	session.pause(); await session.load(async () => model);
	return { session, model, device, context, callbacks, queue, completions,
		defer(value: boolean) { defer = value; },
		visibility(value: boolean) { hidden = value; document.dispatchEvent(new Event('visibilitychange')); },
		async frame() { const pending = [...callbacks]; callbacks.clear(); time += 1000 / 60; for (const [, callback] of pending) callback(time); await flush(); },
		async settle() { defer = false; while (completions.length) { completions.shift()!(); await flush(); } },
	};
}

describe('private lab event-driven frame ownership', () => {
	it('has no idle RAF after one paused presentation; each explicit redraw coalesces to one frame', async () => {
		const f = await fixture();
		try {
			expect(f.callbacks.size).toBe(1); await f.frame(); expect(f.model.render).toHaveBeenCalledTimes(1);
			expect(f.callbacks.size, 'A clean paused material must not poll RAF').toBe(0);
			f.session.invalidate(); f.session.invalidate(); expect(f.callbacks.size).toBe(1);
			await f.frame(); expect(f.model.render).toHaveBeenCalledTimes(2); expect(f.callbacks.size).toBe(0);
			f.session.resize(301.25, 180.25); expect(f.callbacks.size).toBe(1); await f.frame(); expect(f.callbacks.size).toBe(0);
			f.session.reset(); expect(f.callbacks.size).toBe(1); await f.frame(); expect(f.callbacks.size).toBe(0);
		} finally { f.session.dispose(); }
	});
	it('unpausing and nudging restart the clock; a clean pause cancels the owned callback', async () => {
		const f = await fixture();
		try {
			await f.frame(); f.session.pause(); expect(f.callbacks.size).toBe(1); await f.frame();
			expect(f.model.step).toHaveBeenCalledTimes(2); expect(f.callbacks.size).toBe(1);
			f.session.pause(); expect(f.callbacks.size).toBe(0);
			f.session.nudge(); expect(f.callbacks.size).toBe(1); await f.frame(); expect(f.model.step).toHaveBeenCalledTimes(4);
		} finally { f.session.dispose(); }
	});
	it('cancels hidden work and preserves one requested paused redraw until visibility returns', async () => {
		const f = await fixture();
		try {
			await f.frame(); f.session.pause(); f.session.pointer(0.2, 0.3, true);
			f.visibility(true); expect(f.callbacks.size).toBe(0); f.session.invalidate(); expect(f.callbacks.size).toBe(0);
			f.session.pause(); f.visibility(false); expect(f.callbacks.size).toBe(1); await f.frame();
			expect(f.model.step).not.toHaveBeenCalled(); expect(f.callbacks.size).toBe(0);
		} finally { f.session.dispose(); }
	});
	it('waits for GPU completion instead of polling a full two-frame backlog', async () => {
		const f = await fixture();
		try {
			await f.frame(); f.defer(true); f.session.pause(); await f.frame(); await f.frame();
			expect(f.completions).toHaveLength(2); expect(f.callbacks.size, 'GPU backpressure must not create a busy RAF loop').toBe(0);
			f.completions.shift()!(); await flush(); expect(f.callbacks.size).toBe(1);
			f.session.pause(); expect(f.callbacks.size).toBe(0); await f.settle(); expect(f.callbacks.size).toBe(0);
		} finally { f.session.dispose(); }
	});
	it('does not poll while measuring and rearms one paused presentation after the diagnostic', async () => {
		const f = await fixture();
		try {
			await f.frame(); f.session.invalidate(); f.defer(true); const measured = f.session.measure();
			expect(f.session.state.busy).toBe(true); expect(f.callbacks.size).toBe(0);
			await f.settle(); await measured; expect(f.session.state.busy).toBe(false); expect(f.callbacks.size).toBe(1);
			await f.frame(); expect(f.callbacks.size).toBe(0);
		} finally { f.session.dispose(); }
	});
	it('does not arm obsolete factories, failed sessions, or callbacks after disposal', async () => {
		const f = await fixture();
		try {
			await f.frame(); let release!: (model: LiquidExperiment) => void;
			const obsolete = { ...f.model, dispose: vi.fn() };
			const loading = f.session.load(() => new Promise((resolve) => { release = resolve; })); await flush();
			await f.session.load(async () => f.model); release(obsolete); await loading;
			expect(obsolete.dispose).toHaveBeenCalledOnce(); expect(f.callbacks.size).toBe(1);
			f.device.dispatchEvent(Object.assign(new Event('uncapturederror'), { error: { message: 'test rejection' } }));
			expect(f.callbacks.size).toBe(0); f.session.invalidate(); expect(f.callbacks.size).toBe(0);
			f.session.dispose(); f.visibility(true); f.visibility(false); f.session.invalidate(); expect(f.callbacks.size).toBe(0);
		} finally { f.session.dispose(); }
	});
	it('retains a redraw requested reentrantly while consuming the current paused frame', async () => {
		const f = await fixture();
		try {
			f.model.render.mockImplementationOnce(() => f.session.invalidate());
			await f.frame(); expect(f.callbacks.size).toBe(1); await f.frame();
			expect(f.model.render).toHaveBeenCalledTimes(2); expect(f.callbacks.size).toBe(0);
		} finally { f.session.dispose(); }
	});
	it('keeps the final release endpoint until the newly armed simulation actually consumes it', async () => {
		const f = await fixture();
		try {
			await f.frame(); f.session.pause(); f.model.endInput.mockClear();
			f.session.pointer(0.2, 0.3, true); f.session.pointer(0.21, 0.32, false);
			expect(f.model.endInput).not.toHaveBeenCalled(); await f.frame();
			const input = f.model.step.mock.calls[0][2];
			expect(input).toMatchObject({ x: 0.21, y: 0.32, active: true }); expect(input.vx).toBeGreaterThan(0);
			expect(f.model.endInput).toHaveBeenCalledOnce();
			expect(f.model.endInput.mock.invocationCallOrder[0]).toBeGreaterThan(f.model.step.mock.invocationCallOrder.at(-1)!);
		} finally { f.session.dispose(); }
	});
	it('cannot resume measurement work after disposal while its queue completion was pending', async () => {
		const f = await fixture();
		await f.frame(); f.defer(true); const measurement = f.session.measure();
		const rejected = expect(measurement).rejects.toThrow('interrupted'); f.session.dispose();
		await f.settle(); await rejected;
		expect(f.model.reset).not.toHaveBeenCalled(); expect(f.callbacks.size).toBe(0); expect(f.context.unconfigure).toHaveBeenCalledOnce();
	});
	it('does not replay pointer movement or a tap accumulated during an explicit busy diagnostic', async () => {
		const f = await fixture();
		try {
			await f.frame(); f.session.pause(); f.session.pointer(0.2, 0.3, true); f.session.pointer(0.25, 0.3, true);
			f.defer(true); const measured = f.session.measure();
			f.session.pointer(0.6, 0.7, true); f.session.setContact(0.8);
			await f.settle(); await measured; f.model.step.mockClear(); await f.frame();
			expect(f.model.step.mock.calls[0][2]).toMatchObject({ active: false, vx: 0, vy: 0, press: 0 });
		} finally { f.session.dispose(); }
	});
});
