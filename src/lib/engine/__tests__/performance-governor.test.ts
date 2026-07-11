import { describe, expect, it } from 'vitest';
import {
	DEFAULT_PERFORMANCE_GOVERNOR_THRESHOLDS,
	nextContinuousOverloadMs,
	nextFrameTimeEmaMs,
	performanceGovernorStep,
	sanitizePerformanceFrameSampleMs
} from '../performance-governor.js';
import type { PerformanceGovernorFloors, PerformanceGovernorThresholds } from '../performance-governor.js';
import { clampSimulationDeltaSeconds } from '../FluidEngine.js';
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
	targetFrameMs: 20,
	hysteresisMs: 3000,
	pressureStep: 4
};

type SyntheticGovernorState = {
	emaMs: number;
	continuousOverloadMs: number;
	msSinceLastChange: number;
	pressureIterations: number;
	substeps: number;
	tier: 'none' | 'pressure' | 'substeps';
};

function initialSyntheticState(): SyntheticGovernorState {
	return {
		emaMs: 0,
		continuousOverloadMs: 0,
		msSinceLastChange: 0,
		pressureIterations: 20,
		substeps: 4,
		tier: 'none'
	};
}

function sampleSyntheticFrame(
	state: SyntheticGovernorState,
	frameMs: number,
	activeThresholds: PerformanceGovernorThresholds = thresholds
) {
	const sampleMs = sanitizePerformanceFrameSampleMs(frameMs);
	state.emaMs = nextFrameTimeEmaMs(state.emaMs, sampleMs, 1);
	state.continuousOverloadMs = nextContinuousOverloadMs(
		state.continuousOverloadMs,
		state.emaMs,
		sampleMs,
		activeThresholds
	);
	state.msSinceLastChange += sampleMs;
	const decision = performanceGovernorStep({
		emaMs: state.emaMs,
		currentTier: state.tier,
		msSinceLastChange: state.msSinceLastChange,
		continuousOverloadMs: state.continuousOverloadMs,
		pressureIterations: state.pressureIterations,
		substeps: state.substeps,
		floors,
		thresholds: activeThresholds
	});
	if (decision.changed) {
		state.msSinceLastChange = 0;
		state.continuousOverloadMs = 0;
		state.pressureIterations = decision.pressureIterations;
		state.substeps = decision.substeps;
		state.tier = decision.tier;
	}
	return decision;
}

describe('performance governor pure decision function', () => {
	it('keeps quality unchanged below the overload threshold', () => {
		const decision = performanceGovernorStep({
			emaMs: 12,
			currentTier: 'none',
			msSinceLastChange: 10_000,
			continuousOverloadMs: 0,
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
			continuousOverloadMs: 2999,
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
			continuousOverloadMs: 3000,
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
			continuousOverloadMs: 3000,
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
			continuousOverloadMs: 3000,
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
			continuousOverloadMs: 3000,
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
				continuousOverloadMs: 3000,
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
			continuousOverloadMs: 0,
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

	it.each([30, 60, 120])('classifies synthetic %s Hz sequences against the selected budget', (hz) => {
		const targetFrameMs = 1000 / hz;
		const activeThresholds = { ...thresholds, targetFrameMs };
		const atBudget = initialSyntheticState();
		const atBudgetFrames = Math.ceil(4000 / targetFrameMs);

		for (let i = 0; i < atBudgetFrames; i++) {
			expect(sampleSyntheticFrame(atBudget, targetFrameMs, activeThresholds).changed).toBe(false);
		}
		expect(atBudget.continuousOverloadMs).toBe(0);

		const overloaded = initialSyntheticState();
		const slowFrameMs = targetFrameMs * 1.25;
		let action = 'none';
		let elapsedMs = 0;
		while (action === 'none' && elapsedMs < 4000) {
			action = sampleSyntheticFrame(overloaded, slowFrameMs, activeThresholds).action;
			elapsedMs += slowFrameMs;
		}

		expect(action).toBe('shed-pressure');
		expect(elapsedMs).toBeGreaterThanOrEqual(3000);
	});

	it('preserves the legacy accepted delta independently of effective quality shedding', () => {
		const accepted = clampSimulationDeltaSeconds(0.04, 1 / 60, 2);
		expect(accepted).toBeCloseTo(1 / 30);
		expect(clampSimulationDeltaSeconds(0.01, 1 / 60, 2)).toBe(0.01);
	});

	it('does not accumulate intermittent spikes into a shed', () => {
		const state = initialSyntheticState();

		for (let i = 0; i < 200; i++) {
			const spike = sampleSyntheticFrame(state, 40);
			expect(spike.changed).toBe(false);
			expect(state.continuousOverloadMs).toBe(40);

			const recovery = sampleSyntheticFrame(state, 16);
			expect(recovery.changed).toBe(false);
			expect(state.continuousOverloadMs).toBe(0);
		}

		expect(state.msSinceLastChange).toBeGreaterThan(3000);
		expect(state.pressureIterations).toBe(20);
		expect(state.substeps).toBe(4);
	});

	it('waits the full continuous-overload interval before shedding', () => {
		const state = initialSyntheticState();

		for (let i = 0; i < 74; i++) {
			expect(sampleSyntheticFrame(state, 40).changed).toBe(false);
		}

		expect(state.continuousOverloadMs).toBe(2960);
		const decision = sampleSyntheticFrame(state, 40);

		expect(decision.action).toBe('shed-pressure');
		expect(decision.pressureIterations).toBe(16);
	});

	it('requires a fresh overload interval after recovery', () => {
		const state = initialSyntheticState();

		for (let i = 0; i < 74; i++) {
			expect(sampleSyntheticFrame(state, 40).changed).toBe(false);
		}
		expect(sampleSyntheticFrame(state, 16).changed).toBe(false);
		expect(state.continuousOverloadMs).toBe(0);

		for (let i = 0; i < 74; i++) {
			expect(sampleSyntheticFrame(state, 40).changed).toBe(false);
		}

		const decision = sampleSyntheticFrame(state, 40);
		expect(decision.action).toBe('shed-pressure');
		expect(decision.pressureIterations).toBe(16);
	});

	it('does not shed again before the post-action interval elapses', () => {
		const decision = performanceGovernorStep({
			emaMs: 35,
			currentTier: 'pressure',
			msSinceLastChange: 100,
			continuousOverloadMs: 6000,
			pressureIterations: 16,
			substeps: 4,
			floors,
			thresholds
		});

		expect(decision.changed).toBe(false);
		expect(decision.pressureIterations).toBe(16);
	});

	it('does not let one suspension-sized frame impersonate sustained overload', () => {
		const state = initialSyntheticState();
		const decision = sampleSyntheticFrame(state, 3000);

		expect(decision.changed).toBe(false);
		expect(state.continuousOverloadMs).toBe(250);
		expect(state.msSinceLastChange).toBe(250);
	});

	it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -10])(
		'ignores invalid frame sample %s without poisoning state',
		(frameMs) => {
			const state = initialSyntheticState();
			sampleSyntheticFrame(state, frameMs);

			expect(state.emaMs).toBe(0);
			expect(state.continuousOverloadMs).toBe(0);
			expect(state.msSinceLastChange).toBe(0);
		}
	);
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

	it('keeps lastAction stable between governor actions', () => {
		const body = methodBody(engineSrc, 'recordPerformanceFrameTime(frameMs: number)');
		expect(body).not.toContain("this.performanceLastAction = 'none';");
		expect(body).toContain('this.performanceLastAction = decision.action');
	});

	it('keeps requested configuration separate from effective governor quality', () => {
		const sampler = methodBody(engineSrc, 'recordPerformanceFrameTime(frameMs: number)');
		const delta = methodBody(engineSrc, 'calcDeltaTime(): number');
		const projection = methodBody(engineSrc, 'projectVelocity(): void');

		expect(sampler).not.toContain('this.config.PRESSURE_ITERATIONS =');
		expect(sampler).not.toContain('this.config.SUBSTEPS =');
		expect(sampler).toContain('this.performanceSubsteps = decision.substeps');
		expect(delta).toContain('this.config.SUBSTEPS');
		expect(projection).toContain('this.performancePressureIterations');
	});

	it('breaks an overload streak across imperative pause', () => {
		const body = methodBody(engineSrc, 'pause(): void');
		expect(body).toContain('this.resetPerformanceGovernor()');
	});
});
