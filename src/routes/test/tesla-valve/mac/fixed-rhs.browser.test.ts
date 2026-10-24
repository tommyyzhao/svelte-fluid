import { expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { PaperMacEngine, type MacCheckpoint } from './engine.js';
import {
	staggeredDivergence,
	staggeredGradient,
	staggeredLaplacian
} from '$lib/engine/staggered.js';
import { directPressure } from '$lib/engine/__benches__/staggered-direct.js';
import { staggeredHarness } from '$lib/engine/__benches__/staggered-harness.js';
import { CoarseCorrection } from './__benches__/coarse-gpu.js';
import { createBlit } from '$lib/engine/gl-utils.js';
import { smoothedReference } from './__benches__/smoothed-reference.js';

const io = commands as unknown as {
	readBenchBase64(path: string): Promise<string>;
	writeBenchJson(path: string, data: string): Promise<void>;
};
it.skipIf(import.meta.env.SVELTE_FLUID_SHOTS_EXTRA !== 'paper-fixed-rhs')(
	'measurement: identical unsteady tentative RHS pressure convergence',
	async () => {
		const owner = atob(
			await io.readBenchBase64('/tmp/svelte-fluid-gpu.lock/owner')
		).trim();
		if (!owner.startsWith('paper-flow ')) throw new Error('GPU lock required');
		const raw = JSON.parse(
			atob(
				await io.readBenchBase64(
					'.svelte-kit/paper-flow/reverse400c-checkpoint.json'
				)
			)
		);
		for (const key of ['velocity', 'pressure', 'dye'])
			if (typeof raw[key] === 'string')
				raw[key] = [
					...new Float32Array(
						Uint8Array.from(atob(raw[key]), (c) => c.charCodeAt(0)).buffer
					)
				];
		const engine = new PaperMacEngine(
			document.createElement('canvas'),
			raw.options
		);
		const rows: any[] = [],
			report: any = {
				rows,
				source:
					'reverse400c checkpoint120s; next high-q sample from 5solver-s continuation'
			};
		let h: ReturnType<typeof staggeredHarness> | undefined;
		try {
			engine.restore(raw as MacCheckpoint);
			let tentative: Float32Array | undefined,
				previous: Float32Array | undefined,
				peak = -1,
				capturedStep = 0;
			let worstTentative: Float32Array | undefined,
				worstPrevious: Float32Array | undefined,
				worstSpread = -1;
			const captureWorst =
				import.meta.env.SVELTE_FLUID_SHOTS_DYE === 'worst-spread';
			let lastTentative: Float32Array | undefined,
				lastPrevious: Float32Array | undefined;
			const started = performance.now();
			engine.onBeforeProject = () => {
				if (engine.stepCount % 20 !== 0) return;
				const q = engine.read(engine.pressure.read, 1);
				if (captureWorst) {
					lastPrevious = q;
					lastTentative = engine.read(engine.velocity.read, 2);
				}
				let maximum = 0;
				for (const x of q) maximum = Math.max(maximum, Math.abs(x));
				if (maximum > peak) {
					peak = maximum;
					previous = q;
					tentative = engine.read(engine.velocity.read, 2);
					capturedStep = engine.stepCount;
				}
			};
			for (let i = 0; i < 1000; i++) {
				engine.advance(1, false);
				if (captureWorst && (engine.stepCount - 1) % 20 === 0) {
					const columns = engine.readColumns(),
						g = engine.geometry;
					const qs = [0, 0.25, 0.5, 0.75, 1].map(
						(t) => -columns[4 * (g.plenum + Math.round(t * g.valveWidth))]
					);
					const spread =
						(Math.max(...qs) - Math.min(...qs)) / Math.max(...qs.map(Math.abs));
					if (spread > worstSpread) {
						worstSpread = spread;
						worstTentative = lastTentative;
						worstPrevious = lastPrevious;
						capturedStep = engine.stepCount - 1;
					}
				}
			}
			if (captureWorst) {
				tentative = worstTentative;
				previous = worstPrevious;
				report.source += '; selected maximum instantaneous spread';
				report.selectedSpread = worstSpread;
			}
			if (!tentative || !previous) throw new Error('No captured field');
			const g = engine.geometry.grid,
				meta = engine.geometry;
			const observe = (state: ArrayLike<number>) => {
				const fluxes = [0, 0.25, 0.5, 0.75, 1].map((t) => {
					const x = meta.plenum + Math.round(t * meta.valveWidth);
					let sum = 0;
					for (let y = 0; y < g.height; y++) sum += state[g.u(x, y)];
					return -sum;
				});
				const mean = fluxes.reduce((a, b) => a + b, 0) / 5;
				let maxD = 0;
				for (const x of staggeredDivergence(g, state))
					maxD = Math.max(maxD, Math.abs(x));
				return {
					fluxes,
					flux: mean,
					spread:
						(Math.max(...fluxes) - Math.min(...fluxes)) /
						Math.max(...fluxes.map(Math.abs)),
					normalizedDivergence: maxD / (Math.abs(mean) / meta.meanWidth)
				};
			};
			h = staggeredHarness(g);
			h.upload(h.velocity.read, tentative, 2);
			h.computeDivergence();
			const rhs = h.read(h.divergence, 1),
				direct = directPressure(g),
				exactQ = direct.solve(rhs),
				grad = staggeredGradient(g, exactQ);
			const exactFaces = Float32Array.from(tentative, (v, i) =>
					g.faces[i] ? v - grad[i] : 0
				),
				exact = observe(exactFaces);
			report.captured = {
				step: capturedStep,
				time: capturedStep * engine.options.dt,
				previousQMax: peak,
				exact,
				direct: direct.stats,
				rhs: 'Float32 GPU divergence of identical tentative field; Float64 LDL subtraction, rounded faces'
			};
			const encode = (values: ArrayLike<number>) => {
				const bytes = new Uint8Array(Float64Array.from(values).buffer);
				let binary = '';
				for (let i = 0; i < bytes.length; i += 8192)
					binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
				return btoa(binary);
			};
			await io.writeBenchJson(
				`.svelte-kit/paper-flow/capture-${
					captureWorst ? 'worst' : 'highq'
				}.json`,
				JSON.stringify({
					options: engine.options,
					step: capturedStep,
					tentative: encode(tentative),
					previous: encode(previous),
					rhs: encode(rhs),
					exact: encode(exactQ)
				})
			);
			for (const sweeps of [32, 64, 128, 256, 512]) {
				h.upload(h.velocity.read, tentative, 2);
				h.upload(h.pressure.read, previous, 1);
				h.computeDivergence();
				h.solve(sweeps);
				h.subtract();
				const state = h.read(h.velocity.read, 2),
					m = observe(state);
				rows.push({
					sweeps,
					...m,
					spreadMinusExact: m.spread - exact.spread,
					maxSectionFluxRelativeError:
						Math.max(...m.fluxes.map((v, i) => Math.abs(v - exact.fluxes[i]))) /
						Math.abs(exact.flux)
				});
				await io.writeBenchJson(
					'.svelte-kit/paper-flow/fixed-rhs.json',
					JSON.stringify(report, null, 2)
				);
			}
			const smooth = smoothedReference(g, 256);
			let sa = Float64Array.from(previous);
			const jacobiSa = (count: number) => {
				let next = new Float64Array(sa.length);
				for (let k = 0; k < count; k++) {
					for (let i = 0; i < sa.length; i++) {
						let sum = 0;
						for (let d = 0; d < 4; d++) {
							const j = g.neighbors[4 * i + d];
							if (j >= 0) sum += sa[j];
						}
						next[i] = g.cells[i] ? (sum - rhs[i]) / g.diagonal[i] : 0;
					}
					const swap = sa;
					sa = next;
					next = swap;
				}
			};
			const saEnergy = () => {
				const e = Float64Array.from(sa, (v, i) => v - exactQ[i]),
					ae = staggeredLaplacian(g, e);
				let sum = 0;
				for (let i = 0; i < e.length; i++) sum += e[i] * ae[i];
				return Math.sqrt(Math.max(0, sum));
			};
			jacobiSa(64);
			report.jacobi64Energy = saEnergy();
			sa = Float64Array.from(previous);
			report.sa = [];
			let oldEnergy = saEnergy();
			for (let cycle = 1; cycle <= 4; cycle++) {
				jacobiSa(4);
				smooth.correct(sa, rhs);
				jacobiSa(4);
				const energy = saEnergy(),
					gradient = staggeredGradient(g, sa),
					faces = Float32Array.from(tentative, (v, i) =>
						g.faces[i] ? v - gradient[i] : 0
					),
					m = observe(faces);
				report.sa.push({
					cycle,
					estimatedGpuPasses: cycle * 14,
					bands: 256,
					omega: 2 / 3,
					energy,
					energyFactor: energy / oldEnergy,
					...m,
					passes:
						m.spread <= 0.002 &&
						m.normalizedDivergence <= 0.001 &&
						energy < report.jacobi64Energy
				});
				if (energy / oldEnergy > 0.5) {
					report.saStop = 'per-cycle energy factor > .5';
					break;
				}
				oldEnergy = energy;
			}
			report.coarse = [];
			const gl = h.gl,
				vb = gl.createBuffer()!,
				ib = gl.createBuffer()!,
				blit = createBlit(gl, vb, ib);
			const texture = (
				data: Uint8Array,
				w: number,
				h: number,
				internal: number,
				format: number
			) => {
				const t = gl.createTexture()!;
				gl.bindTexture(gl.TEXTURE_2D, t);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
				gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
				gl.texImage2D(
					gl.TEXTURE_2D,
					0,
					internal,
					w,
					h,
					0,
					format,
					gl.UNSIGNED_BYTE,
					data
				);
				gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
				return t;
			};
			const apertures = texture(
					g.faces,
					g.width + 1,
					g.height + 1,
					gl.RG8,
					gl.RG
				),
				cells = texture(g.cells, g.width, g.height, gl.R8, gl.RED);
			try {
				for (const bands of [128, 256]) {
					const c = new CoarseCorrection(gl, g, -1, bands);
					try {
						for (const main of [24, 32, 48, 56]) {
							h.upload(h.velocity.read, tentative, 2);
							h.upload(h.pressure.read, previous, 1);
							h.computeDivergence();
							h.solve(main);
							let cpu = Float64Array.from(previous);
							const jacobi = (count: number) => {
								let next = new Float64Array(cpu.length);
								for (let k = 0; k < count; k++) {
									for (let i = 0; i < cpu.length; i++) {
										let sum = 0;
										for (let d = 0; d < 4; d++) {
											const j = g.neighbors[4 * i + d];
											if (j >= 0) sum += cpu[j];
										}
										next[i] = g.cells[i] ? (sum - rhs[i]) / g.diagonal[i] : 0;
									}
									const swap = cpu;
									cpu = next;
									next = swap;
								}
							};
							const energy = () => {
								const e = Float64Array.from(cpu, (v, i) => v - exactQ[i]),
									ae = staggeredLaplacian(g, e);
								let sum = 0;
								for (let i = 0; i < e.length; i++) sum += e[i] * ae[i];
								return Math.sqrt(Math.max(0, sum));
							};
							jacobi(main);
							const beforeEnergy = energy(),
								aq = staggeredLaplacian(g, cpu),
								rc = new Float64Array(c.geometry.count),
								ec = new Float64Array(c.geometry.count);
							for (let i = 0; i < cpu.length; i++)
								if (c.geometry.ids[i] >= 0)
									rc[c.geometry.ids[i]] += -rhs[i] - aq[i];
							for (let i = 0; i < ec.length; i++)
								for (let j = 0; j < ec.length; j++)
									ec[i] += c.geometry.inverse[i * ec.length + j] * rc[j];
							for (let i = 0; i < cpu.length; i++)
								if (c.geometry.ids[i] >= 0) cpu[i] += ec[c.geometry.ids[i]];
							const afterEnergy = energy();
							jacobi(8);
							c.run(h.pressure, h.divergence, apertures, cells, blit);
							h.solve(8);
							h.subtract();
							const m = observe(h.read(h.velocity.read, 2)),
								gpuQ = h.read(h.pressure.read, 1);
							let qdiff = 0;
							for (let i = 0; i < cpu.length; i++)
								qdiff = Math.max(qdiff, Math.abs(cpu[i] - gpuQ[i]));
							const cpugrad = staggeredGradient(g, cpu),
								cpuFaces = Float32Array.from(tentative, (v, i) =>
									g.faces[i] ? v - cpugrad[i] : 0
								);
							report.coarse.push({
								bands,
								aggregates: c.geometry.count,
								maxCells: c.geometry.maxCells,
								main,
								post: 8,
								...m,
								cpu: observe(cpuFaces),
								maxPressureDifference: qdiff,
								beforeEnergy,
								afterEnergy,
								energyFactor: afterEnergy / beforeEnergy,
								passes: m.spread <= 0.002 && m.normalizedDivergence <= 0.001
							});
							expect(afterEnergy).toBeLessThanOrEqual(
								beforeEnergy * (1 + 1e-6)
							);
							await io.writeBenchJson(
								'.svelte-kit/paper-flow/fixed-rhs.json',
								JSON.stringify(report, null, 2)
							);
						}
					} finally {
						c.dispose();
					}
				}
			} finally {
				gl.deleteTexture(apertures);
				gl.deleteTexture(cells);
				gl.deleteBuffer(vb);
				gl.deleteBuffer(ib);
			}
			report.wallSeconds = (performance.now() - started) / 1000;
			expect(exact.normalizedDivergence).toBeLessThan(1e-5);
			expect(h.gl.getError()).toBe(h.gl.NO_ERROR);
		} finally {
			await io.writeBenchJson(
				'.svelte-kit/paper-flow/fixed-rhs.json',
				JSON.stringify(report, null, 2)
			);
			h?.dispose();
			engine.dispose();
		}
	},
	120000
);
