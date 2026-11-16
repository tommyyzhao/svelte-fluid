import { commands } from 'vitest/browser';
import {
	staggeredGeometry,
	staggeredDivergence,
	staggeredGradient,
	staggeredLaplacian,
	type StaggeredGeometry
} from '../staggered.js';
import { staggeredHarness } from './staggered-harness.js';
import { referencePressure } from './staggered-reference.js';
import { directPressure } from './staggered-direct.js';
import {
	faceEnergy,
	forceWork,
	viscousLoss,
	kineticOutflow
} from './staggered-energy.js';

type Harness = ReturnType<typeof staggeredHarness>;
export const diagnosisArms = ['J', 'E', 'E+R', 'J+R'] as const;
export type DiagnosisArm =
	| (typeof diagnosisArms)[number]
	| 'J+R-prime1'
	| 'J+R-prime2'
	| 'J-hotspot';
type DiagnosisOptions = { deadlineMs: number; forceMultiplier?: number };
const maxAbs = (a: ArrayLike<number>) => {
	let maximum = 0;
	for (let i = 0; i < a.length; i++)
		maximum = Math.max(maximum, Math.abs(a[i]));
	return maximum;
};
const io = commands as unknown as {
	writeBenchJson(path: string, content: string): Promise<void>;
	readBenchBase64(path: string): Promise<string>;
};
const output = `${
	import.meta.env.SVELTE_FLUID_SHOTS_DIR || '.svelte-kit/staggered'
}/diagnose-n384.json`;

function observe(
	g: StaggeredGeometry,
	state: ArrayLike<number>,
	offset: number,
	valveWidth: number,
	meanWidth: number
) {
	const positions = [
		0,
		valveWidth / 4,
		valveWidth / 2,
		(3 * valveWidth) / 4,
		valveWidth
	].map((x) => offset + Math.floor(x));
	const fluxes = positions.map((x) => {
		let q = 0;
		for (let y = 0; y < g.height; y++) q += state[g.u(x, y)];
		return q;
	});
	const speed = Math.max(Math.abs(fluxes[0]), Math.abs(fluxes[4])) / meanWidth;
	return {
		positions,
		fluxes,
		signReversals: fluxes.map((q) => q < 0),
		fluxSpread:
			(Math.max(...fluxes) - Math.min(...fluxes)) /
			Math.max(...fluxes.map(Math.abs)),
		characteristicSpeed: speed,
		maximumSpeed: maxAbs(state),
		normalized: maxAbs(staggeredDivergence(g, state)) / Math.max(speed, 1e-30)
	};
}
function hotspot(
	g: StaggeredGeometry,
	state: ArrayLike<number>,
	bulk: number,
	meanWidth: number
) {
	const zones = { left: 0, right: 0, interior: 0 };
	let maximum = -1;
	let argmax = { component: 'u', x: 0, y: 0, signedVelocity: 0 };
	for (const component of ['u', 'v'] as const) {
		const maxX = component === 'u' ? g.width : g.width - 1;
		const maxY = component === 'u' ? g.height - 1 : g.height;
		for (let y = 0; y <= maxY; y++)
			for (let x = 0; x <= maxX; x++) {
				const value = state[g[component](x, y)],
					magnitude = Math.abs(value);
				const faceX = x + (component === 'v' ? 0.5 : 0);
				const zone =
					faceX < 2 * meanWidth
						? 'left'
						: faceX > g.width - 2 * meanWidth
						? 'right'
						: 'interior';
				zones[zone] = Math.max(zones[zone], magnitude / Math.max(bulk, 1e-30));
				if (magnitude > maximum) {
					maximum = magnitude;
					argmax = {
						component,
						x: faceX,
						y: y + (component === 'u' ? 0.5 : 0),
						signedVelocity: value
					};
				}
			}
	}
	return {
		definition:
			'max absolute MAC face component, same maxu as CFL; face coordinates bottom-up',
		zoneWidth: 2 * meanWidth,
		argmax,
		maximumOverBulk: maximum / Math.max(bulk, 1e-30),
		zones
	};
}
function edgeFlux(g: StaggeredGeometry, state: ArrayLike<number>) {
	return Object.fromEntries(
		(['left', 'right'] as const).map((edge) => {
			const x = edge === 'left' ? 0 : g.width,
				sign = edge === 'left' ? -1 : 1;
			let inflow = 0,
				outflow = 0,
				backflowInflux = 0,
				massFlux = 0;
			for (let y = 0; y < g.height; y++) {
				const u = state[g.u(x, y)],
					cellX = Math.min(g.width - 1, x);
				const v = 0.5 * (state[g.v(cellX, y)] + state[g.v(cellX, y + 1)]);
				const kinetic = sign * u * 0.5 * (u * u + v * v);
				if (kinetic < 0) inflow -= kinetic;
				else outflow += kinetic;
				if (edge === 'right' && kinetic < 0) backflowInflux -= kinetic;
				massFlux += sign * u;
			}
			return [
				edge,
				{ inflow, outflow, backflowInflux, outwardMassFlux: massFlux }
			];
		})
	);
}
function edgeColumnReader(h: Harness) {
	const { gl, geometry: g } = h;
	const left = new Float32Array(4 * (g.height + 1));
	const right = new Float32Array(8 * (g.height + 1));
	return () => {
		gl.bindFramebuffer(gl.FRAMEBUFFER, h.velocity.read.fbo);
		gl.readPixels(0, 0, 1, g.height + 1, gl.RGBA, gl.FLOAT, left);
		gl.readPixels(g.width - 1, 0, 2, g.height + 1, gl.RGBA, gl.FLOAT, right);
		return Object.fromEntries(
			(['left', 'right'] as const).map((edge) => {
				let inflow = 0,
					outflow = 0,
					backflowInflux = 0;
				for (let y = 0; y < g.height; y++) {
					const u = right[8 * y + (edge === 'left' ? 4 : 0)];
					const column = edge === 'left' ? left : right;
					const stride = edge === 'left' ? 4 : 8;
					const nextY = y + 1 === g.height ? g.height - 1 : y;
					const previousY = y === 0 ? g.height : y - 1;
					const v =
						0.5 * (column[stride * previousY + 1] + column[stride * nextY + 1]);
					const kinetic =
						(edge === 'left' ? -1 : 1) * u * 0.5 * (u * u + v * v);
					if (kinetic < 0) inflow -= kinetic;
					else outflow += kinetic;
					if (edge === 'right' && kinetic < 0) backflowInflux -= kinetic;
				}
				return [edge, { inflow, outflow, backflowInflux }];
			})
		) as Record<
			'left' | 'right',
			{ inflow: number; outflow: number; backflowInflux: number }
		>;
	};
}
function residual(
	g: StaggeredGeometry,
	q: ArrayLike<number>,
	rhs: ArrayLike<number>
) {
	const aq = staggeredLaplacian(g, q);
	let r = 0,
		b = 0;
	for (let i = 0; i < aq.length; i++) {
		r += (aq[i] + rhs[i]) ** 2;
		b += rhs[i] ** 2;
	}
	return Math.sqrt(r / Math.max(b, 1e-300));
}
function cpuSubtract(
	g: StaggeredGeometry,
	tentative: ArrayLike<number>,
	q: ArrayLike<number>
) {
	const gradient = staggeredGradient(g, q);
	return Float32Array.from(tentative, (v, i) =>
		g.faces[i] ? v - gradient[i] : 0
	);
}

export async function diagnoseArm(
	arm: DiagnosisArm,
	valve: StaggeredGeometry,
	renderer: string,
	options: DiagnosisOptions
) {
	let report: { [key: string]: any };
	try {
		report = JSON.parse(atob(await io.readBenchBase64(output)));
	} catch {
		report = {
			date: '2026-10-22',
			renderer,
			dt: 1 / 240,
			force: 7,
			nu: 17.28,
			arms: {}
		};
	}
	if (arm !== 'J' && !report.arms.J?.reproduced)
		throw new Error('J must reproduce before other arms');
	const started = performance.now(),
		dt = 1 / 240,
		nu = 17.28;
	let area = 0;
	for (const cell of valve.cells) if (cell) area++;
	const meanWidth = area / valve.width,
		plenum = Math.ceil(4 * meanWidth),
		spongeWidth = Math.ceil(meanWidth);
	const reservoir = arm.includes('R'),
		exact = arm.startsWith('E');
	const offset = reservoir ? plenum : 0;
	const g = reservoir
		? staggeredGeometry(
				valve.width + 2 * plenum,
				valve.height,
				(x, y) =>
					x < plenum ||
					x >= plenum + valve.width ||
					!!valve.cells[y * valve.width + x - plenum],
				{ left: 'open', right: 'open' }
		  )
		: valve;
	const matched = arm.includes('prime');
	const force =
		((7 * valve.width) / g.width) *
		(options.forceMultiplier ?? (matched ? 157 / 116.7 : 1));
	const duration = arm === 'J-hotspot' ? 18 : matched ? 60 : 30;
	const deadline =
		performance.now() + Math.max(0, options.deadlineMs - Date.now());
	let forceInputRate = 0;
	for (let y = 0; y < g.height; y++)
		for (let x = 0; x <= g.width; x++)
			if (g.faces[g.u(x, y)])
				forceInputRate += force * (x === 0 || x === g.width ? 0.5 : 1);
	let h: Harness | undefined, bootstrapHost: Harness | undefined;
	const result: { [key: string]: any } = {
		arm,
		width: g.width,
		height: g.height,
		meanWidth,
		valveOffset: offset,
		valveWidth: valve.width,
		force,
		totalDrivingPotential: force * g.width,
		nu,
		dt,
		plenumLength: reservoir ? plenum : 0,
		sponge: reservoir
			? {
					width: spongeWidth,
					law: 'Before projection: v *= exp(-dt*10*(1-d/w)^2), d< w from either outer edge; u unchanged. No normal impulse/net boundary flux introduced. Projection restores continuity.',
					rate: 10
			  }
			: null,
		initialization:
			'Byte-identical CG-bootstrapped valve faces; reservoirs extend each mouth u profile along x, v=0. J+R pressure seeded from direct first-step RHS without modifying initial faces.',
		rows: [],
		projectionPath: exact ? 'GPU subtract' : 'GPU 320 paired Jacobi sweeps'
	};
	report.arms[arm] = result;
	const save = () => io.writeBenchJson(output, JSON.stringify(report, null, 2));
	try {
		if (performance.now() >= deadline) {
			result.partial = true;
			result.completed = false;
			result.stopReason = 'deadline before init';
			await save();
			return;
		}
		bootstrapHost = staggeredHarness(valve);
		bootstrapHost.tentative(dt, 7, nu);
		bootstrapHost.computeDivergence();
		const bootstrap = referencePressure(
			valve,
			bootstrapHost.read(bootstrapHost.divergence, 1)
		);
		bootstrapHost.upload(bootstrapHost.pressure.read, bootstrap.pressure, 1);
		bootstrapHost.subtract();
		const initialValve = bootstrapHost.read(bootstrapHost.velocity.read, 2);
		const initialPressure = bootstrapHost.read(bootstrapHost.pressure.read, 1);
		result.bootstrap = {
			iterations: bootstrap.iterations,
			relativeResidual: bootstrap.relativeResidual
		};
		if (!reservoir) {
			h = bootstrapHost;
			bootstrapHost = undefined;
		} else {
			bootstrapHost.dispose();
			bootstrapHost = undefined;
			h = staggeredHarness(g);
			const initial = new Float32Array(g.faces.length);
			for (let y = 0; y < g.height; y++)
				for (let x = 0; x <= g.width; x++) {
					const vx = Math.max(0, Math.min(valve.width, x - offset));
					if (g.faces[g.u(x, y)])
						initial[g.u(x, y)] = initialValve[valve.u(vx, y)];
				}
			for (let y = 0; y <= g.height; y++)
				for (let x = 0; x < valve.width; x++)
					initial[g.v(x + offset, y)] = initialValve[valve.v(x, y)];
			h.upload(h.velocity.read, initial, 2);
		}
		const initial = h.read(h.velocity.read, 2);
		result.initialMetrics = observe(g, initial, offset, valve.width, meanWidth);
		let valveFaceDifference = 0;
		for (let y = 0; y < valve.height; y++)
			for (let x = 0; x <= valve.width; x++)
				valveFaceDifference = Math.max(
					valveFaceDifference,
					Math.abs(initial[g.u(x + offset, y)] - initialValve[valve.u(x, y)])
				);
		for (let y = 0; y <= valve.height; y++)
			for (let x = 0; x < valve.width; x++)
				valveFaceDifference = Math.max(
					valveFaceDifference,
					Math.abs(initial[g.v(x + offset, y)] - initialValve[valve.v(x, y)])
				);
		result.postBootstrapValveFaceMaxDifference = valveFaceDifference;
		result.initialEnergy = faceEnergy(g, initial);
		if (performance.now() >= deadline) {
			result.partial = true;
			result.completed = false;
			result.stopReason = 'deadline before init';
			await save();
			return;
		}
		const direct = exact || reservoir ? directPressure(g) : undefined;
		if (direct) {
			result.direct = { ...direct.stats, solveTotalMs: 0, solves: 0 };
			h.tentative(dt, force, nu);
			h.computeDivergence();
			const fixedRhs = h.read(h.divergence, 1),
				q = direct.solve(fixedRhs);
			const reference = referencePressure(g, fixedRhs);
			let difference = 0,
				scale = 0;
			for (let i = 0; i < q.length; i++) {
				difference += (q[i] - reference.pressure[i]) ** 2;
				scale += reference.pressure[i] ** 2;
			}
			result.direct.validation = {
				trueRelativeResidual: residual(g, q, fixedRhs),
				cgRelativeResidual: reference.relativeResidual,
				relativePressureDifference: Math.sqrt(
					difference / Math.max(scale, 1e-300)
				)
			};
			if (result.direct.validation.trueRelativeResidual > 1e-10)
				throw new Error('Direct validation failed');
			h.upload(h.velocity.read, initial, 2);
			h.upload(h.pressure.read, reservoir ? q : initialPressure, 1);
		}
		await save();
		const readEdges = edgeColumnReader(h);
		const cumulativeEdges = {
			left: { inflow: 0, outflow: 0, backflowInflux: 0 },
			right: { inflow: 0, outflow: 0, backflowInflux: 0 }
		};
		let intervalEdges = structuredClone(cumulativeEdges);
		result.edgeIntegralRule =
			arm === 'J'
				? 'Not measured in original control'
				: 'Every-step post-projection edge-column readback; right endpoint rectangle dt integral';
		let cpuPath = false,
			maxCflEveryStep = 0;
		let spongeMomentumY = 0;
		const sponge = (state: Float32Array) => {
			for (let x = 0; x < g.width; x++) {
				const distance = Math.min(x + 0.5, g.width - x - 0.5);
				if (distance >= spongeWidth) continue;
				const damping = Math.exp(-dt * 10 * (1 - distance / spongeWidth) ** 2);
				for (let y = 0; y <= g.height; y++) {
					const i = g.v(x, y),
						before = state[i];
					state[i] *= damping;
					if (matched)
						spongeMomentumY +=
							(y === 0 || y === g.height ? 0.5 : 1) * (state[i] - before);
				}
			}
		};
		for (let step = 1; step <= Math.round(duration / dt); step++) {
			if (performance.now() >= deadline) {
				result.partial = true;
				result.stopReason = '24 min lock deadline';
				result.lastCompletedStep = step - 1;
				await save();
				break;
			}
			const sample = step % 240 === 0;
			const before = sample ? h.read(h.velocity.read, 2) : undefined;
			h.tentative(dt, force, nu);
			let tentative: Float32Array | undefined;
			let spongeEnergy = 0;
			if (reservoir) {
				tentative = h.read(h.velocity.read, 2);
				const pre = sample ? faceEnergy(g, tentative) : 0;
				sponge(tentative);
				if (sample) spongeEnergy = faceEnergy(g, tentative) - pre;
				h.upload(h.velocity.read, tentative, 2);
			}
			h.computeDivergence();
			let q: Float64Array | Float32Array | undefined,
				rhs: Float32Array | undefined;
			if (exact) {
				rhs = h.read(h.divergence, 1);
				const solveStarted = performance.now();
				q = direct!.solve(rhs);
				result.direct.solveTotalMs += performance.now() - solveStarted;
				result.direct.solves++;
				h.upload(h.pressure.read, q, 1);
			} else h.solve(320);
			if (sample || (exact && (cpuPath || step === 1)))
				tentative ??= h.read(h.velocity.read, 2);
			h.subtract();
			let state: Float32Array | undefined,
				floor: number | undefined,
				gpuDoverU: number | undefined;
			if (exact && (sample || step === 1 || cpuPath)) {
				const projected = cpuSubtract(g, tentative!, q!);
				if (sample || step === 1) {
					floor = observe(
						g,
						projected,
						offset,
						valve.width,
						meanWidth
					).normalized;
					state = h.read(h.velocity.read, 2);
					gpuDoverU = observe(
						g,
						state,
						offset,
						valve.width,
						meanWidth
					).normalized;
					if (gpuDoverU > Math.max(1e-6, 2 * floor)) cpuPath = true;
				}
				if (cpuPath) {
					h.upload(h.velocity.read, projected, 2);
					state = projected;
				}
				if (step === 1) result.firstStepFloor = { floor, gpuDoverU, cpuPath };
			}
			if (arm !== 'J') {
				const edges = readEdges();
				for (const edge of ['left', 'right'] as const)
					for (const key of ['inflow', 'outflow', 'backflowInflux'] as const) {
						const energy = edges[edge][key] * dt;
						cumulativeEdges[edge][key] += energy;
						intervalEdges[edge][key] += energy;
					}
			}
			if (!sample) continue;
			state ??= h.read(h.velocity.read, 2);
			q ??= h.read(h.pressure.read, 1);
			const m = observe(g, state, offset, valve.width, meanWidth);
			const forced = Float64Array.from(
				before!,
				(v, i) => v + (g.faces[i] && i % 2 === 0 ? force * dt : 0)
			);
			const energy = faceEnergy(g, state),
				tentativeEnergy = faceEnergy(g, tentative!);
			const work = forceWork(g, before!, forced, force, dt);
			const viscous = viscousLoss(g, tentative!, nu) * dt;
			const open =
				0.5 * (kineticOutflow(g, forced) + kineticOutflow(g, tentative!)) * dt;
			const projection = energy - tentativeEnergy;
			const transport =
				tentativeEnergy - spongeEnergy - faceEnergy(g, before!) - work;
			const jRow = report.arms.J?.rows?.find((r: any) => r.time === step * dt);
			const mouthMeans = () =>
				[offset, offset + valve.width - 1].map((x) => {
					let sum = 0,
						count = 0;
					for (let y = 0; y < g.height; y++)
						if (
							valve.cells[
								y * valve.width + (x === offset ? 0 : valve.width - 1)
							]
						) {
							sum += q![y * g.width + x];
							count++;
						}
					return sum / count;
				});
			const mouths = matched ? mouthMeans() : undefined;
			const row = {
				time: step * dt,
				qMouthMeans: mouths,
				valveDrivingImpulse: mouths
					? force * dt * valve.width + mouths[0] - mouths[1]
					: undefined,
				spongeMomentum: matched
					? {
							interval: '1 s integral',
							x: 0,
							y: spongeMomentumY,
							bodyForceImpulse: forceInputRate,
							fractionX: 0,
							fractionY: spongeMomentumY / forceInputRate
					  }
					: undefined,
				step,
				...m,
				hotspot:
					arm === 'J-hotspot'
						? hotspot(g, state, m.characteristicSpeed, meanWidth)
						: undefined,
				qmax: maxAbs(q),
				cfl: m.maximumSpeed * dt,
				trueRelativeResidual: rhs ? residual(g, q, rhs) : null,
				float32Floor: floor,
				gpuDoverU,
				doverUratioToJ: jRow ? m.normalized / jRow.normalized : null,
				exactCriterion: exact
					? m.normalized <= Math.max(1e-6, 2 * floor!)
					: null,
				openEdges: edgeFlux(g, state),
				edgeEnergyIntegrals:
					arm === 'J'
						? null
						: {
								interval: '1 s integrals',
								lastSecond: structuredClone(intervalEdges),
								cumulative: structuredClone(cumulativeEdges)
						  },
				energyBudget: {
					interval:
						'instantaneous per-step samples (last dt step only), not 1 s integrals',
					energy,
					energyChange: energy - faceEnergy(g, before!),
					work,
					viscous,
					openKineticFlux: open,
					openPressureWork: 0,
					projectionEnergy: projection,
					spongeEnergy,
					transportEnergy: transport,
					transportBudgetResidual: transport + viscous + open,
					fullBudgetResidual:
						energy -
						faceEnergy(g, before!) -
						work +
						viscous +
						open -
						spongeEnergy
				}
			};
			result.rows.push(row);
			spongeMomentumY = 0;
			intervalEdges = {
				left: { inflow: 0, outflow: 0, backflowInflux: 0 },
				right: { inflow: 0, outflow: 0, backflowInflux: 0 }
			};
			maxCflEveryStep = Math.max(maxCflEveryStep, row.cfl);
			result.projectionPath = exact
				? cpuPath
					? 'Float64 CPU subtract, Float32 faces uploaded (A-1 fallback)'
					: 'GPU subtract'
				: result.projectionPath;
			result.wallSeconds = (performance.now() - started) / 1000;
			console.log(
				'MAC DIAGNOSE',
				JSON.stringify({
					arm,
					time: row.time,
					spread: row.fluxSpread,
					normalized: row.normalized,
					qmax: row.qmax,
					cfl: row.cfl,
					wallSeconds: result.wallSeconds
				})
			);
			await save();
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
		result.stable = result.rows
			.filter((r: any) => r.time >= 2)
			.every(
				(r: any) => r.fluxSpread <= 0.01 && !r.signReversals.some(Boolean)
			);
		result.exactQualified = exact
			? result.rows.every((r: any) => r.exactCriterion)
			: null;
		result.firstSpreadAbove1Percent =
			result.rows.find((r: any) => r.fluxSpread > 0.01)?.time ?? null;
		result.maxSpread = Math.max(...result.rows.map((r: any) => r.fluxSpread));
		result.maxDoverU = Math.max(...result.rows.map((r: any) => r.normalized));
		result.maxQ = Math.max(...result.rows.map((r: any) => r.qmax));
		result.maxCfl = maxCflEveryStep;
		result.reproduced =
			arm === 'J'
				? !result.stable &&
				  result.firstSpreadAbove1Percent >= 14 &&
				  result.firstSpreadAbove1Percent <= 20 &&
				  result.rows[29].fluxSpread > 1
				: null;
		if (direct)
			result.direct.meanSolveMs =
				result.direct.solveTotalMs / Math.max(result.direct.solves, 1);
		result.completed = !result.partial;
		if (matched) {
			let consecutive = 0,
				longest = 0,
				first = null;
			for (const row of result.rows) {
				const re =
					((row.fluxes.reduce((sum: number, q: number) => sum + q, 0) /
						5 /
						nu) *
						8) /
					9;
				consecutive = re >= 141.3 ? consecutive + 1 : 0;
				longest = Math.max(longest, consecutive);
				if (consecutive >= 11 && first === null) first = row.time - 10;
			}
			result.failureReGate = {
				threshold: 141.3,
				longestConsecutiveSamples: longest,
				longestElapsedSeconds: Math.max(0, longest - 1),
				firstSustainedWindowStart: first,
				passes: longest >= 11
			};
		}
		if (h.gl.getError() !== h.gl.NO_ERROR) throw new Error('GPU error');
		if (arm === 'J' && !result.reproduced)
			throw new Error('Control did not reproduce; stop');
	} catch (error) {
		result.error = String(error);
		throw error;
	} finally {
		result.wallSeconds = (performance.now() - started) / 1000;
		await save();
		h?.dispose();
		bootstrapHost?.dispose();
	}
}
