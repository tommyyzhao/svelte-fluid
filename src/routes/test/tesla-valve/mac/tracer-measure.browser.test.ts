import { expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { PaperMacEngine } from './engine.js';
import { PAPER_ISLAND_CENTERS, PAPER_VIEWBOX } from './geometry.js';
import { TRACERS } from './tracers.js';
import { PAPER_CARRIER } from '../tunings.js';

const io = commands as unknown as {
	writeBenchJson(path: string, data: string): Promise<void>;
	writeBenchBase64(path: string, data: string): Promise<void>;
	readBenchBase64(path: string): Promise<string>;
};
const extra = import.meta.env.SVELTE_FLUID_SHOTS_EXTRA || '';

it.skipIf(!extra.startsWith('paper-tracers:'))(
	'same-flow tracer/grid width, coverage, timing and screenshots',
	async () => {
		const name = extra.slice('paper-tracers:'.length);
		const checkpoints: Record<string, string> = {
			'paper-forward-re200-tracers': 'forward200final',
			'paper-reverse-re200-tracers': 'reverse200final',
			'paper-reverse-re400-tracers': 'reverse400dye'
		};
		if (!checkpoints[name]) throw new Error('Unknown measurement variant');
		const owner = atob(
			await io.readBenchBase64('/tmp/svelte-fluid-gpu.lock/owner')
		);
		if (!owner.startsWith('paper-tracers '))
			throw new Error('GPU lock not owned');
		const acquired = Number(
			atob(await io.readBenchBase64('/tmp/svelte-fluid-gpu.lock/acquired-at'))
		);
		const deadline = acquired * 1000 + 23 * 60_000;
		const state = JSON.parse(
			atob(
				await io.readBenchBase64(
					`.svelte-kit/paper-flow/${checkpoints[name]}-checkpoint.json`
				)
			)
		);
		for (const field of ['velocity', 'pressure', 'dye'])
			if (typeof state[field] === 'string') {
				const bytes = Uint8Array.from(atob(state[field]), (c) =>
					c.charCodeAt(0)
				);
				state[field] = [...new Float32Array(bytes.buffer)];
			}
		const canvas = document.createElement('canvas');
		canvas.width = 3240;
		canvas.height = 378;
		const engine = new PaperMacEngine(canvas, state.options);
		const dir = '.svelte-kit/paper-tracers';
		const report: any = {
			name,
			checkpoint: checkpoints[name],
			sameFlow: true,
			started: new Date().toISOString(),
			flow: state.options,
			complete: false
		};
		try {
			engine.restore(state);
			// Scalar inventory resets to incoming clear water, matching empty tracer inventory.
			const field = new Float32Array(engine.dye.width * engine.dye.height * 4);
			for (let i = 0; i < field.length; i += 4) {
				field[i + 2] = PAPER_CARRIER;
				field[i + 3] = 1;
			}
			engine.gl.bindTexture(engine.gl.TEXTURE_2D, engine.dye.read.texture);
			engine.gl.texSubImage2D(
				engine.gl.TEXTURE_2D,
				0,
				0,
				0,
				engine.dye.width,
				engine.dye.height,
				engine.gl.RGBA,
				engine.gl.FLOAT,
				field
			);
			const { PaperTracers } = await import('./tracers.js');
			const g = engine.geometry,
				gl = engine.gl;
			// Reuse the exact engine mask rather than introducing a second geometry.
			const mask = (engine as unknown as { dyeMask: WebGLTexture }).dyeMask;
			engine.tracers = new PaperTracers(
				gl,
				[g.grid.width, g.grid.height],
				mask,
				engine.options.dyeScale,
				{
					x:
						engine.options.direction > 0
							? g.plenum - 3.5
							: g.plenum + g.valveWidth + 3.5,
					y: g.mouths[engine.options.direction > 0 ? 0 : 1],
					width: ((0.755622 * 2) / 36) * g.cellsPerCm,
					spacing: ((0.755622 * 11) / 36) * g.cellsPerCm,
					direction: engine.options.direction
				}
			);
			const startStep = engine.stepCount;
			const speed =
				(engine.options.targetRe * engine.options.nu) / g.hydraulicDiameter;
			const duration = (1.4 * g.valveWidth) / speed;
			const target = startStep + Math.ceil(duration / engine.options.dt);
			const started = performance.now();
			while (engine.stepCount < target) {
				if (Date.now() > deadline) throw new Error('23-minute deadline');
				engine.advance(Math.min(24, target - engine.stepCount));
				await new Promise((r) => setTimeout(r, 0));
			}
			report.advanceWallSeconds = (performance.now() - started) / 1000;
			report.duration = duration;
			report.steps = target - startStep;
			engine.render();
			await io.writeBenchBase64(
				`${dir}/${name}.png`,
				canvas.toDataURL('image/png').split(',')[1]
			);
			const tracers = engine.tracers;
			const optical = engine.read(tracers.depth, 4);
			const grid = engine.read(engine.dye.read, 4);
			const supportCoverage = (
				first: number,
				last: number,
				flowOrder: boolean
			) => {
				const centers = PAPER_ISLAND_CENTERS.map(
					(x) => (x / PAPER_VIEWBOX[2]) * g.valveWidth
				);
				const bounds = [
					0,
					...centers.slice(1).map((x, i) => (x + centers[i]) / 2),
					g.valveWidth
				];
				const units = Array.from(
					{ length: last - first + 1 },
					(_, i) => first + i
				);
				const indices = units.map((u) =>
					flowOrder && engine.options.direction < 0 ? 11 - u : u - 1
				);
				let bearing = 0,
					covered = 0,
					wetPixels = 0,
					supported = 0;
				const maxima: number[] = [];
				for (
					let x = Math.ceil(
						(g.plenum + bounds[Math.min(...indices)]) * engine.options.dyeScale
					);
					x <
					(g.plenum + bounds[Math.max(...indices) + 1]) *
						engine.options.dyeScale;
					x++
				) {
					let maximum = 0;
					for (let y = 0; y < engine.dye.height; y++) {
						const i = (y * engine.dye.width + x) * 4;
						const blue = Math.max(
							0,
							(optical[i] * 0.05 - optical[i + 1] * 2) / -3.7
						);
						maximum = Math.max(maximum, blue);
						const vx =
								Math.floor((x + 0.5) / engine.options.dyeScale) - g.plenum,
							vy = Math.floor((y + 0.5) / engine.options.dyeScale);
						if (g.valve.cells[vy * g.valveWidth + vx]) {
							wetPixels++;
							if (optical[i + 3] > 1e-6) supported++;
						}
						if (grid[i] + grid[i + 1] > 0.05) {
							bearing++;
							if (optical[i + 3] > 1e-6) covered++;
						}
					}
					maxima.push(maximum);
				}
				const sorted = maxima.slice().sort((a, b) => a - b),
					threshold = 0.1 * sorted[Math.floor(sorted.length / 2)];
				let gap = 0,
					maxGap = 0,
					gaps = 0,
					present = 0;
				for (const value of maxima)
					if (value >= threshold && value > 1e-6) {
						present++;
						gap = 0;
					} else {
						if (!gap) gaps++;
						maxGap = Math.max(maxGap, ++gap);
					}
				return {
					first,
					last,
					numbering: flowOrder ? 'flow-order' : 'left-to-right',
					fixedSupportSigma: TRACERS.sigma,
					opticalSupportThreshold: 1e-6,
					gridBearingThreshold: 0.05,
					supportCoverageInGridBearing: covered / Math.max(1, bearing),
					supportCoverageInWetArea: supported / Math.max(1, wetPixels),
					blueAxialCoverage: present / maxima.length,
					blueAxialThreshold: threshold,
					blueGapRuns: gaps,
					maxBlueGapCm: maxGap / engine.options.dyeScale / g.cellsPerCm
				};
			};
			report.regionalCoverage = name.includes('forward')
				? [supportCoverage(10, 11, true)]
				: name.includes('400')
				? [supportCoverage(1, 7, false), supportCoverage(1, 7, true)]
				: [];
			engine.tracers = null;
			engine.render();
			await io.writeBenchBase64(
				`${dir}/${name.replace('-tracers', '-grid')}.png`,
				canvas.toDataURL('image/png').split(',')[1]
			);
			engine.tracers = tracers;
			const particle = engine.read(tracers.state.read, 4);
			let alive = 0,
				mass = 0,
				substepSum = 0,
				maxSubsteps = 0;
			for (let i = 0; i < particle.length; i += 4)
				if (particle[i + 2] > 0) {
					alive++;
					mass += particle[i + 2];
				}
			const faces = engine.read(engine.velocity.read, 2);
			const component = (x: number, y: number, c: number) => {
				x = Math.max(0, Math.min(c === 0 ? g.grid.width : g.grid.width - 1, x));
				y = Math.max(
					0,
					Math.min(c === 0 ? g.grid.height - 1 : g.grid.height, y)
				);
				const px = c === 0 ? (x === 0 ? g.grid.width : x - 1) : x;
				const py = c === 1 ? (y === 0 ? g.grid.height : y - 1) : y;
				return faces[(py * (g.grid.width + 1) + px) * 2 + c];
			};
			const sample = (x: number, y: number, c: number) => {
				x -= c === 0 ? 0 : 0.5;
				y -= c === 0 ? 0.5 : 0;
				const bx = Math.floor(x),
					by = Math.floor(y),
					fx = x - bx,
					fy = y - by;
				return (
					(component(bx, by, c) * (1 - fx) + component(bx + 1, by, c) * fx) *
						(1 - fy) +
					(component(bx, by + 1, c) * (1 - fx) +
						component(bx + 1, by + 1, c) * fx) *
						fy
				);
			};
			for (let i = 0; i < particle.length; i += 4)
				if (particle[i + 2] > 0) {
					const n = Math.max(
						1,
						Math.ceil(
							(Math.hypot(
								sample(particle[i], particle[i + 1], 0),
								sample(particle[i], particle[i + 1], 1)
							) *
								engine.options.dt) /
								TRACERS.substepTravel
						)
					);
					substepSum += n;
					maxSubsteps = Math.max(maxSubsteps, n);
				}
			const profileWidth = (values: number[]) => {
				const peak = Math.max(...values);
				if (peak < 0.01) return null;
				const center = values.indexOf(peak),
					half = peak / 2;
				let lo = center,
					hi = center;
				while (lo > 0 && values[lo - 1] >= half) lo--;
				while (hi < values.length - 1 && values[hi + 1] >= half) hi++;
				const left =
					lo > 0
						? lo - (values[lo] - half) / (values[lo] - values[lo - 1])
						: lo - 0.5;
				const right =
					hi < values.length - 1
						? hi + (values[hi] - half) / (values[hi] - values[hi + 1])
						: hi + 0.5;
				return (right - left) / engine.options.dyeScale / g.cellsPerCm;
			};
			report.widths = [1, 6, 11].map((unit) => {
				const index = engine.options.direction > 0 ? unit - 1 : 11 - unit;
				const x = Math.round(
					(g.plenum +
						(PAPER_ISLAND_CENTERS[index] / PAPER_VIEWBOX[2]) * g.valveWidth) *
						engine.options.dyeScale
				);
				const profiles = [0, 1].map((species) => {
					const b: number[] = [],
						t: number[] = [];
					for (let y = 0; y < engine.dye.height; y++) {
						let gv = 0,
							tv = 0;
						for (let dx = -2; dx <= 2; dx++) {
							const i = (y * engine.dye.width + x + dx) * 4;
							gv += grid[i + species] / 5;
							// Recover species optical contribution from the linearly independent R/G coefficients.
							tv +=
								Math.max(
									0,
									species === 0
										? (optical[i] * 0.05 - optical[i + 1] * 2) /
												(6 * 0.05 - 2 * 2)
										: (optical[i + 1] * 6 - optical[i] * 2) / (6 * 0.05 - 2 * 2)
								) / 5;
						}
						b.push(gv);
						t.push(tv);
					}
					return {
						species: species === 0 ? 'blue' : 'green',
						gridCm: profileWidth(b),
						tracerCm: profileWidth(t),
						gridProfile: b,
						tracerProfile: t
					};
				});
				return { unit, profiles };
			});
			report.particles = {
				...tracers.budget,
				alive,
				carriedMassCells2: mass,
				substepsMean: substepSum / alive,
				substepsMax: maxSubsteps,
				quadFragmentsUpperBound:
					alive * (6 * TRACERS.sigma * engine.options.dyeScale) ** 2,
				overdrawFullTarget:
					(alive * (6 * TRACERS.sigma) ** 2) / (g.grid.width * g.grid.height)
			};
			// Replay identical velocity/scalar states for both full-frame timings.
			const timingState = engine.checkpoint();
			for (const mode of ['grid', 'tracers'] as const) {
				engine.tracers = mode === 'grid' ? null : tracers;
				engine.restore(timingState);
				engine.gpuFrameMs.length = 0;
				for (let i = 0; i < 400 && engine.gpuFrameMs.length < 35; i++) {
					if (Date.now() > deadline) throw new Error('23-minute deadline');
					engine.frame(4);
					gl.finish();
					await new Promise((r) => setTimeout(r, 16));
				}
				const values = engine.gpuFrameMs.slice(5).sort((a, b) => a - b);
				report[`${mode}GpuMs`] = values.length
					? {
							samples: values.length,
							median: values[Math.floor(values.length / 2)],
							p95: values[Math.floor(values.length * 0.95)]
					  }
					: null;
			}
			engine.tracers = tracers;
			report.complete = true;
			expect(gl.getError()).toBe(gl.NO_ERROR);
		} finally {
			await io.writeBenchJson(
				`${dir}/${name}.json`,
				JSON.stringify(report, null, 2)
			);
			engine.dispose();
		}
	},
	1_440_000
);
