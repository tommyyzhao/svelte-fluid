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
		'Original: a softer through-flow with fewer, quieter inlet splats.',
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
		'Original: a mild drive with more velocity damping, viscosity, and wall friction.',
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
		'Gentle with more inlet velocity: 95 instead of 65. All other settings unchanged.',
	config: { ...gentle.config, autoSplatVelocityX: 95 }
};

const cushionedPlus = {
	id: 'cushioned-plus',
	label: 'Cushioned plus',
	description:
		'Cushioned with more inlet velocity: 75 instead of 45. All other settings unchanged.',
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
			'Recommended: stronger continuous inlet from the first solver step, no random bursts.',
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
			'Cushioned alternative: stronger continuous inlet from the first solver step, no random bursts.',
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

// Fig3a linear-light one-scalar fit; residual hue mismatch ΔE76=12.12 (ADR 0119).
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
		label: 'Paper · forward · Re 200',
		description:
			'2D MAC · measured Re 199.23 · 0.47 physical s/wall s. Stability and forward filaments pass (94% corridor retention). Paper diodicity fails: matched-Re Di 1.08 vs 1.59. Patent trace: mean width 0.837 vs 0.9 cm, photo IoU 0.71.',
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
		label: 'Paper · reverse · Re 200',
		description:
			'2D MAC · measured Re 199.73 · 0.47 physical s/wall s. Paper mixing fails: laminar throughout; 1.5× grid shows no dye mixing. Apparent mixing at 1× is numerical dye diffusion. The paper’s 3D rig mixes from unit 3–4. Patent trace: mean width 0.837 vs 0.9 cm, photo IoU 0.71.' ,
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
		label: 'Paper · reverse · Re 50',
		description:
			'2D MAC · measured Re 50.06 · ≈ 1.50 physical s/wall s (≈ ceiling). Stable, steady; area onset unit 9 (later than Re 200). ε 0.77% fails the 1% ±20% disturbance target. Patent trace differs from the photo.',
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
		label: 'Paper · reverse · Re 401 · breakup',
		description:
			'2D · measured Re 400.69 · 54.3 fps at load 9.7–26.7 · ≈ 0.19 physical s/wall s (≈ the 0.187 ceiling). Dye reaches the breakup region ~15–20 s after loading. Dye onset is NOT resolution-converged (unit 5–6 vs 8–10). Unsteadiness persists for ≤1.5 flow-through times under exact projection, from an unsteady start (fine grid at Re 420). An independent code (Basilisk, 23 cells/w̄) shows Re 400 shedding is self-excited with zero inlet disturbance (Q 4.712 Hz, St 0.835; late/early fundamental amplitude 1.19 over ~1 T). MAC St 0.92 vs 0.835, ~9% gap unexplained. Fine grid: 1.5× St 0.90 vs 1× 0.93; half-window scatter 0.35 Hz exceeds the shift, so frequency grid-convergence is unresolved. Iterative solve inflates section-flux oscillation 6.02×. The upstream fluctuations at units 1–4 in this variant are largely a projection-leak artifact: exact-projection units 1–4 are still decaying at 30 s (no settled exact value), and over the last third of the record the iterative solve exceeds exact by 19.6×, 21.0× and 24.5× at units 1–3 (4.8× at unit 4); downstream units 6–11 agree within 16% (unit 5 still decaying, 1.37×). Earlier frequency estimates were aliases (see ADR 0119). Iterative section-flux spread ≈3.5%. Paler and weaker than Fig. 4; the paper’s 3D rig mixes from unit 3–4 at Re 200.',
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
			description: `Full-width inlet, pressure-like pulses every 1.2 seconds; ${peak} peak momentum.`,
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
			label: `${parent.label} · tracers`,
			description: `Passive dye tracers visualise the same simulated flow, not a concentration measurement. Finite sampling leaves dashed blue stretching gaps at forward Re 200 units 10–11 and salt-and-pepper speckle in the Re 400 mixed region (left-to-right units 1–7), unlike dense dark photographic dye. Four-step GPU median: ${sibling === 'paper-forward' ? '19.21 ms tracers / 16.49 ms grid' : sibling === 'paper-reverse' ? '17.74 ms tracers / 16.45 ms grid' : '18.37 ms tracers / 12.66 ms grid'} at machine load 36–43 (five-minute 78–84); not an fps pass. All sibling flow limitations remain.`,
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
