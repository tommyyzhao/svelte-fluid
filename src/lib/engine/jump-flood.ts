/*
 * svelte-fluid — GPU jump-flood signed distance field (ADR-0084).
 *
 * Turns a 0–1 coverage texture into a signed distance texture measured in
 * texels of that texture (negative inside). Mask edges then anti-alias over
 * exactly one device pixel at any DPR: `clamp(0.5 - d * devicePxPerTexel, 0, 1)`.
 *
 * WebGL2 only: seeds need a renderable RG16F target and the distance must be
 * bilinearly filterable R16F. WebGL1 keeps the coverage-texture path.
 */

import { compileShader, createDoubleFBO, createFBO, disposeDoubleFBO, disposeFBO, makeProgram } from './gl-utils.js';
import type { BlitFn, GL, ProgramWrap } from './gl-utils.js';
import type { DoubleFBO, ExtInfo, FBO } from './types.js';
import { jumpFloodDistanceShader, jumpFloodSeedShader, jumpFloodStepShader } from './shaders.js';

/** Seed sentinel: any |x| above SEED_EMPTY / 2 means "no seed yet". */
export const SEED_EMPTY = 1.0e4;

/**
 * Jump lengths for an N-pass JFA over a `w`×`h` grid: N/2, N/4, …, 1 with
 * N = next power of two ≥ max(w, h), so log2(N) passes. `refine` appends one
 * extra step-1 pass (JFA+1), which removes most residual Voronoi errors.
 */
export function jumpFloodSteps(w: number, h: number, refine = true): number[] {
	const steps: number[] = [];
	const n = 2 ** Math.ceil(Math.log2(Math.max(1, w, h)));
	for (let s = n / 2; s >= 1; s /= 2) steps.push(s);
	if (refine) steps.push(1);
	return steps;
}

/**
 * Sub-texel offset from a boundary texel's centre to the 0.5 coverage
 * crossing (mirror of `jumpFloodSeedShader`). Each axis uses the steeper
 * one-sided difference, i.e. the side the crossing lies on, so a hard 0/1
 * step resolves to the half-texel edge instead of the central-difference
 * full-texel overshoot. Clamped to one texel.
 */
export function seedOffset(c: number, l: number, r: number, b: number, t: number): [number, number] {
	const gx = Math.abs(r - c) > Math.abs(c - l) ? r - c : c - l;
	const gy = Math.abs(t - c) > Math.abs(c - b) ? t - c : c - b;
	const g2 = gx * gx + gy * gy;
	if (g2 < 1e-6) return [0, 0];
	let ox = (-(c - 0.5) * gx) / g2;
	let oy = (-(c - 0.5) * gy) / g2;
	const len = Math.hypot(ox, oy);
	if (len > 1) {
		ox /= len;
		oy /= len;
	}
	return [ox, oy];
}

/** True when the texel's 4-neighbourhood straddles the 0.5 iso-line. */
export function isBoundary(c: number, l: number, r: number, b: number, t: number): boolean {
	const inside = c >= 0.5;
	return (l >= 0.5) !== inside || (r >= 0.5) !== inside || (b >= 0.5) !== inside || (t >= 0.5) !== inside;
}

export function supportsJumpFlood(ext: ExtInfo | undefined): boolean {
	return !!ext?.isWebGL2;
}

/** Compiles a fragment through a shared cache that owns the result (gl-host, ADR-0088). */
export type JumpFloodProgramFactory = (name: string, fragment: string) => ProgramWrap;

/**
 * Owns the three JFA programs and a reusable seed ping-pong pair. One
 * instance serves every mask of an engine; outputs are owned by the caller
 * and passed back in so same-size rebuilds reuse their framebuffer. Given a
 * program factory instead of a vertex shader, the programs come from (and
 * stay owned by) that cache.
 */
export class JumpFlood {
	private seed: ProgramWrap;
	private step: ProgramWrap;
	private distance: ProgramWrap;
	private shaders: WebGLShader[] = [];
	private ownsPrograms: boolean;
	private seeds: DoubleFBO | null = null;

	constructor(
		private gl: GL,
		private ext: ExtInfo,
		programs: WebGLShader | JumpFloodProgramFactory,
		private blit: BlitFn
	) {
		const sources = { 'jfa-seed': jumpFloodSeedShader, 'jfa-step': jumpFloodStepShader, 'jfa-distance': jumpFloodDistanceShader };
		this.ownsPrograms = typeof programs !== 'function';
		if (typeof programs === 'function') {
			[this.seed, this.step, this.distance] = Object.entries(sources).map(([name, src]) => programs(name, src));
			return;
		}
		this.shaders = Object.values(sources).map((src) => compileShader(gl, gl.FRAGMENT_SHADER, src));
		[this.seed, this.step, this.distance] = this.shaders.map((fs) => makeProgram(gl, programs, fs));
	}

	/** Build (or rebuild into `out`) the SDF of a `w`×`h` coverage texture. */
	build(source: WebGLTexture, w: number, h: number, out: FBO | null, refine = true): FBO {
		const gl = this.gl;
		const half = this.ext.halfFloatTexType;
		const rg = this.ext.formatRG;
		const r = this.ext.formatR;
		if (!this.seeds || this.seeds.width !== w || this.seeds.height !== h) {
			disposeDoubleFBO(gl, this.seeds ?? undefined);
			this.seeds = createDoubleFBO(gl, w, h, rg.internalFormat, rg.format, half, gl.NEAREST);
		}
		if (!out || out.width !== w || out.height !== h) {
			disposeFBO(gl, out ?? undefined);
			out = createFBO(gl, w, h, r.internalFormat, r.format, half, gl.LINEAR);
		}
		gl.disable(gl.BLEND);
		const seeds = this.seeds;

		this.seed.bind();
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, source);
		gl.uniform1i(this.seed.uniforms.uSource, 1);
		gl.uniform2f(this.seed.uniforms.uTexel, 1 / w, 1 / h);
		this.blit(seeds.write);
		seeds.swap();

		this.step.bind();
		gl.uniform2f(this.step.uniforms.uTexel, 1 / w, 1 / h);
		for (const s of jumpFloodSteps(w, h, refine)) {
			gl.uniform1i(this.step.uniforms.uSeeds, seeds.read.attach(0));
			gl.uniform1f(this.step.uniforms.uStep, s);
			this.blit(seeds.write);
			seeds.swap();
		}

		this.distance.bind();
		gl.uniform1i(this.distance.uniforms.uSeeds, seeds.read.attach(0));
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, source);
		gl.uniform1i(this.distance.uniforms.uSource, 1);
		this.blit(out);
		return out;
	}

	/** Seed ping-pong bytes (RG16F × 2), for the profiler's memory estimate. */
	seedBytes(): number {
		return this.seeds ? this.seeds.width * this.seeds.height * 8 : 0;
	}

	dispose(): void {
		const gl = this.gl;
		disposeDoubleFBO(gl, this.seeds ?? undefined);
		this.seeds = null;
		if (this.ownsPrograms) for (const p of [this.seed, this.step, this.distance]) gl.deleteProgram(p.program);
		for (const s of this.shaders) gl.deleteShader(s);
		this.shaders = [];
	}
}
