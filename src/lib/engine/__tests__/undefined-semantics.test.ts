/**
 * `undefined` means "not supplied": a patch carrying `{ x: undefined }` must
 * never change an already-resolved value (no reset to default, no clobber).
 */
import { describe, it, expect } from 'vitest';
import { resolveConfig, DEFAULTS } from '../FluidEngine.js';
import type { ContainerShape, FlowConfig, FluidConfig } from '../types.js';

const c = { r: 12, g: 34, b: 56 };

// Non-default value for every public field. `Required<>` makes the compiler
// fail this file when a field is added to FluidConfig without being covered.
const rich: Required<FluidConfig> = {
	simResolution: 96,
	dyeResolution: 640,
	densityDissipation: 0.7,
	initialDensityDissipation: 0.6,
	initialDensityDissipationDuration: 2.5,
	velocityDissipation: 0.9,
	advectionScheme: 'maccormack',
	maxTimeStep: 0.03,
	substeps: 3,
	viscosity: 0.2,
	viscosityIterations: 7,
	wallFriction: 0.3,
	wallFrictionWidth: 2,
	pressure: 0.4,
	pressureIterations: 9,
	autoPerformance: true,
	autoPerformanceTargetFrameMs: 20,
	autoPerformanceMinPressureIterations: 3,
	autoPerformanceMinSubsteps: 2,
	curl: 17,
	vorticityAdaptive: 0.5,
	splatRadius: 0.4,
	splatForce: 1234,
	shading: false,
	specular: 0.4,
	refraction: 0.6,
	colorful: false,
	colorUpdateSpeed: 3,
	maxFps: 30,
	paused: true,
	backColor: c,
	transparent: true,
	minContrast: 4.5,
	contrastColor: c,
	contrastMode: 'outline',
	toneMapping: 'agx',
	bloom: false,
	bloomIterations: 5,
	bloomResolution: 200,
	bloomIntensity: 0.9,
	bloomThreshold: 0.5,
	bloomSoftKnee: 0.4,
	sunrays: false,
	sunraysResolution: 150,
	sunraysWeight: 0.7,
	initialSplatCountMin: 2,
	initialSplatCountMax: 6,
	initialSplatCount: 4,
	pointerInput: false,
	pointerTarget: 'window',
	splatOnHover: true,
	seed: 4242,
	requireHardwareAcceleration: true,
	presetSplats: [{ x: 0.5, y: 0.5, dx: 10, dy: 10, color: { r: 1, g: 0, b: 0 } }],
	autoSplatRate: 0.8,
	autoSplatCount: 4,
	autoSplatColor: { r: 0.1, g: 0.2, b: 0.3 },
	autoSplatVelocityX: 5,
	autoSplatVelocityY: 6,
	autoSplatCenterX: 0.3,
	autoSplatCenterY: 0.6,
	autoSplatEvenX: true,
	autoSplatSwirl: 100,
	autoSplatBandHeight: 1.5,
	autoSplatBandWidth: 1.5,
	containerShape: { type: 'circle' } as unknown as ContainerShape | null,
	glass: true,
	glassThickness: 0.2,
	glassRefraction: 0.3,
	glassReflectivity: 0.4,
	glassChromatic: 0.5,
	reveal: true,
	revealSensitivity: 0.3,
	revealCurve: 0.8,
	revealCoverColor: { r: 0.5, g: 0.5, b: 0.5 },
	revealAccentColor: { r: 0.1, g: 0.2, b: 0.3 },
	revealFringeColor: { r: 0.3, g: 0.2, b: 0.1 },
	distortion: true,
	distortionPower: 0.6,
	distortionImageUrl: '/img.png',
	distortionFit: 'contain',
	distortionScale: 1.5,
	distortionBleedX: 0.1,
	distortionBleedY: 0.2,
	openBoundary: true,
	sticky: true,
	stickyMask: { text: 'hi' },
	stickyStrength: 0.5,
	stickyPressure: 0.3,
	stickyAmplify: 3,
	obstructions: [{ type: 'rect' } as unknown as NonNullable<FluidConfig['obstructions']>[number]],
	obstructionColor: { r: 9, g: 8, b: 7 },
	flow: { mode: 'live' } as FlowConfig | null
};

describe('undefined never overwrites a resolved value', () => {
	const base = resolveConfig(rich, DEFAULTS);

	it('fixture moves resolved config off defaults', () => {
		expect(base).not.toEqual(DEFAULTS);
	});

	it.each(Object.keys(rich) as (keyof FluidConfig)[])('%s', (key) => {
		const patch = { [key]: undefined } as FluidConfig;
		expect(resolveConfig(patch, base)).toEqual(base);
		expect(resolveConfig(patch, DEFAULTS)).toEqual(DEFAULTS);
	});

	it('all fields undefined at once is a no-op', () => {
		const patch = Object.fromEntries(Object.keys(rich).map((k) => [k, undefined])) as FluidConfig;
		expect(resolveConfig(patch, base)).toEqual(base);
	});
});
