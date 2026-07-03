import { describe, expect, it } from 'vitest';
import {
	DEFAULT_PERFORMANCE_GOVERNOR_THRESHOLDS,
	nextFrameTimeEmaMs,
	performanceGovernorStep
} from '../performance-governor.js';
import type { PerformanceGovernorFloors, PerformanceGovernorThresholds } from '../performance-governor.js';
import engineSrc from '../FluidEngine.ts?raw';

function methodBody(src: string, name: string): string {
	const start = src.indexOf(name);
	const open = src.indexOf('{', start);
	let depth = 0;
	for (let i = open; i < src.length; i++) {
		if (src[i] === '{') depth++;
		else if (src[i] === '}') {
			depth--;
			if (depth === 0) return src.slice(open + 1, i);
		}
	}
	throw new Error(`method ${name} body not found`);
}

const floors: PerformanceGovernorFloors = {
	pressureIterations: 8,
	substeps: 1
};

const thresholds: PerformanceGovernorThresholds = {
	...DEFAULT_PERFORMANCE_GOVERNOR_THRESHOLDS,
	shedAboveMs: 20,
	hysteresisMs: 3000,
	pressureStep: 4
};

describe('performance governor pure decision function', () => {
	it('keeps quality unchanged below the overload threshold', () => {
		const decision = performanceGovernorStep({
			emaMs: 12,
			currentTier: 'none',
			msSinceLastChange: 10_000,
			pressureIterations: 20,
			substeps: 4,
			floors,
			thresholds
		});

		expect(decision).toEqual({
			action: 'none',
			tier: 'none',
			pressureIterations: 20,
			substeps: 4,
			changed: false
		});
	});

	it('requires at least a 3 second hysteresis window before shedding', () => {
		const decision = performanceGovernorStep({
			emaMs: 35,
			currentTier: 'none',
			msSinceLastChange: 2999,
			pressureIterations: 20,
			substeps: 4,
			floors,
			thresholds
		});

		expect(decision.changed).toBe(false);
	});

	it('sheds pressure iterations before substeps', () => {
		const decision = performanceGovernorStep({
			emaMs: 35,
			currentTier: 'none',
			msSinceLastChange: 3000,
			pressureIterations: 20,
			substeps: 4,
			floors,
			thresholds
		});

		expect(decision.action).toBe('shed-pressure');
		expect(decision.tier).toBe('pressure');
		expect(decision.pressureIterations).toBe(16);
		expect(decision.substeps).toBe(4);
	});

	it('respects the pressure floor', () => {
		const decision = performanceGovernorStep({
			emaMs: 35,
			currentTier: 'pressure',
			msSinceLastChange: 3000,
			pressureIterations: 10,
			substeps: 4,
			floors,
			thresholds
		});

		expect(decision.action).toBe('shed-pressure');
		expect(decision.pressureIterations).toBe(8);
	});

	it('sheds substeps only after pressure reaches its floor', () => {
		const decision = performanceGovernorStep({
			emaMs: 35,
			currentTier: 'pressure',
			msSinceLastChange: 3000,
			pressureIterations: 8,
			substeps: 4,
			floors,
			thresholds
		});

		expect(decision.action).toBe('shed-substeps');
		expect(decision.tier).toBe('substeps');
		expect(decision.pressureIterations).toBe(8);
		expect(decision.substeps).toBe(3);
	});

	it('respects the substep floor', () => {
		const decision = performanceGovernorStep({
			emaMs: 35,
			currentTier: 'substeps',
			msSinceLastChange: 3000,
			pressureIterations: 8,
			substeps: 1,
			floors,
			thresholds
		});

		expect(decision.changed).toBe(false);
		expect(decision.action).toBe('none');
		expect(decision.substeps).toBe(1);
	});

	it('is monotonic under sustained overload', () => {
		let pressureIterations = 20;
		let substeps = 3;
		const actions: string[] = [];

		for (let i = 0; i < 6; i++) {
			const decision = performanceGovernorStep({
				emaMs: 35,
				currentTier: actions.includes('shed-substeps') ? 'substeps' : actions.length > 0 ? 'pressure' : 'none',
				msSinceLastChange: 3000,
				pressureIterations,
				substeps,
				floors,
				thresholds
			});
			if (decision.changed) {
				actions.push(decision.action);
				pressureIterations = decision.pressureIterations;
				substeps = decision.substeps;
			}
		}

		expect(actions).toEqual([
			'shed-pressure',
			'shed-pressure',
			'shed-pressure',
			'shed-substeps',
			'shed-substeps'
		]);
		expect(pressureIterations).toBe(8);
		expect(substeps).toBe(1);
	});

	it('never restores quality automatically on fast frames', () => {
		const decision = performanceGovernorStep({
			emaMs: 8,
			currentTier: 'substeps',
			msSinceLastChange: 10_000,
			pressureIterations: 8,
			substeps: 1,
			floors,
			thresholds
		});

		expect(decision).toEqual({
			action: 'none',
			tier: 'substeps',
			pressureIterations: 8,
			substeps: 1,
			changed: false
		});
	});

	it('smooths frame time with an EMA', () => {
		const first = nextFrameTimeEmaMs(0, 40, 0.25);
		const second = nextFrameTimeEmaMs(first, 20, 0.25);
		expect(first).toBe(40);
		expect(second).toBe(35);
	});
});

describe('FluidEngine governor integration guards', () => {
	it('keeps deterministic advance() off the frame-time governor path', () => {
		const body = methodBody(engineSrc, 'advance(steps: number, dt: number)');
		expect(body).toContain('this.step(dt)');
		expect(body).not.toContain('recordPerformanceFrameTime');
		expect(body).not.toContain('performanceGovernorStep');
	});

	it('hard-guards the sampler in deterministic mode', () => {
		const body = methodBody(engineSrc, 'recordPerformanceFrameTime(frameMs: number)');
		expect(body).toContain('!this.config.AUTO_PERFORMANCE || this.deterministicMode || this.config.PAUSED');
	});
});
