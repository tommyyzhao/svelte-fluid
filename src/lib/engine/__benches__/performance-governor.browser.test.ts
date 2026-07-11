import { describe, expect, it } from 'vitest';
import { FluidEngine } from '../FluidEngine.js';
import { fieldEnergy, hasNonFinite } from './reducers.js';

type GovernorHarness = {
	recordPerformanceFrameTime(frameMs: number): string;
};

function injectFrameMs(engine: FluidEngine, frameMs: number): string {
	return (engine as unknown as GovernorHarness).recordPerformanceFrameTime(frameMs);
}

function runDeterministicAdvance(autoPerformance: boolean): Float32Array {
	const canvas = document.createElement('canvas');
	canvas.width = 96;
	canvas.height = 96;

	const engine = new FluidEngine({
		canvas,
		autoStart: false,
		config: {
			seed: 0xdecaf,
			pointerInput: false,
			initialSplatCount: 0,
			autoPerformance,
			pressureIterations: 16,
			substeps: 2
		}
	});

	try {
		engine.splat(0.35, 0.5, 420, 20, { r: 1.2, g: 0.3, b: 0.1 });
		engine.splat(0.65, 0.5, -420, -20, { r: 0.1, g: 0.3, b: 1.2 });
		for (let i = 0; i < 90; i++) {
			engine.advance(1, 1 / 120);
		}
		return engine.readField('velocity').data;
	} finally {
		engine.dispose();
	}
}

describe('frame-time governor browser smoke', () => {
	it('does not change deterministic advance output', () => {
		const off = runDeterministicAdvance(false);
		const on = runDeterministicAdvance(true);
		expect(on.length).toBe(off.length);
		for (let i = 0; i < on.length; i++) {
			expect(on[i]).toBe(off[i]);
		}
	});

	it('sheds Bucket-A quality under synthetic frame load while the field stays live', () => {
		const canvas = document.createElement('canvas');
		canvas.width = 96;
		canvas.height = 96;

		const engine = new FluidEngine({
			canvas,
			config: {
				pointerInput: false,
				initialSplatCount: 0,
				autoPerformance: true,
				pressureIterations: 12,
				autoPerformanceMinPressureIterations: 8,
				substeps: 2,
				autoPerformanceMinSubsteps: 1
			}
		});
		engine.pause();

		try {
			engine.splat(0.5, 0.5, 500, 0, { r: 1, g: 0.2, b: 0.1 });
			let sawPressureShed = false;
			let sawSubstepShed = false;

			for (let i = 0; i < 240; i++) {
				const before = engine.getPerformanceState();
				const action = injectFrameMs(engine, 40);
				const after = engine.getPerformanceState();
				if (action !== 'none') {
					sawPressureShed ||= after.pressureIterations < before.pressureIterations;
					sawSubstepShed ||= after.substeps < before.substeps;
					engine.advance(8, 1 / 120);
					const velocity = engine.readField('velocity');
					expect(hasNonFinite(velocity.data)).toBe(false);
					expect(fieldEnergy(velocity.data)).toBeGreaterThan(0.001);
				}
			}

			const state = engine.getPerformanceState();
			expect(sawPressureShed).toBe(true);
			expect(sawSubstepShed).toBe(true);
			expect(state.pressureIterations).toBe(8);
			expect(state.substeps).toBe(1);
		} finally {
			engine.dispose();
		}
	});

	it('keeps the last observed governor action stable across no-op frames', () => {
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;

		const engine = new FluidEngine({
			canvas,
			config: {
				pointerInput: false,
				initialSplatCount: 0,
				autoPerformance: true,
				pressureIterations: 12,
				autoPerformanceMinPressureIterations: 8,
				substeps: 2,
				autoPerformanceMinSubsteps: 1
			}
		});
		engine.pause();

		try {
			let action = 'none';
			for (let i = 0; i < 75; i++) {
				action = injectFrameMs(engine, 40);
			}

			expect(action).toBe('shed-pressure');
			expect(engine.getPerformanceState().lastAction).toBe('shed-pressure');

			expect(injectFrameMs(engine, 40)).toBe('none');
			expect(engine.getPerformanceState().lastAction).toBe('shed-pressure');
		} finally {
			engine.dispose();
		}
	});
});
