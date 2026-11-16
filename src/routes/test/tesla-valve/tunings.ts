import type { FluidConfig } from '$lib/engine/types.js';
import { TESLA_VALVE_CONFIG } from '$lib/presets/registry.js';
import {
	INITIAL_JET_DYE,
	JET_DYES,
	SALT_DYES,
	type JetPulse
} from './jet-pulse.js';
import type { MacOptions } from './mac/engine.js';

const gentle = {
	id: 'gentle',
	label: 'Gentle',
	description:
		'Original experiment: gentler flow with fewer, softer bursts at the inlet.',
	config: {
		...TESLA_VALVE_CONFIG,
		flow: {
			...TESLA_VALVE_CONFIG.flow,
			forces: [{ kind: 'pressureGradient', vector: { x: 14, y: 0 } }]
		},
		autoSplatVelocityX: 65,
		autoSplatRate: 3,
		autoSplatCount: 2,
		curl: 8
	} satisfies FluidConfig
};

const cushioned = {
	id: 'cushioned',
	label: 'Cushioned',
	description:
		'Original experiment: a gentler push, thicker fluid, and more slowing throughout the flow and at walls.',
	config: {
		...TESLA_VALVE_CONFIG,
		flow: {
			...TESLA_VALVE_CONFIG.flow,
			forces: [{ kind: 'pressureGradient', vector: { x: 12, y: 0 } }]
		},
		autoSplatVelocityX: 45,
		autoSplatRate: 2.5,
		autoSplatCount: 2,
		curl: 4,
		velocityDissipation: 0.2,
		viscosity: 0.04,
		wallFriction: 0.22
	} satisfies FluidConfig
};

const gentlePlus = {
	id: 'gentle-plus',
	label: 'Gentle plus',
	description:
		'Gentle with more inlet speed setting: 95 instead of 65. All other settings unchanged.',
	config: { ...gentle.config, autoSplatVelocityX: 95 }
};

const cushionedPlus = {
	id: 'cushioned-plus',
	label: 'Cushioned plus',
	description:
		'Cushioned with more inlet speed setting: 75 instead of 45. All other settings unchanged.',
	config: { ...cushioned.config, autoSplatVelocityX: 75 }
};

const comparisons = [
	gentle,
	gentlePlus,
	cushioned,
	cushionedPlus,
	{
		id: 'gentle-inlet',
		label: 'Gentle inlet',
		description:
			'Continuous-inlet experiment: stronger flow from the start, no random bursts.',
		config: {
			...gentlePlus.config,
			autoSplatRate: 0,
			autoSplatCount: 0,
			initialSplatCount: 0,
			presetSplats: [],
			flow: {
				...gentlePlus.config.flow,
				mode: 'live',
				sources: [
					{
						kind: 'line',
						from: { x: 0.025, y: 0.475 },
						to: { x: 0.025, y: 0.515 },
						radius: 0.045,
						rate: 60,
						profile: 'parabolic',
						velocity: { x: 30, y: 0 },
						dye: { r: 0.02, g: 0.06, b: 0.08 }
					}
				]
			}
		} satisfies FluidConfig
	},
	{
		id: 'cushioned-inlet',
		label: 'Cushioned inlet',
		description:
			'More-slowed continuous-inlet experiment: stronger flow from the start, no random bursts.',
		config: {
			...cushionedPlus.config,
			autoSplatRate: 0,
			autoSplatCount: 0,
			initialSplatCount: 0,
			presetSplats: [],
			flow: {
				...cushionedPlus.config.flow,
				mode: 'live',
				sources: [
					{
						kind: 'line',
						from: { x: 0.025, y: 0.475 },
						to: { x: 0.025, y: 0.515 },
						radius: 0.045,
						rate: 60,
						profile: 'parabolic',
						velocity: { x: 22.5, y: 0 },
						dye: { r: 0.02, g: 0.06, b: 0.08 }
					}
				]
			}
		} satisfies FluidConfig
	}
];

const jets = [
	['gentle', 240],
	['cushioned', 300]
] as const;

// Jet stages are fixed 3:1, where the valve's straight inlet pipe (SVG x < 32.5,
// y ≈ 92–174 of 257) maps to UV y ≈ 0.389–0.590. The line spans that whole opening
// at the pipe mouth; a parabolic (pipe-flow) profile peaks mid-pipe and falls to
// zero at the walls, where slow near-wall flow would otherwise pile dye up to white.
export const JET_NOZZLE = {
	from: { x: 0.008, y: 0.389 },
	to: { x: 0.008, y: 0.59 },
	radius: 0.02,
	profile: 'parabolic'
} as const;

// Velocity is simulation texels/second: double the 128-grid drive on the 256 grid.
const flameGridRatio = 256 / 128;
const flameViscosity = 0.005;
const flame = {
	id: 'flame-jet',
	label: 'Flame-salt jet',
	description:
		'Hot copper, potassium and sodium salts; cold walls remove heat, not salt.',
	pulse: {
		base: 80 * flameGridRatio,
		peak: 240 * flameGridRatio,
		palette: SALT_DYES,
		clockCap: 1 / 120
	},
	config: {
		...TESLA_VALVE_CONFIG,
		simResolution: 256,
		dyeResolution: 512,
		substeps: 2,
		maxTimeStep: 1 / 240,
		pressureIterations: 160,
		viscosity: flameViscosity,
		// Half-float Jacobi iterates need not match at ρ^k≤2^-24; cutting to 10
		// perturbs velocity, then salt/flux. Preserve the measured 40-iterate flow.
		viscosityIterations: 40,
		advectionScheme: 'maccormack',
		curl: 0,
		velocityDissipation: 0,
		densityDissipation: 0,
		wallFriction: 0,
		autoSplatRate: 0,
		autoSplatCount: 0,
		autoSplatVelocityX: 0,
		initialSplatCount: 0,
		presetSplats: [],
		shading: false,
		glass: true,
		glassThickness: 0.03,
		glassRefraction: 0.5,
		glassReflectivity: 0.04,
		glassChromatic: 0.15,
		bloom: true,
		bloomResolution: 512,
		bloomIterations: 7,
		bloomIntensity: 0.5,
		bloomThreshold: 1,
		toneMapping: 'agx',
		sunrays: false,
		flow: {
			...TESLA_VALVE_CONFIG.flow,
			mode: 'live',
			walls: 'no-slip',
			forces: [
				{ kind: 'pressureGradient', vector: { x: 56 * flameGridRatio, y: 0 } }
			],
			sources: [
				{
					kind: 'line',
					...JET_NOZZLE,
					rate: 60,
					inflow: true,
					velocity: { x: 240 * flameGridRatio, y: 0 },
					dye: SALT_DYES[0],
					scalars: { temperature: 1 }
				}
			],
			scalarFields: [
				{
					name: 'temperature',
					dissipation: 0,
					diffusivity: 0.0016,
					// θ∈[0,1]; α=.0016/240·1536·4=.04096, ρ=4α/(1+4α).
					// ρ^9≤2^-24 bounds unit-field error; two extra iterations give margin.
					diffusionIterations: 11,
					wall: 'isothermal',
					radiativeCooling: 0,
					temperatureRatio: 6
				}
			],
			visualization: {
				emission: { scalar: 'temperature', intensity: 2, excitation: 14 }
			},
			outlets: [
				{
					edge: 'right',
					from: 0.16,
					to: 0.84,
					width: 0.08,
					clearDye: 1,
					clearScalars: false,
					clearVelocity: false
				}
			]
		}
	} satisfies FluidConfig
};

// Fig3a linear-light one-scalar fit; residual hue mismatch ΔE76=12.12 (ADR 0122).
export const PAPER_CARRIER = 5.65212;

// Optical depths approximate the photographs, not measured dye spectra.
export const PAPER_ABSORPTION = {
	absorbance: [
		{ r: 6, g: 2, b: 0.2 },
		{ r: 2, g: 0.05, b: 5 },
		{ r: 0.28, g: 0.025, b: 0.14 }
	]
} satisfies NonNullable<
	NonNullable<FluidConfig['flow']>['visualization']
>['absorption'];

export function paperConfig(
	direction: 1 | -1,
	force = 160,
	simResolution = 512
): FluidConfig & {
	flow: NonNullable<FluidConfig['flow']>;
	autoSplatVelocityX: number;
} {
	const x = direction > 0 ? 0.008 : 0.992;
	const centerY = direction > 0 ? 0.49 : 0.56;
	// Radius is Gaussian squared distance after /100 and aspect correction (3:1).
	// FWHM ≈ 0.9 sim cells; needle centres are separated by 4 cells at grid 512.
	const radius = 0.000035;
	return {
		...TESLA_VALVE_CONFIG,
		simResolution,
		dyeResolution: 768,
		substeps: 2,
		maxTimeStep: 1 / 120,
		pressure: 1,
		pressureIterations: 160,
		viscosity: 0.005,
		viscosityIterations: 20,
		advectionScheme: 'maccormack',
		curl: 0,
		velocityDissipation: 0,
		densityDissipation: 0,
		wallFriction: 0,
		autoSplatRate: 0,
		autoSplatCount: 0,
		autoSplatVelocityX: 0,
		initialSplatCount: 0,
		presetSplats: [],
		shading: false,
		specular: 0,
		bloom: false,
		sunrays: false,
		glass: false,
		toneMapping: 'none',
		backColor: { r: 255, g: 255, b: 255 },
		transparent: false,
		flow: {
			mode: 'live',
			walls: 'no-slip',
			boundary: { left: 'open', right: 'open', top: 'wall', bottom: 'wall' },
			forces: [
				{
					kind: 'pressureGradient',
					vector: { x: (direction * force * simResolution) / 512, y: 0 }
				}
			],
			sources: [
				{
					kind: 'line',
					from: { x, y: centerY - 0.101 },
					to: { x, y: centerY + 0.101 },
					radius,
					rate: 600,
					inflow: true,
					dye: { r: 0, g: 0, b: 1 }
				},
				{
					kind: 'point',
					x,
					y: centerY - 0.004,
					radius,
					rate: 1200,
					inflow: true,
					dye: { r: 1, g: 0, b: 1 }
				},
				{
					kind: 'point',
					x,
					y: centerY + 0.004,
					radius,
					rate: 1200,
					inflow: true,
					dye: { r: 0, g: 1, b: 1 }
				}
			],
			outlets: [
				{
					edge: direction > 0 ? 'right' : 'left',
					clearDye: 1,
					clearScalars: false,
					clearVelocity: false
				}
			],
			visualization: { absorption: PAPER_ABSORPTION }
		}
	};
}

const papers = [
	{
		id: 'paper-forward',
		label: 'Lower-speed experiment · forward',
		description:
			'2D flow model · measured Reynolds number 199.23 · 0.47 simulated seconds per real second. Flow stays steady; forward dye threads stay in their path (94% retained). The backward-to-forward pressure ratio for the same flow rate is 1.08 vs the paper’s 1.59 at matched Reynolds number, so this comparison fails. Patent outline: mean width 0.837 vs 0.9 cm; photo shape overlap score 0.71 (1 means identical).',
		config: paperConfig(1),
		mac: {
			direction: 1,
			force: 2.027521901389229,
			width: 1080,
			nu: 1.8,
			dt: 1 / 80,
			pressureSweeps: 32,
			dyeScale: 3,
			noiseAcceleration: 0.101,
			targetRe: 200
		} satisfies MacOptions
	},
	{
		id: 'paper-reverse',
		label: 'Lower-speed experiment · backward',
		description:
			'2D flow model · measured Reynolds number 199.73 · 0.47 simulated seconds per real second. The paper mixing comparison fails: flow stays smooth throughout; a 1.5× finer grid shows no dye mixing. Apparent mixing at 1× comes from dye spreading caused by the calculation. The paper’s 3D equipment mixes from section 3–4. Patent outline: mean width 0.837 vs 0.9 cm; photo shape overlap score 0.71 (1 means identical).',
		config: paperConfig(-1),
		mac: {
			direction: -1,
			force: 2.2,
			width: 1080,
			nu: 1.8,
			dt: 1 / 80,
			pressureSweeps: 32,
			dyeScale: 3,
			noiseAcceleration: 0.062,
			targetRe: 200
		} satisfies MacOptions
	},
	{
		id: 'paper-reverse-re50',
		label: 'Slowest experiment · backward',
		description:
			'2D flow model · measured Reynolds number 50.06 · ≈ 1.50 simulated seconds per real second (≈ the speed limit for these settings). Stable, steady; dye first spreads across the channel at section 9 (later than at Reynolds number 200). The measured disturbance of 0.77% fails the 1% ±20% target. Patent outline differs from the photo.',
		config: paperConfig(-1, 40),
		prerollSeconds: 40,
		mac: {
			direction: -1,
			force: 0.37854806661149154,
			width: 1080,
			nu: 1.8,
			dt: 0.04,
			pressureSweeps: 32,
			dyeScale: 3,
			noiseAcceleration: 0.0064,
			targetRe: 50
		} satisfies MacOptions
	},
	{
		id: 'paper-reverse-re400',
		label: 'Higher-speed experiment · backward',
		description:
			'2D flow model · measured Reynolds number 400.69 · 54.3 frames per second at machine load 9.7–26.7 · ≈ 0.19 simulated seconds per real second (≈ the 0.187 speed limit for these settings). Dye reaches the region where threads break apart ~15–20 s after loading. The first dye-mixing location changes with grid size (section 5–6 vs 8–10), so it is not yet reliable. Changing flow persists for ≤1.5 times the time for fluid to cross the valve with a more accurate pressure calculation, starting from already-changing flow (finer grid at Reynolds number 420). Independent software (Basilisk, 23 cells per mean channel width) shows repeating swirls at Reynolds number 400 with zero inlet disturbance (flow-rate frequency 4.712 Hz; frequency relative to flow speed, St, 0.835; late-to-early strength ratio of the main repeating motion 1.19 over ~1 crossing time). This 2D flow model gives St 0.92 vs 0.835, a ~9% unexplained gap. Finer-grid comparison: 1.5× grid St 0.90 vs 1× grid 0.93; variation between halves of the recording is 0.35 Hz, larger than the grid-related change, so the frequency comparison remains inconclusive. The repeated pressure calculation exaggerates changes in flow through a section by 6.02×. Upstream changes at sections 1–4 are largely caused by error in the pressure calculation: with the more accurate calculation they are still shrinking at 30 s (no settled comparison value). Over the last third of the recording, the repeated calculation exceeds the more accurate one by 19.6×, 21.0× and 24.5× at sections 1–3 (4.8× at section 4); downstream sections 6–11 agree within 16% (section 5 still shrinking, 1.37×). Earlier frequency estimates were wrong because sampling missed faster changes. Flow-rate variation across sections is ≈3.5% with the repeated pressure calculation. Dye looks paler and mixing weaker than Fig. 4; the paper’s 3D equipment mixes from section 3–4 at Reynolds number 200.',
		config: paperConfig(-1, 400),
		prerollSeconds: 10,
		dyePrerollSeconds: 3,
		stepsPerFrame: 4,
		mac: { direction: -1, force: 7.3, width: 1080, nu: 1.8, dt: .005, pressureSweeps: 128, dyeScale: 3, noiseAcceleration: .17, targetRe: 400 } satisfies MacOptions
	}
];

export const TUNINGS: {
	id: string;
	label: string;
	description: string;
	pulse?: JetPulse;
	mac?: MacOptions;
	prerollSeconds?: number;
	dyePrerollSeconds?: number;
	stepsPerFrame?: number;
	config: FluidConfig & {
		flow: NonNullable<FluidConfig['flow']>;
		autoSplatVelocityX: number;
	};
}[] = [
	flame,
	...jets.map(([name, peak]) => {
		const parent = comparisons.find(({ id }) => id === `${name}-inlet`)!;
		const flow: NonNullable<FluidConfig['flow']> = parent.config.flow;
		return {
			id: `${name}-jet`,
			pulse: {
				base: peak / 3,
				peak,
				palette: name === 'gentle' ? JET_DYES : undefined,
				clockCap: 1 / 60
			},
			label: `${name === 'gentle' ? 'Gentle' : 'Cushioned'} jet`,
			description: `Full-width inlet, pulsing push every 1.2 seconds; peak push setting ${peak}.`,
			config: {
				...parent.config,
				flow: {
					...parent.config.flow,
					sources: flow.sources!.map((source) => ({
						...source,
						...JET_NOZZLE,
						...(name === 'gentle' ? { dye: INITIAL_JET_DYE } : {}),
						velocity: { ...source.velocity!, x: peak }
					})),
					outlets: parent.config.flow.outlets!.map((outlet) =>
						outlet.edge === 'right'
							? { ...outlet, clearVelocity: false }
							: outlet
					)
				}
			} satisfies FluidConfig
		};
	}),
	...comparisons,
	...papers,
	...[
		['paper-forward', 'paper-forward-re200-tracers'],
		['paper-reverse', 'paper-reverse-re200-tracers'],
		['paper-reverse-re400', 'paper-reverse-re400-tracers']
	].map(([sibling, id]) => {
		const parent = papers.find((p) => p.id === sibling)!;
		return {
			...parent,
			id,
			label: `${parent.label} · moving dye dots`,
			description: `Moving dye dots follow the same simulated flow, not measured dye concentrations. Too few dots leave dashed blue gaps at forward Reynolds number 200 sections 10–11 and speckles in the Reynolds number 400 mixed region (sections 1–7 counted left to right), unlike dense dark dye in photographs. Median graphics-processor time for four steps, dots versus grid-based dye: ${sibling === 'paper-forward' ? '19.21 ms / 16.49 ms' : sibling === 'paper-reverse' ? '17.74 ms / 16.45 ms' : '18.37 ms / 12.66 ms'} at machine load 36–43 (five-minute load 78–84); this does not establish acceptable playback speed. All limitations of the matching flow experiment still apply.`,
			mac: { ...parent.mac, dye: 'tracers' as const }
		};
	})
];

export function getTuning(id: string | null = null) {
	return (
		TUNINGS.find((tuning) => tuning.id === id) ??
		TUNINGS.find((tuning) => tuning.id === 'flame-jet')!
	);
}
