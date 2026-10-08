/* Measurement only; opt in with SVELTE_FLUID_GPU_BENCH=1. Protocol is fixed in gpu-budget.md. */
import { commands } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { FluidEngine } from '../FluidEngine.js';
import {
	compileShader,
	createFBO,
	disposeFBO,
	makeProgram,
	type ProgramWrap
} from '../gl-utils.js';
import { baseVertexShader } from '../shaders.js';
import { PRESETS } from '../../presets/registry.js';
import type {
	DoubleFBO,
	ExtInfo,
	FBO,
	ResolvedConfig
} from '../internal-types.js';

const TRAIN = ['Plasma', 'Karman', 'InkInWater', 'Aurora', 'CircularFluid'];
const TIMES = [181, 196, 211, 226, 241];
const COUNTS = Array.from({ length: 11 }, (_, i) => 2 * i);
const OUT =
	import.meta.env.SVELTE_FLUID_GPU_BENCH_OUT || '/tmp/E1-r4-diag.json';
type Harness = {
	gl: WebGL2RenderingContext;
	ext: ExtInfo;
	config: ResolvedConfig;
	velocity: DoubleFBO;
	pressure: DoubleFBO;
	divergence: FBO;
	clearProgram: ProgramWrap;
	divergenceProgram: ProgramWrap;
	performancePressureIterations: number;
	blit(target: FBO | null): void;
	withGl(action: () => void): void;
	simulateFrame(dt: number): void;
	projectVelocity(): void;
	flowOpenEdges(): number[];
	bindStickyMask(): void;
	bindSolidMaskUniforms(
		uniforms: ProgramWrap['uniforms'],
		unit: number,
		neighborUnit: number
	): void;
};
type Snapshot = {
	frame: number;
	velocity: Float32Array;
	divergence: Float32Array;
	previousPressure: Float32Array;
	decayedPressure: Float32Array;
};
type Output = {
	velocity: Float32Array;
	pressure: Float32Array;
	residual: Float32Array;
	divergence: Float32Array;
	fluid: Uint8Array;
};
type Stats = { rms: number; max: number };
const fp16Ulp = (v: number) =>
	Math.max(2 ** -24, 2 ** (Math.floor(Math.log2(Math.abs(v))) - 10));
const median = (values: number[]) => [...values].sort((a, b) => a - b)[2];
function stats(
	data: ArrayLike<number>,
	fluid: Uint8Array,
	components = 1
): Stats {
	let sum = 0,
		max = 0,
		n = 0;
	for (let i = 0; i < fluid.length; i++)
		if (fluid[i])
			for (let c = 0; c < components; c++) {
				const v = data[i * components + c];
				if (!Number.isFinite(v)) throw new Error('Non-finite diagnostic field');
				sum += v * v;
				max = Math.max(max, Math.abs(v));
				n++;
			}
	expect(n).toBeGreaterThan(0);
	return { rms: Math.sqrt(sum / n), max };
}
function difference(a: Float32Array, b: Float32Array): Float32Array {
	expect(a.length).toBe(b.length);
	return a.map((v, i) => v - b[i]);
}
function errors(a: Output, ref: Output) {
	return {
		residual: stats(a.residual, a.fluid),
		divergence: stats(a.divergence, a.fluid),
		velocity: stats(difference(a.velocity, ref.velocity), a.fluid, 2),
		pressure: stats(difference(a.pressure, ref.pressure), a.fluid),
		maxVelocityUlps: 0
	};
}
function maxUlps(a: Output, ref: Output): number {
	let max = 0;
	for (let i = 0; i < a.fluid.length; i++)
		if (a.fluid[i])
			for (let c = 0; c < 2; c++) {
				const j = i * 2 + c;
				max = Math.max(
					max,
					Math.abs(a.velocity[j] - ref.velocity[j]) / fp16Ulp(ref.velocity[j])
				);
			}
	return max;
}
function read(gl: WebGL2RenderingContext, target: FBO): Float32Array {
	const data = new Float32Array(target.width * target.height * 4);
	gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
	gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.FLOAT, data);
	expect(gl.getError()).toBe(gl.NO_ERROR);
	return data;
}
function upload(
	gl: WebGL2RenderingContext,
	target: FBO,
	format: number,
	data: Float32Array
) {
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, target.texture);
	gl.texSubImage2D(
		gl.TEXTURE_2D,
		0,
		0,
		0,
		target.width,
		target.height,
		format,
		gl.FLOAT,
		data
	);
	expect(gl.getError()).toBe(gl.NO_ERROR);
}
// The fixed point is the production single-Jacobi stencil, NOT D(G(p)); the
// collocated centered divergence/gradient composition is a different operator.
const residualShader = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform sampler2D uStickyMask;
uniform float uStickyPressure;
uniform sampler2D uSolidMask;
uniform sampler2D uSolidNeighbors;
uniform float uHasSolidMask;
void main() {
	float C = texture2D(uPressure, vUv).r;
	float L = texture2D(uPressure, vL).r;
	float R = texture2D(uPressure, vR).r;
	float T = texture2D(uPressure, vT).r;
	float B = texture2D(uPressure, vB).r;
	if (uHasSolidMask >= 0.5) {
		if (texture2D(uSolidMask, vec2(clamp(vUv.x, 0.0, 1.0), 1.0 - clamp(vUv.y, 0.0, 1.0))).r > 0.5) {
			gl_FragColor = vec4(0.0); return;
		}
		vec4 nb = texture2D(uSolidNeighbors, vUv);
		if (nb.x > 0.5) L = C;
		if (nb.y > 0.5) R = C;
		if (nb.z > 0.5) T = C;
		if (nb.w > 0.5) B = C;
	}
	float sticky = texture2D(uStickyMask, vec2(vUv.x, 1.0 - vUv.y)).r * uStickyPressure;
	gl_FragColor = vec4(L + R + B + T - 4.0 * C - texture2D(uDivergence, vUv).r + 4.0 * sticky, 1.0, 0.0, 1.0);
}`;

const rows: Record<string, unknown>[] = [];
let renderer = '';
async function flush() {
	const write = (
		commands as unknown as {
			writeBenchJson(path: string, content: string): Promise<void>;
		}
	).writeBenchJson;
	await write(
		OUT,
		JSON.stringify(
			{
				baseline: 'e104fcd',
				renderer,
				browser: navigator.userAgent,
				canvas: [800, 500],
				seed: 5,
				snapshotFrames: TIMES,
				rows
			},
			null,
			2
		)
	);
}

describe('E1 round 4 pressure residual diagnostic (train only)', () => {
	it('uses reference-local binary16 ULP, including zero/subnormals', () => {
		expect(fp16Ulp(0)).toBe(2 ** -24);
		expect(fp16Ulp(2 ** -20)).toBe(2 ** -24);
		expect(fp16Ulp(-1)).toBe(2 ** -10);
		expect(fp16Ulp(2)).toBe(2 ** -9);
	});
	for (const preset of TRAIN)
		it(preset, { timeout: 120_000 }, async () => {
			const canvas = document.createElement('canvas');
			canvas.width = 800;
			canvas.height = 500;
			const base = PRESETS.find((p) => p.id === preset)!;
			const engine = new FluidEngine({
				canvas,
				autoStart: false,
				config: { ...base.config, seed: 5, pointerInput: false }
			});
			const h = engine as unknown as Harness,
				gl = h.gl;
			const originalBlit = h.blit,
				originalProject = h.projectVelocity;
			const current = h.config.PRESSURE,
				originalIterations = h.performancePressureIterations;
			const { width, height } = h.velocity;
			const snapshots: Snapshot[] = [];
			let vs: WebGLShader | undefined,
				fs: WebGLShader | undefined,
				program: ProgramWrap | undefined;
			let residualTarget: FBO | undefined, decayTarget: FBO | undefined;
			try {
				expect(h.ext.isWebGL2).toBe(true);
				const debug = gl.getExtension('WEBGL_debug_renderer_info');
				renderer = String(
					gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER)
				);
				expect(renderer).not.toMatch(/SwiftShader|llvmpipe|software/i);
				vs = compileShader(gl, gl.VERTEX_SHADER, baseVertexShader);
				fs = compileShader(gl, gl.FRAGMENT_SHADER, residualShader);
				program = makeProgram(gl, vs, fs);
				residualTarget = createFBO(
					gl,
					width,
					height,
					gl.RGBA32F,
					gl.RGBA,
					gl.FLOAT,
					gl.NEAREST
				);
				decayTarget = createFBO(
					gl,
					width,
					height,
					h.ext.formatR.internalFormat,
					h.ext.formatR.format,
					h.ext.halfFloatTexType,
					gl.NEAREST
				);
				let frame = 0;
				h.projectVelocity = () => {
					if (!TIMES.includes(frame)) return originalProject.call(h);
					let captured = false;
					h.blit = (target) => {
						originalBlit.call(h, target);
						if (target !== h.divergence || captured) return;
						captured = true;
						const velocity = engine.readField('velocity').data;
						const divergence = engine.readField('divergence').data;
						const previousPressure = engine.readField('pressure').data;
						h.clearProgram.bind();
						gl.uniform1i(
							h.clearProgram.uniforms.uTexture,
							h.pressure.read.attach(0)
						);
						gl.uniform1f(h.clearProgram.uniforms.value, current);
						originalBlit.call(h, decayTarget!);
						const rgba = read(gl, decayTarget!);
						snapshots.push({
							frame,
							velocity,
							divergence,
							previousPressure,
							decayedPressure: rgba.filter((_, i) => i % 4 === 0)
						});
					};
					try {
						originalProject.call(h);
					} finally {
						h.blit = originalBlit;
					}
				};
				for (frame = 1; frame <= TIMES[4]; frame++) {
					await new Promise<void>((resolve) =>
						requestAnimationFrame(() => resolve())
					);
					h.withGl(() => h.simulateFrame(1 / 60));
				}
				h.projectVelocity = originalProject;
				expect(snapshots.length).toBe(5);
				const medians: Record<string, (number | null)[]> = {};
				const strictMedians: Record<string, (number | null)[]> = {};
				for (const snapshot of snapshots) {
					function run(count: number, retention: number): Output {
						let output!: Output;
						h.withGl(() => {
							upload(
								gl,
								h.velocity.read,
								h.ext.formatRG.format,
								snapshot.velocity
							);
							upload(
								gl,
								h.pressure.read,
								h.ext.formatR.format,
								snapshot.previousPressure
							);
							h.performancePressureIterations = count;
							h.config.PRESSURE = retention;
							originalProject.call(h);
							const replayDivergence = engine.readField('divergence').data;
							if (replayDivergence.some((v, i) => v !== snapshot.divergence[i]))
								throw new Error('Snapshot divergence replay changed');
							const velocity = engine.readField('velocity').data;
							const pressure = engine.readField('pressure').data;
							program!.bind();
							const u = program!.uniforms;
							gl.uniform2f(u.texelSize, 1 / width, 1 / height);
							gl.uniform1i(u.uPressure, h.pressure.read.attach(0));
							gl.uniform1i(u.uDivergence, h.divergence.attach(1));
							h.bindSolidMaskUniforms(u, 2, 3);
							h.bindStickyMask();
							gl.uniform1i(u.uStickyMask, 7);
							gl.uniform1f(
								u.uStickyPressure,
								h.config.STICKY ? h.config.STICKY_PRESSURE : 0
							);
							h.blit(residualTarget!);
							const rgba = read(gl, residualTarget!);
							const residual = new Float32Array(width * height),
								fluid = new Uint8Array(width * height);
							for (let i = 0; i < fluid.length; i++) {
								residual[i] = rgba[4 * i];
								fluid[i] = rgba[4 * i + 1] > 0.5 ? 1 : 0;
							}
							const p = h.divergenceProgram;
							p.bind();
							gl.uniform2f(p.uniforms.texelSize, 1 / width, 1 / height);
							gl.uniform1i(p.uniforms.uVelocity, h.velocity.read.attach(0));
							const edges = h.flowOpenEdges();
							gl.uniform4f(
								p.uniforms.uOpenEdges,
								edges[0],
								edges[1],
								edges[2],
								edges[3]
							);
							h.bindSolidMaskUniforms(p.uniforms, 2, 3);
							h.blit(h.divergence);
							output = {
								velocity,
								pressure,
								residual,
								fluid,
								divergence: engine.readField('divergence').data
							};
							expect(gl.getError()).toBe(gl.NO_ERROR);
						});
						return output;
					}
					const reference = run(originalIterations, current),
						rerun = run(originalIterations, current);
					const reference20 =
						originalIterations === 20 ? reference : run(20, current);
					const rerun20 = originalIterations === 20 ? rerun : run(20, current);
					const refMetrics = errors(reference, reference);
					const floor = {
						residual: stats(
							difference(rerun.residual, reference.residual),
							reference.fluid
						),
						divergence: stats(
							difference(rerun.divergence, reference.divergence),
							reference.fluid
						),
						velocity: stats(
							difference(rerun.velocity, reference.velocity),
							reference.fluid,
							2
						),
						pressure: stats(
							difference(rerun.pressure, reference.pressure),
							reference.fluid
						)
					};
					const trials = [];
					const floor20 = {
						residual: stats(
							difference(rerun20.residual, reference20.residual),
							reference20.fluid
						),
						divergence: stats(
							difference(rerun20.divergence, reference20.divergence),
							reference20.fluid
						),
						velocity: stats(
							difference(rerun20.velocity, reference20.velocity),
							reference20.fluid,
							2
						)
					};
					for (const [label, retention] of [
						['current', current],
						['0.9', 0.9],
						['0.95', 0.95]
					] as const) {
						let smallest: number | null = null,
							strict: number | null = null;
						for (const count of [
							...new Set([...COUNTS, originalIterations])
						].sort((a, b) => a - b)) {
							const candidate = run(count, retention),
								metrics = errors(candidate, reference);
							metrics.maxVelocityUlps = maxUlps(candidate, reference);
							const equal = metrics.maxVelocityUlps <= 1;
							const literal =
								metrics.residual.rms <= floor.residual.rms &&
								metrics.residual.max <= floor.residual.max &&
								metrics.divergence.rms <= floor.divergence.rms &&
								metrics.velocity.rms <= floor.velocity.rms &&
								metrics.velocity.max <= floor.velocity.max;
							const noWorse =
								metrics.residual.rms <=
									refMetrics.residual.rms + floor.residual.rms &&
								metrics.residual.max <=
									refMetrics.residual.max + floor.residual.max &&
								metrics.divergence.rms <=
									refMetrics.divergence.rms + floor.divergence.rms &&
								metrics.velocity.rms <= floor.velocity.rms &&
								metrics.velocity.max <= floor.velocity.max;
							if (equal && smallest === null) smallest = count;
							const metrics20 = errors(candidate, reference20);
							const literal20 =
								count <= 20 &&
								metrics20.residual.rms <= floor20.residual.rms &&
								metrics20.residual.max <= floor20.residual.max &&
								metrics20.divergence.rms <= floor20.divergence.rms &&
								metrics20.velocity.rms <= floor20.velocity.rms &&
								metrics20.velocity.max <= floor20.velocity.max;
							if (literal20 && strict === null) strict = count;
							trials.push({
								retention: label,
								value: retention,
								count,
								...metrics,
								equal,
								literal,
								literal20,
								velocity20: metrics20.velocity,
								maxVelocityUlps20: maxUlps(candidate, reference20),
								noWorse
							});
						}
						(medians[label] ??= []).push(smallest);
						(strictMedians[label] ??= []).push(strict);
					}
					rows.push({
						preset,
						frame: snapshot.frame,
						kind: 'snapshot',
						grid: [width, height],
						registryIterations: originalIterations,
						retention: current,
						fluidCells: reference.fluid.reduce((a, b) => a + b, 0),
						previousPressure: stats(snapshot.previousPressure, reference.fluid),
						decayedPressure: stats(snapshot.decayedPressure, reference.fluid),
						reference: refMetrics,
						floor,
						reference20: errors(reference20, reference20),
						floor20,
						trials
					});
				}
				const summarize = (map: Record<string, (number | null)[]>) =>
					Object.fromEntries(
						Object.entries(map).map(([key, values]) => [
							key,
							{
								counts: values,
								median: median(values.map((v) => v ?? Infinity))
							}
						])
					);
				const summary = {
					preset,
					kind: 'summary',
					primary: summarize(medians),
					literal: summarize(strictMedians)
				};
				rows.push(summary);
				console.log(JSON.stringify(summary));
			} finally {
				h.blit = originalBlit;
				h.projectVelocity = originalProject;
				h.performancePressureIterations = originalIterations;
				h.config.PRESSURE = current;
				if (program) gl.deleteProgram(program.program);
				if (vs) gl.deleteShader(vs);
				if (fs) gl.deleteShader(fs);
				disposeFBO(gl, residualTarget);
				disposeFBO(gl, decayTarget);
				engine.dispose();
				canvas.remove();
			}
			await flush();
		});
});
