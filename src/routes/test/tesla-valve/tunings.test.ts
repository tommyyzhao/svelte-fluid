import { describe, expect, it } from 'vitest';
import page from './+page.svelte?raw';
import { TESLA_VALVE_CONFIG } from '$lib/presets/registry.js';
import { jetFlow } from './jet-pulse.js';
import { viscosityAlpha } from '$lib/engine/FluidEngine.js';

const baseline = structuredClone(TESLA_VALVE_CONFIG);
const { getTuning, TUNINGS } = await import('./tunings.js');

const recipes = [
	['gentle', 14, 65, 3, 2, 8],
	['gentle-plus', 14, 95, 3, 2, 8],
	['cushioned', 12, 45, 2.5, 2, 4],
	['cushioned-plus', 12, 75, 2.5, 2, 4]
] as const;

const changedFields = new Set([
	'flow',
	'autoSplatVelocityX',
	'autoSplatRate',
	'autoSplatCount',
	'curl',
	'velocityDissipation',
	'viscosity',
	'wallFriction'
]);

describe('Tesla valve test tunings', () => {
	it('adds flame-jet as the default and fallback, preserving eight earlier variants', () => {
		expect(TUNINGS.map(({ id }) => id)).toEqual([
			'flame-jet',
			'gentle-jet',
			'cushioned-jet',
			...recipes.map(([id]) => id),
			'gentle-inlet',
			'cushioned-inlet',
			'paper-forward',
			'paper-reverse',
			'paper-reverse-re50',
			'paper-reverse-re400',
			'paper-forward-re200-tracers',
			'paper-reverse-re200-tracers',
			'paper-reverse-re400-tracers'
		]);
		const recommended = TUNINGS.find(({ id }) => id === 'flame-jet');
		expect(recommended).toBeDefined();
		for (const id of [
			undefined,
			null,
			'',
			'unknown',
			'constructor',
			'__proto__',
			'GENTLE'
		]) {
			expect(getTuning(id)).toBe(recommended);
		}
		for (const tuning of TUNINGS) expect(getTuning(tuning.id)).toBe(tuning);
	});

	it.each(recipes)(
		'%s lowers actual drive and emission, not playback speed',
		(id, gradient, velocity, rate, count, curl) => {
			const config = getTuning(id).config;
			const baseForce = baseline.flow!.forces![0];
			expect(baseForce.kind).toBe('pressureGradient');
			if (baseForce.kind !== 'pressureGradient')
				throw new Error('Expected pressure-gradient baseline');
			expect(config.flow.forces).toEqual([
				{ kind: 'pressureGradient', vector: { x: gradient, y: 0 } }
			]);
			expect(gradient).toBeLessThan(baseForce.vector.x);
			expect(config.autoSplatVelocityX).toBe(velocity);
			expect(velocity).toBeLessThan(baseline.autoSplatVelocityX!);
			expect(config.autoSplatRate).toBe(rate);
			expect(rate).toBeLessThan(baseline.autoSplatRate!);
			expect(config.autoSplatCount).toBe(count);
			expect(count).toBeLessThan(baseline.autoSplatCount!);
			expect(config.curl).toBe(curl);
			expect(curl).toBeLessThan(baseline.curl!);
			expect(config.velocityDissipation).toBe(
				id.startsWith('cushioned') ? 0.2 : 0.085
			);
			expect(config.viscosity).toBe(
				id.startsWith('cushioned') ? 0.04 : 0.026667
			);
			expect(config.wallFriction).toBe(
				id.startsWith('cushioned') ? 0.22 : 0.14
			);
		}
	);

	it.each(['gentle', 'cushioned'])(
		'%s-plus changes only inlet velocity',
		(id) => {
			const original = getTuning(id).config;
			const plus = getTuning(`${id}-plus`).config;
			expect(Object.keys(plus).sort()).toEqual(Object.keys(original).sort());
			for (const [key, value] of Object.entries(original)) {
				if (key !== 'autoSplatVelocityX')
					expect(plus, key).toHaveProperty(key, value);
			}
			expect(plus.autoSplatVelocityX).toBe(original.autoSplatVelocityX + 30);
		}
	);

	it.each([
		['gentle-inlet', 'gentle-plus', 30],
		['cushioned-inlet', 'cushioned-plus', 22.5]
	] as const)(
		'%s replaces only parent emission with a fixed live inlet',
		(id, parentId, velocity) => {
			const parent = getTuning(parentId).config;
			expect(getTuning(id).config).toEqual({
				...parent,
				autoSplatRate: 0,
				autoSplatCount: 0,
				initialSplatCount: 0,
				presetSplats: [],
				flow: {
					...parent.flow,
					mode: 'live',
					sources: [
						{
							kind: 'line',
							from: { x: 0.025, y: 0.475 },
							to: { x: 0.025, y: 0.515 },
							radius: 0.045,
							rate: 60,
							profile: 'parabolic',
							velocity: { x: velocity, y: 0 },
							dye: { r: 0.02, g: 0.06, b: 0.08 }
						}
					]
				}
			});
		}
	);

	it('preserves geometry, boundaries, outlet, inlet, solver timing, quality, and empty startup', () => {
		for (const { id, config } of TUNINGS.filter(
			({ id }) => !id.endsWith('-jet') && !id.startsWith('paper-')
		)) {
			const inlet = id.endsWith('-inlet');
			const expectedKeys = new Set(Object.keys(baseline));
			if (inlet) expectedKeys.add('presetSplats');
			expect(Object.keys(config).sort()).toEqual([...expectedKeys].sort());
			for (const [key, value] of Object.entries(baseline)) {
				if (!changedFields.has(key) && !(inlet && key === 'presetSplats')) {
					expect(config, key).toHaveProperty(key, value);
				}
			}
			const { forces: _baseForces, ...baseFlow } = baseline.flow!;
			const { forces: _forces, ...flow } = config.flow;
			if (inlet) {
				expect('sources' in flow).toBe(true);
				if (!('sources' in flow))
					throw new Error('Expected continuous inlet source');
				const { sources: _sources, ...inletFlow } = flow;
				expect(inletFlow).toEqual({ ...baseFlow, mode: 'live' });
			} else {
				expect(flow).toEqual(baseFlow);
			}
			expect(config.flow).not.toBe(TESLA_VALVE_CONFIG.flow);
			expect(config.initialSplatCount).toBe(0);
			expect(config.pressure).toBe(0.9);
			expect(config.maxTimeStep).toBe(1 / 60);
			expect(config.substeps).toBe(1);
			expect(config).not.toHaveProperty('maxFps');
		}
	});

	it.each([
		['gentle', 240],
		['cushioned', 300]
	] as const)(
		'%s jet changes only full-width nozzle, initial source momentum, right outlet braking, and Gentle dye',
		(name, peak) => {
			const parent = getTuning(`${name}-inlet`).config;
			const jet = getTuning(`${name}-jet`).config;
			expect(jet).toEqual({
				...parent,
				flow: {
					...parent.flow,
					sources: parent.flow.sources!.map((source) => ({
						...source,
						from: { x: 0.008, y: 0.389 },
						to: { x: 0.008, y: 0.59 },
						radius: 0.02,
						profile: 'parabolic',
						...(name === 'gentle'
							? { dye: { r: 0.06, g: 0.18, b: 0.24 } }
							: {}),
						velocity: { x: peak, y: 0 }
					})),
					outlets: parent.flow.outlets!.map((outlet) => ({
						...outlet,
						clearVelocity: false
					}))
				}
			});
			expect(jet.flow.sources).not.toBe(parent.flow.sources);
			expect(jet.flow.sources![0]).not.toBe(parent.flow.sources![0]);
			expect(jet.flow.outlets![0]).not.toBe(parent.flow.outlets![0]);
			expect(parent.flow.outlets![0].clearVelocity).toBe(true);
			expect(jet).not.toHaveProperty('openBoundary', true);
		}
	);

	it('starts Gentle jet with the same bright dye as its first pulse', () => {
		const flow = getTuning('gentle-jet').config.flow;
		const initialDye = flow.sources![0].dye;
		expect(initialDye).toEqual({ r: 0.06, g: 0.18, b: 0.24 });
		expect(initialDye).toEqual(jetFlow(flow, 0, 80, 240, true).sources![0].dye);
	});

	it('uses per-tuning pulses, fixed hot inflow and declared heat loss only', () => {
		for (const [id, base, peak] of [
			['gentle-jet', 80, 240],
			['cushioned-jet', 100, 300]
		] as const) {
			expect(getTuning(id).pulse).toMatchObject({
				base,
				peak,
				clockCap: 1 / 60
			});
		}
		const { config, pulse } = getTuning('flame-jet');
		expect(pulse?.palette).toHaveLength(3);
		expect(config).toMatchObject({
			simResolution: 256,
			dyeResolution: 512,
			substeps: 2,
			pressureIterations: 160,
			curl: 0,
			velocityDissipation: 0,
			densityDissipation: 0,
			wallFriction: 0,
			advectionScheme: 'maccormack',
			bloom: true,
			toneMapping: 'agx'
		});
		expect(config.flow.walls).toBe('no-slip');
		expect(config.flow.sources![0]).toMatchObject({
			inflow: true,
			scalars: { temperature: 1 }
		});
		expect(config.flow.outlets![0]).toMatchObject({
			clearDye: 1,
			clearScalars: false,
			clearVelocity: false
		});
		const field = config.flow.scalarFields![0];
		expect(field.diffusivity! / config.viscosity!).toBeCloseTo(0.0016 / 0.005);
		expect(field).toMatchObject({ wall: 'isothermal', radiativeCooling: 0 });
		for (const seconds of [0, 2, 4, 6, 5.999999]) {
			const first = jetFlow(
				config.flow,
				seconds,
				pulse!.base,
				pulse!.peak,
				pulse!.palette
			);
			const repeat = jetFlow(
				config.flow,
				seconds + 6,
				pulse!.base,
				pulse!.peak,
				pulse!.palette
			);
			for (const channel of ['r', 'g', 'b'] as const)
				expect(first.sources![0].dye![channel]).toBeCloseTo(
					repeat.sources![0].dye![channel],
					10
				);
		}
	});

	it('bounds flame Jacobi truncation below float32 unit precision with two iterations of margin', () => {
		const { config } = getTuning('flame-jet');
		const field = config.flow.scalarFields![0];
		const height = config.dyeResolution!;
		const width = Math.round(height * 3); // The real route's 3:1 canvas.
		const alpha = viscosityAlpha(
			field.diffusivity!,
			config.maxTimeStep!,
			width,
			height
		);
		const rho = (4 * alpha) / (1 + 4 * alpha);
		const minimum = Math.ceil(Math.log(2 ** -24) / Math.log(rho));
		const iterations = field.diffusionIterations!;
		expect(iterations).toBe(minimum + 2);
		expect(rho ** (iterations - 2)).toBeLessThanOrEqual(2 ** -24);
		expect(rho ** (iterations - 3)).toBeGreaterThan(2 ** -24);
		// The velocity storage is half-float: a real-arithmetic bound cannot pin its iterate.
		expect(config.viscosityIterations).toBe(40);
	});

	it('enables the glass cover on flame-jet only', () => {
		expect(getTuning('flame-jet').config).toMatchObject({
			glass: true,
			glassThickness: 0.03,
			glassRefraction: 0.5,
			glassReflectivity: 0.04,
			glassChromatic: 0.15
		});
		for (const tuning of TUNINGS.filter(
			({ id }) => id !== 'flame-jet' && !id.startsWith('paper-')
		))
			expect(tuning.config.glass).toBe(TESLA_VALVE_CONFIG.glass);
	});

	it('paper variants use pressure only, fixed composition and no artificial stirring', () => {
		for (const { config, pulse } of TUNINGS.filter(({ id }) =>
			id.startsWith('paper-')
		)) {
			expect(pulse).toBeUndefined();
			expect(config).toMatchObject({
				curl: 0,
				velocityDissipation: 0,
				densityDissipation: 0,
				wallFriction: 0,
				autoSplatRate: 0,
				glass: false,
				transparent: false,
				advectionScheme: 'maccormack'
			});
			expect(config.flow.walls).toBe('no-slip');
			expect(config.flow.forces).toHaveLength(1);
			expect(config.flow.forces![0].kind).toBe('pressureGradient');
			expect(config.flow.sources).toHaveLength(3);
			for (const source of config.flow.sources!) {
				expect(source.inflow).toBe(true);
				expect(source.velocity).toBeUndefined();
			}
			expect(config.flow.visualization?.absorption?.absorbance).toHaveLength(3);
		}
		const parent = getTuning('paper-reverse').config;
		for (const id of ['paper-reverse-re50', 'paper-reverse-re400']) {
			const config = getTuning(id).config;
			expect({
				...config,
				flow: { ...config.flow, forces: parent.flow.forces }
			}).toEqual(parent);
		}
	});

	it('routes only G1-passing paper replacements through the local MAC engine', () => {
		const tuning = getTuning('paper-reverse');
		expect(tuning.mac).toMatchObject({
			direction: -1,
			force: 2.2,
			width: 1080,
			nu: 1.8,
			dt: 1 / 80,
			pressureSweeps: 32,
			dyeScale: 3,
			noiseAcceleration: 0.062
		});
		expect(tuning.description).toContain('2D');
		expect(tuning.description).toContain('199.73');
		expect(tuning.description).toContain('0.47 simulated seconds per real second');
		expect(tuning.description).toContain('fails');
		expect(tuning.description).toContain('flow stays smooth throughout');
		expect(tuning.description).toContain('1.5× finer grid shows no dye mixing');
		expect(tuning.description).toContain('dye spreading caused by the calculation');
		expect(getTuning('paper-forward').description).toContain('1.08 vs the paper’s 1.59');
		expect(getTuning('paper-forward').mac).toEqual({
			direction: 1,
			force: 2.027521901389229,
			width: 1080,
			nu: 1.8,
			dt: 1 / 80,
			pressureSweeps: 32,
			dyeScale: 3,
			noiseAcceleration: 0.101,
			targetRe: 200
		});
		const low = getTuning('paper-reverse-re50');
		expect(low.mac).toMatchObject({
			force: 0.37854806661149154,
			dt: 0.04,
			targetRe: 50,
			noiseAcceleration: 0.0064
		});
		expect(low.prerollSeconds).toBe(40);
		expect(low.description).toContain('≈ 1.50 simulated seconds per real second (≈ the speed limit for these settings)');
		expect(low.description).not.toContain('1.52');
		expect(low.description).toContain('0.77%');
		expect(low.description).toContain('fails');
		const high = getTuning('paper-reverse-re400');
		expect(high.mac).toMatchObject({ force: 7.3, dt: .005, pressureSweeps: 128, targetRe: 400 });
		expect(high.description).toContain('first dye-mixing location changes with grid size');
		expect(high.description).toContain('1.5× grid St 0.90 vs 1× grid 0.93');
		expect(high.description).toContain('variation between halves of the recording is 0.35 Hz');
		expect(high.description).toContain('frequency comparison remains inconclusive');
		expect(high.description).toContain('St 0.92 vs 0.835, a ~9% unexplained gap');
		expect(high.description).toContain('flow-rate frequency 4.712 Hz; frequency relative to flow speed, St, 0.835');
		expect(high.description).toContain('zero inlet disturbance');
		expect(high.description).toContain(
			'Changing flow persists for ≤1.5 times the time for fluid to cross the valve with a more accurate pressure calculation, starting from already-changing flow (finer grid at Reynolds number 420)'
		);
		expect(high.description).not.toContain('within pre-registered tolerance');
		expect(high.description).not.toContain('breakup confirmed');
		expect(high.description).not.toContain('Basilisk St 0.84 differs');
		expect(high.description).not.toContain('grid-robust');
		expect(high.description).not.toContain('1.5× frequency untested');
		expect(high.description).toContain('changes in flow through a section by 6.02×');
		expect(high.description).toContain('largely caused by error in the pressure calculation');
		expect(high.description).toContain('still shrinking at 30 s (no settled comparison value)');
		expect(high.description).toContain('19.6×, 21.0× and 24.5× at sections 1–3');
		expect(high.description).toContain('downstream sections 6–11 agree within 16%');
		expect(high.description).not.toContain('35×');
		expect(high.description).not.toContain('up to ~6×');
		expect(high.description).not.toContain('within 3.2%');
		expect(high.description).not.toContain('Exact-projection velocity fluctuations grow');
		expect(high.description).not.toContain('12.5×');
		expect(high.description).not.toContain('St 0.22 vs 0.11');
		expect(high.description).toContain('3.5%');
		expect(high.description).toContain('more accurate pressure calculation');
		expect(high.prerollSeconds).toBe(10);
		expect(high.dyePrerollSeconds).toBe(3);
		expect(high.stepsPerFrame).toBe(4);
		expect(high.description).toContain('54.3 frames per second');
		expect(high.description).toContain('≈ 0.19 simulated seconds per real second (≈ the 0.187 speed limit for these settings)');
		expect(high.description).toContain('Dye reaches the region where threads break apart ~15–20 s after loading');
		for (const { id, mac } of TUNINGS.filter(
			({ id }) => !id.startsWith('paper-')
		))
			expect(mac, id).toBeUndefined();
	});

	it('explains laboratory limits and the same-flow pressure comparison in plain language', () => {
		expect(page).toContain('laboratory-only 2D experiments, not validated real-world predictions');
		expect(page).toContain('backward (reverse) pressure to the forward pressure needed for the same flow rate');
		expect(page).toContain('Forward means left to right through the valve; backward means right to left');
		expect(getTuning('paper-forward').label).toBe('Lower-speed experiment · forward');
		expect(getTuning('paper-reverse-re400').label).toBe('Higher-speed experiment · backward');
		expect(getTuning('paper-forward').description).toContain('pressure ratio for the same flow rate');
	});

	it('does not mutate the canonical registry', () => {
		expect(TESLA_VALVE_CONFIG).toEqual(baseline);
	});
});
