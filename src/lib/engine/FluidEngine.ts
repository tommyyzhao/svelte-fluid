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
 *  - WebGL context, framebuffers, programs, listener set, RAF loop, RNG and
 *    pointer state are all owned by the instance and freed by `dispose()`.
 *  - The Svelte component is responsible for sizing the canvas backbuffer
 *    BEFORE constructing the engine. The engine never resizes itself.
 *  - All randomness is routed through a seeded RNG so resizing produces the
 *    same initial splat pattern.
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
	PrescribedFlowField,
	ResolvedConfig,
	RGB
} from './types.js';
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
	createPointer,
	updatePointerDownData,
	updatePointerMoveData,
	updatePointerUpData
} from './pointer.js';
import { type Rng, generateColor, mulberry32, normalizeColor, randomSeed } from './rng.js';
import {
	containerShapeEqual,
	stickyMaskEqual,
	containerMask,
	maskAreaFraction,
	obstructionsEqual,
	obstructionMask,
	bakeSolidNeighborData,
	type MaskContext
} from './container-shapes.js';
import * as S from './shaders.js';

const FLOW_SOURCE_BATCH_SIZE = 4;
const FLOW_OUTLET_BATCH_SIZE = 4;

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
	MAX_TIME_STEP: 1 / 60,
	SUBSTEPS: 1,
	VISCOSITY: 0,
	VISCOSITY_ITERATIONS: 8,
	WALL_FRICTION: 0,
	WALL_FRICTION_WIDTH: 1,
	PRESSURE: 0.8,
	PRESSURE_ITERATIONS: 20,
	CURL: 30,
	SPLAT_RADIUS: 0.25,
	SPLAT_FORCE: 6000,
	SHADING: true,
	COLORFUL: true,
	COLOR_UPDATE_SPEED: 10,
	PAUSED: false,
	BACK_COLOR: { r: 0, g: 0, b: 0 },
	TRANSPARENT: false,
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
	if (input.curl !== undefined) out.CURL = input.curl;
	if (input.splatRadius !== undefined) out.SPLAT_RADIUS = input.splatRadius;
	if (input.splatForce !== undefined) out.SPLAT_FORCE = input.splatForce;
	if (input.shading !== undefined) out.SHADING = input.shading;
	if (input.colorful !== undefined) out.COLORFUL = input.colorful;
	if (input.colorUpdateSpeed !== undefined) out.COLOR_UPDATE_SPEED = input.colorUpdateSpeed;
	if (input.paused !== undefined) out.PAUSED = input.paused;
	if (input.backColor !== undefined) out.BACK_COLOR = input.backColor;
	if (input.transparent !== undefined) out.TRANSPARENT = input.transparent;
	if (input.bloom !== undefined) out.BLOOM = input.bloom;
	if (input.bloomIterations !== undefined) out.BLOOM_ITERATIONS = input.bloomIterations;
	if (input.bloomResolution !== undefined) out.BLOOM_RESOLUTION = input.bloomResolution;
	if (input.bloomIntensity !== undefined) out.BLOOM_INTENSITY = input.bloomIntensity;
	if (input.bloomThreshold !== undefined) out.BLOOM_THRESHOLD = input.bloomThreshold;
	if (input.bloomSoftKnee !== undefined) out.BLOOM_SOFT_KNEE = input.bloomSoftKnee;
	if (input.sunrays !== undefined) out.SUNRAYS = input.sunrays;
	if (input.sunraysResolution !== undefined) out.SUNRAYS_RESOLUTION = input.sunraysResolution;
	if (input.sunraysWeight !== undefined) out.SUNRAYS_WEIGHT = input.sunraysWeight;
	if (input.initialSplatCountMin !== undefined) out.INITIAL_SPLAT_MIN = input.initialSplatCountMin;
	if (input.initialSplatCountMax !== undefined) out.INITIAL_SPLAT_MAX = input.initialSplatCountMax;
	if (input.initialSplatCount !== undefined) {
		out.INITIAL_SPLAT_MIN = input.initialSplatCount;
		out.INITIAL_SPLAT_MAX = input.initialSplatCount;
	}
	if (input.pointerInput !== undefined) out.POINTER_INPUT = input.pointerInput;
	if (input.pointerTarget !== undefined) out.POINTER_TARGET = input.pointerTarget;
	if (input.splatOnHover !== undefined) out.SPLAT_ON_HOVER = input.splatOnHover;
	if (input.seed !== undefined) out.SEED = input.seed >>> 0;
	if (input.autoSplatRate !== undefined) out.AUTO_SPLAT_RATE = input.autoSplatRate;
	if (input.autoSplatCount !== undefined) out.AUTO_SPLAT_COUNT = input.autoSplatCount;
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

/* -------------------------------------------------------------------------- */
/*                                FluidEngine                                 */
/* -------------------------------------------------------------------------- */

export interface FluidEngineOptions {
	canvas: HTMLCanvasElement;
	config?: FluidConfig;
}

export class FluidEngine implements FluidHandle {
	// --- Owned references ---
	private canvas: HTMLCanvasElement;
	private gl!: GL;
	private ext!: ExtInfo;
	private config: ResolvedConfig;
	private rng: Rng;

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
	private checkerboardProgram!: ProgramWrap;
	private bloomPrefilterProgram!: ProgramWrap;
	private bloomBlurProgram!: ProgramWrap;
	private bloomFinalProgram!: ProgramWrap;
	private sunraysMaskProgram!: ProgramWrap;
	private sunraysProgram!: ProgramWrap;
	private splatProgram!: ProgramWrap;
	private advectionProgram!: ProgramWrap;
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

	// --- Sticky mask texture ---
	private stickyMaskTexture: WebGLTexture | null = null;
	private stickyFallbackTexture: WebGLTexture | null = null;

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

	// --- Framebuffers ---
	private dye!: DoubleFBO;
	private velocity!: DoubleFBO;
	private velocitySource!: FBO;
	private divergence!: FBO;
	private curlFBO!: FBO;
	private pressure!: DoubleFBO;
	private scalar: DoubleFBO | null = null;
	private bloom!: FBO;
	private bloomFramebuffers: FBO[] = [];
	private sunrays!: FBO;
	private sunraysTemp!: FBO;
	private sceneFBO: FBO | null = null;
	private ditheringTexture!: DitheringTexture;

	// --- Runtime state ---
	private pointers: Pointer[] = [createPointer()];
	private splatStack: number[] = [];
	private lastUpdateTime = 0;
	private engineStartTime = 0;
	private colorUpdateTimer = 0;
	private autoSplatTimer = 0;
	private rafId = 0;
	private disposed = false;
	private pointerListenersInstalled = false;
	private rafRunning = false;
	private normalizedBackColor: RGB = { r: 0, g: 0, b: 0 };
	private contextLost = false;
	private dyeMayContainContent = false;
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
	private flowOutletBatchKeep = new Float32Array(FLOW_OUTLET_BATCH_SIZE);

	// --- Bound listeners ---
	private onMouseDown = (e: MouseEvent) => this.handleMouseDown(e);
	private onMouseMove = (e: MouseEvent) => this.handleMouseMove(e);
	private onMouseUp = () => this.handleMouseUp();
	private onMouseLeave = () => this.handleMouseLeave();
	private onTouchStart = (e: TouchEvent) => this.handleTouchStart(e);
	private onTouchMove = (e: TouchEvent) => this.handleTouchMove(e);
	private onTouchEnd = (e: TouchEvent) => this.handleTouchEnd(e);
	private onContextLost = (e: Event) => this.handleContextLost(e);
	private onContextRestored = () => this.handleContextRestored();
	private tick = () => this.update();

	constructor(opts: FluidEngineOptions) {
		this.canvas = opts.canvas;
		const seed = opts.config?.seed ?? randomSeed();
		this.config = resolveConfig({ ...opts.config, seed }, DEFAULTS);
		this.normalizedBackColor = normalizeColor(this.config.BACK_COLOR);
		this.rng = mulberry32(this.config.SEED);

		this.initContext();
		this.compileShaders();
		this.initBuffersAndPrograms();
		this.ditheringTexture = createDitheringTexture(this.gl);

		this.initDistortionFallback();
		this.updateKeywords();
		this.initFramebuffers();
		this.initMaskTexture();
		this.initStickyMaskTexture();
		this.initObstructionMaskTexture();
		this.initSolidMaskTexture();
		this.initPrescribedGridTextures();
		this.initGlassFramebuffer();
		if (this.config.DISTORTION_IMAGE_URL) {
			this.loadDistortionImage(this.config.DISTORTION_IMAGE_URL);
		}
		this.dyeMayContainContent = false;
		this.multipleSplats(this.initialRandomSplatCount());

		// Construct-only preset splats. Applied after the random initial
		// splats so wrappers can either combine with or suppress them
		// (via `initialSplatCount: 0`). Read directly from the raw input
		// config because this field is intentionally absent from
		// `ResolvedConfig` — it has no meaning after construction.
		const presetSplats = opts.config?.presetSplats;
		if (presetSplats) {
			for (const s of presetSplats) {
				this.splat(s.x, s.y, s.dx, s.dy, s.color);
			}
		}

		if (this.config.POINTER_INPUT) {
			this.installPointerListeners();
		}

		this.canvas.addEventListener('webglcontextlost', this.onContextLost);
		this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);

		this.lastUpdateTime = performance.now();
		this.engineStartTime = this.lastUpdateTime;
		this.startRaf();
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
		const elapsed = (performance.now() - this.engineStartTime) / 1000;
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
		if (this.contextLost) return;
		const radius = this.config.SPLAT_RADIUS / 100.0;
		this.splatTo(this.velocity, x, y, { r: dx, g: dy, b: 0 }, radius, 0);
		this.dyeMayContainContent = true;
		this.splatTo(this.dye, x, y, color, radius, this.config.STICKY ? this.config.STICKY_AMPLIFY : 0);
	}

	randomSplats(count: number): void {
		this.splatStack.push(count);
	}

	/** Stop the animation loop. The GL context stays alive. Idempotent. */
	pause(): void {
		if (!this.rafRunning || this.disposed) return;
		cancelAnimationFrame(this.rafId);
		this.rafRunning = false;
	}

	/** Restart the animation loop after a pause. Idempotent. */
	resume(): void {
		if (this.rafRunning || this.disposed || this.contextLost) return;
		this.lastUpdateTime = performance.now();
		this.startRaf();
	}

	get isPaused(): boolean {
		return !this.rafRunning;
	}

	/**
	 * Hot-update a subset of config fields. Uses a 4-bucket strategy:
	 *   A — scalar/boolean assignment, picked up next frame.
	 *       Includes `pointerInput`, which also installs/removes the
	 *       canvas + window event listeners on transition.
	 *   B — display shader keyword recompile (shading, bloom, sunrays)
	 *   C — FBO rebuild (sim/dye/bloom/sunrays resolutions)
	 *   D — construct-only — `seed`, `initialSplatCount*`, `presetSplats`.
	 *       These are silently ignored: `seed` and `initialSplatCount*`
	 *       only affect the first frame, and `presetSplats` is absent
	 *       from `ResolvedConfig` entirely.
	 */
	setConfig(patch: FluidConfig): void {
		if (this.disposed || this.contextLost) return;
		const next = resolveConfig(patch, this.config);
		const a = this.config;
		const b = next;

		const fbChanged = a.SIM_RESOLUTION !== b.SIM_RESOLUTION || a.DYE_RESOLUTION !== b.DYE_RESOLUTION;
		const bloomChanged = a.BLOOM_RESOLUTION !== b.BLOOM_RESOLUTION || a.BLOOM_ITERATIONS !== b.BLOOM_ITERATIONS;
		const sunraysChanged = a.SUNRAYS_RESOLUTION !== b.SUNRAYS_RESOLUTION;
		const kwChanged = a.SHADING !== b.SHADING || a.BLOOM !== b.BLOOM || a.SUNRAYS !== b.SUNRAYS;
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
		const pointerInputChanged = a.POINTER_INPUT !== b.POINTER_INPUT;
		const pointerTargetChanged = a.POINTER_TARGET !== b.POINTER_TARGET;

		this.config = b;
		if (a.BACK_COLOR !== b.BACK_COLOR) {
			this.normalizedBackColor = normalizeColor(b.BACK_COLOR);
		}

		if (fbChanged || scalarNeedChanged) this.initFramebuffers();
		if (bloomChanged) this.initBloomFramebuffers();
		if (sunraysChanged) this.initSunraysFramebuffers();
		if (shapeChanged) this.initMaskTexture();
		if (obstructionsChanged) this.initObstructionMaskTexture();
		if (shapeChanged || obstructionsChanged || openBoundaryChanged) this.initSolidMaskTexture();
		if (flowChanged) this.initPrescribedGridTextures();
		if (glassChanged) this.initGlassFramebuffer();
		if (
			kwChanged ||
			shapeChanged ||
			revealChanged ||
			distortionChanged ||
			obstructionsChanged ||
			obstructionColorChanged ||
			flowChanged
		)
			this.updateKeywords();
		if (stickyChanged || stickyMaskChanged) this.initStickyMaskTexture();
		if (distortionImageChanged) this.loadDistortionImage(b.DISTORTION_IMAGE_URL);
		if (pointerInputChanged || pointerTargetChanged) {
			// Reinstall listeners when input toggles or target changes
			this.removePointerListeners();
			if (b.POINTER_INPUT) {
				this.installPointerListeners();
			} else {
				// Drain in-flight pointer state so a half-press
				// doesn't keep emitting splats after listeners are gone.
				for (const p of this.pointers) {
					p.down = false;
					p.moved = false;
				}
			}
		}
	}

	/* ---------------------------------------------------------------------- */
	/*                         RAF + context loss                             */
	/* ---------------------------------------------------------------------- */

	private startRaf(): void {
		if (this.rafRunning) return;
		this.rafRunning = true;
		this.rafId = requestAnimationFrame(this.tick);
	}

	private handleContextLost(e: Event): void {
		e.preventDefault(); // Signals to the browser we intend to restore
		this.contextLost = true;
		cancelAnimationFrame(this.rafId);
		this.rafRunning = false;
	}

	private handleContextRestored(): void {
		this.contextLost = false;
		// Full reinit — the GL state is wiped on context loss.
		this.initContext();
		this.compileShaders();
		this.initBuffersAndPrograms();
		this.ditheringTexture.dispose(); // prevent stale image.onload from touching the new context
		this.ditheringTexture = createDitheringTexture(this.gl);
		this.distortionTexture = null;
		this.distortionLoadedUrl = null;
		this.initDistortionFallback();
		this.updateKeywords();
		this.initFramebuffers();
		this.initMaskTexture();
		this.initStickyMaskTexture();
		this.initObstructionMaskTexture();
		this.initSolidMaskTexture();
		this.initPrescribedGridTextures();
		this.initGlassFramebuffer();
		// Re-load distortion image (GL texture was lost with context)
		if (this.config.DISTORTION_IMAGE_URL) {
			this.loadDistortionImage(this.config.DISTORTION_IMAGE_URL);
		}
		this.dyeMayContainContent = false;
		this.multipleSplats(this.initialRandomSplatCount());
		if (this.config.POINTER_INPUT && !this.pointerListenersInstalled) {
			this.installPointerListeners();
		}
		this.lastUpdateTime = performance.now();
		this.startRaf();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;

		cancelAnimationFrame(this.rafId);
		this.rafRunning = false;

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
		disposeFBO(gl, this.bloom);
		for (const fbo of this.bloomFramebuffers) disposeFBO(gl, fbo);
		this.bloomFramebuffers = [];
		disposeFBO(gl, this.sunrays);
		disposeFBO(gl, this.sunraysTemp);
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

		// Mask texture
		if (this.maskTexture) {
			gl.deleteTexture(this.maskTexture);
			this.maskTexture = null;
			this.maskData = null;
		}

		// Sticky mask texture
		if (this.stickyMaskTexture) {
			gl.deleteTexture(this.stickyMaskTexture);
			this.stickyMaskTexture = null;
		}
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

		if (this.prescribedVelocityTexture) {
			gl.deleteTexture(this.prescribedVelocityTexture);
			this.prescribedVelocityTexture = null;
		}
		if (this.prescribedScalarTexture) {
			gl.deleteTexture(this.prescribedScalarTexture);
			this.prescribedScalarTexture = null;
		}

		// Programs
		const programs: ProgramWrap[] = [
			this.blurProgram,
			this.copyProgram,
			this.clearProgram,
			this.checkerboardProgram,
			this.bloomPrefilterProgram,
			this.bloomBlurProgram,
			this.bloomFinalProgram,
			this.sunraysMaskProgram,
			this.sunraysProgram,
			this.splatProgram,
			this.advectionProgram,
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
		];
		for (const p of programs) gl.deleteProgram(p.program);
		this.displayMaterial.dispose();

		// Shaders
		gl.deleteShader(this.baseVertexShader);
		gl.deleteShader(this.blurVertexShader);
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
		const { gl, ext } = getWebGLContext(this.canvas);
		this.gl = gl;
		this.ext = ext;

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

	private compileShaders(): void {
		// On context restore the old shader handles are stale (driver already
		// freed them). Reset the accumulator so dispose() only sees live handles.
		this.fragmentShaders = [];

		const gl = this.gl;

		this.baseVertexShader = compileShader(gl, gl.VERTEX_SHADER, S.baseVertexShader);
		this.blurVertexShader = compileShader(gl, gl.VERTEX_SHADER, S.blurVertexShader);

		const advectionKeywords = this.ext.supportLinearFiltering ? null : ['MANUAL_FILTERING'];

		const fragments: Record<string, WebGLShader> = {
			blur: compileShader(gl, gl.FRAGMENT_SHADER, S.blurShader),
			copy: compileShader(gl, gl.FRAGMENT_SHADER, S.copyShader),
			clear: compileShader(gl, gl.FRAGMENT_SHADER, S.clearShader),
			checkerboard: compileShader(gl, gl.FRAGMENT_SHADER, S.checkerboardShader),
			bloomPrefilter: compileShader(gl, gl.FRAGMENT_SHADER, S.bloomPrefilterShader),
			bloomBlur: compileShader(gl, gl.FRAGMENT_SHADER, S.bloomBlurShader),
			bloomFinal: compileShader(gl, gl.FRAGMENT_SHADER, S.bloomFinalShader),
			sunraysMask: compileShader(gl, gl.FRAGMENT_SHADER, S.sunraysMaskShader),
			sunrays: compileShader(gl, gl.FRAGMENT_SHADER, S.sunraysShader),
			splat: compileShader(gl, gl.FRAGMENT_SHADER, S.splatShader),
			advection: compileShader(gl, gl.FRAGMENT_SHADER, S.advectionShader, advectionKeywords),
			divergence: compileShader(gl, gl.FRAGMENT_SHADER, S.divergenceShader),
			curl: compileShader(gl, gl.FRAGMENT_SHADER, S.curlShader),
			vorticity: compileShader(gl, gl.FRAGMENT_SHADER, S.vorticityShader),
			viscosity: compileShader(gl, gl.FRAGMENT_SHADER, S.viscosityShader),
			wallFriction: compileShader(gl, gl.FRAGMENT_SHADER, S.wallFrictionShader),
			pressure: compileShader(gl, gl.FRAGMENT_SHADER, S.pressureShader),
			pressureJacobi2: compileShader(gl, gl.FRAGMENT_SHADER, S.pressureJacobi2Shader),
			gradientSubtract: compileShader(gl, gl.FRAGMENT_SHADER, S.gradientSubtractShader),
			flowSource: compileShader(gl, gl.FRAGMENT_SHADER, S.flowSourceShader),
			flowOutlet: compileShader(gl, gl.FRAGMENT_SHADER, S.flowOutletShader),
			flowForce: compileShader(gl, gl.FRAGMENT_SHADER, S.flowForceShader),
			prescribedField: compileShader(gl, gl.FRAGMENT_SHADER, S.prescribedFieldShader),
			applyMask: compileShader(gl, gl.FRAGMENT_SHADER, S.applyMaskShader),
			glass: compileShader(gl, gl.FRAGMENT_SHADER, S.glassShaderSource)
		};

		for (const f of Object.values(fragments)) this.fragmentShaders.push(f);

		// Stash for use during program creation
		this._fragmentShadersByName = fragments;
	}

	private _fragmentShadersByName!: Record<string, WebGLShader>;

	private initBuffersAndPrograms(): void {
		const gl = this.gl;

		this.vertexBuffer = gl.createBuffer()!;
		this.indexBuffer = gl.createBuffer()!;
		this.blit = createBlit(gl, this.vertexBuffer, this.indexBuffer);

		const f = this._fragmentShadersByName;
		this.blurProgram = makeProgram(gl, this.blurVertexShader, f.blur);
		this.copyProgram = makeProgram(gl, this.baseVertexShader, f.copy);
		this.clearProgram = makeProgram(gl, this.baseVertexShader, f.clear);
		this.checkerboardProgram = makeProgram(gl, this.baseVertexShader, f.checkerboard);
		this.bloomPrefilterProgram = makeProgram(gl, this.baseVertexShader, f.bloomPrefilter);
		this.bloomBlurProgram = makeProgram(gl, this.baseVertexShader, f.bloomBlur);
		this.bloomFinalProgram = makeProgram(gl, this.baseVertexShader, f.bloomFinal);
		this.sunraysMaskProgram = makeProgram(gl, this.baseVertexShader, f.sunraysMask);
		this.sunraysProgram = makeProgram(gl, this.baseVertexShader, f.sunrays);
		this.splatProgram = makeProgram(gl, this.baseVertexShader, f.splat);
		this.advectionProgram = makeProgram(gl, this.baseVertexShader, f.advection);
		this.divergenceProgram = makeProgram(gl, this.baseVertexShader, f.divergence);
		this.curlProgram = makeProgram(gl, this.baseVertexShader, f.curl);
		this.vorticityProgram = makeProgram(gl, this.baseVertexShader, f.vorticity);
		this.viscosityProgram = makeProgram(gl, this.baseVertexShader, f.viscosity);
		this.wallFrictionProgram = makeProgram(gl, this.baseVertexShader, f.wallFriction);
		this.pressureProgram = makeProgram(gl, this.baseVertexShader, f.pressure);
		this.pressureJacobi2Program = makeProgram(gl, this.baseVertexShader, f.pressureJacobi2);
		this.gradientSubtractProgram = makeProgram(gl, this.baseVertexShader, f.gradientSubtract);
		this.flowSourceProgram = makeProgram(gl, this.baseVertexShader, f.flowSource);
		this.flowOutletProgram = makeProgram(gl, this.baseVertexShader, f.flowOutlet);
		this.flowForceProgram = makeProgram(gl, this.baseVertexShader, f.flowForce);
		this.prescribedFieldProgram = makeProgram(gl, this.baseVertexShader, f.prescribedField);

		// On context restore the old Material holds a Map of stale program/shader
		// entries. Dispose it so the JS heap doesn't accumulate orphaned Maps.
		if (this.displayMaterial) {
			this.displayMaterial.dispose();
		}
		this.displayMaterial = new Material(gl, this.baseVertexShader, S.displayShaderSource);
		this.applyMaskProgram = makeProgram(gl, this.baseVertexShader, f.applyMask);
		this.glassProgram = makeProgram(gl, this.baseVertexShader, f.glass);

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

	private initFramebuffers(): void {
		const gl = this.gl;
		const simRes = getResolution(gl, this.config.SIM_RESOLUTION);
		const dyeRes = getResolution(gl, this.config.DYE_RESOLUTION);
		const texType = this.ext.halfFloatTexType;
		const rgba = this.ext.formatRGBA;
		const rg = this.ext.formatRG;
		const r = this.ext.formatR;
		const filtering = this.ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

		gl.disable(gl.BLEND);

		if (this.dye == null) {
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

		if (this.needsScalarFBO()) {
			if (this.scalar == null) {
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

		if (this.velocity == null) {
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
		disposeFBO(gl, this.velocitySource);
		disposeFBO(gl, this.divergence);
		disposeFBO(gl, this.curlFBO);
		disposeDoubleFBO(gl, this.pressure);

		this.velocitySource = createFBO(gl, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, gl.NEAREST);
		this.divergence = createFBO(gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
		this.curlFBO = createFBO(gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
		// Pressure stays plain half-float R16F on purpose: both a packed
		// RG16F (divergence in G) and an RG32F variant measured SLOWER on the
		// stressed bench — every Jacobi neighbor fetch drags the extra bytes
		// along, and the loop is the hottest path in the engine. See ADR-0038.
		this.pressure = createDoubleFBO(gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);

		this.initSolidNeighborTexture();
		this.initBloomFramebuffers();
		this.initSunraysFramebuffers();
		this.initGlassFramebuffer();
	}

	private initBloomFramebuffers(): void {
		const gl = this.gl;
		const res = getResolution(gl, this.config.BLOOM_RESOLUTION);
		const texType = this.ext.halfFloatTexType;
		const rgba = this.ext.formatRGBA;
		const filtering = this.ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

		disposeFBO(gl, this.bloom);
		for (const fbo of this.bloomFramebuffers) disposeFBO(gl, fbo);
		this.bloomFramebuffers = [];

		this.bloom = createFBO(gl, res.width, res.height, rgba.internalFormat, rgba.format, texType, filtering);

		for (let i = 0; i < this.config.BLOOM_ITERATIONS; i++) {
			const width = res.width >> (i + 1);
			const height = res.height >> (i + 1);
			if (width < 2 || height < 2) break;
			this.bloomFramebuffers.push(createFBO(gl, width, height, rgba.internalFormat, rgba.format, texType, filtering));
		}
	}

	private initSunraysFramebuffers(): void {
		const gl = this.gl;
		const res = getResolution(gl, this.config.SUNRAYS_RESOLUTION);
		const texType = this.ext.halfFloatTexType;
		const r = this.ext.formatR;
		const filtering = this.ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

		disposeFBO(gl, this.sunrays);
		disposeFBO(gl, this.sunraysTemp);

		this.sunrays = createFBO(gl, res.width, res.height, r.internalFormat, r.format, texType, filtering);
		this.sunraysTemp = createFBO(gl, res.width, res.height, r.internalFormat, r.format, texType, filtering);
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
			}
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
			}
			this.distortionLoadedUrl = null;
			this.initDistortionFallback();
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

		if (!shape || shape.type !== 'svgPath') return;

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

		if (!obstructions || obstructions.length === 0) return;

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
			// solidMaskData is null here, so this just disposes the stale texture.
			this.initSolidNeighborTexture();
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
		this.initSolidNeighborTexture();
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
			this.blurMaskData(maskData, maskW, maskH, blurRadius);
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
	}

	/** In-place box blur of a single-channel mask. Multiple passes approximate Gaussian. */
	private blurMaskData(data: Uint8Array, w: number, h: number, radius: number): void {
		const passes = Math.max(1, Math.ceil(radius / 2));
		const r = Math.max(1, Math.round(radius));
		const temp = new Uint8Array(w * h);
		for (let pass = 0; pass < passes; pass++) {
			// Horizontal pass → temp
			for (let y = 0; y < h; y++) {
				for (let x = 0; x < w; x++) {
					let sum = 0,
						count = 0;
					for (let dx = -r; dx <= r; dx++) {
						const nx = x + dx;
						if (nx >= 0 && nx < w) {
							sum += data[y * w + nx];
							count++;
						}
					}
					temp[y * w + x] = (sum / count) | 0;
				}
			}
			// Vertical pass → data
			for (let x = 0; x < w; x++) {
				for (let y = 0; y < h; y++) {
					let sum = 0,
						count = 0;
					for (let dy = -r; dy <= r; dy++) {
						const ny = y + dy;
						if (ny >= 0 && ny < h) {
							sum += temp[ny * w + x];
							count++;
						}
					}
					data[y * w + x] = (sum / count) | 0;
				}
			}
		}
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

	private updateKeywords(): void {
		const keywords: string[] = [];
		if (this.config.SHADING) keywords.push('SHADING');
		if (this.config.BLOOM) keywords.push('BLOOM');
		if (this.config.SUNRAYS) keywords.push('SUNRAYS');
		if (this.config.CONTAINER_SHAPE) keywords.push('CONTAINER_MASK');
		// Obstructions and distortion share display texture unit 6; the
		// obstruction mask is only bound when distortion is off, so the
		// keyword must match that guard or the display samples a stale unit.
		if (!this.config.DISTORTION && this.config.OBSTRUCTIONS && this.config.OBSTRUCTIONS.length) {
			keywords.push('OBSTRUCTION_MASK');
			// Paint obstruction footprints in a solid color (ADR-0039).
			if (this.config.OBSTRUCTION_COLOR) keywords.push('OBSTRUCTION_FILL');
		}
		if (this.flowVisualizationActive()) keywords.push('FLOW_VISUALIZATION');
		// DISTORTION and REVEAL are mutually exclusive display modes
		if (this.config.DISTORTION) keywords.push('DISTORTION');
		else if (this.config.REVEAL) keywords.push('REVEAL');
		this.displayMaterial.setKeywords(keywords);
	}

	/* ---------------------------------------------------------------------- */
	/*                                 Update loop                            */
	/* ---------------------------------------------------------------------- */

	private update(): void {
		if (this.disposed || this.contextLost || !this.rafRunning) return;
		const dt = this.calcDeltaTime();
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
		this.render(null);
		this.rafId = requestAnimationFrame(this.tick);
	}

	private calcDeltaTime(): number {
		const now = performance.now();
		let dt = (now - this.lastUpdateTime) / 1000;
		dt = Math.min(dt, this.config.MAX_TIME_STEP * this.config.SUBSTEPS);
		this.lastUpdateTime = now;
		return dt;
	}

	private simulationSubsteps(dt: number): number {
		const configured = Math.max(1, Math.min(8, Math.floor(this.config.SUBSTEPS)));
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
		if (this.splatStack.length > 0) {
			this.multipleSplats(this.splatStack.pop()!);
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
			this.config.VISCOSITY * dt * Math.max(this.velocity.width, this.velocity.height)
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

		const iterations = this.config.PRESSURE_ITERATIONS;
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
			gl.uniform1f(this.vorticityProgram.uniforms.curl, this.config.CURL);
			gl.uniform1f(this.vorticityProgram.uniforms.dt, dt);
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

	private render(target: FBO | null): void {
		const gl = this.gl;

		const hasDyeContent = this.shouldSimulateDye();
		if (this.config.BLOOM && hasDyeContent) this.applyBloom(this.dye.read, this.bloom);
		if (this.config.SUNRAYS && hasDyeContent) {
			this.applySunrays(this.dye.read, this.dye.write, this.sunrays);
			this.blur(this.sunrays, this.sunraysTemp, 1);
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

	private drawCheckerboard(target: FBO | null): void {
		const gl = this.gl;
		this.checkerboardProgram.bind();
		gl.uniform1f(this.checkerboardProgram.uniforms.aspectRatio, this.canvas.width / this.canvas.height);
		this.blit(target);
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
		if (this.config.BLOOM) {
			gl.uniform1i(this.displayMaterial.uniforms.uBloom, this.bloom.attach(1));
			gl.uniform1i(this.displayMaterial.uniforms.uDithering, this.ditheringTexture.attach(2));
			const scale = getTextureScale(this.ditheringTexture, width, height);
			gl.uniform2f(this.displayMaterial.uniforms.ditherScale, scale.x, scale.y);
		}
		if (this.config.SUNRAYS) {
			gl.uniform1i(this.displayMaterial.uniforms.uSunrays, this.sunrays.attach(3));
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
			gl.uniform1i(this.bloomBlurProgram.uniforms.uTexture, last.attach(0));
			this.blit(dest);
			last = dest;
		}

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
		const dx = pointer.deltaX * this.config.SPLAT_FORCE;
		const dy = pointer.deltaY * this.config.SPLAT_FORCE;
		this.splat(pointer.texcoordX, pointer.texcoordY, dx, dy, pointer.color);
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
				let attempts = 10;
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

	private installPointerListeners(): void {
		if (this.pointerListenersInstalled) return;
		const useWindow = this.config.POINTER_TARGET === 'window';
		const target: EventTarget = useWindow ? window : this.canvas;
		this.installedPointerTarget = target;

		target.addEventListener('mousedown', this.onMouseDown as EventListener);
		target.addEventListener('mousemove', this.onMouseMove as EventListener);
		if (!useWindow) {
			this.canvas.addEventListener('mouseleave', this.onMouseLeave);
		}
		window.addEventListener('mouseup', this.onMouseUp);
		// Window-level touch listeners must be passive to avoid blocking scroll
		target.addEventListener('touchstart', this.onTouchStart as EventListener, {
			passive: useWindow
		});
		target.addEventListener('touchmove', this.onTouchMove as EventListener, {
			passive: useWindow
		});
		window.addEventListener('touchend', this.onTouchEnd);
		this.pointerListenersInstalled = true;
	}

	private removePointerListeners(): void {
		if (!this.pointerListenersInstalled) return;
		const target = this.installedPointerTarget ?? this.canvas;

		target.removeEventListener('mousedown', this.onMouseDown as EventListener);
		target.removeEventListener('mousemove', this.onMouseMove as EventListener);
		this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
		window.removeEventListener('mouseup', this.onMouseUp);
		target.removeEventListener('touchstart', this.onTouchStart as EventListener);
		target.removeEventListener('touchmove', this.onTouchMove as EventListener);
		window.removeEventListener('touchend', this.onTouchEnd);
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

	private handleMouseDown(e: MouseEvent): void {
		const { x, y } = this.getCanvasOffset(e.clientX, e.clientY);
		let pointer = this.pointers.find((p) => p.id === -1);
		if (pointer == null) {
			pointer = createPointer();
			this.pointers.push(pointer);
		}
		updatePointerDownData(pointer, -1, x, y, this.canvas.width, this.canvas.height, generateColor(this.rng));
	}

	private handleMouseMove(e: MouseEvent): void {
		const pointer = this.pointers[0];
		if (!pointer) return;
		if (!pointer.down) {
			// In hover-splat mode, synthesize a pointer-down so the move
			// generates a splat. The first move seeds the position; the
			// second move onward produces a delta that drives the splat.
			if (!this.config.SPLAT_ON_HOVER) return;
			const { x, y } = this.getCanvasOffset(e.clientX, e.clientY);
			updatePointerDownData(pointer, -1, x, y, this.canvas.width, this.canvas.height, generateColor(this.rng));
			return;
		}
		const { x, y } = this.getCanvasOffset(e.clientX, e.clientY);
		updatePointerMoveData(pointer, x, y, this.canvas.width, this.canvas.height);
	}

	private handleMouseUp(): void {
		const pointer = this.pointers[0];
		if (pointer) updatePointerUpData(pointer);
	}

	private handleMouseLeave(): void {
		// End the hover-splat stream when the cursor leaves the canvas,
		// so re-entering doesn't produce a splat that stretches from the
		// exit point to the new entry point.
		if (this.config.SPLAT_ON_HOVER) {
			const pointer = this.pointers[0];
			if (pointer) updatePointerUpData(pointer);
		}
	}

	private handleTouchStart(e: TouchEvent): void {
		if (this.config.POINTER_TARGET !== 'window') e.preventDefault();
		const touches = e.targetTouches;
		for (let i = 0; i < touches.length; i++) {
			// Reuse existing slots from previous gestures. Only push when
			// there is no slot at this index, bounding the array at
			// maxConcurrentTouches + 1 (slot 0 is the permanent mouse pointer).
			if (i + 1 >= this.pointers.length) {
				this.pointers.push(createPointer());
			}
			const { x, y } = this.getCanvasOffset(touches[i].clientX, touches[i].clientY);
			updatePointerDownData(
				this.pointers[i + 1],
				touches[i].identifier,
				x,
				y,
				this.canvas.width,
				this.canvas.height,
				generateColor(this.rng)
			);
		}
	}

	private handleTouchMove(e: TouchEvent): void {
		if (this.config.POINTER_TARGET !== 'window') e.preventDefault();
		const touches = e.targetTouches;
		for (let i = 0; i < touches.length; i++) {
			const pointer = this.pointers[i + 1];
			if (!pointer || !pointer.down) continue;
			const { x, y } = this.getCanvasOffset(touches[i].clientX, touches[i].clientY);
			updatePointerMoveData(pointer, x, y, this.canvas.width, this.canvas.height);
		}
	}

	private handleTouchEnd(e: TouchEvent): void {
		const touches = e.changedTouches;
		for (let i = 0; i < touches.length; i++) {
			const pointer = this.pointers.find((p) => p.id === touches[i].identifier);
			if (!pointer) continue;
			updatePointerUpData(pointer);
		}
	}
}
