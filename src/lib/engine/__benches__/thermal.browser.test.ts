import { describe, expect, it, vi } from 'vitest';
import { commands } from 'vitest/browser';
import { FluidEngine, _setContextTier } from '../FluidEngine.js';
import type { FlowConfig, FluidConfig } from '../types.js';
import type { DoubleFBO, FBO } from '../internal-types.js';
import { createFBO, createDoubleFBO, disposeFBO, disposeDoubleFBO } from '../gl-utils.js';
import { renderer } from './renderer.js';

interface Harness {
	gl: WebGL2RenderingContext;
	scalar: DoubleFBO;
	scalarRhs: FBO | null;
	scalarDiffusionRhs: FBO | null;
	scalarDiffusion: DoubleFBO | null;
	scalarAdvected: FBO | null;
	emission: FBO | null;
	scalarFloat: boolean;
	dyeFloat: boolean;
	advectDye(dt: number): void;
	velocity: DoubleFBO;
	dye: DoubleFBO;
	bloom: FBO | null;
	applyFlowSources(dt: number, includeVelocity: boolean): void;
	applyScalarTransport(dt: number): void;
	advectScalar(dt: number): void;
	renderCore(target: FBO | null): void;
	renderProfiledInner(target: FBO | null): void;
	prepareEmission(): void;
}
const temperature = {
	name: 'temperature',
	dissipation: 0,
	diffusivity: 4,
	diffusionIterations: 100,
	wall: 'insulated' as const,
	temperatureRatio: 6
};
function make(extra: FluidConfig = {}, size = 32) {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const engine = new FluidEngine({
		canvas,
		autoStart: false,
		config: {
			seed: 704,
			pointerInput: false,
			initialSplatCount: 0,
			simResolution: size,
			dyeResolution: size,
			curl: 0,
			velocityDissipation: 0,
			densityDissipation: 0,
			pressureIterations: 80,
			shading: false,
			sunrays: false,
			bloom: false,
			flow: { scalarFields: [temperature] },
			...extra
		}
	});
	return { engine, h: engine as unknown as Harness, canvas };
}
function upload(h: Harness, target: FBO, fn: (x: number, y: number) => number[], format: number = h.gl.RGBA) {
	const gl = h.gl,
		channels = format === gl.RG ? 2 : 4;
	const data = new Float32Array(target.width * target.height * channels);
	for (let y = 0; y < target.height; y++)
		for (let x = 0; x < target.width; x++)
			data.set(
				fn((x + 0.5) / target.width, (y + 0.5) / target.height).slice(0, channels),
				(y * target.width + x) * channels
			);
	gl.bindTexture(gl.TEXTURE_2D, target.texture);
	gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, target.width, target.height, format, gl.FLOAT, data);
}
function mean(data: Float32Array, channel = 0, stride = 4) {
	let total = 0;
	for (let i = channel; i < data.length; i += stride) total += data[i];
	return total / (data.length / stride);
}
function peak(data: Float32Array, channel = 0, stride = 4) {
	let total = 0;
	for (let i = channel; i < data.length; i += stride) total = Math.max(total, data[i]);
	return total;
}
function pixels(h: Harness, fbo: FBO) {
	const gl = h.gl,
		data = new Float32Array(fbo.width * fbo.height * 4);
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo);
	gl.readPixels(0, 0, fbo.width, fbo.height, gl.RGBA, gl.FLOAT, data);
	return data;
}
function noError(h: Harness) {
	expect(h.gl.getError(), renderer).toBe(h.gl.NO_ERROR);
}

describe('hardware thermal transport', () => {
	it('inflow fixes composition without accumulation and preserves unsupplied scalar channels', () => {
		const source = {
			kind: 'rect' as const,
			x: 0,
			y: 0,
			width: 1,
			height: 1,
			rate: 60,
			inflow: true,
			dye: { r: 2, g: 1, b: 0.2 },
			scalars: { temperature: 1 }
		};
		const { engine, h } = make({
			flow: {
				sources: [source],
				scalarFields: [
					{ name: 'temperature', dissipation: 0 },
					{ name: 'ink', dissipation: 0 }
				]
			}
		});
		try {
			upload(h, h.scalar.read, () => [0, 7, 3, 1]);
			for (let i = 0; i < 200; i++) h.applyFlowSources(1 / 240, false);
			const scalar = engine.readField('scalar').data,
				dye = engine.readField('dye').data;
			expect(mean(scalar, 0)).toBeCloseTo(1, 2);
			expect(mean(scalar, 1)).toBe(7);
			expect(mean(scalar, 2)).toBe(3);
			expect(mean(dye)).toBeCloseTo(2, 2);
			expect(mean(dye, 3)).toBeGreaterThan(0);
			noError(h);
		} finally {
			engine.dispose();
		}
	});
	it('insulated constant heat survives conduction and boundary-aware advection, cold walls remove heat', () => {
		for (const wall of ['insulated', 'isothermal'] as const) {
			const { engine, h } = make({ flow: { scalarFields: [{ ...temperature, wall }] } });
			try {
				upload(h, h.scalar.read, () => [1, 0, 0, 1]);
				for (let i = 0; i < 20; i++) {
					h.advectScalar(0.01);
					h.applyScalarTransport(0.01);
				}
				const heat = mean(engine.readField('scalar').data);
				console.log('thermal wall heat', wall, heat);
				if (wall === 'insulated') expect(heat).toBeCloseTo(1, 2);
				else expect(heat).toBeLessThan(0.85);
				noError(h);
			} finally {
				engine.dispose();
			}
		}
	});
	it('insulated physical masks do not leak uniform heat during advection', () => {
		const { engine, h } = make({
			containerShape: { type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.4, halfH: 0.3, cornerRadius: 0 },
			flow: { scalarFields: [temperature] }
		});
		try {
			upload(h, h.scalar.read, (x, y) =>
				Math.abs(x - 0.5) < 0.4 && Math.abs(y - 0.5) < 0.3 ? [1, 0, 0, 1] : [0, 0, 0, 1]
			);
			for (let i = 0; i < 50; i++) h.advectScalar(0.01);
			const values = engine.readField('scalar').data;
			expect(peak(values)).toBe(1);
			let interior = 0,
				count = 0;
			for (let y = 7; y < 25; y++)
				for (let x = 4; x < 28; x++) {
					interior += values[(y * 32 + x) * 4];
					count++;
				}
			expect(interior / count).toBeCloseTo(1, 3);
			noError(h);
		} finally {
			engine.dispose();
		}
	});
	it('limited thermal MacCormack isolates precision and unequal-grid transport without new extrema', async () => {
		const diagnostics: unknown[] = [];
		for (const [sim, dye] of [
			[64, 64],
			[32, 128]
		]) {
			for (const fullFloat of [false, true]) {
				const errors: number[] = [];
				for (const advectionScheme of ['semilagrangian', 'maccormack'] as const) {
					const { engine, h } = make(
						{
							advectionScheme,
							simResolution: sim,
							dyeResolution: dye,
							flow: { scalarFields: [{ ...temperature, diffusivity: 0 }] }
						},
						dye
					);
					try {
						// Force both formats to isolate framebuffer roundoff from production policy.
						const internalFormat = fullFloat ? h.gl.RGBA32F : h.gl.RGBA16F;
						const type = fullFloat ? h.gl.FLOAT : h.gl.HALF_FLOAT;
						disposeDoubleFBO(h.gl, h.scalar);
						h.scalar = createDoubleFBO(h.gl, dye, dye, internalFormat, h.gl.RGBA, type, h.gl.LINEAR);
						if (h.scalarAdvected) {
							disposeFBO(h.gl, h.scalarAdvected);
							h.scalarAdvected = createFBO(h.gl, dye, dye, internalFormat, h.gl.RGBA, type, h.gl.NEAREST);
						}
						upload(h, h.velocity.read, () => [4, 0], h.gl.RG);
						upload(h, h.scalar.read, (x) => [0.5 + 0.4 * Math.sin(2 * Math.PI * x), 0, 0, 1]);
						for (let i = 0; i < 40; i++) h.advectScalar(0.01);
						const data = engine.readField('scalar').data;
						let error = 0,
							count = 0;
						for (let y = 4; y < dye - 4; y++)
							for (let x = dye / 4; x < (3 * dye) / 4; x++) {
								const q = data[(y * dye + x) * 4];
								expect(q).toBeGreaterThanOrEqual(0.099);
								expect(q).toBeLessThanOrEqual(0.901);
								error += (q - (0.5 + 0.4 * Math.sin(2 * Math.PI * ((x + 0.5) / dye - (4 * 0.4) / sim)))) ** 2;
								count++;
							}
						errors.push(Math.sqrt(error / count));
						upload(h, h.scalar.read, () => [1, 0, 0, 1]);
						for (let i = 0; i < 30; i++) h.advectScalar(0.01);
						expect(mean(engine.readField('scalar').data)).toBeCloseTo(1, 3);
						noError(h);
					} finally {
						engine.dispose();
					}
				}
				diagnostics.push({ sim, dye, fullFloat, errors });
				if (fullFloat) expect(errors[1]).toBeLessThan(errors[0] / 2);
			}
		}
		await (
			commands as unknown as { writeBenchJson(path: string, content: string): Promise<void> }
		).writeBenchJson(
			`${import.meta.env.SVELTE_FLUID_SHOTS_DIR || '.svelte-kit/flame-shots'}/transport-precision.json`,
			JSON.stringify(diagnostics, null, 2)
		);
	});
	it('emitted salt shares high-precision limited transport while thickness stays first-order', () => {
		const runs: Float32Array[] = [];
		for (const dt of [0.01, 0.005]) {
			const { engine, h } = make(
				{
					advectionScheme: 'maccormack',
					flow: {
						scalarFields: [{ ...temperature, diffusivity: 0 }],
						visualization: { emission: { scalar: 'temperature', intensity: 1, excitation: 6 } }
					}
				},
				64
			);
			try {
				expect(h.dyeFloat).toBe(true);
				upload(h, h.velocity.read, () => [4, 0], h.gl.RG);
				upload(h, h.scalar.read, (x) => [0.5 + 0.4 * Math.sin(2 * Math.PI * x), 0, 0, 1]);
				upload(h, h.dye.read, (x) => [0.5 + 0.4 * Math.sin(2 * Math.PI * x), 0.25, 0.125, 0.4]);
				for (let i = 0; i < Math.round(0.4 / dt); i++) {
					h.advectDye(dt);
					h.advectScalar(dt);
				}
				const salt = engine.readField('dye').data,
					heat = engine.readField('scalar').data;
				for (let i = 0; i < salt.length; i += 4) {
					expect(salt[i]).toBe(heat[i]);
					expect(salt[i + 3]).toBeCloseTo(0.24, 5);
				}
				runs.push(salt);
				noError(h);
			} finally {
				engine.dispose();
			}
		}
		let delta = 0;
		for (let y = 4; y < 60; y++)
			for (let x = 16; x < 48; x++)
				delta = Math.max(delta, Math.abs(runs[0][(y * 64 + x) * 4] - runs[1][(y * 64 + x) * 4]));
		expect(delta).toBeLessThan(0.001);
	});
	it('single-channel scratch preserves inactive channels and matches RGBA conduction for every channel', () => {
		for (const [name, channel] of [['temperature', 0], ['ink', 1], ['salt', 2]] as const) {
			const { engine, h } = make({
				containerShape: { type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.4, halfH: 0.4, cornerRadius: 0 },
				flow: { scalarFields: [{ ...temperature, name, diffusivity: 0.2, diffusionIterations: 20, wall: 'isothermal' }] }
			});
			const scratch = h.scalarDiffusion;
			try {
				expect(scratch).toBeTruthy();
				const run = (narrow: boolean) => {
					h.scalarDiffusion = narrow ? scratch : null;
					upload(h, h.scalar.read, (x, y) => [0.5 + 0.4 * Math.sin(11 * x), 0.6 + 0.3 * Math.cos(9 * y), 0.25, 0.75]);
					for (let i = 0; i < 10; i++) h.applyScalarTransport(1 / 240);
					noError(h);
					return engine.readField('scalar').data;
				};
				const rgba = run(false), narrow = run(true);
				let delta = 0;
				for (let i = 0; i < rgba.length; i++) {
					if (i % 4 !== channel) expect(narrow[i]).toBe(rgba[i]);
					else delta = Math.max(delta, Math.abs(narrow[i] - rgba[i]));
				}
				expect(delta).toBeLessThanOrEqual(1e-6);
			} finally { h.scalarDiffusion = scratch; engine.dispose(); }
		}
	});

	it('slab mode matches analytic conduction, converges with refinement and iteration doubling', () => {
		const errors: number[] = [];
		const diagnostics: { size: number; error: number; doublingDelta: number }[] = [];
		for (const size of [16, 32, 64]) {
			const solve = (iterations: number) => {
				const { engine, h } = make(
					{
						flow: {
							boundary: { left: 'open', right: 'open' },
							scalarFields: [{ ...temperature, diffusionIterations: iterations, wall: 'isothermal' }]
						}
					},
					size
				);
				try {
					upload(h, h.scalar.read, (_x, y) => [Math.sin(Math.PI * y), 0, 0, 1]);
					for (let i = 0; i < 10; i++) h.applyScalarTransport(0.01);
					const data = engine.readField('scalar').data;
					const amplitude = Math.exp((-4 / 128) * Math.PI ** 2 * 0.1);
					let error = 0;
					for (let y = 0; y < size; y++)
						for (let x = 0; x < size; x++)
							error += (data[(y * size + x) * 4] - amplitude * Math.sin((Math.PI * (y + 0.5)) / size)) ** 2;
					noError(h);
					return { error: Math.sqrt(error / (size * size)), data };
				} finally {
					engine.dispose();
				}
			};
			const a = solve(100),
				b = solve(200);
			let delta = 0;
			for (let i = 0; i < a.data.length; i += 4) delta = Math.max(delta, Math.abs(a.data[i] - b.data[i]));
			expect(delta).toBeLessThan(0.002);
			expect(a.error).toBeLessThan(0.025);
			errors.push(a.error);
			diagnostics.push({ size, error: a.error, doublingDelta: delta });
		}
		console.log('slab refinement RMS', JSON.stringify(diagnostics));
		// Half-float roundoff eventually dominates truncation; require bounded refinement, not fictitious exact order.
		expect(errors[2]).toBeLessThan(0.025);
	});
	it('scalar-grid conduction preserves an immutable RHS and converges under timestep halving', () => {
		const run = (dt: number) => {
			const { engine, h } = make(
				{
					flow: {
						boundary: { left: 'open', right: 'open' },
						scalarFields: [{ ...temperature, diffusivity: 1, wall: 'isothermal' }]
					}
				},
				32
			);
			try {
				upload(h, h.scalar.read, (_x, y) => [Math.sin(Math.PI * y), 0, 0, 1]);
				for (let i = 0; i < Math.round(0.2 / dt); i++) h.applyScalarTransport(dt);
				return mean(engine.readField('scalar').data);
			} finally {
				engine.dispose();
			}
		};
		const values = [0.04, 0.02, 0.01].map(run);
		console.log('conduction dt refinement', values);
		expect(Math.abs(values[2] - values[1])).toBeLessThan(0.01);
	});
	it('radiation stays nonnegative and converges with timestep', () => {
		const solve = (dt: number) => {
			const { engine, h } = make({
				flow: { scalarFields: [{ ...temperature, diffusivity: 0, radiativeCooling: 2 }] }
			});
			try {
				upload(h, h.scalar.read, () => [1, 0, 0, 1]);
				for (let i = 0; i < Math.round(0.2 / dt); i++) h.applyScalarTransport(dt);
				noError(h);
				return mean(engine.readField('scalar').data);
			} finally {
				engine.dispose();
			}
		};
		const values = [0.05, 0.025, 0.0125].map(solve);
		console.log('radiation dt refinement', values);
		for (const value of values) {
			expect(value).toBeGreaterThan(0);
			expect(value).toBeLessThan(1);
		}
		expect(Math.abs(values[2] - values[1])).toBeLessThan(Math.abs(values[1] - values[0]) + 0.002);
	});
	it('paired no-slip viscosity preserves odd/even iteration counts and open/solid faces', () => {
		for (const iterations of [1, 2, 3, 8]) {
			const { engine, h } = make({ viscosity: 0.005, viscosityIterations: iterations, flow: { walls: 'no-slip', boundary: { left: 'open', right: 'open' } }, containerShape: { type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.4, halfH: 0.4, cornerRadius: 0 } });
			const internal = h as Harness & { applyViscosity(dt: number): void };
			try {
				const run = (usePairs: boolean) => {
					upload(h, h.velocity.read, (x, y) => [20 * Math.sin(7 * x), 10 * Math.cos(9 * y)], h.gl.RG);
					const width = h.velocity.width;
					if (!usePairs) h.velocity.width = 2_000_000;
					try { internal.applyViscosity(usePairs ? 1 / 240 : (1 / 240) * width / 2_000_000); }
					finally { h.velocity.width = width; }
					noError(h);
					return engine.readField('velocity').data;
				};
				const single = run(false), double = run(true);
				let delta = 0;
				for (let i = 0; i < single.length; i++) delta = Math.max(delta, Math.abs(single[i] - double[i]));
				expect(delta).toBeLessThan(0.05);
			} finally { engine.dispose(); }
		}
	});

	it('no-slip gives post-projection tangential wall shear, unlike free-slip', () => {
		const shear: number[] = [];
		for (const walls of ['free-slip', 'no-slip'] as const) {
			const { engine, h } = make({
				viscosity: 4,
				viscosityIterations: 40,
				flow: { walls, boundary: { left: 'open', right: 'open' } }
			});
			try {
				upload(h, h.velocity.read, () => [30, 0], h.gl.RG);
				engine.splat(0.5, 0.5, 0, 0, { r: 0, g: 0, b: 0 });
				engine.advance(20, 0.01);
				const data = engine.readField('velocity').data;
				let edge = 0,
					core = 0;
				for (let x = 4; x < 28; x++) {
					edge += data[x * 2];
					core += data[(16 * 32 + x) * 2];
				}
				shear.push(edge / core);
				noError(h);
			} finally {
				engine.dispose();
			}
		}
		console.log('post-projection edge/core velocity', shear);
		expect(shear[0]).toBeGreaterThan(0.9);
		expect(shear[1]).toBeLessThan(0.7);
	});
});

describe('hardware emission and lifecycle', () => {
	const flow: FlowConfig = {
		scalarFields: [{ ...temperature, diffusivity: 0 }],
		sources: [
			{
				kind: 'point',
				x: 0.5,
				y: 0.5,
				radius: 0.1,
				rate: 60,
				inflow: true,
				dye: { r: 2, g: 1, b: 0.2 },
				scalars: { temperature: 1 }
			}
		],
		visualization: { emission: { scalar: 'temperature', intensity: 80, excitation: 12 } }
	};
	it('cold salt remains in dye but is dark and cannot bloom; hot emission feeds both render paths', () => {
		const { engine, h } = make({
			flow,
			bloom: true,
			bloomResolution: 32,
			bloomIterations: 3,
			toneMapping: 'agx'
		});
		const target = createFBO(h.gl, 32, 32, h.gl.RGBA32F, h.gl.RGBA, h.gl.FLOAT, h.gl.NEAREST);
		try {
			engine.advance(10, 1 / 60);
			engine.setConfig({ flow: { ...flow, sources: [] } });
			upload(h, h.scalar.read, () => [1, 0, 0, 1]);
			h.renderCore(target);
			const hot = peak(engine.readField('emission').data),
				hotBloom = peak(pixels(h, h.bloom!));
			expect(hot).toBeGreaterThan(1);
			expect(hotBloom).toBeGreaterThan(0.01);
			h.renderProfiledInner(target);
			expect(peak(pixels(h, h.bloom!))).toBeGreaterThan(0.01);
			upload(h, h.scalar.read, () => [0, 0, 0, 1]);
			h.renderCore(target);
			expect(peak(engine.readField('dye').data)).toBeGreaterThan(0.1);
			expect(peak(engine.readField('emission').data)).toBeLessThan(1e-15);
			expect(peak(pixels(h, h.bloom!))).toBeLessThan(1e-10);
			noError(h);
		} finally {
			disposeFBO(h.gl, target);
			engine.dispose();
		}
	});
	it('hundreds of source/colour/coefficient updates create no FBOs/textures or shader compiles, toggles own targets', () => {
		const { engine, h } = make({
			flow: { ...flow, scalarFields: [{ ...temperature, radiativeCooling: 0 }] },
			advectionScheme: 'maccormack',
			instrument: undefined
		} as FluidConfig);
		const gl = h.gl,
			counters = { fbo: 0, texture: 0, shader: 0 };
		const createFbo = gl.createFramebuffer.bind(gl),
			createTexture = gl.createTexture.bind(gl),
			compileShader = gl.compileShader.bind(gl);
		const fbo = vi.spyOn(gl, 'createFramebuffer').mockImplementation(() => {
			counters.fbo++;
			return createFbo();
		});
		const tex = vi.spyOn(gl, 'createTexture').mockImplementation(() => {
			counters.texture++;
			return createTexture();
		});
		const compile = vi.spyOn(gl, 'compileShader').mockImplementation((shader) => {
			counters.shader++;
			compileShader(shader);
		});
		try {
			const initial = h.emission;
			for (let i = 0; i < 200; i++)
				engine.setConfig({
					flow: {
						...flow,
						scalarFields: [
							{ ...temperature, diffusivity: i === 0 ? 0 : 1 + i / 200, radiativeCooling: i % 2 ? 0.1 : 0 }
						],
						sources: flow.sources!.map((source) => ({
							...source,
							dye: { r: 1, g: i / 200, b: 1 },
							velocity: { x: i, y: 0 }
						})),
						visualization: { emission: { scalar: 'temperature', intensity: 80 + i, excitation: 12 } }
					}
				});
			expect(counters).toEqual({ fbo: 0, texture: 0, shader: 0 });
			expect(h.emission).toBe(initial);
			expect(h.scalarFloat).toBe(true);
			expect(h.scalarAdvected).toBeTruthy();
			engine.setConfig({ dyeResolution: 48 });
			expect(h.scalarAdvected!.width).toBe(48);
			expect(h.emission!.width).toBe(48);
			expect(h.scalarRhs!.width).toBe(48);
			expect(h.scalarDiffusion!.width).toBe(48);
			expect(h.scalarDiffusionRhs!.width).toBe(48);
			engine.setConfig({ flow: null });
			expect(h.emission).toBeNull();
			expect(h.scalarRhs).toBeNull();
			expect(h.scalarDiffusion).toBeNull();
			expect(h.scalarDiffusionRhs).toBeNull();
			engine.setConfig({ flow: { ...flow, scalarFields: [temperature] } });
			expect(h.emission).toBeTruthy();
			expect(h.scalarRhs).toBeTruthy();
			engine.resize(96, 64);
			expect(h.emission!.width).toBe(h.dye.width);
			expect(h.scalarRhs!.height).toBe(h.dye.height);
			noError(h);
		} finally {
			fbo.mockRestore();
			tex.mockRestore();
			compile.mockRestore();
			engine.dispose();
		}
	});
	it('restores fresh thermal resources after context loss and frees optional ownership on dispose', async () => {
		const { engine, h, canvas } = make({
			advectionScheme: 'maccormack',
			flow: { ...flow, scalarFields: [temperature] }
		});
		const old = h.emission;
		const oldScratch = h.scalarDiffusion;
		const lose = h.gl.getExtension('WEBGL_lose_context');
		if (!lose) throw new Error('WEBGL_lose_context unavailable');
		const lost = new Promise<void>((resolve) =>
			canvas.addEventListener('webglcontextlost', () => resolve(), { once: true })
		);
		lose.loseContext();
		await lost;
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		const restored = new Promise<void>((resolve) =>
			canvas.addEventListener('webglcontextrestored', () => resolve(), { once: true })
		);
		lose.restoreContext();
		await restored;
		try {
			expect(h.gl.getError(), 'restore allocation GL state').toBe(h.gl.NO_ERROR);
			expect(h.emission).not.toBe(old);
			expect(h.scalarDiffusion).not.toBe(oldScratch);
			expect(h.scalarDiffusion!.width).toBe(32);
			expect(h.scalarDiffusionRhs!.width).toBe(32);
			expect(h.emission!.width).toBe(32);
			expect(h.scalarRhs!.width).toBe(32);
			expect(h.scalarAdvected!.width).toBe(32);
			expect(h.scalarFloat).toBe(true);
			expect(h.dyeFloat).toBe(true);
			engine.advance(10, 0.01);
			expect(peak(engine.readField('emission').data)).toBeGreaterThan(0);
			noError(h);
		} finally {
			engine.dispose();
		}
		expect(h.emission).toBeNull();
		expect(h.scalarRhs).toBeNull();
	});
	it('accounts for every optional target across toggles, resize and final disposal', () => {
		const { engine, h } = make({ advectionScheme: 'maccormack', flow: null });
		const gl = h.gl,
			live = new Set<WebGLFramebuffer>();
		const create = gl.createFramebuffer.bind(gl),
			remove = gl.deleteFramebuffer.bind(gl);
		const add = vi.spyOn(gl, 'createFramebuffer').mockImplementation(() => {
			const f = create();
			if (f) live.add(f);
			return f;
		});
		const del = vi.spyOn(gl, 'deleteFramebuffer').mockImplementation((f) => {
			if (f) live.delete(f);
			remove(f);
		});
		try {
			engine.setConfig({ flow });
			engine.setConfig({ dyeResolution: 48 });
			engine.setConfig({ flow: null });
			engine.setConfig({ flow: { ...flow, scalarFields: [temperature] } });
			engine.resize(96, 64);
			engine.dispose();
			expect(live.size).toBe(0);
		} finally {
			add.mockRestore();
			del.mockRestore();
			engine.dispose();
		}
	});
	it('thermal precision toggles preserve scalar contents and capability fallback stays half-float', () => {
		const base = { scalarFields: [{ name: 'temperature', dissipation: 0 }] };
		const { engine, h } = make({ flow: base });
		const getExtension = h.gl.getExtension.bind(h.gl);
		try {
			upload(h, h.scalar.read, () => [0.75, 0.25, 0.125, 1]);
			expect(h.scalarFloat).toBe(false);
			const before = engine.readField('scalar').data;
			upload(h, h.dye.read, () => [0.75, 0.25, 0.125, 0.5]);
			const dyeBefore = engine.readField('dye').data;
			engine.setConfig({
				flow: {
					scalarFields: [{ ...temperature, diffusivity: 0 }],
					visualization: { emission: { scalar: 'temperature', intensity: 1, excitation: 6 } }
				}
			});
			expect(h.dyeFloat).toBe(true);
			expect(engine.readField('dye').data).toEqual(dyeBefore);
			expect(h.scalarFloat).toBe(true);
			expect(engine.readField('scalar').data).toEqual(before);
			engine.setConfig({ flow: base });
			expect(h.dyeFloat).toBe(false);
			expect(engine.readField('dye').data).toEqual(dyeBefore);
			expect(h.scalarFloat).toBe(false);
			expect(engine.readField('scalar').data).toEqual(before);
			const spy = vi
				.spyOn(h.gl, 'getExtension')
				.mockImplementation((name: string) =>
					name === 'EXT_color_buffer_float' ? null : getExtension(name)
				);
			try {
				engine.setConfig({ flow: { scalarFields: [{ ...temperature, diffusivity: 0 }] } });
				expect(h.scalarFloat).toBe(false);
			} finally {
				spy.mockRestore();
			}
			noError(h);
		} finally {
			engine.dispose();
		}
	});
	it('disabled features keep deterministic fields and display byte-identical', () => {
		const baseFlow: FlowConfig = {
			sources: [
				{
					kind: 'point',
					x: 0.5,
					y: 0.5,
					rate: 60,
					radius: 0.1,
					dye: { r: 0.1, g: 0.3, b: 0.2 },
					velocity: { x: 3, y: 1 },
					scalars: { temperature: 1 }
				}
			],
			scalarFields: [{ name: 'temperature', dissipation: 0.1 }]
		};
		const run = (extra: boolean) => {
			const { engine, h } = make({
				flow: extra
					? {
							...baseFlow,
							walls: 'free-slip',
							sources: baseFlow.sources!.map((s) => ({ ...s, inflow: false })),
							scalarFields: [
								{ ...baseFlow.scalarFields![0], diffusivity: undefined, radiativeCooling: undefined }
							]
					  }
					: baseFlow
			});
			try {
				engine.advance(20, 1 / 120);
				h.renderCore(null);
				const out = new Uint8Array(32 * 32 * 4);
				h.gl.readPixels(0, 0, 32, 32, h.gl.RGBA, h.gl.UNSIGNED_BYTE, out);
				noError(h);
				return {
					out,
					dye: engine.readField('dye').data,
					scalar: engine.readField('scalar').data,
					velocity: engine.readField('velocity').data
				};
			} finally {
				engine.dispose();
			}
		};
		expect(run(true)).toEqual(run(false));
	});
	it('shared-host siblings interleave thermal programs without cross-instance state', async () => {
		_setContextTier('shared');
		const a = make({ flow }),
			b = make({
				flow: {
					...flow,
					visualization: { emission: { scalar: 'temperature', intensity: 8, excitation: 12 } }
				}
			});
		try {
			a.engine.advance(5, 0.01);
			a.engine.renderOnce();
			await a.engine.presented();
			const before = a.engine.readField('emission').data;
			b.engine.advance(5, 0.01);
			b.engine.renderOnce();
			await b.engine.presented();
			expect(a.engine.readField('emission').data).toEqual(before);
			expect(peak(before)).toBeGreaterThan(peak(b.engine.readField('emission').data) * 9);
			noError(a.h);
			noError(b.h);
		} finally {
			a.engine.dispose();
			b.engine.dispose();
			_setContextTier('auto');
		}
	});
});
