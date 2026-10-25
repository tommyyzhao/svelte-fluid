import { describe, expect, it } from 'vitest';
import { FluidEngine } from '../FluidEngine.js';
import type { DoubleFBO } from '../internal-types.js';
import { compileShader, makeProgram, type ProgramWrap } from '../gl-utils.js';
import { baseVertexShader, thermalAdvectionShader } from '../shaders.js';
import { baselineThermalAdvectionShader } from './fixtures/thermal-advection-b66d623.js';
import { renderer } from './renderer.js';

// Predeclared: an exact zero source must not gain any transported concentration.
const LEAK_TOLERANCE = 0;
interface Harness {
	gl: WebGL2RenderingContext;
	scalar: DoubleFBO;
	dye: DoubleFBO;
	velocity: DoubleFBO;
	solidMaskTexture: WebGLTexture | null;
	solidMaskW: number;
	solidMaskH: number;
	thermalAdvectionProgram: ProgramWrap;
	advectThermalScalar(dt: number, scalar?: DoubleFBO): void;
}
function make(
	kind: 'scalar' | 'absorption',
	scheme: 'semilagrangian' | 'maccormack',
	wall: number | null
) {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 32;
	const engine = new FluidEngine({
		canvas,
		autoStart: false,
		config: {
			seed: 704,
			initialSplatCount: 0,
			pointerInput: false,
			simResolution: 128,
			dyeResolution: 32,
			curl: 0,
			densityDissipation: 0,
			velocityDissipation: 0,
			shading: false,
			bloom: false,
			sunrays: false,
			advectionScheme: scheme,
			obstructions:
				wall === null
					? []
					: [
							{
								d: `M${wall} 0H${wall + 1}V512H${wall}Z`,
								viewBox: [0, 0, 512, 512],
								fit: 'fill'
							}
					  ],
			flow:
				kind === 'scalar'
					? {
							scalarFields: [
								{
									name: 'temperature',
									dissipation: 0,
									diffusivity: 0,
									wall: 'insulated'
								}
							]
					  }
					: {
							visualization: {
								absorption: {
									absorbance: [
										{ r: 1, g: 0, b: 0 },
										{ r: 0, g: 1, b: 0 },
										{ r: 0, g: 0, b: 1 }
									]
								}
							}
					  }
		}
	});
	return { engine, h: engine as unknown as Harness };
}
function upload(
	h: Harness,
	target: DoubleFBO,
	fn: (x: number, y: number) => number[],
	channels: number
) {
	const gl = h.gl,
		fbo = target.read;
	const data = new Float32Array(fbo.width * fbo.height * channels);
	for (let y = 0; y < fbo.height; y++)
		for (let x = 0; x < fbo.width; x++)
			data.set(fn(x, y), (y * fbo.width + x) * channels);
	gl.bindTexture(gl.TEXTURE_2D, fbo.texture);
	gl.texSubImage2D(
		gl.TEXTURE_2D,
		0,
		0,
		0,
		fbo.width,
		fbo.height,
		channels === 2 ? gl.RG : gl.RGBA,
		gl.FLOAT,
		data
	);
}
function assertWallReadback(h: Harness, column: number) {
	const gl = h.gl,
		fbo = gl.createFramebuffer()!;
	try {
		expect([h.solidMaskW, h.solidMaskH]).toEqual([512, 512]);
		expect(h.solidMaskTexture).not.toBeNull();
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D,
			h.solidMaskTexture,
			0
		);
		expect(gl.checkFramebufferStatus(gl.FRAMEBUFFER)).toBe(
			gl.FRAMEBUFFER_COMPLETE
		);
		const data = new Uint8Array(512 * 512);
		gl.readPixels(0, 0, 512, 512, gl.RED, gl.UNSIGNED_BYTE, data);
		for (let y = 0; y < 512; y++) {
			expect(data[y * 512 + column]).toBe(255);
			expect(data[y * 512 + column - 1]).toBe(0);
			expect(data[y * 512 + column + 1]).toBe(0);
		}
		expect(gl.getError(), renderer).toBe(gl.NO_ERROR);
	} finally {
		gl.deleteFramebuffer(fbo);
	}
}
function replaceProgram(h: Harness, source: string) {
	const gl = h.gl;
	const vs = compileShader(gl, gl.VERTEX_SHADER, baseVertexShader);
	const fs = compileShader(gl, gl.FRAGMENT_SHADER, source);
	const program = makeProgram(gl, vs, fs);
	const original = h.thermalAdvectionProgram;
	h.thermalAdvectionProgram = program;
	return () => {
		h.thermalAdvectionProgram = original;
		gl.deleteProgram(program.program);
		gl.deleteShader(vs);
		gl.deleteShader(fs);
	};
}

describe('hardware thermal thin raster walls (authored gate; CPU is not hardware evidence)', () => {
	for (const kind of ['scalar', 'absorption'] as const)
		for (const scheme of ['semilagrangian', 'maccormack'] as const) {
			it(`${kind}/${scheme}: forward and donor paths cannot tunnel through an actual one-mask-pixel wall`, () => {
				for (const [column, speed] of [
					[140, -240],
					[144, -60]
				]) {
					const { engine, h } = make(kind, scheme, column);
					try {
						assertWallReadback(h, column);
						const target = kind === 'scalar' ? h.scalar : h.dye;
						// Match supported UNORM8 prescribed velocity, including its y residual.
						const vy = ((128 / 255) * 2 - 1) * 240;
						upload(h, h.velocity, () => [speed, vy], 2);
						upload(
							h,
							target,
							(x) => [(x + 0.5) / 32 > (column + 1) / 512 ? 1 : 0, 0, 0, 0.25],
							4
						);
						h.advectThermalScalar(1 / 60, target);
						const values = engine.readField(
							kind === 'scalar' ? 'scalar' : 'dye'
						).data;
						expect(values[(8 * 32 + 8) * 4], renderer).toBeLessThanOrEqual(
							LEAK_TOLERANCE
						);
						expect(glError(h), renderer).toBe(0);
					} finally {
						engine.dispose();
					}
				}
			});
			it(`${kind}/${scheme}: no-mask results equal baseline bytes, including boundary/capped paths`, () => {
				const run = (baseline: boolean, speed: number) => {
					const { engine, h } = make(kind, scheme, null);
					const restore = baseline
						? replaceProgram(h, baselineThermalAdvectionShader)
						: () => {};
					try {
						const target = kind === 'scalar' ? h.scalar : h.dye;
						upload(h, h.velocity, () => [speed, 3.25], 2);
						upload(
							h,
							target,
							(x, y) => [(x + y) / 64, x / 32, y / 32, 0.25],
							4
						);
						h.advectThermalScalar(1 / 60, target);
						return engine.readField(kind === 'scalar' ? 'scalar' : 'dye').data;
					} finally {
						restore();
						engine.dispose();
					}
				};
				for (const speed of [-240, -48000, 180])
					expect(run(false, speed)).toEqual(run(true, speed));
			});
		}
	it('actual GLSL rejects independent reverse paths and unresolved capped travel', () => {
		for (const column of [124, 140]) {
			const { engine, h } = make('scalar', 'semilagrangian', column);
			const body = thermalAdvectionShader.slice(
				0,
				thermalAdvectionShader.indexOf('    void main ()')
			);
			const expression =
				column === 124
					? 'segmentClear(vec2(136.0/512.0,0.5),vec2(120.0/512.0,0.5))'
					: 'segmentClear(vec2(136.0/512.0,0.5),vec2(152.0/512.0,0.5))';
			const restore = replaceProgram(
				h,
				`${body} void main () { gl_FragColor = vec4(${expression} ? 1.0 : 0.0); }`
			);
			try {
				assertWallReadback(h, column);
				h.advectThermalScalar(1 / 60, h.scalar);
				expect(Math.max(...engine.readField('scalar').data)).toBe(0);
				expect(glError(h), renderer).toBe(0);
			} finally {
				restore();
				engine.dispose();
			}
		}
		const { engine, h } = make('scalar', 'semilagrangian', 140);
		try {
			assertWallReadback(h, 140);
			upload(h, h.velocity, () => [-48000, 0], 2);
			upload(h, h.scalar, (x) => [x >= 9 ? 1 : 0, 0, 0, 1], 4);
			h.advectThermalScalar(1 / 60, h.scalar);
			expect(engine.readField('scalar').data[(8 * 32 + 8) * 4]).toBe(0);
			expect(glError(h), renderer).toBe(0);
		} finally {
			engine.dispose();
		}
	});
	it('actual GLSL helper rejects the long-diagonal Float32 exact-corner contact', () => {
		const { engine, h } = make('scalar', 'semilagrangian', 140);
		const gl = h.gl;
		const body = thermalAdvectionShader.slice(
			0,
			thermalAdvectionShader.indexOf('    void main ()')
		);
		const restore = replaceProgram(
			h,
			`${body}
		void main () { gl_FragColor = vec4(segmentClear(vec2(8.0/512.0,1.0-8.0/512.0),vec2(11.0/512.0,1.0-188.0/512.0)) ? 1.0 : 0.0); }`
		);
		try {
			// Isolated cell at the exact corner, uploaded/read back on the actual bound mask.
			const mask = new Uint8Array(512 * 512);
			mask[128 * 512 + 9] = 255;
			gl.bindTexture(gl.TEXTURE_2D, h.solidMaskTexture);
			gl.texSubImage2D(
				gl.TEXTURE_2D,
				0,
				0,
				0,
				512,
				512,
				gl.RED,
				gl.UNSIGNED_BYTE,
				mask
			);
			const fbo = gl.createFramebuffer()!;
			try {
				gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
				gl.framebufferTexture2D(
					gl.FRAMEBUFFER,
					gl.COLOR_ATTACHMENT0,
					gl.TEXTURE_2D,
					h.solidMaskTexture,
					0
				);
				const value = new Uint8Array(1);
				gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
				gl.readPixels(9, 128, 1, 1, gl.RED, gl.UNSIGNED_BYTE, value);
				gl.pixelStorei(gl.PACK_ALIGNMENT, 4);
				expect(value[0]).toBe(255);
			} finally {
				gl.deleteFramebuffer(fbo);
			}
			h.advectThermalScalar(1 / 60, h.scalar);
			expect(Math.max(...engine.readField('scalar').data)).toBe(0);
			expect(glError(h), renderer).toBe(0);
		} finally {
			restore();
			engine.dispose();
		}
	});
	it('reports baseline/candidate A/B cost without an inferred performance threshold', () => {
		const report: unknown[] = [];
		for (const scheme of ['semilagrangian', 'maccormack'] as const)
			for (const [wall, speed] of [
				[null, 0],
				[null, -240],
				[140, 0],
				[140, -240],
				[140, 3000]
			] as const) {
				const { engine, h } = make('scalar', scheme, wall);
				const workload = { wall, speed };
				try {
					if (wall !== null) assertWallReadback(h, wall);
					upload(h, h.velocity, () => [speed, 0], 2);
					upload(h, h.scalar, () => [1, 0, 0, 1], 4);
					// Alternate order to expose, not hide, warm-up/order effects. gl.finish includes GPU work.
					for (const baseline of [true, false, false, true]) {
						const restore = baseline
							? replaceProgram(h, baselineThermalAdvectionShader)
							: () => {};
						try {
							for (let i = 0; i < 3; i++)
								h.advectThermalScalar(1 / 60, h.scalar);
							h.gl.finish();
							const start = performance.now();
							for (let i = 0; i < 20; i++)
								h.advectThermalScalar(1 / 60, h.scalar);
							h.gl.finish();
							report.push({
								renderer,
								scheme,
								...workload,
								baseline,
								steps: 20,
								elapsedMs: performance.now() - start
							});
						} finally {
							restore();
						}
					}
					expect(glError(h), renderer).toBe(0);
				} finally {
					engine.dispose();
				}
			}
		console.log('thermal thin-wall A/B report-only', JSON.stringify(report));
	});
});
function glError(h: Harness) {
	return h.gl.getError();
}
