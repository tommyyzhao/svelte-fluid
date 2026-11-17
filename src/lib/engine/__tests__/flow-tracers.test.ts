import { describe, expect, it, vi } from 'vitest';
import { DEFAULTS, FluidEngine, resolveConfig } from '../FluidEngine.js';
import { FlowTracers, TRACERS, type TracerPrograms } from '../tracers.js';
import type { DoubleFBO, FBO } from '../internal-types.js';
import { displayShaderSource } from '../shaders.js';
import {
	tracerDisplaySource,
	tracerUpdateShader,
	tracerSplatVertex
} from '../tracer-shaders.js';
import type { FlowConfig } from '../types.js';
import engineSource from '../FluidEngine.ts?raw';
import browserSource from '../__benches__/flow-tracers.browser.test.ts?raw';

const sources = [
	{ from: { x: 0.1, y: 0.2 }, to: { x: 0.1, y: 0.8 }, species: 0 as const }
];
const visualization: FlowConfig['visualization'] = {
	absorption: {
		absorbance: [
			{ r: 1, g: 0, b: 0 },
			{ r: 0, g: 1, b: 0 },
			{ r: 0, g: 0, b: 1 }
		]
	}
};
const flow: FlowConfig = { visualization, tracers: { sources } };
const resolve = (tracers: unknown) =>
	resolveConfig({ flow: { visualization, tracers } as FlowConfig }, DEFAULTS);
function inventory(capacity = 1024) {
	const noop = () => undefined;
	const gl = new Proxy(
		{
			NO_ERROR: 0,
			FRAMEBUFFER_COMPLETE: 1,
			createVertexArray: () => ({}),
			createTexture: () => ({}),
			createFramebuffer: () => ({}),
			checkFramebufferStatus: vi.fn(() => 1),
			getError: () => 0,
			getExtension: () => ({}),
			getParameter: () => 4096,
			readPixels: (...args: unknown[]) => (args[6] as Float32Array).fill(0.5),
			drawArrays: vi.fn(),
			drawArraysInstanced: vi.fn(),
			clear: vi.fn(),
			viewport: vi.fn()
		},
		{ get: (target, name) => Reflect.get(target, name) ?? noop }
	) as unknown as WebGL2RenderingContext;
	const program = {
		bind: noop,
		uniforms: new Proxy({}, { get: (_, name) => name })
	};
	const programs = {
		tracerProbe: program,
		tracerUpdate: program,
		tracerSplat: program
	} as unknown as TracerPrograms;
	const t = new FlowTracers(gl, capacity, programs, 96, 32);
	const fbo = { width: 96, height: 32, attach: (unit: number) => unit } as FBO;
	return {
		t,
		gl,
		programs,
		advance: (rate: number, dt = 1) =>
			t.advance(
				fbo, dt, { sources, rate }, {} as WebGLTexture,
				[1, 1], false, [1, 1, 0, 0]
			),
		accumulate: () =>
			t.accumulate(
				fbo, { sources }, visualization!.absorption!.absorbance,
				{} as WebGLTexture, [1, 1], false
			)
	};
}
describe('passive flow tracers', () => {
	it.each([0, 1, 511, 512, 513, 1024, 1200])('bounds splat instances after %i emissions; always clears depth', (emissions) => {
		const { t, gl, advance, accumulate } = inventory();
		try {
			vi.mocked(gl.drawArrays).mockClear();
			vi.mocked(gl.clear).mockClear();
			if (emissions) advance(emissions);
			accumulate();
			expect(gl.drawArraysInstanced).toHaveBeenLastCalledWith(gl.TRIANGLE_STRIP, 0, 4, Math.min(emissions, t.capacity));
			expect(gl.clear).toHaveBeenCalledTimes(1);
			expect(gl.clear).toHaveBeenCalledWith(gl.COLOR_BUFFER_BIT);
			expect(gl.drawArrays).toHaveBeenCalledTimes(emissions ? 1 : 0);
			if (emissions) expect(gl.viewport).toHaveBeenCalledWith(0, 0, 512, t.capacity / 512);
		} finally { t.dispose(); }
	});
	it('keeps the independent prefix across serial wrap, hot rates, zero emissions and depth resize', () => {
		const { t, gl, advance, accumulate } = inventory(1048576);
		const clock = t as unknown as { serial: number; initializedCount: number };
		try {
			advance(786432);
			expect(clock.serial).toBe(0);
			accumulate();
			expect(gl.drawArraysInstanced).toHaveBeenLastCalledWith(gl.TRIANGLE_STRIP, 0, 4, 786432);
			advance(10, 0.05);
			advance(30, 0.05);
			expect(clock.initializedCount).toBe(786434);
			advance(1, 0.1);
			t.resize(192, 64);
			accumulate();
			expect(gl.drawArraysInstanced).toHaveBeenLastCalledWith(gl.TRIANGLE_STRIP, 0, 4, 786434);
			advance(1048576);
			advance(786432);
			expect(clock.initializedCount).toBe(t.capacity);
			accumulate();
			expect(gl.drawArraysInstanced).toHaveBeenLastCalledWith(gl.TRIANGLE_STRIP, 0, 4, t.capacity);
			const replacement = new FlowTracers(gl, t.capacity, t.programs, 96, 32);
			try { expect((replacement as unknown as { initializedCount: number }).initializedCount).toBe(0); }
			finally { replacement.dispose(); }
		} finally { t.dispose(); }
	});
	it('failed capacity staging leaves the existing initialized prefix and config untouched', () => {
		const { t, gl, programs, advance, accumulate } = inventory();
		advance(513);
		const config = resolveConfig({ flow: { ...flow, tracers: { sources, capacity: 1024 } } }, DEFAULTS);
		const h = Object.assign(Object.create(FluidEngine.prototype), {
			disposed: false, contextLost: false, failed: false, config, gl,
			canvas: { width: 288, height: 96 }, ext: { isWebGL2: true },
			tracers: t, tracerPrograms: programs, tracerFailure: null,
			displayMaterial: { prepareKeywords: () => '' },
			withGl: (fn: () => unknown) => fn(), displayKeywords: () => [],
			ensureProgramsFor: () => {}, prepareTracerDisplay: () => {}
		});
		try {
			vi.mocked(gl.checkFramebufferStatus).mockReturnValue(0);
			expect(() => h.setConfig({ flow: { ...flow, tracers: { sources, capacity: 2048 } } })).toThrow('framebuffer unavailable');
			expect(h.config).toBe(config);
			expect(h.tracers).toBe(t);
			accumulate();
			expect(gl.drawArraysInstanced).toHaveBeenLastCalledWith(gl.TRIANGLE_STRIP, 0, 4, 513);
		} finally { t.dispose(); }
	});
	it.each([
		{ sources: undefined },
		{ sources: null },
		{ sources: [null] },
		{ sources: [] },
		{ sources: [...sources, ...sources, ...sources, ...sources] },
		{ sources: [{ ...sources[0], from: { x: NaN, y: 0.2 } }] },
		{ sources: [{ ...sources[0], to: { x: Infinity, y: 0.8 } }] },
		{ sources: [{ ...sources[0], from: { x: -0.01, y: 0.2 } }] },
		{ sources: [{ ...sources[0], to: { x: 1.01, y: 0.8 } }] },
		{ sources: [{ ...sources[0], to: { x: 0.1, y: 0.200001 } }] },
		{ sources: [{ ...sources[0], species: 3 }] },
		...[0, 511, 513, 1049088, 512.5, NaN, Infinity].map((capacity) => ({
			sources,
			capacity
		})),
		...[0, -1, NaN, Infinity].map((rate) => ({ sources, rate })),
		...[0, 0.01, 0.249, -1, NaN, Infinity, 1.334].map((sigma) => ({
			sources,
			sigma
		}))
	])('rejects invalid input before transitions: %j', (options) =>
		expect(() => resolve(options)).toThrow(RangeError)
	);
	it('requires absorption', () =>
		expect(() =>
			resolveConfig({ flow: { tracers: { sources } } }, DEFAULTS)
		).toThrow(/absorption/));
	it('retains opt-in input; default sigma is .75 dye texels, independent of resolution', () => {
		expect(resolveConfig({ flow }, DEFAULTS).FLOW).toBe(flow);
		expect(TRACERS.sigma).toBe(0.75);
		expect(() =>
			resolveConfig({ simResolution: 32, dyeResolution: 1024, flow }, DEFAULTS)
		).not.toThrow();
		for (const capacity of [512, 1048576])
			expect(() => resolve({ sources, capacity, sigma: 4 / 3 })).not.toThrow();
	});
	it('selects only opt-in WebGL2 programs; hot fields do not specialize GLSL', () => {
		const select = (
			FluidEngine.prototype as unknown as {
				selectedOptionalPrograms(this: unknown, c: unknown): Set<string>;
			}
		).selectedOptionalPrograms;
		const h = {
			ext: { isWebGL2: true },
			tracerFailure: null,
			useMacCormack: false
		};
		const config = resolveConfig(
			{ bloom: false, sunrays: false, flow },
			DEFAULTS
		);
		expect(
			[...select.call(h, config)].filter((s) => s.startsWith('tracer'))
		).toEqual(['tracerUpdate', 'tracerSplat', 'tracerProbe']);
		expect(
			[...select.call({ ...h, ext: { isWebGL2: false } }, config)].some((s) =>
				s.startsWith('tracer')
			)
		).toBe(false);
		expect(
			[...select.call(h, DEFAULTS)].some((s) => s.startsWith('tracer'))
		).toBe(false);
		expect(tracerUpdateShader).toContain('uniform float dt,uRate,uNewestAge;');
		expect(tracerSplatVertex).toContain('uniform float uSigma;');
		expect(engineSource).toContain('this.advanceTracers(dt);');
	});
	it('stub GL verifies overflow, serial wrap and fractional rate changes', () => {
		const uniforms: Record<string, number> = {};
		const noop = () => undefined;
		const gl = new Proxy(
			{
				uniform1i: (name: string, value: number) => {
					uniforms[name] = value;
				},
				uniform1f: (name: string, value: number) => {
					uniforms[name] = value;
				}
			},
			{ get: (target, name) => Reflect.get(target, name) ?? noop }
		) as unknown as WebGL2RenderingContext;
		const program = {
			bind: noop,
			uniforms: new Proxy({}, { get: (_, name) => name })
		};
		const fbo = {
			width: 96,
			height: 32,
			attach: (unit: number) => unit
		} as FBO;
		const state = {
			width: 512,
			height: 1,
			read: fbo,
			write: fbo,
			swap: noop
		} as DoubleFBO;
		const t = Object.assign(Object.create(FlowTracers.prototype), {
			gl,
			capacity: 512,
			programs: { tracerUpdate: program } as unknown as TracerPrograms,
			state,
			serial: 0,
			cursor: 0,
			initializedCount: 0,
			fraction: 0,
			sources: new Float32Array(12),
			species: new Int32Array(3),
			vao: null
		}) as FlowTracers;
		const clock = t as unknown as {
			serial: number;
			cursor: number;
			fraction: number;
		};
		const advance = (dt: number, rate: number) =>
			t.advance(
				fbo,
				dt,
				{ sources, rate },
				{} as WebGLTexture,
				[1, 1],
				false,
				[1, 1, 0, 0]
			);
		advance(1, 1200);
		expect(uniforms.uCount).toBe(512);
		expect(uniforms.uStart).toBe(688 % 512);
		expect(uniforms.uSerial).toBe(688);
		expect(uniforms.uNewestAge).toBe(0);
		expect(uniforms.uNewestAge + (uniforms.uCount - 1) / 1200).toBeCloseTo(
			511 / 1200
		);
		expect(clock.cursor).toBe(1200 % 512);
		clock.serial = 786431;
		advance(0.1, 20);
		expect(uniforms.uSerial).toBe(786431);
		expect(clock.serial).toBe(1);
		clock.serial = 0;
		clock.cursor = 0;
		clock.fraction = 0;
		advance(0.05, 10);
		expect(uniforms.uCount).toBe(0);
		expect(clock.fraction).toBeCloseTo(0.5);
		advance(0.05, 30);
		expect(uniforms.uCount).toBe(2);
		expect(clock.serial).toBe(2);
		expect(clock.fraction).toBeCloseTo(0);
		advance(0.6, 1);
		expect(uniforms.uCount).toBe(0);
		advance(0.6, 1);
		expect(uniforms.uCount).toBe(1);
		expect(uniforms.uNewestAge).toBeCloseTo(0.2);
		advance(0.4, 2);
		expect(uniforms.uCount).toBe(1);
		expect(uniforms.uNewestAge).toBeCloseTo(0);
		expect(tracerUpdateShader).toContain(
			'duration=min(dt,uNewestAge+float(uCount-1-relative)/uRate);'
		);
	});
	it('UV-area inventory keeps optical depth unchanged across hot sim-grid changes', () => {
		const values: Record<string, { x: number; y: number }> = {};
		const noop = () => undefined;
		const gl = new Proxy(
			{
				uniform2f: (name: string, x: number, y: number) => {
					values[name] = { x, y };
				}
			},
			{ get: (target, key) => Reflect.get(target, key) ?? noop }
		) as unknown as WebGL2RenderingContext;
		const fbo = {
			width: 288,
			height: 96,
			attach: (unit: number) => unit
		} as FBO;
		const t = Object.assign(Object.create(FlowTracers.prototype), {
			gl,
			capacity: 512,
			initializedCount: 512,
			programs: {
				tracerSplat: {
					bind: noop,
					uniforms: new Proxy({}, { get: (_, name) => name })
				}
			},
			state: { read: fbo },
			depth: fbo,
			absorbance: new Float32Array(9)
		}) as FlowTracers;
		// Execute the shader's scalar expressions, not an independently drifting mirror.
		const massExpression = tracerUpdateShader
			.match(/state=vec4\(uv,(.*),float\(uSpecies\[source\]\)\);/)![1]
			.replace('float(uSourceCount)', 'uSourceCount');
		const emittedMass = new Function(
			'incoming',
			'tangent',
			'uSourceCount',
			'uRate',
			'uSize',
			`return ${massExpression.replace(
				'length(tangent)',
				'Math.hypot(tangent.x,tangent.y)'
			)}`
		) as (
			incoming: number,
			tangent: { x: number; y: number },
			count: number,
			rate: number,
			size: { x: number; y: number }
		) => number;
		const normExpression = tracerSplatVertex
			.match(/float norm=(.*);/)![1]
			.replace('max(', 'Math.max(');
		const norm = new Function(
			'state',
			'uDyeSize',
			'uSize',
			'sum',
			`return ${normExpression}`
		) as (
			state: { z: number },
			dye: { x: number; y: number },
			size: { x: number; y: number },
			sum: { x: number; y: number }
		) => number;
		const mass = emittedMass(4, { x: 0, y: 0.6 * 32 }, 1, 128, {
			x: 96,
			y: 32
		});
		const outputs = [
			[96, 32],
			[192, 64],
			[128, 32]
		].map(([width, height]) => {
			t.accumulate(
				{ ...fbo, width, height },
				{ sources },
				visualization!.absorption!.absorbance,
				{} as WebGLTexture,
				[1, 1],
				false
			);
			return norm({ z: mass }, values.uDyeSize, values.uSize, { x: 2, y: 2 });
		});
		expect(outputs[1]).toBe(outputs[0]);
		expect(outputs[2]).toBe(outputs[0]);
		expect(
			emittedMass(8, { x: 0, y: 0.6 * 64 }, 1, 128, { x: 192, y: 64 })
		).toBeCloseTo(mass);
	});
	it('quarter-texel minimum covers a pixel centre at every subpixel phase', () => {
		expect(() => resolve({ sources, sigma: 0.25 })).not.toThrow();
		for (let phase = 0; phase <= 1; phase += 0.01)
			expect(
				Math.min(Math.abs(0.5 - phase), Math.abs(1.5 - phase))
			).toBeLessThanOrEqual(3 * 0.25);
		expect(0.5).toBeGreaterThan(3 * 0.01);
	});
	it('removing failed tracers clears capability latch and re-add retries', () => {
		const selected = vi.fn(),
			h = Object.create(FluidEngine.prototype);
		Object.assign(h, {
			disposed: false,
			contextLost: false,
			failed: false,
			config: resolveConfig({ flow }, DEFAULTS),
			tracerFailure: 'forced blend failure',
			tracerWarned: true,
			tracers: null,
			ext: { isWebGL2: false },
			displayMaterial: { prepareKeywords: () => '' },
			withGl: (fn: () => unknown) => fn(),
			displayKeywords: () => [],
			ensureProgramsFor: (c: { FLOW: FlowConfig }) => {
				if (c.FLOW?.tracers && !h.tracerFailure) selected();
			},
			transition: (_: string, fn: () => void) => fn(),
			cancelSettleProbe: () => {},
			wake: () => {},
			invalidateRender: () => {}
		});
		h.setConfig({ flow: { visualization } });
		expect(h.tracerFailure).toBeNull();
		expect(h.tracerWarned).toBe(true);
		h.setConfig({ flow });
		expect(selected).toHaveBeenCalledTimes(1);
		expect(h.tracerFailure).toContain('RGBA32F');
	});
	it('shared resize failure frees uncommitted tracer depth inside the GL scope before dispose', () => {
		const h = Object.create(FluidEngine.prototype),
			depth = { fbo: {}, texture: {} } as FBO,
			events: string[] = [];
		let scope = 0;
		Object.assign(h, {
			disposed: false,
			contextLost: false,
			velocitySnapshotSlots: [],
			velocitySnapshotEpoch: 0,
			canvas: { width: 200, height: 100 },
			config: resolveConfig({ flow }, DEFAULTS),
			gl: {
				MAX_VIEWPORT_DIMS: 1,
				MAX_TEXTURE_SIZE: 2,
				getParameter: (p: number) => (p === 1 ? [4096, 4096] : 4096),
				deleteFramebuffer: () => events.push(scope && !h.disposed ? 'free:scoped' : 'free:unscoped'),
				deleteTexture: () => {}
			},
			tracers: { depth: undefined, prepareDepth: () => depth, commitDepth: () => {} },
			withGl: (fn: () => unknown) => (h.disposed ? undefined : (scope++, fn())),
			// Shared host: a failing callback unwinds the scope, then onFrameError disposes.
			transition: (_: string, fn: () => void) => {
				try { h.withGl(fn); } catch { events.push('dispose'); h.disposed = true; }
			},
			initDyeFramebuffers: () => { throw new Error('forced allocation failure'); },
			cancelSettleProbe: () => {},
			presentationGate: { reset: () => {} },
			invalidateRender: () => {},
			wake: () => {}
		});
		h.resize(100, 200);
		expect(events).toEqual(['free:scoped', 'dispose']);
	});

	it('seven-argument blend readback rejects failed probe and frees partial resources', () => {
		const deletedTexture = vi.fn(),
			deletedFramebuffer = vi.fn(),
			deletedVao = vi.fn();
		const readPixels = vi.fn((...args: unknown[]) => {
			expect(args).toHaveLength(7);
			expect(args[6]).toBeInstanceOf(Float32Array);
			(args[6] as Float32Array).fill(0);
		});
		const gl = new Proxy(
			{
				NO_ERROR: 0,
				FRAMEBUFFER_COMPLETE: 1,
				createVertexArray: () => ({}),
				createTexture: () => ({}),
				createFramebuffer: () => ({}),
				checkFramebufferStatus: () => 1,
				getError: () => 0,
				readPixels,
				deleteTexture: deletedTexture,
				deleteFramebuffer: deletedFramebuffer,
				deleteVertexArray: deletedVao
			},
			{ get: (target, key) => Reflect.get(target, key) ?? (() => {}) }
		) as unknown as WebGL2RenderingContext;
		const program = { bind: () => {} };
		expect(
			() =>
				new FlowTracers(
					gl,
					512,
					{ tracerProbe: program } as unknown as TracerPrograms,
					96,
					32
				)
		).toThrow('RGBA16F additive blending unavailable');
		expect(readPixels).toHaveBeenCalledTimes(1);
		expect(deletedTexture).toHaveBeenCalledTimes(1);
		expect(deletedFramebuffer).toHaveBeenCalledTimes(1);
		expect(deletedVao).toHaveBeenCalledTimes(1);
	});
	it('restore harness crosses the loss-event macrotask before requesting restoration', () => {
		const restore = browserSource
			.split("it('context restoration rebuilds tracers without GL errors'")[1]
			.split("it('shared interleaving")[0];
		expect(restore).toMatch(
			/await lost;[\s\S]*await new Promise<void>\([\s\S]*window\.setTimeout\(resolve, 0\)[\s\S]*ext\.restoreContext\(\);/
		);
	});
	it('guards invalid carried mass and nonfinite incoming velocity', () => {
		expect(tracerUpdateShader).toContain('if(!(state.z>0.)');
		expect(tracerSplatVertex).toContain('if(!(state.z>0.)');
		expect(tracerUpdateShader).toContain(
			'if(isnan(incoming)||isinf(incoming))incoming=0.;'
		);
	});
	it('returns the exact legacy display source without the opt-in keyword', async () => {
		expect(tracerDisplaySource(displayShaderSource, ['ABSORPTION'])).toBe(
			displayShaderSource
		);
		expect(tracerDisplaySource(displayShaderSource, ['TRACERS'])).toContain(
			'exp(-tau - uTracersEnabled * texture2D(uTracerDepth, vUv).rgb)'
		);
		const hash = async (s: string) =>
			[
				...new Uint8Array(
					await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
				)
			]
				.map((n) => n.toString(16).padStart(2, '0'))
				.join('');
		expect(await hash(displayShaderSource)).toBe(
			'4e21b76e37ee5996465f6e7ab155c7f267be311fae04dd586cba4c9917ccd67e'
		);
	});
});
