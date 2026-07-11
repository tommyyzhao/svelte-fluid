import type { Rng } from '../rng.js';
import type { ContainerShape, FluidConfig } from '../types.js';
import type { FluidEngine } from '../FluidEngine.js';

export interface BenchScene {
	config: FluidConfig;
	thresholdBand: [number, number];
	seed: number;
	schedule(engine: FluidEngine, rng: Rng, frame: number, dt: number): void;
}

export interface FractionalApertureScene extends BenchScene {
	canvas: { width: number; height: number };
	frames: number;
	dt: number;
	/** Geometry-level solid predicate, independent of the engine's binary grid bake. */
	intendedSolidAt(u: number, v: number): boolean;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const dipoleColor = (rng: Rng) => ({
	r: 0.35 + rng() * 0.15,
	g: 0.05 + rng() * 0.08,
	b: 0.45 + rng() * 0.12
});

export const dipole: BenchScene = {
	seed: 0x1a11e,
	thresholdBand: [0.03, 1_000],
	config: {
		pointerInput: false,
		curl: 10,
		densityDissipation: 0,
		simResolution: 96,
		dyeResolution: 512,
		velocityDissipation: 0.96,
		pressure: 0.75,
		pressureIterations: 20,
		substeps: 1,
		maxTimeStep: 1 / 60,
		initialSplatCount: 0,
		shading: false,
		bloom: false,
		sunrays: false,
		backColor: { r: 0, g: 0, b: 0 }
	},
	schedule: (engine, rng, frame) => {
		if (frame === 0) {
			const color = dipoleColor(rng);
			engine.splat(0.41, 0.5, 1100, 40, color);
			engine.splat(0.59, 0.5, -1100, -40, { ...color });
			return;
		}

		if (frame % 18 !== 0) return;

		const jitter = (rng() - 0.5) * 0.06;
		const x = clamp01(0.5 + jitter);
		const amp = 280 + rng() * 140;
		const color = dipoleColor(rng);
		const sign = frame % 36 === 0 ? 1 : -1;
		engine.splat(x, 0.75, sign * amp, sign * 26, color);
	}
};

export const kelvinHelmholtz: BenchScene = {
	seed: 0x2beef,
	thresholdBand: [0.02, 1_000],
	config: {
		pointerInput: false,
		openBoundary: true,
		containerShape: {
			type: 'circle',
			cx: 0.5,
			cy: 0.5,
			radius: 0.48
		},
		curl: 18,
		densityDissipation: 0,
		simResolution: 128,
		dyeResolution: 768,
		velocityDissipation: 0.97,
		pressure: 0.74,
		substeps: 1,
		maxTimeStep: 1 / 60,
		initialSplatCount: 0,
		shading: false,
		bloom: false,
		sunrays: false,
		backColor: { r: 2, g: 4, b: 6 }
	},
	schedule: (engine, rng, frame) => {
		if (frame >= 180 || frame % 6 !== 0) return;

		const jitter = (rng() - 0.5) * 0.12;
		engine.splat(0.05, clamp01(0.35 + jitter), 620, 12, dipoleColor(rng));
		engine.splat(0.05, clamp01(0.65 + jitter), -620, -12, dipoleColor(rng));
	}
};

export const rayleighBenard: BenchScene = {
	seed: 0x3c0de,
	thresholdBand: [0.01, 1_000],
	config: {
		pointerInput: false,
		curl: 6,
		densityDissipation: 0,
		simResolution: 96,
		dyeResolution: 512,
		openBoundary: true,
		pressure: 0.8,
		pressureIterations: 22,
		substeps: 1,
		maxTimeStep: 1 / 60,
		initialSplatCount: 0,
		shading: false,
		bloom: false,
		sunrays: false,
		backColor: { r: 6, g: 10, b: 14 }
	},
	schedule: (engine, rng, frame, dt) => {
		if (frame % 4 !== 0) return;

		const jitter = (rng() - 0.5) * 0.2;
		const leftY = clamp01(0.22 + jitter);
		const rightY = clamp01(0.78 - jitter);
		const strength = 260 + rng() * 120;
		engine.splat(0.18, leftY, 0, -strength, {
			r: 0.06 + rng() * 0.15,
			g: 0.18 + rng() * 0.22,
			b: 0.4 + rng() * 0.25
		});
		engine.splat(0.82, rightY, 0, strength, {
			r: 0.4 + rng() * 0.15,
			g: 0.05 + rng() * 0.12,
			b: 0.12 + rng() * 0.08
		});
		const y = clamp01(0.5 + dt * strength * 0.01 * (rng() - 0.5));
		engine.splat(0.5, y, 90, 18, { r: 0.2, g: 0.4, b: 0.9 });
	}
};

export const thinWallTeslaValve: BenchScene = {
	seed: 0x47a1d,
	thresholdBand: [0.04, 1_000],
	config: {
		pointerInput: false,
		openBoundary: true,
		obstructions: [
			{
				d: 'M 49 0 L 51 0 L 51 42 L 49 42 Z M 49 58 L 51 58 L 51 100 L 49 100 Z',
				fit: 'fill',
				viewBox: [0, 0, 100, 100],
				fillRule: 'evenodd'
			}
		],
		flow: {
			mode: 'live',
			boundary: { left: 'open', right: 'open', top: 'wall', bottom: 'wall' },
			forces: [{ kind: 'pressureGradient', vector: { x: 26, y: 0 } }]
		},
		simResolution: 160,
		dyeResolution: 512,
		substeps: 1,
		maxTimeStep: 1 / 60,
		initialSplatCount: 0,
		curl: 0,
		densityDissipation: 0.36,
		velocityDissipation: 0.086,
		pressure: 0.82,
		wallFriction: 0.14,
		wallFrictionWidth: 2,
		shading: false,
		bloom: false,
		sunrays: false,
		backColor: { r: 5, g: 9, b: 12 }
	},
	schedule: (engine, rng, frame) => {
		if (frame % 8 !== 0) return;

		engine.splat(clamp01(0.02 + (rng() - 0.5) * 0.03), 0.5, 260 + rng() * 140, 0, {
			r: 0.05,
			g: 0.45,
			b: 0.9
		});
	}
};

export const projectionSweepShape: ContainerShape = {
	type: 'roundedRect',
	cx: 0.5,
	cy: 0.5,
	halfW: 1.8,
	halfH: 0.42,
	cornerRadius: 0.08
};

/** Deterministic projection scene; callers override `simResolution`. */
export const projectionSweep: BenchScene = {
	seed: 0x51ee7,
	thresholdBand: [0.01, 1_000],
	config: {
		pointerInput: false,
		containerShape: projectionSweepShape,
		openBoundary: false,
		simResolution: 128,
		dyeResolution: 64,
		curl: 0,
		velocityDissipation: 0.05,
		densityDissipation: 1,
		pressure: 0.8,
		pressureIterations: 20,
		substeps: 1,
		maxTimeStep: 1 / 60,
		initialSplatCount: 0,
		shading: false,
		bloom: false,
		sunrays: false,
		backColor: { r: 0, g: 0, b: 0 }
	},
	schedule: (engine, _rng, frame) => {
		if (frame === 0) {
			engine.splat(0.38, 0.5, 520, 45, { r: 0.8, g: 0.2, b: 0.1 });
			engine.splat(0.62, 0.5, -520, -45, { r: 0.1, g: 0.3, b: 0.9 });
			engine.splat(0.5, 0.32, 35, 380, { r: 0.3, g: 0.8, b: 0.2 });
			engine.splat(0.5, 0.68, -35, -380, { r: 0.8, g: 0.2, b: 0.7 });
		} else if (frame === 8) {
			engine.splat(0.46, 0.44, 240, 120, { r: 0.4, g: 0.6, b: 0.9 });
			engine.splat(0.54, 0.56, -240, -120, { r: 0.9, g: 0.5, b: 0.2 });
		}
	}
};

const apertureGateBase: FluidConfig = {
	pointerInput: false,
	openBoundary: true,
	flow: {
		mode: 'live',
		boundary: { left: 'open', right: 'open', top: 'wall', bottom: 'wall' },
		forces: [{ kind: 'pressureGradient', vector: { x: 24, y: 0 } }]
	},
	simResolution: 96,
	dyeResolution: 64,
	pressureIterations: 24,
	pressure: 0.82,
	velocityDissipation: 0.12,
	densityDissipation: 1,
	curl: 0,
	wallFriction: 0.08,
	wallFrictionWidth: 2,
	substeps: 1,
	maxTimeStep: 1 / 120,
	initialSplatCount: 0,
	shading: false,
	bloom: false,
	sunrays: false,
	backColor: { r: 0, g: 0, b: 0 }
};

const symmetricGateSchedule: BenchScene['schedule'] = (engine, _rng, frame) => {
	if (frame !== 0) return;
	engine.splat(0.16, 0.38, 150, 0, { r: 0.1, g: 0.4, b: 0.9 });
	engine.splat(0.16, 0.62, 150, 0, { r: 0.1, g: 0.4, b: 0.9 });
};

/** Curved interior obstacle with deliberately non-grid-aligned faces. */
export const curvedCylinderGate: FractionalApertureScene = {
	seed: 0x6c11d,
	thresholdBand: [0.01, 1_000],
	canvas: { width: 256, height: 128 },
	frames: 72,
	dt: 1 / 120,
	config: {
		...apertureGateBase,
		obstructions: [
			{
				d: 'M 41 50 A 9 18 0 1 0 59 50 A 9 18 0 1 0 41 50 Z',
				fit: 'fill',
				viewBox: [0, 0, 100, 100]
			}
		]
	},
	schedule: symmetricGateSchedule,
	intendedSolidAt: (u, v) => ((u - 0.5) / 0.09) ** 2 + ((v - 0.5) / 0.18) ** 2 <= 1
};

/** A resolved six-cell throat that exposes staircase and symmetry regressions. */
export const narrowThroatGate: FractionalApertureScene = {
	seed: 0x7a20a,
	thresholdBand: [0.01, 1_000],
	canvas: { width: 256, height: 128 },
	frames: 72,
	dt: 1 / 120,
	config: {
		...apertureGateBase,
		obstructions: [
			{
				d: 'M 45 0 H 55 V 46 H 45 Z M 45 54 H 55 V 100 H 45 Z',
				fit: 'fill',
				viewBox: [0, 0, 100, 100]
			}
		]
	},
	schedule: symmetricGateSchedule,
	intendedSolidAt: (u, v) => u >= 0.45 && u <= 0.55 && (v <= 0.46 || v >= 0.54)
};

/**
 * A 0.77-cell wall at this scene's 192×96 solver grid. It is an intentional
 * resolution-limit probe: visible resolved scenes must not inherit its leak.
 */
export const subcellWallGate: FractionalApertureScene = {
	seed: 0x8bc31,
	thresholdBand: [0.01, 1_000],
	canvas: { width: 256, height: 128 },
	frames: 72,
	dt: 1 / 120,
	config: {
		...apertureGateBase,
		obstructions: [
			{
				d: 'M 49.8 0 H 50.2 V 46 H 49.8 Z M 49.8 54 H 50.2 V 100 H 49.8 Z',
				fit: 'fill',
				viewBox: [0, 0, 100, 100]
			}
		]
	},
	schedule: symmetricGateSchedule,
	intendedSolidAt: (u, v) => u >= 0.498 && u <= 0.502 && (v <= 0.46 || v >= 0.54)
};

export const fractionalApertureScenes = {
	curvedCylinder: curvedCylinderGate,
	narrowThroat: narrowThroatGate,
	subcellWall: subcellWallGate
} as const;

export const scenes = {
	dipole,
	kelvinHelmholtz,
	rayleighBenard,
	thinWallTeslaValve
} as const;
