import { describe, expect, it } from 'vitest';
import { FluidEngine } from '../FluidEngine.js';

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
	alpha: true,
	depth: false,
	stencil: false,
	antialias: false,
	preserveDrawingBuffer: false,
	failIfMajorPerformanceCaveat: false
};

interface DrawCounter {
	draws: number;
	reset(): void;
}

interface UpdateHarness {
	rafRunning: boolean;
	update(): void;
}

function createCountedCanvas(): { canvas: HTMLCanvasElement; counter: DrawCounter } {
	const canvas = document.createElement('canvas');
	canvas.width = 96;
	canvas.height = 64;
	const gl = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES);
	if (!gl) throw new Error('WebGL2 is required for paused dirty-render tests');

	const drawElements = gl.drawElements.bind(gl);
	const counter: DrawCounter = {
		draws: 0,
		reset() {
			this.draws = 0;
		}
	};
	Object.defineProperty(gl, 'drawElements', {
		configurable: true,
		value: (...args: Parameters<WebGL2RenderingContext['drawElements']>) => {
			counter.draws++;
			drawElements(...args);
		}
	});
	return { canvas, counter };
}

function updateOnce(engine: FluidEngine): void {
	const harness = engine as unknown as UpdateHarness;
	harness.rafRunning = true;
	harness.update();
	engine.pause();
}

function waitForAnimationFrames(count: number): Promise<void> {
	return new Promise((resolve) => {
		const next = () => {
			if (count-- <= 0) resolve();
			else requestAnimationFrame(next);
		};
		next();
	});
}

describe('paused dirty presentation', () => {
	it('submits one presentation after invalidation and none while stable', async () => {
		const { canvas, counter } = createCountedCanvas();
		const engine = new FluidEngine({
			canvas,
			autoStart: false,
			instrument: 'cpu',
			config: {
				paused: true,
				pointerInput: false,
				initialSplatCount: 0,
				simResolution: 32,
				dyeResolution: 32,
				shading: false,
				bloom: false,
				sunrays: false,
				glass: false
			}
		});

		try {
			// Construction starts dirty, so the first manual tick presents once.
			counter.reset();
			updateOnce(engine);
			expect(counter.draws).toBe(1);
			const initialFrames = engine.getBenchProfile()?.frames.length ?? 0;

			counter.reset();
			updateOnce(engine);
			updateOnce(engine);
			updateOnce(engine);
			expect(counter.draws).toBe(0);
			expect(engine.getBenchProfile()?.frames).toHaveLength(initialFrames);

			// A direct splat writes its fields immediately. Count only the following
			// presentation tick, which must render once and settle again.
			engine.splat(0.5, 0.5, 200, 0, { r: 1, g: 0.25, b: 0.1 });
			counter.reset();
			updateOnce(engine);
			expect(counter.draws).toBe(1);
			counter.reset();
			updateOnce(engine);
			expect(counter.draws).toBe(0);

			engine.setConfig({ backColor: { r: 4, g: 8, b: 16 } });
			counter.reset();
			updateOnce(engine);
			expect(counter.draws).toBe(1);
			counter.reset();
			updateOnce(engine);
			expect(counter.draws).toBe(0);

			expect(engine.resize(128, 64)).toBe(true);
			counter.reset();
			updateOnce(engine);
			expect(counter.draws).toBe(1);
			counter.reset();
			updateOnce(engine);
			expect(counter.draws).toBe(0);

			for (const patch of [
				{ reveal: true },
				{ distortion: true },
				{
					glass: true,
					containerShape: { type: 'circle' as const, cx: 0.5, cy: 0.5, radius: 0.42 }
				}
			]) {
				const before = engine.getBenchProfile()?.frames.length ?? 0;
				engine.setConfig(patch);
				updateOnce(engine);
				expect(engine.getBenchProfile()?.frames).toHaveLength(before + 1);
				updateOnce(engine);
				expect(engine.getBenchProfile()?.frames).toHaveLength(before + 1);
			}

			// Imperative pause owns RAF scheduling. Mutations may become dirty while
			// stopped, but no presentation occurs until resume restarts the loop.
			engine.setConfig({ backColor: { r: 12, g: 18, b: 24 } });
			counter.reset();
			await waitForAnimationFrames(2);
			expect(counter.draws).toBe(0);
			engine.resume();
			await waitForAnimationFrames(2);
			engine.pause();
			expect(counter.draws).toBe(1);
		} finally {
			engine.dispose();
		}
	});
});
