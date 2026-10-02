import { describe, expect, it } from 'vitest';
import { FluidEngine } from '../FluidEngine.js';
import type { FluidConfig } from '../types.js';
import type { DoubleFBO, FBO } from '../internal-types.js';
import { fieldEnergy, hasNonFinite } from './reducers.js';

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
	alpha: true,
	depth: false,
	stencil: false,
	antialias: false,
	preserveDrawingBuffer: false,
	failIfMajorPerformanceCaveat: false
};

const CONFIG = {
	pointerInput: false,
	initialSplatCount: 0,
	simResolution: 32,
	dyeResolution: 32,
	pressureIterations: 2,
	curl: 0,
	shading: false,
	bloom: true,
	bloomResolution: 32,
	bloomIterations: 1,
	sunrays: true,
	sunraysResolution: 32,
	glass: true,
	containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 }
} satisfies FluidConfig;

interface ResizeHarness {
	dye: DoubleFBO;
	velocity: DoubleFBO;
	bloom: FBO;
	sunrays: FBO;
	sceneFBO: FBO | null;
}

interface Counts {
	framebufferCreates: number;
	framebufferDeletes: number;
	programCreates: number;
	reset(): void;
}

function countedCanvas(width = 64, height = 64) {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const gl = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES);
	if (!gl) throw new Error('WebGL2 is required for resize tests');
	const createFramebuffer = gl.createFramebuffer.bind(gl);
	const deleteFramebuffer = gl.deleteFramebuffer.bind(gl);
	const createProgram = gl.createProgram.bind(gl);
	const counts: Counts = {
		framebufferCreates: 0,
		framebufferDeletes: 0,
		programCreates: 0,
		reset() {
			this.framebufferCreates = 0;
			this.framebufferDeletes = 0;
			this.programCreates = 0;
		}
	};
	Object.defineProperty(gl, 'createFramebuffer', {
		configurable: true,
		value: () => {
			counts.framebufferCreates++;
			return createFramebuffer();
		}
	});
	Object.defineProperty(gl, 'deleteFramebuffer', {
		configurable: true,
		value: (fbo: WebGLFramebuffer | null) => {
			counts.framebufferDeletes++;
			deleteFramebuffer(fbo);
		}
	});
	Object.defineProperty(gl, 'createProgram', {
		configurable: true,
		value: () => {
			counts.programCreates++;
			return createProgram();
		}
	});
	return { canvas, gl, counts };
}

function once(target: EventTarget, type: string, timeoutMs = 10_000): Promise<Event> {
	return new Promise((resolve, reject) => {
		const timeout = window.setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), timeoutMs);
		target.addEventListener(type, (event) => {
			window.clearTimeout(timeout);
			resolve(event);
		}, { once: true });
	});
}

describe('FluidEngine.resize', () => {
	it('preserves field liveness and programs across an aspect change', () => {
		const { canvas, counts } = countedCanvas();
		const engine = new FluidEngine({ canvas, autoStart: false, instrument: 'cpu', config: CONFIG });
		const harness = engine as unknown as ResizeHarness;
		try {
			engine.splat(0.5, 0.5, 300, 20, { r: 1, g: 0.3, b: 0.1 });
			engine.advance(2, 1 / 120);
			expect(fieldEnergy(engine.readField('velocity').data)).toBeGreaterThan(0.001);
			expect(fieldEnergy(engine.readField('dye').data)).toBeGreaterThan(0.001);
			counts.reset();

			expect(engine.resize(128, 64)).toBe(true);
			expect(canvas.width).toBe(128);
			expect(canvas.height).toBe(64);
			expect(harness.velocity.width).toBe(64);
			expect(harness.velocity.height).toBe(32);
			expect(harness.dye.width).toBe(64);
			expect(harness.dye.height).toBe(32);
			expect(harness.sceneFBO).toMatchObject({ width: 128, height: 64 });
			expect(counts.programCreates).toBe(0);
			const velocity = engine.readField('velocity').data;
			const dye = engine.readField('dye').data;
			expect(hasNonFinite(velocity)).toBe(false);
			expect(hasNonFinite(dye)).toBe(false);
			expect(fieldEnergy(velocity)).toBeGreaterThan(0.001);
			expect(fieldEnergy(dye)).toBeGreaterThan(0.001);
			expect(engine.getBenchProfile()?.lifecycle.resize).toHaveLength(1);
		} finally {
			engine.dispose();
		}
	});

	it('is a true no-op for identical size and only rebuilds glass for same-aspect scaling', () => {
		const { canvas, counts } = countedCanvas();
		const engine = new FluidEngine({ canvas, autoStart: false, config: CONFIG });
		const harness = engine as unknown as ResizeHarness;
		try {
			const dye = harness.dye.read.fbo;
			const velocity = harness.velocity.read.fbo;
			const bloom = harness.bloom.fbo;
			const sunrays = harness.sunrays.fbo;
			const scene = harness.sceneFBO?.fbo;
			counts.reset();
			expect(engine.resize(64, 64)).toBe(false);
			expect(counts.framebufferCreates).toBe(0);
			expect(counts.framebufferDeletes).toBe(0);

			expect(engine.resize(128, 128)).toBe(true);
			expect(harness.dye.read.fbo).toBe(dye);
			expect(harness.velocity.read.fbo).toBe(velocity);
			expect(harness.bloom.fbo).toBe(bloom);
			expect(harness.sunrays.fbo).toBe(sunrays);
			expect(harness.sceneFBO?.fbo).not.toBe(scene);
			expect(harness.sceneFBO).toMatchObject({ width: 128, height: 128 });
			expect(counts.framebufferCreates).toBe(1);
			expect(counts.framebufferDeletes).toBe(1);
			expect(counts.programCreates).toBe(0);
		} finally {
			engine.dispose();
		}
	});

	it('defers GL work safely while the context is lost', async () => {
		const { canvas, gl, counts } = countedCanvas();
		const extension = gl.getExtension('WEBGL_lose_context');
		expect(extension).toBeTruthy();
		// Seed 36 used to place no opening splat (10 rejection tries against the
		// circle at the restore-time 2:1 aspect); kept as a regression guard.
		const engine = new FluidEngine({
			canvas,
			autoStart: false,
			config: { ...CONFIG, initialSplatCount: 1, seed: 36 }
		});
		try {
			const lost = once(canvas, 'webglcontextlost');
			extension!.loseContext();
			await lost;
			counts.reset();
			expect(engine.resize(96, 48)).toBe(true);
			expect(canvas.width).toBe(96);
			expect(canvas.height).toBe(48);
			expect(counts.framebufferCreates).toBe(0);
			await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
			const restored = once(canvas, 'webglcontextrestored');
			extension!.restoreContext();
			await restored;
			const velocity = engine.readField('velocity');
			expect(velocity.width).toBe(64);
			expect(velocity.height).toBe(32);
			expect(hasNonFinite(velocity.data)).toBe(false);
			expect(fieldEnergy(velocity.data)).toBeGreaterThan(0.001);
		} finally {
			engine.dispose();
		}
	}, 60_000);
});
