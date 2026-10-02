import { describe, expect, it } from 'vitest';
import { FluidEngine } from '../FluidEngine.js';
import * as S from '../shaders.js';
import type { FluidConfig } from '../types.js';

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
	sunrays: false,
	glass: false,
	paused: true
} satisfies FluidConfig;

interface CompilerCounter {
	readonly gl: WebGL2RenderingContext;
	sources: string[];
	links: number;
	failLinkSource: string | null;
	shaderDeletes: number;
	programDeletes: number;
	reset(): void;
}

interface EngineHarness {
	rafRunning: boolean;
	useMacCormack: boolean;
	config: { BLOOM: boolean };
	bloom: unknown | null;
	update(): void;
}

function createCountedCanvas(): { canvas: HTMLCanvasElement; counter: CompilerCounter } {
	const canvas = document.createElement('canvas');
	canvas.width = 96;
	canvas.height = 64;
	const gl = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES);
	if (!gl) throw new Error('WebGL2 is required for selected-program tests');

	const originalShaderSource = gl.shaderSource.bind(gl);
	const originalAttachShader = gl.attachShader.bind(gl);
	const originalLinkProgram = gl.linkProgram.bind(gl);
	const originalGetProgramParameter = gl.getProgramParameter.bind(gl);
	const originalDeleteShader = gl.deleteShader.bind(gl);
	const originalDeleteProgram = gl.deleteProgram.bind(gl);
	const shaderSources = new WeakMap<WebGLShader, string>();
	const programSources = new WeakMap<WebGLProgram, Set<string>>();
	const counter: CompilerCounter = {
		gl,
		sources: [],
		links: 0,
		failLinkSource: null,
		shaderDeletes: 0,
		programDeletes: 0,
		reset() {
			this.sources = [];
			this.links = 0;
			this.shaderDeletes = 0;
			this.programDeletes = 0;
		}
	};
	Object.defineProperty(gl, 'shaderSource', {
		configurable: true,
		value: (shader: WebGLShader, source: string) => {
			counter.sources.push(source);
			shaderSources.set(shader, source);
			originalShaderSource(shader, source);
		}
	});
	Object.defineProperty(gl, 'attachShader', {
		configurable: true,
		value: (program: WebGLProgram, shader: WebGLShader) => {
			const sources = programSources.get(program) ?? new Set<string>();
			const source = shaderSources.get(shader);
			if (source) sources.add(source);
			programSources.set(program, sources);
			originalAttachShader(program, shader);
		}
	});
	Object.defineProperty(gl, 'linkProgram', {
		configurable: true,
		value: (program: WebGLProgram) => {
			counter.links++;
			originalLinkProgram(program);
		}
	});
	Object.defineProperty(gl, 'getProgramParameter', {
		configurable: true,
		value: (program: WebGLProgram, pname: number) => {
			if (
				pname === gl.LINK_STATUS && counter.failLinkSource &&
				programSources.get(program)?.has(counter.failLinkSource)
			) return false;
			return originalGetProgramParameter(program, pname);
		}
	});
	Object.defineProperty(gl, 'deleteShader', {
		configurable: true,
		value: (shader: WebGLShader | null) => {
			counter.shaderDeletes++;
			originalDeleteShader(shader);
		}
	});
	Object.defineProperty(gl, 'deleteProgram', {
		configurable: true,
		value: (program: WebGLProgram | null) => {
			counter.programDeletes++;
			originalDeleteProgram(program);
		}
	});
	return { canvas, counter };
}

function renderOne(engine: FluidEngine): void {
	const harness = engine as unknown as EngineHarness;
	harness.rafRunning = true;
	harness.update();
	engine.pause();
}

function includesSource(counter: CompilerCounter, source: string): boolean {
	return counter.sources.includes(source);
}

function once(target: EventTarget, type: string, timeoutMs = 10_000): Promise<Event> {
	return new Promise((resolve, reject) => {
		const timeout = window.setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), timeoutMs);
		target.addEventListener(
			type,
			(event) => {
				window.clearTimeout(timeout);
				resolve(event);
			},
			{ once: true }
		);
	});
}

describe('selected engine program compilation', () => {
	it('omits inactive families and prewarms each family before first use', () => {
		const { canvas, counter } = createCountedCanvas();
		const engine = new FluidEngine({ canvas, autoStart: false, config: SMALL_CONFIG });
		try {
			for (const source of [
				S.blurVertexShader,
				S.blurShader,
				S.bloomPrefilterShader,
				S.bloomDownShader,
				S.bloomUpShader,
				S.sunraysMaskShader,
				S.sunraysShader,
				S.advectionMacCormackShader,
				S.glassShaderSource,
				S.flowSourceShader,
				S.flowOutletShader,
				S.flowForceShader,
				S.prescribedFieldShader,
				S.applyMaskShader
			]) {
				expect(includesSource(counter, source)).toBe(false);
			}
			const constructionLinks = counter.links;
			const constructionSources = counter.sources.length;
			renderOne(engine);
			expect(counter.links).toBe(constructionLinks);
			expect(counter.sources).toHaveLength(constructionSources);

			counter.reset();
			engine.setConfig({ bloom: true });
			for (const source of [S.blurVertexShader, S.blurShader, S.bloomPrefilterShader, S.bloomDownShader, S.bloomUpShader]) {
				expect(includesSource(counter, source)).toBe(true);
			}
			const bloomLinks = counter.links;
			const bloomSources = counter.sources.length;
			renderOne(engine);
			expect(counter.links).toBe(bloomLinks);
			expect(counter.sources).toHaveLength(bloomSources);

			engine.setConfig({ bloom: false });
			engine.setConfig({ bloom: true });
			expect(counter.links).toBe(bloomLinks);

			counter.reset();
			engine.setConfig({
				sunrays: true,
				glass: true,
				containerShape: { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 },
				flow: {
					mode: 'hybrid',
					sources: [{ kind: 'point', x: 0.5, y: 0.5, velocity: { x: 1, y: 0 } }],
					outlets: [{ edge: 'right' }],
					forces: [{ kind: 'gravity', vector: { x: 0, y: -1 } }],
					prescribed: { kind: 'grid', velocity: { width: 1, height: 1, data: [0, 0] } }
				}
			});
			for (const source of [
				S.sunraysMaskShader,
				S.sunraysShader,
				S.glassShaderSource,
				S.flowSourceShader,
				S.flowOutletShader,
				S.flowForceShader,
				S.prescribedFieldShader,
				S.applyMaskShader
			]) {
				expect(includesSource(counter, source)).toBe(true);
			}
			const selectedLinks = counter.links;
			const selectedSources = counter.sources.length;
			engine.setConfig({ paused: false });
			engine.advance(1, 1 / 120);
			renderOne(engine);
			expect(counter.links).toBe(selectedLinks);
			expect(counter.sources).toHaveLength(selectedSources);
		} finally {
			engine.dispose();
		}
	});

	it('keeps the prior config live and cleans a failed program candidate', () => {
		const { canvas, counter } = createCountedCanvas();
		const engine = new FluidEngine({ canvas, autoStart: false, config: SMALL_CONFIG });
		const harness = engine as unknown as EngineHarness;
		try {
			counter.reset();
			counter.failLinkSource = S.bloomPrefilterShader;
			expect(() => engine.setConfig({ bloom: true })).toThrow(/program link failed/);
			expect(harness.config.BLOOM).toBe(false);
			expect(harness.bloom).toBeNull();
			expect(counter.programDeletes).toBeGreaterThanOrEqual(1);
			expect(counter.shaderDeletes).toBeGreaterThanOrEqual(1);

			const failedLinks = counter.links;
			counter.failLinkSource = null;
			renderOne(engine);
			expect(counter.links).toBe(failedLinks);
			engine.setConfig({ bloom: true });
			expect(harness.config.BLOOM).toBe(true);
			renderOne(engine);
		} finally {
			counter.failLinkSource = null;
			engine.dispose();
		}
	});

	it('constructs the MacCormack program only when the effective scheme selects it', () => {
		const baseline = createCountedCanvas();
		const standard = new FluidEngine({ canvas: baseline.canvas, autoStart: false, config: SMALL_CONFIG });
		try {
			expect(includesSource(baseline.counter, S.advectionMacCormackShader)).toBe(false);
		} finally {
			standard.dispose();
		}

		const selected = createCountedCanvas();
		const maccormack = new FluidEngine({
			canvas: selected.canvas,
			autoStart: false,
			advectionScheme: 'maccormack',
			config: SMALL_CONFIG
		});
		try {
			const effective = (maccormack as unknown as EngineHarness).useMacCormack;
			expect(includesSource(selected.counter, S.advectionMacCormackShader)).toBe(effective);
		} finally {
			maccormack.dispose();
		}
	});

	it('restores only the currently selected optional set', async () => {
		const { canvas, counter } = createCountedCanvas();
		const extension = counter.gl.getExtension('WEBGL_lose_context');
		expect(extension).toBeTruthy();
		const engine = new FluidEngine({
			canvas,
			autoStart: false,
			config: { ...SMALL_CONFIG, bloom: true }
		});
		try {
			const lost = once(canvas, 'webglcontextlost');
			extension!.loseContext();
			await lost;
			await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

			counter.reset();
			const restored = once(canvas, 'webglcontextrestored');
			extension!.restoreContext();
			await restored;

			for (const source of [S.blurShader, S.bloomPrefilterShader, S.bloomDownShader, S.bloomUpShader]) {
				expect(includesSource(counter, source)).toBe(true);
			}
			for (const source of [
				S.sunraysMaskShader,
				S.sunraysShader,
				S.advectionMacCormackShader,
				S.glassShaderSource,
				S.flowSourceShader
			]) {
				expect(includesSource(counter, source)).toBe(false);
			}
			const links = counter.links;
			const sources = counter.sources.length;
			renderOne(engine);
			expect(counter.links).toBe(links);
			expect(counter.sources).toHaveLength(sources);
		} finally {
			engine.dispose();
		}
	}, 30_000);
});
