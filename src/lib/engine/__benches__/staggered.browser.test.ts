import { expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import {
	staggeredGeometry,
	staggeredDivergence,
	staggeredLaplacian,
	staggeredGradient,
	type StaggeredGeometry
} from '../staggered.js';
import { viscosityAlpha } from '../FluidEngine.js';
import { TESLA_VALVE_CONFIG } from '../../presets/registry.js';
import { staggeredHarness } from './staggered-harness.js';
import {
	referencePressure,
	channelPath,
	lowestPressureMode
} from './staggered-reference.js';
import { renderer } from './renderer.js';
import {
	diagnoseArm,
	diagnosisArms,
	type DiagnosisArm
} from './staggered-diagnose.js';

it.skipIf(import.meta.env.SVELTE_FLUID_SHOTS_EXTRA !== 'staggered-diagnose')(
	'diagnostic: pressure, boundary and transport runaway isolation',
	async () => {
		const selected = import.meta.env.SVELTE_FLUID_SHOTS_DYE;
		const arms = [
			...diagnosisArms,
			'J+R-prime1',
			'J+R-prime2',
			'J-hotspot'
		].filter((arm) => arm === selected) as DiagnosisArm[];
		if (arms.length !== 1)
			throw new Error(
				'Select one diagnosis arm in SVELTE_FLUID_SHOTS_DYE; release GPU lock between arms'
			);
		const lockTime = Date.parse(
			atob(
				await (
					commands as unknown as {
						readBenchBase64(path: string): Promise<string>;
					}
				).readBenchBase64('/tmp/svelte-fluid-gpu.lock/acquired-at')
			).trim()
		);
		if (!Number.isFinite(lockTime))
			throw new Error('Missing GPU lock acquisition time');
		const multiplier = Number(import.meta.env.SVELTE_FLUID_MAC_BUDGET || 0);
		for (const arm of arms)
			await diagnoseArm(arm, valveGeometry(384), renderer, {
				deadlineMs: lockTime + 24 * 60_000,
				...(multiplier ? { forceMultiplier: multiplier } : {})
			});
	},
	1_450_000
);
import {
	faceEnergy,
	viscousLoss,
	kineticOutflow,
	forceWork
} from './staggered-energy.js';

const maxAbs = (a: ArrayLike<number>) => {
	let max = 0;
	for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i]));
	return max;
};
function metrics(g: StaggeredGeometry, velocity: ArrayLike<number>) {
	const divergence = staggeredDivergence(g, velocity);
	const positions = [
		0,
		Math.floor(g.width / 4),
		Math.floor(g.width / 2),
		Math.floor((3 * g.width) / 4),
		g.width
	];
	const fluxes = positions.map((x) => {
		let q = 0;
		for (let y = 0; y < g.height; y++) q += velocity[g.u(x, y)];
		return q;
	});
	let fluidArea = 0;
	for (const cell of g.cells) if (cell) fluidArea++;
	const meanWidth = fluidArea / g.width,
		speed = Math.max(Math.abs(fluxes[0]), Math.abs(fluxes[4])) / meanWidth;
	const telescopes = positions.slice(1).map((b, k) => {
		let sum = 0,
			absoluteBound = 0;
		for (let y = 0; y < g.height; y++)
			for (let x = positions[k]; x < b; x++) {
				const d = divergence[y * g.width + x];
				sum += d;
				absoluteBound += Math.abs(d);
			}
		return {
			fluxDifference: fluxes[k + 1] - fluxes[k],
			divergenceSum: sum,
			absoluteBound,
			error: Math.abs(fluxes[k + 1] - fluxes[k] - sum)
		};
	});
	return {
		maxDivergence: maxAbs(divergence),
		characteristicSpeed: speed,
		maximumSpeed: maxAbs(velocity),
		normalized: maxAbs(divergence) / Math.max(speed, 1e-30),
		fluxes,
		fluxSpread:
			(Math.max(...fluxes) - Math.min(...fluxes)) /
			Math.max(...fluxes.map(Math.abs)),
		meanWidth,
		telescopes
	};
}
function valveGeometry(n: number) {
	const shape = TESLA_VALVE_CONFIG.containerShape;
	if (shape?.type !== 'svgPath') throw new Error('Expected valve path');
	const maskW = shape.maskResolution ?? 512,
		maskH = Math.round(maskW / 3);
	const ctx = new OffscreenCanvas(maskW, maskH).getContext('2d')!;
	const [vx, vy, vw, vh] = shape.viewBox!,
		scale = Math.min(maskW / vw, maskH / vh);
	ctx.translate((maskW - vw * scale) / 2, (maskH - vh * scale) / 2);
	ctx.scale(scale, scale);
	ctx.translate(-vx, -vy);
	ctx.fill(new Path2D(shape.d!), shape.fillRule);
	const mask = ctx.getImageData(0, 0, maskW, maskH).data;
	return staggeredGeometry(
		3 * n,
		n,
		(x, y) =>
			mask[
				(Math.min(maskH - 1, Math.floor((1 - (y + 0.5) / n) * maskH)) * maskW +
					Math.min(maskW - 1, Math.floor(((x + 0.5) / (3 * n)) * maskW))) *
					4 +
					3
			] >= 128,
		{ left: 'open', right: 'open' }
	);
}

it('MAC GPU operators match CPU, CG ground truth and paired Jacobi', () => {
	const g = staggeredGeometry(40, 16, (x, y) => !(x === 20 && y > 7), {
			left: 'open',
			right: 'open'
		}),
		h = staggeredHarness(g);
	try {
		const velocity = Float32Array.from(g.faces, (open, i) =>
			open ? 2 + Math.sin(i * 0.33) : 0
		);
		h.upload(h.velocity.read, velocity, 2);
		h.computeDivergence();
		const rhs = h.read(h.divergence, 1),
			cpu = staggeredDivergence(g, velocity);
		expect(maxAbs(Float64Array.from(rhs, (d, i) => d - cpu[i]))).toBeLessThan(
			2e-6
		);
		const reference = referencePressure(g, rhs);
		expect(reference.relativeResidual).toBeLessThan(1.02e-10);
		h.upload(h.pressure.read, reference.pressure, 1);
		h.solve(20);
		h.subtract();
		expect(metrics(g, h.read(h.velocity.read, 2)).maxDivergence).toBeLessThan(
			2e-5
		);
		const results: Float32Array[] = [];
		for (const paired of [false, true]) {
			h.upload(h.pressure.read, new Float32Array(g.cells.length), 1);
			h.solve(40, paired);
			results.push(h.read(h.pressure.read, 1));
		}
		expect(
			maxAbs(Float32Array.from(results[0], (v, i) => v - results[1][i]))
		).toBeLessThan(2e-5);
		expect(h.gl.getError(), renderer).toBe(h.gl.NO_ERROR);
	} finally {
		h.dispose();
	}
});

it.skipIf(
	import.meta.env.SVELTE_FLUID_SHOTS_EXTRA !== 'staggered-residual-energy'
)(
	'diagnostic: residual-controlled adaptive projection and open-domain energy',
	async () => {
		const g = valveGeometry(384),
			h = staggeredHarness(g),
			baseDt = 1 / 240,
			force = 7,
			nu = viscosityAlpha(0.005, 1, g.width, g.height);
		const report: Record<string, unknown> = {
			renderer,
			baseDt,
			force,
			nu,
			rows: [],
			stop: ''
		};
		let time = 0,
			previousDt = baseDt,
			expensive = 0,
			totalSweeps = 0,
			nextSample = 1,
			cumulativeWork = 0,
			cumulativeViscous = 0,
			cumulativeOpen = 0,
			cumulativeProjection = 0,
			cumulativeTransport = 0;
		try {
			h.tentative(baseDt, force, nu);
			h.computeDivergence();
			const bootstrap = referencePressure(g, h.read(h.divergence, 1));
			h.upload(h.pressure.read, bootstrap.pressure, 1);
			h.subtract();
			let state = h.read(h.velocity.read, 2);
			const initialEnergy = faceEnergy(g, state);
			report.initialEnergy = initialEnergy;
			for (let step = 0; time < 30 - 1e-9 && step < 10000; step++) {
				const dt = Math.min(
					baseDt,
					0.49 / Math.max(maxAbs(state) + force * baseDt, 1e-10),
					30 - time
				);
				if (dt !== previousDt) {
					const p = h.read(h.pressure.read, 1);
					h.upload(
						h.pressure.read,
						Float64Array.from(p, (v) => (v * dt) / previousDt),
						1
					);
				}
				const beforeEnergy = faceEnergy(g, state),
					forced = Float64Array.from(
						state,
						(v, i) => v + (g.faces[i] && i % 2 === 0 ? force * dt : 0)
					),
					work = forceWork(g, state, forced, force, dt);
				h.tentative(dt, force, nu);
				h.computeDivergence();
				const tentative = h.read(h.velocity.read, 2),
					tentativeEnergy = faceEnergy(g, tentative),
					rhs = h.read(h.divergence, 1);
				let sweeps = 0,
					ratio = Infinity,
					candidate = new Float64Array(g.faces.length),
					p = new Float32Array(g.cells.length);
				while (sweeps < 20000) {
					const batch = Math.min(64, 20000 - sweeps);
					h.solve(batch);
					sweeps += batch;
					p = h.read(h.pressure.read, 1);
					const gradient = staggeredGradient(g, p);
					candidate = Float64Array.from(tentative, (v, i) => v - gradient[i]);
					const d = staggeredDivergence(g, candidate);
					let area = 0,
						qLeft = 0,
						qRight = 0;
					for (const cell of g.cells) if (cell) area++;
					for (let y = 0; y < g.height; y++) {
						qLeft += candidate[g.u(0, y)];
						qRight += candidate[g.u(g.width, y)];
					}
					const speed =
						Math.max(Math.abs(qLeft), Math.abs(qRight)) / (area / g.width);
					ratio = maxAbs(d) / Math.max(speed, 1e-30);
					if (ratio <= 1e-5) break;
				}
				h.subtract();
				state = h.read(h.velocity.read, 2);
				time += dt;
				previousDt = dt;
				totalSweeps += sweeps;
				const m = metrics(g, state),
					energy = faceEnergy(g, state),
					viscous = viscousLoss(g, tentative, nu) * dt,
					open =
						0.5 *
						(kineticOutflow(g, forced) + kineticOutflow(g, tentative)) *
						dt,
					projection = energy - tentativeEnergy,
					transport = tentativeEnergy - beforeEnergy - work;
				cumulativeWork += work;
				cumulativeViscous += viscous;
				cumulativeOpen += open;
				cumulativeProjection += projection;
				cumulativeTransport += transport;
				const row = {
					step,
					time,
					dt,
					sweeps,
					totalSweeps,
					preSubtractDoverU: ratio,
					qmax: maxAbs(p),
					cfl: m.maximumSpeed * dt,
					energy,
					work,
					viscous,
					openKineticFlux: open,
					openPressureWork: 0,
					projectionEnergy: projection,
					transportEnergy: transport,
					transportBudgetResidual: transport + viscous + open,
					cumulative: {
						work: cumulativeWork,
						viscous: cumulativeViscous,
						open: cumulativeOpen,
						projection: cumulativeProjection,
						transport: cumulativeTransport,
						energyChange: energy - initialEnergy,
						closure:
							energy -
							initialEnergy -
							cumulativeWork +
							cumulativeViscous +
							cumulativeOpen
					},
					...m
				};
				(report.rows as unknown[]).push(row);
				if (sweeps > 4096) expensive++;
				else expensive = 0;
				if (sweeps >= 20000) {
					report.stop = '20000-sweep cap';
					break;
				}
				if (expensive >= 8) {
					report.stop = '8 consecutive steps above4096 sweeps';
					break;
				}
				if (time >= nextSample) {
					await (
						commands as unknown as {
							writeBenchJson(p: string, s: string): Promise<void>;
						}
					).writeBenchJson(
						`${
							import.meta.env.SVELTE_FLUID_SHOTS_DIR || '.svelte-kit/staggered'
						}/residual-energy-n384.json`,
						JSON.stringify(report)
					);
					nextSample++;
					await new Promise((r) => setTimeout(r, 0));
				}
			}
			expect(h.gl.getError(), renderer).toBe(h.gl.NO_ERROR);
		} finally {
			await (
				commands as unknown as {
					writeBenchJson(p: string, s: string): Promise<void>;
				}
			).writeBenchJson(
				`${
					import.meta.env.SVELTE_FLUID_SHOTS_DIR || '.svelte-kit/staggered'
				}/residual-energy-n384.json`,
				JSON.stringify(report)
			);
			h.dispose();
		}
	},
	1_200_000
);

it.skipIf(import.meta.env.SVELTE_FLUID_SHOTS_EXTRA !== 'staggered-three-arm')(
	'diagnostic: high sweeps, globally controlled CFL and lowest-mode correction',
	async () => {
		const g = valveGeometry(384),
			h = staggeredHarness(g),
			baseDt = 1 / 240,
			nu = viscosityAlpha(0.005, 1, g.width, g.height),
			force = 7;
		const mode = await lowestPressureMode(g),
			av = staggeredLaplacian(g, mode.vector);
		let denominator = 0;
		for (let i = 0; i < av.length; i++) denominator += mode.vector[i] * av[i];
		const report: Record<string, unknown> = {
			renderer,
			force,
			nu,
			baseDt,
			cases: []
		};
		try {
			h.tentative(baseDt, force, nu);
			h.computeDivergence();
			const bootstrap = referencePressure(g, h.read(h.divergence, 1));
			h.upload(h.pressure.read, bootstrap.pressure, 1);
			h.subtract();
			const initialVelocity = h.read(h.velocity.read, 2),
				initialPressure = h.read(h.pressure.read, 1);
			for (const [label, iterations, adaptive, corrected, mac] of [
				['A-high-sweeps', 2560, false, false, true],
				['B-adaptive-cfl', 320, true, false, true],
				['C-rank1', 320, false, true, true]
			] as const) {
				h.upload(h.velocity.read, initialVelocity, 2);
				h.upload(h.pressure.read, initialPressure, 1);
				let time = 0,
					previousDt = baseDt,
					nextSample = 1,
					steps = 0,
					firstSpread: number | null = null,
					maxCfl = 0,
					maxD = 0,
					maxQ = 0;
				const rows: unknown[] = [];
				let lastVelocity = initialVelocity;
				while (time < 30 - 1e-9 && steps < 100_000) {
					const speed = maxAbs(lastVelocity),
						dt = adaptive
							? Math.min(
									baseDt,
									0.49 / Math.max(speed + force * baseDt, 1e-10),
									30 - time
							  )
							: Math.min(baseDt, 30 - time);
					if (adaptive && dt !== previousDt) {
						const pressure = h.read(h.pressure.read, 1);
						h.upload(
							h.pressure.read,
							Float64Array.from(pressure, (p) => (p * dt) / previousDt),
							1
						);
					}
					h.tentative(dt, force, nu, 20, true, mac);
					h.computeDivergence();
					h.solve(iterations);
					if (corrected) {
						const rhs = h.read(h.divergence, 1),
							p = h.read(h.pressure.read, 1),
							ap = staggeredLaplacian(g, p);
						let numerator = 0;
						for (let i = 0; i < ap.length; i++)
							numerator += mode.vector[i] * (-rhs[i] - ap[i]);
						const alpha = numerator / denominator;
						h.upload(
							h.pressure.read,
							Float64Array.from(p, (v, i) => v + alpha * mode.vector[i]),
							1
						);
					}
					h.subtract();
					time += dt;
					steps++;
					previousDt = dt;
					if (adaptive || time >= nextSample) {
						lastVelocity = h.read(h.velocity.read, 2);
						maxCfl = Math.max(maxCfl, maxAbs(lastVelocity) * dt);
					}
					if (time >= nextSample) {
						const m = metrics(g, lastVelocity);
						maxD = Math.max(maxD, m.normalized);
						if (time >= 1 && firstSpread === null && m.fluxSpread > 0.01)
							firstSpread = time;
						if (time >= nextSample || steps >= 100_000) {
							const qmax = maxAbs(h.read(h.pressure.read, 1));
							maxQ = Math.max(maxQ, qmax);
							rows.push({
								time,
								dt,
								steps,
								qmax,
								cfl: m.maximumSpeed * dt,
								rePaper: m.fluxes.map((q) => ((q / nu) * 8) / 9),
								...m
							});
							nextSample++;
							await new Promise((r) => setTimeout(r, 0));
						}
					}
				}
				const last = metrics(g, h.read(h.velocity.read, 2));
				(report.cases as unknown[]).push({
					label,
					iterations,
					adaptive,
					corrected,
					steps,
					time,
					firstSpreadAfter1s: firstSpread,
					maxCfl,
					maxD,
					maxQ,
					passes:
						time >= 30 && last.fluxSpread <= 0.01 && last.normalized <= 1e-5,
					rows
				});
				await (
					commands as unknown as {
						writeBenchJson(p: string, s: string): Promise<void>;
					}
				).writeBenchJson(
					`${
						import.meta.env.SVELTE_FLUID_SHOTS_DIR || '.svelte-kit/staggered'
					}/three-arm-n384.json`,
					JSON.stringify(report, null, 2)
				);
			}
			expect(h.gl.getError(), renderer).toBe(h.gl.NO_ERROR);
		} finally {
			h.dispose();
		}
	},
	3_600_000
);

it.skipIf(
	import.meta.env.SVELTE_FLUID_SHOTS_EXTRA !== 'staggered-valve-steady'
)(
	'gate 3 preflight: measured steady valve flux at target-regime forcing',
	async () => {
		const g = valveGeometry(384),
			h = staggeredHarness(g),
			dt = 1 / 240,
			nu = viscosityAlpha(0.005, 1, g.width, g.height),
			forceMagnitude = 7;
		const report: Record<string, unknown> = {
			renderer,
			dt,
			nu,
			forceMagnitude,
			cases: []
		};
		try {
			for (const direction of [1, -1]) {
				const force = direction * forceMagnitude;
				h.upload(h.velocity.read, new Float32Array(g.faces.length), 2);
				h.upload(h.pressure.read, new Float32Array(g.cells.length), 1);
				h.tentative(dt, force, nu);
				h.computeDivergence();
				const bootstrap = referencePressure(g, h.read(h.divergence, 1));
				h.upload(h.pressure.read, bootstrap.pressure, 1);
				h.subtract();
				const rows: {
					time: number;
					fluxes: number[];
					normalized: number;
					fluxSpread: number;
					cfl: number;
					qmax: number;
					rePaper: number[];
					growth: number;
				}[] = [];
				let previousFlux = 0,
					quiet = 0;
				for (let frame = 0; frame < Math.round(120 / dt); frame++) {
					h.tentative(dt, force, nu);
					h.project(320);
					if (frame % 240 === 239) {
						const m = metrics(g, h.read(h.velocity.read, 2)),
							flux = direction * m.fluxes[2],
							growth = previousFlux
								? Math.abs(flux - previousFlux) / Math.abs(previousFlux)
								: 1;
						previousFlux = flux;
						rows.push({
							time: (frame + 1) * dt,
							qmax: maxAbs(h.read(h.pressure.read, 1)),
							cfl: m.maximumSpeed * dt,
							rePaper: m.fluxes.map((q) => (((direction * q) / nu) * 8) / 9),
							growth,
							...m
						});
						if (growth < 0.001 && frame * dt > 30) quiet++;
						else quiet = 0;
						await new Promise((r) => setTimeout(r, 0));
						if (quiet >= 10) break;
					}
				}
				(report.cases as unknown[]).push({
					direction,
					steady: quiet >= 10,
					rows
				});
				await (
					commands as unknown as {
						writeBenchJson(p: string, s: string): Promise<void>;
					}
				).writeBenchJson(
					`${
						import.meta.env.SVELTE_FLUID_SHOTS_DIR || '.svelte-kit/staggered'
					}/valve-steady-n384.json`,
					JSON.stringify(report, null, 2)
				);
			}
			expect(h.gl.getError(), renderer).toBe(h.gl.NO_ERROR);
		} finally {
			h.dispose();
		}
	},
	1_800_000
);

it.skipIf(import.meta.env.SVELTE_FLUID_SHOTS_EXTRA !== 'staggered-poiseuille')(
	'gate 2: plane Poiseuille profile and flux improve at double resolution',
	async () => {
		const rows: { height: number; profileError: number; fluxError: number }[] =
			[];
		for (const height of [16, 32]) {
			const width = 4 * height,
				g = staggeredGeometry(width, height, () => true, {
					left: 'open',
					right: 'open'
				}),
				h = staggeredHarness(g),
				nu = viscosityAlpha(0.005, 1, width, height),
				dt = 1 / 120,
				force = height / 16;
			const qExact = (force * height ** 3) / (12 * nu),
				uMax = (force * height ** 2) / (8 * nu);
			try {
				// Start from the analytic profile; the steady stencil defect, not spin-up duration, is tested.
				const initial = new Float32Array(g.faces.length);
				for (let y = 0; y < height; y++)
					for (let x = 0; x <= width; x++)
						initial[g.u(x, y)] =
							(force * (y + 0.5) * (height - y - 0.5)) / (2 * nu);
				h.upload(h.velocity.read, initial, 2);
				for (let frame = 0; frame < 1200; frame++) {
					h.tentative(dt, force, nu);
					h.project(80);
					if (frame % 120 === 119) await new Promise((r) => setTimeout(r, 0));
				}
				const velocity = h.read(h.velocity.read, 2);
				let profileError = 0;
				for (let y = 0; y < height; y++) {
					const exact = (force * (y + 0.5) * (height - y - 0.5)) / (2 * nu);
					profileError = Math.max(
						profileError,
						Math.abs(velocity[g.u(width / 2, y)] - exact) / uMax
					);
				}
				const m = metrics(g, velocity),
					fluxError = Math.abs(m.fluxes[2] - qExact) / qExact;
				rows.push({ height, profileError, fluxError });
				await (
					commands as unknown as {
						writeBenchJson(p: string, s: string): Promise<void>;
					}
				).writeBenchJson(
					`${
						import.meta.env.SVELTE_FLUID_SHOTS_DIR || '.svelte-kit/staggered'
					}/poiseuille-n${height}.json`,
					JSON.stringify(
						{
							renderer,
							width,
							height,
							nu,
							dt,
							force,
							qExact,
							uMax,
							profileError,
							fluxError,
							...m
						},
						null,
						2
					)
				);
				expect(profileError).toBeLessThan(0.02);
				expect(fluxError).toBeLessThan(0.02);
				expect(h.gl.getError(), renderer).toBe(h.gl.NO_ERROR);
			} finally {
				h.dispose();
			}
		}
		expect(rows[1].profileError).toBeLessThan(rows[0].profileError);
		expect(rows[1].fluxError).toBeLessThan(rows[0].fluxError);
	},
	120000
);

it.skipIf(import.meta.env.SVELTE_FLUID_SHOTS_EXTRA !== 'staggered-low-force')(
	'bounded probe: Poiseuille-estimated Re200 in both directions',
	async () => {
		const g = valveGeometry(384),
			h = staggeredHarness(g),
			dt = 1 / 120,
			nu = viscosityAlpha(0.005, 1, g.width, g.height),
			path = channelPath(g);
		let area = 0;
		for (const cell of g.cells) if (cell) area++;
		const meanWidth = area / path,
			forces = [50, 200, 400].map((re) => ({
				estimatedReWidth: re,
				force: (12 * nu * nu * re) / meanWidth ** 3
			}));
		const report: Record<string, unknown> = {
			renderer,
			dt,
			nu,
			path,
			area,
			meanWidth,
			forces,
			cases: []
		};
		try {
			for (const iterations of [160, 320])
				for (const direction of [1, -1]) {
					const force = direction * forces[1].force;
					h.upload(h.velocity.read, new Float32Array(g.faces.length), 2);
					h.upload(h.pressure.read, new Float32Array(g.cells.length), 1);
					h.tentative(dt, force, nu);
					h.computeDivergence();
					const bootstrap = referencePressure(g, h.read(h.divergence, 1));
					h.upload(h.pressure.read, bootstrap.pressure, 1);
					h.subtract();
					const rows: unknown[] = [];
					for (let frame = 0; frame < 3600; frame++) {
						h.tentative(dt, force, nu);
						h.project(iterations);
						if (frame % 120 === 119) {
							const m = metrics(g, h.read(h.velocity.read, 2)),
								qmax = maxAbs(h.read(h.pressure.read, 1));
							rows.push({
								time: (frame + 1) * dt,
								qmax,
								cfl: m.maximumSpeed * dt,
								reWidth: m.fluxes.map((q) => (direction * q) / nu),
								rePaper: m.fluxes.map((q) => (((direction * q) / nu) * 8) / 9),
								...m
							});
							await new Promise((r) => setTimeout(r, 0));
						}
					}
					(report.cases as unknown[]).push({
						iterations,
						direction,
						force,
						rows
					});
				}
			expect(h.gl.getError(), renderer).toBe(h.gl.NO_ERROR);
		} finally {
			await (
				commands as unknown as {
					writeBenchJson(p: string, s: string): Promise<void>;
				}
			).writeBenchJson(
				`${
					import.meta.env.SVELTE_FLUID_SHOTS_DIR || '.svelte-kit/staggered'
				}/low-force-n384.json`,
				JSON.stringify(report, null, 2)
			);
			h.dispose();
		}
	},
	1_800_000
);

it.skipIf(import.meta.env.SVELTE_FLUID_SHOTS_EXTRA !== 'staggered-advection')(
	'diagnostic: SL, bounded MacCormack and wall-crossing traces',
	async () => {
		const g = valveGeometry(384),
			h = staggeredHarness(g),
			dt = 1 / 120,
			force = 120,
			nu = viscosityAlpha(0.005, 1, g.width, g.height);
		const report: Record<string, unknown> = {
			renderer,
			dt,
			force,
			nu,
			cases: []
		};
		try {
			// Exact one-step projection: a uniform force is the gradient of a ramp plus a reservoir head.
			const impulse = Float64Array.from(g.faces, (open, i) =>
				open && i % 2 === 0 ? force * dt : 0
			);
			const d = staggeredDivergence(g, impulse),
				body = referencePressure(g, d);
			const gb = staggeredGradient(g, body.pressure),
				ub = Float64Array.from(impulse, (u, i) => u - gb[i]);
			const head = force * dt * g.width,
				reservoirRhs = new Float64Array(g.cells.length);
			for (let y = 0; y < g.height; y++)
				if (g.faces[g.u(0, y)]) reservoirRhs[y * g.width] = -2 * head;
			const reservoir = referencePressure(g, reservoirRhs),
				gr = staggeredGradient(g, reservoir.pressure);
			const ur = Float64Array.from(gr, (v) => -v);
			for (let y = 0; y < g.height; y++)
				if (g.faces[g.u(0, y)]) ur[g.u(0, y)] += 2 * head;
			report.reservoir = {
				head,
				bodyIterations: body.iterations,
				reservoirIterations: reservoir.iterations,
				maxRelativeVelocityDifference:
					maxAbs(Float64Array.from(ub, (u, i) => u - ur[i])) / maxAbs(ub),
				body: metrics(g, ub),
				reservoir: metrics(g, ur)
			};
			for (const [label, advect, mac, wall] of [
				['stokes', false, false, false],
				['sl', true, false, false],
				['mac', true, true, false],
				['sl-wall-safe', true, false, true],
				['mac-wall-safe', true, true, true]
			] as const) {
				h.upload(h.velocity.read, new Float32Array(g.faces.length), 2);
				h.upload(h.pressure.read, new Float32Array(g.cells.length), 1);
				h.tentative(dt, force, nu, 20, advect, mac, wall);
				h.computeDivergence();
				const bootstrap = referencePressure(g, h.read(h.divergence, 1));
				h.upload(h.pressure.read, bootstrap.pressure, 1);
				h.subtract();
				const rows: unknown[] = [];
				for (let frame = 0; frame < 600; frame++) {
					h.tentative(dt, force, nu, 20, advect, mac, wall);
					h.project(320);
					if (frame % 60 === 59) {
						const velocity = h.read(h.velocity.read, 2),
							m = metrics(g, velocity),
							pressure = h.read(h.pressure.read, 1);
						let closedMax = 0;
						for (let i = 0; i < velocity.length; i++)
							if (!g.faces[i])
								closedMax = Math.max(closedMax, Math.abs(velocity[i]));
						rows.push({
							time: (frame + 1) * dt,
							maxPressure: maxAbs(pressure),
							cfl: m.maximumSpeed * dt,
							closedMax,
							...m
						});
						expect(closedMax).toBe(0);
						await new Promise((r) => setTimeout(r, 0));
					}
				}
				(report.cases as unknown[]).push({ label, rows });
			}
			expect(h.gl.getError(), renderer).toBe(h.gl.NO_ERROR);
		} finally {
			await (
				commands as unknown as {
					writeBenchJson(p: string, s: string): Promise<void>;
				}
			).writeBenchJson(
				`${
					import.meta.env.SVELTE_FLUID_SHOTS_DIR || '.svelte-kit/staggered'
				}/advection-n384.json`,
				JSON.stringify(report, null, 2)
			);
			h.dispose();
		}
	},
	1_800_000
);

it.skipIf(import.meta.env.SVELTE_FLUID_SHOTS_EXTRA !== 'staggered-diagnostic')(
	'diagnostic: Stokes pressure lag and lowest-mode correction',
	async () => {
		const g = valveGeometry(384),
			h = staggeredHarness(g),
			nu = viscosityAlpha(0.005, 1, g.width, g.height),
			dt = 1 / 120,
			force = 120;
		const mode = await lowestPressureMode(g),
			path = channelPath(g),
			av = staggeredLaplacian(g, mode.vector);
		let denominator = 0;
		for (let i = 0; i < av.length; i++) denominator += mode.vector[i] * av[i];
		const { vector, ...modeStats } = mode;
		const report: Record<string, unknown> = {
			renderer,
			path,
			predictedLambda: (Math.PI / path) ** 2,
			mode: modeStats,
			cases: []
		};
		try {
			for (const [label, advect, corrected] of [
				['stokes-plain', false, false],
				['stokes-rank1', false, true],
				['navier-stokes-rank1', true, true]
			] as const) {
				h.upload(h.velocity.read, new Float32Array(g.faces.length), 2);
				h.upload(h.pressure.read, new Float32Array(g.cells.length), 1);
				h.tentative(dt, force, nu, 20, advect);
				h.computeDivergence();
				const bootstrap = referencePressure(g, h.read(h.divergence, 1));
				h.upload(h.pressure.read, bootstrap.pressure, 1);
				h.subtract();
				const rows: unknown[] = [];
				for (let frame = 0; frame < 1200; frame++) {
					h.tentative(dt, force, nu, 20, advect);
					h.computeDivergence();
					h.solve(320);
					let alpha = 0;
					if (corrected) {
						const rhs = h.read(h.divergence, 1),
							pressure = h.read(h.pressure.read, 1),
							ap = staggeredLaplacian(g, pressure);
						let numerator = 0;
						for (let i = 0; i < ap.length; i++)
							numerator += vector[i] * (-rhs[i] - ap[i]);
						alpha = numerator / denominator;
						h.upload(
							h.pressure.read,
							Float64Array.from(pressure, (p, i) => p + alpha * vector[i]),
							1
						);
					}
					h.subtract();
					if (frame % 120 === 119) {
						const m = metrics(g, h.read(h.velocity.read, 2));
						rows.push({ time: (frame + 1) * dt, alpha, ...m });
						console.log(
							'MAC LOW MODE DIAGNOSTIC',
							JSON.stringify({
								label,
								time: (frame + 1) * dt,
								normalized: m.normalized,
								fluxes: m.fluxes,
								fluxSpread: m.fluxSpread
							})
						);
						for (const t of m.telescopes) expect(t.error).toBeLessThan(1e-7);
						await new Promise((r) => setTimeout(r, 0));
					}
				}
				(report.cases as unknown[]).push({ label, rows });
			}
			expect(h.gl.getError(), renderer).toBe(h.gl.NO_ERROR);
		} finally {
			await (
				commands as unknown as {
					writeBenchJson(p: string, s: string): Promise<void>;
				}
			).writeBenchJson(
				`${
					import.meta.env.SVELTE_FLUID_SHOTS_DIR || '.svelte-kit/staggered'
				}/diagnostic-n384.json`,
				JSON.stringify(report, null, 2)
			);
			h.dispose();
		}
	},
	1_800_000
);

it.skipIf(import.meta.env.SVELTE_FLUID_SHOTS_EXTRA !== 'staggered-gate1')(
	'gate 1: fixed-RHS and physical warm-start valve projection',
	async () => {
		const n = Number(import.meta.env.SVELTE_FLUID_MAC_N || 384),
			g = valveGeometry(n),
			h = staggeredHarness(g);
		const nu = viscosityAlpha(0.005, 1, g.width, g.height),
			dt = 1 / 120,
			force = (160 * n) / 512;
		const path = channelPath(g),
			report: Record<string, unknown> = {
				renderer,
				n,
				width: g.width,
				height: g.height,
				path,
				predictedRho: 1 - Math.PI ** 2 / (2 * path ** 2),
				nu,
				dt,
				force
			};
		const samples: unknown[] = [];
		try {
			const seconds = Number(import.meta.env.SVELTE_FLUID_MAC_SECONDS || 10),
				budget = Number(import.meta.env.SVELTE_FLUID_MAC_BUDGET || 320);
			// The long-channel cold pressure mode must not contaminate the warm-start experiment.
			h.tentative(dt, force, nu);
			h.computeDivergence();
			const bootstrap = referencePressure(g, h.read(h.divergence, 1));
			report.bootstrap = {
				iterations: bootstrap.iterations,
				relativeResidual: bootstrap.relativeResidual
			};
			h.upload(h.pressure.read, bootstrap.pressure, 1);
			h.subtract();
			for (let frame = 0; frame < Math.round(seconds / dt); frame++) {
				h.tentative(dt, force, nu);
				h.project(budget);
				if (frame % 120 === 119) {
					const m = metrics(g, h.read(h.velocity.read, 2));
					samples.push({ time: (frame + 1) * dt, ...m });
					console.log(
						'MAC EVOLUTION',
						JSON.stringify({
							time: (frame + 1) * dt,
							normalized: m.normalized,
							fluxes: m.fluxes,
							fluxSpread: m.fluxSpread
						})
					);
					await new Promise((r) => setTimeout(r, 0));
				}
			}
			report.evolution = samples;
			// Converge this physical step using the exact GPU RHS; retain the stationary reference pressure.
			h.tentative(dt, force, nu);
			h.computeDivergence();
			const priorVelocity = h.read(h.velocity.read, 2),
				rhs0 = h.read(h.divergence, 1);
			const reference = referencePressure(g, rhs0, h.read(h.pressure.read, 1));
			report.reference = {
				iterations: reference.iterations,
				relativeResidual: reference.relativeResidual,
				maxPressure: maxAbs(reference.pressure)
			};
			h.upload(h.pressure.read, reference.pressure, 1);
			h.solve(20);
			const gpuP = h.read(h.pressure.read, 1);
			report.referenceGpuPressureError =
				maxAbs(Float64Array.from(gpuP, (p, i) => p - reference.pressure[i])) /
				maxAbs(reference.pressure);
			h.subtract();
			const state = h.read(h.velocity.read, 2);
			report.referenceProjection = metrics(g, state);
			// One physical timestep from the converged divergence-free state; no manufactured RHS perturbation.
			h.tentative(dt, force, nu);
			h.computeDivergence();
			const nextVelocity = h.read(h.velocity.read, 2),
				rhs = h.read(h.divergence, 1),
				exactNext = referencePressure(g, rhs, reference.pressure);
			report.nextReference = {
				iterations: exactNext.iterations,
				relativeResidual: exactNext.relativeResidual,
				rhsChange:
					maxAbs(Float64Array.from(rhs, (v, i) => v - rhs0[i])) /
					Math.max(maxAbs(rhs0), 1e-30)
			};
			const counts = [0, 20, 40, 80, 160, 320, 640, 1280, 2560];
			for (const warm of [false, true]) {
				const rows: unknown[] = [];
				let previousCount = 0,
					previousError = 0;
				for (const count of counts) {
					h.upload(h.velocity.read, nextVelocity, 2);
					h.upload(
						h.pressure.read,
						warm ? reference.pressure : new Float32Array(g.cells.length),
						1
					);
					h.solve(count);
					const p = h.read(h.pressure.read, 1),
						error = maxAbs(
							Float64Array.from(p, (v, i) => v - exactNext.pressure[i])
						);
					const residual = staggeredLaplacian(g, p);
					let norm = 0;
					for (let i = 0; i < residual.length; i++)
						norm += (residual[i] + rhs[i]) ** 2;
					h.subtract();
					const m = metrics(g, h.read(h.velocity.read, 2));
					const row = {
						count,
						...m,
						pressureError: error / maxAbs(exactNext.pressure),
						residualL2: Math.sqrt(norm),
						rho:
							previousCount && count > previousCount
								? (error / previousError) ** (1 / (count - previousCount))
								: null
					};
					rows.push(row);
					console.log('MAC FIXED RHS', JSON.stringify({ warm, ...row }));
					previousCount = count;
					previousError = error;
					for (const t of m.telescopes) expect(t.error).toBeLessThan(1e-7);
					await new Promise((r) => setTimeout(r, 0));
				}
				report[warm ? 'warm' : 'cold'] = rows;
			}
			report.priorMaximumSpeed = maxAbs(priorVelocity);
			expect(h.gl.getError(), renderer).toBe(h.gl.NO_ERROR);
		} finally {
			await (
				commands as unknown as {
					writeBenchJson(p: string, s: string): Promise<void>;
				}
			).writeBenchJson(
				`${
					import.meta.env.SVELTE_FLUID_SHOTS_DIR || '.svelte-kit/staggered'
				}/gate1-n${n}.json`,
				JSON.stringify(report, null, 2)
			);
			h.dispose();
		}
	},
	1_800_000
);
