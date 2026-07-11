import { describe, expect, it } from 'vitest';
import { FluidEngine } from '../FluidEngine.js';
import type { FBO, FluidConfig } from '../types.js';
import { fieldEnergy, hasNonFinite } from './reducers.js';

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
	alpha: true,
	depth: false,
	stencil: false,
	antialias: false,
	preserveDrawingBuffer: false,
	failIfMajorPerformanceCaveat: false
};

const SMALL_CONFIG = {
	pointerInput: false,
	initialSplatCount: 0,
	simResolution: 32,
	dyeResolution: 32,
	pressureIterations: 2,
	curl: 0,
	shading: false,
	bloom: false,
	bloomResolution: 32,
	bloomIterations: 1,
	sunrays: false,
	sunraysResolution: 32
} satisfies FluidConfig;

interface FramebufferCounter {
	readonly gl: WebGL2RenderingContext;
	creates: number;
	deletes: number;
	readonly deleted: Set<WebGLFramebuffer>;
	reset(): void;
}

interface GlassHarness {
	sceneFBO: FBO | null;
}

function createCountedCanvas(): {
	canvas: HTMLCanvasElement;
	counter: FramebufferCounter;
} {
	const canvas = document.createElement('canvas');
	canvas.width = 64;
	canvas.height = 64;
	const gl = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES);
	if (!gl) throw new Error('WebGL2 is required for the context-restore browser contract');

	const originalCreate = gl.createFramebuffer.bind(gl);
	const originalDelete = gl.deleteFramebuffer.bind(gl);
	const counter: FramebufferCounter = {
		gl,
		creates: 0,
		deletes: 0,
		deleted: new Set<WebGLFramebuffer>(),
		reset() {
			this.creates = 0;
			this.deletes = 0;
			this.deleted.clear();
		}
	};

	Object.defineProperty(gl, 'createFramebuffer', {
		configurable: true,
		value: () => {
			counter.creates++;
			return originalCreate();
		}
	});
	Object.defineProperty(gl, 'deleteFramebuffer', {
		configurable: true,
		value: (framebuffer: WebGLFramebuffer | null) => {
			counter.deletes++;
			if (framebuffer) counter.deleted.add(framebuffer);
			originalDelete(framebuffer);
		}
	});

	return { canvas, counter };
}

function once(target: EventTarget, type: string, timeoutMs = 10_000): Promise<Event> {
	return new Promise((resolve, reject) => {
		const timeout = window.setTimeout(() => {
			target.removeEventListener(type, onEvent);
			reject(new Error(`Timed out waiting for ${type}`));
		}, timeoutMs);
		const onEvent = (event: Event) => {
			window.clearTimeout(timeout);
			resolve(event);
		};
		target.addEventListener(type, onEvent, { once: true });
	});
}

function maxAbsDifference(a: ArrayLike<number>, b: ArrayLike<number>): number {
	if (a.length !== b.length) return Number.POSITIVE_INFINITY;
	let max = 0;
	for (let i = 0; i < a.length; i++) {
		max = Math.max(max, Math.abs(a[i] - b[i]));
	}
	return max;
}

describe('FluidEngine context restoration', () => {
	it('recreates live fields and replays random plus configured opening splats exactly once', async () => {
		const { canvas, counter } = createCountedCanvas();
		const extension = counter.gl.getExtension('WEBGL_lose_context');
		expect(extension).toBeTruthy();
		const presetSplats = [{ x: 0.3, y: 0.65, dx: 180, dy: -90, color: { r: 0.8, g: 0.2, b: 1.1 } }];

		const engine = new FluidEngine({
			canvas,
			autoStart: false,
			config: {
				...SMALL_CONFIG,
				seed: 0x51a7,
				initialSplatCount: 2,
				presetSplats
			}
		});

		let disposed = false;
		try {
			const initialDye = engine.readField('dye').data;
			const initialVelocity = engine.readField('velocity').data;
			expect(fieldEnergy(initialDye)).toBeGreaterThan(0.001);
			expect(fieldEnergy(initialVelocity)).toBeGreaterThan(0.001);
			// Move the live RNG forward and mutate the caller-owned nested color.
			// Restore must still honor the original construct-only value snapshot.
			engine.randomSplats(3);
			engine.advance(1, 1 / 120);
			presetSplats[0].color.r = 9;

			const lost = once(canvas, 'webglcontextlost');
			extension!.loseContext();
			await lost;
			// Chromium ignores restoreContext() while the loss event's dispatch task
			// is still unwinding. Cross a macrotask boundary before requesting it.
			await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

			// Count only resources born into the restored context. Every one must
			// have a matching explicit delete when that live engine is disposed.
			counter.reset();
			const restored = once(canvas, 'webglcontextrestored');
			extension!.restoreContext();
			await restored;

			const restoredDye = engine.readField('dye').data;
			const restoredVelocity = engine.readField('velocity').data;
			expect(maxAbsDifference(restoredDye, initialDye)).toBeLessThan(1e-6);
			expect(maxAbsDifference(restoredVelocity, initialVelocity)).toBeLessThan(1e-6);

			engine.advance(2, 1 / 120);
			const advanced = engine.readField('velocity').data;
			expect(hasNonFinite(advanced)).toBe(false);
			expect(fieldEnergy(advanced)).toBeGreaterThan(0.001);

			engine.dispose();
			disposed = true;
			expect(counter.deletes).toBe(counter.creates);
		} finally {
			if (!disposed) engine.dispose();
		}
	}, 60_000);

	it('allocates one scene framebuffer per required glass transition', () => {
		function constructionFramebufferCount(glass: boolean): number {
			const { canvas, counter } = createCountedCanvas();
			const engine = new FluidEngine({
				canvas,
				autoStart: false,
				config: {
					...SMALL_CONFIG,
					containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 },
					glass
				}
			});
			const count = counter.creates;
			engine.dispose();
			return count;
		}

		const withoutGlass = constructionFramebufferCount(false);
		const withGlass = constructionFramebufferCount(true);
		expect(withGlass - withoutGlass).toBe(1);

		const { canvas, counter } = createCountedCanvas();
		const engine = new FluidEngine({
			canvas,
			autoStart: false,
			config: {
				...SMALL_CONFIG,
				containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 },
				glass: true
			}
		});

		const harness = engine as unknown as GlassHarness;
		const firstScene = harness.sceneFBO?.fbo;
		expect(firstScene).toBeTruthy();

		counter.reset();
		engine.setConfig({ glass: false });
		expect(counter.creates).toBe(0);
		expect(counter.deletes).toBe(1);
		expect(counter.deleted.has(firstScene!)).toBe(true);

		counter.reset();
		engine.setConfig({ glass: true });
		const secondScene = harness.sceneFBO?.fbo;
		expect(secondScene).toBeTruthy();
		expect(secondScene).not.toBe(firstScene);
		expect(counter.creates).toBe(1);
		expect(counter.deletes).toBe(0);

		counter.reset();
		engine.dispose();
		expect(counter.deleted.has(secondScene!)).toBe(true);
	});
});
