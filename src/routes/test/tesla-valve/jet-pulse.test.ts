import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RGB } from '$lib/engine/types.js';
import { jetFlow, jetVelocity, startJetPulse } from './jet-pulse.js';
import { getTuning, TUNINGS } from './tunings.js';

let pending: Map<number, FrameRequestCallback>;
let next: number;
let visibility: EventTarget & { hidden: boolean };
let media: EventTarget & { matches: boolean };
let removeVisibility: ReturnType<typeof vi.spyOn>;
let removeMedia: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	pending = new Map();
	next = 0;
	visibility = Object.assign(new EventTarget(), { hidden: false });
	media = Object.assign(new EventTarget(), { matches: false });
	removeVisibility = vi.spyOn(visibility, 'removeEventListener');
	removeMedia = vi.spyOn(media, 'removeEventListener');
	vi.stubGlobal('document', visibility);
	vi.stubGlobal(
		'matchMedia',
		vi.fn(() => media)
	);
	vi.stubGlobal(
		'requestAnimationFrame',
		vi.fn((callback: FrameRequestCallback) => {
			pending.set(++next, callback);
			return next;
		})
	);
	vi.stubGlobal(
		'cancelAnimationFrame',
		vi.fn((id: number) => pending.delete(id))
	);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function frame(now: number) {
	expect(pending.size).toBe(1);
	const [id, callback] = [...pending][0];
	pending.delete(id);
	callback(now);
	expect(pending.size).toBe(1);
}
function setup(name = 'gentle') {
	const flow = getTuning(`${name}-jet`).config.flow;
	const handle = { isPaused: false };
	const emit = vi.fn();
	const base = name === 'gentle' ? 80 : 100;
	const stop = startJetPulse(flow, base, base * 3, handle, emit, name === 'gentle');
	return { flow, handle, emit, base, stop };
}
function lastVelocity(emit: ReturnType<typeof vi.fn>): number {
	return emit.mock.lastCall![0].sources[0].velocity.x;
}
function lastDye(emit: ReturnType<typeof vi.fn>): RGB {
	return emit.mock.lastCall![0].sources[0].dye;
}

describe('jet pulse', () => {
	it.each([
		[80, 240],
		[100, 300]
	])('peaks, troughs, repeats and stays bounded (%s/%s)', (base, peak) => {
		expect(jetVelocity(0, base, peak)).toBe(peak);
		expect(jetVelocity(0.3, base, peak)).toBeCloseTo(base);
		expect(jetVelocity(0.6, base, peak)).toBe(base);
		expect(jetVelocity(1.2, base, peak)).toBeCloseTo(peak);
		for (let t = 0; t < 3; t += 0.007) {
			expect(jetVelocity(t, base, peak)).toBeGreaterThanOrEqual(base);
			expect(jetVelocity(t, base, peak)).toBeLessThanOrEqual(peak);
			expect(jetVelocity(t + 1.2, base, peak)).toBeCloseTo(jetVelocity(t, base, peak));
		}
	});

	it('replaces complete flow/source/velocity, changes only x, never mutates recipes', () => {
		const before = structuredClone(TUNINGS);
		const flow = getTuning().config.flow;
		const updated = jetFlow(flow, 0.1, 80, 240);
		expect(updated).not.toBe(flow);
		expect(updated.sources).not.toBe(flow.sources);
		expect(updated.sources![0]).not.toBe(flow.sources![0]);
		expect(updated.sources![0].velocity).not.toBe(flow.sources![0].velocity);
		expect(updated).toEqual({
			...flow,
			sources: [
				{
					...flow.sources![0],
					velocity: { x: jetVelocity(0.1, 80, 240), y: 0 }
				}
			]
		});
		expect(TUNINGS).toEqual(before);
	});

	it.each([
		[0, { r: 0.06, g: 0.18, b: 0.24 }],
		[1, { r: 0.15, g: 0.12, b: 0.21 }],
		[2, { r: 0.24, g: 0.06, b: 0.18 }],
		[3, { r: 0.24, g: 0.12, b: 0.12 }],
		[4, { r: 0.24, g: 0.18, b: 0.06 }],
		[5, { r: 0.15, g: 0.18, b: 0.15 }],
		[6, { r: 0.06, g: 0.18, b: 0.24 }]
	] as const)('cycles Gentle dye smoothly at %s active seconds', (seconds, expected) => {
		const flow = getTuning().config.flow;
		for (const t of [seconds, seconds + 6, seconds + 60]) {
			const dye = jetFlow(flow, t, 80, 240, true).sources![0].dye as RGB;
			for (const channel of ['r', 'g', 'b'] as const) expect(dye[channel]).toBeCloseTo(expected[channel], 12);
		}
	});

	it('changes only dye and x, keeps intensity bounded, never mutates recipes', () => {
		const before = structuredClone(TUNINGS);
		const flow = getTuning().config.flow;
		for (let t = 0; t < 12; t += 0.037) {
			const fixed = jetFlow(flow, t, 80, 240);
			const colored = jetFlow(flow, t, 80, 240, true);
			const source = colored.sources![0];
			const dye = source.dye as RGB;
			expect(colored).toEqual({
				...fixed,
				sources: [{ ...fixed.sources![0], dye }]
			});
			expect(colored).not.toBe(flow);
			expect(colored.sources).not.toBe(flow.sources);
			expect(source).not.toBe(flow.sources![0]);
			expect(source.velocity).not.toBe(flow.sources![0].velocity);
			expect(dye).not.toBe(flow.sources![0].dye);
			for (const channel of Object.values(dye)) {
				expect(channel).toBeGreaterThanOrEqual(0.06 - 1e-12);
				expect(channel).toBeLessThanOrEqual(0.24 + 1e-12);
			}
			expect(dye.r + dye.g + dye.b).toBeCloseTo(0.48, 12);
		}
		expect(TUNINGS).toEqual(before);
	});

	it('keeps every unflagged source dye fixed and the Cushioned scheduler unchanged', () => {
		for (const { config } of TUNINGS.filter(({ config }) => config.flow.sources)) {
			for (const seconds of [0, 1, 2, 4, 6]) {
				const updated = jetFlow(config.flow, seconds, 100, 300);
				expect(updated.sources).toEqual(
					config.flow.sources!.map((source) => ({
						...source,
						velocity: { ...source.velocity!, x: jetVelocity(seconds, 100, 300) }
					}))
				);
				for (let i = 0; i < updated.sources!.length; i++)
					expect(updated.sources![i].dye).toBe(config.flow.sources![i].dye);
			}
		}
		const { flow, emit, stop } = setup('cushioned');
		for (const now of [0, 10, 20, 1000, 2000]) {
			frame(now);
			expect(lastDye(emit)).toBe(flow.sources![0].dye);
		}
		stop();
	});

	it('keeps one RAF, starts at peak, caps active elapsed, clears paused clock', () => {
		const { handle, emit, stop } = setup();
		frame(0);
		expect(lastVelocity(emit)).toBe(240);
		expect(lastDye(emit)).toEqual({ r: 0.06, g: 0.18, b: 0.24 });
		frame(1000);
		expect(lastVelocity(emit)).toBe(jetVelocity(1 / 60, 80, 240));
		const activeDye = lastDye(emit);
		expect(activeDye).toEqual(jetFlow(getTuning().config.flow, 1 / 60, 80, 240, true).sources![0].dye);
		expect(activeDye).not.toEqual({ r: 0.06, g: 0.18, b: 0.24 });
		handle.isPaused = true;
		frame(2000);
		expect(emit).toHaveBeenCalledTimes(2);
		handle.isPaused = false;
		frame(9000);
		expect(lastVelocity(emit)).toBe(jetVelocity(1 / 60, 80, 240));
		expect(lastDye(emit)).toEqual(activeDye);
		frame(9010);
		expect(lastVelocity(emit)).toBeCloseTo(jetVelocity(1 / 60 + 0.01, 80, 240));
		expect(lastDye(emit)).not.toEqual(activeDye);
		stop();
	});

	it('resets visibility clock even when the hidden tab receives no RAF', () => {
		const { emit, stop } = setup();
		frame(0);
		frame(10);
		const before = lastVelocity(emit);
		const dyeBefore = lastDye(emit);
		visibility.hidden = true;
		visibility.dispatchEvent(new Event('visibilitychange'));
		visibility.hidden = false;
		visibility.dispatchEvent(new Event('visibilitychange'));
		frame(90000);
		expect(lastVelocity(emit)).toBe(before);
		expect(lastDye(emit)).toEqual(dyeBefore);
		visibility.hidden = true;
		frame(90010);
		expect(emit).toHaveBeenCalledTimes(3);
		visibility.hidden = false;
		visibility.dispatchEvent(new Event('visibilitychange'));
		frame(190000);
		expect(lastDye(emit)).toEqual(dyeBefore);
		frame(190010);
		expect(lastDye(emit)).not.toEqual(dyeBefore);
		stop();
	});

	it('suppresses reduced-motion updates, clears the clock on preference changes', () => {
		media.matches = true;
		const { emit, stop } = setup();
		frame(0);
		frame(100);
		expect(emit).not.toHaveBeenCalled();
		media.matches = false;
		media.dispatchEvent(new Event('change'));
		frame(1000);
		frame(1010);
		expect(lastVelocity(emit)).toBe(jetVelocity(0.01, 80, 240));
		const dyeBefore = lastDye(emit);
		expect(dyeBefore).not.toEqual({ r: 0.06, g: 0.18, b: 0.24 });
		media.matches = true;
		media.dispatchEvent(new Event('change'));
		frame(2000);
		expect(emit).toHaveBeenCalledTimes(2);
		media.matches = false;
		media.dispatchEvent(new Event('change'));
		frame(9000);
		expect(lastVelocity(emit)).toBe(jetVelocity(0.01, 80, 240));
		expect(lastDye(emit)).toEqual(dyeBefore);
		frame(9010);
		expect(lastDye(emit)).not.toEqual(dyeBefore);
		stop();
	});

	it.each(['gentle', 'cushioned'])(
		'cleans up, suppresses stale callbacks, restarts %s at its initial peak',
		(name) => {
			const first = setup(name);
			frame(0);
			frame(10);
			if (name === 'gentle') expect(lastDye(first.emit)).not.toEqual(first.flow.sources![0].dye);
			const stale = [...pending.values()][0];
			first.stop();
			expect(pending.size).toBe(0);
			expect(removeVisibility).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
			expect(removeMedia).toHaveBeenCalledWith('change', expect.any(Function));
			stale(10000);
			expect(pending.size).toBe(0);
			expect(first.emit).toHaveBeenCalledTimes(2);
			const restarted = setup(name);
			expect(restarted.flow.sources![0].velocity!.x).toBe(restarted.base * 3);
			frame(20000);
			expect(lastVelocity(restarted.emit)).toBe(restarted.base * 3);
			expect(lastDye(restarted.emit)).toEqual(
				name === 'gentle' ? { r: 0.06, g: 0.18, b: 0.24 } : { r: 0.02, g: 0.06, b: 0.08 }
			);
			stale(20001);
			expect(pending.size).toBe(1);
			restarted.stop();
			expect(pending.size).toBe(0);
		}
	);
});
