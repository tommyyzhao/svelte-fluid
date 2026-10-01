import { afterEach, describe, expect, it, vi } from 'vitest';
import { FluidEngine } from '../FluidEngine.js';
import { activeFrameSubscribers } from '../frame-scheduler.js';

const nativeRaf = window.requestAnimationFrame.bind(window);

function countedEngine() {
	const canvas = document.createElement('canvas');
	canvas.width = 64;
	canvas.height = 64;
	const gl = canvas.getContext('webgl2');
	if (!gl) throw new Error('WebGL2 is required for shared-scheduler tests');
	const drawElements = gl.drawElements.bind(gl);
	const state = { draws: 0, fail: false };
	Object.defineProperty(gl, 'drawElements', {
		configurable: true,
		value: (...args: Parameters<WebGL2RenderingContext['drawElements']>) => {
			if (state.fail) throw new Error('injected frame failure');
			state.draws++;
			drawElements(...args);
		}
	});
	const engine = new FluidEngine({
		canvas,
		config: {
			pointerInput: false,
			initialSplatCount: 1,
			simResolution: 32,
			dyeResolution: 32,
			shading: false,
			bloom: false,
			sunrays: false
		}
	});
	return { engine, state };
}

/** Waits on the unpatched RAF so the test's own frames are not counted. */
function frames(count: number): Promise<void> {
	return new Promise((resolve) => {
		const next = () => (count-- <= 0 ? resolve() : nativeRaf(next));
		next();
	});
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('shared frame scheduler', () => {
	it('drives several engines from one RAF and evicts only a throwing engine', async () => {
		const raf = vi.spyOn(window, 'requestAnimationFrame');
		const a = countedEngine();
		const b = countedEngine();
		try {
			expect(activeFrameSubscribers()).toBe(2);
			await frames(6);
			raf.mockClear();
			a.state.draws = 0;
			b.state.draws = 0;
			await frames(10);
			// One engine RAF per browser frame regardless of instance count.
			// Allow ±1 for the frame in flight at either measurement edge.
			expect(raf.mock.calls.length).toBeGreaterThanOrEqual(9);
			expect(raf.mock.calls.length).toBeLessThanOrEqual(11);
			expect(a.state.draws).toBeGreaterThan(0);
			expect(b.state.draws).toBeGreaterThan(0);

			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			a.state.fail = true;
			await frames(3);
			expect(error).toHaveBeenCalledWith('svelte-fluid: frame callback failed', expect.any(Error));
			expect(a.engine.isPaused).toBe(true);
			expect(activeFrameSubscribers()).toBe(1);

			const errorsAfterEviction = error.mock.calls.length;
			b.state.draws = 0;
			await frames(5);
			expect(b.state.draws).toBeGreaterThan(0);
			expect(error.mock.calls.length).toBe(errorsAfterEviction);

			// An evicted engine can be resumed once its fault clears.
			a.state.fail = false;
			a.state.draws = 0;
			a.engine.resume();
			await frames(3);
			expect(a.state.draws).toBeGreaterThan(0);
			expect(activeFrameSubscribers()).toBe(2);

			a.engine.pause();
			expect(activeFrameSubscribers()).toBe(1);
			b.state.draws = 0;
			await frames(3);
			expect(b.state.draws).toBeGreaterThan(0);
		} finally {
			a.engine.dispose();
			b.engine.dispose();
		}
		expect(activeFrameSubscribers()).toBe(0);
		raf.mockClear();
		await frames(3);
		expect(raf).not.toHaveBeenCalled();
	});
});
