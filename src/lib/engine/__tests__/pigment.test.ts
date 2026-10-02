import { describe, expect, it } from 'vitest';
import {
	DabQueue,
	MAX_DABS_PER_STEP,
	MAX_DAB_DELAY,
	MAX_LOGGED_DABS,
	MAX_QUEUED_DABS,
	MAX_WET_STEPS,
	StrokeLog,
	bloom,
	gesture,
	openingWash,
	parseCornerRadius,
	wick
} from '../pigment/brush.js';
import type { Dab } from '../pigment/brush.js';
import { PIGMENT_DEFAULTS, resolvePigmentOptions } from '../pigment/options.js';
// SSR: importing the engine must not touch window/matchMedia/document.
import { PigmentEngine } from '../pigment/PigmentEngine.js';

const dab = (over: Partial<Dab> = {}): Dab => ({ x: 10, y: 10, r: 8, water: 0.2, pigment: [0.05, 0, 0, 0], ...over });

describe('pigment drying clock', () => {
	it('is bounded and monotone without new input', () => {
		const q = new DabQueue();
		q.push([dab({ water: 99 }), dab({ delay: 1e9 })]);
		const start = q.wetSteps;
		expect(start).toBeLessThanOrEqual(MAX_WET_STEPS + MAX_DAB_DELAY);
		let prev = start;
		let steps = 0;
		while (q.wet) {
			q.take();
			q.tick();
			expect(q.wetSteps).toBeLessThanOrEqual(prev);
			prev = q.wetSteps;
			steps++;
			expect(steps).toBeLessThanOrEqual(MAX_WET_STEPS + MAX_DAB_DELAY + 1);
		}
		expect(q.size).toBe(0);
	});

	it('shallow dabs dry sooner than deep ones', () => {
		const shallow = new DabQueue();
		const deep = new DabQueue();
		shallow.push([dab({ water: 0.05 })]);
		deep.push([dab({ water: 0.8 })]);
		expect(shallow.wetSteps).toBeLessThan(deep.wetSteps);
	});
});

describe('pigment input bounds (ADR-0079)', () => {
	it('caps the retained queue and drops saturated input', () => {
		const q = new DabQueue();
		const many = Array.from({ length: MAX_QUEUED_DABS * 3 }, () => dab());
		expect(q.push(many)).toBe(MAX_QUEUED_DABS);
		expect(q.push([dab()])).toBe(0);
		expect(q.size).toBe(MAX_QUEUED_DABS);
	});

	it('lands at most MAX_DABS_PER_STEP per step', () => {
		const q = new DabQueue();
		q.push(Array.from({ length: 200 }, () => dab()));
		expect(q.take()).toHaveLength(MAX_DABS_PER_STEP);
		expect(q.size).toBe(200 - MAX_DABS_PER_STEP);
	});

	it('drops non-finite and degenerate dabs, clamps negatives', () => {
		const q = new DabQueue();
		const kept = q.push([
			dab({ x: NaN }),
			dab({ r: 0 }),
			dab({ pigment: [Infinity, 0, 0, 0] }),
			dab({ vx: -Infinity }),
			dab({ pigment: [-1, 0.1, 0, 0], water: -3 })
		]);
		expect(kept).toBe(1);
		const [d] = q.take();
		expect(d.pigment).toEqual([0, 0.1, 0, 0]);
		expect(d.water).toBe(0);
	});

	it('honours delays without exceeding the cap', () => {
		const q = new DabQueue();
		q.push([dab({ delay: 2 }), dab({ delay: 1e6 })]);
		expect(q.take()).toHaveLength(0);
		expect(q.take()).toHaveLength(0);
		expect(q.take()).toHaveLength(1);
	});

	it('stroke log keeps only the newest MAX_LOGGED_DABS for replay', () => {
		const log = new StrokeLog();
		log.record(Array.from({ length: MAX_LOGGED_DABS + 10 }, (_, i) => dab({ x: i })));
		expect(log.size).toBe(MAX_LOGGED_DABS);
		const batches = log.batches();
		expect(batches[0][0].x).toBe(10);
		expect(batches.flat()).toHaveLength(MAX_LOGGED_DABS);
	});
});

describe('pigment seeded determinism', () => {
	it('same seed, same marks; different seed, different marks', () => {
		expect(openingWash(800, 500, 4, 7)).toEqual(openingWash(800, 500, 4, 7));
		expect(openingWash(800, 500, 4, 7)).not.toEqual(openingWash(800, 500, 4, 8));
		expect(bloom(10, 10, 50, 1, 0.05, 3)).toEqual(bloom(10, 10, 50, 1, 0.05, 3));
		expect(gesture(400, 300, 0, 2)).toEqual(gesture(400, 300, 0, 2));
	});

	it('opening wash stays within its pigments', () => {
		for (const d of openingWash(800, 500, 1, 3)) expect(d.pigment.slice(1).every((v) => v === 0)).toBe(true);
		expect(openingWash(800, 500, 0, 3)).toEqual([]);
	});

	it('wick creeps along the lower edge from the entry side', () => {
		const out = wick({ x: 100, y: 100, w: 160, h: 40 }, 2, null);
		expect(out.length).toBeGreaterThan(10);
		expect(out.every((d) => d.pigment[2] > 0 && d.y >= 100)).toBe(true);
		expect(out[0].delay).toBe(0);
	});
});

describe('pigment resist shapes and opening wash', () => {
	it('parses computed border radii, including per-axis and percentages', () => {
		expect(parseCornerRadius('12px', 160, 44)).toEqual({ x: 12, y: 12 });
		expect(parseCornerRadius('10px 5px', 160, 44)).toEqual({ x: 10, y: 5 });
		expect(parseCornerRadius('50%', 160, 44)).toEqual({ x: 80, y: 22 });
		expect(parseCornerRadius('50% 20%', 100, 40)).toEqual({ x: 50, y: 8 });
		expect(parseCornerRadius('0px', 160, 44)).toEqual({ x: 0, y: 0 });
		expect(parseCornerRadius('', 160, 44)).toEqual({ x: 0, y: 0 });
	});

	it('never leaves stray stubs when resists cut the opening wash', () => {
		const W = 1280;
		const H = 544;
		// Resists that cut the gesture's start, like a hero's lede and button.
		const avoid = [
			{ x: 125, y: 230, w: 480, h: 110 },
			{ x: 125, y: 320, w: 110, h: 45 },
			{ x: 400, y: 100, w: 60, h: 400 }
		];
		for (let seed = 1; seed < 40; seed++) {
			const dabs = openingWash(W, H, 2, seed, avoid, 16);
			const stroke = dabs.filter((d) => !d.delay);
			const flower = dabs.filter((d) => d.delay);
			expect(stroke.length === 0 || stroke.length >= 12).toBe(true);
			// Contiguous: consecutive dabs overlap, so the stroke is one mark.
			for (let i = 1; i < stroke.length; i++) {
				const a = stroke[i - 1];
				const b = stroke[i];
				expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(a.r + b.r);
			}
			// A bloom is whole-centred or absent, never a bare ring of petals.
			expect(flower.length === 0 || flower[0].water === 0.8).toBe(true);
		}
	});
});

describe('pigment options: undefined never overwrites', () => {
	it('keeps resolved values for undefined and invalid fields', () => {
		const a = resolvePigmentOptions(PIGMENT_DEFAULTS, {
			paper: '#ffffff',
			pigments: ['#112233', '#445566'],
			brush: { size: 40, water: 2, pigment: 1 },
			seed: 9
		});
		const b = resolvePigmentOptions(a, {
			paper: undefined,
			pigments: undefined,
			brush: { size: undefined, water: NaN, pigment: undefined },
			seed: undefined
		});
		expect(b).toEqual(a);
		const c = resolvePigmentOptions(a, { paper: 'not a colour', pigments: ['nope'], seed: Infinity });
		expect(c).toEqual(a);
	});

	it('caps pigments at four and resolves pigment null to cycling', () => {
		const r = resolvePigmentOptions(PIGMENT_DEFAULTS, {
			pigments: ['#000', '#111', '#222', '#333', '#444'],
			brush: { pigment: null }
		});
		expect(r.pigments).toHaveLength(4);
		expect(r.brush.pigment).toBe(-1);
		expect(resolvePigmentOptions(r, { brush: { pigment: 9 } }).brush.pigment).toBe(3);
	});

	it('does not mutate its inputs', () => {
		const before = JSON.stringify(PIGMENT_DEFAULTS);
		resolvePigmentOptions(PIGMENT_DEFAULTS, { pigments: ['#123456'], brush: { size: 5 } });
		expect(JSON.stringify(PIGMENT_DEFAULTS)).toBe(before);
	});

	it('engine module imports without a DOM', () => {
		expect(typeof PigmentEngine).toBe('function');
	});
});
