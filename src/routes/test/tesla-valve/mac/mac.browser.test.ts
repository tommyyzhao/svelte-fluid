import { expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import {
	PaperMacEngine,
	type MacOptions,
	type MacCheckpoint
} from './engine.js';
import { paperDyeMetrics, summarize } from './metrics.js';
import { staggeredDivergence } from '$lib/engine/staggered.js';
import { renderer } from '$lib/engine/__benches__/renderer.js';

const io = commands as unknown as {
	writeBenchJson(path: string, data: string): Promise<void>;
	writeBenchBase64(path: string, data: string): Promise<void>;
	readBenchBase64(path: string): Promise<string>;
};
const extra = import.meta.env.SVELTE_FLUID_SHOTS_EXTRA || '';

const digest = async (values: ArrayBufferView) =>
	[
		...new Uint8Array(
			await crypto.subtle.digest(
				'SHA-256',
				new Uint8Array(
					values.buffer as ArrayBuffer,
					values.byteOffset,
					values.byteLength
				)
			)
		)
	]
		.map((v) => v.toString(16).padStart(2, '0'))
		.join('');

// Frozen pre-options engine, hardware Chrome/ANGLE Metal, 12 steps, 240-wide valve.
const reference = [
	{
		direction: 1,
		noiseAcceleration: 0,
		cells: 'dc714a21b8540193765bfe79946d66f596c7b8ac021f0ce206ad6557d1eb0eca',
		faces: 'b069965469958c26ddf32e45777db58bcec7234231212cdde0382f2279efc328',
		velocity:
			'1e0dfefe6c3e00efbb39d51181304f7c3878c6972966e38b099b8310ba362dcb',
		pressure:
			'787fdfd8f027cf06421467d8d2b1b089fec6c66e75a5c22b7952b566db310897',
		dye: '807cc6974c11fd7dfb2d03c049a886ffaf5e742a1045d94171099f42692aec68',
		tracers: '1fe8f5bbaa8f4030998e75fbe20f2b9a465c7fe93b77e788696ddcbe4f55d4f0'
	},
	{
		direction: 1,
		noiseAcceleration: 0.03,
		cells: 'dc714a21b8540193765bfe79946d66f596c7b8ac021f0ce206ad6557d1eb0eca',
		faces: 'b069965469958c26ddf32e45777db58bcec7234231212cdde0382f2279efc328',
		velocity:
			'be51ad01901f017f2a95368531b86edad6b1a3d8c3bcada7622aa01f05a44208',
		pressure:
			'0e7057a4b69f0076d20ee0c304918fc81bbc2f7d5e9f738a6b85a3033ec47914',
		dye: 'aa61b792c084d789716100a8b9cba374bf18ee752aaeced66f83f3aa1f6d2cae',
		tracers: 'd52c199d4a0aecf76fa412c8c3a6e0bd82daae00c55647bc9b019220d0844293'
	},
	{
		direction: -1,
		noiseAcceleration: 0,
		cells: 'dc714a21b8540193765bfe79946d66f596c7b8ac021f0ce206ad6557d1eb0eca',
		faces: 'b069965469958c26ddf32e45777db58bcec7234231212cdde0382f2279efc328',
		velocity:
			'6d44536ecc0fdfec048893ceaedcbe2a3e21a24c1fc0c512f1f5141c9ee26519',
		pressure:
			'62af2f8815f831ccd1b4e8501e8bfeb201b26a353dbc87df467559b5510f5a24',
		dye: '48439240f61c3a19d550c28176d7ff7e5d509500ae08d783e13aace6afe88154',
		tracers: '43b653ddd6eab01b318ccf3e5acdcc294aa0b108072bfaf9b21432dd7f80c127'
	},
	{
		direction: -1,
		noiseAcceleration: 0.03,
		cells: 'dc714a21b8540193765bfe79946d66f596c7b8ac021f0ce206ad6557d1eb0eca',
		faces: 'b069965469958c26ddf32e45777db58bcec7234231212cdde0382f2279efc328',
		velocity:
			'16a29176ff3ff60261db6e55d283daa2d80b7049c0264886bddf9c27a2b6f8b4',
		pressure:
			'910fcb8bca864054f8002351f0bd8b351248b0ffafd882cb21f508d2d0409061',
		dye: '31eaed44e77fdd258b544e175f6dc76783f2fd9e736872547fcc823ca5da1c02',
		tracers: '535f5290e9681ca7f9c3648d14ade9eb6ccc6e65545eded5c88695a3ad0a9daf'
	}
] as const;

// Pins are ANGLE Metal captures (identical on M1/M2); other backends round differently.
it.runIf(/ANGLE Metal/.test(renderer))('pins pre-options hardware field bytes in both directions', async () => {
	for (const hashes of reference) {
		const { direction, noiseAcceleration } = hashes;
		for (const explicit of [false, true]) {
			const current = new PaperMacEngine(document.createElement('canvas'), {
				direction,
				force: 0.4,
				width: 240,
				dyeScale: 3,
				pressureSweeps: 16,
				noiseAcceleration,
				dye: 'tracers',
				...(explicit
					? {
							nu: 1.8,
							dt: 1 / 120,
							bufferRate: 10,
							targetRe: 200,
							plenumWidths: 4,
							spongeWidths: 1,
							pressureSolver: 'jacobi' as const,
							disturbance: {
								centerWidths: 2.25,
								halfWidthWidths: 0.7,
								timeFactor: 0.05,
								spatialDivisor: 3,
								seed: 704
							},
							filament: {
								widthCm: (0.755622 * 2) / 36,
								spacingCm: (0.755622 * 11) / 36
							},
							tracers: { capacity: 262144, rate: 2048, sigma: 0.25 }
					  }
					: {})
			});
			try {
				current.advance(12);
				expect(await digest(current.geometry.grid.cells)).toBe(hashes.cells);
				expect(await digest(current.geometry.grid.faces)).toBe(hashes.faces);
				for (const [key, components] of [
					['velocity', 2],
					['pressure', 1],
					['dye', 4]
				] as const)
					expect(
						await digest(current.read(current[key].read, components)),
						`${direction}/${noiseAcceleration}/${explicit}/${key}`
					).toBe(hashes[key]);
				expect(await digest(current.read(current.tracers!.state.read, 4))).toBe(
					hashes.tracers
				);
			} finally {
				current.dispose();
			}
		}
	}
});

it('route MAC geometry, finite faces, explicit disposal', async () => {
	const canvas = document.createElement('canvas');
	const engine = new PaperMacEngine(canvas, {
		direction: 1,
		force: 0.1,
		width: 240,
		dyeScale: 1,
		pressureSweeps: 16
	});
	try {
		const digest = async (bytes: Uint8Array) =>
			[
				...new Uint8Array(
					await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes))
				)
			]
				.map((v) => v.toString(16).padStart(2, '0'))
				.join('');
		expect(await digest(engine.geometry.grid.cells)).toBe(
			'dc714a21b8540193765bfe79946d66f596c7b8ac021f0ce206ad6557d1eb0eca'
		);
		expect(await digest(engine.geometry.grid.faces)).toBe(
			'b069965469958c26ddf32e45777db58bcec7234231212cdde0382f2279efc328'
		);
		const beforeCells = engine.geometry.grid.cells.slice(),
			beforeFaces = engine.geometry.grid.faces.slice();
		engine.advance(3);
		expect(engine.geometry.grid.cells).toEqual(beforeCells);
		expect(engine.geometry.grid.faces).toEqual(beforeFaces);
		const columns = engine.readColumns();
		expect([...columns].every(Number.isFinite)).toBe(true);
		expect(engine.geometry.meanWidth).toBeGreaterThan(6);
		expect(engine.gl.getError()).toBe(engine.gl.NO_ERROR);
		const checkpoint = engine.checkpoint();
		engine.restore(checkpoint);
		expect(engine.stepCount).toBe(3);
		engine.render();
	} finally {
		engine.dispose();
		engine.dispose();
	}
});

it('a no-op diagnostic hook leaves seeded faces and pressure byte-identical', () => {
	const options: MacOptions = {
		direction: -1,
		force: 0.4,
		width: 240,
		dyeScale: 1,
		pressureSweeps: 16,
		noiseAcceleration: 0.03
	};
	const a = new PaperMacEngine(document.createElement('canvas'), options);
	const b = new PaperMacEngine(document.createElement('canvas'), options);
	b.pressureSolverOverride = undefined;
	try {
		b.onBeforeProject = () => {};
		a.advance(12, false);
		b.advance(12, false);
		expect(new Uint8Array(a.read(a.velocity.read, 2).buffer)).toEqual(
			new Uint8Array(b.read(b.velocity.read, 2).buffer)
		);
		expect(new Uint8Array(a.read(a.pressure.read, 1).buffer)).toEqual(
			new Uint8Array(b.read(b.pressure.read, 1).buffer)
		);
	} finally {
		a.dispose();
		b.dispose();
	}
});

it('isolated sponge preserves section flux and damps transverse energy', async () => {
	const e = new PaperMacEngine(document.createElement('canvas'), {
		direction: 1,
		force: 0.4,
		width: 240,
		dyeScale: 1,
		pressureSweeps: 16,
		plenumWidths: 5,
		spongeWidths: 2
	});
	try {
		const {
			gl,
			geometry: { grid: g }
		} = e;
		const field = new Float32Array(g.faces.length);
		for (let i = 0; i < field.length; i += 2) {
			field[i] = g.faces[i] ? 2 + (i % 7) * 0.125 : 0;
			field[i + 1] = g.faces[i + 1] ? 0.5 + (i % 11) * 0.0625 : 0;
		}
		gl.bindTexture(gl.TEXTURE_2D, e.velocity.read.texture);
		gl.texSubImage2D(
			gl.TEXTURE_2D,
			0,
			0,
			0,
			g.width + 1,
			g.height + 1,
			gl.RG,
			gl.FLOAT,
			field
		);
		const before = e.readColumns();
		const pass = e as unknown as {
			flip(
				name: string,
				setup: (p: { uniforms: Record<string, WebGLUniformLocation> }) => void
			): void;
		};
		e.reduceColumns();
		pass.flip('sponge', (p) => {
			gl.uniform1f(p.uniforms.uWidth, e.geometry.buffer);
			gl.uniform1f(p.uniforms.dt, e.options.dt);
			gl.uniform1f(p.uniforms.uRate, e.options.bufferRate);
		});
		const after = e.readColumns(),
			faces = e.read(e.velocity.read, 2);
		let relativeFluxError = 0,
			beforeEnergy = 0,
			afterEnergy = 0;
		for (let i = 0; i < before.length; i += 4)
			relativeFluxError = Math.max(
				relativeFluxError,
				Math.abs(after[i] - before[i]) / Math.max(1e-20, Math.abs(before[i]))
			);
		for (let i = 1; i < field.length; i += 2) {
			beforeEnergy += field[i] ** 2;
			afterEnergy += faces[i] ** 2;
		}
		expect(relativeFluxError).toBeLessThanOrEqual(1e-6);
		expect(afterEnergy).toBeLessThan(beforeEnergy);
		console.log(
			'LAB_CORE_SPONGE',
			JSON.stringify({ relativeFluxError, beforeEnergy, afterEnergy })
		);
		await io.writeBenchJson(
			'.svelte-kit/lab-core-sponge.json',
			JSON.stringify({ relativeFluxError, beforeEnergy, afterEnergy })
		);
	} finally {
		e.dispose();
	}
});

it('zero disturbance equals omission; non-default seed is deterministic and changes velocity', async () => {
	const options: MacOptions = {
		direction: -1,
		force: 0.4,
		width: 240,
		dyeScale: 1,
		pressureSweeps: 16
	};
	const engines = [
		{},
		{ noiseAcceleration: 0, disturbance: { seed: 13 } },
		{ noiseAcceleration: 0.03 },
		{ noiseAcceleration: 0.03, disturbance: { seed: 13 } },
		{ noiseAcceleration: 0.03, disturbance: { seed: 13 } }
	].map(
		(o) =>
			new PaperMacEngine(document.createElement('canvas'), { ...options, ...o })
	);
	try {
		for (const e of engines) e.advance(12);
		const hashes = await Promise.all(
			engines.map((e) => digest(e.read(e.velocity.read, 2)))
		);
		expect(hashes[0]).toBe(hashes[1]);
		expect(hashes[2]).not.toBe(hashes[3]);
		expect(hashes[3]).toBe(hashes[4]);
		const saved = engines[0].checkpoint();
		saved.options = {
			direction: -1,
			force: 0.4,
			width: 240,
			dyeScale: 1,
			pressureSweeps: 16
		};
		engines[0].restore(saved);
		expect(() =>
			engines[0].restore({
				...saved,
				options: { ...saved.options, disturbance: { seed: 13 } }
			})
		).toThrow(/Incompatible/);
		console.log('LAB_CORE_SEEDS', JSON.stringify(hashes));
	} finally {
		engines.forEach((e) => e.dispose());
	}
});

it('pressure override runs after divergence instead of Jacobi, before gradient', () => {
	const e = new PaperMacEngine(document.createElement('canvas'), {
		direction: 1,
		force: 0.4,
		width: 240,
		dyeScale: 1,
		pressureSweeps: 16
	});
	try {
		let calls = 0;
		e.pressureSolverOverride = () => {
			calls++;
			expect(e.read(e.divergence, 1).some((v) => v !== 0)).toBe(true);
			expect(e.read(e.pressure.read, 1).every((v) => v === 0)).toBe(true);
		};
		e.advance(1, false);
		expect(calls).toBe(1);
		expect(e.read(e.pressure.read, 1).every((v) => v === 0)).toBe(true);
		e.pressureSolverOverride = undefined;
		e.advance(1, false);
		expect(e.read(e.pressure.read, 1).some((v) => v !== 0)).toBe(true);
	} finally {
		e.dispose();
	}
});

it('both filament species cross both open mouth seams without a mass deficit', async () => {
	for (const direction of [1, -1] as const) {
		const engine = new PaperMacEngine(document.createElement('canvas'), {
			direction,
			force: 1,
			width: 1080,
			dyeScale: 3,
			dt: 1 / 120,
			pressureSweeps: 2
		});
		try {
			const g = engine.geometry,
				gl = engine.gl,
				velocity = new Float32Array(g.grid.faces.length);
			// Uniform plug flow isolates injection/transport, not pressure or wall drag.
			for (let i = 0; i < velocity.length; i += 2)
				if (g.grid.faces[i]) velocity[i] = direction * 40;
			gl.bindTexture(gl.TEXTURE_2D, engine.velocity.read.texture);
			gl.texSubImage2D(
				gl.TEXTURE_2D,
				0,
				0,
				0,
				g.grid.width + 1,
				g.grid.height + 1,
				gl.RG,
				gl.FLOAT,
				velocity
			);
			for (let i = 0; i < 15; i++) engine.advectDye();
			const dye = engine.read(engine.dye.read, 4),
				mass = [0, 0],
				expected = [0, 0];
			const sourceX =
				direction > 0 ? g.plenum - 3.5 : g.plenum + g.valveWidth + 3.5;
			const sourceColumns = Array.from({ length: engine.dye.width }, (_, x) =>
				Math.abs((x + 0.5) / 3 - sourceX) < 0.5 ? 1 : 0
			).reduce<number>((a, b) => a + b, 0);
			for (let y = 0; y < engine.dye.height; y++) {
				const p = (y + 0.5) / 3,
					center = g.mouths[direction > 0 ? 0 : 1];
				for (let c = 0; c < 2; c++) {
					const offset =
						(c === 0 ? -0.5 : 0.5) * ((0.755622 * 11) / 36) * g.cellsPerCm;
					if (
						Math.abs(p - center - offset) <=
						(((0.755622 * 2) / 36) * g.cellsPerCm) / 2
					)
						expected[c] += sourceColumns + 14;
				}
			}
			for (let y = 0; y < engine.dye.height; y++)
				for (let x = 0; x < engine.dye.width; x++) {
					const vx = (x + 0.5) / 3;
					if (
						direction * (vx - sourceX) < -0.5 ||
						direction * (vx - sourceX) > 7
					)
						continue;
					const i = (y * engine.dye.width + x) * 4;
					mass[0] += dye[i];
					mass[1] += dye[i + 1];
				}
			await io.writeBenchJson(
				`.svelte-kit/paper-flow/source-mass-${direction}.json`,
				JSON.stringify({
					direction,
					mass,
					expected,
					ratios: mass.map((m, c) => m / expected[c])
				})
			);
			for (let c = 0; c < 2; c++)
				expect(
					Math.abs(mass[c] / expected[c] - 1),
					`direction ${direction}, species ${c}`
				).toBeLessThanOrEqual(0.05);
			expect(gl.getError()).toBe(gl.NO_ERROR);
		} finally {
			engine.dispose();
		}
	}
}, 60_000);

it.skipIf(!extra.startsWith('paper-mac:'))(
	'measurement: route MAC plenums calibration and G1',
	async () => {
		// paper-mac:name,force,direction,seconds,width,sweeps,dt,resume,dyeScale,noiseAcceleration,targetRe,preroll
		const [
			name,
			forceText,
			directionText,
			secondsText,
			widthText,
			sweepsText,
			dtText,
			resumeText,
			dyeText,
			noiseText,
			reText,
			prerollText,
			nuText
		] = extra.slice('paper-mac:'.length).split(',');
		if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Invalid run name');
		const options: MacOptions = {
			direction: Number(directionText) > 0 ? 1 : -1,
			force: Number(forceText),
			width: Number(widthText || 1080),
			pressureSweeps: Number(sweepsText || 64),
			dt: Number(dtText || 1 / 120),
			dyeScale: Number(dyeText || 3),
			noiseAcceleration: Number(noiseText || 0),
			targetRe: Number(reText || 200),
			nu: Number(nuText || 1.8)
		};
		const dir = '.svelte-kit/paper-flow',
			output = `${dir}/${name}.json`,
			checkpointPath = `${dir}/${name}-checkpoint.json`;
		const owner = atob(
			await io.readBenchBase64('/tmp/svelte-fluid-gpu.lock/owner')
		).trim();
		if (!owner.startsWith('paper-flow '))
			throw new Error('GPU lock not owned by paper-flow');
		const acquired = Date.parse(
			atob(
				await io.readBenchBase64('/tmp/svelte-fluid-gpu.lock/acquired-at')
			).trim()
		);
		if (!Number.isFinite(acquired))
			throw new Error('Invalid GPU acquisition timestamp');
		const deadline = acquired + 23 * 60_000;
		const canvas = document.createElement('canvas');
		canvas.width = 1920;
		canvas.height = 224;
		document.body.append(canvas);
		const engine = new PaperMacEngine(canvas, options),
			o = engine.options,
			g = engine.geometry;
		let report: any = {
			options: o,
			dyeAdvanced: o.dyeScale > 1,
			geometry: {
				valveWidth: g.valveWidth,
				height: g.height,
				meanWidth: g.meanWidth,
				plenum: g.plenum,
				cellsPerCm: g.cellsPerCm,
				hydraulicDiameter: g.hydraulicDiameter
			},
			cflMethod:
				'Every-step GPU column maximum reduction, synchronous 1-row Float32 readback; max absolute MAC component times fixed dt',
			edgeMethod:
				'Every-step post-projection outer-face KE/volume reduction, right endpoint dt integration',
			rows: [],
			maxCfl: 0,
			maxQ: 0,
			edges: Array(8).fill(0),
			wallSeconds: 0,
			completed: false
		};
		const started = performance.now();
		const save = () =>
			io.writeBenchJson(output, JSON.stringify(report, null, 2));
		try {
			if (resumeText === '1') {
				report = JSON.parse(atob(await io.readBenchBase64(output)));
				const state = JSON.parse(
					atob(await io.readBenchBase64(checkpointPath))
				);
				for (const field of ['velocity', 'pressure', 'dye'])
					if (typeof state[field] === 'string') {
						const bytes = Uint8Array.from(atob(state[field]), (c) =>
							c.charCodeAt(0)
						);
						state[field] = [...new Float32Array(bytes.buffer)];
					}
				engine.restore(state as MacCheckpoint);
			}
			report.completed = false;
			report.segments ??= [];
			const segmentStartStep = engine.stepCount;
			delete report.stopReason;
			delete report.summary;
			const targetStep = Math.round(Number(secondsText || 60) / o.dt),
				sampleSteps = Math.round(1 / o.dt);
			for (; engine.stepCount < targetStep; ) {
				if (Date.now() > deadline) {
					report.stopReason = '23-minute checkpoint deadline';
					break;
				}
				engine.advance(
					1,
					o.dyeScale > 1 && engine.stepCount * o.dt >= Number(prerollText || 0)
				);
				const columns = engine.readColumns(),
					edges = engine.readEdges();
				let maximum = 0,
					qmax = 0,
					invalid = false;
				for (let x = 0; x < columns.length; x += 4) {
					maximum = Math.max(maximum, columns[x + 1]);
					qmax = Math.max(qmax, columns[x + 2]);
					invalid ||= columns[x + 3] > 0.5;
				}
				report.maxCfl = Math.max(report.maxCfl, maximum * o.dt);
				report.maxQ = Math.max(report.maxQ, qmax);
				for (let i = 0; i < 8; i++) report.edges[i] += edges[i] * o.dt;
				if (
					invalid ||
					!Number.isFinite(maximum) ||
					!Number.isFinite(qmax) ||
					![...edges].every(Number.isFinite)
				) {
					report.stopReason = 'NaN/nonfinite';
					break;
				}
				if (maximum * o.dt > 1) {
					report.stopReason = 'CFL > 1';
					break;
				}
				if (engine.stepCount % sampleSteps === 0) {
					const positions = [0, 0.25, 0.5, 0.75, 1].map(
						(x) => g.plenum + Math.round(x * g.valveWidth)
					);
					const fluxes = positions.map((x) => columns[x * 4] * o.direction);
					const flux = fluxes.reduce((a, b) => a + b, 0) / 5;
					let maxDivergence = 0;
					for (const value of staggeredDivergence(
						g.grid,
						engine.read(engine.velocity.read, 2)
					))
						maxDivergence = Math.max(maxDivergence, Math.abs(value));
					const row = {
						time: engine.stepCount * o.dt,
						normalizedDivergence:
							maxDivergence / Math.max(Math.abs(flux) / g.meanWidth, 1e-20),
						fluxes,
						flux,
						re: ((flux / g.meanWidth) * g.hydraulicDiameter) / o.nu,
						spread:
							(Math.max(...fluxes) - Math.min(...fluxes)) /
							Math.max(...fluxes.map(Math.abs)),
						qmax,
						cfl: maximum * o.dt,
						probe: engine.probeTransverse(),
						unitProbes: engine.probeUnits(),
						inletProbe: engine.probeInlet()
					};
					if (o.dyeScale > 1 && engine.stepCount % (10 * sampleSteps) === 0) {
						report.dyeRows ??= [];
						report.dyeRows.push({ time: row.time, ...paperDyeMetrics(engine) });
					}
					report.rows.push(row);
					report.lastStep = engine.stepCount;
					report.wallSecondsThisSegment = (performance.now() - started) / 1000;
					console.log(
						'PAPER MAC',
						JSON.stringify({
							name,
							...row,
							wall: report.wallSecondsThisSegment
						})
					);
					await save();
					await new Promise((r) => setTimeout(r, 0));
				}
			}
			report.lastStep = engine.stepCount;
			report.completed = engine.stepCount === targetStep;
			report.wallSeconds += (performance.now() - started) / 1000;
			report.segments.push({
				startStep: segmentStartStep,
				endStep: engine.stepCount,
				wallSeconds: (performance.now() - started) / 1000,
				lockAcquired: new Date(acquired).toISOString(),
				stopReason: report.stopReason ?? null
			});
			if (report.rows.length) {
				// St_D≈1 is a conservative prior bandwidth, not a measured shedding rate.
				report.summary = summarize(
					report.rows,
					g.meanWidth,
					g.valveWidth,
					(o.targetRe * o.nu) / g.hydraulicDiameter ** 2
				);
				report.g1 = {
					duration: report.summary.durationInFlowTimes >= 22,
					finite: !report.stopReason && !report.error,
					cfl: report.maxCfl <= 1,
					conservation: report.summary.spread <= 0.01,
					pressureBounded: !report.summary.sustainedPressureGrowth
				};
				const afterSpinup = report.rows.filter((r: any) => r.time >= 40);
				const instantaneousPasses = afterSpinup.filter(
					(r: any) => r.normalizedDivergence <= 0.001 && r.spread <= 0.02
				).length;
				report.instantaneousConservation = {
					samples: afterSpinup.length,
					passFraction: instantaneousPasses / Math.max(1, afterSpinup.length),
					maxNormalizedDivergence: Math.max(
						...afterSpinup.map((r: any) => r.normalizedDivergence ?? Infinity)
					),
					requiredPassFraction: 0.95
				};
				if (o.targetRe >= 400)
					report.g1.instantaneous =
						report.instantaneousConservation.passFraction >= 0.95;
				report.g1.originalPass =
					report.g1.duration &&
					report.g1.finite &&
					report.g1.cfl &&
					report.g1.conservation &&
					report.g1.pressureBounded;
				report.g1.pass = Object.values(report.g1).every(Boolean);
			}
			report.dyeMetrics = paperDyeMetrics(engine);
			if (o.dyeScale > 1) {
				const field = engine.read(engine.dye.read, 4),
					mass = [0, 0],
					byColumn: number[][] = [];
				for (let x = 0; x < engine.dye.width; x++) {
					let a = 0,
						b = 0;
					for (let y = 0; y < engine.dye.height; y++) {
						const i = (y * engine.dye.width + x) * 4;
						a += field[i];
						b += field[i + 1];
					}
					mass[0] += a;
					mass[1] += b;
					if (
						Math.abs(
							x / o.dyeScale -
								(o.direction > 0
									? g.plenum - 3.5
									: g.plenum + g.valveWidth + 3.5)
						) < 8
					)
						byColumn.push([x, a, b]);
				}
				report.sourceAudit = { mass, byColumn };
			}
			const checkpoint = engine.checkpoint();
			const encode = (values: number[]) => {
				const bytes = new Uint8Array(Float32Array.from(values).buffer);
				let binary = '';
				for (let i = 0; i < bytes.length; i += 8192)
					binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
				return btoa(binary);
			};
			await io.writeBenchJson(
				checkpointPath,
				JSON.stringify({
					...checkpoint,
					velocity: encode(checkpoint.velocity),
					pressure: encode(checkpoint.pressure),
					dye: encode(checkpoint.dye)
				})
			);
			engine.render();
			await io.writeBenchBase64(
				`${dir}/${name}.png`,
				canvas.toDataURL('image/png').split(',')[1]
			);
			expect(engine.gl.getError()).toBe(engine.gl.NO_ERROR);
		} catch (error) {
			report.error = String(error);
			throw error;
		} finally {
			await save();
			engine.dispose();
			canvas.remove();
		}
	},
	1_450_000
);
