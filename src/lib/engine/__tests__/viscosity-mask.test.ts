import { describe, expect, it } from 'vitest';
import baselineJson from '../__benches__/viscosity-mask.b66d623.json?raw';
const baseline: {
	commit: string;
	sourceSha256: string;
	viscosityShader: string;
	viscosityJacobi2Shader: string;
	sha256: Record<string, string>;
} = JSON.parse(baselineJson);

it('pins the exact b66d623 frozen viscosity GLSL', async () => {
	expect(baseline.commit).toBe('b66d623d2746294934f4119dd289233869b85886');
	expect(baseline.sourceSha256).toBe(
		'1488f445ce2c9665824d9f0d1bd959bf1cb4712be84e893f5fe5b412b5f12120'
	);
	for (const [name, sha] of [
		[
			'viscosityShader',
			'4e581d7b8c0332f2f15429a5b3c220cddf7a9cd3764f1ba00029095f71cbd8d3'
		],
		[
			'viscosityJacobi2Shader',
			'996a874c70d2e1f1d75b78a1900027bafa568791c2c03a342d35f5f14c076635'
		]
	] as const) {
		const digest = await crypto.subtle.digest(
			'SHA-256',
			new TextEncoder().encode(baseline[name])
		);
		expect(
			Array.from(new Uint8Array(digest), (byte) =>
				byte.toString(16).padStart(2, '0')
			).join('')
		).toBe(sha);
		expect(baseline.sha256[name]).toBe(sha);
	}
});

import { DEFAULTS, FluidEngine, resolveConfig } from '../FluidEngine.js';
import { viscosityShader, viscosityJacobi2Shader } from '../shaders.js';
import type { FluidConfig } from '../types.js';
import type { ProgramWrap } from '../gl-utils.js';
import type { DoubleFBO, FBO } from '../internal-types.js';

type Uniforms = Record<string, WebGLUniformLocation | null>;
interface Harness {
	config: typeof DEFAULTS;
	gl: unknown;
	velocity: DoubleFBO;
	velocitySource: FBO;
	copyProgram: ProgramWrap;
	viscosityProgram: ProgramWrap;
	viscosityJacobi2Program: ProgramWrap;
	stickyFallbackTexture: unknown;
	maskTexture: unknown;
	obstructionMaskTexture: unknown;
	bufferWidth(): number;
	bufferHeight(): number;
	blit(target: FBO): void;
	applyViscosity(dt: number): void;
}

// Real applyViscosity + mask binders, fake GL only: catches shared-program stale
// gates and sampler aliasing without pretending to execute GLSL on the CPU.
function harness() {
	const h = Object.create(FluidEngine.prototype) as Harness;
	let current = '',
		unit = 0;
	const values = new Map<string, number>();
	const textures = new Map<number, unknown>();
	const draws: Array<{ program: string; mask: number }> = [];
	const location = (name: string) => name as unknown as WebGLUniformLocation;
	const program = (name: string, source: string) =>
		({
			bind: () => {
				current = name;
			},
			uniforms: Object.fromEntries(
				[
					...source.matchAll(
						/uniform\s+(?:(?:highp|mediump|lowp)\s+)?\w+\s+(\w+)/g
					)
				].map((m) => [m[1], location(`${name}.${m[1]}`)])
			) as Uniforms
		} as ProgramWrap);
	h.gl = {
		TEXTURE0: 0,
		TEXTURE_2D: 1,
		activeTexture: (u: number) => {
			unit = u;
		},
		bindTexture: (_: number, texture: unknown) => {
			textures.set(unit, texture);
		},
		uniform1i: (key: WebGLUniformLocation, value: number) => {
			values.set(String(key), value);
		},
		uniform1f: (key: WebGLUniformLocation, value: number) => {
			values.set(String(key), value);
		},
		uniform2f: () => {},
		uniform4f: () => {}
	};
	const fbo = (name: string) =>
		({
			attach: (u: number) => {
				textures.set(u, name);
				return u;
			}
		} as FBO);
	h.velocity = {
		width: 128,
		height: 128,
		texelSizeX: 1 / 128,
		texelSizeY: 1 / 128,
		read: fbo('read'),
		write: fbo('write'),
		swap() {
			[this.read, this.write] = [this.write, this.read];
		}
	};
	h.velocitySource = fbo('source');
	h.stickyFallbackTexture = 'fallback';
	h.maskTexture = 'svg';
	h.obstructionMaskTexture = null;
	h.bufferWidth = h.bufferHeight = () => 128;
	h.copyProgram = program('copy', 'uniform sampler2D uTexture;');
	h.viscosityProgram = program('single', viscosityShader);
	h.viscosityJacobi2Program = program('pair', viscosityJacobi2Shader);
	h.blit = () => {
		if (current !== 'copy') {
			for (const [sampler, expectedUnit] of [
				['uVelocity', 0],
				['uSource', 1],
				['uSolidMask', 2],
				['uSolidNeighbors', 3],
				['uMaskTexture', 4],
				['uObstructionMask', 5]
			] as const) {
				expect(values.get(`${current}.${sampler}`)).toBe(expectedUnit);
				expect(textures.get(expectedUnit)).toBeDefined();
			}
		}
		draws.push({
			program: current,
			mask: values.get(`${current}.uApplyInlineMask`) ?? 0
		});
	};
	return {
		h,
		draws,
		run(patch: FluidConfig) {
			draws.length = 0;
			h.config = resolveConfig(
				{ viscosity: 0.25, flow: { walls: 'no-slip' }, ...patch },
				DEFAULTS
			);
			h.applyViscosity(1 / 60);
			return draws.filter((d) => d.program !== 'copy');
		}
	};
}

const circle = { type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 } as const;
describe('viscosity final coverage', () => {
	it.each([1, 2, 3, 4, 8, 9])(
		'crops only final output for %i no-slip iterations',
		(iterations) => {
			const { run } = harness();
			const draws = run({
				viscosityIterations: iterations,
				containerShape: circle
			});
			expect(draws.map((d) => d.program)).toEqual([
				...Array(Math.floor(iterations / 2)).fill('pair'),
				...(iterations % 2 ? ['single'] : [])
			]);
			expect(draws.map((d) => d.mask)).toEqual([
				...Array(draws.length - 1).fill(0),
				1
			]);
		}
	);
	it('single path above crossover crops once, including free-slip', () => {
		const { h, run } = harness();
		h.velocity.width = h.velocity.height = 576;
		for (const walls of ['no-slip', 'free-slip'] as const) {
			const draws = run({
				viscosityIterations: 8,
				containerShape: circle,
				flow: { walls }
			});
			expect(draws.map((d) => d.program)).toEqual(Array(8).fill('single'));
			expect(draws.map((d) => d.mask)).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
		}
	});
	it('rebinds hot masks and resets shared-program gates on every solve', () => {
		const { h, run } = harness();
		for (const patch of [
			{ containerShape: circle },
			{ containerShape: { type: 'svgPath', d: 'M0 0H100V100H0Z' } },
			{ containerShape: circle, openBoundary: true },
			{ containerShape: undefined }
		] as FluidConfig[]) {
			const active = !!patch.containerShape && !patch.openBoundary;
			for (const viscosityIterations of [8, 3, 2]) {
				const draws = run({ ...patch, viscosityIterations });
				expect(draws.filter((d) => d.mask === 1)).toHaveLength(active ? 1 : 0);
			}
		}
		h.obstructionMaskTexture = 'obstruction';
		expect(run({ viscosityIterations: 2, openBoundary: true })[0].mask).toBe(1);
		h.maskTexture = null;
		expect(
			run({
				viscosityIterations: 2,
				containerShape: { type: 'svgPath', d: 'M0 0H100V100H0Z' }
			})[0].mask
		).toBe(0);
	});
	it('zero viscosity/iterations draw nothing', () => {
		const { run, draws } = harness();
		for (const patch of [{ viscosity: 0 }, { viscosityIterations: 0 }]) {
			run(patch);
			expect(draws).toHaveLength(0);
		}
	});
	it('actual GLSL crops both no-slip outputs, never the paired inner iterate', () => {
		const single = viscosityShader.slice(
			viscosityShader.indexOf('if (uNoSlip > 0.5)')
		);
		expect(single).toContain(
			'gl_FragColor = vec4(clamp(velocity,-1000.0,1000.0),0.0,1.0) * im;'
		);
		// Existing free-slip output remains byte-for-byte unchanged.
		expect(single).toContain(
			'gl_FragColor = vec4(clamp(velocity, -1000.0, 1000.0), 0.0, 1.0) * im;'
		);
		const inner = viscosityJacobi2Shader.slice(
			viscosityJacobi2Shader.indexOf('vec2 inner('),
			viscosityJacobi2Shader.indexOf('void main ()')
		);
		expect(inner).not.toMatch(/inlineMask|\bim\b/);
		const outer = viscosityJacobi2Shader.slice(
			viscosityJacobi2Shader.indexOf('void main ()')
		);
		expect(outer).toContain('float im = inlineMaskValue(vUv);');
		expect(outer.match(/\* im/g)).toHaveLength(2);
	});
});
