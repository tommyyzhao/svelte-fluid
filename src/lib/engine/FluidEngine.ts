/*
 * svelte-fluid — FluidEngine
 * Derivative work of WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017, MIT.
 * https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
 *
 * MIT License
 *
 * Copyright (c) 2017 Pavel Dobryakov  (original WebGL implementation)
 * Copyright (c) 2026 svelte-fluid contributors  (Svelte 5 / TypeScript port)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
 *
 * --------------------------------------------------------------------------
 * Architectural notes:
 *  - This is a per-instance class. There is *no* module-level mutable state.
 *  - WebGL context, framebuffers, programs, listener set, frame subscription,
 *    RNG and pointer state are all owned by the instance and freed by
 *    `dispose()`. The only shared object is the GL-free frame scheduler, which
 *    drives every instance from one requestAnimationFrame (ADR 0080).
 *  - The Svelte component owns layout measurement; explicit resize transitions
 *    preserve the context and persistent fields without reading DOM layout.
 *  - All randomness is routed through a seeded RNG so reconstruction and
 *    context restore reproduce the configured opening scene.
 */

import type {
	DoubleFBO,
	ExtInfo,
	FBO,
	FlowConfig,
	FlowForce,
	FlowGridField,
	FlowOutlet,
	FlowScalarField,
	FlowSource,
	FluidConfig,
	FluidHandle,
	PerformanceAction,
	PerformanceState,
	PerformanceTier,
	PresetSplat,
	PrescribedFlowField,
	ResolvedConfig,
	RGB
} from './types.js';
import {
	nextContinuousOverloadMs,
	nextFrameTimeEmaMs,
	performanceGovernorStep,
	sanitizePerformanceFrameSampleMs
} from './performance-governor.js';
import {
	type BlitFn,
	type GL,
	type ProgramWrap,
	Material,
	compileShader,
	correctRadius,
	createBlit,
	createDoubleFBO,
	createFBO,
	disposeDoubleFBO,
	disposeFBO,
	getResolution,
	getTextureScale,
	getWebGLContext,
	makeProgram,
	resizeDoubleFBO,
	scaleByPixelRatio,
	wrap
} from './gl-utils.js';
import { type DitheringTexture, createDitheringTexture } from './dithering.js';
import {
	type Pointer,
	PointerSlots,
	boundCoalesced,
	clampToCanvas,
	createPointer,
	pressureScale,
	recordPointerMove,
	updatePointerDownData,
	updatePointerUpData
} from './pointer.js';
import { type Rng, generateColor, mulberry32, normalizeColor, randomSeed } from './rng.js';
import { fitDrawingBufferSize } from './resolution.js';
import { flowCanDriveSolver } from './solver-activity.js';
import { blurMaskData } from './sticky-blur.js';
import { subscribeFrame } from './frame-scheduler.js';
import { notifyHost } from './notify-host.js';
import { JumpFlood, supportsJumpFlood } from './jump-flood.js';
import {
	MAX_COALESCED_PER_EVENT,
	MAX_AUTO_SPLAT_COUNT,
	MAX_INITIAL_SPLATS,
	enqueueRandomSplats,
	isFiniteSplat,
	randomSplatsThisFrame,
	withoutNonFiniteConfig
} from './input-bounds.js';
import {
	containerShapeEqual,
	stickyMaskEqual,
	containerMask,
	maskAreaFraction,
	obstructionsEqual,
	obstructionMask,
	bakeSolidNeighborData,
	bakeSolidClearanceData,
	type MaskContext
} from './container-shapes.js';
import * as S from './shaders.js';
import { VORTICITY_ADAPTIVE_LO, VORTICITY_ADAPTIVE_HI } from './shaders.js';
import {
	EngineProfiler,
	createTimerQueryAdapter,
	estimateTextureBytes,
	type EngineProfileSnapshot,
	type ProfileEnvironment,
	type ProfileGroup,
	type ProfileLifecyclePhase,
	type ProfileResources
} from './engine-profiler.js';
import { adaptiveVorticityWeight, vorticityNormalizationScale } from './vorticity-normalization.js';

const FLOW_SOURCE_BATCH_SIZE = 4;
const FLOW_OUTLET_BATCH_SIZE = 4;

const CORE_PROGRAM_NAMES = [
	'copy',
	'clear',
	'splat',
	'advection',
	'divergence',
	'curl',
	'vorticity',
	'viscosity',
	'wallFriction',
	'pressure',
	'pressureJacobi2',
	'gradientSubtract'
] as const;

const OPTIONAL_PROGRAM_NAMES = [
	'blur',
	'bloomPrefilter',
	'bloomBlur',
	'bloomFinal',
	'sunraysMask',
	'sunrays',
	'advectionMacCormack',
	'flowSource',
	'flowOutlet',
	'flowForce',
	'prescribedField',
	'applyMask',
	'glass'
] as const;

type CoreProgramName = (typeof CORE_PROGRAM_NAMES)[number];
type OptionalProgramName = (typeof OPTIONAL_PROGRAM_NAMES)[number];
type EngineProgramName = CoreProgramName | OptionalProgramName;

interface FlowSourceBatchEntry {
	kind: 0 | 1 | 2;
	profile: 0 | 1;
	fromX: number;
	fromY: number;
	toX: number;
	toY: number;
	rectX: number;
	rectY: number;
	rectW: number;
	rectH: number;
	color: RGB;
	radius: number;
}

interface FlowOutletBatchEntry {
	edge: 0 | 1 | 2 | 3;
	from: number;
	to: number;
	width: number;
	keep: number;
}

type ReadField = 'velocity' | 'dye' | 'pressure' | 'divergence' | 'curl' | 'scalar';

type ResourceInitMode = 'fresh' | 'preserve';

interface ReadFieldOptions {
	components?: 1 | 2 | 3 | 4;
}

/** @internal */
export interface ReadFieldResult {
	readonly data: Float32Array;
	readonly width: number;
	readonly height: number;
	readonly components: number;
}

/* -------------------------------------------------------------------------- */
/*                                  Defaults                                  */
/* -------------------------------------------------------------------------- */

/** @internal Exported for tests — not part of the public API. */
export const DEFAULTS: ResolvedConfig = {
	SIM_RESOLUTION: 128,
	DYE_RESOLUTION: 1024,
	DENSITY_DISSIPATION: 1,
	INITIAL_DENSITY_DISSIPATION: 1,
	INITIAL_DENSITY_DISSIPATION_DURATION: 0,
	VELOCITY_DISSIPATION: 0.2,
	ADVECTION_SCHEME: 'semilagrangian' as const,
	MAX_TIME_STEP: 1 / 60,
	SUBSTEPS: 1,
	VISCOSITY: 0,
	VISCOSITY_ITERATIONS: 8,
	WALL_FRICTION: 0,
	WALL_FRICTION_WIDTH: 1,
	PRESSURE: 0.8,
	PRESSURE_ITERATIONS: 20,
	AUTO_PERFORMANCE: false,
	AUTO_PERFORMANCE_TARGET_FRAME_MS: 1000 / 60,
	AUTO_PERFORMANCE_MIN_PRESSURE_ITERATIONS: 8,
	AUTO_PERFORMANCE_MIN_SUBSTEPS: 1,
	CURL: 30,
	VORTICITY_ADAPTIVE: 0,
	SPLAT_RADIUS: 0.25,
	SPLAT_FORCE: 6000,
	SHADING: true,
	SPECULAR: 0,
	REFRACTION: 0,
	COLORFUL: true,
	COLOR_UPDATE_SPEED: 10,
	PAUSED: false,
	BACK_COLOR: { r: 0, g: 0, b: 0 },
	TRANSPARENT: false,
	TONE_MAPPING: 'none' as const,
	BLOOM: true,
	BLOOM_ITERATIONS: 8,
	BLOOM_RESOLUTION: 256,
	BLOOM_INTENSITY: 0.8,
	BLOOM_THRESHOLD: 0.6,
	BLOOM_SOFT_KNEE: 0.7,
	SUNRAYS: true,
	SUNRAYS_RESOLUTION: 196,
	SUNRAYS_WEIGHT: 1.0,
	INITIAL_SPLAT_MIN: 5,
	INITIAL_SPLAT_MAX: 25,
	POINTER_INPUT: true,
	POINTER_TARGET: 'canvas' as const,
	SPLAT_ON_HOVER: false,
	SEED: 0,
	REQUIRE_HARDWARE_ACCELERATION: false,
	AUTO_SPLAT_RATE: 0,
	AUTO_SPLAT_COUNT: 1,
	AUTO_SPLAT_COLOR: null,
	AUTO_SPLAT_VELOCITY_X: 0,
	AUTO_SPLAT_VELOCITY_Y: 0,
	AUTO_SPLAT_CENTER_Y: 0.5,
	AUTO_SPLAT_CENTER_X: 0.5,
	AUTO_SPLAT_EVEN_X: false,
	AUTO_SPLAT_SWIRL: 0,
	AUTO_SPLAT_BAND_HEIGHT: 0.1,
	AUTO_SPLAT_BAND_WIDTH: 1.0,
	CONTAINER_SHAPE: null,
	GLASS: false,
	GLASS_THICKNESS: 0.04,
	GLASS_REFRACTION: 0.4,
	GLASS_REFLECTIVITY: 0.12,
	GLASS_CHROMATIC: 0.15,
	REVEAL: false,
	REVEAL_SENSITIVITY: 0.1,
	REVEAL_CURVE: 0.5,
	REVEAL_COVER_COLOR: { r: 1, g: 1, b: 1 },
	REVEAL_ACCENT_COLOR: { r: 0.05, g: 0.16, b: 0.32 },
	REVEAL_FRINGE_COLOR: { r: 0.6, g: 0.7, b: 0.85 },
	DISTORTION: false,
	DISTORTION_POWER: 0.4,
	DISTORTION_IMAGE_URL: null,
	DISTORTION_FIT: 'cover' as const,
	DISTORTION_SCALE: 1.0,
	DISTORTION_BLEED_X: 0,
	DISTORTION_BLEED_Y: 0,
	OPEN_BOUNDARY: false,
	STICKY: false,
	STICKY_MASK: null,
	STICKY_STRENGTH: 0.9,
	STICKY_PRESSURE: 0.15,
	STICKY_AMPLIFY: 0.3,
	OBSTRUCTIONS: null,
	OBSTRUCTION_COLOR: null,
	FLOW: null
};
/** @internal Exported for tests — not part of the public API. */
export function resolveConfig(input: FluidConfig | undefined, base: ResolvedConfig): ResolvedConfig {
	const out: ResolvedConfig = { ...base };
	if (!input) return out;
	input = withoutNonFiniteConfig(input);
	const splatCount = (value: number, max: number) => Math.max(0, Math.min(max, Math.floor(value)));
	if (input.simResolution !== undefined) out.SIM_RESOLUTION = input.simResolution;
	if (input.dyeResolution !== undefined) out.DYE_RESOLUTION = input.dyeResolution;
	if (input.densityDissipation !== undefined) {
		out.DENSITY_DISSIPATION = input.densityDissipation;
		// Default `initialDensityDissipation` to match the steady-state
		// value so existing consumers see no behavior change.
		if (input.initialDensityDissipation === undefined) {
			out.INITIAL_DENSITY_DISSIPATION = input.densityDissipation;
		}
	}
	if (input.initialDensityDissipation !== undefined) out.INITIAL_DENSITY_DISSIPATION = input.initialDensityDissipation;
	if (input.initialDensityDissipationDuration !== undefined)
		out.INITIAL_DENSITY_DISSIPATION_DURATION = input.initialDensityDissipationDuration;
	if (input.velocityDissipation !== undefined) out.VELOCITY_DISSIPATION = input.velocityDissipation;
	if (input.advectionScheme !== undefined)
		out.ADVECTION_SCHEME = input.advectionScheme === 'maccormack' ? 'maccormack' : 'semilagrangian';
	if (input.maxTimeStep !== undefined) out.MAX_TIME_STEP = Math.max(0.001, input.maxTimeStep);
	if (input.substeps !== undefined) out.SUBSTEPS = Math.max(1, Math.min(8, Math.floor(input.substeps)));
	if (input.viscosity !== undefined) out.VISCOSITY = Math.max(0, input.viscosity);
	if (input.viscosityIterations !== undefined)
		out.VISCOSITY_ITERATIONS = Math.max(0, Math.min(40, Math.floor(input.viscosityIterations)));
	if (input.wallFriction !== undefined) out.WALL_FRICTION = Math.max(0, Math.min(1, input.wallFriction));
	if (input.wallFrictionWidth !== undefined)
		out.WALL_FRICTION_WIDTH = Math.max(0, Math.min(4, input.wallFrictionWidth));
	if (input.pressure !== undefined) out.PRESSURE = input.pressure;
	if (input.pressureIterations !== undefined) out.PRESSURE_ITERATIONS = input.pressureIterations;
	if (input.autoPerformance !== undefined) out.AUTO_PERFORMANCE = input.autoPerformance;
	if (
		input.autoPerformanceTargetFrameMs !== undefined &&
		Number.isFinite(input.autoPerformanceTargetFrameMs)
	) {
		out.AUTO_PERFORMANCE_TARGET_FRAME_MS = Math.max(
			1,
			Math.min(1000, input.autoPerformanceTargetFrameMs)
		);
	}
	if (input.autoPerformanceMinPressureIterations !== undefined)
		out.AUTO_PERFORMANCE_MIN_PRESSURE_ITERATIONS = Math.max(
			0,
			Math.floor(input.autoPerformanceMinPressureIterations)
		);
	if (input.autoPerformanceMinSubsteps !== undefined)
		out.AUTO_PERFORMANCE_MIN_SUBSTEPS = Math.max(1, Math.min(8, Math.floor(input.autoPerformanceMinSubsteps)));
	if (input.curl !== undefined) out.CURL = input.curl;
	if (input.vorticityAdaptive !== undefined) {
		out.VORTICITY_ADAPTIVE = clamp01(input.vorticityAdaptive);
	}
	if (input.splatRadius !== undefined) out.SPLAT_RADIUS = input.splatRadius;
	if (input.splatForce !== undefined) out.SPLAT_FORCE = input.splatForce;
	if (input.shading !== undefined) out.SHADING = input.shading;
	if (input.specular !== undefined) out.SPECULAR = clamp01(input.specular);
	if (input.refraction !== undefined) out.REFRACTION = clamp01(input.refraction);
	if (input.colorful !== undefined) out.COLORFUL = input.colorful;
	if (input.colorUpdateSpeed !== undefined) out.COLOR_UPDATE_SPEED = input.colorUpdateSpeed;
	if (input.paused !== undefined) out.PAUSED = input.paused;
	if (input.backColor !== undefined) out.BACK_COLOR = input.backColor;
	if (input.transparent !== undefined) out.TRANSPARENT = input.transparent;
	if (input.toneMapping === 'neutral' || input.toneMapping === 'agx' || input.toneMapping === 'none')
		out.TONE_MAPPING = input.toneMapping;
	if (input.bloom !== undefined) out.BLOOM = input.bloom;
	if (input.bloomIterations !== undefined) out.BLOOM_ITERATIONS = input.bloomIterations;
	if (input.bloomResolution !== undefined) out.BLOOM_RESOLUTION = input.bloomResolution;
	if (input.bloomIntensity !== undefined) out.BLOOM_INTENSITY = input.bloomIntensity;
	if (input.bloomThreshold !== undefined) out.BLOOM_THRESHOLD = input.bloomThreshold;
	if (input.bloomSoftKnee !== undefined) out.BLOOM_SOFT_KNEE = input.bloomSoftKnee;
	if (input.sunrays !== undefined) out.SUNRAYS = input.sunrays;
	if (input.sunraysResolution !== undefined) out.SUNRAYS_RESOLUTION = input.sunraysResolution;
	if (input.sunraysWeight !== undefined) out.SUNRAYS_WEIGHT = input.sunraysWeight;
	if (input.initialSplatCountMin !== undefined)
		out.INITIAL_SPLAT_MIN = splatCount(input.initialSplatCountMin, MAX_INITIAL_SPLATS);
	if (input.initialSplatCountMax !== undefined)
		out.INITIAL_SPLAT_MAX = splatCount(input.initialSplatCountMax, MAX_INITIAL_SPLATS);
	if (input.initialSplatCount !== undefined) {
		out.INITIAL_SPLAT_MIN = splatCount(input.initialSplatCount, MAX_INITIAL_SPLATS);
		out.INITIAL_SPLAT_MAX = out.INITIAL_SPLAT_MIN;
	}
	if (input.pointerInput !== undefined) out.POINTER_INPUT = input.pointerInput;
	if (input.pointerTarget !== undefined) out.POINTER_TARGET = input.pointerTarget;
	if (input.splatOnHover !== undefined) out.SPLAT_ON_HOVER = input.splatOnHover;
	if (input.seed !== undefined) out.SEED = input.seed >>> 0;
	if (input.requireHardwareAcceleration !== undefined)
		out.REQUIRE_HARDWARE_ACCELERATION = input.requireHardwareAcceleration;
	if (input.autoSplatRate !== undefined) out.AUTO_SPLAT_RATE = input.autoSplatRate;
	if (input.autoSplatCount !== undefined) out.AUTO_SPLAT_COUNT = splatCount(input.autoSplatCount, MAX_AUTO_SPLAT_COUNT);
	if (input.autoSplatColor !== undefined) out.AUTO_SPLAT_COLOR = input.autoSplatColor;
	if (input.autoSplatVelocityX !== undefined) out.AUTO_SPLAT_VELOCITY_X = input.autoSplatVelocityX;
	if (input.autoSplatVelocityY !== undefined) out.AUTO_SPLAT_VELOCITY_Y = input.autoSplatVelocityY;
	if (input.autoSplatCenterY !== undefined) out.AUTO_SPLAT_CENTER_Y = Math.max(0, Math.min(1, input.autoSplatCenterY));
	if (input.autoSplatCenterX !== undefined) out.AUTO_SPLAT_CENTER_X = Math.max(0, Math.min(1, input.autoSplatCenterX));
	if (input.autoSplatEvenX !== undefined) out.AUTO_SPLAT_EVEN_X = input.autoSplatEvenX;
	if (input.autoSplatSwirl !== undefined) out.AUTO_SPLAT_SWIRL = input.autoSplatSwirl;
	if (input.autoSplatBandHeight !== undefined) out.AUTO_SPLAT_BAND_HEIGHT = input.autoSplatBandHeight;
	if (input.autoSplatBandWidth !== undefined) out.AUTO_SPLAT_BAND_WIDTH = input.autoSplatBandWidth;
	if (input.containerShape !== undefined) out.CONTAINER_SHAPE = input.containerShape ?? null;
	if (input.glass !== undefined) out.GLASS = input.glass;
	if (input.glassThickness !== undefined) out.GLASS_THICKNESS = input.glassThickness;
	if (input.glassRefraction !== undefined) out.GLASS_REFRACTION = input.glassRefraction;
	if (input.glassReflectivity !== undefined) out.GLASS_REFLECTIVITY = input.glassReflectivity;
	if (input.glassChromatic !== undefined) out.GLASS_CHROMATIC = input.glassChromatic;
	if (input.reveal !== undefined) out.REVEAL = input.reveal;

	if (input.revealSensitivity !== undefined) out.REVEAL_SENSITIVITY = input.revealSensitivity;
	if (input.revealCurve !== undefined) out.REVEAL_CURVE = input.revealCurve;
	if (input.revealCoverColor !== undefined) out.REVEAL_COVER_COLOR = input.revealCoverColor;
	if (input.revealAccentColor !== undefined) out.REVEAL_ACCENT_COLOR = input.revealAccentColor;
	if (input.revealFringeColor !== undefined) out.REVEAL_FRINGE_COLOR = input.revealFringeColor;
	if (input.distortion !== undefined) out.DISTORTION = input.distortion;
	if (input.distortionPower !== undefined) out.DISTORTION_POWER = input.distortionPower;
	if (input.distortionImageUrl !== undefined) out.DISTORTION_IMAGE_URL = input.distortionImageUrl ?? null;
	if (input.distortionFit !== undefined) out.DISTORTION_FIT = input.distortionFit;
	if (input.distortionScale !== undefined) out.DISTORTION_SCALE = input.distortionScale;
	if (input.distortionBleedX !== undefined) out.DISTORTION_BLEED_X = Math.max(0, Math.min(0.5, input.distortionBleedX));
	if (input.distortionBleedY !== undefined) out.DISTORTION_BLEED_Y = Math.max(0, Math.min(0.5, input.distortionBleedY));
	if (input.openBoundary !== undefined) out.OPEN_BOUNDARY = input.openBoundary;
	if (input.sticky !== undefined) out.STICKY = input.sticky;
	if (input.stickyMask !== undefined) out.STICKY_MASK = input.stickyMask ?? null;
	if (input.stickyStrength !== undefined) out.STICKY_STRENGTH = input.stickyStrength;
	if (input.stickyPressure !== undefined) out.STICKY_PRESSURE = input.stickyPressure;
	if (input.stickyAmplify !== undefined) out.STICKY_AMPLIFY = input.stickyAmplify;
	if (input.obstructions !== undefined) out.OBSTRUCTIONS = input.obstructions ?? null;
	if (input.obstructionColor !== undefined) out.OBSTRUCTION_COLOR = input.obstructionColor ?? null;
	if (input.flow !== undefined) out.FLOW = input.flow ?? null;
	return out;
}

function flowConfigEqual(a: FlowConfig | null | undefined, b: FlowConfig | null | undefined): boolean {
	if (!a && !b) return true;
	if (!a || !b) return false;
	return (
		flowBoundaryEqual(a.boundary, b.boundary) &&
		shallowArrayEqual(a.sources, b.sources) &&
		shallowArrayEqual(a.outlets, b.outlets) &&
		shallowArrayEqual(a.scalarFields, b.scalarFields) &&
		shallowArrayEqual(a.forces, b.forces) &&
		prescribedFlowEqual(a.prescribed, b.prescribed) &&
		a.visualization === b.visualization &&
		a.mode === b.mode
	);
}

function shallowArrayEqual<T>(a: ReadonlyArray<T> | undefined, b: ReadonlyArray<T> | undefined): boolean {
	if (!a && !b) return true;
	if (!a || !b) return false;
	if (a === b) return true;
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

function flowBoundaryEqual(a: FlowConfig['boundary'], b: FlowConfig['boundary']): boolean {
	return (
		(a?.left ?? null) === (b?.left ?? null) &&
		(a?.right ?? null) === (b?.right ?? null) &&
		(a?.top ?? null) === (b?.top ?? null) &&
		(a?.bottom ?? null) === (b?.bottom ?? null)
	);
}

function prescribedGridFieldEqual(a: FlowGridField | undefined, b: FlowGridField | undefined): boolean {
	if (!a && !b) return true;
	if (!a || !b) return false;
	return (
		a.width === b.width &&
		a.height === b.height &&
		(a.scale ?? null) === (b.scale ?? null) &&
		(a.version ?? null) === (b.version ?? null) &&
		a.data === b.data
	);
}

function prescribedFlowEqual(a: FlowConfig['prescribed'], b: FlowConfig['prescribed']): boolean {
	if (!a && !b) return true;
	if (!a || !b) return false;
	if (a.kind !== b.kind) return false;
	if (a.kind === 'grid' && b.kind === 'grid') {
		const aKeys = Object.keys(a.scalars ?? {}).sort();
		const bKeys = Object.keys(b.scalars ?? {}).sort();
		return (
			prescribedGridFieldEqual(a.velocity, b.velocity) &&
			aKeys.length === bKeys.length &&
			aKeys.every((key, i) => key === bKeys[i] && prescribedGridFieldEqual(a.scalars?.[key], b.scalars?.[key]))
		);
	}
	return false;
}

function flowScalarChannel(name: string | undefined, fields?: ReadonlyArray<FlowScalarField>): number {
	const n = name ?? fields?.[0]?.name ?? 'temperature';
	if (n === 'temperature') return 0;
	if (n === 'ink') return 1;
	const idx = fields?.findIndex((f) => f.name === n) ?? -1;
	if (idx >= 0) return Math.min(idx, 2);
	return 2;
}

function needsScalarFBOForFlow(flow: FlowConfig | null | undefined): boolean {
	if (!flow) return false;
	if (flow.scalarFields && flow.scalarFields.length > 0) return true;
	if (flow.visualization?.colorBy === 'temperature' || flow.visualization?.colorBy === 'scalar') return true;
	if (flow.sources?.some((s) => s.scalars && Object.keys(s.scalars).length > 0)) return true;
	if (flow.forces?.some((f) => f.kind === 'buoyancy')) return true;
	if (flow.prescribed && flow.prescribed.kind === 'grid' && flow.prescribed.scalars) return true;
	return false;
}

function scalarDissipationForField(field: FlowScalarField | undefined, fallback: number): number {
	const dissipation = field?.dissipation ?? fallback;
	return field?.advection === 'low-dissipation' ? dissipation * 0.35 : dissipation;
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

/** @internal Exported for deterministic timing-policy tests. */
export function clampSimulationDeltaSeconds(
	frameSeconds: number,
	maxTimeStep: number,
	requestedSubsteps: number
): number {
	return Math.min(frameSeconds, maxTimeStep * requestedSubsteps);
}

// Single-sourced in shaders.ts (alongside the GLSL that consumes them) to keep
// the GLSL band, this TypeScript mirror, and the tests from drifting apart.
// Imported above for local default-parameter use; re-exported so existing
// importers (and tests) that read these from FluidEngine keep working.
export { VORTICITY_ADAPTIVE_LO, VORTICITY_ADAPTIVE_HI };

/**
 * Resolution-aware viscosity coefficient used at the CPU-facing uniform site.
 *
 * We keep the old formula at N_actual = N_ref (screen-isotropic default resolution)
 * so existing default-presets stay byte-identical while preserving O(N^2)-invariant
 * diffusion behavior as sim resolution changes.
 */
export function viscosityAlpha(viscosity: number, dt: number, width: number, height: number, nRef = DEFAULTS.SIM_RESOLUTION): number {
	const nActual = Math.min(width, height);
	return viscosity * dt * Math.max(width, height) * (nActual / nRef);
}

/**
 * Resolution-aware vorticity confinement gain multiplier.
 *
 * This keeps the default-resolution gain unchanged and scales confinement strength
 * with 1/N when sim resolution increases, matching the same screen-space cell
 * size convention as viscosity scaling.
 */
export function curlScale(curl: number, width: number, height: number, nRef = DEFAULTS.SIM_RESOLUTION): number {
	const nActual = Math.min(width, height);
	return curl * (nRef / nActual);
}

/**
 * Keep vorticity confinement byte-identical when adaptive mix is 0, and
 * progressively gate the legacy magnitude only where local rotation is strong.
 *
 * `curlSample` is the legacy vorticity field value from `curlShader`, where
 * the actual vorticity magnitude is `2 * curlSample`.
 */
export function adaptiveConfinementMagnitude(
	curl: number,
	curlSample: number,
	adaptiveMix: number,
	lo = VORTICITY_ADAPTIVE_LO,
	hi = VORTICITY_ADAPTIVE_HI,
	width = DEFAULTS.SIM_RESOLUTION,
	height = DEFAULTS.SIM_RESOLUTION
): number {
	const epsLegacy = curl * curlSample;
	if (adaptiveMix <= 0 || lo >= hi) {
		return epsLegacy;
	}

	const scale = adaptiveVorticityWeight(curlSample, width, height, lo, hi);
	const epsAdaptive = epsLegacy * scale;
	const mix = clamp01(adaptiveMix);
	return epsLegacy + (epsAdaptive - epsLegacy) * mix;
}

/**
 * Compute the boundary confinement attenuation from pre-baked face-solidity flags.
 *
 * Neighbors are stored in rgba order L/R/T/B with binary values; any solid
 * adjacent face suppresses confinement for that cell by attenuating the force
 * all the way to zero.
 */
export function solidNeighborConfinementAttenuation(left: number, right: number, top: number, bottom: number): number {
	return clamp01(1.0 - Math.max(Math.max(left, right), Math.max(top, bottom)));
}

/* -------------------------------------------------------------------------- */
/*                                FluidEngine                                 */
/* -------------------------------------------------------------------------- */

export interface FluidEngineOptions {
	canvas: HTMLCanvasElement;
	config?: FluidConfig;
	/** @internal Construct without auto-starting the requestAnimationFrame loop. */
	autoStart?: boolean;
	/**
	 * @internal Whole-frame benchmark instrumentation. Uses disjoint timer
	 * queries when available and an explicit CPU submission-time fallback.
	 */
	instrument?: boolean | 'cpu';
	/**
	 * @internal Bench/test override for {@link FluidConfig.advectionScheme}. This
	 * keeps the readback harness able to A/B schemes without mutating scene config.
	 */
	advectionScheme?: 'semilagrangian' | 'maccormack';
	/**
	 * @internal Called once when the shared frame scheduler evicts this engine
	 * because a frame threw. The engine stays stopped (no retry loop); the host
	 * decides how to surface it (ADR 0085).
	 */
	onFrameError?: (error: unknown) => void;
}

/** Fixed opening-settle length for the reduced-motion still frame (ADR 0085). */
const STILL_STEPS = 60;
const STILL_DT = 1 / 60;

export class FluidEngine implements FluidHandle {
	// --- Owned references ---
	private canvas: HTMLCanvasElement;
	private gl!: GL;
	private ext!: ExtInfo;
	private config: ResolvedConfig;
	private rng: Rng;
	// Bucket-D input is retained as an immutable value snapshot solely so a
	// context restore can rebuild the same opening scene as construction.
	private readonly openingPresetSplats: readonly PresetSplat[];

	// --- GL buffers ---
	private vertexBuffer!: WebGLBuffer;
	private indexBuffer!: WebGLBuffer;
	private blit!: BlitFn;

	// --- Shaders kept for dispose ---
	private baseVertexShader!: WebGLShader;
	private blurVertexShader!: WebGLShader;
	private fragmentShaders: WebGLShader[] = [];

	// --- Programs ---
	private blurProgram!: ProgramWrap;
	private copyProgram!: ProgramWrap;
	private clearProgram!: ProgramWrap;
	private bloomPrefilterProgram!: ProgramWrap;
	private bloomBlurProgram!: ProgramWrap;
	private bloomFinalProgram!: ProgramWrap;
	private sunraysMaskProgram!: ProgramWrap;
	private sunraysProgram!: ProgramWrap;
	private splatProgram!: ProgramWrap;
	private advectionProgram!: ProgramWrap;
	private advectionMacCormackProgram!: ProgramWrap;
	private divergenceProgram!: ProgramWrap;
	private curlProgram!: ProgramWrap;
	private vorticityProgram!: ProgramWrap;
	private viscosityProgram!: ProgramWrap;
	private wallFrictionProgram!: ProgramWrap;
	private pressureProgram!: ProgramWrap;
	private pressureJacobi2Program!: ProgramWrap;
	private gradientSubtractProgram!: ProgramWrap;
	private flowSourceProgram!: ProgramWrap;
	private flowOutletProgram!: ProgramWrap;
	private flowForceProgram!: ProgramWrap;
	private prescribedFieldProgram!: ProgramWrap;
	private displayMaterial!: Material;
	private applyMaskProgram!: ProgramWrap;
	private glassProgram!: ProgramWrap;

	// --- Distortion image texture ---
	private distortionTexture: WebGLTexture | null = null;
	private distortionImgRatio = 1.0;
	private distortionLoadedUrl: string | null = null;
	private distortionTextureW = 0;
	private distortionTextureH = 0;

	// --- Prescribed grid textures (8-bit encoded, decoded in shader) ---
	private prescribedVelocityTexture: WebGLTexture | null = null;
	private prescribedVelocityScale = 1;
	private prescribedScalarTexture: WebGLTexture | null = null;
	private prescribedScalarScale = 1;

	// --- Mask texture for svgPath shapes ---
	private maskTexture: WebGLTexture | null = null;
	private maskData: Uint8Array | null = null;
	private maskW = 0;
	private maskH = 0;
	private maskAreaFractionCache = 1.0;

	// --- Jump-flood signed distance fields (ADR-0084, WebGL2 only) ---
	// Built from the coverage masks when they change; R16F, in mask texels,
	// negative inside. Programs and seed buffers are created on first use.
	private jumpFlood: JumpFlood | null = null;
	private containerSdf: FBO | null = null;
	private obstructionSdf: FBO | null = null;

	// --- Sticky mask texture ---
	private stickyMaskTexture: WebGLTexture | null = null;
	private stickyFallbackTexture: WebGLTexture | null = null;
	private stickyMaskW = 0;
	private stickyMaskH = 0;

	// --- Combined interior-obstruction mask (union of all obstructions) ---
	private obstructionMaskTexture: WebGLTexture | null = null;
	private obstructionMaskData: Uint8Array | null = null;
	private obstructionMaskW = 0;
	private obstructionMaskH = 0;

	// --- Combined solid mask for pressure/projection (container exterior + obstructions) ---
	private solidMaskTexture: WebGLTexture | null = null;
	private solidMaskData: Uint8Array | null = null;
	private solidMaskW = 0;
	private solidMaskH = 0;

	// --- Precomputed neighbor-solidity (face apertures) at sim resolution ---
	// One RGBA fetch replaces four per-fragment solidAt probes (epic 0001 1b).
	private solidNeighborTexture: WebGLTexture | null = null;
	// Conservative MacCormack trace/stencil clearance at sim resolution.
	private solidClearanceTexture: WebGLTexture | null = null;

	// --- Framebuffers ---
	private dye!: DoubleFBO;
	private velocity!: DoubleFBO;
	private velocitySource!: FBO;
	private divergence!: FBO;
	private curlFBO!: FBO;
	private pressure!: DoubleFBO;
	private scalar: DoubleFBO | null = null;
	private bloom: FBO | null = null;
	private bloomFramebuffers: FBO[] = [];
	private sunrays: FBO | null = null;
	private sunraysTemp: FBO | null = null;
	private sceneFBO: FBO | null = null;
	private ditheringTexture!: DitheringTexture;

	// --- Runtime state ---
	private pointers: Pointer[] = [createPointer()];
	/** Random splats requested but not yet run; bounded by input-bounds.ts. */
	private pendingRandomSplats = 0;
	private lastUpdateTime = 0;
	private engineStartTime = 0;
	private simTime = 0;
	private deterministicMode = false;
	private colorUpdateTimer = 0;
	private autoSplatTimer = 0;
	/** Unsubscribe from the shared frame scheduler; non-null exactly while subscribed. */
	private stopFrames: (() => void) | null = null;
	private disposed = false;
	private pointerListenersInstalled = false;
	private rafRunning = false;
	private normalizedBackColor: RGB = { r: 0, g: 0, b: 0 };
	private contextLost = false;
	private dyeMayContainContent = false;
	/** Monotonic within a live context; reset only when fresh zero fields are created. */
	private solverMayContainContent = false;
	/** True when the default framebuffer no longer represents engine state. */
	private renderDirty = true;
	private flowSourceBatchKind = new Int32Array(FLOW_SOURCE_BATCH_SIZE);
	private flowSourceBatchProfile = new Int32Array(FLOW_SOURCE_BATCH_SIZE);
	private flowSourceBatchFrom = new Float32Array(FLOW_SOURCE_BATCH_SIZE * 2);
	private flowSourceBatchTo = new Float32Array(FLOW_SOURCE_BATCH_SIZE * 2);
	private flowSourceBatchRect = new Float32Array(FLOW_SOURCE_BATCH_SIZE * 4);
	private flowSourceBatchColor = new Float32Array(FLOW_SOURCE_BATCH_SIZE * 3);
	private flowSourceBatchRadius = new Float32Array(FLOW_SOURCE_BATCH_SIZE);
	private flowOutletBatchEdge = new Int32Array(FLOW_OUTLET_BATCH_SIZE);
	private flowOutletBatchFrom = new Float32Array(FLOW_OUTLET_BATCH_SIZE);
	private flowOutletBatchTo = new Float32Array(FLOW_OUTLET_BATCH_SIZE);
	private flowOutletBatchWidth = new Float32Array(FLOW_OUTLET_BATCH_SIZE);
	private autoStart = true;
	/** True after settleStill() until resume(): no RAF; a context restore re-settles once. */
	private still = false;
	private readonly onFrameError?: (error: unknown) => void;
	private benchmarkInstrument = false;
	private benchmarkForceCpu = false;
	private performanceEmaMs = 0;
	private performanceTier: PerformanceTier = 'none';
	private performanceMsSinceLastChange = 0;
	private performanceContinuousOverloadMs = 0;
	private performanceLastAction: PerformanceAction = 'none';
	private performancePressureIterations = 0;
	private performanceSubsteps = 1;
	// The requested advection scheme is construct-only; useMacCormack is the
	// capability-gated effective decision, recomputed alongside MANUAL_FILTERING
	// so a context restore re-derives it from the (possibly new) GL feature set.
	private useMacCormack = false;
	private readbackUint8Buffer = new Uint8Array(0);
	private readbackFloatBuffer = new Float32Array(0);
	private profiler: EngineProfiler | null = null;
	private flowOutletBatchKeep = new Float32Array(FLOW_OUTLET_BATCH_SIZE);

	// --- Bound listeners ---
	private onPointerDown = (e: PointerEvent) => this.handlePointerDown(e);
	private onPointerMove = (e: PointerEvent) => this.handlePointerMove(e);
	private onPointerUp = (e: PointerEvent) => this.handlePointerUp(e);
	private onPointerLeave = (e: PointerEvent) => this.handlePointerLeave(e);
	private onContextLost = (e: Event) => this.handleContextLost(e);
	private onContextRestored = () => this.handleContextRestored();
	private tick = () => this.update();

	constructor(opts: FluidEngineOptions) {
		this.canvas = opts.canvas;
		const seed = opts.config?.seed ?? randomSeed();
		this.config = resolveConfig({ ...opts.config, seed }, DEFAULTS);
		this.resetPerformanceGovernor();
		this.openingPresetSplats = (opts.config?.presetSplats ?? []).map((s) => ({
			...s,
			color: { ...s.color }
		}));
		this.benchmarkInstrument = !!opts.instrument;
		this.benchmarkForceCpu = opts.instrument === 'cpu';
		if (opts.advectionScheme !== undefined) {
			this.config.ADVECTION_SCHEME = opts.advectionScheme;
		}
		this.autoStart = opts.autoStart ?? true;
		this.onFrameError = opts.onFrameError;
		this.deterministicMode = !this.autoStart;
		this.normalizedBackColor = normalizeColor(this.config.BACK_COLOR);
		this.rng = mulberry32(this.config.SEED);

		// initContext() throws BEFORE a context is acquired (getContext → null),
		// so it needs no cleanup. Everything after it runs against a live GL
		// context and can still throw (e.g. a shader-compile failure, ADR-0008);
		// if it does, release the context slot we already hold so a failed
		// construction doesn't orphan a GL context, then re-throw.
		const contextStart = this.benchmarkInstrument ? performance.now() : 0;
		this.initContext();
		this.initBenchmarkProfiler();
		this.profiler?.recordLifecycle('contextCreate', performance.now() - contextStart);
		try {
			this.profileLifecycle('shaderCompile', () => this.compileShaders());
			this.profileLifecycle('programLink', () => this.initBuffersAndPrograms());
			this.profileLifecycle('initialAllocation', () => {
				this.ditheringTexture = createDitheringTexture(this.gl, () => this.invalidateRender());
				this.initDistortionFallback();
				this.updateKeywords();
				this.initDyeFramebuffers('fresh');
				this.initSimulationFramebuffers('fresh');
				this.initPostprocessFramebuffers('fresh');
				this.initMaskTexture();
				this.initStickyMaskTexture();
				this.initObstructionMaskTexture();
				this.initSolidMaskTexture();
				this.initSolidDerivedTextures();
				this.initPrescribedGridTextures();
				this.initGlassFramebuffer();
			});
			if (this.config.DISTORTION_IMAGE_URL) {
				this.loadDistortionImage(this.config.DISTORTION_IMAGE_URL);
			}
			this.replayOpeningScene();

			if (this.config.POINTER_INPUT) {
				this.installPointerListeners();
			}

			this.canvas.addEventListener('webglcontextlost', this.onContextLost);
			this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);

			if (this.autoStart) {
				this.startRaf();
			}
		} catch (err) {
			// Unlike dispose() (which deliberately keeps the context for lazy
			// rebuild — invariant #6), a construction failure has no instance to
			// rebuild, so free the GPU context slot before propagating.
			this.gl.getExtension('WEBGL_lose_context')?.loseContext();
			throw err;
		}
	}

	/**
	 * Compute the density dissipation for this frame. If
	 * `INITIAL_DENSITY_DISSIPATION_DURATION > 0`, linearly interpolate
	 * from `INITIAL_DENSITY_DISSIPATION` toward `DENSITY_DISSIPATION`
	 * over the duration; afterwards (and always when duration ≤ 0),
	 * return the steady-state value.
	 *
	 * The clock starts when the engine begins ticking, so the ramp
	 * survives `setConfig` updates and matches the user's perception
	 * of "since the canvas appeared".
	 */
	private currentDensityDissipation(): number {
		const duration = this.config.INITIAL_DENSITY_DISSIPATION_DURATION;
		if (duration <= 0) return this.config.DENSITY_DISSIPATION;
		const elapsed = this.deterministicMode
			? this.simTime
			: (performance.now() - this.engineStartTime) / 1000;
		if (elapsed >= duration) return this.config.DENSITY_DISSIPATION;
		const t = elapsed / duration;
		return this.config.INITIAL_DENSITY_DISSIPATION * (1 - t) + this.config.DENSITY_DISSIPATION * t;
	}

	private splatTo(target: DoubleFBO, x: number, y: number, color: RGB, radius: number, stickyAmplify = 0): void {
		const gl = this.gl;
		this.splatProgram.bind();
		this.bindStickyMask();
		gl.uniform1i(this.splatProgram.uniforms.uStickyMask, 7);
		gl.uniform1f(this.splatProgram.uniforms.uStickyAmplify, stickyAmplify);
		gl.uniform1i(this.splatProgram.uniforms.uTarget, target.read.attach(0));
		gl.uniform1f(this.splatProgram.uniforms.aspectRatio, this.canvas.width / this.canvas.height);
		gl.uniform2f(this.splatProgram.uniforms.point, x, y);
		gl.uniform3f(this.splatProgram.uniforms.color, color.r, color.g, color.b);
		gl.uniform1f(this.splatProgram.uniforms.radius, correctRadius(radius, this.canvas.width / this.canvas.height));
		this.blit(target.write);
		target.swap();
	}

	/* ---------------------------------------------------------------------- */
	/*                                Public API                              */
	/* ---------------------------------------------------------------------- */

	splat(x: number, y: number, dx: number, dy: number, color: RGB): void {
		if (this.contextLost || !isFiniteSplat(x, y, dx, dy, color)) return;
		// Conservatively activate even for a numerically zero splat. Proving a
		// caller's future values are zero is not worth a false-idle solver.
		this.solverMayContainContent = true;
		const radius = this.config.SPLAT_RADIUS / 100.0;
		this.splatTo(this.velocity, x, y, { r: dx, g: dy, b: 0 }, radius, 0);
		this.dyeMayContainContent = true;
		this.splatTo(this.dye, x, y, color, radius, this.config.STICKY ? this.config.STICKY_AMPLIFY : 0);
		this.invalidateRender();
	}

	randomSplats(count: number): void {
		this.pendingRandomSplats = enqueueRandomSplats(this.pendingRandomSplats, count);
	}

	/** Stop the animation loop. The GL context stays alive. Idempotent. */
	pause(): void {
		if (!this.rafRunning || this.disposed) return;
		this.stopRaf();
		this.resetPerformanceGovernor();
	}

	/** Restart the animation loop after a pause. Idempotent. */
	resume(): void {
		if (this.rafRunning || this.disposed || this.contextLost || this.still) return;
		this.lastUpdateTime = performance.now();
		this.startRaf();
	}

	/**
	 * @internal Reduced-motion still (ADR 0085): stop the loop, advance a fixed
	 * number of steps at a fixed dt so the opening splats resolve into a finished
	 * frame, render once, and stay stopped. resume() leaves the still.
	 */
	settleStill(): void {
		if (this.disposed) return;
		this.stopRaf();
		this.resetPerformanceGovernor();
		this.still = true;
		if (this.contextLost) return;
		this.settleSteps();
		this.renderOnce();
	}

	/** @internal Leave the still and restart the loop. */
	endStill(): void {
		if (!this.still) return;
		this.still = false;
		this.resume();
	}

	/** Fixed-dt settle; the density ramp follows sim time, not the page clock. */
	private settleSteps(): void {
		const deterministic = this.deterministicMode;
		this.deterministicMode = true;
		this.simTime = 0;
		try {
			this.advance(STILL_STEPS, STILL_DT);
		} finally {
			this.deterministicMode = deterministic;
		}
	}

	/** @internal Present a stale frame while the loop is stopped (resize/config change in a still). */
	renderOnce(): void {
		if (this.disposed || this.contextLost || this.rafRunning || !this.renderDirty) return;
		this.renderCore(null);
		this.renderDirty = false;
	}

	/**
	 * @internal Resize the drawing buffer without replacing the GL context or
	 * programs. Persistent fields are resampled only when the aspect ratio
	 * changes; canvas-sized presentation resources are rebuilt every time.
	 *
	 * Returns `true` when the requested drawing-buffer size changed. During a
	 * lost context the dimensions are retained and the normal restore path
	 * rebuilds resources against them.
	 */
	resize(width: number, height: number): boolean {
		if (this.disposed || !Number.isFinite(width) || !Number.isFinite(height)) return false;
		const viewport = this.contextLost
			? [width, height]
			: (this.gl.getParameter(this.gl.MAX_VIEWPORT_DIMS) as Int32Array | number[]);
		const fitted = fitDrawingBufferSize(width, height, Number(viewport[0]), Number(viewport[1]));
		const nextWidth = fitted.width;
		const nextHeight = fitted.height;
		const oldWidth = this.canvas.width;
		const oldHeight = this.canvas.height;
		if (oldWidth === nextWidth && oldHeight === nextHeight) return false;

		this.canvas.width = nextWidth;
		this.canvas.height = nextHeight;
		this.invalidateRender();
		if (this.contextLost) return true;

		const aspectChanged = oldWidth * nextHeight !== nextWidth * oldHeight;
		this.profileLifecycle('resize', () => {
			if (aspectChanged) {
				// getResolution() and every rasterized mask are aspect-driven. Preserve
				// persistent fields while rebuilding transient and derived resources.
				this.initDyeFramebuffers('preserve');
				this.initSimulationFramebuffers('preserve');
				this.initPostprocessFramebuffers('preserve');
				this.initMaskTexture();
				this.initObstructionMaskTexture();
				this.initSolidMaskTexture();
				this.initSolidDerivedTextures();
			}
			// Glass renders through an RGBA8 buffer at physical canvas size, so it
			// must follow both same-aspect scale changes and aspect changes.
			this.initGlassFramebuffer();
		});
		if (this.still) this.renderOnce();
		return true;
	}

	/**
	 * @internal Advance the simulator by a fixed number of identical steps.
	 *
	 * Deterministic harnesses call this with fixed `dt` instead of relying on
	 * wall-clock timing. This uses the same private step path as the live RAF
	 * loop while keeping the timebase deterministic.
	 */
	advance(steps: number, dt: number): void {
		if (this.disposed || this.contextLost) return;
		if (!Number.isFinite(steps) || steps <= 0 || dt <= 0) return;
		const count = Math.max(0, Math.floor(steps));
		for (let i = 0; i < count; i++) {
			if (!this.profiler) {
				this.step(dt);
				continue;
			}
			this.profiler.beginFrame();
			try {
				this.profileGroup('solver', () => this.step(dt));
			} finally {
				this.profiler.endFrame();
			}
		}
		this.invalidateRender();
	}

	/**
	 * @internal Read a field into a new float array.
	 *
	 * Useful for deterministic regression tests that need CPU-side reductions.
	 * `readField` intentionally avoids touching Svelte state and uses an
	 * instance-owned staging buffer so repeated calls do not allocate.
	 */
	readField(field: ReadField, options: ReadFieldOptions = {}): ReadFieldResult {
		if (this.disposed || this.contextLost) {
			throw new Error('svelte-fluid: cannot readField while context is unavailable');
		}

		let spec: { fbo: FBO; components: 1 | 2 | 3 | 4 };
		if (field === 'velocity') spec = { fbo: this.velocity.read, components: 2 };
		else if (field === 'dye') spec = { fbo: this.dye.read, components: 4 };
		else if (field === 'pressure') spec = { fbo: this.pressure.read, components: 1 };
		else if (field === 'divergence') spec = { fbo: this.divergence, components: 1 };
		else if (field === 'curl') spec = { fbo: this.curlFBO, components: 1 };
		else if (field === 'scalar') {
			if (!this.scalar) {
				throw new Error('svelte-fluid: scalar field is not allocated for this engine');
			}
			spec = { fbo: this.scalar.read, components: 4 };
		} else {
			throw new Error(`svelte-fluid: unknown readField target "${field}"`);
		}

		let components = options.components ?? spec.components;
		if (components > spec.components) {
			components = spec.components;
		}

		const width = spec.fbo.width;
		const height = spec.fbo.height;
		// Always read RGBA. WebGL2 readPixels only reliably accepts RGBA (or the
		// driver's queried IMPLEMENTATION_COLOR_READ_FORMAT); RG/RED + FLOAT raises
		// INVALID_OPERATION on common drivers (ANGLE) and silently leaves the
		// staging buffer zero-filled. We slice the wanted channels below.
		const sourceComponents = 4;
		const pixelCount = width * height;
		const sourceCount = pixelCount * sourceComponents;
		this.ensureReadFieldBuffers(sourceCount);

		const gl = this.gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, spec.fbo.fbo);
		// Re-query instead of caching extension objects in {@link ExtInfo}; the
		// extension can become unavailable on context restores or browser-variant
		// drivers, and this path is strictly read-only.
		const floatPath = this.ext.isWebGL2 && gl.getExtension('EXT_color_buffer_float') !== null;
		if (floatPath) {
			const gl2 = gl as WebGL2RenderingContext;
			const format = sourceComponents === 4 ? gl2.RGBA : sourceComponents === 2 ? gl2.RG : gl2.RED;
			gl2.readPixels(0, 0, width, height, format, gl.FLOAT, this.readbackFloatBuffer);
		} else {
			// The byte path normalizes by /255, which only makes sense for the
			// 0..1 dye field. velocity/pressure/divergence/curl carry signed and
			// large-magnitude values, so /255 would silently return garbage.
			if (field !== 'dye') {
				throw new Error(
					`svelte-fluid: readField('${field}') requires EXT_color_buffer_float; only dye is byte-readable`
				);
			}
			const gl2 = gl as WebGL2RenderingContext;
			const format = this.ext.isWebGL2
				? sourceComponents === 4
					? gl2.RGBA
					: sourceComponents === 2
						? gl2.RG
						: gl2.RED
				: gl.RGBA;
			gl.readPixels(0, 0, width, height, format, gl.UNSIGNED_BYTE, this.readbackUint8Buffer);
		}
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);

		const data = new Float32Array(width * height * components);
		if (floatPath) {
			for (let i = 0; i < pixelCount; i++) {
				const sourceOffset = i * sourceComponents;
				const outOffset = i * components;
				for (let c = 0; c < components; c++) {
					data[outOffset + c] = this.readbackFloatBuffer[sourceOffset + c];
				}
			}
		} else {
			for (let i = 0; i < pixelCount; i++) {
				const sourceOffset = i * sourceComponents;
				const outOffset = i * components;
				for (let c = 0; c < components; c++) {
					data[outOffset + c] = this.readbackUint8Buffer[sourceOffset + c] / 255;
				}
			}
		}

		return { data, width, height, components };
	}

	private ensureReadFieldBuffers(sourceCount: number): void {
		if (this.readbackFloatBuffer.length < sourceCount) {
			this.readbackFloatBuffer = new Float32Array(sourceCount);
		}
		if (this.readbackUint8Buffer.length < sourceCount) {
			this.readbackUint8Buffer = new Uint8Array(sourceCount);
		}
	}

	get isPaused(): boolean {
		return !this.rafRunning;
	}

	getPerformanceState(): PerformanceState {
		const enabled = this.config.AUTO_PERFORMANCE;
		return {
			enabled,
			tier: enabled ? this.performanceTier : 'none',
			emaMs: enabled ? this.performanceEmaMs : 0,
			msSinceLastChange: enabled ? this.performanceMsSinceLastChange : 0,
			targetFrameMs: this.config.AUTO_PERFORMANCE_TARGET_FRAME_MS,
			pressureIterations: this.performancePressureIterations,
			substeps: this.performanceSubsteps,
			minPressureIterations: this.config.AUTO_PERFORMANCE_MIN_PRESSURE_ITERATIONS,
			minSubsteps: this.config.AUTO_PERFORMANCE_MIN_SUBSTEPS,
			lastAction: enabled ? this.performanceLastAction : 'none'
		};
	}

	/**
	 * Hot-update a subset of config fields. Uses a 4-bucket strategy:
	 *   A — scalar/boolean assignment, picked up next frame.
	 *       Includes `pointerInput`, which also installs/removes the
	 *       canvas + window event listeners on transition.
	 *   B — display shader keyword recompile (shading, bloom, sunrays, toneMapping)
	 *   C — FBO rebuild (sim/dye/bloom/sunrays resolutions)
	 *   D — construct-only — `seed`, `initialSplatCount*`, `presetSplats`,
	 *       `advectionScheme`.
	 *       These are silently ignored: `seed` and `initialSplatCount*`
	 *       only affect the first frame, and `presetSplats` is absent
	 *       from `ResolvedConfig` entirely; `advectionScheme` picks a shader
	 *       path at construction/context initialization.
	 */
	setConfig(patch: FluidConfig): void {
		if (this.disposed || this.contextLost) return;
		const next = resolveConfig(patch, this.config);
		next.ADVECTION_SCHEME = this.config.ADVECTION_SCHEME;
		const a = this.config;
		const b = next;

		const simChanged = a.SIM_RESOLUTION !== b.SIM_RESOLUTION;
		const dyeChanged = a.DYE_RESOLUTION !== b.DYE_RESOLUTION;
		const bloomChanged = a.BLOOM_RESOLUTION !== b.BLOOM_RESOLUTION || a.BLOOM_ITERATIONS !== b.BLOOM_ITERATIONS;
		const sunraysChanged = a.SUNRAYS_RESOLUTION !== b.SUNRAYS_RESOLUTION;
		const bloomResourceChanged = bloomChanged || a.BLOOM !== b.BLOOM;
		const sunraysResourceChanged = sunraysChanged || a.SUNRAYS !== b.SUNRAYS;
		const kwChanged =
			a.SHADING !== b.SHADING || a.BLOOM !== b.BLOOM || a.SUNRAYS !== b.SUNRAYS || a.TONE_MAPPING !== b.TONE_MAPPING ||
			(a.SPECULAR > 0) !== (b.SPECULAR > 0) || (a.REFRACTION > 0) !== (b.REFRACTION > 0);
		const shapeChanged = !containerShapeEqual(a.CONTAINER_SHAPE, b.CONTAINER_SHAPE);
		const glassChanged = a.GLASS !== b.GLASS || shapeChanged;
		const revealChanged = a.REVEAL !== b.REVEAL;
		const distortionChanged = a.DISTORTION !== b.DISTORTION;
		const distortionImageChanged = a.DISTORTION_IMAGE_URL !== b.DISTORTION_IMAGE_URL;
		const stickyChanged = a.STICKY !== b.STICKY;
		const stickyMaskChanged = !stickyMaskEqual(a.STICKY_MASK, b.STICKY_MASK);
		const openBoundaryChanged = a.OPEN_BOUNDARY !== b.OPEN_BOUNDARY;
		// Bucket-C-like: rebuild the combined obstruction mask texture, and
		// recompile the display shader to toggle the OBSTRUCTION_MASK keyword.
		const obstructionsChanged = !obstructionsEqual(a.OBSTRUCTIONS, b.OBSTRUCTIONS);
		// Bucket B: the OBSTRUCTION_FILL keyword tracks color *presence*; the
		// color value itself is a per-frame uniform (Bucket A).
		const obstructionColorChanged = !!a.OBSTRUCTION_COLOR !== !!b.OBSTRUCTION_COLOR;
		const flowChanged = !flowConfigEqual(a.FLOW, b.FLOW);
		const scalarNeedChanged = needsScalarFBOForFlow(a.FLOW) !== needsScalarFBOForFlow(b.FLOW);
		const solidDefinitionChanged = shapeChanged || obstructionsChanged || openBoundaryChanged;
		const pointerInputChanged = a.POINTER_INPUT !== b.POINTER_INPUT;
		const pointerTargetChanged = a.POINTER_TARGET !== b.POINTER_TARGET;
		const performanceResetChanged =
			a.AUTO_PERFORMANCE !== b.AUTO_PERFORMANCE ||
			a.PAUSED !== b.PAUSED ||
			a.AUTO_PERFORMANCE_TARGET_FRAME_MS !== b.AUTO_PERFORMANCE_TARGET_FRAME_MS ||
			a.AUTO_PERFORMANCE_MIN_PRESSURE_ITERATIONS !== b.AUTO_PERFORMANCE_MIN_PRESSURE_ITERATIONS ||
			a.AUTO_PERFORMANCE_MIN_SUBSTEPS !== b.AUTO_PERFORMANCE_MIN_SUBSTEPS ||
			patch.pressureIterations !== undefined ||
			patch.substeps !== undefined;
		const configChanged = (Object.keys(b) as (keyof ResolvedConfig)[]).some((key) => a[key] !== b[key]);

		// Programs and the display keyword variant are prepared before config is
		// committed. A compile/link failure leaves the old config and resources live.
		this.ensureProgramsFor(b);
		const preparedDisplayVariant = this.displayMaterial.prepareKeywords(this.displayKeywords(b));
		this.config = b;
		if (performanceResetChanged) this.resetPerformanceGovernor();
		if (a.BACK_COLOR !== b.BACK_COLOR) {
			this.normalizedBackColor = normalizeColor(b.BACK_COLOR);
		}

		const applyResourceChanges = () => {
			if (dyeChanged) this.initDyeFramebuffers('preserve');
			else if (scalarNeedChanged) this.syncScalarFramebuffer('preserve');
			if (simChanged) this.initSimulationFramebuffers('preserve');
			if (bloomResourceChanged) this.initBloomFramebuffers('preserve');
			if (sunraysResourceChanged) this.initSunraysFramebuffers('preserve');
			if (shapeChanged) this.initMaskTexture();
			if (obstructionsChanged) this.initObstructionMaskTexture();
			if (solidDefinitionChanged) this.initSolidMaskTexture();
			if (simChanged || solidDefinitionChanged) this.initSolidDerivedTextures();
			if (flowChanged) this.initPrescribedGridTextures();
			if (glassChanged) this.initGlassFramebuffer();
			if (
				kwChanged || shapeChanged || revealChanged || distortionChanged || obstructionsChanged ||
				obstructionColorChanged || flowChanged
			) this.updateKeywords(preparedDisplayVariant);
			if (stickyChanged || stickyMaskChanged) this.initStickyMaskTexture();
			if (distortionImageChanged) this.loadDistortionImage(b.DISTORTION_IMAGE_URL);
		};
		const resourceChanged =
			simChanged || dyeChanged || scalarNeedChanged || bloomResourceChanged || sunraysResourceChanged ||
			shapeChanged || obstructionsChanged || openBoundaryChanged || flowChanged || glassChanged ||
			kwChanged || revealChanged || distortionChanged || obstructionColorChanged ||
			stickyChanged || stickyMaskChanged || distortionImageChanged;
		if (resourceChanged) this.profileLifecycle('reconfigure', applyResourceChanges);
		if (pointerInputChanged || pointerTargetChanged) {
			// Reinstall listeners when input toggles or target changes
			this.removePointerListeners();
			if (b.POINTER_INPUT) {
				this.installPointerListeners();
			} else {
			}
		}
		if (configChanged) this.invalidateRender();
		if (this.still) this.renderOnce();
	}

	/* ---------------------------------------------------------------------- */
	/*                         RAF + context loss                             */
	/* ---------------------------------------------------------------------- */

	private startRaf(): void {
		if (this.rafRunning) return;
		this.rafRunning = true;
		// The scheduler evicts a throwing tick so siblings keep rendering; mirror
		// that here so isPaused reports the stopped loop and resume() can retry.
		this.stopFrames = subscribeFrame(this.tick, (error) => {
			this.stopFrames = null;
			this.rafRunning = false;
			notifyHost(this.onFrameError, 'onFrameError', error);
		});
	}

	private stopRaf(): void {
		this.stopFrames?.();
		this.stopFrames = null;
		this.rafRunning = false;
	}

	private handleContextLost(e: Event): void {
		e.preventDefault(); // Signals to the browser we intend to restore
		this.contextLost = true;
		this.profiler?.rejectContextLost();
		this.stopRaf();
	}

	private handleContextRestored(): void {
		const restoreStart = this.benchmarkInstrument ? performance.now() : 0;
		this.contextLost = false;
		this.disposeBenchmarkProfiler();
		this.invalidateLostContextHandles();
		// Full reinit — the GL state is wiped on context loss.
		this.initContext();
		this.initBenchmarkProfiler();
		this.profileLifecycle('shaderCompile', () => this.compileShaders());
		this.profileLifecycle('programLink', () => this.initBuffersAndPrograms());
		this.profileLifecycle('initialAllocation', () => {
			this.ditheringTexture = createDitheringTexture(this.gl, () => this.invalidateRender());
			this.initDistortionFallback();
			this.updateKeywords();
			// Context loss invalidates every WebGL object. Every group takes its fresh
			// path here; preserve/resize would retain dead same-sized handles.
			this.initDyeFramebuffers('fresh');
			this.initSimulationFramebuffers('fresh');
			this.initPostprocessFramebuffers('fresh');
			this.initMaskTexture();
			this.initStickyMaskTexture();
			this.initObstructionMaskTexture();
			this.initSolidMaskTexture();
			this.initSolidDerivedTextures();
			this.initPrescribedGridTextures();
			this.initGlassFramebuffer();
		});
		// Re-load distortion image (GL texture was lost with context)
		if (this.config.DISTORTION_IMAGE_URL) {
			this.loadDistortionImage(this.config.DISTORTION_IMAGE_URL);
		}
		this.replayOpeningScene();
		this.profiler?.recordLifecycle('contextRestore', performance.now() - restoreStart);
		if (this.config.POINTER_INPUT && !this.pointerListenersInstalled) {
			this.installPointerListeners();
		}
		if (this.still) {
			this.settleSteps();
			this.renderOnce();
		} else if (this.autoStart) {
			this.startRaf();
		}
	}

	/**
	 * Drop framebuffer/texture references the browser already destroyed with the
	 * lost context. Deleting them after restoration is both unnecessary and can
	 * generate invalid-object GL errors; CPU config is retained and rebuilt.
	 */
	private invalidateLostContextHandles(): void {
		this.resetOptionalProgramHandles();
		this.blurVertexShader = undefined!;
		this.ditheringTexture.dispose();
		this.distortionTexture = null;
		this.distortionLoadedUrl = null;
		this.distortionTextureW = 0;
		this.distortionTextureH = 0;
		this.maskTexture = null;
		this.maskData = null;
		this.maskW = 0;
		this.maskH = 0;
		this.jumpFlood = null;
		this.containerSdf = null;
		this.obstructionSdf = null;
		this.stickyMaskTexture = null;
		this.stickyMaskW = 0;
		this.stickyMaskH = 0;
		this.stickyFallbackTexture = null;
		this.obstructionMaskTexture = null;
		this.obstructionMaskData = null;
		this.obstructionMaskW = 0;
		this.obstructionMaskH = 0;
		this.solidMaskTexture = null;
		this.solidMaskData = null;
		this.solidMaskW = 0;
		this.solidMaskH = 0;
		this.solidNeighborTexture = null;
		this.solidClearanceTexture = null;
		this.prescribedVelocityTexture = null;
		this.prescribedScalarTexture = null;
		this.scalar = null;
		this.bloom = null;
		this.bloomFramebuffers = [];
		this.sunrays = null;
		this.sunraysTemp = null;
		this.sceneFBO = null;
	}

	/** Rebuild the configured deterministic opening after construction/restore. */
	private replayOpeningScene(): void {
		this.rng = mulberry32(this.config.SEED);
		this.colorUpdateTimer = 0;
		this.autoSplatTimer = 0;
		this.dyeMayContainContent = false;
		this.solverMayContainContent = false;
		this.multipleSplats(this.initialRandomSplatCount());
		for (const s of this.openingPresetSplats) {
			this.splat(s.x, s.y, s.dx, s.dy, s.color);
		}
		this.lastUpdateTime = performance.now();
		this.engineStartTime = this.lastUpdateTime;
		this.simTime = 0;
		this.invalidateRender();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;

		this.stopRaf();
		this.disposeBenchmarkProfiler();

		this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
		this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);

		if (this.pointerListenersInstalled) {
			this.removePointerListeners();
		}

		const gl = this.gl;

		// FBOs
		disposeDoubleFBO(gl, this.dye);
		disposeDoubleFBO(gl, this.velocity);
		disposeFBO(gl, this.velocitySource);
		disposeFBO(gl, this.divergence);
		disposeFBO(gl, this.curlFBO);
		disposeDoubleFBO(gl, this.pressure);
		if (this.scalar) {
			disposeDoubleFBO(gl, this.scalar);
			this.scalar = null;
		}
		disposeFBO(gl, this.bloom ?? undefined);
		this.bloom = null;
		for (const fbo of this.bloomFramebuffers) disposeFBO(gl, fbo);
		this.bloomFramebuffers = [];
		disposeFBO(gl, this.sunrays ?? undefined);
		disposeFBO(gl, this.sunraysTemp ?? undefined);
		this.sunrays = null;
		this.sunraysTemp = null;
		if (this.sceneFBO) {
			disposeFBO(gl, this.sceneFBO);
			this.sceneFBO = null;
		}

		if (this.ditheringTexture) {
			this.ditheringTexture.dispose();
			gl.deleteTexture(this.ditheringTexture.texture);
		}

		// Distortion texture
		if (this.distortionTexture) {
			gl.deleteTexture(this.distortionTexture);
			this.distortionTexture = null;
			this.distortionLoadedUrl = null;
		}
		this.distortionTextureW = 0;
		this.distortionTextureH = 0;

		// Mask texture
		if (this.maskTexture) {
			gl.deleteTexture(this.maskTexture);
			this.maskTexture = null;
			this.maskData = null;
		}

		disposeFBO(gl, this.containerSdf ?? undefined);
		disposeFBO(gl, this.obstructionSdf ?? undefined);
		this.containerSdf = null;
		this.obstructionSdf = null;
		this.jumpFlood?.dispose();
		this.jumpFlood = null;

		// Sticky mask texture
		if (this.stickyMaskTexture) {
			gl.deleteTexture(this.stickyMaskTexture);
			this.stickyMaskTexture = null;
		}
		this.stickyMaskW = 0;
		this.stickyMaskH = 0;
		if (this.stickyFallbackTexture) {
			gl.deleteTexture(this.stickyFallbackTexture);
			this.stickyFallbackTexture = null;
		}

		// Obstruction mask texture
		if (this.obstructionMaskTexture) {
			gl.deleteTexture(this.obstructionMaskTexture);
			this.obstructionMaskTexture = null;
			this.obstructionMaskData = null;
		}

		if (this.solidMaskTexture) {
			gl.deleteTexture(this.solidMaskTexture);
			this.solidMaskTexture = null;
			this.solidMaskData = null;
		}

		if (this.solidNeighborTexture) {
			gl.deleteTexture(this.solidNeighborTexture);
			this.solidNeighborTexture = null;
		}

		if (this.solidClearanceTexture) {
			gl.deleteTexture(this.solidClearanceTexture);
			this.solidClearanceTexture = null;
		}

		if (this.prescribedVelocityTexture) {
			gl.deleteTexture(this.prescribedVelocityTexture);
			this.prescribedVelocityTexture = null;
		}
		if (this.prescribedScalarTexture) {
			gl.deleteTexture(this.prescribedScalarTexture);
			this.prescribedScalarTexture = null;
		}

		// Programs
		const programs = [
			this.blurProgram,
			this.copyProgram,
			this.clearProgram,
			this.bloomPrefilterProgram,
			this.bloomBlurProgram,
			this.bloomFinalProgram,
			this.sunraysMaskProgram,
			this.sunraysProgram,
			this.splatProgram,
			this.advectionProgram,
			this.advectionMacCormackProgram,
			this.divergenceProgram,
			this.curlProgram,
			this.vorticityProgram,
			this.viscosityProgram,
			this.wallFrictionProgram,
			this.pressureProgram,
			this.pressureJacobi2Program,
			this.gradientSubtractProgram,
			this.flowSourceProgram,
			this.flowOutletProgram,
			this.flowForceProgram,
			this.prescribedFieldProgram,
			this.applyMaskProgram,
			this.glassProgram
		].filter((program): program is ProgramWrap => program != null);
		for (const p of programs) gl.deleteProgram(p.program);
		this.displayMaterial.dispose();

		// Shaders
		gl.deleteShader(this.baseVertexShader);
		if (this.blurVertexShader) gl.deleteShader(this.blurVertexShader);
		for (const s of this.fragmentShaders) gl.deleteShader(s);
		this.fragmentShaders = [];

		// Buffers
		gl.deleteBuffer(this.vertexBuffer);
		gl.deleteBuffer(this.indexBuffer);
	}

	/* ---------------------------------------------------------------------- */
	/*                              Initialization                            */
	/* ---------------------------------------------------------------------- */

	private initContext(): void {
		const { gl, ext } = getWebGLContext(this.canvas, {
			requireHardwareAcceleration: this.config.REQUIRE_HARDWARE_ACCELERATION
		});
		this.gl = gl;
		this.ext = ext;
		const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array | number[];
		const fitted = fitDrawingBufferSize(
			this.canvas.width,
			this.canvas.height,
			Number(viewport[0]),
			Number(viewport[1])
		);
		this.canvas.width = fitted.width;
		this.canvas.height = fitted.height;

		// Mobile / non-linear-filtering fallback. Only relax features if the
		// hardware can't support them — never override an explicit user opt-in.
		if (!ext.supportLinearFiltering) {
			this.config.SHADING = false;
			this.config.BLOOM = false;
			this.config.SUNRAYS = false;
			this.config.GLASS = false;
			this.config.DYE_RESOLUTION = Math.min(this.config.DYE_RESOLUTION, 512);
		}
	}

	private initBenchmarkProfiler(): void {
		this.profiler = this.benchmarkInstrument
			? new EngineProfiler(createTimerQueryAdapter(this.gl, this.benchmarkForceCpu))
			: null;
	}

	private disposeBenchmarkProfiler(): void {
		this.profiler?.dispose();
		this.profiler = null;
	}

	/** @internal */
	isBenchmarkTimed(): boolean {
		return !!this.profiler && this.profiler.timerKind !== 'cpu';
	}

	private profileLifecycle<T>(phase: ProfileLifecyclePhase, action: () => T): T {
		if (!this.profiler) return action();
		const start = performance.now();
		try {
			return action();
		} finally {
			this.profiler.recordLifecycle(phase, performance.now() - start);
		}
	}

	/** @internal Whole-frame/lifecycle profiler snapshot for the dev bench. */
	getBenchProfile(): EngineProfileSnapshot | null {
		if (!this.profiler) return null;
		return this.profiler.snapshot(this.profileEnvironment(), this.profileResources());
	}

	private profileEnvironment(): ProfileEnvironment {
		const gl = this.gl;
		const debug = gl.getExtension('WEBGL_debug_renderer_info') as {
			UNMASKED_RENDERER_WEBGL: number;
			UNMASKED_VENDOR_WEBGL: number;
		} | null;
		const rect = this.canvas.getBoundingClientRect();
		const cssWidth = rect.width || this.canvas.clientWidth || this.canvas.width;
		const cssHeight = rect.height || this.canvas.clientHeight || this.canvas.height;
		return {
			browser: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
			webglVersion: this.ext.isWebGL2 ? 'WebGL2' : 'WebGL1',
			renderer: String(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
			vendor: String(debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
			devicePixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
			effectivePixelRatioX: cssWidth > 0 ? gl.drawingBufferWidth / cssWidth : 0,
			effectivePixelRatioY: cssHeight > 0 ? gl.drawingBufferHeight / cssHeight : 0,
			cssWidth,
			cssHeight,
			drawingBufferWidth: gl.drawingBufferWidth,
			drawingBufferHeight: gl.drawingBufferHeight,
			canvasPixels: gl.drawingBufferWidth * gl.drawingBufferHeight,
			simWidth: this.velocity.width,
			simHeight: this.velocity.height,
			dyeWidth: this.dye.width,
			dyeHeight: this.dye.height,
			linearFiltering: this.ext.supportLinearFiltering,
			timerQuery: this.profiler?.timerKind ?? 'cpu',
			contextLost: this.contextLost
		};
	}

	private profileResources(): ProfileResources {
		const gl = this.gl;
		const half = this.ext.halfFloatTexType;
		let bytes = 0;
		const add = (fbo: FBO | null | undefined, format: number, type = half) => {
			if (fbo) bytes += estimateTextureBytes(gl, fbo.width, fbo.height, format, type, half);
		};
		const addDouble = (fbo: DoubleFBO | null | undefined, format: number) => {
			if (!fbo) return;
			add(fbo.read, format);
			add(fbo.write, format);
		};
		addDouble(this.dye, this.ext.formatRGBA.format);
		addDouble(this.scalar, this.ext.formatRGBA.format);
		addDouble(this.velocity, this.ext.formatRG.format);
		add(this.velocitySource, this.ext.formatRG.format);
		add(this.divergence, this.ext.formatR.format);
		add(this.curlFBO, this.ext.formatR.format);
		addDouble(this.pressure, this.ext.formatR.format);
		add(this.bloom, this.ext.formatRGBA.format);
		for (const fbo of this.bloomFramebuffers) add(fbo, this.ext.formatRGBA.format);
		add(this.sunrays, this.ext.formatR.format);
		add(this.sunraysTemp, this.ext.formatR.format);
		add(this.sceneFBO, gl.RGBA, gl.UNSIGNED_BYTE);
		const byteTexture = (exists: unknown, width: number, height: number, channels: number) => {
			if (exists) bytes += Math.max(0, width) * Math.max(0, height) * channels;
		};
		byteTexture(this.maskTexture, this.maskW, this.maskH, 1);
		for (const sdf of [this.containerSdf, this.obstructionSdf]) byteTexture(sdf, sdf?.width ?? 0, sdf?.height ?? 0, 2);
		bytes += this.jumpFlood?.seedBytes() ?? 0;
		byteTexture(this.stickyMaskTexture, this.stickyMaskW, this.stickyMaskH, 1);
		byteTexture(this.stickyFallbackTexture, 1, 1, 1);
		byteTexture(this.obstructionMaskTexture, this.obstructionMaskW, this.obstructionMaskH, 1);
		byteTexture(this.solidMaskTexture, this.solidMaskW, this.solidMaskH, 1);
		byteTexture(this.solidNeighborTexture, this.velocity.width, this.velocity.height, 4);
		byteTexture(this.solidClearanceTexture, this.velocity.width, this.velocity.height, 1);
		byteTexture(this.distortionTexture, this.distortionTextureW, this.distortionTextureH, 4);
		byteTexture(this.ditheringTexture?.texture, this.ditheringTexture?.width ?? 0, this.ditheringTexture?.height ?? 0, 3);
		const prescribed = this.config.FLOW?.prescribed;
		if (prescribed?.kind === 'grid') {
			byteTexture(this.prescribedVelocityTexture, prescribed.velocity?.width ?? 0, prescribed.velocity?.height ?? 0, 4);
			const scalar = Object.values(prescribed.scalars ?? {})[0];
			byteTexture(this.prescribedScalarTexture, scalar?.width ?? 0, scalar?.height ?? 0, 4);
		}
		return { estimatedTextureBytes: bytes, canvasPixels: gl.drawingBufferWidth * gl.drawingBufferHeight };
	}

	private compileShaders(): void {
		// Context restore invalidates every shader. Rebuild only the set selected
		// by the effective, capability-gated configuration.
		this.fragmentShaders = [];
		this._fragmentShadersByName = {};
		this.blurVertexShader = undefined!;
		this.resetOptionalProgramHandles();

		const gl = this.gl;
		this.baseVertexShader = compileShader(gl, gl.VERTEX_SHADER, S.baseVertexShader);
		this.useMacCormack = this.config.ADVECTION_SCHEME === 'maccormack' && this.ext.supportLinearFiltering;

		const selected = this.selectedOptionalPrograms(this.config);
		if (selected.has('blur')) {
			this.blurVertexShader = compileShader(gl, gl.VERTEX_SHADER, S.blurVertexShader);
		}
		for (const name of [...CORE_PROGRAM_NAMES, ...selected]) {
			const fragment = this.compileFragmentShader(name);
			this._fragmentShadersByName[name] = fragment;
			this.fragmentShaders.push(fragment);
		}
	}

	private _fragmentShadersByName: Partial<Record<EngineProgramName, WebGLShader>> = {};

	private initBuffersAndPrograms(): void {
		const gl = this.gl;

		this.vertexBuffer = gl.createBuffer()!;
		this.indexBuffer = gl.createBuffer()!;
		const rawBlit = createBlit(gl, this.vertexBuffer, this.indexBuffer);
		if (this.profiler) {
			this.blit = (target, clear) => {
				const pixels = target ? target.width * target.height : gl.drawingBufferWidth * gl.drawingBufferHeight;
				this.profiler?.recordDraw(pixels);
				rawBlit(target, clear);
			};
		} else {
			this.blit = rawBlit;
		}

		for (const name of CORE_PROGRAM_NAMES) this.assignProgram(name, this.linkCompiledProgram(name));
		for (const name of this.selectedOptionalPrograms(this.config)) {
			this.assignProgram(name, this.linkCompiledProgram(name));
		}

		// On restore, Material still owns stale handles from the lost context.
		if (this.displayMaterial) this.displayMaterial.dispose();
		this.displayMaterial = new Material(gl, this.baseVertexShader, S.displayShaderSource);

		// 1x1 black fallback for sticky mask (prevents undefined sampler reads)
		if (this.stickyFallbackTexture) gl.deleteTexture(this.stickyFallbackTexture);
		this.stickyFallbackTexture = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, this.stickyFallbackTexture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 1, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array([0]));
	}

	private selectedOptionalPrograms(config: ResolvedConfig): Set<OptionalProgramName> {
		const selected = new Set<OptionalProgramName>();
		if (config.BLOOM) {
			selected.add('blur');
			selected.add('bloomPrefilter');
			selected.add('bloomBlur');
			selected.add('bloomFinal');
		}
		if (config.SUNRAYS) {
			selected.add('blur');
			selected.add('sunraysMask');
			selected.add('sunrays');
		}
		if (this.useMacCormack) selected.add('advectionMacCormack');
		if (config.GLASS && config.CONTAINER_SHAPE) selected.add('glass');

		const flow = config.FLOW;
		if (flow?.sources?.length) selected.add('flowSource');
		if (flow?.outlets?.length) selected.add('flowOutlet');
		if (flow?.forces?.length) selected.add('flowForce');
		if (flow?.prescribed && (flow.mode ?? 'live') !== 'live') {
			selected.add('prescribedField');
			const physicalMask =
				!!(config.OBSTRUCTIONS && config.OBSTRUCTIONS.length) ||
				(!!config.CONTAINER_SHAPE && !config.OPEN_BOUNDARY);
			if (physicalMask) selected.add('applyMask');
		}
		return selected;
	}

	private ensureProgramsFor(config: ResolvedConfig): void {
		for (const name of this.selectedOptionalPrograms(config)) {
			if (this.optionalProgram(name)) continue;
			let fragment!: WebGLShader;
			this.profileLifecycle('shaderCompile', () => {
				if (name === 'blur' && !this.blurVertexShader) {
					this.blurVertexShader = compileShader(this.gl, this.gl.VERTEX_SHADER, S.blurVertexShader);
				}
				fragment = this.compileFragmentShader(name);
			});
			try {
				const program = this.profileLifecycle('programLink', () =>
					makeProgram(this.gl, name === 'blur' ? this.blurVertexShader! : this.baseVertexShader, fragment)
				);
				this.fragmentShaders.push(fragment);
				this.assignProgram(name, program);
			} catch (error) {
				this.gl.deleteShader(fragment);
				throw error;
			}
		}
	}

	private compileFragmentShader(name: EngineProgramName): WebGLShader {
		const keywords = name === 'advection' && !this.ext.supportLinearFiltering ? ['MANUAL_FILTERING'] : null;
		return compileShader(this.gl, this.gl.FRAGMENT_SHADER, this.fragmentSource(name), keywords);
	}

	private fragmentSource(name: EngineProgramName): string {
		switch (name) {
			case 'blur': return S.blurShader;
			case 'copy': return S.copyShader;
			case 'clear': return S.clearShader;
			case 'bloomPrefilter': return S.bloomPrefilterShader;
			case 'bloomBlur': return S.bloomBlurShader;
			case 'bloomFinal': return S.bloomFinalShader;
			case 'sunraysMask': return S.sunraysMaskShader;
			case 'sunrays': return S.sunraysShader;
			case 'splat': return S.splatShader;
			case 'advection': return S.advectionShader;
			case 'advectionMacCormack': return S.advectionMacCormackShader;
			case 'divergence': return S.divergenceShader;
			case 'curl': return S.curlShader;
			case 'vorticity': return S.vorticityShader;
			case 'viscosity': return S.viscosityShader;
			case 'wallFriction': return S.wallFrictionShader;
			case 'pressure': return S.pressureShader;
			case 'pressureJacobi2': return S.pressureJacobi2Shader;
			case 'gradientSubtract': return S.gradientSubtractShader;
			case 'flowSource': return S.flowSourceShader;
			case 'flowOutlet': return S.flowOutletShader;
			case 'flowForce': return S.flowForceShader;
			case 'prescribedField': return S.prescribedFieldShader;
			case 'applyMask': return S.applyMaskShader;
			case 'glass': return S.glassShaderSource;
		}
	}

	private linkCompiledProgram(name: EngineProgramName): ProgramWrap {
		const fragment = this._fragmentShadersByName[name];
		if (!fragment) throw new Error(`svelte-fluid: selected shader ${name} was not compiled`);
		const vertex = name === 'blur' ? this.blurVertexShader : this.baseVertexShader;
		if (!vertex) throw new Error(`svelte-fluid: selected vertex shader for ${name} was not compiled`);
		return makeProgram(this.gl, vertex, fragment);
	}

	private optionalProgram(name: OptionalProgramName): ProgramWrap | null {
		switch (name) {
			case 'blur': return this.blurProgram;
			case 'bloomPrefilter': return this.bloomPrefilterProgram;
			case 'bloomBlur': return this.bloomBlurProgram;
			case 'bloomFinal': return this.bloomFinalProgram;
			case 'sunraysMask': return this.sunraysMaskProgram;
			case 'sunrays': return this.sunraysProgram;
			case 'advectionMacCormack': return this.advectionMacCormackProgram;
			case 'flowSource': return this.flowSourceProgram;
			case 'flowOutlet': return this.flowOutletProgram;
			case 'flowForce': return this.flowForceProgram;
			case 'prescribedField': return this.prescribedFieldProgram;
			case 'applyMask': return this.applyMaskProgram;
			case 'glass': return this.glassProgram;
		}
	}

	private assignProgram(name: EngineProgramName, program: ProgramWrap): void {
		switch (name) {
			case 'blur': this.blurProgram = program; break;
			case 'copy': this.copyProgram = program; break;
			case 'clear': this.clearProgram = program; break;
			case 'bloomPrefilter': this.bloomPrefilterProgram = program; break;
			case 'bloomBlur': this.bloomBlurProgram = program; break;
			case 'bloomFinal': this.bloomFinalProgram = program; break;
			case 'sunraysMask': this.sunraysMaskProgram = program; break;
			case 'sunrays': this.sunraysProgram = program; break;
			case 'splat': this.splatProgram = program; break;
			case 'advection': this.advectionProgram = program; break;
			case 'advectionMacCormack': this.advectionMacCormackProgram = program; break;
			case 'divergence': this.divergenceProgram = program; break;
			case 'curl': this.curlProgram = program; break;
			case 'vorticity': this.vorticityProgram = program; break;
			case 'viscosity': this.viscosityProgram = program; break;
			case 'wallFriction': this.wallFrictionProgram = program; break;
			case 'pressure': this.pressureProgram = program; break;
			case 'pressureJacobi2': this.pressureJacobi2Program = program; break;
			case 'gradientSubtract': this.gradientSubtractProgram = program; break;
			case 'flowSource': this.flowSourceProgram = program; break;
			case 'flowOutlet': this.flowOutletProgram = program; break;
			case 'flowForce': this.flowForceProgram = program; break;
			case 'prescribedField': this.prescribedFieldProgram = program; break;
			case 'applyMask': this.applyMaskProgram = program; break;
			case 'glass': this.glassProgram = program; break;
		}
	}

	private resetOptionalProgramHandles(): void {
		this.blurProgram = undefined!;
		this.bloomPrefilterProgram = undefined!;
		this.bloomBlurProgram = undefined!;
		this.bloomFinalProgram = undefined!;
		this.sunraysMaskProgram = undefined!;
		this.sunraysProgram = undefined!;
		this.advectionMacCormackProgram = undefined!;
		this.flowSourceProgram = undefined!;
		this.flowOutletProgram = undefined!;
		this.flowForceProgram = undefined!;
		this.prescribedFieldProgram = undefined!;
		this.applyMaskProgram = undefined!;
		this.glassProgram = undefined!;
	}

	/** Owns persistent dye plus the optional dye-resolution scalar field. */
	private initDyeFramebuffers(mode: ResourceInitMode): void {
		const gl = this.gl;
		const dyeRes = getResolution(gl, this.config.DYE_RESOLUTION);
		const texType = this.ext.halfFloatTexType;
		const rgba = this.ext.formatRGBA;
		const filtering = this.ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

		gl.disable(gl.BLEND);

		if (mode === 'fresh' || this.dye == null) {
			this.dye = createDoubleFBO(gl, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
		} else {
			this.dye = resizeDoubleFBO(
				gl,
				this.dye,
				dyeRes.width,
				dyeRes.height,
				rgba.internalFormat,
				rgba.format,
				texType,
				filtering,
				this.copyProgram,
				this.blit
			);
		}
		this.syncScalarFramebuffer(mode);
	}

	/** Scalar existence follows flow semantics but never owns or rebuilds dye. */
	private syncScalarFramebuffer(mode: ResourceInitMode): void {
		const gl = this.gl;
		if (this.needsScalarFBO()) {
			const dyeRes = getResolution(gl, this.config.DYE_RESOLUTION);
			const texType = this.ext.halfFloatTexType;
			const rgba = this.ext.formatRGBA;
			const filtering = this.ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
			if (mode === 'fresh' || this.scalar == null) {
				this.scalar = createDoubleFBO(
					gl,
					dyeRes.width,
					dyeRes.height,
					rgba.internalFormat,
					rgba.format,
					texType,
					filtering
				);
			} else {
				this.scalar = resizeDoubleFBO(
					gl,
					this.scalar,
					dyeRes.width,
					dyeRes.height,
					rgba.internalFormat,
					rgba.format,
					texType,
					filtering,
					this.copyProgram,
					this.blit
				);
			}
		} else if (this.scalar) {
			disposeDoubleFBO(gl, this.scalar);
			this.scalar = null;
		}
	}

	/** Owns the persistent velocity field and all transient solver targets. */
	private initSimulationFramebuffers(mode: ResourceInitMode): void {
		const gl = this.gl;
		const simRes = getResolution(gl, this.config.SIM_RESOLUTION);
		const texType = this.ext.halfFloatTexType;
		const rg = this.ext.formatRG;
		const r = this.ext.formatR;
		const filtering = this.ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

		gl.disable(gl.BLEND);

		if (mode === 'fresh' || this.velocity == null) {
			this.velocity = createDoubleFBO(
				gl,
				simRes.width,
				simRes.height,
				rg.internalFormat,
				rg.format,
				texType,
				filtering
			);
		} else {
			this.velocity = resizeDoubleFBO(
				gl,
				this.velocity,
				simRes.width,
				simRes.height,
				rg.internalFormat,
				rg.format,
				texType,
				filtering,
				this.copyProgram,
				this.blit
			);
		}

		// Single-buffer FBOs are recreated unconditionally — their contents are
		// transient (recomputed every step), so no copy is needed.
		if (mode === 'preserve') {
			disposeFBO(gl, this.velocitySource);
			disposeFBO(gl, this.divergence);
			disposeFBO(gl, this.curlFBO);
			disposeDoubleFBO(gl, this.pressure);
		}

		this.velocitySource = createFBO(gl, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, gl.NEAREST);
		this.divergence = createFBO(gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
		this.curlFBO = createFBO(gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
		// Pressure stays plain half-float R16F on purpose: both a packed
		// RG16F (divergence in G) and an RG32F variant measured SLOWER on the
		// stressed bench — every Jacobi neighbor fetch drags the extra bytes
		// along, and the loop is the hottest path in the engine. See ADR-0038.
		this.pressure = createDoubleFBO(gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
	}

	/** Synchronize only the optional post-process groups enabled by config. */
	private initPostprocessFramebuffers(mode: ResourceInitMode): void {
		this.initBloomFramebuffers(mode);
		this.initSunraysFramebuffers(mode);
	}

	private initBloomFramebuffers(mode: ResourceInitMode): void {
		const gl = this.gl;
		if (!this.config.BLOOM) {
			disposeFBO(gl, this.bloom ?? undefined);
			for (const fbo of this.bloomFramebuffers) disposeFBO(gl, fbo);
			this.bloom = null;
			this.bloomFramebuffers = [];
			return;
		}
		const res = getResolution(gl, this.config.BLOOM_RESOLUTION);
		const texType = this.ext.halfFloatTexType;
		const rgba = this.ext.formatRGBA;
		const filtering = this.ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

		let nextBloom: FBO | null = null;
		const nextChain: FBO[] = [];
		try {
			nextBloom = createFBO(gl, res.width, res.height, rgba.internalFormat, rgba.format, texType, filtering);
			for (let i = 0; i < this.config.BLOOM_ITERATIONS; i++) {
				const width = res.width >> (i + 1);
				const height = res.height >> (i + 1);
				if (width < 2 || height < 2) break;
				nextChain.push(createFBO(gl, width, height, rgba.internalFormat, rgba.format, texType, filtering));
			}
		} catch (error) {
			disposeFBO(gl, nextBloom ?? undefined);
			for (const fbo of nextChain) disposeFBO(gl, fbo);
			throw error;
		}
		if (mode === 'preserve') {
			disposeFBO(gl, this.bloom ?? undefined);
			for (const fbo of this.bloomFramebuffers) disposeFBO(gl, fbo);
		}
		this.bloom = nextBloom;
		this.bloomFramebuffers = nextChain;
	}

	private initSunraysFramebuffers(mode: ResourceInitMode): void {
		const gl = this.gl;
		if (!this.config.SUNRAYS) {
			disposeFBO(gl, this.sunrays ?? undefined);
			disposeFBO(gl, this.sunraysTemp ?? undefined);
			this.sunrays = null;
			this.sunraysTemp = null;
			return;
		}
		const res = getResolution(gl, this.config.SUNRAYS_RESOLUTION);
		const texType = this.ext.halfFloatTexType;
		const r = this.ext.formatR;
		const filtering = this.ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

		let nextSunrays: FBO | null = null;
		let nextTemp: FBO | null = null;
		try {
			nextSunrays = createFBO(gl, res.width, res.height, r.internalFormat, r.format, texType, filtering);
			nextTemp = createFBO(gl, res.width, res.height, r.internalFormat, r.format, texType, filtering);
		} catch (error) {
			disposeFBO(gl, nextSunrays ?? undefined);
			disposeFBO(gl, nextTemp ?? undefined);
			throw error;
		}
		if (mode === 'preserve') {
			disposeFBO(gl, this.sunrays ?? undefined);
			disposeFBO(gl, this.sunraysTemp ?? undefined);
		}
		this.sunrays = nextSunrays;
		this.sunraysTemp = nextTemp;
	}

	/**
	 * Allocate or dispose the scene FBO used by the glass post-processing pass.
	 * RGBA8 at canvas resolution — the display shader output is LDR gamma-space.
	 */
	private initGlassFramebuffer(): void {
		const gl = this.gl;
		if (this.sceneFBO) {
			disposeFBO(gl, this.sceneFBO);
			this.sceneFBO = null;
		}
		if (!this.config.GLASS || !this.config.CONTAINER_SHAPE) return;
		this.sceneFBO = createFBO(
			gl,
			gl.drawingBufferWidth,
			gl.drawingBufferHeight,
			gl.RGBA,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			gl.LINEAR
		);
	}

	/**
	 * Create a 1x1 white fallback so the distortion shader never samples
	 * an unbound texture while the real image is loading asynchronously.
	 */
	private initDistortionFallback(): void {
		const gl = this.gl;
		if (!this.distortionTexture) {
			this.distortionTexture = gl.createTexture()!;
		}
		gl.bindTexture(gl.TEXTURE_2D, this.distortionTexture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
		this.distortionTextureW = 1;
		this.distortionTextureH = 1;
		this.distortionImgRatio = 1;
	}

	/**
	 * Load an image from a URL and upload it as the distortion texture.
	 * Follows the same async pattern as the dithering texture.
	 */
	private loadDistortionImage(url: string | null): void {
		const gl = this.gl;

		if (!url) {
			if (this.distortionTexture) {
				gl.deleteTexture(this.distortionTexture);
				this.distortionTexture = null;
				this.distortionLoadedUrl = null;
				this.distortionTextureW = 0;
				this.distortionTextureH = 0;
			}
			this.invalidateRender();
			return;
		}
		if (url === this.distortionLoadedUrl) return;

		const image = new Image();
		image.crossOrigin = 'anonymous';
		image.onload = () => {
			if (this.disposed || this.contextLost) return;
			// URL may have changed while loading — ignore stale loads
			if (this.config.DISTORTION_IMAGE_URL !== url) return;

			try {
				if (!this.distortionTexture) {
					this.distortionTexture = gl.createTexture()!;
				}
				gl.bindTexture(gl.TEXTURE_2D, this.distortionTexture);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
				this.distortionImgRatio = image.naturalWidth / image.naturalHeight;
				this.distortionLoadedUrl = url;
				this.distortionTextureW = image.naturalWidth;
				this.distortionTextureH = image.naturalHeight;
				this.invalidateRender();
			} catch {
				// Context lost between check and GL calls — silently ignore
			}
		};
		image.onerror = () => {
			if (this.disposed || this.contextLost) return;
			if (this.config.DISTORTION_IMAGE_URL !== url) return;
			if (this.distortionTexture) {
				gl.deleteTexture(this.distortionTexture);
				this.distortionTexture = null;
				this.distortionTextureW = 0;
				this.distortionTextureH = 0;
			}
			this.distortionLoadedUrl = null;
			this.initDistortionFallback();
			this.invalidateRender();
		};
		image.src = url;
	}

	/**
	 * Rasterize the current svgPath container shape to a mask texture.
	 * Called at construction (if shape is svgPath) and on shape change.
	 * Uses OffscreenCanvas + Path2D for zero-dependency SVG rasterization.
	 */
	private initMaskTexture(): void {
		const gl = this.gl;
		const shape = this.config.CONTAINER_SHAPE;

		// Dispose previous mask texture
		if (this.maskTexture) {
			gl.deleteTexture(this.maskTexture);
			this.maskTexture = null;
			this.maskData = null;
		}

		if (!shape || shape.type !== 'svgPath') {
			disposeFBO(gl, this.containerSdf ?? undefined);
			this.containerSdf = null;
			return;
		}

		const baseDim = shape.maskResolution ?? 512;
		const [vx, vy, vw, vh] = shape.viewBox ?? [0, 0, 100, 100];
		const fillRule = shape.fillRule ?? 'nonzero';

		// Rasterize at the canvas aspect ratio so the mask maps 1:1 to UV
		// space. This avoids the vertical squish that would occur if a
		// square mask were stretched over a non-square canvas.
		const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
		const maskW = aspect >= 1 ? baseDim : Math.round(baseDim * aspect);
		const maskH = aspect >= 1 ? Math.round(baseDim / aspect) : baseDim;

		// OffscreenCanvas with Canvas2D fallback for older browsers
		let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
		if (typeof OffscreenCanvas !== 'undefined') {
			ctx = new OffscreenCanvas(maskW, maskH).getContext('2d')!;
		} else {
			const el = document.createElement('canvas');
			el.width = maskW;
			el.height = maskH;
			ctx = el.getContext('2d')!;
		}
		ctx.fillStyle = 'white';
		if (shape.d) {
			// Path mode: map viewBox to canvas pixels, preserving the path's
			// own aspect ratio by uniform-scaling to fit the mask rectangle.
			const scaleX = maskW / vw;
			const scaleY = maskH / vh;
			const s = Math.min(scaleX, scaleY);
			const offsetX = (maskW - vw * s) / 2;
			const offsetY = (maskH - vh * s) / 2;
			ctx.translate(offsetX, offsetY);
			ctx.scale(s, s);
			ctx.translate(-vx, -vy);
			ctx.fill(new Path2D(shape.d), fillRule);
		} else if (shape.text) {
			ctx.font = shape.font ?? 'bold 72px sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'alphabetic';
			const metrics = ctx.measureText(shape.text);
			const textW = metrics.width;
			const ascent = metrics.actualBoundingBoxAscent;
			const descent = metrics.actualBoundingBoxDescent;
			const textH = ascent + descent;
			const pad = 0.9;
			const scale = Math.min((maskW * pad) / textW, (maskH * pad) / textH);
			ctx.setTransform(scale, 0, 0, scale, maskW / 2, maskH / 2);
			ctx.fillText(shape.text, 0, (ascent - descent) / 2);
		}

		const imageData = ctx.getImageData(0, 0, maskW, maskH);
		// Extract single channel (alpha from the white fill on transparent background)
		const maskData = new Uint8Array(maskW * maskH);
		for (let i = 0; i < maskW * maskH; i++) {
			maskData[i] = imageData.data[i * 4 + 3];
		}
		this.maskData = maskData;
		this.maskW = maskW;
		this.maskH = maskH;
		this.maskAreaFractionCache = maskAreaFraction({
			data: maskData,
			width: maskW,
			height: maskH
		});

		// Upload as GPU texture
		const tex = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		// Use R8/RED for WebGL2, LUMINANCE for WebGL1
		if (this.ext.isWebGL2) {
			const gl2 = gl as WebGL2RenderingContext;
			gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.R8, maskW, maskH, 0, gl2.RED, gl2.UNSIGNED_BYTE, maskData);
		} else {
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, maskW, maskH, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, maskData);
		}
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
		this.maskTexture = tex;
		this.containerSdf = this.buildMaskSdf(tex, maskW, maskH, this.containerSdf);
	}

	/**
	 * Rebuild a mask's jump-flood SDF into `previous` (reused when same size).
	 * Returns null on WebGL1, which keeps the coverage-texture edge.
	 */
	private buildMaskSdf(source: WebGLTexture, w: number, h: number, previous: FBO | null): FBO | null {
		if (!supportsJumpFlood(this.ext)) return null;
		this.jumpFlood ??= new JumpFlood(this.gl, this.ext, this.baseVertexShader, this.blit);
		return this.jumpFlood.build(source, w, h, previous);
	}

	/**
	 * @internal Signed distance to a mask edge, for edge effects that follow a
	 * shape (outlines, wetting bands, focus rings). R16F, LINEAR, texture rows
	 * top-down like the coverage masks (sample at `(u, 1 - v)`); values are in
	 * texels of `width`×`height`, negative inside. Null on WebGL1 or with no mask.
	 */
	getMaskSdf(kind: 'container' | 'obstruction'): { texture: WebGLTexture; width: number; height: number } | null {
		const sdf = kind === 'container' ? this.containerSdf : this.obstructionSdf;
		return sdf ? { texture: sdf.texture, width: sdf.width, height: sdf.height } : null;
	}

	/**
	 * Rasterize all interior obstructions into ONE combined mask texture.
	 * Each obstruction is drawn into the same OffscreenCanvas so their filled
	 * regions union (white-on-transparent fills accumulate). Modeled on
	 * initMaskTexture: same aspect-corrected dims and per-shape fit transform,
	 * plus each obstruction's own `scale`/`offset`. See ADR-0034.
	 */
	private initObstructionMaskTexture(): void {
		const gl = this.gl;
		const obstructions = this.config.OBSTRUCTIONS;

		// Dispose previous obstruction texture
		if (this.obstructionMaskTexture) {
			gl.deleteTexture(this.obstructionMaskTexture);
			this.obstructionMaskTexture = null;
			this.obstructionMaskData = null;
		}

		if (!obstructions || obstructions.length === 0) {
			disposeFBO(gl, this.obstructionSdf ?? undefined);
			this.obstructionSdf = null;
			return;
		}

		// Use the same base resolution + aspect-corrected dims as the
		// container mask so obstruction UVs line up with the canvas.
		const baseDim = 512;
		const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
		const maskW = aspect >= 1 ? baseDim : Math.round(baseDim * aspect);
		const maskH = aspect >= 1 ? Math.round(baseDim / aspect) : baseDim;

		let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
		if (typeof OffscreenCanvas !== 'undefined') {
			ctx = new OffscreenCanvas(maskW, maskH).getContext('2d')!;
		} else {
			const el = document.createElement('canvas');
			el.width = maskW;
			el.height = maskH;
			ctx = el.getContext('2d')!;
		}
		ctx.fillStyle = 'white';

		for (const ob of obstructions) {
			ctx.save();
			const extraScale = ob.scale ?? 1;
			// Canvas-y points down vs UV-y up, so a positive UV y-offset moves
			// the obstruction up the canvas (toward smaller pixel-y).
			const offX = (ob.offset?.x ?? 0) * maskW;
			const offY = -(ob.offset?.y ?? 0) * maskH;
			if (ob.d) {
				ctx.translate(offX, offY);
				const [vx, vy, vw, vh] = ob.viewBox ?? [0, 0, 100, 100];
				const fillRule = ob.fillRule ?? 'nonzero';
				if ((ob.fit ?? 'contain') === 'fill') {
					// Stretch each axis to fill the canvas (non-uniform). The
					// geometry spans edge-to-edge at any aspect, so a maze or
					// nozzle confines the fluid and injection UVs line up.
					ctx.scale((maskW / vw) * extraScale, (maskH / vh) * extraScale);
					ctx.translate(-vx, -vy);
				} else {
					// Uniform-fit the viewBox into the mask rectangle (same as the
					// container path mode), then apply the per-obstruction scale.
					const s = Math.min(maskW / vw, maskH / vh) * extraScale;
					ctx.translate((maskW - vw * s) / 2, (maskH - vh * s) / 2);
					ctx.scale(s, s);
					ctx.translate(-vx, -vy);
				}
				ctx.fill(new Path2D(ob.d), fillRule);
			} else if (ob.text) {
				ctx.font = ob.font ?? 'bold 72px sans-serif';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'alphabetic';
				const metrics = ctx.measureText(ob.text);
				const textW = metrics.width;
				const ascent = metrics.actualBoundingBoxAscent;
				const descent = metrics.actualBoundingBoxDescent;
				const textH = ascent + descent;
				const pad = 0.9;
				const scale = Math.min((maskW * pad) / textW, (maskH * pad) / textH) * extraScale;
				// setTransform replaces the matrix, so the offset is folded
				// directly into its translation args (a leading ctx.translate
				// would be discarded).
				ctx.setTransform(scale, 0, 0, scale, maskW / 2 + offX, maskH / 2 + offY);
				ctx.fillText(ob.text, 0, (ascent - descent) / 2);
			}
			ctx.restore();
		}

		const imageData = ctx.getImageData(0, 0, maskW, maskH);
		const maskData = new Uint8Array(maskW * maskH);
		for (let i = 0; i < maskW * maskH; i++) {
			maskData[i] = imageData.data[i * 4 + 3];
		}
		this.obstructionMaskData = maskData;
		this.obstructionMaskW = maskW;
		this.obstructionMaskH = maskH;

		const tex = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		if (this.ext.isWebGL2) {
			const gl2 = gl as WebGL2RenderingContext;
			gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.R8, maskW, maskH, 0, gl2.RED, gl2.UNSIGNED_BYTE, maskData);
		} else {
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, maskW, maskH, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, maskData);
		}
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
		this.obstructionMaskTexture = tex;
		this.obstructionSdf = this.buildMaskSdf(tex, maskW, maskH, this.obstructionSdf);
	}

	/**
	 * Build one binary solid texture for boundary-aware solver passes.
	 *
	 * `containerShape` textures encode *fluid allowed* as white; obstruction
	 * textures encode *solid blocked* as white. Divergence, pressure,
	 * gradient-subtract, viscosity, and wall friction all need the latter
	 * convention, so this combines them once on the CPU:
	 *
	 *   solid = outside(physical container) OR inside(any obstruction)
	 *
	 * Open-boundary containers remain visual crops, matching applyMask().
	 */
	private initSolidMaskTexture(): void {
		const gl = this.gl;
		if (this.solidMaskTexture) {
			gl.deleteTexture(this.solidMaskTexture);
			this.solidMaskTexture = null;
			this.solidMaskData = null;
		}

		const shape = this.config.OPEN_BOUNDARY ? null : this.config.CONTAINER_SHAPE;
		const hasObstruction = !!this.obstructionMaskData;
		if (!shape && !hasObstruction) {
			this.solidMaskW = 0;
			this.solidMaskH = 0;
			return;
		}

		const baseDim = Math.max(shape?.type === 'svgPath' ? (shape.maskResolution ?? 512) : 512, hasObstruction ? 512 : 0);
		const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
		const maskW = aspect >= 1 ? baseDim : Math.round(baseDim * aspect);
		const maskH = aspect >= 1 ? Math.round(baseDim / aspect) : baseDim;
		const containerCtx = this.getMaskCtx();
		const obstructionCtx = this.getObstructionCtx();
		const data = new Uint8Array(maskW * maskH);

		for (let y = 0; y < maskH; y++) {
			const uvY = 1 - (y + 0.5) / maskH;
			for (let x = 0; x < maskW; x++) {
				const uvX = (x + 0.5) / maskW;
				const outsideContainer = shape ? containerMask(shape, uvX, uvY, aspect, containerCtx) < 0.5 : false;
				const insideObstruction = obstructionMask(uvX, uvY, obstructionCtx) >= 0.5;
				data[y * maskW + x] = outsideContainer || insideObstruction ? 255 : 0;
			}
		}

		this.solidMaskData = data;
		this.solidMaskW = maskW;
		this.solidMaskH = maskH;

		const tex = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		if (this.ext.isWebGL2) {
			const gl2 = gl as WebGL2RenderingContext;
			gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.R8, maskW, maskH, 0, gl2.RED, gl2.UNSIGNED_BYTE, data);
		} else {
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, maskW, maskH, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
		}
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
		this.solidMaskTexture = tex;
	}

	/** Solver-grid textures derived jointly from the current solid CPU mask. */
	private initSolidDerivedTextures(): void {
		this.initSolidNeighborTexture();
		this.initSolidClearanceTexture();
	}

	/**
	 * Bake the sim-resolution neighbor-solidity (face aperture) texture from
	 * the combined solid mask (epic 0001 1b). RGBA = (L, R, T, B) neighbor
	 * solidity, binary in Phase 1. Rebuilt whenever the solid mask or the
	 * sim resolution changes; a single fetch of this texture replaces four
	 * dependent solidAt() probes in the solver shaders.
	 */
	private initSolidNeighborTexture(): void {
		const gl = this.gl;
		if (this.solidNeighborTexture) {
			gl.deleteTexture(this.solidNeighborTexture);
			this.solidNeighborTexture = null;
		}
		if (!this.solidMaskData || !this.velocity) return;
		const simW = this.velocity.width;
		const simH = this.velocity.height;
		const data = bakeSolidNeighborData(
			{ data: this.solidMaskData, width: this.solidMaskW, height: this.solidMaskH },
			simW,
			simH
		);
		const tex = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, simW, simH, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
		this.solidNeighborTexture = tex;
	}

	/**
	 * Bake a distance-to-solid field for the MacCormack validity guard. One
	 * clearance lookup conservatively covers both traces and both 2x2 stencils,
	 * avoiding a variable-length mask walk in WebGL1 fragment shaders.
	 */
	private initSolidClearanceTexture(): void {
		const gl = this.gl;
		if (this.solidClearanceTexture) {
			gl.deleteTexture(this.solidClearanceTexture);
			this.solidClearanceTexture = null;
		}
		if (!this.useMacCormack || !this.solidMaskData || !this.velocity) return;
		const simW = this.velocity.width;
		const simH = this.velocity.height;
		const data = bakeSolidClearanceData(
			{ data: this.solidMaskData, width: this.solidMaskW, height: this.solidMaskH },
			simW,
			simH
		);
		const tex = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		if (this.ext.isWebGL2) {
			const gl2 = gl as WebGL2RenderingContext;
			gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.R8, simW, simH, 0, gl2.RED, gl2.UNSIGNED_BYTE, data);
		} else {
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, simW, simH, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
		}
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
		this.solidClearanceTexture = tex;
	}

	private initPrescribedGridTextures(): void {
		const gl = this.gl;
		const prescribed = this.config.FLOW?.prescribed;

		if (this.prescribedVelocityTexture) {
			gl.deleteTexture(this.prescribedVelocityTexture);
			this.prescribedVelocityTexture = null;
		}
		if (this.prescribedScalarTexture) {
			gl.deleteTexture(this.prescribedScalarTexture);
			this.prescribedScalarTexture = null;
		}
		this.prescribedVelocityScale = 1;
		this.prescribedScalarScale = 1;

		if (!prescribed || prescribed.kind !== 'grid') return;
		if (prescribed.velocity) {
			this.prescribedVelocityScale = prescribed.velocity.scale ?? 1000;
			this.prescribedVelocityTexture = this.createPrescribedTexture(
				prescribed.velocity,
				2,
				this.prescribedVelocityScale,
				true
			);
		}
		const scalarName =
			this.config.FLOW?.visualization?.scalar ?? this.config.FLOW?.scalarFields?.[0]?.name ?? 'temperature';
		const scalarGrid = prescribed.scalars?.[scalarName] ?? Object.values(prescribed.scalars ?? {})[0];
		if (scalarGrid) {
			this.prescribedScalarScale = scalarGrid.scale ?? 1;
			this.prescribedScalarTexture = this.createPrescribedTexture(scalarGrid, 1, this.prescribedScalarScale, false);
		}
	}

	private createPrescribedTexture(field: FlowGridField, channels: 1 | 2, scale: number, signed: boolean): WebGLTexture {
		const gl = this.gl;
		const data = new Uint8Array(field.width * field.height * 4);
		for (let i = 0; i < field.width * field.height; i++) {
			if (channels === 2) {
				const x = Number(field.data[i * 2] ?? 0);
				const y = Number(field.data[i * 2 + 1] ?? 0);
				data[i * 4] = Math.round(clamp01((x / scale) * 0.5 + 0.5) * 255);
				data[i * 4 + 1] = Math.round(clamp01((y / scale) * 0.5 + 0.5) * 255);
			} else {
				const v = Number(field.data[i] ?? 0);
				data[i * 4] = Math.round(clamp01(signed ? (v / scale) * 0.5 + 0.5 : v / scale) * 255);
				data[i * 4 + 1] = data[i * 4];
				data[i * 4 + 2] = data[i * 4];
			}
			data[i * 4 + 3] = 255;
		}
		const tex = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this.ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, field.width, field.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
		return tex;
	}

	/** True when any masking work (container shape or obstructions) is active. */
	private hasMaskWork(): boolean {
		return !!(this.config.CONTAINER_SHAPE || (this.config.OBSTRUCTIONS && this.config.OBSTRUCTIONS.length));
	}

	private needsScalarFBO(): boolean {
		return needsScalarFBOForFlow(this.config.FLOW);
	}

	/**
	 * Whether physics masking should run this frame. Container shapes are
	 * physical walls only with a closed boundary (open boundary turns them
	 * into a visual-only crop); obstructions are always physical, so the mask
	 * pass runs whenever obstructions exist — even under an open boundary.
	 */
	private shouldMaskPhysics(): boolean {
		const obstructionsActive = !!(this.config.OBSTRUCTIONS && this.config.OBSTRUCTIONS.length);
		return obstructionsActive || (!!this.config.CONTAINER_SHAPE && !this.config.OPEN_BOUNDARY);
	}

	/**
	 * Rasterize the current sticky mask to a texture. Called at
	 * construction (if sticky is enabled) and on stickyMask change.
	 * Reuses the same OffscreenCanvas + Path2D pattern as initMaskTexture.
	 */
	private initStickyMaskTexture(): void {
		const gl = this.gl;
		const mask = this.config.STICKY_MASK;

		// Dispose previous
		if (this.stickyMaskTexture) {
			gl.deleteTexture(this.stickyMaskTexture);
			this.stickyMaskTexture = null;
		}
		this.stickyMaskW = 0;
		this.stickyMaskH = 0;

		if (!this.config.STICKY || !mask) return;
		if (!mask.text && !mask.d) return;

		const baseDim = mask.maskResolution ?? 512;
		const [vx, vy, vw, vh] = mask.viewBox ?? [0, 0, 100, 100];
		const fillRule = mask.fillRule ?? 'nonzero';

		const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
		const maskW = aspect >= 1 ? baseDim : Math.round(baseDim * aspect);
		const maskH = aspect >= 1 ? Math.round(baseDim / aspect) : baseDim;

		let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
		if (typeof OffscreenCanvas !== 'undefined') {
			ctx = new OffscreenCanvas(maskW, maskH).getContext('2d')!;
		} else {
			const el = document.createElement('canvas');
			el.width = maskW;
			el.height = maskH;
			ctx = el.getContext('2d')!;
		}
		ctx.fillStyle = 'white';
		if (mask.d) {
			const scaleX = maskW / vw;
			const scaleY = maskH / vh;
			const s = Math.min(scaleX, scaleY);
			const offsetX = (maskW - vw * s) / 2;
			const offsetY = (maskH - vh * s) / 2;
			ctx.translate(offsetX, offsetY);
			ctx.scale(s, s);
			ctx.translate(-vx, -vy);
			ctx.fill(new Path2D(mask.d), fillRule);
		} else if (mask.text) {
			ctx.font = mask.font ?? 'bold 72px sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'alphabetic';
			const metrics = ctx.measureText(mask.text);
			const textW = metrics.width;
			const ascent = metrics.actualBoundingBoxAscent;
			const descent = metrics.actualBoundingBoxDescent;
			const textH = ascent + descent;
			const pad = mask.padding ?? 0.9;
			const scale = Math.min((maskW * pad) / textW, (maskH * pad) / textH);
			ctx.setTransform(scale, 0, 0, scale, maskW / 2, maskH / 2);
			ctx.fillText(mask.text, 0, (ascent - descent) / 2);
		}

		const imageData = ctx.getImageData(0, 0, maskW, maskH);
		const maskData = new Uint8Array(maskW * maskH);
		for (let i = 0; i < maskW * maskH; i++) {
			maskData[i] = imageData.data[i * 4 + 3];
		}

		// Optional blur — soften edges for smoother physics interaction
		const blurRadius = mask.blur ?? 0;
		if (blurRadius > 0) {
			blurMaskData(maskData, maskW, maskH, blurRadius);
		}

		// Upload as GPU texture on unit 7 (its dedicated slot)
		gl.activeTexture(gl.TEXTURE7);
		const tex = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		if (this.ext.isWebGL2) {
			const gl2 = gl as WebGL2RenderingContext;
			gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.R8, maskW, maskH, 0, gl2.RED, gl2.UNSIGNED_BYTE, maskData);
		} else {
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, maskW, maskH, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, maskData);
		}
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
		this.stickyMaskTexture = tex;
		this.stickyMaskW = maskW;
		this.stickyMaskH = maskH;
	}

	/** Bind the sticky mask texture (or 1x1 black fallback) to texture unit 7. */
	private bindStickyMask(): void {
		const gl = this.gl;
		gl.activeTexture(gl.TEXTURE7);
		gl.bindTexture(gl.TEXTURE_2D, this.stickyMaskTexture ?? this.stickyFallbackTexture);
	}

	/** Multiply a DoubleFBO's contents by the container shape + obstruction mask in place. */
	private applyMask(target: DoubleFBO): void {
		// Container masking is a physical wall only with a closed boundary; an
		// open boundary makes the container a visual-only crop (handled in the
		// display shader). Obstructions, by contrast, are ALWAYS physical — a
		// solid obstacle blocks flow regardless of the canvas-edge behavior —
		// so under an open boundary we mask with obstructions alone.
		const shape = this.config.OPEN_BOUNDARY ? null : this.config.CONTAINER_SHAPE;
		const hasObstruction = !!this.obstructionMaskTexture;
		// Runs when a container shape OR any obstruction is active.
		if (!shape && !hasObstruction) return;
		const gl = this.gl;

this.applyMaskProgram.bind();
gl.uniform1i(this.applyMaskProgram.uniforms.uTarget, target.read.attach(0));

		// Obstruction uniforms apply on every path (analytical, svgPath, and
		// the no-container case). Bound on unit 2 — free in this pass.
		gl.uniform1f(this.applyMaskProgram.uniforms.uHasObstruction, hasObstruction ? 1.0 : 0.0);
		if (hasObstruction) {
			gl.activeTexture(gl.TEXTURE2);
			gl.bindTexture(gl.TEXTURE_2D, this.obstructionMaskTexture);
			gl.uniform1i(this.applyMaskProgram.uniforms.uObstructionMask, 2);
		}

		if (!shape) {
			// No container: uShapeType has no matching branch so mask stays 1.0,
			// leaving only the obstruction subtraction to act.
			gl.uniform1i(this.applyMaskProgram.uniforms.uShapeType, -1);
			this.blit(target.write);
			target.swap();
			return;
		}

		if (shape.type === 'svgPath') {
			if (!this.maskTexture) return;
			gl.uniform1i(this.applyMaskProgram.uniforms.uShapeType, 4);
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
			gl.uniform1i(this.applyMaskProgram.uniforms.uMaskTexture, 1);
			this.blit(target.write);
			target.swap();
			return;
		}

		gl.uniform1f(this.applyMaskProgram.uniforms.uCx, shape.cx);
		gl.uniform1f(this.applyMaskProgram.uniforms.uCy, shape.cy);

		if (shape.type === 'circle') {
			gl.uniform1i(this.applyMaskProgram.uniforms.uShapeType, 0);
			gl.uniform1f(this.applyMaskProgram.uniforms.uRadius, shape.radius);
			gl.uniform1f(this.applyMaskProgram.uniforms.uAspect, gl.drawingBufferWidth / gl.drawingBufferHeight);
		} else if (shape.type === 'frame') {
			gl.uniform1i(this.applyMaskProgram.uniforms.uShapeType, 1);
			gl.uniform1f(this.applyMaskProgram.uniforms.uAspect, gl.drawingBufferWidth / gl.drawingBufferHeight);
			gl.uniform1f(this.applyMaskProgram.uniforms.uHalfW, shape.halfW);
			gl.uniform1f(this.applyMaskProgram.uniforms.uHalfH, shape.halfH);
			gl.uniform1f(this.applyMaskProgram.uniforms.uInnerCornerRadius, shape.innerCornerRadius ?? 0);
			gl.uniform1f(this.applyMaskProgram.uniforms.uOuterHalfW, shape.outerHalfW ?? 0.5);
			gl.uniform1f(this.applyMaskProgram.uniforms.uOuterHalfH, shape.outerHalfH ?? 0.5);
			gl.uniform1f(this.applyMaskProgram.uniforms.uOuterCornerRadius, shape.outerCornerRadius ?? 0);
		} else if (shape.type === 'roundedRect') {
			gl.uniform1i(this.applyMaskProgram.uniforms.uShapeType, 2);
			gl.uniform1f(this.applyMaskProgram.uniforms.uAspect, gl.drawingBufferWidth / gl.drawingBufferHeight);
			gl.uniform1f(this.applyMaskProgram.uniforms.uHalfW, shape.halfW);
			gl.uniform1f(this.applyMaskProgram.uniforms.uHalfH, shape.halfH);
			gl.uniform1f(this.applyMaskProgram.uniforms.uInnerCornerRadius, shape.cornerRadius);
		} else if (shape.type === 'annulus') {
			gl.uniform1i(this.applyMaskProgram.uniforms.uShapeType, 3);
			gl.uniform1f(this.applyMaskProgram.uniforms.uRadius, shape.outerRadius);
			gl.uniform1f(this.applyMaskProgram.uniforms.uInnerRadius, shape.innerRadius);
			gl.uniform1f(this.applyMaskProgram.uniforms.uAspect, gl.drawingBufferWidth / gl.drawingBufferHeight);
		}

		this.blit(target.write);
		target.swap();
	}

	private displayKeywords(config: ResolvedConfig): string[] {
		const keywords: string[] = [];
		if (config.SHADING) keywords.push('SHADING');
		if (config.SPECULAR > 0 && !config.REVEAL) keywords.push('SPECULAR');
		if (config.REFRACTION > 0 && config.DISTORTION) keywords.push('REFRACTION');
		if (config.BLOOM) keywords.push('BLOOM');
		if (config.SUNRAYS) keywords.push('SUNRAYS');
		if (config.TONE_MAPPING === 'agx') keywords.push('TONE_MAP_AGX');
		else if (config.TONE_MAPPING === 'neutral') keywords.push('TONE_MAP_NEUTRAL');
		if (config.CONTAINER_SHAPE) keywords.push('CONTAINER_MASK');
		// Obstructions and distortion share display texture unit 6; the
		// obstruction mask is only bound when distortion is off, so the
		// keyword must match that guard or the display samples a stale unit.
		if (!config.DISTORTION && config.OBSTRUCTIONS && config.OBSTRUCTIONS.length) {
			keywords.push('OBSTRUCTION_MASK');
			// Paint obstruction footprints in a solid color (ADR-0039).
			if (config.OBSTRUCTION_COLOR) keywords.push('OBSTRUCTION_FILL');
		}
		// Pixel-width mask edges from the jump-flood SDFs (ADR-0084).
		if (
			supportsJumpFlood(this.ext) &&
			(config.CONTAINER_SHAPE?.type === 'svgPath' || keywords.includes('OBSTRUCTION_MASK'))
		) keywords.push('MASK_SDF');
		if (this.flowVisualizationActiveFor(config)) keywords.push('FLOW_VISUALIZATION');
		// DISTORTION and REVEAL are mutually exclusive display modes
		if (config.DISTORTION) keywords.push('DISTORTION');
		else if (config.REVEAL) keywords.push('REVEAL');
		return keywords;
	}

	private updateKeywords(preparedVariant?: string): void {
		const variant = preparedVariant ?? this.displayMaterial.prepareKeywords(this.displayKeywords(this.config));
		this.displayMaterial.activatePrepared(variant);
	}

	/* ---------------------------------------------------------------------- */
	/*                                 Update loop                            */
	/* ---------------------------------------------------------------------- */

	/** Mark the paused presentation as stale without changing RAF ownership. */
	private invalidateRender(): void {
		this.renderDirty = true;
	}

	/** Pending input may write GL state even while simulation stepping is paused. */
	private hasPendingFrameInput(): boolean {
		return this.pendingRandomSplats > 0 || this.pointers.some((pointer) => pointer.moved);
	}

	private update(): void {
		if (this.disposed || this.contextLost || !this.rafRunning) return;
		const dt = this.calcDeltaTime();
		if (this.config.PAUSED && !this.renderDirty && !this.hasPendingFrameInput()) {
			// Keep pointer colors and the timebase current, but submit no GL work and
			// do not manufacture profiler frames while the paused image is stable.
			this.updateColors(dt);
			return;
		}

		if (this.profiler) {
			this.profiler.beginFrame();
			try {
				this.profileGroup('solver', () => this.simulateFrame(dt));
				if (!this.config.PAUSED || this.renderDirty) {
					this.renderProfiled(null);
					this.renderDirty = false;
				}
			} finally {
				this.profiler.endFrame();
			}
		} else {
			this.simulateFrame(dt);
			if (!this.config.PAUSED || this.renderDirty) {
				this.renderCore(null);
				this.renderDirty = false;
			}
		}
	}

	private simulateFrame(dt: number): void {
		this.updateColors(dt);
		this.applyInputs();
		if (!this.config.PAUSED) {
			this.accumulateAutoSplatTimer(dt);
			const stepCount = this.simulationSubsteps(dt);
			const stepDt = dt / stepCount;
			for (let i = 0; i < stepCount; i++) {
				this.step(stepDt);
			}
		}
	}

	private profileGroup<T>(group: ProfileGroup, action: () => T): T {
		const profiler = this.profiler;
		if (!profiler) return action();
		profiler.beginGroup(group);
		try {
			return action();
		} finally {
			profiler.endGroup();
		}
	}

	private calcDeltaTime(): number {
		const now = performance.now();
		const frameMs = Math.max(0, now - this.lastUpdateTime);
		this.recordPerformanceFrameTime(frameMs);
		let dt = frameMs / 1000;
		dt = clampSimulationDeltaSeconds(dt, this.config.MAX_TIME_STEP, this.config.SUBSTEPS);
		this.lastUpdateTime = now;
		return dt;
	}

	private resetPerformanceGovernor(): void {
		this.performanceEmaMs = 0;
		this.performanceTier = 'none';
		this.performanceMsSinceLastChange = 0;
		this.performanceContinuousOverloadMs = 0;
		this.performanceLastAction = 'none';
		this.performancePressureIterations = this.config.PRESSURE_ITERATIONS;
		this.performanceSubsteps = this.config.SUBSTEPS;
	}

	private recordPerformanceFrameTime(frameMs: number): PerformanceAction {
		if (!this.config.AUTO_PERFORMANCE || this.deterministicMode || this.config.PAUSED) {
			return 'none';
		}

		const sampleMs = sanitizePerformanceFrameSampleMs(frameMs);
		const thresholds = { targetFrameMs: this.config.AUTO_PERFORMANCE_TARGET_FRAME_MS };
		this.performanceEmaMs = nextFrameTimeEmaMs(this.performanceEmaMs, sampleMs);
		this.performanceContinuousOverloadMs = nextContinuousOverloadMs(
			this.performanceContinuousOverloadMs,
			this.performanceEmaMs,
			sampleMs,
			thresholds
		);
		this.performanceMsSinceLastChange += sampleMs;
		const decision = performanceGovernorStep({
			emaMs: this.performanceEmaMs,
			currentTier: this.performanceTier,
			msSinceLastChange: this.performanceMsSinceLastChange,
			continuousOverloadMs: this.performanceContinuousOverloadMs,
			pressureIterations: this.performancePressureIterations,
			substeps: this.performanceSubsteps,
			floors: {
				pressureIterations: this.config.AUTO_PERFORMANCE_MIN_PRESSURE_ITERATIONS,
				substeps: this.config.AUTO_PERFORMANCE_MIN_SUBSTEPS
			},
			thresholds
		});

		if (!decision.changed) {
			return 'none';
		}

		this.performancePressureIterations = decision.pressureIterations;
		this.performanceSubsteps = decision.substeps;
		this.performanceTier = decision.tier;
		this.performanceMsSinceLastChange = 0;
		this.performanceContinuousOverloadMs = 0;
		this.performanceLastAction = decision.action;
		return decision.action;
	}

	private simulationSubsteps(dt: number): number {
		const configured = Math.max(1, Math.min(8, Math.floor(this.performanceSubsteps)));
		const required = Math.max(1, Math.ceil(dt / this.config.MAX_TIME_STEP));
		return Math.max(configured, required);
	}

	private updateColors(dt: number): void {
		if (!this.config.COLORFUL) return;
		this.colorUpdateTimer += dt * this.config.COLOR_UPDATE_SPEED;
		if (this.colorUpdateTimer >= 1) {
			this.colorUpdateTimer = wrap(this.colorUpdateTimer, 0, 1);
			for (const p of this.pointers) {
				p.color = generateColor(this.rng);
			}
		}
	}

	private applyInputs(): void {
		if (this.pendingRandomSplats > 0) {
			const count = randomSplatsThisFrame(this.pendingRandomSplats);
			this.pendingRandomSplats -= count;
			this.multipleSplats(count);
		}
		for (const p of this.pointers) {
			if (p.moved) {
				p.moved = false;
				this.splatPointer(p);
			}
		}
	}

	private accumulateAutoSplatTimer(dt: number): void {
		const rate = this.config.AUTO_SPLAT_RATE;
		if (rate <= 0) {
			this.autoSplatTimer = 0;
			return;
		}
		this.autoSplatTimer += dt;
		const baseInterval = 1 / rate;
		// Cap accumulated time to prevent a burst avalanche when autoPause is
		// false and the browser throttled RAF while the tab was hidden.
		const maxAccumulation = baseInterval * 3.0;
		if (this.autoSplatTimer > maxAccumulation) {
			this.autoSplatTimer = maxAccumulation;
		}
		const hdr = this.hdrMultiplier();
		const shape = this.config.CONTAINER_SHAPE;
		const aspect = this.gl.drawingBufferWidth / this.gl.drawingBufferHeight;
		// Re-jitter interval each iteration so back-to-back splats don't
		// all subtract the same value. Wide 0.3–2.0× range gives organic
		// timing — occasional quick double-drips and long pauses.
		for (;;) {
			const interval = baseInterval * (0.3 + this.rng() * 1.7);
			if (this.autoSplatTimer < interval) break;
			this.autoSplatTimer -= interval;
			const count = this.config.AUTO_SPLAT_COUNT;
			const evenSpacing = this.config.AUTO_SPLAT_EVEN_X;
			for (let i = 0; i < count; i++) {
				let color: RGB;
				if (this.config.AUTO_SPLAT_COLOR) {
					color = { ...this.config.AUTO_SPLAT_COLOR };
					color.r *= hdr;
					color.g *= hdr;
					color.b *= hdr;
				} else {
					color = generateColor(this.rng);
					color.r *= hdr;
					color.g *= hdr;
					color.b *= hdr;
				}
				const spawnX = this.config.AUTO_SPLAT_CENTER_X;
				const spawnY = this.config.AUTO_SPLAT_CENTER_Y;
				const spreadX = this.config.AUTO_SPLAT_BAND_WIDTH;
				const spreadY = this.config.AUTO_SPLAT_BAND_HEIGHT;
				let x = evenSpacing ? (i + 0.5) / count : Math.max(0, Math.min(1, spawnX + (this.rng() - 0.5) * spreadX));
				let y = Math.max(0, Math.min(1, spawnY + (this.rng() - 0.5) * spreadY));
				if (shape || this.config.OBSTRUCTIONS) {
					const mc = this.getMaskCtx();
					const octx = this.getObstructionCtx();
					// Accept only inside the container (if any) AND outside every
					// obstruction. Same attempt cap + continue-on-exhaustion as before.
					const rejected = (xx: number, yy: number) =>
						(shape ? containerMask(shape, xx, yy, aspect, mc) < 0.5 : false) || obstructionMask(xx, yy, octx) >= 0.5;
					let attempts = 10;
					while (attempts > 0 && rejected(x, y)) {
						if (!evenSpacing) x = Math.max(0, Math.min(1, spawnX + (this.rng() - 0.5) * spreadX));
						y = Math.max(0, Math.min(1, spawnY + (this.rng() - 0.5) * spreadY));
						attempts--;
					}
					if (attempts === 0) continue;
				}
				let splatDx = this.config.AUTO_SPLAT_VELOCITY_X;
				let splatDy = this.config.AUTO_SPLAT_VELOCITY_Y;
				const swirl = this.config.AUTO_SPLAT_SWIRL;
				if (swirl !== 0) {
					const s = this.config.CONTAINER_SHAPE;
					const cx = s && s.type !== 'svgPath' ? s.cx : 0.5;
					const cy = s && s.type !== 'svgPath' ? s.cy : 0.5;
					splatDx = -(y - cy) * swirl;
					splatDy = (x - cx) * swirl;
				}
				this.splat(x, y, splatDx, splatDy, color);
			}
		}
	}

	private flowMode(): 'live' | 'prescribed' | 'hybrid' {
		return this.config.FLOW?.mode ?? 'live';
	}

	private applyFlowSources(dt: number, includeVelocity: boolean): void {
		const flow = this.config.FLOW;
		if (!flow?.sources?.length) return;

		const velocityBatch: FlowSourceBatchEntry[] = [];
		const dyeBatch: FlowSourceBatchEntry[] = [];
		const scalarBatch: FlowSourceBatchEntry[] = [];

		for (const source of flow.sources) {
			const sourceThickness = source.kind === 'line' ? source.thickness : undefined;
			const radius = (source.radius ?? sourceThickness ?? this.config.SPLAT_RADIUS) / 100.0;
			const scaleBase = (source.rate ?? 60) * dt;
			if (includeVelocity && source.velocity) {
				velocityBatch.push(
					this.flowSourceBatchEntry(
						source,
						{
							r: source.velocity.x * scaleBase,
							g: source.velocity.y * scaleBase,
							b: 0
						},
						radius
					)
				);
			}
			if (source.dye) {
				this.dyeMayContainContent = true;
				dyeBatch.push(
					this.flowSourceBatchEntry(
						source,
						{
							r: source.dye.r * scaleBase,
							g: source.dye.g * scaleBase,
							b: source.dye.b * scaleBase
						},
						radius
					)
				);
			}
			if (source.scalars && this.scalar) {
				scalarBatch.push(this.flowSourceBatchEntry(source, this.scalarColor(source.scalars, scaleBase), radius));
			}
		}

		this.applyFlowSourceBatches(this.velocity, velocityBatch, 0);
		this.applyFlowSourceBatches(this.dye, dyeBatch, this.config.STICKY ? this.config.STICKY_AMPLIFY : 0);
		if (this.scalar) this.applyFlowSourceBatches(this.scalar, scalarBatch, 0);
	}

	private flowSourceBatchEntry(source: FlowSource, color: RGB, radius: number): FlowSourceBatchEntry {
		const aspect = this.canvas.width / this.canvas.height;
		if (source.kind === 'point') {
			return {
				kind: 0,
				profile: source.profile === 'parabolic' ? 1 : 0,
				fromX: source.x,
				fromY: source.y,
				toX: source.x,
				toY: source.y,
				rectX: 0,
				rectY: 0,
				rectW: 0,
				rectH: 0,
				color,
				radius: correctRadius(radius, aspect)
			};
		}
		if (source.kind === 'line') {
			return {
				kind: 1,
				profile: source.profile === 'parabolic' ? 1 : 0,
				fromX: source.from.x,
				fromY: source.from.y,
				toX: source.to.x,
				toY: source.to.y,
				rectX: 0,
				rectY: 0,
				rectW: 0,
				rectH: 0,
				color,
				radius: correctRadius(radius, aspect)
			};
		}
		return {
			kind: 2,
			profile: source.profile === 'parabolic' ? 1 : 0,
			fromX: 0,
			fromY: 0,
			toX: 0,
			toY: 0,
			rectX: source.x,
			rectY: source.y,
			rectW: source.width,
			rectH: source.height,
			color,
			radius: correctRadius(radius, aspect)
		};
	}

	private applyFlowSourceBatches(target: DoubleFBO, entries: FlowSourceBatchEntry[], stickyAmplify: number): void {
		for (let start = 0; start < entries.length; start += FLOW_SOURCE_BATCH_SIZE) {
			this.applyFlowSourceBatch(
				target,
				entries,
				start,
				Math.min(FLOW_SOURCE_BATCH_SIZE, entries.length - start),
				stickyAmplify
			);
		}
	}

	private applyFlowSourceBatch(
		target: DoubleFBO,
		entries: FlowSourceBatchEntry[],
		start: number,
		count: number,
		stickyAmplify: number
	): void {
		if (count <= 0) return;
		const gl = this.gl;
		this.flowSourceProgram.bind();
		this.bindStickyMask();
		gl.uniform1i(this.flowSourceProgram.uniforms.uStickyMask, 7);
		gl.uniform1f(this.flowSourceProgram.uniforms.uStickyAmplify, stickyAmplify);
		gl.uniform1i(this.flowSourceProgram.uniforms.uTarget, target.read.attach(0));
		gl.uniform1f(this.flowSourceProgram.uniforms.aspectRatio, this.canvas.width / this.canvas.height);
		gl.uniform1i(this.flowSourceProgram.uniforms.uCount, count);

		for (let i = 0; i < FLOW_SOURCE_BATCH_SIZE; i++) {
			const entry = i < count ? entries[start + i] : undefined;
			this.flowSourceBatchKind[i] = entry?.kind ?? 0;
			this.flowSourceBatchProfile[i] = entry?.profile ?? 0;
			this.flowSourceBatchFrom[i * 2] = entry?.fromX ?? 0;
			this.flowSourceBatchFrom[i * 2 + 1] = entry?.fromY ?? 0;
			this.flowSourceBatchTo[i * 2] = entry?.toX ?? 0;
			this.flowSourceBatchTo[i * 2 + 1] = entry?.toY ?? 0;
			this.flowSourceBatchRect[i * 4] = entry?.rectX ?? 0;
			this.flowSourceBatchRect[i * 4 + 1] = entry?.rectY ?? 0;
			this.flowSourceBatchRect[i * 4 + 2] = entry?.rectW ?? 0;
			this.flowSourceBatchRect[i * 4 + 3] = entry?.rectH ?? 0;
			this.flowSourceBatchColor[i * 3] = entry?.color.r ?? 0;
			this.flowSourceBatchColor[i * 3 + 1] = entry?.color.g ?? 0;
			this.flowSourceBatchColor[i * 3 + 2] = entry?.color.b ?? 0;
			this.flowSourceBatchRadius[i] = entry?.radius ?? 0;
		}

		gl.uniform1iv(this.arrayUniform(this.flowSourceProgram.uniforms, 'uKind'), this.flowSourceBatchKind);
		gl.uniform1iv(this.arrayUniform(this.flowSourceProgram.uniforms, 'uProfile'), this.flowSourceBatchProfile);
		gl.uniform2fv(this.arrayUniform(this.flowSourceProgram.uniforms, 'uFrom'), this.flowSourceBatchFrom);
		gl.uniform2fv(this.arrayUniform(this.flowSourceProgram.uniforms, 'uTo'), this.flowSourceBatchTo);
		gl.uniform4fv(this.arrayUniform(this.flowSourceProgram.uniforms, 'uRect'), this.flowSourceBatchRect);
		gl.uniform3fv(this.arrayUniform(this.flowSourceProgram.uniforms, 'uColor'), this.flowSourceBatchColor);
		gl.uniform1fv(this.arrayUniform(this.flowSourceProgram.uniforms, 'uRadius'), this.flowSourceBatchRadius);

		this.blit(target.write);
		target.swap();
	}

	private scalarColor(scalars: NonNullable<FlowSource['scalars']>, weight: number): RGB {
		const fields = this.config.FLOW?.scalarFields;
		let r = 0,
			g = 0,
			b = 0;
		for (const [name, value] of Object.entries(scalars)) {
			const v = (value ?? 0) * weight;
			const ch = flowScalarChannel(name, fields);
			if (ch === 0) r += v;
			else if (ch === 1) g += v;
			else b += v;
		}
		return { r, g, b };
	}

	private applyFlowForces(dt: number): void {
		const forces = this.config.FLOW?.forces;
		if (!forces?.length) return;
		for (const force of forces) {
			this.applyFlowForce(force, dt);
		}
	}

	private applyFlowForce(force: FlowForce, dt: number): void {
		const gl = this.gl;
		this.flowForceProgram.bind();
		gl.uniform1i(this.flowForceProgram.uniforms.uVelocity, this.velocity.read.attach(0));
		if (this.scalar) {
			gl.uniform1i(this.flowForceProgram.uniforms.uScalar, this.scalar.read.attach(1));
		} else {
			this.bindStickyMask();
			gl.uniform1i(this.flowForceProgram.uniforms.uScalar, 7);
		}
		gl.uniform1f(this.flowForceProgram.uniforms.dt, dt);
		if (force.kind === 'gravity' || force.kind === 'pressureGradient') {
			gl.uniform2f(this.flowForceProgram.uniforms.uGravity, force.vector.x, force.vector.y);
			gl.uniform2f(this.flowForceProgram.uniforms.uBuoyancyDirection, 0, 1);
			gl.uniform1f(this.flowForceProgram.uniforms.uBuoyancyStrength, 0);
			gl.uniform1f(this.flowForceProgram.uniforms.uBuoyancyAmbient, 0);
			gl.uniform1i(this.flowForceProgram.uniforms.uScalarChannel, 0);
		} else {
			const dir = force.direction ?? { x: 0, y: 1 };
			gl.uniform2f(this.flowForceProgram.uniforms.uGravity, 0, 0);
			gl.uniform2f(this.flowForceProgram.uniforms.uBuoyancyDirection, dir.x, dir.y);
			gl.uniform1f(this.flowForceProgram.uniforms.uBuoyancyStrength, force.strength);
			gl.uniform1f(this.flowForceProgram.uniforms.uBuoyancyAmbient, force.ambient ?? 0);
			gl.uniform1i(
				this.flowForceProgram.uniforms.uScalarChannel,
				flowScalarChannel(force.scalar, this.config.FLOW?.scalarFields)
			);
		}
		this.blit(this.velocity.write);
		this.velocity.swap();
	}

	private applyFlowOutlets(targets: Array<'velocity' | 'dye' | 'scalar'>): void {
		const outlets = this.config.FLOW?.outlets;
		if (!outlets?.length) return;
		for (const target of targets) {
			if (target === 'scalar' && !this.scalar) continue;
			const fbo = target === 'velocity' ? this.velocity : target === 'dye' ? this.dye : this.scalar!;
			const batch: FlowOutletBatchEntry[] = [];

			for (const outlet of outlets) {
				if (target === 'velocity' && !outlet.clearVelocity) continue;
				if (target === 'scalar' && (!this.scalar || outlet.clearScalars === false)) continue;
				batch.push({
					edge: this.flowOutletEdgeCode(outlet.edge),
					from: clamp01(outlet.from ?? 0),
					to: clamp01(outlet.to ?? 1),
					width: Math.max(0.001, outlet.width ?? 0.035),
					keep: target === 'dye' ? outlet.clearDye ?? 0 : target === 'scalar' ? 0 : 0.25
				});
				if (batch.length === FLOW_OUTLET_BATCH_SIZE) {
					this.applyFlowOutletBatch(fbo, batch);
					batch.length = 0;
				}
			}

			this.applyFlowOutletBatch(fbo, batch);
		}
	}

	private flowOutletEdgeCode(edge: FlowOutlet['edge']): 0 | 1 | 2 | 3 {
		return edge === 'left' ? 0 : edge === 'right' ? 1 : edge === 'top' ? 2 : 3;
	}

	private applyFlowOutletBatch(target: DoubleFBO, batch: FlowOutletBatchEntry[]): void {
		if (batch.length === 0) return;
		const gl = this.gl;
		this.flowOutletProgram.bind();
		gl.uniform1i(this.flowOutletProgram.uniforms.uTarget, target.read.attach(0));
		gl.uniform1i(this.flowOutletProgram.uniforms.uCount, batch.length);

		for (let i = 0; i < FLOW_OUTLET_BATCH_SIZE; i++) {
			const entry = batch[i];
			this.flowOutletBatchEdge[i] = entry?.edge ?? 0;
			this.flowOutletBatchFrom[i] = entry?.from ?? 0;
			this.flowOutletBatchTo[i] = entry?.to ?? 0;
			this.flowOutletBatchWidth[i] = entry?.width ?? 0.001;
			this.flowOutletBatchKeep[i] = entry?.keep ?? 1;
		}

		gl.uniform1iv(this.arrayUniform(this.flowOutletProgram.uniforms, 'uEdge'), this.flowOutletBatchEdge);
		gl.uniform1fv(this.arrayUniform(this.flowOutletProgram.uniforms, 'uFrom'), this.flowOutletBatchFrom);
		gl.uniform1fv(this.arrayUniform(this.flowOutletProgram.uniforms, 'uTo'), this.flowOutletBatchTo);
		gl.uniform1fv(this.arrayUniform(this.flowOutletProgram.uniforms, 'uWidth'), this.flowOutletBatchWidth);
		gl.uniform1fv(this.arrayUniform(this.flowOutletProgram.uniforms, 'uKeep'), this.flowOutletBatchKeep);

		this.blit(target.write);
		target.swap();
	}

	private applyPrescribedFields(): void {
		const prescribed = this.config.FLOW?.prescribed;
		if (!prescribed) return;
		const mode = this.flowMode() === 'hybrid' ? 1 : 0;
		if (prescribed.kind === 'grid') {
			if (this.prescribedVelocityTexture)
				this.applyPrescribedGridField(
					this.velocity,
					this.prescribedVelocityTexture,
					this.prescribedVelocityScale,
					0,
					mode
				);
			if (this.scalar && this.prescribedScalarTexture)
				this.applyPrescribedGridField(this.scalar, this.prescribedScalarTexture, this.prescribedScalarScale, 1, mode);
		}
	}

	private applyPrescribedGridField(
		target: DoubleFBO,
		texture: WebGLTexture,
		scale: number,
		outputKind: 0 | 1,
		mode: 0 | 1
	): void {
		const gl = this.gl;
		this.prescribedFieldProgram.bind();
		gl.uniform1i(this.prescribedFieldProgram.uniforms.uTarget, target.read.attach(0));
		gl.uniform1i(this.prescribedFieldProgram.uniforms.uMode, mode);
		gl.uniform1i(this.prescribedFieldProgram.uniforms.uOutputKind, outputKind);
		gl.uniform1i(this.prescribedFieldProgram.uniforms.uUseGrid, 1);
		gl.uniform1i(
			this.prescribedFieldProgram.uniforms.uScalarChannel,
			flowScalarChannel(this.config.FLOW?.visualization?.scalar, this.config.FLOW?.scalarFields)
		);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.uniform1i(this.prescribedFieldProgram.uniforms.uGridTexture, 1);
		gl.uniform1f(this.prescribedFieldProgram.uniforms.uGridScale, scale);
		this.blit(target.write);
		target.swap();
	}

	private scalarDissipationVector(): RGB {
		const fields = this.config.FLOW?.scalarFields;
		const fallback = this.currentDensityDissipation();
		const out: RGB = { r: fallback, g: fallback, b: fallback };
		for (const field of fields ?? []) {
			const dissipation = scalarDissipationForField(field, fallback);
			const ch = flowScalarChannel(field.name, fields);
			if (ch === 0) out.r = dissipation;
			else if (ch === 1) out.g = dissipation;
			else out.b = dissipation;
		}
		return out;
	}

	private flowScalarField(name: string | undefined): FlowScalarField | undefined {
		const fields = this.config.FLOW?.scalarFields;
		const n = name ?? fields?.[0]?.name ?? 'temperature';
		return fields?.find((field) => field.name === n) ?? fields?.[0];
	}

	private advectVelocity(dt: number): void {
		if (this.useMacCormack) {
			this.advectVelocityMacCormack(dt);
			return;
		}
		const gl = this.gl;
		this.advectionProgram.bind();
		this.bindInlineMaskUniforms(this.advectionProgram.uniforms, 2, 3);
		gl.uniform1f(this.advectionProgram.uniforms.uMultiplicative, this.config.REVEAL || this.config.STICKY ? 1.0 : 0.0);
		this.bindStickyMask();
		gl.uniform1i(this.advectionProgram.uniforms.uStickyMask, 7);
		gl.uniform1f(
			this.advectionProgram.uniforms.uStickyStrength,
			this.config.STICKY ? -(this.config.STICKY_STRENGTH * 0.8) : 0.0
		);
		gl.uniform2f(this.advectionProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
		if (!this.ext.supportLinearFiltering) {
			gl.uniform2f(this.advectionProgram.uniforms.dyeTexelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
		}
		const velocityId = this.velocity.read.attach(0);
		gl.uniform1i(this.advectionProgram.uniforms.uVelocity, velocityId);
		gl.uniform1i(this.advectionProgram.uniforms.uSource, velocityId);
		gl.uniform1f(this.advectionProgram.uniforms.dt, dt);
		gl.uniform1f(this.advectionProgram.uniforms.uUseDissipationVector, 0.0);
		gl.uniform4f(this.advectionProgram.uniforms.dissipationVector, 0, 0, 0, 0);
		gl.uniform1f(
			this.advectionProgram.uniforms.dissipation,
			this.config.REVEAL || this.config.STICKY
				? this.config.VELOCITY_DISSIPATION > 0.5
					? this.config.VELOCITY_DISSIPATION
					: 0.98
				: this.config.VELOCITY_DISSIPATION
		);
		this.blit(this.velocity.write);
		this.velocity.swap();
	}

	/**
	 * Opt-in second-order MacCormack advection for the velocity field (epic 0001
	 * Phase 2). Two passes: forward semi-Lagrangian advect into the velocitySource
	 * scratch FBO (phi_hat), then the MacCormack correction into velocity.write.
	 * Only reached when {@link useMacCormack} is set (requires linear filtering).
	 */
	private advectVelocityMacCormack(dt: number): void {
		const gl = this.gl;
		// Mirrors the SL velocity-dissipation expression below so the two schemes
		// dissipate identically (apples-to-apples comparison).
		const velocityDissipation =
			this.config.REVEAL || this.config.STICKY
				? this.config.VELOCITY_DISSIPATION > 0.5
					? this.config.VELOCITY_DISSIPATION
					: 0.98
				: this.config.VELOCITY_DISSIPATION;

		// Pass A — forward semi-Lagrangian advect of velocity into velocitySource
		// with NO dissipation / sticky / mask, so phi_hat is the raw advected
		// field; the compositing is applied once in pass B. velocitySource is
		// borrowed transiently here: applyViscosity repopulates it AFTER advection
		// (advect runs before viscosity in step()), so this reuse is safe.
		this.advectionProgram.bind();
		this.bindInlineMaskUniforms(this.advectionProgram.uniforms, 2, 3);
		gl.uniform1f(this.advectionProgram.uniforms.uApplyInlineMask, 0.0);
		gl.uniform1f(this.advectionProgram.uniforms.uMultiplicative, 0.0);
		this.bindStickyMask();
		gl.uniform1i(this.advectionProgram.uniforms.uStickyMask, 7);
		gl.uniform1f(this.advectionProgram.uniforms.uStickyStrength, 0.0);
		gl.uniform2f(this.advectionProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
		const fwdVelocityId = this.velocity.read.attach(0);
		gl.uniform1i(this.advectionProgram.uniforms.uVelocity, fwdVelocityId);
		gl.uniform1i(this.advectionProgram.uniforms.uSource, fwdVelocityId);
		gl.uniform1f(this.advectionProgram.uniforms.dt, dt);
		gl.uniform1f(this.advectionProgram.uniforms.uUseDissipationVector, 0.0);
		gl.uniform4f(this.advectionProgram.uniforms.dissipationVector, 0, 0, 0, 0);
		gl.uniform1f(this.advectionProgram.uniforms.dissipation, 0.0);
		this.blit(this.velocitySource);

		// Pass B — MacCormack correction. Reads phi^n (velocity.read, unit 0) and
		// phi_hat (velocitySource, unit 1); mask samplers go on units 2/3, solid
		// clearance on unit 4, and sticky on unit 7. Every sampler is bound to a
		// dedicated unit (ADR-0038) so none aliases velocity.write.
		this.advectionMacCormackProgram.bind();
		this.bindInlineMaskUniforms(this.advectionMacCormackProgram.uniforms, 2, 3);
		this.bindMacCormackClearanceUniforms(this.advectionMacCormackProgram.uniforms, 4);
		gl.uniform1f(
			this.advectionMacCormackProgram.uniforms.uMultiplicative,
			this.config.REVEAL || this.config.STICKY ? 1.0 : 0.0
		);
		this.bindStickyMask();
		gl.uniform1i(this.advectionMacCormackProgram.uniforms.uStickyMask, 7);
		gl.uniform1f(
			this.advectionMacCormackProgram.uniforms.uStickyStrength,
			this.config.STICKY ? -(this.config.STICKY_STRENGTH * 0.8) : 0.0
		);
		gl.uniform2f(
			this.advectionMacCormackProgram.uniforms.texelSize,
			this.velocity.texelSizeX,
			this.velocity.texelSizeY
		);
		const edges = this.flowOpenEdges();
		gl.uniform4f(this.advectionMacCormackProgram.uniforms.uOpenEdges, edges[0], edges[1], edges[2], edges[3]);
		gl.uniform1i(this.advectionMacCormackProgram.uniforms.uVelocity, this.velocity.read.attach(0));
		gl.uniform1i(this.advectionMacCormackProgram.uniforms.uPhiHat, this.velocitySource.attach(1));
		gl.uniform1f(this.advectionMacCormackProgram.uniforms.dt, dt);
		gl.uniform1f(this.advectionMacCormackProgram.uniforms.uUseDissipationVector, 0.0);
		gl.uniform4f(this.advectionMacCormackProgram.uniforms.dissipationVector, 0, 0, 0, 0);
		gl.uniform1f(this.advectionMacCormackProgram.uniforms.dissipation, velocityDissipation);
		this.blit(this.velocity.write);
		this.velocity.swap();
	}

	private advectDye(dt: number): void {
		const gl = this.gl;
		this.advectionProgram.bind();
		this.bindInlineMaskUniforms(this.advectionProgram.uniforms, 2, 3);
		gl.uniform1f(this.advectionProgram.uniforms.uMultiplicative, this.config.REVEAL || this.config.STICKY ? 1.0 : 0.0);
		this.bindStickyMask();
		gl.uniform1i(this.advectionProgram.uniforms.uStickyMask, 7);
		gl.uniform1f(
			this.advectionProgram.uniforms.uStickyStrength,
			this.config.STICKY ? this.config.STICKY_STRENGTH : 0.0
		);
		gl.uniform2f(this.advectionProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
		if (!this.ext.supportLinearFiltering) {
			gl.uniform2f(this.advectionProgram.uniforms.dyeTexelSize, this.dye.texelSizeX, this.dye.texelSizeY);
		}
		gl.uniform1i(this.advectionProgram.uniforms.uVelocity, this.velocity.read.attach(0));
		gl.uniform1i(this.advectionProgram.uniforms.uSource, this.dye.read.attach(1));
		gl.uniform1f(this.advectionProgram.uniforms.dt, dt);
		gl.uniform1f(this.advectionProgram.uniforms.uUseDissipationVector, 0.0);
		gl.uniform4f(this.advectionProgram.uniforms.dissipationVector, 0, 0, 0, 0);
		gl.uniform1f(this.advectionProgram.uniforms.dissipation, this.currentDensityDissipation());
		this.blit(this.dye.write);
		this.dye.swap();
	}

	private advectScalar(dt: number): void {
		if (!this.scalar) return;
		const gl = this.gl;
		this.advectionProgram.bind();
		this.bindInlineMaskUniforms(this.advectionProgram.uniforms, 2, 3);
		gl.uniform1f(this.advectionProgram.uniforms.uMultiplicative, 0.0);
		this.bindStickyMask();
		gl.uniform1i(this.advectionProgram.uniforms.uStickyMask, 7);
		gl.uniform1f(this.advectionProgram.uniforms.uStickyStrength, 0.0);
		gl.uniform2f(this.advectionProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
		if (!this.ext.supportLinearFiltering) {
			gl.uniform2f(this.advectionProgram.uniforms.dyeTexelSize, this.scalar.texelSizeX, this.scalar.texelSizeY);
		}
		gl.uniform1i(this.advectionProgram.uniforms.uVelocity, this.velocity.read.attach(0));
		gl.uniform1i(this.advectionProgram.uniforms.uSource, this.scalar.read.attach(1));
		gl.uniform1f(this.advectionProgram.uniforms.dt, dt);
		const dissipation = this.scalarDissipationVector();
		gl.uniform1f(this.advectionProgram.uniforms.uUseDissipationVector, 1.0);
		gl.uniform4f(
			this.advectionProgram.uniforms.dissipationVector,
			dissipation.r,
			dissipation.g,
			dissipation.b,
			this.currentDensityDissipation()
		);
		gl.uniform1f(this.advectionProgram.uniforms.dissipation, this.currentDensityDissipation());
		this.blit(this.scalar.write);
		this.scalar.swap();
	}

	private flowOpenEdges(): [number, number, number, number] {
		const b = this.config.FLOW?.boundary;
		const fallback = this.config.OPEN_BOUNDARY ? 1 : 0;
		const edge = (kind: 'wall' | 'open' | undefined) => (kind === 'open' ? 1 : kind === 'wall' ? 0 : fallback);
		return [edge(b?.left), edge(b?.right), edge(b?.top), edge(b?.bottom)];
	}

	private flowVisualizationActive(): boolean {
		const colorBy = this.config.FLOW?.visualization?.colorBy;
		return !!colorBy && colorBy !== 'dye' && !this.config.REVEAL && !this.config.DISTORTION;
	}

	private flowVisualizationActiveFor(config: ResolvedConfig): boolean {
		const colorBy = config.FLOW?.visualization?.colorBy;
		return !!colorBy && colorBy !== 'dye' && !config.REVEAL && !config.DISTORTION;
	}

	private flowVisualizationMode(): number {
		const colorBy = this.config.FLOW?.visualization?.colorBy ?? 'dye';
		if (colorBy === 'speed') return 1;
		if (colorBy === 'pressure') return 2;
		if (colorBy === 'temperature' || colorBy === 'scalar') return 3;
		return 0;
	}

	private shouldSimulateDye(): boolean {
		return this.dyeMayContainContent;
	}

	private flowTransferKind(): number {
		const transfer = this.config.FLOW?.visualization?.transfer;
		if (transfer === 'water') return 1;
		if (transfer === 'ink') return 2;
		if (transfer === 'viridis') return 3;
		if (transfer === 'cfd') return 4;
		return 0;
	}

	private arrayUniform(
		uniforms: Record<string, WebGLUniformLocation | null>,
		name: string
	): WebGLUniformLocation | null {
		return uniforms[`${name}[0]`] ?? uniforms[name] ?? null;
	}

	private bindSolidMaskUniforms(
		uniforms: Record<string, WebGLUniformLocation | null>,
		unit: number,
		neighborUnit: number
	): void {
		const gl = this.gl;
		const has = !!this.solidMaskTexture && !!this.solidNeighborTexture;
		gl.uniform1f(uniforms.uHasSolidMask, has ? 1.0 : 0.0);
		// Samplers always point at their dedicated units with a real or 1×1
		// fallback texture bound. A sampler left at a stale unit can alias a
		// later render target — ANGLE flags that as a framebuffer feedback
		// loop even when the shader branch never samples it.
		gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(gl.TEXTURE_2D, has ? this.solidMaskTexture : this.stickyFallbackTexture);
		gl.uniform1i(uniforms.uSolidMask, unit);
		// Programs without a uSolidNeighbors uniform (wall friction) get a
		// null location here, which WebGL silently ignores.
		gl.activeTexture(gl.TEXTURE0 + neighborUnit);
		gl.bindTexture(gl.TEXTURE_2D, has ? this.solidNeighborTexture : this.stickyFallbackTexture);
		gl.uniform1i(uniforms.uSolidNeighbors, neighborUnit);
	}

	/** Bind the optional MacCormack clearance field without aliasing a target. */
	private bindMacCormackClearanceUniforms(
		uniforms: Record<string, WebGLUniformLocation | null>,
		unit: number
	): void {
		const gl = this.gl;
		const has = !!this.solidClearanceTexture;
		gl.uniform1f(uniforms.uHasSolidClearance, has ? 1.0 : 0.0);
		gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(gl.TEXTURE_2D, this.solidClearanceTexture ?? this.stickyFallbackTexture);
		gl.uniform1i(uniforms.uSolidClearance, unit);
	}

	/**
	 * Set the inline container/obstruction mask uniforms on a solver program
	 * (epic 0001 1a). Mirrors `applyMask()`'s shape/texture decisions exactly,
	 * including the svgPath-without-texture no-op; when masking is inactive
	 * only `uApplyInlineMask = 0` is written and the shader multiplies by 1.
	 */
	private bindInlineMaskUniforms(
		uniforms: Record<string, WebGLUniformLocation | null>,
		maskUnit: number,
		obstructionUnit: number
	): boolean {
		const gl = this.gl;
		const shape = this.config.OPEN_BOUNDARY ? null : this.config.CONTAINER_SHAPE;
		const hasObstruction = !!this.obstructionMaskTexture;
		const svgPathMissingTexture = shape?.type === 'svgPath' && !this.maskTexture;
		const active = (!!shape || hasObstruction) && !svgPathMissingTexture;
		gl.uniform1f(uniforms.uApplyInlineMask, active ? 1.0 : 0.0);

		// Both samplers always point at their dedicated units with a real or
		// 1×1 fallback texture bound. A sampler left at a stale unit can alias
		// a later render target — ANGLE flags that as a framebuffer feedback
		// loop even when the shader branch never samples it (e.g. unit 5 still
		// holding velocity.read from the speed-visualization display pass).
		const svgMask = active && shape?.type === 'svgPath' ? this.maskTexture : null;
		gl.activeTexture(gl.TEXTURE0 + maskUnit);
		gl.bindTexture(gl.TEXTURE_2D, svgMask ?? this.stickyFallbackTexture);
		gl.uniform1i(uniforms.uMaskTexture, maskUnit);
		gl.activeTexture(gl.TEXTURE0 + obstructionUnit);
		gl.bindTexture(gl.TEXTURE_2D, (active ? this.obstructionMaskTexture : null) ?? this.stickyFallbackTexture);
		gl.uniform1i(uniforms.uObstructionMask, obstructionUnit);
		if (!active) return false;

		gl.uniform1f(uniforms.uHasObstruction, hasObstruction ? 1.0 : 0.0);

		if (!shape) {
			// No container: no uShapeType branch matches, mask stays 1.0 and
			// only the obstruction subtraction acts.
			gl.uniform1i(uniforms.uShapeType, -1);
			return true;
		}

		if (shape.type === 'svgPath') {
			gl.uniform1i(uniforms.uShapeType, 4);
			return true;
		}

		gl.uniform1f(uniforms.uCx, shape.cx);
		gl.uniform1f(uniforms.uCy, shape.cy);
		const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
		if (shape.type === 'circle') {
			gl.uniform1i(uniforms.uShapeType, 0);
			gl.uniform1f(uniforms.uRadius, shape.radius);
			gl.uniform1f(uniforms.uAspect, aspect);
		} else if (shape.type === 'frame') {
			gl.uniform1i(uniforms.uShapeType, 1);
			gl.uniform1f(uniforms.uAspect, aspect);
			gl.uniform1f(uniforms.uHalfW, shape.halfW);
			gl.uniform1f(uniforms.uHalfH, shape.halfH);
			gl.uniform1f(uniforms.uInnerCornerRadius, shape.innerCornerRadius ?? 0);
			gl.uniform1f(uniforms.uOuterHalfW, shape.outerHalfW ?? 0.5);
			gl.uniform1f(uniforms.uOuterHalfH, shape.outerHalfH ?? 0.5);
			gl.uniform1f(uniforms.uOuterCornerRadius, shape.outerCornerRadius ?? 0);
		} else if (shape.type === 'roundedRect') {
			gl.uniform1i(uniforms.uShapeType, 2);
			gl.uniform1f(uniforms.uAspect, aspect);
			gl.uniform1f(uniforms.uHalfW, shape.halfW);
			gl.uniform1f(uniforms.uHalfH, shape.halfH);
			gl.uniform1f(uniforms.uInnerCornerRadius, shape.cornerRadius);
		} else if (shape.type === 'annulus') {
			gl.uniform1i(uniforms.uShapeType, 3);
			gl.uniform1f(uniforms.uRadius, shape.outerRadius);
			gl.uniform1f(uniforms.uInnerRadius, shape.innerRadius);
			gl.uniform1f(uniforms.uAspect, aspect);
		}
		return true;
	}

	private applyViscosity(dt: number): void {
		const iterations = this.config.VISCOSITY_ITERATIONS;
		if (this.config.VISCOSITY <= 0 || iterations <= 0) return;
		const gl = this.gl;

		this.copyProgram.bind();
		gl.uniform1i(this.copyProgram.uniforms.uTexture, this.velocity.read.attach(0));
		this.blit(this.velocitySource);

		this.viscosityProgram.bind();
		gl.uniform2f(this.viscosityProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
		gl.uniform1i(this.viscosityProgram.uniforms.uSource, this.velocitySource.attach(1));
		this.bindSolidMaskUniforms(this.viscosityProgram.uniforms, 2, 3);
		gl.uniform1f(
			this.viscosityProgram.uniforms.uAlpha,
			viscosityAlpha(this.config.VISCOSITY, dt, this.velocity.width, this.velocity.height)
		);
		// Mask samplers bind up front so their units never alias the velocity
		// FBO mid-loop; the crop itself applies only on the final iteration —
		// equivalent to the old single applyMask blit after the loop.
		const maskActive = this.bindInlineMaskUniforms(this.viscosityProgram.uniforms, 4, 5);
		gl.uniform1f(this.viscosityProgram.uniforms.uApplyInlineMask, 0.0);
		for (let i = 0; i < iterations; i++) {
			if (i === iterations - 1 && maskActive) {
				gl.uniform1f(this.viscosityProgram.uniforms.uApplyInlineMask, 1.0);
			}
			gl.uniform1i(this.viscosityProgram.uniforms.uVelocity, this.velocity.read.attach(0));
			this.blit(this.velocity.write);
			this.velocity.swap();
		}
	}

	private applyWallFriction(): void {
		if (this.config.WALL_FRICTION <= 0 || !this.solidMaskTexture) return;
		const gl = this.gl;
		this.wallFrictionProgram.bind();
		gl.uniform2f(this.wallFrictionProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
		gl.uniform1i(this.wallFrictionProgram.uniforms.uVelocity, this.velocity.read.attach(0));
		this.bindSolidMaskUniforms(this.wallFrictionProgram.uniforms, 1, 2);
		gl.uniform1f(this.wallFrictionProgram.uniforms.uWallFriction, this.config.WALL_FRICTION);
		gl.uniform1f(this.wallFrictionProgram.uniforms.uWallFrictionWidth, this.config.WALL_FRICTION_WIDTH);
		this.blit(this.velocity.write);
		this.velocity.swap();
	}

	private projectVelocity(): void {
		const gl = this.gl;
		this.divergenceProgram.bind();
		gl.uniform2f(this.divergenceProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
		gl.uniform1i(this.divergenceProgram.uniforms.uVelocity, this.velocity.read.attach(0));
		const edges = this.flowOpenEdges();
		gl.uniform4f(this.divergenceProgram.uniforms.uOpenEdges, edges[0], edges[1], edges[2], edges[3]);
		this.bindSolidMaskUniforms(this.divergenceProgram.uniforms, 2, 3);
		this.blit(this.divergence);

		const iterations = this.performancePressureIterations;
		if (iterations <= 0) {
			// Degenerate config: keep the old standalone warm-start decay so
			// stored pressure doesn't freeze at its last value forever.
			this.clearProgram.bind();
			gl.uniform1i(this.clearProgram.uniforms.uTexture, this.pressure.read.attach(0));
			gl.uniform1f(this.clearProgram.uniforms.value, this.config.PRESSURE);
			this.blit(this.pressure.write);
			this.pressure.swap();
		}

		// Jacobi runs as paired-iteration passes (two exact iterations per
		// blit — the loop is pass-count bound, see ADR-0038), plus one single
		// pass for an odd remainder. Warm start folds into the first inner
		// level: Jacobi reads the previous iterate only through neighbor
		// fetches, so scaling those by PRESSURE reproduces the old clear pass
		// without the extra blit.
		const stickyPressure = this.config.STICKY ? this.config.STICKY_PRESSURE : 0.0;
		// Paired Jacobi wins where passes are overhead-bound (small grids:
		// ~35% frame win across the production presets) and loses where they
		// are fragment-bound (the ~33-fetch inner stencil; measured slower at
		// 768-class grids). Crossover lies between 192- and 768-class grids;
		// the threshold stays conservative. Measurements in ADR-0038.
		const PAIRED_JACOBI_MAX_TEXELS = 150_000;
		const usePairs = this.velocity.width * this.velocity.height <= PAIRED_JACOBI_MAX_TEXELS;
		const pairs = usePairs ? Math.floor(iterations / 2) : 0;
		const singles = iterations - pairs * 2;
		if (pairs > 0) {
			this.pressureJacobi2Program.bind();
			gl.uniform2f(this.pressureJacobi2Program.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
			gl.uniform1i(this.pressureJacobi2Program.uniforms.uDivergence, this.divergence.attach(1));
			this.bindStickyMask();
			gl.uniform1i(this.pressureJacobi2Program.uniforms.uStickyMask, 7);
			this.bindSolidMaskUniforms(this.pressureJacobi2Program.uniforms, 2, 3);
			gl.uniform1f(this.pressureJacobi2Program.uniforms.uStickyPressure, stickyPressure);
			for (let k = 0; k < pairs; k++) {
				gl.uniform1f(this.pressureJacobi2Program.uniforms.uScaleInner, k === 0 ? this.config.PRESSURE : 1.0);
				gl.uniform1i(this.pressureJacobi2Program.uniforms.uPressure, this.pressure.read.attach(0));
				this.blit(this.pressure.write);
				this.pressure.swap();
			}
		}
		if (singles > 0) {
			this.pressureProgram.bind();
			gl.uniform2f(this.pressureProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
			gl.uniform1i(this.pressureProgram.uniforms.uDivergence, this.divergence.attach(1));
			this.bindStickyMask();
			gl.uniform1i(this.pressureProgram.uniforms.uStickyMask, 7);
			this.bindSolidMaskUniforms(this.pressureProgram.uniforms, 2, 3);
			gl.uniform1f(this.pressureProgram.uniforms.uStickyPressure, stickyPressure);
			for (let i = 0; i < singles; i++) {
				gl.uniform1f(
					this.pressureProgram.uniforms.uPressureScale,
					pairs === 0 && i === 0 ? this.config.PRESSURE : 1.0
				);
				gl.uniform1i(this.pressureProgram.uniforms.uPressure, this.pressure.read.attach(0));
				this.blit(this.pressure.write);
				this.pressure.swap();
			}
		}
		this.gradientSubtractProgram.bind();
		gl.uniform2f(this.gradientSubtractProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
		gl.uniform1i(this.gradientSubtractProgram.uniforms.uPressure, this.pressure.read.attach(0));
		gl.uniform1i(this.gradientSubtractProgram.uniforms.uVelocity, this.velocity.read.attach(1));
		this.bindSolidMaskUniforms(this.gradientSubtractProgram.uniforms, 2, 3);
		this.bindInlineMaskUniforms(this.gradientSubtractProgram.uniforms, 4, 5);
		this.blit(this.velocity.write);
		this.velocity.swap();
	}

	private step(dt: number): void {
		if (this.deterministicMode) {
			this.simTime += dt;
		}
		if (!this.solverMayContainContent) {
			if (!flowCanDriveSolver(this.config.FLOW)) return;
			this.solverMayContainContent = true;
		}
		const gl = this.gl;
		gl.disable(gl.BLEND);
		const prescribedOnly = this.flowMode() === 'prescribed';

		if (this.config.FLOW?.prescribed && this.flowMode() !== 'live') {
			this.applyPrescribedFields();
			if (this.shouldMaskPhysics()) this.applyMask(this.velocity);
		}

		this.applyFlowSources(dt, !prescribedOnly);
		if (!prescribedOnly) this.applyFlowForces(dt);
		if (!prescribedOnly) this.applyFlowOutlets(['velocity']);

		if (prescribedOnly) {
			const simulateDye = this.shouldSimulateDye();
			// Container/obstruction masking is folded into the advection
			// shader itself (epic 0001 1a) — no separate applyMask blits.
			if (simulateDye) {
				this.advectDye(dt);
			}
			this.advectScalar(dt);
			this.applyFlowOutlets(simulateDye ? ['dye', 'scalar'] : ['scalar']);
			return;
		}

		if (this.config.CURL > 0) {
			this.curlProgram.bind();
			gl.uniform2f(this.curlProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
			gl.uniform1i(this.curlProgram.uniforms.uVelocity, this.velocity.read.attach(0));
			this.blit(this.curlFBO);
			this.vorticityProgram.bind();
			gl.uniform2f(this.vorticityProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
			gl.uniform1i(this.vorticityProgram.uniforms.uVelocity, this.velocity.read.attach(0));
			gl.uniform1i(this.vorticityProgram.uniforms.uCurl, this.curlFBO.attach(1));
			gl.uniform1f(
				this.vorticityProgram.uniforms.curl,
				curlScale(this.config.CURL, this.velocity.width, this.velocity.height)
			);
			gl.uniform1f(this.vorticityProgram.uniforms.dt, dt);
			gl.uniform1f(this.vorticityProgram.uniforms.uAdaptiveMix, this.config.VORTICITY_ADAPTIVE);
			gl.uniform1f(
				this.vorticityProgram.uniforms.uVorticityScale,
				vorticityNormalizationScale(this.velocity.width, this.velocity.height)
			);
			this.bindSolidMaskUniforms(this.vorticityProgram.uniforms, 2, 3);
			this.blit(this.velocity.write);
			this.velocity.swap();
		}

		// Container/obstruction masking is folded into the advection,
		// viscosity (final iteration), and gradient-subtract shaders
		// (epic 0001 1a) — the old per-stage applyMask blits are gone.
		this.advectVelocity(dt);
		this.applyViscosity(dt);
		this.applyWallFriction();
		this.projectVelocity();

		const simulateDye = this.shouldSimulateDye();
		if (simulateDye) {
			this.advectDye(dt);
		}
		this.advectScalar(dt);
		this.applyFlowOutlets(simulateDye ? ['dye', 'scalar'] : ['scalar']);
	}

	private renderProfiled(target: FBO | null): void {
		const gl = this.gl;
		const hasDyeContent = this.shouldSimulateDye();
		if (this.config.BLOOM && hasDyeContent) {
			const bloom = this.requireOptionalFBO(this.bloom, 'bloom');
			this.profileGroup('bloom', () => this.applyBloom(this.dye.read, bloom));
		}
		if (this.config.SUNRAYS && hasDyeContent) {
			const sunrays = this.requireOptionalFBO(this.sunrays, 'sunrays');
			const sunraysTemp = this.requireOptionalFBO(this.sunraysTemp, 'sunrays temporary');
			this.profileGroup('sunrays', () => {
				this.applySunrays(this.dye.read, this.dye.write, sunrays);
				this.blur(sunrays, sunraysTemp, 1);
			});
		}

		if (this.config.DISTORTION || this.config.REVEAL) {
			gl.disable(gl.BLEND);
			this.profileGroup('display', () => this.drawDisplay(target));
			return;
		}

		const useGlass = this.config.GLASS && this.config.CONTAINER_SHAPE && this.sceneFBO;
		const displayTarget = useGlass ? this.sceneFBO! : target;
		gl.disable(gl.BLEND);
		if (this.config.TRANSPARENT) this.clearRenderTarget(displayTarget, 0, 0, 0, 0);
		this.profileGroup('display', () =>
			this.drawDisplay(displayTarget, this.config.TRANSPARENT ? null : this.normalizedBackColor)
		);
		if (useGlass) this.profileGroup('glass', () => this.drawGlass(target));
	}

	private renderCore(target: FBO | null): void {
		const gl = this.gl;

		const hasDyeContent = this.shouldSimulateDye();
		if (this.config.BLOOM && hasDyeContent) {
			this.applyBloom(this.dye.read, this.requireOptionalFBO(this.bloom, 'bloom'));
		}
		if (this.config.SUNRAYS && hasDyeContent) {
			const sunrays = this.requireOptionalFBO(this.sunrays, 'sunrays');
			const sunraysTemp = this.requireOptionalFBO(this.sunraysTemp, 'sunrays temporary');
			this.applySunrays(this.dye.read, this.dye.write, sunrays);
			this.blur(sunrays, sunraysTemp, 1);
		}

		// Distortion mode: image distorted by velocity, no background, no glass
		if (this.config.DISTORTION) {
			gl.disable(gl.BLEND);
			this.drawDisplay(target);
			return;
		}

		// Reveal mode: premultiplied alpha output, no background, no glass
		if (this.config.REVEAL) {
			gl.disable(gl.BLEND);
			this.drawDisplay(target);
			return;
		}

		// When glass is active, route the scene through sceneFBO first
		const useGlass = this.config.GLASS && this.config.CONTAINER_SHAPE && this.sceneFBO;
		const displayTarget = useGlass ? this.sceneFBO! : target;

		gl.disable(gl.BLEND);
		if (this.config.TRANSPARENT) {
			// Clear to transparent so the canvas composites cleanly with
			// whatever is behind it in the DOM stacking context.
			this.clearRenderTarget(displayTarget, 0, 0, 0, 0);
		}
		this.drawDisplay(displayTarget, this.config.TRANSPARENT ? null : this.normalizedBackColor);

		if (useGlass) {
			this.drawGlass(target);
		}
	}

	private clearRenderTarget(target: FBO | null, r: number, g: number, b: number, a: number): void {
		const gl = this.gl;
		if (target == null) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
		} else {
			gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
			gl.viewport(0, 0, target.width, target.height);
		}
		gl.clearColor(r, g, b, a);
		gl.clear(gl.COLOR_BUFFER_BIT);
	}

	private requireOptionalFBO(target: FBO | null, owner: string): FBO {
		if (!target) throw new Error(`svelte-fluid: ${owner} framebuffer invariant violated`);
		return target;
	}

	private drawDisplay(target: FBO | null, backgroundColor: RGB | null = null): void {
		const gl = this.gl;
		const width = target == null ? gl.drawingBufferWidth : target.width;
		const height = target == null ? gl.drawingBufferHeight : target.height;

		this.displayMaterial.bind();
		gl.uniform2f(this.displayMaterial.uniforms.texelSize, 1.0 / width, 1.0 / height);
		gl.uniform1f(this.displayMaterial.uniforms.uCompositeBackground, backgroundColor ? 1.0 : 0.0);
		const bg = backgroundColor ?? { r: 0, g: 0, b: 0 };
		gl.uniform3f(this.displayMaterial.uniforms.uBackColor, bg.r, bg.g, bg.b);
		gl.uniform1i(this.displayMaterial.uniforms.uTexture, this.dye.read.attach(0));
		gl.uniform1i(this.displayMaterial.uniforms.uHeightTexture, 0);
		gl.uniform2f(this.displayMaterial.uniforms.uHeightTexel, this.dye.texelSizeX, this.dye.texelSizeY);
		gl.uniform1f(this.displayMaterial.uniforms.uHeightAspect, this.canvas.width / this.canvas.height);
		gl.uniform1f(this.displayMaterial.uniforms.uSpecular, this.config.SPECULAR);
		gl.uniform1f(this.displayMaterial.uniforms.uRefraction, this.config.REFRACTION);
		// Every output mode dithers its final 8-bit write (ADR-0081).
		gl.uniform1i(this.displayMaterial.uniforms.uDithering, this.ditheringTexture.attach(2));
		const ditherScale = getTextureScale(this.ditheringTexture, width, height);
		gl.uniform2f(this.displayMaterial.uniforms.ditherScale, ditherScale.x, ditherScale.y);
		if (this.config.BLOOM) {
			gl.uniform1i(this.displayMaterial.uniforms.uBloom, this.requireOptionalFBO(this.bloom, 'bloom').attach(1));
		}
		if (this.config.SUNRAYS) {
			gl.uniform1i(this.displayMaterial.uniforms.uSunrays, this.requireOptionalFBO(this.sunrays, 'sunrays').attach(3));
		}
		if (this.config.CONTAINER_SHAPE) {
			this.setContainerShapeUniforms(this.displayMaterial.uniforms, width, height, 4);
		}
		// Obstruction mask on unit 6. Guarded by !DISTORTION because unit 6 is
		// distortion's velocity sampler; obstruction presets never use distortion.
		// The OBSTRUCTION_MASK keyword gates the sampler in the shader.
		if (!this.config.DISTORTION && this.obstructionMaskTexture) {
			gl.activeTexture(gl.TEXTURE6);
			gl.bindTexture(gl.TEXTURE_2D, this.obstructionMaskTexture);
			gl.uniform1i(this.displayMaterial.uniforms.uObstructionMask, 6);
			if (this.config.OBSTRUCTION_COLOR) {
				const oc = normalizeColor(this.config.OBSTRUCTION_COLOR);
				gl.uniform3f(this.displayMaterial.uniforms.uObstructionFillColor, oc.r, oc.g, oc.b);
			}
		}
		// MASK_SDF variants read the distance fields instead of the coverage
		// masks, so they take over units 4/6 (keeps the WebGL1 0–7 budget).
		// The scale converts mask texels to target pixels; masks follow the
		// canvas aspect, so one factor per mask serves both axes (ADR-0084).
		if (this.containerSdf && this.config.CONTAINER_SHAPE?.type === 'svgPath') {
			gl.uniform1i(this.displayMaterial.uniforms.uContainerSdf, this.containerSdf.attach(4));
		}
		if (!this.config.DISTORTION && this.obstructionSdf) {
			gl.uniform1i(this.displayMaterial.uniforms.uObstructionSdf, this.obstructionSdf.attach(6));
		}
		gl.uniform2f(
			this.displayMaterial.uniforms.uSdfScale,
			this.containerSdf ? width / this.containerSdf.width : 1,
			this.obstructionSdf ? width / this.obstructionSdf.width : 1
		);
		if (this.flowVisualizationActive()) {
			const mode = this.flowVisualizationMode();
			const primary =
				mode === 1 ? this.velocity.read : mode === 2 ? this.pressure.read : this.scalar?.read ?? this.dye.read;
			gl.uniform1i(this.displayMaterial.uniforms.uFlowPrimary, primary.attach(5));
			gl.uniform1i(this.displayMaterial.uniforms.uFlowVelocity, this.velocity.read.attach(7));
			gl.uniform1i(this.displayMaterial.uniforms.uFlowVisMode, mode);
			gl.uniform1i(
				this.displayMaterial.uniforms.uFlowScalarChannel,
				flowScalarChannel(this.config.FLOW?.visualization?.scalar, this.config.FLOW?.scalarFields)
			);
			gl.uniform1i(this.displayMaterial.uniforms.uFlowTransfer, this.flowTransferKind());
			const glowBy = this.config.FLOW?.visualization?.glowBy;
			gl.uniform1i(this.displayMaterial.uniforms.uFlowGlowMode, glowBy === 'speed' ? 1 : glowBy === 'scalar' ? 2 : 0);
			const visualizationRange = this.config.FLOW?.visualization?.range;
			gl.uniform1i(this.displayMaterial.uniforms.uFlowUseRange, visualizationRange || mode === 3 ? 1 : 0);
			gl.uniform1f(
				this.displayMaterial.uniforms.uFlowScale,
				this.config.FLOW?.visualization?.scale ??
					(visualizationRange ? 1.0 : mode === 1 ? 0.002 : mode === 2 ? 1.0 : 1.0)
			);
			const field = this.flowScalarField(this.config.FLOW?.visualization?.scalar);
			const range = visualizationRange ?? field?.range ?? [0, 1];
			const color = field?.color ?? { r: 1, g: 1, b: 1 };
			gl.uniform2f(this.displayMaterial.uniforms.uFlowScalarRange, range[0], range[1]);
			gl.uniform3f(this.displayMaterial.uniforms.uFlowScalarColor, color.r, color.g, color.b);
		}
		if (this.config.DISTORTION) {
			gl.activeTexture(gl.TEXTURE5);
			gl.bindTexture(gl.TEXTURE_2D, this.distortionTexture);
			gl.uniform1i(this.displayMaterial.uniforms.uDistortionTexture, 5);
			gl.uniform1i(this.displayMaterial.uniforms.uVelocity, this.velocity.read.attach(6));
			gl.uniform1f(this.displayMaterial.uniforms.uDistortionPower, this.config.DISTORTION_POWER);
			gl.uniform1f(this.displayMaterial.uniforms.uImgRatio, this.distortionImgRatio);
			gl.uniform1f(this.displayMaterial.uniforms.uCanvasRatio, this.canvas.width / this.canvas.height);
			gl.uniform1f(this.displayMaterial.uniforms.uDistortionScale, this.config.DISTORTION_SCALE);
			gl.uniform1i(this.displayMaterial.uniforms.uDistortionFit, this.config.DISTORTION_FIT === 'cover' ? 0 : 1);
			gl.uniform2f(
				this.displayMaterial.uniforms.uBleed,
				this.config.DISTORTION_BLEED_X,
				this.config.DISTORTION_BLEED_Y
			);
		} else if (this.config.REVEAL) {
			gl.uniform1f(this.displayMaterial.uniforms.uRevealSensitivity, this.config.REVEAL_SENSITIVITY);
			gl.uniform1f(this.displayMaterial.uniforms.uRevealCurve, this.config.REVEAL_CURVE);
			const cc = this.config.REVEAL_COVER_COLOR;
			gl.uniform3f(this.displayMaterial.uniforms.uRevealCoverColor, cc.r, cc.g, cc.b);
			const ac = this.config.REVEAL_ACCENT_COLOR;
			gl.uniform3f(this.displayMaterial.uniforms.uRevealAccentColor, ac.r, ac.g, ac.b);
			const fc = this.config.REVEAL_FRINGE_COLOR;
			gl.uniform3f(this.displayMaterial.uniforms.uRevealFringeColor, fc.r, fc.g, fc.b);
		}
		this.blit(target);
	}

	/**
	 * Set container shape uniforms on a program. Shared by drawDisplay and drawGlass.
	 * `maskUnit` is the texture unit to bind the svgPath mask texture to.
	 */
	private setContainerShapeUniforms(
		uniforms: Record<string, WebGLUniformLocation | null>,
		width: number,
		height: number,
		maskUnit: number
	): void {
		const gl = this.gl;
		const s = this.config.CONTAINER_SHAPE;
		if (!s) return;

		if (s.type === 'svgPath') {
			gl.uniform1i(uniforms.uContainerShapeType, 4);
			if (this.maskTexture) {
				gl.activeTexture(gl.TEXTURE0 + maskUnit);
				gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
				gl.uniform1i(uniforms.uContainerMaskTexture, maskUnit);
			}
		} else {
			gl.uniform2f(uniforms.uContainerCenter, s.cx, s.cy);
			if (s.type === 'circle') {
				gl.uniform1i(uniforms.uContainerShapeType, 0);
				gl.uniform1f(uniforms.uContainerRadius, s.radius);
				gl.uniform1f(uniforms.uContainerAspect, width / height);
			} else if (s.type === 'frame') {
				gl.uniform1i(uniforms.uContainerShapeType, 1);
				gl.uniform1f(uniforms.uContainerAspect, width / height);
				gl.uniform1f(uniforms.uContainerHalfW, s.halfW);
				gl.uniform1f(uniforms.uContainerHalfH, s.halfH);
				gl.uniform1f(uniforms.uContainerInnerCornerRadius, s.innerCornerRadius ?? 0);
				gl.uniform1f(uniforms.uContainerOuterHalfW, s.outerHalfW ?? 0.5);
				gl.uniform1f(uniforms.uContainerOuterHalfH, s.outerHalfH ?? 0.5);
				gl.uniform1f(uniforms.uContainerOuterCornerRadius, s.outerCornerRadius ?? 0);
			} else if (s.type === 'roundedRect') {
				gl.uniform1i(uniforms.uContainerShapeType, 2);
				gl.uniform1f(uniforms.uContainerAspect, width / height);
				gl.uniform1f(uniforms.uContainerHalfW, s.halfW);
				gl.uniform1f(uniforms.uContainerHalfH, s.halfH);
				gl.uniform1f(uniforms.uContainerInnerCornerRadius, s.cornerRadius);
			} else if (s.type === 'annulus') {
				gl.uniform1i(uniforms.uContainerShapeType, 3);
				gl.uniform1f(uniforms.uContainerRadius, s.outerRadius);
				gl.uniform1f(uniforms.uContainerInnerRadius, s.innerRadius);
				gl.uniform1f(uniforms.uContainerAspect, width / height);
			}
		}
	}

	/** Glass post-processing: reads sceneFBO, applies refraction + specular, writes to target. */
	private drawGlass(target: FBO | null): void {
		const gl = this.gl;
		const width = target == null ? gl.drawingBufferWidth : target.width;
		const height = target == null ? gl.drawingBufferHeight : target.height;

		gl.disable(gl.BLEND);
		this.glassProgram.bind();

		gl.uniform1i(this.glassProgram.uniforms.uScene, this.sceneFBO!.attach(0));
		gl.uniform1i(this.glassProgram.uniforms.uHeightTexture, this.dye.read.attach(3));
		gl.uniform2f(this.glassProgram.uniforms.uHeightTexel, this.dye.texelSizeX, this.dye.texelSizeY);
		gl.uniform1f(this.glassProgram.uniforms.uHeightAspect, this.canvas.width / this.canvas.height);
		gl.uniform1f(this.glassProgram.uniforms.uRefraction, this.config.REFRACTION);
		gl.uniform1f(this.glassProgram.uniforms.uGlassThickness, this.config.GLASS_THICKNESS);
		gl.uniform1f(this.glassProgram.uniforms.uGlassRefraction, this.config.GLASS_REFRACTION);
		gl.uniform1f(this.glassProgram.uniforms.uGlassReflectivity, this.config.GLASS_REFLECTIVITY);
		gl.uniform1f(this.glassProgram.uniforms.uGlassChromatic, this.config.GLASS_CHROMATIC);
		gl.uniform1f(this.glassProgram.uniforms.uTransparent, this.config.TRANSPARENT ? 1.0 : 0.0);

		const pointer = this.pointers[0];
		gl.uniform2f(this.glassProgram.uniforms.uLightScreenPos, pointer.texcoordX, pointer.texcoordY);

		// Container shape uniforms — mask texture on unit 1 (unit 0 = sceneFBO)
		this.setContainerShapeUniforms(this.glassProgram.uniforms, width, height, 1);

		// Obstruction mask on unit 2 (free in the glass pass): cut out a clean hole.
		const hasObstruction = !!this.obstructionMaskTexture;
		gl.uniform1f(this.glassProgram.uniforms.uHasObstruction, hasObstruction ? 1.0 : 0.0);
		if (hasObstruction) {
			gl.activeTexture(gl.TEXTURE2);
			gl.bindTexture(gl.TEXTURE_2D, this.obstructionMaskTexture);
			gl.uniform1i(this.glassProgram.uniforms.uObstructionMask, 2);
		}

		this.blit(target);
	}

	private applyBloom(source: FBO, destination: FBO): void {
		if (this.bloomFramebuffers.length < 2) return;

		const gl = this.gl;
		let last = destination;

		gl.disable(gl.BLEND);
		this.bloomPrefilterProgram.bind();
		const knee = this.config.BLOOM_THRESHOLD * this.config.BLOOM_SOFT_KNEE + 0.0001;
		const curve0 = this.config.BLOOM_THRESHOLD - knee;
		const curve1 = knee * 2;
		const curve2 = 0.25 / knee;
		gl.uniform3f(this.bloomPrefilterProgram.uniforms.curve, curve0, curve1, curve2);
		gl.uniform1f(this.bloomPrefilterProgram.uniforms.threshold, this.config.BLOOM_THRESHOLD);
		gl.uniform1i(this.bloomPrefilterProgram.uniforms.uTexture, source.attach(0));
		this.blit(last);

		this.bloomBlurProgram.bind();
		for (let i = 0; i < this.bloomFramebuffers.length; i++) {
			const dest = this.bloomFramebuffers[i];
			gl.uniform2f(this.bloomBlurProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
			gl.uniform1f(this.bloomBlurProgram.uniforms.uKaris, i === 0 ? 1 : 0);
			gl.uniform1i(this.bloomBlurProgram.uniforms.uTexture, last.attach(0));
			this.blit(dest);
			last = dest;
		}

		gl.uniform1f(this.bloomBlurProgram.uniforms.uKaris, 0);
		gl.blendFunc(gl.ONE, gl.ONE);
		gl.enable(gl.BLEND);

		for (let i = this.bloomFramebuffers.length - 2; i >= 0; i--) {
			const baseTex = this.bloomFramebuffers[i];
			gl.uniform2f(this.bloomBlurProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
			gl.uniform1i(this.bloomBlurProgram.uniforms.uTexture, last.attach(0));
			gl.viewport(0, 0, baseTex.width, baseTex.height);
			this.blit(baseTex);
			last = baseTex;
		}

		gl.disable(gl.BLEND);
		this.bloomFinalProgram.bind();
		gl.uniform2f(this.bloomFinalProgram.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
		gl.uniform1i(this.bloomFinalProgram.uniforms.uTexture, last.attach(0));
		gl.uniform1f(this.bloomFinalProgram.uniforms.intensity, this.config.BLOOM_INTENSITY);
		this.blit(destination);
	}

	private applySunrays(source: FBO, mask: FBO, destination: FBO): void {
		const gl = this.gl;
		gl.disable(gl.BLEND);
		this.sunraysMaskProgram.bind();
		gl.uniform1i(this.sunraysMaskProgram.uniforms.uTexture, source.attach(0));
		this.blit(mask);

		this.sunraysProgram.bind();
		gl.uniform1f(this.sunraysProgram.uniforms.weight, this.config.SUNRAYS_WEIGHT);
		gl.uniform1i(this.sunraysProgram.uniforms.uTexture, mask.attach(0));
		this.blit(destination);
	}

	private blur(target: FBO, temp: FBO, iterations: number): void {
		const gl = this.gl;
		this.blurProgram.bind();
		for (let i = 0; i < iterations; i++) {
			gl.uniform2f(this.blurProgram.uniforms.texelSize, target.texelSizeX, 0.0);
			gl.uniform1i(this.blurProgram.uniforms.uTexture, target.attach(0));
			this.blit(temp);

			gl.uniform2f(this.blurProgram.uniforms.texelSize, 0.0, target.texelSizeY);
			gl.uniform1i(this.blurProgram.uniforms.uTexture, temp.attach(0));
			this.blit(target);
		}
	}

	private splatPointer(pointer: Pointer): void {
		const force = this.config.SPLAT_FORCE * pointer.pressureScale;
		const s = pointer.samples;
		for (let i = 0; i < pointer.sampleCount; i++) {
			this.splat(s[4 * i], s[4 * i + 1], s[4 * i + 2] * force, s[4 * i + 3] * force, pointer.color);
		}
		pointer.sampleCount = 0;
	}

	/** Build a MaskContext for CPU-side mask sampling, or undefined if N/A. */
	private getMaskCtx(): MaskContext | undefined {
		if (!this.maskData) return undefined;
		return { data: this.maskData, width: this.maskW, height: this.maskH };
	}

	/** Build a MaskContext for CPU-side obstruction sampling, or undefined if N/A. */
	private getObstructionCtx(): MaskContext | undefined {
		if (!this.obstructionMaskData) return undefined;
		return {
			data: this.obstructionMaskData,
			width: this.obstructionMaskW,
			height: this.obstructionMaskH
		};
	}

	private hdrMultiplier(): number {
		const shape = this.config.CONTAINER_SHAPE;
		if (!shape) return 10.0;
		// Radii are height-normalized, so circular areas in UV space must be
		// divided by the aspect ratio to account for the non-square UV domain.
		const aspect = this.gl.drawingBufferWidth / this.gl.drawingBufferHeight;
		// Approximate area fraction of the container vs full canvas
		let areaFraction = 1.0;
		if (shape.type === 'circle') {
			areaFraction = (Math.PI * shape.radius * shape.radius) / aspect;
		} else if (shape.type === 'frame') {
			const outerArea = 2 * (shape.outerHalfW ?? 0.5) * (2 * (shape.outerHalfH ?? 0.5));
			const innerArea = 2 * shape.halfW * (2 * shape.halfH);
			areaFraction = Math.max(0, outerArea - innerArea);
		} else if (shape.type === 'roundedRect') {
			areaFraction = 2 * shape.halfW * (2 * shape.halfH);
		} else if (shape.type === 'annulus') {
			areaFraction = (Math.PI * Math.max(0, shape.outerRadius ** 2 - shape.innerRadius ** 2)) / aspect;
		} else if (shape.type === 'svgPath') {
			areaFraction = this.maskAreaFractionCache;
		}
		// Scale the 10x base by area fraction, clamped to reasonable range
		return Math.max(3.0, 10.0 * Math.sqrt(areaFraction));
	}

	private multipleSplats(amount: number): void {
		const hdr = this.hdrMultiplier();
		const shape = this.config.CONTAINER_SHAPE;
		const aspect = this.gl.drawingBufferWidth / this.gl.drawingBufferHeight;
		for (let i = 0; i < amount; i++) {
			const color = generateColor(this.rng);
			color.r *= hdr;
			color.g *= hdr;
			color.b *= hdr;
			let x = this.rng();
			let y = this.rng();
			if (shape || this.config.OBSTRUCTIONS) {
				const mc = this.getMaskCtx();
				const octx = this.getObstructionCtx();
				const rejected = (xx: number, yy: number) =>
					(shape ? containerMask(shape, xx, yy, aspect, mc) < 0.5 : false) || obstructionMask(xx, yy, octx) >= 0.5;
				// Opening splats run once, so afford more tries than per-frame auto
				// splats: 10 dropped the only splat for ~4% of seeds in small shapes.
				let attempts = 64;
				while (attempts > 0 && rejected(x, y)) {
					x = this.rng();
					y = this.rng();
					attempts--;
				}
				if (attempts === 0) continue;
			}
			const dx = 1000 * (this.rng() - 0.5);
			const dy = 1000 * (this.rng() - 0.5);
			this.splat(x, y, dx, dy, color);
		}
	}

	private initialRandomSplatCount(): number {
		const lo = this.config.INITIAL_SPLAT_MIN;
		const hi = this.config.INITIAL_SPLAT_MAX;
		if (lo === hi) return lo;
		return Math.floor(this.rng() * (hi - lo + 1)) + lo;
	}

	/* ---------------------------------------------------------------------- */
	/*                              Pointer events                            */
	/* ---------------------------------------------------------------------- */

	private installedPointerTarget: EventTarget | null = null;
	private installedTouchAction: string | null = null;
	private pointerSlots = new PointerSlots();
	private capturedPointers = new Set<number>();

	private installPointerListeners(): void {
		if (this.pointerListenersInstalled) return;
		const useWindow = this.config.POINTER_TARGET === 'window';
		const target: EventTarget = useWindow ? window : this.canvas;
		this.installedPointerTarget = target;

		target.addEventListener('pointerdown', this.onPointerDown as EventListener);
		target.addEventListener('pointermove', this.onPointerMove as EventListener);
		if (!useWindow) this.canvas.addEventListener('pointerleave', this.onPointerLeave as EventListener);
		// Window-level so a release outside the canvas still ends the stroke.
		window.addEventListener('pointerup', this.onPointerUp as EventListener);
		window.addEventListener('pointercancel', this.onPointerUp as EventListener);
		// ADR 0083: only a canvas that owns drags blocks touch scrolling.
		if (!useWindow && this.canvas.style) {
			this.installedTouchAction = this.canvas.style.touchAction;
			this.canvas.style.touchAction = 'none';
		}
		this.pointerListenersInstalled = true;
	}

	private removePointerListeners(): void {
		if (!this.pointerListenersInstalled) return;
		const target = this.installedPointerTarget ?? this.canvas;

		target.removeEventListener('pointerdown', this.onPointerDown as EventListener);
		target.removeEventListener('pointermove', this.onPointerMove as EventListener);
		this.canvas.removeEventListener('pointerleave', this.onPointerLeave as EventListener);
		window.removeEventListener('pointerup', this.onPointerUp as EventListener);
		window.removeEventListener('pointercancel', this.onPointerUp as EventListener);
		if (this.installedTouchAction !== null) {
			this.canvas.style.touchAction = this.installedTouchAction;
			this.installedTouchAction = null;
		}
		for (const id of this.capturedPointers) {
			try {
				this.canvas.releasePointerCapture(id);
			} catch {
				// Already released.
			}
		}
		this.capturedPointers.clear();
		this.pointerSlots.clear();
		// Drain in-flight state so a half-press can't keep splatting.
		for (const p of this.pointers) {
			p.down = false;
			p.moved = false;
			p.sampleCount = 0;
		}
		this.installedPointerTarget = null;
		this.pointerListenersInstalled = false;
	}

	private getCanvasOffset(clientX: number, clientY: number): { x: number; y: number } {
		const rect = this.canvas.getBoundingClientRect();
		return {
			x: scaleByPixelRatio(clientX - rect.left),
			y: scaleByPixelRatio(clientY - rect.top)
		};
	}

	/** Backbuffer position, clamped near the canvas; null for non-finite input. */
	private pointerCanvasPos(clientX: number, clientY: number): { x: number; y: number } | null {
		const { x, y } = this.getCanvasOffset(clientX, clientY);
		const cx = clampToCanvas(x, this.canvas.width);
		const cy = clampToCanvas(y, this.canvas.height);
		return cx === null || cy === null ? null : { x: cx, y: cy };
	}

	private pointerFor(slot: number): Pointer {
		while (this.pointers.length <= slot) this.pointers.push(createPointer());
		return this.pointers[slot];
	}

	private handlePointerDown(e: PointerEvent): void {
		const slot = this.pointerSlots.slotFor(e.pointerId, e.pointerType, true);
		if (slot < 0) return;
		const pos = this.pointerCanvasPos(e.clientX, e.clientY);
		if (!pos) return;
		const { x, y } = pos;
		const pointer = this.pointerFor(slot);
		updatePointerDownData(pointer, e.pointerId, x, y, this.canvas.width, this.canvas.height, generateColor(this.rng));
		pointer.pressureScale = pressureScale(e.pointerType, e.pressure);
		// Canvas target: keep the stroke alive after the pointer leaves the canvas.
		if (this.config.POINTER_TARGET !== 'window') {
			try {
				this.canvas.setPointerCapture(e.pointerId);
				this.capturedPointers.add(e.pointerId);
			} catch {
				// Unsupported or already-ended pointer; stroke just stops at the edge.
			}
		}
	}

	private handlePointerMove(e: PointerEvent): void {
		const slot = this.pointerSlots.slotFor(e.pointerId, e.pointerType, false);
		if (slot < 0) return;
		const pointer = this.pointers[slot];
		if (!pointer) return;
		if (!pointer.down) {
			// Hover never applies to touch (slotFor only returns slot 0 for mouse/pen).
			if (!this.config.SPLAT_ON_HOVER || e.pointerType === 'touch') return;
			const pos = this.pointerCanvasPos(e.clientX, e.clientY);
			if (!pos) return;
			const { x, y } = pos;
			// First move seeds the position; later moves produce deltas.
			updatePointerDownData(pointer, e.pointerId, x, y, this.canvas.width, this.canvas.height, generateColor(this.rng));
			return;
		}
		pointer.pressureScale = pressureScale(e.pointerType, e.pressure);
		const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
		const events: readonly PointerEvent[] = coalesced.length
			? boundCoalesced(coalesced, MAX_COALESCED_PER_EVENT)
			: [e];
		for (const ev of events) {
			const pos = this.pointerCanvasPos(ev.clientX, ev.clientY);
			if (!pos) continue;
			recordPointerMove(pointer, pos.x, pos.y, this.canvas.width, this.canvas.height);
		}
	}

	private handlePointerUp(e: PointerEvent): void {
		const slot = this.pointerSlots.slotFor(e.pointerId, e.pointerType, false);
		this.pointerSlots.release(e.pointerId);
		this.capturedPointers.delete(e.pointerId);
		if (slot < 0) return;
		const pointer = this.pointers[slot];
		if (pointer) updatePointerUpData(pointer);
	}

	private handlePointerLeave(e: PointerEvent): void {
		// End the hover-splat stream when the cursor leaves the canvas so
		// re-entering doesn't stretch a splat across the gap. A captured
		// (pressed) stroke continues until release.
		if (!this.config.SPLAT_ON_HOVER || e.pointerType === 'touch') return;
		if (this.capturedPointers.has(e.pointerId)) return;
		const pointer = this.pointers[0];
		if (pointer) updatePointerUpData(pointer);
	}
}
