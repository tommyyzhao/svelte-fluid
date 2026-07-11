import { describe, expect, it } from 'vitest';
import { FluidEngine } from '../FluidEngine.js';
import type { DoubleFBO, FBO, FluidConfig } from '../types.js';

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
	sunraysResolution: 32,
	containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 }
} satisfies FluidConfig;

interface FramebufferCounter {
	creates: number;
	deletes: number;
	reset(): void;
}

interface ResourceHarness {
	dye: DoubleFBO;
	scalar: DoubleFBO | null;
	velocity: DoubleFBO;
	velocitySource: FBO;
	divergence: FBO;
	curlFBO: FBO;
	pressure: DoubleFBO;
	bloom: FBO;
	bloomFramebuffers: FBO[];
	sunrays: FBO;
	sunraysTemp: FBO;
	sceneFBO: FBO | null;
	solidNeighborTexture: WebGLTexture | null;
	solidClearanceTexture: WebGLTexture | null;
}

function createCountedCanvas(): { canvas: HTMLCanvasElement; counter: FramebufferCounter } {
	const canvas = document.createElement('canvas');
	canvas.width = 64;
	canvas.height = 64;
	const gl = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES);
	if (!gl) throw new Error('WebGL2 is required for resource ownership tests');

	const originalCreate = gl.createFramebuffer.bind(gl);
	const originalDelete = gl.deleteFramebuffer.bind(gl);
	const counter: FramebufferCounter = {
		creates: 0,
		deletes: 0,
		reset() {
			this.creates = 0;
			this.deletes = 0;
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
			originalDelete(framebuffer);
		}
	});
	return { canvas, counter };
}

function handles(target: DoubleFBO): [WebGLFramebuffer, WebGLFramebuffer] {
	return [target.read.fbo, target.write.fbo];
}

function postHandles(engine: ResourceHarness): WebGLFramebuffer[] {
	return [
		engine.bloom.fbo,
		...engine.bloomFramebuffers.map((fbo) => fbo.fbo),
		engine.sunrays.fbo,
		engine.sunraysTemp.fbo
	];
}

function simulationHandles(engine: ResourceHarness): WebGLFramebuffer[] {
	return [
		...handles(engine.velocity),
		engine.velocitySource.fbo,
		engine.divergence.fbo,
		engine.curlFBO.fbo,
		...handles(engine.pressure)
	];
}

function sameHandles(a: readonly WebGLFramebuffer[], b: readonly WebGLFramebuffer[]): boolean {
	return a.length === b.length && a.every((handle, index) => handle === b[index]);
}

function makeEngine(config: FluidConfig = {}): {
	engine: FluidEngine;
	harness: ResourceHarness;
	counter: FramebufferCounter;
} {
	const { canvas, counter } = createCountedCanvas();
	const engine = new FluidEngine({
		canvas,
		autoStart: false,
		config: { ...SMALL_CONFIG, ...config }
	});
	return { engine, harness: engine as unknown as ResourceHarness, counter };
}

describe('framebuffer ownership transitions', () => {
	it('dye resolution changes only the dye/scalar group', () => {
		const { engine, harness, counter } = makeEngine();
		try {
			const dyeBefore = handles(harness.dye);
			const simulationBefore = simulationHandles(harness);
			const postBefore = postHandles(harness);
			const sceneBefore = harness.sceneFBO;

			counter.reset();
			engine.setConfig({ dyeResolution: 48 });

			expect(sameHandles(handles(harness.dye), dyeBefore)).toBe(false);
			expect(sameHandles(simulationHandles(harness), simulationBefore)).toBe(true);
			expect(sameHandles(postHandles(harness), postBefore)).toBe(true);
			expect(harness.sceneFBO).toBe(sceneBefore);
			expect(counter.creates).toBe(2);
			expect(counter.deletes).toBe(2);
		} finally {
			engine.dispose();
		}
	});

	it('simulation resolution preserves dye/post and rebuilds solid derivatives once', () => {
		const { engine, harness, counter } = makeEngine({ advectionScheme: 'maccormack' });
		try {
			const dyeBefore = handles(harness.dye);
			const simulationBefore = simulationHandles(harness);
			const postBefore = postHandles(harness);
			const neighborBefore = harness.solidNeighborTexture;
			const clearanceBefore = harness.solidClearanceTexture;

			counter.reset();
			engine.setConfig({ simResolution: 48 });

			expect(sameHandles(handles(harness.dye), dyeBefore)).toBe(true);
			expect(sameHandles(simulationHandles(harness), simulationBefore)).toBe(false);
			expect(sameHandles(postHandles(harness), postBefore)).toBe(true);
			expect(harness.solidNeighborTexture).toBeTruthy();
			expect(harness.solidNeighborTexture).not.toBe(neighborBefore);
			if (clearanceBefore) expect(harness.solidClearanceTexture).not.toBe(clearanceBefore);
			// velocity pair + source/divergence/curl + pressure pair
			expect(counter.creates).toBe(7);
			expect(counter.deletes).toBe(7);
		} finally {
			engine.dispose();
		}
	});

	it('scalar need transitions never rebuild dye', () => {
		const { engine, harness, counter } = makeEngine();
		try {
			const dyeBefore = handles(harness.dye);
			expect(harness.scalar).toBeNull();

			counter.reset();
			engine.setConfig({ flow: { scalarFields: [{ name: 'ink' }] } });
			expect(harness.scalar).toBeTruthy();
			expect(sameHandles(handles(harness.dye), dyeBefore)).toBe(true);
			expect(counter.creates).toBe(2);
			expect(counter.deletes).toBe(0);

			counter.reset();
			engine.setConfig({ flow: null });
			expect(harness.scalar).toBeNull();
			expect(sameHandles(handles(harness.dye), dyeBefore)).toBe(true);
			expect(counter.creates).toBe(0);
			expect(counter.deletes).toBe(2);
		} finally {
			engine.dispose();
		}
	});

	it('combined dye/sim/bloom transition touches each group once and balances disposal', () => {
		const { engine, harness, counter } = makeEngine();
		const sunraysBefore = [harness.sunrays.fbo, harness.sunraysTemp.fbo];
		const createsBefore = counter.creates;
		const deletesBefore = counter.deletes;

		engine.setConfig({ simResolution: 48, dyeResolution: 48, bloomResolution: 48 });
		expect(sameHandles([harness.sunrays.fbo, harness.sunraysTemp.fbo], sunraysBefore)).toBe(true);
		// dye pair (2) + simulation group (7) + bloom base/one mip (2)
		expect(counter.creates - createsBefore).toBe(11);
		expect(counter.deletes - deletesBefore).toBe(11);

		engine.dispose();
		expect(counter.deletes).toBe(counter.creates);
	});
});
