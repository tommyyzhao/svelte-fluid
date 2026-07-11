import type { PerformanceAction, PerformanceState, PerformanceTier } from './types.js';

export interface PerformanceGovernorThresholds {
	shedAboveMs: number;
	hysteresisMs: number;
	pressureStep: number;
	emaAlpha: number;
}

export interface PerformanceGovernorFloors {
	pressureIterations: number;
	substeps: number;
}

export interface PerformanceGovernorInput {
	emaMs: number;
	currentTier: PerformanceTier;
	msSinceLastChange: number;
	continuousOverloadMs: number;
	pressureIterations: number;
	substeps: number;
	floors: PerformanceGovernorFloors;
	thresholds?: Partial<PerformanceGovernorThresholds>;
}

export interface PerformanceGovernorDecision {
	action: PerformanceAction;
	tier: PerformanceTier;
	pressureIterations: number;
	substeps: number;
	changed: boolean;
}

export const DEFAULT_PERFORMANCE_GOVERNOR_THRESHOLDS: PerformanceGovernorThresholds = {
	shedAboveMs: 22,
	hysteresisMs: 3000,
	pressureStep: 4,
	emaAlpha: 0.12
};

// A tab suspension or debugger pause is not evidence of sustained device load.
// Capping one contribution also prevents a single GC stall from satisfying the
// entire hysteresis window by itself.
export const MAX_PERFORMANCE_FRAME_SAMPLE_MS = 250;

export const DISABLED_PERFORMANCE_STATE: PerformanceState = Object.freeze({
	enabled: false,
	tier: 'none',
	emaMs: 0,
	msSinceLastChange: 0,
	pressureIterations: 0,
	substeps: 0,
	minPressureIterations: 0,
	minSubsteps: 1,
	lastAction: 'none'
});

function sanitizeInteger(value: number, min: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.max(min, Math.floor(value));
}

function resolvedThresholds(
	thresholds: Partial<PerformanceGovernorThresholds> | undefined
): PerformanceGovernorThresholds {
	return {
		...DEFAULT_PERFORMANCE_GOVERNOR_THRESHOLDS,
		...thresholds
	};
}

export function nextFrameTimeEmaMs(previousEmaMs: number, sampleMs: number, alpha = DEFAULT_PERFORMANCE_GOVERNOR_THRESHOLDS.emaAlpha): number {
	if (!Number.isFinite(sampleMs) || sampleMs <= 0) return previousEmaMs;
	if (!Number.isFinite(previousEmaMs) || previousEmaMs <= 0) return sampleMs;
	const a = Math.max(0, Math.min(1, alpha));
	return previousEmaMs + (sampleMs - previousEmaMs) * a;
}

export function sanitizePerformanceFrameSampleMs(sampleMs: number): number {
	if (!Number.isFinite(sampleMs) || sampleMs <= 0) return 0;
	return Math.min(sampleMs, MAX_PERFORMANCE_FRAME_SAMPLE_MS);
}

export function nextContinuousOverloadMs(
	previousOverloadMs: number,
	emaMs: number,
	sampleMs: number,
	thresholds?: Partial<PerformanceGovernorThresholds>
): number {
	const resolved = resolvedThresholds(thresholds);
	if (!Number.isFinite(emaMs) || emaMs <= resolved.shedAboveMs) return 0;
	const previous = Number.isFinite(previousOverloadMs) && previousOverloadMs > 0 ? previousOverloadMs : 0;
	const sample = sanitizePerformanceFrameSampleMs(sampleMs);
	return previous + sample;
}

export function performanceGovernorStep(input: PerformanceGovernorInput): PerformanceGovernorDecision {
	const thresholds = resolvedThresholds(input.thresholds);
	const pressureIterations = sanitizeInteger(input.pressureIterations, 0);
	const substeps = sanitizeInteger(input.substeps, 1);
	const pressureFloor = sanitizeInteger(input.floors.pressureIterations, 0);
	const substepsFloor = sanitizeInteger(input.floors.substeps, 1);
	const requiredOverloadMs = Math.max(3000, thresholds.hysteresisMs);
	const noChange = (tier = input.currentTier): PerformanceGovernorDecision => ({
		action: 'none',
		tier,
		pressureIterations,
		substeps,
		changed: false
	});

	if (!Number.isFinite(input.emaMs) || input.emaMs <= thresholds.shedAboveMs) {
		return noChange();
	}

	if (input.continuousOverloadMs < requiredOverloadMs || input.msSinceLastChange < requiredOverloadMs) {
		return noChange();
	}

	if (pressureIterations > pressureFloor) {
		return {
			action: 'shed-pressure',
			tier: 'pressure',
			pressureIterations: Math.max(pressureFloor, pressureIterations - sanitizeInteger(thresholds.pressureStep, 1)),
			substeps,
			changed: true
		};
	}

	if (substeps > substepsFloor) {
		return {
			action: 'shed-substeps',
			tier: 'substeps',
			pressureIterations,
			substeps: Math.max(substepsFloor, substeps - 1),
			changed: true
		};
	}

	return noChange(input.currentTier);
}
