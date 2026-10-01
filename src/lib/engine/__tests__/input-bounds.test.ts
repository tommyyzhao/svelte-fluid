import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULTS, resolveConfig } from '../FluidEngine.js';
import {
	MAX_AUTO_SPLAT_COUNT,
	MAX_INITIAL_SPLATS,
	MAX_QUEUED_RANDOM_SPLATS,
	MAX_RANDOM_SPLATS_PER_FRAME,
	enqueueRandomSplats,
	isFiniteSplat,
	randomSplatsThisFrame,
	resetInputWarnings
} from '../input-bounds.js';

afterEach(() => {
	vi.restoreAllMocks();
	resetInputWarnings();
});

describe('random splat backlog', () => {
	it('clamps counts and saturates the retained backlog', () => {
		expect(enqueueRandomSplats(0, 5)).toBe(5);
		expect(enqueueRandomSplats(0, 2.9)).toBe(2);
		expect(enqueueRandomSplats(3, -10)).toBe(3);
		expect(enqueueRandomSplats(0, 1e9)).toBe(MAX_QUEUED_RANDOM_SPLATS);
		expect(enqueueRandomSplats(MAX_QUEUED_RANDOM_SPLATS, 1)).toBe(MAX_QUEUED_RANDOM_SPLATS);
	});

	it('ignores non-finite counts with one warning', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(enqueueRandomSplats(4, Number.NaN)).toBe(4);
		expect(enqueueRandomSplats(4, Number.POSITIVE_INFINITY)).toBe(4);
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it('drains at most a fixed number per frame', () => {
		let pending = enqueueRandomSplats(0, 1000);
		const frames: number[] = [];
		while (pending > 0) {
			const n = randomSplatsThisFrame(pending);
			frames.push(n);
			pending -= n;
		}
		expect(Math.max(...frames)).toBe(MAX_RANDOM_SPLATS_PER_FRAME);
		expect(frames.reduce((a, b) => a + b, 0)).toBe(MAX_QUEUED_RANDOM_SPLATS);
	});
});

describe('splat argument validation', () => {
	const color = { r: 1, g: 0.5, b: 0 };

	it('accepts finite input, including out-of-range coordinates', () => {
		expect(isFiniteSplat(0.5, 0.5, 100, -100, color)).toBe(true);
		expect(isFiniteSplat(-2, 3, 0, 0, color)).toBe(true);
	});

	it('rejects any non-finite coordinate, force, or color channel without throwing', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(isFiniteSplat(Number.NaN, 0.5, 0, 0, color)).toBe(false);
		expect(isFiniteSplat(0.5, Number.POSITIVE_INFINITY, 0, 0, color)).toBe(false);
		expect(isFiniteSplat(0.5, 0.5, Number.NaN, 0, color)).toBe(false);
		expect(isFiniteSplat(0.5, 0.5, 0, Number.NEGATIVE_INFINITY, color)).toBe(false);
		expect(isFiniteSplat(0.5, 0.5, 0, 0, { r: Number.NaN, g: 0, b: 0 })).toBe(false);
		expect(isFiniteSplat(0.5, 0.5, 0, 0, undefined as never)).toBe(false);
		expect(warn).toHaveBeenCalledTimes(1);
	});
});

describe('resolveConfig non-finite and count bounds', () => {
	it('keeps the previous hot value when a number is non-finite', () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const base = resolveConfig({ curl: 12, splatRadius: 0.3 }, DEFAULTS);
		const next = resolveConfig(
			{ curl: Number.NaN, splatRadius: Number.POSITIVE_INFINITY, velocityDissipation: 0.5 },
			base
		);
		expect(next.CURL).toBe(12);
		expect(next.SPLAT_RADIUS).toBe(0.3);
		expect(next.VELOCITY_DISSIPATION).toBe(0.5);
	});

	it('keeps the previous color when any channel is non-finite', () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const base = resolveConfig({ backColor: { r: 1, g: 2, b: 3 } }, DEFAULTS);
		const next = resolveConfig({ backColor: { r: Number.NaN, g: 0, b: 0 } }, base);
		expect(next.BACK_COLOR).toEqual({ r: 1, g: 2, b: 3 });
	});

	it('warns once per field and never throws', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		for (let i = 0; i < 5; i++) expect(() => resolveConfig({ curl: Number.NaN }, DEFAULTS)).not.toThrow();
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it('does not mutate the caller config', () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const input = { curl: Number.NaN, bloom: false };
		resolveConfig(input, DEFAULTS);
		expect(input).toEqual({ curl: Number.NaN, bloom: false });
	});

	it('clamps splat counts to integer bounds', () => {
		expect(resolveConfig({ initialSplatCount: 1e6 }, DEFAULTS).INITIAL_SPLAT_MAX).toBe(MAX_INITIAL_SPLATS);
		expect(resolveConfig({ initialSplatCount: -4 }, DEFAULTS).INITIAL_SPLAT_MIN).toBe(0);
		const range = resolveConfig({ initialSplatCountMin: 2.7, initialSplatCountMax: 500 }, DEFAULTS);
		expect([range.INITIAL_SPLAT_MIN, range.INITIAL_SPLAT_MAX]).toEqual([2, MAX_INITIAL_SPLATS]);
		expect(resolveConfig({ autoSplatCount: 1e6 }, DEFAULTS).AUTO_SPLAT_COUNT).toBe(MAX_AUTO_SPLAT_COUNT);
		expect(resolveConfig({ autoSplatCount: 3 }, DEFAULTS).AUTO_SPLAT_COUNT).toBe(3);
	});
});
