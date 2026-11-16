import { expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { PaperMacEngine, type MacCheckpoint } from './engine.js';
import {
	staggeredDivergence,
	staggeredGradient
} from '$lib/engine/staggered.js';
import { TwoLevelPressure } from './__benches__/two-level.js';
import type { FBO } from '$lib/engine/internal-types.js';

const io = commands as unknown as {
	readBenchBase64(path: string): Promise<string>;
	writeBenchJson(path: string, content: string): Promise<void>;
};
const enabled = import.meta.env.SVELTE_FLUID_SHOTS_EXTRA === 'two-level';
const json = async (path: string) =>
	JSON.parse(atob(await io.readBenchBase64(path)));
const decode = (s: string, double = false) => {
	const bytes = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
	return double
		? new Float64Array(bytes.buffer)
		: new Float32Array(bytes.buffer);
};
const relative = (a: ArrayLike<number>, b: ArrayLike<number>) => {
	let error = 0,
		scale = 0;
	for (let i = 0; i < a.length; i++) {
		error += (a[i] - b[i]) ** 2;
		scale += b[i] ** 2;
	}
	return Math.sqrt(error / scale);
};
const median = (a: number[]) =>
	[...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];

it.skipIf(!enabled)(
	'pre-registered gates (a)-(d), stopping at first failure',
	async () => {
		const lock = atob(
			await io.readBenchBase64('/tmp/svelte-fluid-gpu.lock/owner')
		);
		if (!/^two-level \d+$/.test(lock))
			throw new Error('Owned GPU lock required');
		const started = performance.now(),
			deadline = started + 20 * 60_000;
		const guard = async () => {
			if (performance.now() > deadline)
				throw new Error('Two-level GPU deadline reached');
			const health = await json('.svelte-kit/two-level/health.json');
			if (Date.now() - health.epochMs > 90_000 || health.owner !== lock)
				throw new Error('Stale GPU load/ownership guard');
			if (health.load > 20) {
				await io.writeBenchJson(
					'.svelte-kit/two-level/load-stop.json',
					JSON.stringify(health)
				);
				throw new Error(`GPU stopped by load guard: ${health.uptime}`);
			}
			return health.uptime;
		};
		await guard();
		const raw = await json('.svelte-kit/two-level/capture-worst.json');
		const engine = new PaperMacEngine(
				document.createElement('canvas'),
				raw.options
			),
			gl = engine.gl;
		const solver = new TwoLevelPressure(
			gl,
			engine.geometry.grid,
			raw.options.direction
		);
		const report: Record<string, any> = {
			gates: {},
			drawBreakdown: {
				paired: [14, 14, 16],
				corrections: 2,
				eachCorrection: {
					residual: 1,
					restriction: 7,
					denseApply: 1,
					prolongation: 1
				},
				total: 64
			}
		};
		const save = () =>
			io.writeBenchJson(
				'.svelte-kit/two-level/gpu-report.json',
				JSON.stringify(report, null, 2)
			);
		const upload = (
			target: FBO,
			values: ArrayLike<number>,
			channels: 1 | 2
		) => {
			gl.bindTexture(gl.TEXTURE_2D, target.texture);
			gl.texSubImage2D(
				gl.TEXTURE_2D,
				0,
				0,
				0,
				target.width,
				target.height,
				channels === 1 ? gl.RED : gl.RG,
				gl.FLOAT,
				Float32Array.from(values)
			);
		};
		const actualDraw = gl.drawElements.bind(gl);
		let draws = 0;
		gl.drawElements = (...args: Parameters<typeof gl.drawElements>) => {
			draws++;
			actualDraw(...args);
		};
		const checked = (run: () => number | void) => {
			draws = 0;
			run();
			if (gl.getError() !== gl.NO_ERROR)
				throw new Error('WebGL error during pressure solve');
			return draws;
		};
		const g = engine.geometry.grid;
		try {
			const previous = decode(raw.previous, true),
				rhs = decode(raw.rhs, true),
				cpu = Float64Array.from(previous);
			solver.geometry.correct(cpu, rhs);
			upload(engine.pressure.read, previous, 1);
			upload(engine.divergence, rhs, 1);
			const correctionDraws = checked(() =>
				solver.correct(engine.pressure, engine.divergence)
			);
			const gpu = engine.read(engine.pressure.read, 1);
			const cpuDelta = Float64Array.from(cpu, (v, i) => v - previous[i]);
			const gpuDelta = Float64Array.from(gpu, (v, i) => v - previous[i]);
			const error = relative(gpuDelta, cpuDelta);
			report.gates.a = {
				uptime: await guard(),
				relativeL2: error,
				pressureRelativeL2: relative(gpu, cpu),
				draws: correctionDraws,
				limit: 1e-4,
				pass: error <= 1e-4
			};
			await save();
			expect(error).toBeLessThanOrEqual(1e-4);
			expect(correctionDraws).toBe(10);

			report.gates.b = { rows: [], limit: 0.0115 };
			for (const name of [
				'capture-worst.json',
				'forward200final-checkpoint.json',
				'reverse400c-checkpoint.json'
			]) {
				await guard();
				const data =
					name === 'capture-worst.json'
						? raw
						: await json(`.svelte-kit/two-level/${name}`);
				const q = data.previous
					? decode(data.previous, true)
					: decode(data.pressure);
				let tentative: Float64Array, divergence: Float64Array;
				if (data.tentative) {
					tentative = Float64Array.from(decode(data.tentative, true));
					divergence = Float64Array.from(decode(data.rhs, true));
				} else {
					const v = decode(data.velocity),
						gradient = staggeredGradient(g, q);
					tentative = Float64Array.from(v, (x, i) => x + gradient[i]);
					divergence = staggeredDivergence(g, tentative);
				}
				const observe = (pressure: ArrayLike<number>) => {
					const gradient = staggeredGradient(g, pressure),
						m = engine.geometry;
					const fluxes = [0, 0.25, 0.5, 0.75, 1].map((t) => {
						const x = m.plenum + Math.round(t * m.valveWidth);
						let sum = 0;
						for (let y = 0; y < g.height; y++)
							sum += tentative[g.u(x, y)] - gradient[g.u(x, y)];
						return sum;
					});
					const projected = Float64Array.from(
						tentative,
						(v, i) => v - gradient[i]
					);
					const d = staggeredDivergence(g, projected);
					return {
						fluxes,
						spread:
							(Math.max(...fluxes) - Math.min(...fluxes)) /
							Math.max(...fluxes.map(Math.abs)),
						residualL2: Math.hypot(...d.filter((_, i) => !!g.cells[i]))
					};
				};
				const reset = () => {
					upload(engine.pressure.read, q, 1);
					upload(engine.divergence, divergence, 1);
				};
				reset();
				const baselineDraws = checked(() =>
					solver.baseline(engine.pressure, engine.divergence)
				);
				const baseline = observe(engine.read(engine.pressure.read, 1));
				reset();
				const candidateDraws = checked(() =>
					solver.run(engine.pressure, engine.divergence)
				);
				const candidate = observe(engine.read(engine.pressure.read, 1));
				const row = {
					name,
					uptime: await guard(),
					baseline,
					candidate,
					baselineDraws,
					candidateDraws,
					residualContraction: candidate.residualL2 / baseline.residualL2,
					pass: candidate.spread <= 0.0115 && candidateDraws <= 64
				};
				report.gates.b.rows.push(row);
				await save();
				expect(candidate.spread).toBeLessThanOrEqual(0.0115);
				expect(candidateDraws).toBeLessThanOrEqual(64);
			}
			report.gates.b.pass = true;

			const extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
			const timing = async (run: () => number) => {
				const uptime = await guard();
				upload(engine.pressure.read, previous, 1);
				upload(engine.divergence, rhs, 1);
				gl.finish();
				const query = extension ? gl.createQuery() : null;
				if (extension && !query)
					throw new Error('Timer query allocation failed');
				if (query) gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
				const t = performance.now(),
					n = checked(run);
				if (query) gl.endQuery(extension.TIME_ELAPSED_EXT);
				gl.finish();
				const wallMs = performance.now() - t;
				let ms = wallMs;
				if (query) {
					try {
						while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
							await new Promise((r) => setTimeout(r, 5));
							if (performance.now() > deadline)
								throw new Error('Timer deadline');
						}
						if (gl.getParameter(extension.GPU_DISJOINT_EXT))
							throw new Error('Disjoint GPU timing');
						ms = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
					} finally {
						gl.deleteQuery(query);
					}
				}
				return { ms, wallMs, draws: n, uptime };
			};
			const samples: {
				kind: string;
				ms: number;
				wallMs: number;
				draws: number;
				uptime: string;
			}[] = [];
			for (let i = 0; i < 4; i++) {
				await guard();
				solver.baseline(engine.pressure, engine.divergence);
				solver.run(engine.pressure, engine.divergence);
			}
			gl.finish();
			for (let i = 0; i < 15; i++)
				for (const kind of i % 2
					? ['candidate', 'baseline']
					: ['baseline', 'candidate']) {
					const sample = await timing(() =>
						kind === 'baseline'
							? solver.baseline(engine.pressure, engine.divergence)
							: solver.run(engine.pressure, engine.divergence)
					);
					samples.push({ kind, ...sample });
				}
			const baselineMs = median(
				samples.filter((s) => s.kind === 'baseline').map((s) => s.ms)
			);
			const candidateMs = median(
				samples.filter((s) => s.kind === 'candidate').map((s) => s.ms)
			);
			report.gates.c = {
				method: extension
					? 'EXT_disjoint_timer_query_webgl2'
					: 'finish + performance.now',
				baselineMs,
				candidateMs,
				ratio: candidateMs / baselineMs,
				limit: 1.1,
				pass: candidateMs / baselineMs <= 1.1,
				samples
			};
			await save();
			expect(candidateMs / baselineMs).toBeLessThanOrEqual(1.1);
			gl.drawElements = actualDraw;
			solver.dispose();
			engine.dispose();
			gl.getExtension('WEBGL_lose_context')?.loseContext();
			const checkpoint = await json(
				'.svelte-kit/two-level/reverse400gate-checkpoint.json'
			);
			for (const key of ['velocity', 'pressure', 'dye'])
				if (typeof checkpoint[key] === 'string')
					checkpoint[key] = [...decode(checkpoint[key])];
			const exact = await json('.svelte-kit/two-level/spectrumexact.json');
			const step = await runTwoLevelStepGate(checkpoint, exact, guard);
			await io.writeBenchJson(
				'.svelte-kit/two-level/step-series.json',
				JSON.stringify(step)
			);
			report.gates.d = {
				ratios: step.ratios,
				pass: step.pass,
				steps: step.rows.length,
				checkpointSeconds: checkpoint.step * checkpoint.options.dt
			};
			await save();
			for (const ratio of step.ratios) expect(ratio).toBeLessThanOrEqual(5);
		} finally {
			report.wallSeconds = (performance.now() - started) / 1000;
			try {
				await save();
			} finally {
				gl.drawElements = actualDraw;
				solver.dispose();
				engine.dispose();
				gl.getExtension('WEBGL_lose_context')?.loseContext();
			}
		}
	},
	21 * 60_000
);

/** Runs only after all fixed-RHS accuracy, draw and timing gates pass. */
export async function runTwoLevelStepGate(
	checkpoint: MacCheckpoint,
	exact: { rows: { time: number; unitProbes: number[]; flux: number }[] },
	guard: () => Promise<unknown>
) {
	const engine = new PaperMacEngine(
		document.createElement('canvas'),
		checkpoint.options
	);
	const host = engine;
	const solver = new TwoLevelPressure(
		engine.gl,
		engine.geometry.grid,
		checkpoint.options.direction
	);
	const rows: { time: number; flux: number; unitProbes: number[] }[] = [],
		deadline = performance.now() + 20 * 60_000;
	try {
		engine.restore(checkpoint);
		host.pressureSolverOverride = () =>
			solver.run(engine.pressure, engine.divergence);
		const count = Math.round(30 / engine.options.dt);
		for (let i = 0; i < count; i++) {
			if (performance.now() > deadline) throw new Error('Step gate deadline');
			if (i % 20 === 0) await guard();
			engine.advance(1, false);
			const columns = engine.readColumns(),
				m = engine.geometry;
			const fluxes = [0, 0.25, 0.5, 0.75, 1].map(
				(t) => -columns[4 * (m.plenum + Math.round(t * m.valveWidth))]
			);
			rows.push({
				time: (i + 1) * engine.options.dt,
				flux: fluxes.reduce((a, b) => a + b, 0) / 5,
				unitProbes: engine.probeUnits()
			});
		}
		const sd = (values: number[]) => {
			const mean = values.reduce((a, b) => a + b, 0) / values.length;
			return Math.sqrt(
				values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
			);
		};
		const normalized = (series: typeof rows, unit: number) => {
			const last = series.filter((r) => r.time > 20 && r.time <= 30),
				speed =
					last.reduce(
						(s, r) => s + Math.abs(r.flux) / engine.geometry.meanWidth,
						0
					) / last.length;
			return sd(last.map((r) => r.unitProbes[unit])) / speed;
		};
		const ratios = [0, 1, 2].map(
			(unit) => normalized(rows, unit) / normalized(exact.rows, unit)
		);
		return { rows, ratios, pass: ratios.every((x) => x <= 5) };
	} finally {
		solver.dispose();
		engine.dispose();
		engine.gl.getExtension('WEBGL_lose_context')?.loseContext();
	}
}
