import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFrameGate } from '../frame-scheduler.js';

describe('presentation deadline gate', () => {
	for (const hz of [60, 90, 120, 144]) {
		it(`presents about 60/s at ${hz} Hz without phase drift`, () => {
			const gate = createFrameGate();
			let count = 0;
			for (let i = 0; i < hz * 10; i++) count += Number(gate.shouldSubmit(i * 1000 / hz, 60));
			expect(Math.abs(count - 600)).toBeLessThanOrEqual(1);
		});
	}
	it('passes every 60 Hz frame, including jitter', () => {
		const gate = createFrameGate();
		for (let i = 0; i < 120; i++) expect(gate.shouldSubmit(i * 1000 / 60 + (i % 2) * 0.1, 60)).toBe(true);
	});
	it('retains ideal phase through display jitter', () => {
		const gate = createFrameGate();
		let count = 0;
		for (let i = 0; i < 1200; i++) count += Number(gate.shouldSubmit(i * 1000 / 120 + Math.sin(i) * 0.8, 60));
		expect(Math.abs(count - 600)).toBeLessThanOrEqual(1);
	});
	it('hot rates, reset, suspension, reversed clocks present immediately', () => {
		const gate = createFrameGate();
		expect(gate.shouldSubmit(0, 60)).toBe(true);
		expect(gate.shouldSubmit(8, 60)).toBe(false);
		expect(gate.shouldSubmit(9, 30)).toBe(true);
		expect(gate.shouldSubmit(17)).toBe(false);
		gate.reset();
		expect(gate.shouldSubmit(18)).toBe(true);
		expect(gate.shouldSubmit(1000)).toBe(true);
		expect(gate.shouldSubmit(999)).toBe(true);
		for (const rate of [0, null]) {
			for (let i = 0; i < 10; i++) expect(gate.shouldSubmit(1001 + i, rate)).toBe(true);
		}
	});
	it('reanchors far-behind deadlines without bursts', () => {
		const gate = createFrameGate();
		gate.shouldSubmit(0, 60);
		gate.shouldSubmit(8, 60);
		expect(gate.shouldSubmit(80, 60)).toBe(true);
		expect(gate.shouldSubmit(88, 60)).toBe(false);
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.resetModules();
});

describe('shared frame scheduler', () => {
	it('imports without touching requestAnimationFrame (SSR-safe)', async () => {
		expect(typeof globalThis.requestAnimationFrame).toBe('undefined');
		const scheduler = await import('../frame-scheduler.js');
		expect(scheduler.activeFrameSubscribers()).toBe(0);
	});

	it('runs all subscribers per frame, evicts a thrower, and stops when empty', async () => {
		let pending: FrameRequestCallback | null = null;
		const raf = vi.fn((cb: FrameRequestCallback) => {
			pending = cb;
			return 1;
		});
		const cancel = vi.fn(() => {
			pending = null;
		});
		vi.stubGlobal('requestAnimationFrame', raf);
		vi.stubGlobal('cancelAnimationFrame', cancel);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { subscribeFrame, activeFrameSubscribers } = await import('../frame-scheduler.js');
		const flush = () => {
			const cb = pending;
			pending = null;
			cb?.(0);
		};

		const good = vi.fn();
		const onError = vi.fn();
		const bad = vi.fn(() => {
			throw new Error('boom');
		});
		const stopGood = subscribeFrame(good);
		subscribeFrame(bad, onError);
		expect(raf).toHaveBeenCalledTimes(1);

		flush();
		expect(good).toHaveBeenCalledTimes(1);
		expect(bad).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(activeFrameSubscribers()).toBe(1);

		flush();
		expect(good).toHaveBeenCalledTimes(2);
		expect(bad).toHaveBeenCalledTimes(1);
		expect(raf).toHaveBeenCalledTimes(3);

		stopGood();
		stopGood();
		expect(activeFrameSubscribers()).toBe(0);
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(pending).toBeNull();
	});
});
