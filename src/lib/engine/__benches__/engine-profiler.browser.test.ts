import { describe, expect, it } from 'vitest';
import { FluidEngine } from '../FluidEngine.js';

type UpdateHarness = { rafRunning: boolean; update(): void };

function renderOne(engine: FluidEngine): void {
	const harness = engine as unknown as UpdateHarness;
	harness.rafRunning = true;
	harness.update();
	engine.pause();
}

describe('whole-frame engine profiler', () => {
	it('is absent when disabled and complete in CPU fallback mode', () => {
		const plainCanvas = document.createElement('canvas');
		plainCanvas.width = 96;
		plainCanvas.height = 64;
		const plain = new FluidEngine({ canvas: plainCanvas, autoStart: false });
		try {
			plain.advance(1, 1 / 120);
			expect(plain.getBenchProfile()).toBeNull();
		} finally {
			plain.dispose();
		}

		const canvas = document.createElement('canvas');
		canvas.width = 96;
		canvas.height = 64;
		const engine = new FluidEngine({
			canvas,
			autoStart: false,
			instrument: 'cpu',
			config: { pointerInput: false, initialSplatCount: 0, bloom: false, sunrays: false, glass: false }
		});
		try {
			engine.splat(0.5, 0.5, 250, 0, { r: 1, g: 0.2, b: 0.1 });
			engine.advance(1, 1 / 120);
			const snapshot = engine.getBenchProfile();
			expect(snapshot?.valid).toBe(true);
			expect(snapshot?.timingSource).toBe('cpu');
			expect(snapshot?.environment).toMatchObject({
				webglVersion: expect.stringMatching(/^WebGL[12]$/),
				drawingBufferWidth: 96,
				drawingBufferHeight: 64,
				timerQuery: 'cpu',
				contextLost: false
			});
			expect(snapshot?.environment.renderer.length).toBeGreaterThan(0);
			expect(snapshot?.environment.vendor.length).toBeGreaterThan(0);
			expect(snapshot?.resources.estimatedTextureBytes).toBeGreaterThan(0);
			expect(snapshot?.frames.at(-1)?.groups.solver.draws).toBeGreaterThan(0);
			expect(snapshot?.lifecycle.contextCreate).toHaveLength(1);
			expect(snapshot?.lifecycle.shaderCompile).toHaveLength(1);
			expect(snapshot?.lifecycle.programLink).toHaveLength(1);
			expect(snapshot?.lifecycle.initialAllocation).toHaveLength(1);
		} finally {
			engine.dispose();
		}
	});

	it('attributes post-process and presentation work only to enabled groups', () => {
		const canvas = document.createElement('canvas');
		canvas.width = 128;
		canvas.height = 96;
		const engine = new FluidEngine({
			canvas,
			autoStart: false,
			instrument: 'cpu',
			config: {
				pointerInput: false,
				initialSplatCount: 0,
				bloom: true,
				sunrays: true,
				glass: false
			}
		});
		try {
			engine.splat(0.5, 0.5, 300, 0, { r: 1, g: 0.5, b: 0.1 });
			renderOne(engine);
			const frame = engine.getBenchProfile()?.frames.at(-1);
			expect(frame?.groups.solver.draws).toBeGreaterThan(0);
			expect(frame?.groups.bloom.draws).toBeGreaterThan(0);
			expect(frame?.groups.sunrays.draws).toBeGreaterThan(0);
			expect(frame?.groups.display.draws).toBeGreaterThan(0);
			expect(frame?.groups.glass.draws).toBe(0);

			engine.setConfig({ bloom: false, sunrays: false });
			renderOne(engine);
			const toggled = engine.getBenchProfile()?.frames.at(-1);
			expect(toggled?.groups.bloom.draws).toBe(0);
			expect(toggled?.groups.sunrays.draws).toBe(0);
			expect(toggled?.groups.display.draws).toBeGreaterThan(0);
		} finally {
			engine.dispose();
		}
	});
});
