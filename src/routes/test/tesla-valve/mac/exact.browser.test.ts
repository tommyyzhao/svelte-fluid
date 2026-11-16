import { expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { PaperMacEngine, type MacCheckpoint } from './engine.js';
import {
	staggeredDivergence,
	staggeredGradient
} from '$lib/engine/staggered.js';
import { directPressure } from '$lib/engine/__benches__/staggered-direct.js';
import { paperDyeMetrics } from './metrics.js';
const io = commands as unknown as {
	readBenchBase64(p: string): Promise<string>;
	writeBenchJson(p: string, s: string): Promise<void>;
	writeBenchBase64(p: string, s: string): Promise<void>;
};
const extra = import.meta.env.SVELTE_FLUID_SHOTS_EXTRA || '';
it.skipIf(!extra.startsWith('paper-exact:'))(
	'measurement: exact projection unsteady and resolution probe',
	async () => {
		const [
				name,
				scaleText,
				exactText,
				secondsText,
				resumeText,
				sourceName = 'reverse400c',
				samplingText,
				sweepsText
			] = extra.slice(12).split(','),
			scale = Number(scaleText || 1),
			exact = exactText !== '0',
			seconds = Number(secondsText || 60),
			everyStep = samplingText === 'every-step';
		if (
			!/^[a-zA-Z0-9_-]+$/.test(name) ||
			!/^[a-zA-Z0-9_-]+$/.test(sourceName) ||
			![1, 1.5].includes(scale)
		)
			throw new Error('Invalid exact case');
		const acquired = Date.parse(
				atob(
					await io.readBenchBase64('/tmp/svelte-fluid-gpu.lock/acquired-at')
				).trim()
			),
			owner = atob(
				await io.readBenchBase64('/tmp/svelte-fluid-gpu.lock/owner')
			).trim();
		if (!owner.startsWith('paper-flow ') || !Number.isFinite(acquired))
			throw new Error('GPU lock required');
		const deadline = acquired + 23 * 60000,
			raw = JSON.parse(
				atob(
					await io.readBenchBase64(
						`.svelte-kit/paper-flow/${sourceName}-checkpoint.json`
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
		const options = {
			...raw.options,
			width: Math.round(raw.options.width * scale),
			nu: raw.options.nu * scale * scale,
			force: raw.options.force * scale,
			dt: raw.options.dt / scale,
			dyeScale: everyStep ? 1 : 3,
			pressureSweeps: exact
				? 2
				: Number(sweepsText || raw.options.pressureSweeps),
			noiseAcceleration: raw.options.noiseAcceleration * scale
		};
		const canvas = document.createElement('canvas');
		canvas.width = 1920;
		canvas.height = 224;
		const engine = new PaperMacEngine(canvas, options),
			g = engine.geometry.grid;
		let report: any = {
			name,
			scale,
			exact,
			options: engine.options,
			rows: [],
			completed: false,
			source: `${sourceName} checkpoint; passive dye reset, carrier prefilled`,
			sampleInterval: everyStep ? engine.options.dt : 1,
			clockFactor:
				(0.0089 * engine.geometry.cellsPerCm ** 2) / engine.options.nu
		};
		const save = () =>
			io.writeBenchJson(
				`.svelte-kit/paper-flow/${name}.json`,
				JSON.stringify(report, null, 2)
			);
		const upload = (target: any, data: ArrayLike<number>, channels: 1 | 2) => {
			const gl = engine.gl;
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
				Float32Array.from(data)
			);
		};
		try {
			const source = new PaperMacEngine(
					document.createElement('canvas'),
					raw.options
				),
				sg = source.geometry.grid;
			try {
				if (scale === 1) {
					upload(engine.velocity.read, raw.velocity, 2);
					upload(engine.pressure.read, raw.pressure, 1);
				} else {
					const state = new Float32Array(g.faces.length),
						q = new Float32Array(g.cells.length);
					const sample = (x: number, y: number, c: 0 | 1) => {
						const xx = x - (c === 1 ? 0.5 : 0),
							yy = y - (c === 0 ? 0.5 : 0),
							bx = Math.floor(xx),
							by = Math.floor(yy),
							tx = xx - bx,
							ty = yy - by;
						const at = (a: number, b: number) => {
							a = Math.max(0, Math.min(c === 0 ? sg.width : sg.width - 1, a));
							b = Math.max(0, Math.min(c === 0 ? sg.height - 1 : sg.height, b));
							return raw.velocity[c === 0 ? sg.u(a, b) : sg.v(a, b)];
						};
						return (
							(at(bx, by) * (1 - tx) + at(bx + 1, by) * tx) * (1 - ty) +
							(at(bx, by + 1) * (1 - tx) + at(bx + 1, by + 1) * tx) * ty
						);
					};
					for (let y = 0; y < g.height; y++)
						for (let x = 0; x <= g.width; x++)
							if (g.faces[g.u(x, y)])
								state[g.u(x, y)] =
									scale * sample(x / scale, (y + 0.5) / scale, 0);
					for (let y = 0; y <= g.height; y++)
						for (let x = 0; x < g.width; x++)
							if (g.faces[g.v(x, y)])
								state[g.v(x, y)] =
									scale * sample((x + 0.5) / scale, y / scale, 1);
					for (let y = 0; y < g.height; y++)
						for (let x = 0; x < g.width; x++)
							q[y * g.width + x] =
								raw.pressure[
									Math.min(sg.height - 1, Math.floor((y + 0.5) / scale)) *
										sg.width +
										Math.min(sg.width - 1, Math.floor((x + 0.5) / scale))
								] * scale;
					upload(engine.velocity.read, state, 2);
					upload(engine.pressure.read, q, 1);
				}
			} finally {
				source.dispose();
			}
			engine.stepCount = Math.round(
				(raw.step * raw.options.dt) / engine.options.dt
			);
			if (resumeText === '1') {
				report = JSON.parse(
					atob(await io.readBenchBase64(`.svelte-kit/paper-flow/${name}.json`))
				);
				const state = JSON.parse(
					atob(
						await io.readBenchBase64(
							`.svelte-kit/paper-flow/${name}-checkpoint.json`
						)
					)
				);
				for (const key of ['velocity', 'pressure', 'dye'])
					state[key] = [
						...new Float32Array(
							Uint8Array.from(atob(state[key]), (c) => c.charCodeAt(0)).buffer
						)
					];
				engine.restore(state);
				report.completed = false;
				delete report.stopReason;
			}
			const direct = exact ? directPressure(g) : undefined;
			report.direct = direct?.stats;
			// Project the interpolated initial fine state once with the identical exact operator.
			if (exact && scale !== 1 && resumeText !== '1') {
				const state = engine.read(engine.velocity.read, 2),
					q = direct!.solve(staggeredDivergence(g, state)),
					grad = staggeredGradient(g, q);
				upload(
					engine.velocity.read,
					Float32Array.from(state, (v, i) => (g.faces[i] ? v - grad[i] : 0)),
					2
				);
				upload(engine.pressure.read, q, 1);
			}
			let tentative: Float32Array | undefined;
			engine.onBeforeProject = exact
				? () => {
						tentative = engine.read(engine.velocity.read, 2);
				  }
				: undefined;
			const count = Math.round(seconds / engine.options.dt),
				interval = Math.round(1 / engine.options.dt),
				start = performance.now();
			report.maxCfl ??= 0;
			const initialStep = Math.round(
				(raw.step * raw.options.dt) / engine.options.dt
			);
			for (
				let step = engine.stepCount - initialStep + 1;
				step <= count;
				step++
			) {
				if (Date.now() > deadline) {
					report.stopReason = '23-minute deadline';
					break;
				}
				engine.advance(1, false);
				if (exact) {
					const rhs = staggeredDivergence(g, tentative!),
						q = direct!.solve(rhs),
						grad = staggeredGradient(g, q);
					upload(
						engine.velocity.read,
						Float32Array.from(tentative!, (v, i) =>
							g.faces[i] ? v - grad[i] : 0
						),
						2
					);
					upload(engine.pressure.read, q, 1);
				}
				if (!everyStep) engine.advectDye();
				if (everyStep || step % interval === 0) {
					const columns = engine.readColumns(),
						meta = engine.geometry,
						fluxes = [0, 0.25, 0.5, 0.75, 1].map(
							(t) =>
								-columns[4 * (meta.plenum + Math.round(t * meta.valveWidth))]
						),
						flux = fluxes.reduce((a, b) => a + b, 0) / 5;
					let max = 0;
					for (let i = 1; i < columns.length; i += 4)
						max = Math.max(max, columns[i]);
					const row = {
						time: step * engine.options.dt,
						absoluteTime: engine.stepCount * engine.options.dt,
						flux,
						fluxes,
						re:
							((flux / meta.meanWidth) * meta.hydraulicDiameter) /
							engine.options.nu,
						spread:
							(Math.max(...fluxes) - Math.min(...fluxes)) / Math.max(...fluxes),
						probe: engine.probeTransverse(),
						unitProbes: everyStep ? engine.probeUnits() : undefined,
						inletProbe:
							!everyStep || step % interval === 0
								? engine.probeInlet()
								: undefined,
						cfl: max * engine.options.dt
					};
					report.rows.push(row);
					report.maxCfl = Math.max(report.maxCfl ?? 0, row.cfl);
					report.wallSeconds = (performance.now() - start) / 1000;
					if (!everyStep && step % (10 * interval) === 0) {
						report.dyeRows ??= [];
						report.dyeRows.push({ time: row.time, ...paperDyeMetrics(engine) });
					}
					if (!everyStep || step % interval === 0) {
						await save();
						await new Promise((r) => setTimeout(r, 0));
					}
				}
			}
			report.lastStep = engine.stepCount;
			report.segments ??= [];
			report.segments.push({
				lockAcquired: new Date(acquired).toISOString(),
				endStep: engine.stepCount,
				wallSeconds: (performance.now() - start) / 1000,
				stopReason: report.stopReason ?? null
			});
			const checkpoint = engine.checkpoint(),
				encode = (a: number[]) => {
					const bytes = new Uint8Array(Float32Array.from(a).buffer);
					let s = '';
					for (let i = 0; i < bytes.length; i += 8192)
						s += String.fromCharCode(...bytes.subarray(i, i + 8192));
					return btoa(s);
				};
			await io.writeBenchJson(
				`.svelte-kit/paper-flow/${name}-checkpoint.json`,
				JSON.stringify({
					...checkpoint,
					velocity: encode(checkpoint.velocity),
					pressure: encode(checkpoint.pressure),
					dye: encode(checkpoint.dye)
				})
			);
			report.completed = engine.stepCount - initialStep >= count;
			report.dyeMetrics = paperDyeMetrics(engine);
			engine.render();
			await io.writeBenchBase64(
				`.svelte-kit/paper-flow/${name}.png`,
				canvas.toDataURL().split(',')[1]
			);
			expect(engine.gl.getError()).toBe(engine.gl.NO_ERROR);
		} catch (error) {
			report.error = String(error);
			throw error;
		} finally {
			await save();
			engine.dispose();
		}
	},
	1450000
);
