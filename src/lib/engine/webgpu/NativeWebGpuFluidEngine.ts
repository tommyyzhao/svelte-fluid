import { subscribeFrame } from '../frame-scheduler.js';
import { MAX_QUEUED_SPLATS, snapshotFluidConfig } from '../config-snapshot.js';
import {
	nextContinuousOverloadMs,
	nextFrameTimeEmaMs,
	performanceGovernorStep,
	sanitizePerformanceFrameSampleMs
} from '../performance-governor.js';
import {
	flowNeedsScalarField,
	flowScalarChannel,
	flowScalarDissipation,
	flowScalarLayoutSignature,
	flowTransferKind
} from '../flow-policy.js';
import { flowCanDriveSolver } from '../solver-activity.js';
import { generateColor, mulberry32, randomSeed, type Rng } from '../rng.js';
import type {
	ContainerShape,
	FlowConfig,
	FlowForce,
	FlowGridField,
	FluidConfig,
	Obstruction,
	PerformanceAction,
	PerformanceState,
	PerformanceTier,
	RGB,
	StickyMask
} from '../types.js';
import { curlScale, viscosityAlpha } from '../solver-policy.js';
import { vorticityNormalizationScale } from '../vorticity-normalization.js';
import type { MaskContext } from '../container-shapes.js';
import {
	buildCanonicalMaskFields,
	packCanonicalMaskTextureData,
	packVisualMaskTextureData
} from '../mask-rasterizer.js';
import {
	rasterizeStickyMask,
	resampleStickyMask,
	resolveMaskResolution,
	type StickyMaskRaster
} from '../sticky-rasterizer.js';
import {
	createPointer,
	updatePointerDownData,
	updatePointerMoveData,
	updatePointerUpData,
	type Pointer
} from '../pointer.js';
import {
	sharedWebGpuDevicePool,
	WebGpuUnavailableError,
	type WebGpuDeviceLease,
	type WebGpuDevicePool,
	type WebGpuDeviceSnapshot
} from './device-pool.js';
import {
	createDoubleTarget,
	createExternalImageTexture,
	createMaskTexture,
	createTarget,
	createTrackedBuffer,
	type WebGpuDoubleTarget,
	type WebGpuTarget
} from './resources.js';
import { NATIVE_WEBGPU_SHADERS } from './shaders.js';

const MAX_SPLATS_PER_FRAME = 16;
const FLOW_BATCH_SIZE = 16;
const MAX_INSTANCE_FIELD_BYTES = 256 * 1024 * 1024;
const MAX_INSTANCE_TRANSITION_BYTES = 384 * 1024 * 1024;
const MAX_PRESCRIBED_GRID_PIXELS = 4096 * 4096;
const MAX_DISTORTION_IMAGE_BYTES = 128 * 1024 * 1024;
// Numeric WebGPU flags keep this module SSR-safe; the browser globals do not
// exist while SvelteKit evaluates the package on the server.
const UNIFORM_USAGE = 0x0040 | 0x0008;

interface NativeFluidConfig {
	simResolution: number;
	dyeResolution: number;
	densityDissipation: number;
	initialDensityDissipation: number;
	initialDensityDissipationDuration: number;
	velocityDissipation: number;
	advectionScheme: 'semilagrangian' | 'maccormack';
	viscosity: number;
	viscosityIterations: number;
	wallFriction: number;
	wallFrictionWidth: number;
	maxTimeStep: number;
	substeps: number;
	pressure: number;
	pressureIterations: number;
	autoPerformance: boolean;
	autoPerformanceTargetFrameMs: number;
	autoPerformanceMinPressureIterations: number;
	autoPerformanceMinSubsteps: number;
	curl: number;
	vorticityAdaptive: number;
	splatRadius: number;
	splatForce: number;
	colorful: boolean;
	colorUpdateSpeed: number;
	paused: boolean;
	backColor: RGB;
	transparent: boolean;
	shading: boolean;
	bloom: boolean;
	bloomIterations: number;
	bloomResolution: number;
	bloomIntensity: number;
	bloomThreshold: number;
	bloomSoftKnee: number;
	sunrays: boolean;
	sunraysResolution: number;
	sunraysWeight: number;
	glass: boolean;
	glassThickness: number;
	glassRefraction: number;
	glassReflectivity: number;
	glassChromatic: number;
	distortion: boolean;
	distortionPower: number;
	distortionImageUrl: string | null;
	distortionFit: 'cover' | 'contain';
	distortionScale: number;
	distortionBleedX: number;
	distortionBleedY: number;
	reveal: boolean;
	revealSensitivity: number;
	revealCurve: number;
	revealCoverColor: RGB;
	revealAccentColor: RGB;
	revealFringeColor: RGB;
	obstructionColor: RGB | null;
	containerShape: ContainerShape | null;
	obstructions: ReadonlyArray<Obstruction> | null;
	openBoundary: boolean;
	flow: FlowConfig | null;
	sticky: boolean;
	stickyMask: StickyMask | null;
	stickyStrength: number;
	stickyPressure: number;
	stickyAmplify: number;
	seed: number;
	initialSplatCount: number | null;
	initialSplatCountMin: number;
	initialSplatCountMax: number;
	presetSplats: FluidConfig['presetSplats'];
	pointerInput: boolean;
	pointerTarget: 'canvas' | 'window';
	splatOnHover: boolean;
	autoSplatRate: number;
	autoSplatCount: number;
	autoSplatColor: RGB | null;
	autoSplatVelocityX: number;
	autoSplatVelocityY: number;
	autoSplatCenterX: number;
	autoSplatCenterY: number;
	autoSplatEvenX: boolean;
	autoSplatSwirl: number;
	autoSplatBandHeight: number;
	autoSplatBandWidth: number;
}

interface PipelineGraph {
	splatVelocity: GPURenderPipeline;
	splatDye: GPURenderPipeline;
	flowSourceVelocity: GPURenderPipeline;
	flowSourceDye: GPURenderPipeline;
	flowSourceScalar: GPURenderPipeline;
	flowOutletVelocity: GPURenderPipeline;
	flowOutletDye: GPURenderPipeline;
	flowOutletScalar: GPURenderPipeline;
	flowForce: GPURenderPipeline;
	advectVelocity: GPURenderPipeline;
	advectDye: GPURenderPipeline;
	advectScalar: GPURenderPipeline;
	advectMacCormack: GPURenderPipeline;
	prescribedVelocity: GPURenderPipeline;
	prescribedScalar: GPURenderPipeline;
	viscosity: GPURenderPipeline;
	wallFriction: GPURenderPipeline;
	curl: GPURenderPipeline;
	vorticity: GPURenderPipeline;
	divergence: GPURenderPipeline;
	pressure: GPURenderPipeline;
	pressureSingle: GPURenderPipeline;
	gradientSubtract: GPURenderPipeline;
	resampleVelocity: GPURenderPipeline;
	resampleScalar: GPURenderPipeline;
	resamplePressure: GPURenderPipeline;
	bloomPrefilter: GPURenderPipeline;
	bloomBlurHorizontal: GPURenderPipeline;
	bloomBlurVertical: GPURenderPipeline;
	sunrays: GPURenderPipeline;
	display: GPURenderPipeline;
}

interface MaskResources {
	texture: WebGpuTarget;
	allowedMask: MaskContext;
	allowedAreaFraction: number;
}

interface PrescribedScalarResource {
	name: string;
	channel: number;
	texture: WebGpuTarget;
	scale: number;
}

interface PrescribedResources {
	velocity: WebGpuTarget | null;
	scalars: PrescribedScalarResource[];
	velocityScale: number;
}

interface FieldResources {
	simSize: [number, number];
	dyeSize: [number, number];
	mask: MaskResources;
	visualMask: WebGpuTarget;
	velocity: WebGpuDoubleTarget;
	velocitySource: WebGpuTarget;
	dye: WebGpuDoubleTarget;
	scalar: WebGpuDoubleTarget | null;
	pressure: WebGpuDoubleTarget;
	divergence: WebGpuTarget;
	curl: WebGpuTarget;
	prescribed: PrescribedResources;
	bloom: WebGpuDoubleTarget | null;
	sunrays: WebGpuTarget | null;
}

interface UniformBuffer {
	buffer: GPUBuffer;
	destroy(): void;
}

interface SplatEvent {
	x: number;
	y: number;
	dx: number;
	dy: number;
	color: RGB;
}

export interface NativeWebGpuFluidEngineOptions {
	canvas: HTMLCanvasElement;
	config?: FluidConfig;
	autoStart?: boolean;
	devicePool?: WebGpuDevicePool;
	onDeviceLost?: (info: GPUDeviceLostInfo) => void;
	onError?: (error: GPUError) => void;
	onConfigurationError?: (error: Error, transition: NativeWebGpuRejectedTransition) => void;
	onAssetError?: (error: Error) => void;
	onAssetReady?: () => void;
	onFatalError?: (error: Error) => void;
}

type NativeWebGpuRejectedTransition =
	| { kind: 'config'; acceptedConfig: FluidConfig }
	| { kind: 'resize'; acceptedWidth: number; acceptedHeight: number };

export interface NativeWebGpuFieldResult {
	readonly data: Float32Array;
	readonly width: number;
	readonly height: number;
	readonly components: number;
}

function finiteNumber(
	input: number | undefined,
	base: number | undefined,
	fallback: number,
	minimum = -Number.MAX_VALUE,
	maximum = Number.MAX_VALUE
): number {
	const safeBase = Number.isFinite(base) ? base! : fallback;
	const value = Number.isFinite(input) ? input! : safeBase;
	return Math.max(minimum, Math.min(maximum, value));
}

function resolveConfig(input: FluidConfig | undefined, base?: NativeFluidConfig): NativeFluidConfig {
	input = input ? snapshotFluidConfig(input) : undefined;
	const initialCount =
		input?.initialSplatCount !== undefined ? input.initialSplatCount : (base?.initialSplatCount ?? null);
	const densityDissipation = finiteNumber(input?.densityDissipation, base?.densityDissipation, 1, 0);
	return {
		simResolution: Math.round(finiteNumber(input?.simResolution, base?.simResolution, 128, 16, 8192)),
		dyeResolution: Math.round(finiteNumber(input?.dyeResolution, base?.dyeResolution, 1024, 16, 8192)),
		densityDissipation,
		initialDensityDissipation: finiteNumber(
			input?.initialDensityDissipation,
			input?.densityDissipation !== undefined ? densityDissipation : base?.initialDensityDissipation,
			densityDissipation,
			0
		),
		initialDensityDissipationDuration: finiteNumber(
			input?.initialDensityDissipationDuration,
			base?.initialDensityDissipationDuration,
			0,
			0,
			3600
		),
		velocityDissipation: finiteNumber(input?.velocityDissipation, base?.velocityDissipation, 0.2, 0),
		advectionScheme: input?.advectionScheme ?? base?.advectionScheme ?? 'semilagrangian',
		viscosity: finiteNumber(input?.viscosity, base?.viscosity, 0, 0),
		viscosityIterations: Math.floor(finiteNumber(input?.viscosityIterations, base?.viscosityIterations, 8, 0, 40)),
		wallFriction: finiteNumber(input?.wallFriction, base?.wallFriction, 0, 0, 1),
		wallFrictionWidth: finiteNumber(input?.wallFrictionWidth, base?.wallFrictionWidth, 1, 0, 4),
		maxTimeStep: finiteNumber(input?.maxTimeStep, base?.maxTimeStep, 1 / 60, 0.001, 1),
		substeps: Math.floor(finiteNumber(input?.substeps, base?.substeps, 1, 1, 8)),
		pressure: finiteNumber(input?.pressure, base?.pressure, 0.8),
		pressureIterations: Math.floor(finiteNumber(input?.pressureIterations, base?.pressureIterations, 20, 0, 64)),
		autoPerformance: input?.autoPerformance ?? base?.autoPerformance ?? false,
		autoPerformanceTargetFrameMs: finiteNumber(
			input?.autoPerformanceTargetFrameMs,
			base?.autoPerformanceTargetFrameMs,
			1000 / 60,
			1,
			1000
		),
		autoPerformanceMinPressureIterations: Math.floor(
			finiteNumber(input?.autoPerformanceMinPressureIterations, base?.autoPerformanceMinPressureIterations, 8, 0, 64)
		),
		autoPerformanceMinSubsteps: Math.floor(
			finiteNumber(input?.autoPerformanceMinSubsteps, base?.autoPerformanceMinSubsteps, 1, 1, 8)
		),
		curl: finiteNumber(input?.curl, base?.curl, 30),
		vorticityAdaptive: finiteNumber(input?.vorticityAdaptive, base?.vorticityAdaptive, 0, 0, 1),
		splatRadius: finiteNumber(input?.splatRadius, base?.splatRadius, 0.25, 0.001, 100),
		splatForce: finiteNumber(input?.splatForce, base?.splatForce, 6000),
		colorful: input?.colorful ?? base?.colorful ?? true,
		colorUpdateSpeed: finiteNumber(input?.colorUpdateSpeed, base?.colorUpdateSpeed, 10, 0),
		paused: input?.paused ?? base?.paused ?? false,
		backColor: input?.backColor ?? base?.backColor ?? { r: 0, g: 0, b: 0 },
		transparent: input?.transparent ?? base?.transparent ?? false,
		shading: input?.shading ?? base?.shading ?? true,
		bloom: input?.bloom ?? base?.bloom ?? true,
		bloomIterations: Math.floor(finiteNumber(input?.bloomIterations, base?.bloomIterations, 8, 0, 16)),
		bloomResolution: Math.round(finiteNumber(input?.bloomResolution, base?.bloomResolution, 256, 16, 8192)),
		bloomIntensity: finiteNumber(input?.bloomIntensity, base?.bloomIntensity, 0.8, 0),
		bloomThreshold: finiteNumber(input?.bloomThreshold, base?.bloomThreshold, 0.6, 0),
		bloomSoftKnee: finiteNumber(input?.bloomSoftKnee, base?.bloomSoftKnee, 0.7, 0),
		sunrays: input?.sunrays ?? base?.sunrays ?? true,
		sunraysResolution: Math.round(finiteNumber(input?.sunraysResolution, base?.sunraysResolution, 196, 16, 8192)),
		sunraysWeight: finiteNumber(input?.sunraysWeight, base?.sunraysWeight, 1, 0, 1),
		glass: input?.glass ?? base?.glass ?? false,
		glassThickness: finiteNumber(input?.glassThickness, base?.glassThickness, 0.04, 0.001, 10),
		glassRefraction: finiteNumber(input?.glassRefraction, base?.glassRefraction, 0.4, 0, 1),
		glassReflectivity: finiteNumber(input?.glassReflectivity, base?.glassReflectivity, 0.12, 0, 1),
		glassChromatic: finiteNumber(input?.glassChromatic, base?.glassChromatic, 0.15, 0, 1),
		distortion: input?.distortion ?? base?.distortion ?? false,
		distortionPower: finiteNumber(input?.distortionPower, base?.distortionPower, 0.4, 0, 1),
		distortionImageUrl:
			input?.distortionImageUrl !== undefined ? (input.distortionImageUrl ?? null) : (base?.distortionImageUrl ?? null),
		distortionFit: input?.distortionFit ?? base?.distortionFit ?? 'cover',
		distortionScale: finiteNumber(input?.distortionScale, base?.distortionScale, 1, 0.01, 100),
		distortionBleedX: finiteNumber(input?.distortionBleedX, base?.distortionBleedX, 0, 0, 0.5),
		distortionBleedY: finiteNumber(input?.distortionBleedY, base?.distortionBleedY, 0, 0, 0.5),
		reveal: input?.reveal ?? base?.reveal ?? false,
		revealSensitivity: finiteNumber(input?.revealSensitivity, base?.revealSensitivity, 0.1),
		revealCurve: finiteNumber(input?.revealCurve, base?.revealCurve, 0.5),
		revealCoverColor: input?.revealCoverColor ?? base?.revealCoverColor ?? { r: 1, g: 1, b: 1 },
		revealAccentColor: input?.revealAccentColor ?? base?.revealAccentColor ?? { r: 0.05, g: 0.16, b: 0.32 },
		revealFringeColor: input?.revealFringeColor ?? base?.revealFringeColor ?? { r: 0.6, g: 0.7, b: 0.85 },
		obstructionColor:
			input?.obstructionColor !== undefined ? input.obstructionColor : (base?.obstructionColor ?? null),
		containerShape:
			input?.containerShape !== undefined ? input.containerShape : (base?.containerShape ?? null),
		obstructions: input?.obstructions !== undefined ? input.obstructions : (base?.obstructions ?? null),
		openBoundary: input?.openBoundary ?? base?.openBoundary ?? false,
		flow: input?.flow !== undefined ? input.flow : (base?.flow ?? null),
		sticky: input?.sticky ?? base?.sticky ?? false,
		stickyMask: input?.stickyMask !== undefined ? (input.stickyMask ?? null) : (base?.stickyMask ?? null),
		stickyStrength: finiteNumber(input?.stickyStrength, base?.stickyStrength, 0.9, 0, 1),
		stickyPressure: finiteNumber(input?.stickyPressure, base?.stickyPressure, 0.15, 0),
		stickyAmplify: finiteNumber(input?.stickyAmplify, base?.stickyAmplify, 0.3, 0),
		seed: (input?.seed ?? base?.seed ?? randomSeed()) >>> 0,
		initialSplatCount:
			initialCount === null
				? null
				: Math.floor(finiteNumber(initialCount, base?.initialSplatCount ?? undefined, 0, 0, MAX_QUEUED_SPLATS)),
		initialSplatCountMin: Math.floor(
			finiteNumber(input?.initialSplatCountMin, base?.initialSplatCountMin, 5, 0, MAX_QUEUED_SPLATS)
		),
		initialSplatCountMax: Math.floor(
			finiteNumber(input?.initialSplatCountMax, base?.initialSplatCountMax, 25, 0, MAX_QUEUED_SPLATS)
		),
		presetSplats: input?.presetSplats !== undefined ? input.presetSplats : base?.presetSplats,
		pointerInput: input?.pointerInput ?? base?.pointerInput ?? true,
		pointerTarget: input?.pointerTarget ?? base?.pointerTarget ?? 'canvas',
		splatOnHover: input?.splatOnHover ?? base?.splatOnHover ?? false,
		autoSplatRate: finiteNumber(input?.autoSplatRate, base?.autoSplatRate, 0, 0, 240),
		autoSplatCount: Math.floor(finiteNumber(input?.autoSplatCount, base?.autoSplatCount, 1, 1, 64)),
		autoSplatColor: input?.autoSplatColor !== undefined ? input.autoSplatColor : (base?.autoSplatColor ?? null),
		autoSplatVelocityX: finiteNumber(input?.autoSplatVelocityX, base?.autoSplatVelocityX, 0),
		autoSplatVelocityY: finiteNumber(input?.autoSplatVelocityY, base?.autoSplatVelocityY, 0),
		autoSplatCenterX: finiteNumber(input?.autoSplatCenterX, base?.autoSplatCenterX, 0.5, 0, 1),
		autoSplatCenterY: finiteNumber(input?.autoSplatCenterY, base?.autoSplatCenterY, 0.5, 0, 1),
		autoSplatEvenX: input?.autoSplatEvenX ?? base?.autoSplatEvenX ?? false,
		autoSplatSwirl: finiteNumber(input?.autoSplatSwirl, base?.autoSplatSwirl, 0),
		autoSplatBandHeight: finiteNumber(input?.autoSplatBandHeight, base?.autoSplatBandHeight, 0.1, 0, 1),
		autoSplatBandWidth: finiteNumber(input?.autoSplatBandWidth, base?.autoSplatBandWidth, 1, 0, 1)
	};
}

function resolutionFor(shortSide: number, width: number, height: number, limit: number): [number, number] {
	const aspect = Math.max(width, height) / Math.max(1, Math.min(width, height));
	let min = Math.max(1, Math.round(shortSide));
	let max = Math.max(1, Math.round(shortSide * aspect));
	if (max > limit) {
		const scale = limit / max;
		max = limit;
		min = Math.max(1, Math.floor(min * scale));
	}
	return width >= height ? [max, min] : [min, max];
}

function float16(value: number): number {
	const sign = (value & 0x8000) === 0 ? 1 : -1;
	const exponent = (value >> 10) & 0x1f;
	const fraction = value & 0x03ff;
	if (exponent === 0) return sign * (fraction / 1024) * 2 ** -14;
	if (exponent === 0x1f) return fraction === 0 ? sign * Infinity : Number.NaN;
	return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
}

function correctedRadius(radius: number, aspect: number): number {
	const normalized = radius / 100;
	return aspect > 1 ? normalized * aspect : normalized;
}

function textureByteSize(target: WebGpuTarget): number {
	const bytesPerPixel =
		target.format === 'r16float' ? 2 :
		target.format === 'rg16float' || target.format === 'rgba8unorm' ? 4 :
		target.format === 'rgba16float' ? 8 : 4;
	return target.width * target.height * bytesPerPixel;
}

async function finishGpuErrorScopes(device: GPUDevice, label: string): Promise<void> {
	const outOfMemory = device.popErrorScope();
	const validation = device.popErrorScope();
	await device.queue.onSubmittedWorkDone();
	const [outOfMemoryError, validationError] = await Promise.all([outOfMemory, validation]);
	const error = outOfMemoryError ?? validationError;
	if (error) throw new Error(`svelte-fluid: ${label} failed: ${error.message}`, { cause: error });
}

export class NativeWebGpuFluidEngine {

	private readonly canvas: HTMLCanvasElement;
	private readonly context: GPUCanvasContext;
	private readonly lease: WebGpuDeviceLease;
	private pipelines: PipelineGraph;
	private readonly sampler: GPUSampler;
	private readonly nearestSampler: GPUSampler;
	private readonly uniforms: UniformBuffer[] = [];
	private readonly splatVelocityUniforms: UniformBuffer[] = [];
	private readonly splatDyeUniforms: UniformBuffer[] = [];
	private readonly rng: Rng;
	private readonly onDeviceLost: ((info: GPUDeviceLostInfo) => void) | undefined;
	private readonly onError: ((error: GPUError) => void) | undefined;
	private readonly onConfigurationError:
		| ((error: Error, transition: NativeWebGpuRejectedTransition) => void)
		| undefined;
	private readonly onAssetError: ((error: Error) => void) | undefined;
	private readonly onAssetReady: (() => void) | undefined;
	private readonly onFatalError: ((error: Error) => void) | undefined;
	private readonly unsubscribeDeviceError: () => void;
	private config: NativeFluidConfig;
	private maskResourceSignature = '';
	private solidTopologySignature = '';
	private prescribedResourceSignature = '';
	private scalarResourceNeeded = false;
	private scalarLayoutSignature = 'none';
	private velocity!: WebGpuDoubleTarget;
	private velocitySource!: WebGpuTarget;
	private maskTexture!: WebGpuTarget;
	private visualMaskTexture!: WebGpuTarget;
	private dye!: WebGpuDoubleTarget;
	private scalar: WebGpuDoubleTarget | null = null;
	private prescribedVelocityTexture: WebGpuTarget | null = null;
	private prescribedScalarResources: PrescribedScalarResource[] = [];
	private prescribedVelocityScale = 1;
	private pressure!: WebGpuDoubleTarget;
	private divergence!: WebGpuTarget;
	private curlTarget!: WebGpuTarget;
	private bloomTarget: WebGpuDoubleTarget | null = null;
	private sunraysTarget: WebGpuTarget | null = null;
	private distortionTexture: WebGpuTarget | null = null;
	private distortionImageRatio = 1;
	private distortionLoadToken = 0;
	private distortionAbort: AbortController | null = null;
	private advectVelocityUniform!: UniformBuffer;
	private advectDyeUniform!: UniformBuffer;
	private advectScalarUniform!: UniformBuffer;
	private macCormackUniform!: UniformBuffer;
	private prescribedVelocityUniform!: UniformBuffer;
	private readonly prescribedScalarUniforms: UniformBuffer[] = [];
	private readonly flowSourceVelocityUniforms: UniformBuffer[] = [];
	private readonly flowSourceDyeUniforms: UniformBuffer[] = [];
	private readonly flowSourceScalarUniforms: UniformBuffer[] = [];
	private readonly flowOutletVelocityUniforms: UniformBuffer[] = [];
	private readonly flowOutletDyeUniforms: UniformBuffer[] = [];
	private readonly flowOutletScalarUniforms: UniformBuffer[] = [];
	private readonly flowForceUniforms: UniformBuffer[] = [];
	private vorticityUniform!: UniformBuffer;
	private viscosityUniform!: UniformBuffer;
	private wallFrictionUniform!: UniformBuffer;
	private boundaryUniform!: UniformBuffer;
	private pressureFirstUniform!: UniformBuffer;
	private pressureSteadyUniform!: UniformBuffer;
	private displayUniform!: UniformBuffer;
	private bloomPrefilterUniform!: UniformBuffer;
	private splats: SplatEvent[] = [];
	private pointers: Pointer[] = [createPointer()];
	private pointerListenersInstalled = false;
	private installedPointerTarget: EventTarget | null = null;
	private colorUpdateTimer = 0;
	private autoSplatTimer = 0;
	private allowedMask: MaskContext = { data: new Uint8Array([255]), width: 1, height: 1 };
	private allowedAreaFraction = 1;
	private disposed = false;
	private deviceLost = false;
	private cancelFrameSubscription: (() => void) | null = null;
	private lastUpdateTime = 0;
	private frameDirty = true;
	private dyeMayContainContent = false;
	private solverMayContainContent = false;
	private frameSubmissionCount = 0;
	private simSize: [number, number] = [1, 1];
	private dyeSize: [number, number] = [1, 1];
	private performanceEmaMs = 0;
	private performanceTier: PerformanceTier = 'none';
	private performanceMsSinceLastChange = 0;
	private performanceContinuousOverloadMs = 0;
	private performanceLastAction: PerformanceAction = 'none';
	private performancePressureIterations = 0;
	private performanceSubsteps = 1;
	private readonly engineStartTime = performance.now();
	private simulationTime = 0;
	private deterministicAdvance = false;
	private readonly bindGroups = new Map<string, GPUBindGroup>();
	private readonly pendingGpuWork = new Set<Promise<void>>();
	private queuedConfigPatch: FluidConfig | null = null;
	private queuedResize: [number, number] | null = null;
	private terminalError: Error | null = null;
	private readonly resourceIds = new WeakMap<object, number>();
	private nextResourceId = 1;
	private fieldsInstalled = false;
	private glassLightX = 0.35;
	private glassLightY = 0.25;

	static async create(options: NativeWebGpuFluidEngineOptions): Promise<NativeWebGpuFluidEngine> {
		const pool = options.devicePool ?? sharedWebGpuDevicePool;
		const lease = await pool.acquire({
			requireHardwareAcceleration: options.config?.requireHardwareAcceleration
		});
		let pipelines: PipelineGraph;
		try {
			pipelines = await NativeWebGpuFluidEngine.createPipelines(lease);
		} catch (error) {
			lease.release();
			throw error;
		}
		lease.device.pushErrorScope('validation');
		lease.device.pushErrorScope('out-of-memory');
		let engine: NativeWebGpuFluidEngine;
		try {
			engine = new NativeWebGpuFluidEngine({ ...options, autoStart: false }, lease, pipelines);
		} catch (error) {
			await finishGpuErrorScopes(lease.device, 'initial WebGPU resource graph').catch(() => {});
			// The constructor may reject before its internal cleanup boundary. Lease
			// release is idempotent, so covering both early and late failures is safe.
			lease.release();
			throw error;
		}
		try {
			await finishGpuErrorScopes(lease.device, 'initial WebGPU resource graph');
		} catch (error) {
			engine.dispose();
			throw error;
		}
		if (options.autoStart !== false) engine.resume();
		return engine;
	}

	private static async createPipelines(lease: WebGpuDeviceLease): Promise<PipelineGraph> {
		const shader = NATIVE_WEBGPU_SHADERS;
		const entries = await Promise.all([
			lease.pipeline('native-splat-velocity', shader.splat, 'rg16float'),
			lease.pipeline('native-splat-dye', shader.splat, 'rgba16float'),
			lease.pipeline('native-flow-source-velocity', shader.flowSource, 'rg16float'),
				lease.pipeline('native-flow-source-dye', shader.flowSource, 'rgba16float'),
				lease.pipeline('native-flow-source-scalar', shader.flowSource, 'rgba16float'),
				lease.pipeline('native-flow-outlet-velocity', shader.flowOutlet, 'rg16float'),
				lease.pipeline('native-flow-outlet-dye', shader.flowOutlet, 'rgba16float'),
				lease.pipeline('native-flow-outlet-scalar', shader.flowOutlet, 'rgba16float'),
			lease.pipeline('native-flow-force', shader.flowForce, 'rg16float'),
			lease.pipeline('native-advect-velocity', shader.advect, 'rg16float'),
			lease.pipeline('native-advect-dye', shader.advect, 'rgba16float'),
			lease.pipeline('native-advect-scalar', shader.advectScalar, 'rgba16float'),
			lease.pipeline('native-advect-maccormack', shader.advectMacCormack, 'rg16float'),
			lease.pipeline('native-prescribed-velocity', shader.prescribedField, 'rg16float'),
			lease.pipeline('native-prescribed-scalar', shader.prescribedField, 'rgba16float'),
			lease.pipeline('native-viscosity', shader.viscosity, 'rg16float'),
			lease.pipeline('native-wall-friction', shader.wallFriction, 'rg16float'),
			lease.pipeline('native-curl', shader.curl, 'r16float'),
			lease.pipeline('native-vorticity', shader.vorticity, 'rg16float'),
			lease.pipeline('native-divergence', shader.divergence, 'r16float'),
			lease.pipeline('native-pressure-paired', shader.pressurePaired, 'r16float'),
			lease.pipeline('native-pressure-single', shader.pressureSingle, 'r16float'),
			lease.pipeline('native-gradient-subtract', shader.gradientSubtract, 'rg16float'),
				lease.pipeline('native-resample-velocity', shader.resample, 'rg16float'),
				lease.pipeline('native-resample-scalar', shader.resample, 'rgba16float'),
				lease.pipeline('native-resample-pressure', shader.resample, 'r16float'),
				lease.pipeline('native-bloom-prefilter', shader.bloomPrefilter, 'rgba16float'),
				lease.pipeline('native-bloom-blur-horizontal', shader.bloomBlurHorizontal, 'rgba16float'),
				lease.pipeline('native-bloom-blur-vertical', shader.bloomBlurVertical, 'rgba16float'),
				lease.pipeline('native-sunrays', shader.sunrays, 'r16float'),
				lease.pipeline('native-display', shader.display, lease.format)
		]);
		return {
			splatVelocity: entries[0],
			splatDye: entries[1],
				flowSourceVelocity: entries[2],
				flowSourceDye: entries[3],
				flowSourceScalar: entries[4],
				flowOutletVelocity: entries[5],
				flowOutletDye: entries[6],
				flowOutletScalar: entries[7],
				flowForce: entries[8],
				advectVelocity: entries[9],
				advectDye: entries[10],
				advectScalar: entries[11],
				advectMacCormack: entries[12],
				prescribedVelocity: entries[13],
				prescribedScalar: entries[14],
				viscosity: entries[15],
				wallFriction: entries[16],
				curl: entries[17],
				vorticity: entries[18],
				divergence: entries[19],
				pressure: entries[20],
				pressureSingle: entries[21],
				gradientSubtract: entries[22],
				resampleVelocity: entries[23],
				resampleScalar: entries[24],
				resamplePressure: entries[25],
				bloomPrefilter: entries[26],
				bloomBlurHorizontal: entries[27],
				bloomBlurVertical: entries[28],
				sunrays: entries[29],
				display: entries[30]
		};
	}

	private constructor(options: NativeWebGpuFluidEngineOptions, lease: WebGpuDeviceLease, pipelines: PipelineGraph) {
		this.canvas = options.canvas;
		const context = this.canvas.getContext('webgpu');
		if (!context) {
			lease.release();
			throw new WebGpuUnavailableError('svelte-fluid: canvas.getContext(\'webgpu\') returned null', 'no-webgpu');
		}
		this.context = context;
		this.lease = lease;
		this.pipelines = pipelines;
		this.config = resolveConfig(options.config);
		this.maskResourceSignature = this.maskSignature(this.config);
		this.solidTopologySignature = this.topologySignature(this.config);
		this.prescribedResourceSignature = this.prescribedSignature(this.config.flow);
		this.scalarResourceNeeded = flowNeedsScalarField(this.config.flow);
		this.scalarLayoutSignature = flowScalarLayoutSignature(this.config.flow);
		this.activateConfiguredFlow();
		this.rng = mulberry32(this.config.seed);
		this.onDeviceLost = options.onDeviceLost;
		this.onError = options.onError;
		this.onConfigurationError = options.onConfigurationError;
		this.onAssetError = options.onAssetError;
		this.onAssetReady = options.onAssetReady;
		this.onFatalError = options.onFatalError;
		this.resetPerformanceGovernor();
		// Resource transitions use per-operation scopes below. Anything still
		// uncaptured is an invariant failure on the shared device, so every lease
		// fails closed instead of continuing with unknown GPU state.
		this.unsubscribeDeviceError = lease.onUncapturedError((error) => {
			this.failGpuWork(new Error(`svelte-fluid: uncaptured WebGPU error: ${error.message}`, { cause: error }), error);
		});
		try {
			this.sampler = lease.device.createSampler({
				label: 'svelte-fluid-linear-sampler',
				minFilter: 'linear',
				magFilter: 'linear',
				addressModeU: 'clamp-to-edge',
				addressModeV: 'clamp-to-edge'
			});
			this.nearestSampler = lease.device.createSampler({
				label: 'svelte-fluid-nearest-sampler',
				minFilter: 'nearest',
				magFilter: 'nearest',
				addressModeU: 'clamp-to-edge',
				addressModeV: 'clamp-to-edge'
			});
			this.createUniforms();
			this.configureCanvas();
			this.allocateFields();
			this.clearFields();
			this.randomSplats(this.initialRandomSplatCount());
			while (this.splats.length > 0) this.renderFrame(0, 0, false);
			for (const splat of this.config.presetSplats ?? []) {
				this.splat(splat.x, splat.y, splat.dx, splat.dy, splat.color);
			}
			while (this.splats.length > 0) this.renderFrame(0, 0, false);
			this.renderFrame(0, 0, true);
			void this.syncDistortionImage();
			void this.lease.lost.then((info) => {
				if (this.disposed) return;
				this.deviceLost = true;
				this.pause();
				this.onDeviceLost?.(info);
			});
			if (this.config.pointerInput) this.installPointerListeners();
			if (options.autoStart !== false) this.resume();
		} catch (error) {
			// Construction can fail after tracked buffers or textures exist. Dispose
			// the partially initialized instance before the lease leaves this scope.
			this.dispose();
			throw error;
		}
	}

	splat(x: number, y: number, dx: number, dy: number, color: RGB): void {
		if (this.disposed || this.deviceLost) return;
		if (![x, y, dx, dy, color.r, color.g, color.b].every(Number.isFinite)) return;
		this.solverMayContainContent = true;
		this.dyeMayContainContent = true;
		if (this.splats.length >= MAX_QUEUED_SPLATS) this.splats.shift();
		const bounded = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
		this.splats.push({
			x: bounded(x, 0, 1),
			y: 1 - bounded(y, 0, 1),
			dx: bounded(dx, -1_000_000, 1_000_000),
			dy: -bounded(dy, -1_000_000, 1_000_000),
			color: {
				r: bounded(color.r, 0, 1_000_000),
				g: bounded(color.g, 0, 1_000_000),
				b: bounded(color.b, 0, 1_000_000)
			}
		});
		this.frameDirty = true;
	}

	randomSplats(count: number): void {
		const hdr = this.config.containerShape ? Math.max(3, 10 * Math.sqrt(this.allowedAreaFraction)) : 10;
		const resolved = Number.isFinite(count) ? Math.max(0, Math.min(MAX_QUEUED_SPLATS, Math.floor(count))) : 0;
		for (let index = 0; index < resolved; index += 1) {
			const color = generateColor(this.rng);
			color.r *= hdr;
			color.g *= hdr;
			color.b *= hdr;
			let x = this.rng();
			let y = this.rng();
			let attempts = 10;
			while (attempts > 0 && !this.maskAllows(x, y)) {
				x = this.rng();
				y = this.rng();
				attempts -= 1;
			}
			if (attempts === 0) continue;
			this.splat(x, y, 1000 * (this.rng() - 0.5), 1000 * (this.rng() - 0.5), color);
		}
	}

	private initialRandomSplatCount(): number {
		if (this.config.initialSplatCount !== null) return this.config.initialSplatCount;
		const low = Math.min(this.config.initialSplatCountMin, this.config.initialSplatCountMax);
		const high = Math.max(this.config.initialSplatCountMin, this.config.initialSplatCountMax);
		return low === high ? low : Math.floor(this.rng() * (high - low + 1)) + low;
	}

	private maskAllows(x: number, y: number): boolean {
		const column = Math.max(0, Math.min(this.allowedMask.width - 1, Math.floor(x * this.allowedMask.width)));
		const row = Math.max(0, Math.min(this.allowedMask.height - 1, Math.floor((1 - y) * this.allowedMask.height)));
		return this.allowedMask.data[row * this.allowedMask.width + column]! > 127;
	}

	pause(): void {
		this.cancelFrameSubscription?.();
		this.cancelFrameSubscription = null;
		this.resetPerformanceGovernor();
	}

	resume(): void {
		if (this.disposed || this.deviceLost || this.cancelFrameSubscription) return;
		this.lastUpdateTime = performance.now();
		this.cancelFrameSubscription = subscribeFrame(this.tick, (cause) => {
			this.cancelFrameSubscription = null;
			const error = cause instanceof Error ? cause : new Error(String(cause));
			this.onFatalError?.(error);
		});
	}

	get isPaused(): boolean {
		return this.cancelFrameSubscription === null;
	}

	getPerformanceState(): PerformanceState {
		const enabled = this.config.autoPerformance;
		return {
			enabled,
			tier: enabled ? this.performanceTier : 'none',
			emaMs: enabled ? this.performanceEmaMs : 0,
			msSinceLastChange: enabled ? this.performanceMsSinceLastChange : 0,
			targetFrameMs: this.config.autoPerformanceTargetFrameMs,
			pressureIterations: this.performancePressureIterations,
			substeps: this.performanceSubsteps,
			minPressureIterations: this.config.autoPerformanceMinPressureIterations,
			minSubsteps: this.config.autoPerformanceMinSubsteps,
			lastAction: enabled ? this.performanceLastAction : 'none'
		};
	}

	/** @internal Installed graph state, excluding config and resize candidates still queued behind a fence. */
	acceptedState(): { config: FluidConfig; width: number; height: number } {
		return {
			config: this.acceptedConfigSnapshot(),
			width: this.canvas.width,
			height: this.canvas.height
		};
	}

	setConfig(patch: FluidConfig): void {
		if (this.disposed || this.deviceLost) return;
		if (this.pendingGpuWork.size > 0) {
			this.queuedConfigPatch = {
				...(this.queuedConfigPatch ?? {}),
				...snapshotFluidConfig(patch)
			};
			return;
		}
		const previous = this.config;
		const candidate = resolveConfig(patch, previous);
		let nextMaskSignature = this.maskResourceSignature;
		let nextTopologySignature = this.solidTopologySignature;
		let nextPrescribedSignature = this.prescribedResourceSignature;
		let nextScalarResourceNeeded = this.scalarResourceNeeded;
		let nextScalarLayoutSignature = this.scalarLayoutSignature;
		let maskChanged = false;
		let solidTopologyChanged = false;
		let pointerChanged = false;
		let distortionImageChanged = false;
		let performanceChanged = false;
		let finishScopedWork: (() => void) | null = null;
		try {
			nextMaskSignature = this.maskSignature(candidate);
			maskChanged = this.maskResourceSignature !== nextMaskSignature;
			nextTopologySignature = this.topologySignature(candidate);
			solidTopologyChanged = this.solidTopologySignature !== nextTopologySignature;
			pointerChanged =
				previous.pointerInput !== candidate.pointerInput || previous.pointerTarget !== candidate.pointerTarget;
			nextScalarResourceNeeded = flowNeedsScalarField(candidate.flow);
			const scalarNeedChanged = this.scalarResourceNeeded !== nextScalarResourceNeeded;
			nextScalarLayoutSignature = flowScalarLayoutSignature(candidate.flow);
			const scalarLayoutChanged = this.scalarLayoutSignature !== nextScalarLayoutSignature;
			nextPrescribedSignature = this.prescribedSignature(candidate.flow);
			const prescribedChanged = this.prescribedResourceSignature !== nextPrescribedSignature;
			const presentationTargetsChanged =
				previous.bloom !== candidate.bloom ||
				previous.bloomResolution !== candidate.bloomResolution ||
				previous.sunrays !== candidate.sunrays ||
				previous.sunraysResolution !== candidate.sunraysResolution ||
				previous.distortion !== candidate.distortion;
			distortionImageChanged =
				previous.distortion !== candidate.distortion || previous.distortionImageUrl !== candidate.distortionImageUrl;
			performanceChanged =
				previous.autoPerformance !== candidate.autoPerformance ||
				previous.autoPerformanceTargetFrameMs !== candidate.autoPerformanceTargetFrameMs ||
				previous.autoPerformanceMinPressureIterations !== candidate.autoPerformanceMinPressureIterations ||
				previous.autoPerformanceMinSubsteps !== candidate.autoPerformanceMinSubsteps ||
				previous.pressureIterations !== candidate.pressureIterations ||
				previous.substeps !== candidate.substeps;
			const canvasModeChanged =
				previous.transparent !== candidate.transparent ||
				previous.reveal !== candidate.reveal ||
				previous.distortion !== candidate.distortion;
			const resolutionChanged =
				previous.simResolution !== candidate.simResolution || previous.dyeResolution !== candidate.dyeResolution;
			const isolatedResourceChanges =
				Number(maskChanged) + Number(prescribedChanged) + Number(presentationTargetsChanged);
			if (resolutionChanged || scalarNeedChanged || scalarLayoutChanged || isolatedResourceChanges > 0) {
				finishScopedWork = this.beginScopedGpuWork('configuration resource update');
			}
			this.config = candidate;
			if (canvasModeChanged) this.configureCanvas();
			if (solidTopologyChanged) {
				this.reallocateFieldsPreservingState(false);
			} else if (resolutionChanged || scalarNeedChanged || scalarLayoutChanged || isolatedResourceChanges > 1) {
				// Packed scalar values have no meaning after a channel-owner change.
				// Preserve velocity/dye/pressure, but start the new scalar layout empty.
				this.reallocateFieldsPreservingState(true, !scalarLayoutChanged);
			} else if (maskChanged) {
				this.replaceMaskResources();
			} else if (prescribedChanged) {
				this.replacePrescribedResources();
			} else if (presentationTargetsChanged) {
				this.replacePresentationResources();
			}
		} catch (error) {
			this.config = previous;
			this.configureCanvas();
			throw error;
		} finally {
			finishScopedWork?.();
		}
		this.scalarResourceNeeded = nextScalarResourceNeeded;
		this.scalarLayoutSignature = nextScalarLayoutSignature;
		this.maskResourceSignature = nextMaskSignature;
		this.solidTopologySignature = nextTopologySignature;
		this.prescribedResourceSignature = nextPrescribedSignature;
		this.activateConfiguredFlow();
		if (distortionImageChanged) void this.syncDistortionImage();
		if (performanceChanged) this.resetPerformanceGovernor();
		if (pointerChanged) {
			this.removePointerListeners();
			this.resetPointerGestures();
			if (this.config.pointerInput) this.installPointerListeners();
		}
		this.frameDirty = true;
	}

	resize(width: number, height: number): boolean {
		if (this.disposed || !Number.isFinite(width) || !Number.isFinite(height)) return false;
		const limit = this.lease.device.limits.maxTextureDimension2D;
		const nextWidth = Math.max(1, Math.min(limit, Math.floor(width)));
		const nextHeight = Math.max(1, Math.min(limit, Math.floor(height)));
		if (this.pendingGpuWork.size > 0) {
			const previous = this.queuedResize ?? [this.canvas.width, this.canvas.height];
			const changed = previous[0] !== nextWidth || previous[1] !== nextHeight;
			this.queuedResize = [nextWidth, nextHeight];
			return changed;
		}
		const canvasChanged = this.canvas.width !== nextWidth || this.canvas.height !== nextHeight;
		const previousWidth = this.canvas.width;
		const previousHeight = this.canvas.height;
		const nextSim = resolutionFor(this.config.simResolution, nextWidth, nextHeight, limit);
		const nextDye = resolutionFor(this.config.dyeResolution, nextWidth, nextHeight, limit);
		const fieldsChanged =
			nextSim[0] !== this.simSize[0] ||
			nextSim[1] !== this.simSize[1] ||
			nextDye[0] !== this.dyeSize[0] ||
			nextDye[1] !== this.dyeSize[1];
		if (!canvasChanged && !fieldsChanged) return false;
		const finishScopedWork = this.beginScopedGpuWork('canvas resize');
		try {
			if (canvasChanged) {
				this.canvas.width = nextWidth;
				this.canvas.height = nextHeight;
				this.configureCanvas();
			}
			// CSS/DPR-only size changes frequently leave every owned texture extent
			// unchanged. Reconfigure the swap chain without duplicating the field graph.
			if (fieldsChanged) this.reallocateFieldsPreservingState();
		} catch (error) {
			if (canvasChanged) {
				this.canvas.width = previousWidth;
				this.canvas.height = previousHeight;
				this.configureCanvas();
			}
			throw error;
		} finally {
			finishScopedWork();
		}
		this.frameDirty = true;
		return true;
	}

	advance(steps: number, dt: number): void {
		this.advanceDeterministic(steps, dt, true);
	}

	/** @internal Deterministic live-frame mirror for production workload probes. */
	advanceFrames(frames: number, elapsed: number): void {
		if (this.disposed || this.deviceLost) return;
		const count = Number.isFinite(frames) ? Math.max(0, Math.min(10_000, Math.floor(frames))) : 0;
		const frameDt = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
		this.deterministicAdvance = true;
		try {
			for (let index = 0; index < count; index += 1) {
				this.updateInputs(frameDt);
				const active = this.solverMayContainContent || flowCanDriveSolver(this.config.flow) || this.splats.length > 0;
				if ((!this.config.paused && active) || this.frameDirty || this.splats.length > 0) {
					const bounded = Math.min(frameDt, this.config.maxTimeStep * this.config.substeps);
					const requiredSteps = Math.max(1, Math.ceil(bounded / this.config.maxTimeStep));
					const steps = this.config.paused ? 0 : Math.max(this.config.substeps, requiredSteps);
					this.renderFrame(steps, steps > 0 ? bounded / steps : 0, true);
				}
			}
		} finally {
			this.deterministicAdvance = false;
		}
	}

	/** @internal Solver-only deterministic path for accuracy-gated timing. */
	advanceSolver(steps: number, dt: number): void {
		this.advanceDeterministic(steps, dt, false);
	}

	private advanceDeterministic(steps: number, dt: number, present: boolean): void {
		if (this.disposed || this.deviceLost) return;
		const count = Number.isFinite(steps) ? Math.max(0, Math.min(10_000, Math.floor(steps))) : 0;
		const stepDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
		this.deterministicAdvance = true;
		try {
			const active = this.solverMayContainContent || flowCanDriveSolver(this.config.flow) || this.splats.length > 0;
			if (!active) {
				if (present && this.frameDirty) this.renderFrame(0, 0, true);
				return;
			}
			// The live runtime submits once per rendered frame. A giant 36–60-step
			// command buffer benchmarked substantially slower on Metal and is not a
			// representative execution mode, so deterministic replay mirrors the live
			// submission cadence and presents once after the solver tape.
			for (let index = 0; index < count; index += 1) this.renderFrame(1, stepDt, false);
			if (present) this.renderFrame(0, 0, true);
		} finally {
			this.deterministicAdvance = false;
		}
	}

	async readField(field: 'velocity' | 'dye' | 'scalar' | 'pressure'): Promise<NativeWebGpuFieldResult> {
		if (this.disposed || this.deviceLost) throw new Error('svelte-fluid: WebGPU field is unavailable');
		if (field === 'scalar' && !this.scalar) throw new Error('svelte-fluid: scalar field is not configured');
		const target =
			field === 'velocity'
				? this.velocity.read
				: field === 'dye'
					? this.dye.read
					: field === 'scalar'
						? this.scalar!.read
						: this.pressure.read;
		const components = field === 'velocity' ? 2 : field === 'pressure' ? 1 : 4;
		const bytesPerPixel = components * 2;
		const bytesPerRow = Math.ceil((target.width * bytesPerPixel) / 256) * 256;
		const staging = createTrackedBuffer(
			this.lease.device,
			this.lease.tracker,
			bytesPerRow * target.height,
			GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
			`svelte-fluid-read-${field}`
		);
		const encoder = this.lease.device.createCommandEncoder({
			label: `svelte-fluid-read-${field}`
		});
		encoder.copyTextureToBuffer(
			{ texture: target.texture },
			{ buffer: staging.buffer, bytesPerRow, rowsPerImage: target.height },
			[target.width, target.height]
		);
		this.lease.device.queue.submit([encoder.finish()]);
		try {
			await staging.buffer.mapAsync(GPUMapMode.READ);
			const mapped = new Uint16Array(staging.buffer.getMappedRange());
			const rowValues = bytesPerRow / 2;
			const output = new Float32Array(target.width * target.height * components);
			for (let y = 0; y < target.height; y += 1) {
				for (let x = 0; x < target.width * components; x += 1) {
					output[y * target.width * components + x] = float16(mapped[y * rowValues + x]!);
				}
			}
			return {
				data: output,
				width: target.width,
				height: target.height,
				components
			};
		} finally {
			if (staging.buffer.mapState === 'mapped') staging.buffer.unmap();
			staging.destroy();
		}
	}

	resourceSnapshot(): WebGpuDeviceSnapshot {
		return this.lease.snapshot();
	}

	/** @internal Deterministic completion fence for tests, startup, and lifecycle probes. */
	async awaitIdle(): Promise<void> {
		while (this.pendingGpuWork.size > 0 || this.queuedConfigPatch || this.queuedResize) {
			if (this.pendingGpuWork.size > 0) await Promise.all(this.pendingGpuWork);
			else this.flushQueuedTransitions();
		}
		await this.lease.device.queue.onSubmittedWorkDone();
		if (this.terminalError) throw this.terminalError;
	}

	/** @internal Fault injection for the R&D lifecycle route. */
	forceDeviceLoss(): void {
		if (this.disposed || this.deviceLost) return;
		this.lease.device.destroy();
	}

	/** @internal Number of submitted rendered frames, excluding readback fences. */
	frameSubmissions(): number {
		return this.frameSubmissionCount;
	}

	/** @internal Bounded-input invariant used by the hardware suite. */
	pendingSplatCount(): number {
		return this.splats.length;
	}

	/** @internal Physics and visual mask extents for fidelity/lifecycle probes. */
	maskExtents(): { physics: readonly [number, number]; visual: readonly [number, number] } {
		return {
			physics: [this.maskTexture.width, this.maskTexture.height],
			visual: [this.visualMaskTexture.width, this.visualMaskTexture.height]
		};
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.pause();
		this.removePointerListeners();
		this.resetPointerGestures();
		this.distortionLoadToken += 1;
		this.distortionAbort?.abort();
		this.distortionAbort = null;
		this.queuedConfigPatch = null;
		this.queuedResize = null;
		this.distortionTexture?.destroy();
		this.distortionTexture = null;
		this.destroyFields();
		for (const uniform of this.uniforms) uniform.destroy();
		this.uniforms.length = 0;
		this.splatVelocityUniforms.length = 0;
		this.splatDyeUniforms.length = 0;
		this.context.unconfigure();
		this.unsubscribeDeviceError();
		this.lease.release();
	}

	private createUniform(size: number, usage = UNIFORM_USAGE, label = 'uniform'): UniformBuffer {
		const uniform = createTrackedBuffer(this.lease.device, this.lease.tracker, size, usage, `svelte-fluid-${label}`);
		this.uniforms.push(uniform);
		return uniform;
	}

	private batchUniform(pool: UniformBuffer[], index: number, size: number, label: string): UniformBuffer {
		while (pool.length <= index) pool.push(this.createUniform(size, UNIFORM_USAGE, `${label}-${pool.length}`));
		return pool[index]!;
	}

	private createUniforms(): void {
		this.advectVelocityUniform = this.createUniform(32, UNIFORM_USAGE, 'advect-velocity-uniform');
		this.advectDyeUniform = this.createUniform(32, UNIFORM_USAGE, 'advect-dye-uniform');
		this.advectScalarUniform = this.createUniform(32, UNIFORM_USAGE, 'advect-scalar-uniform');
		this.macCormackUniform = this.createUniform(48, UNIFORM_USAGE, 'maccormack-uniform');
		this.prescribedVelocityUniform = this.createUniform(16, UNIFORM_USAGE, 'prescribed-velocity-uniform');
		this.prescribedScalarUniforms.push(this.createUniform(16, UNIFORM_USAGE, 'prescribed-scalar-uniform-0'));
		this.flowSourceVelocityUniforms.push(this.createUniform(1040, UNIFORM_USAGE, 'flow-source-velocity-uniform-0'));
		this.flowSourceDyeUniforms.push(this.createUniform(1040, UNIFORM_USAGE, 'flow-source-dye-uniform-0'));
		this.flowSourceScalarUniforms.push(this.createUniform(1040, UNIFORM_USAGE, 'flow-source-scalar-uniform-0'));
		this.flowOutletVelocityUniforms.push(this.createUniform(528, UNIFORM_USAGE, 'flow-outlet-velocity-uniform-0'));
		this.flowOutletDyeUniforms.push(this.createUniform(528, UNIFORM_USAGE, 'flow-outlet-dye-uniform-0'));
		this.flowOutletScalarUniforms.push(this.createUniform(528, UNIFORM_USAGE, 'flow-outlet-scalar-uniform-0'));
		this.flowForceUniforms.push(this.createUniform(32, UNIFORM_USAGE, 'flow-force-uniform-0'));
		this.vorticityUniform = this.createUniform(16, UNIFORM_USAGE, 'vorticity-uniform');
		this.viscosityUniform = this.createUniform(16, UNIFORM_USAGE, 'viscosity-uniform');
		this.wallFrictionUniform = this.createUniform(16, UNIFORM_USAGE, 'wall-friction-uniform');
		this.boundaryUniform = this.createUniform(16, UNIFORM_USAGE, 'boundary-uniform');
		this.pressureFirstUniform = this.createUniform(16, UNIFORM_USAGE, 'pressure-first-uniform');
		this.pressureSteadyUniform = this.createUniform(16, UNIFORM_USAGE, 'pressure-steady-uniform');
		this.displayUniform = this.createUniform(224, UNIFORM_USAGE, 'display-uniform');
		this.bloomPrefilterUniform = this.createUniform(16, UNIFORM_USAGE, 'bloom-prefilter-uniform');
		for (let index = 0; index < MAX_SPLATS_PER_FRAME; index += 1) {
			this.splatVelocityUniforms.push(this.createUniform(32, UNIFORM_USAGE, `splat-${index}-velocity-uniform`));
			this.splatDyeUniforms.push(this.createUniform(32, UNIFORM_USAGE, `splat-${index}-dye-uniform`));
		}
	}

	private configureCanvas(): void {
		this.context.configure({
			device: this.lease.device,
			format: this.lease.format,
			alphaMode: this.config.transparent || this.config.reveal || this.config.distortion ? 'premultiplied' : 'opaque'
		});
	}

	private allocateFields(): void {
		const limit = this.lease.device.limits.maxTextureDimension2D;
		const simSize = resolutionFor(this.config.simResolution, this.canvas.width, this.canvas.height, limit);
		const dyeSize = resolutionFor(this.config.dyeResolution, this.canvas.width, this.canvas.height, limit);
		this.installFieldResources(this.createFieldResources(simSize, dyeSize));
	}

	private createFieldResources(simSize: [number, number], dyeSize: [number, number]): FieldResources {
		this.assertFieldGraphBudget(simSize, dyeSize);
		const stickyRaster = this.rasterizeConfiguredStickyMask();
		let mask: MaskResources | null = null;
		let visualMask: WebGpuTarget | null = null;
		let velocity: WebGpuDoubleTarget | null = null;
		let velocitySource: WebGpuTarget | null = null;
		let dye: WebGpuDoubleTarget | null = null;
		let scalar: WebGpuDoubleTarget | null = null;
		let pressure: WebGpuDoubleTarget | null = null;
		let divergence: WebGpuTarget | null = null;
		let curl: WebGpuTarget | null = null;
		let prescribed: PrescribedResources | null = null;
		let bloom: WebGpuDoubleTarget | null = null;
		let sunrays: WebGpuTarget | null = null;
		try {
			mask = this.createMaskResources(simSize, false, stickyRaster);
			visualMask = this.createVisualMaskTexture(mask.texture, dyeSize, stickyRaster);
			velocity = createDoubleTarget(
				this.lease.device,
				this.lease.tracker,
				simSize[0],
				simSize[1],
				'rg16float',
				'svelte-fluid-velocity'
			);
			velocitySource = createTarget(
				this.lease.device,
				this.lease.tracker,
				simSize[0],
				simSize[1],
				'rg16float',
				'svelte-fluid-velocity-source'
			);
			dye = createDoubleTarget(
				this.lease.device,
				this.lease.tracker,
				dyeSize[0],
				dyeSize[1],
				'rgba16float',
				'svelte-fluid-dye'
			);
			if (flowNeedsScalarField(this.config.flow)) {
				scalar = createDoubleTarget(
					this.lease.device,
					this.lease.tracker,
					simSize[0],
					simSize[1],
					'rgba16float',
					'svelte-fluid-scalar'
				);
			}
			pressure = createDoubleTarget(
				this.lease.device,
				this.lease.tracker,
				simSize[0],
				simSize[1],
				'r16float',
				'svelte-fluid-pressure'
			);
			divergence = createTarget(
				this.lease.device,
				this.lease.tracker,
				simSize[0],
				simSize[1],
				'r16float',
				'svelte-fluid-divergence'
			);
			curl = createTarget(
				this.lease.device,
				this.lease.tracker,
				simSize[0],
				simSize[1],
				'r16float',
				'svelte-fluid-curl'
			);
			prescribed = this.createPrescribedResources();
			({ bloom, sunrays } = this.createPresentationResources(simSize, dyeSize));
			return {
				simSize,
				dyeSize,
				mask,
				visualMask,
				velocity,
				velocitySource,
				dye,
				scalar,
				pressure,
				divergence,
				curl,
				prescribed,
				bloom,
				sunrays
			};
		} catch (error) {
			if (visualMask && visualMask !== mask?.texture) visualMask.destroy();
			mask?.texture.destroy();
			velocity?.destroy();
			velocitySource?.destroy();
			dye?.destroy();
			scalar?.destroy();
			pressure?.destroy();
			divergence?.destroy();
			curl?.destroy();
			prescribed?.velocity?.destroy();
			for (const resource of prescribed?.scalars ?? []) resource.texture.destroy();
			bloom?.destroy();
			sunrays?.destroy();
			throw error;
		}
	}

	private currentFieldResources(): FieldResources {
		return {
			simSize: this.simSize,
			dyeSize: this.dyeSize,
			mask: {
				texture: this.maskTexture,
				allowedMask: this.allowedMask,
				allowedAreaFraction: this.allowedAreaFraction
			},
			visualMask: this.visualMaskTexture,
			velocity: this.velocity,
			velocitySource: this.velocitySource,
			dye: this.dye,
			scalar: this.scalar,
			pressure: this.pressure,
			divergence: this.divergence,
			curl: this.curlTarget,
			prescribed: {
				velocity: this.prescribedVelocityTexture,
				scalars: this.prescribedScalarResources,
				velocityScale: this.prescribedVelocityScale
			},
			bloom: this.bloomTarget,
			sunrays: this.sunraysTarget
		};
	}

	private installFieldResources(fields: FieldResources): void {
		this.simSize = fields.simSize;
		this.dyeSize = fields.dyeSize;
		this.maskTexture = fields.mask.texture;
		this.visualMaskTexture = fields.visualMask;
		this.allowedMask = fields.mask.allowedMask;
		this.allowedAreaFraction = fields.mask.allowedAreaFraction;
		this.velocity = fields.velocity;
		this.velocitySource = fields.velocitySource;
		this.dye = fields.dye;
		this.scalar = fields.scalar;
		this.pressure = fields.pressure;
		this.divergence = fields.divergence;
		this.curlTarget = fields.curl;
		this.prescribedVelocityTexture = fields.prescribed.velocity;
		this.prescribedScalarResources = fields.prescribed.scalars;
		this.prescribedVelocityScale = fields.prescribed.velocityScale;
		this.bloomTarget = fields.bloom;
		this.sunraysTarget = fields.sunrays;
		this.fieldsInstalled = true;
		this.bindGroups.clear();
	}

	private destroyFieldResources(fields: FieldResources): void {
		if (fields.visualMask !== fields.mask.texture) fields.visualMask.destroy();
		fields.mask.texture.destroy();
		fields.velocity.destroy();
		fields.velocitySource.destroy();
		fields.dye.destroy();
		fields.scalar?.destroy();
		fields.pressure.destroy();
		fields.divergence.destroy();
		fields.curl.destroy();
		fields.prescribed.velocity?.destroy();
		for (const resource of fields.prescribed.scalars) resource.texture.destroy();
		fields.bloom?.destroy();
		fields.sunrays?.destroy();
	}

	private destroyFields(): void {
		this.bindGroups.clear();
		if (!this.fieldsInstalled) return;
		this.destroyFieldResources(this.currentFieldResources());
		this.fieldsInstalled = false;
		this.scalar = null;
		this.prescribedVelocityTexture = null;
		this.prescribedScalarResources = [];
		this.bloomTarget = null;
		this.sunraysTarget = null;
	}

	private replaceMaskResources(): void {
		this.assertFieldGraphBudget(this.simSize, this.dyeSize);
		this.assertTransitionBudget(this.estimateMaskBytes(this.simSize, this.dyeSize));
		const previous = this.maskTexture;
		const previousVisual = this.visualMaskTexture;
		const stickyRaster = this.rasterizeConfiguredStickyMask();
		const replacement = this.createMaskResources(this.simSize, false, stickyRaster);
		let visual: WebGpuTarget;
		try {
			visual = this.createVisualMaskTexture(replacement.texture, this.dyeSize, stickyRaster);
		} catch (error) {
			replacement.texture.destroy();
			throw error;
		}
		this.maskTexture = replacement.texture;
		this.visualMaskTexture = visual;
		this.allowedMask = replacement.allowedMask;
		this.allowedAreaFraction = replacement.allowedAreaFraction;
		this.bindGroups.clear();
		previous.destroy();
		if (previousVisual !== previous) previousVisual.destroy();
	}

	private createVisualMaskTexture(
		physicsMask: WebGpuTarget,
		dyeSize: [number, number],
		stickyRaster: StickyMaskRaster | null
	): WebGpuTarget {
		const size = this.visualMaskSize(dyeSize);
		if (physicsMask.width === size[0] && physicsMask.height === size[1]) return physicsMask;
		return this.createMaskResources(size, true, stickyRaster).texture;
	}

	private rasterizeConfiguredStickyMask(): StickyMaskRaster | null {
		const hasSticky = this.config.sticky && !!(this.config.stickyMask?.d || this.config.stickyMask?.text);
		return hasSticky
			? rasterizeStickyMask(this.config.stickyMask!, this.canvas.width, this.canvas.height)
			: null;
	}

	private visualMaskSize(dyeSize: [number, number]): [number, number] {
		const hasGeometry = !!this.config.containerShape || (this.config.obstructions?.length ?? 0) > 0;
		const hasSticky = this.config.sticky && !!(this.config.stickyMask?.d || this.config.stickyMask?.text);
		if (!hasGeometry && !hasSticky) return [1, 1];
		const dyeLongest = Math.max(dyeSize[0], dyeSize[1]);
		const limit = Math.min(4096, this.lease.device.limits.maxTextureDimension2D);
		const containerResolution =
			this.config.containerShape?.type === 'svgPath'
				? resolveMaskResolution(this.config.containerShape.maskResolution, limit)
				: this.config.containerShape
					? dyeLongest
					: 0;
		const stickyResolution = hasSticky
			? resolveMaskResolution(this.config.stickyMask?.maskResolution, limit)
			: 0;
		const base = Math.max(containerResolution, this.config.obstructions?.length ? dyeLongest : 0, stickyResolution);
		const longest = Math.max(1, Math.min(limit, Math.round(base)));
		const aspect = this.canvas.width / Math.max(1, this.canvas.height);
		return aspect >= 1
			? [longest, Math.max(1, Math.round(longest / aspect))]
			: [Math.max(1, Math.round(longest * aspect)), longest];
	}

	private estimateFieldGraphBytes(simSize: [number, number], dyeSize: [number, number]): number {
		const simPixels = simSize[0] * simSize[1];
		const dyePixels = dyeSize[0] * dyeSize[1];
		const visualSize = this.visualMaskSize(dyeSize);
		let bytes = simPixels * (24 + (flowNeedsScalarField(this.config.flow) ? 16 : 0));
		bytes += dyePixels * 16 + visualSize[0] * visualSize[1] * 4;
		const limit = this.lease.device.limits.maxTextureDimension2D;
		if (this.config.bloom && !this.config.distortion) {
			const bloom = resolutionFor(this.config.bloomResolution, this.canvas.width, this.canvas.height, limit);
			bytes += bloom[0] * bloom[1] * 16;
		}
		if (this.config.sunrays && !this.config.distortion) {
			const sunrays = resolutionFor(this.config.sunraysResolution, this.canvas.width, this.canvas.height, limit);
			bytes += sunrays[0] * sunrays[1] * 2;
		}
		const prescribed = this.config.flow?.prescribed;
		if (prescribed?.kind === 'grid') {
			for (const field of [prescribed.velocity, ...Object.values(prescribed.scalars ?? {})]) {
				if (!field) continue;
				bytes += Math.max(1, Math.floor(field.width)) * Math.max(1, Math.floor(field.height)) * 4;
			}
		}
		return bytes;
	}

	private estimateMaskBytes(simSize: [number, number], dyeSize: [number, number]): number {
		const hasMask =
			!!this.config.containerShape ||
			(this.config.obstructions?.length ?? 0) > 0 ||
			(this.config.sticky && !!(this.config.stickyMask?.d || this.config.stickyMask?.text));
		if (!hasMask) return 4;
		const visual = this.visualMaskSize(dyeSize);
		const physicsPixels = simSize[0] * simSize[1];
		const visualPixels = visual[0] * visual[1];
		return (physicsPixels + (visual[0] === simSize[0] && visual[1] === simSize[1] ? 0 : visualPixels)) * 4;
	}

	private estimatePrescribedBytes(): number {
		const prescribed = this.config.flow?.prescribed;
		if (!prescribed || prescribed.kind !== 'grid') return 0;
		return [prescribed.velocity, ...Object.values(prescribed.scalars ?? {})].reduce(
			(bytes, field) =>
				bytes + (field ? Math.max(1, Math.floor(field.width)) * Math.max(1, Math.floor(field.height)) * 4 : 0),
			0
		);
	}

	private estimatePresentationBytes(): number {
		const limit = this.lease.device.limits.maxTextureDimension2D;
		let bytes = 0;
		if (this.config.bloom && !this.config.distortion) {
			const size = resolutionFor(this.config.bloomResolution, this.canvas.width, this.canvas.height, limit);
			bytes += size[0] * size[1] * 16;
		}
		if (this.config.sunrays && !this.config.distortion) {
			const size = resolutionFor(this.config.sunraysResolution, this.canvas.width, this.canvas.height, limit);
			bytes += size[0] * size[1] * 2;
		}
		return bytes;
	}

	private assertFieldGraphBudget(simSize: [number, number], dyeSize: [number, number]): void {
		const bytes = this.estimateFieldGraphBytes(simSize, dyeSize) +
			(this.distortionTexture ? textureByteSize(this.distortionTexture) : 0);
		if (bytes > MAX_INSTANCE_FIELD_BYTES) {
			throw new RangeError(
				`svelte-fluid: requested persistent GPU textures are approximately ${Math.ceil(bytes / 1024 / 1024)} MiB; ` +
					`the per-instance safety limit is ${MAX_INSTANCE_FIELD_BYTES / 1024 / 1024} MiB`
			);
		}
	}

	private currentFieldGraphBytes(): number {
		if (!this.fieldsInstalled) return 0;
		const fields = this.currentFieldResources();
		const targets = [
			fields.mask.texture,
			fields.visualMask,
			fields.velocity.read,
			fields.velocity.write,
			fields.velocitySource,
			fields.dye.read,
			fields.dye.write,
			...(fields.scalar ? [fields.scalar.read, fields.scalar.write] : []),
			fields.pressure.read,
			fields.pressure.write,
			fields.divergence,
			fields.curl,
			...(fields.prescribed.velocity ? [fields.prescribed.velocity] : []),
			...fields.prescribed.scalars.map((resource) => resource.texture),
			...(fields.bloom ? [fields.bloom.read, fields.bloom.write] : []),
			...(fields.sunrays ? [fields.sunrays] : [])
		];
		const seen = new Set<GPUTexture>();
		let bytes = 0;
		for (const target of targets) {
			if (seen.has(target.texture)) continue;
			seen.add(target.texture);
			bytes += textureByteSize(target);
		}
		return bytes;
	}

	private assertTransitionBudget(candidateBytes: number): void {
		const bytes = this.currentFieldGraphBytes() +
			(this.distortionTexture ? textureByteSize(this.distortionTexture) : 0) +
			candidateBytes;
		if (bytes > MAX_INSTANCE_TRANSITION_BYTES) {
			throw new RangeError(
				`svelte-fluid: GPU texture transition would peak near ${Math.ceil(bytes / 1024 / 1024)} MiB; ` +
					`the per-instance transition limit is ${MAX_INSTANCE_TRANSITION_BYTES / 1024 / 1024} MiB`
			);
		}
	}

	private createMaskResources(
		simSize: [number, number],
		visual = false,
		stickyRaster: StickyMaskRaster | null = this.rasterizeConfiguredStickyMask()
	): MaskResources {
		const hasGeometry = !!this.config.containerShape || (this.config.obstructions?.length ?? 0) > 0;
		const hasSticky = this.config.sticky && !!(this.config.stickyMask?.d || this.config.stickyMask?.text);
		if (!hasGeometry && !hasSticky) {
			return {
				allowedMask: { data: new Uint8Array([255]), width: 1, height: 1 },
				allowedAreaFraction: 1,
				texture: createMaskTexture(
					this.lease.device,
					this.lease.tracker,
					1,
					1,
					// All-fluid identity with maximum encoded solid clearance.
					new Uint8Array([224, 255, 0, 0]),
					'svelte-fluid-mask-identity'
				)
			};
		}
		const fields = hasGeometry
			? buildCanonicalMaskFields({
					containerShape: this.config.containerShape,
					obstructions: this.config.obstructions,
					openBoundary: this.config.openBoundary,
					width: simSize[0],
					height: simSize[1]
				})
			: {
					solid: { data: new Uint8Array(simSize[0] * simSize[1]), width: simSize[0], height: simSize[1] },
					allowed: {
						data: new Uint8Array(simSize[0] * simSize[1]).fill(255),
						width: simSize[0],
						height: simSize[1]
					},
					obstruction: {
						data: new Uint8Array(simSize[0] * simSize[1]),
						width: simSize[0],
						height: simSize[1]
					}
				};
		let allowedCells = 0;
		for (const value of fields.allowed.data) if (value > 127) allowedCells += 1;
		const sticky = hasSticky && stickyRaster
			? resampleStickyMask(stickyRaster, simSize[0], simSize[1])
			: null;
		const data = visual ? packVisualMaskTextureData(fields, sticky) : packCanonicalMaskTextureData(fields, sticky);
		return {
			allowedMask: fields.allowed,
			allowedAreaFraction: allowedCells / fields.allowed.data.length,
			texture: createMaskTexture(
				this.lease.device,
				this.lease.tracker,
				simSize[0],
				simSize[1],
				data,
				'svelte-fluid-canonical-mask'
			)
		};
	}

	private clearFields(): void {
		const encoder = this.lease.device.createCommandEncoder({
			label: 'svelte-fluid-clear'
		});
		for (const target of [
			this.velocity.read,
			this.velocity.write,
			this.velocitySource,
			this.dye.read,
			this.dye.write,
			this.pressure.read,
			this.pressure.write,
			this.divergence,
			this.curlTarget
		].concat(this.scalar ? [this.scalar.read, this.scalar.write] : [])) {
			const pass = encoder.beginRenderPass({
				colorAttachments: [
					{
						view: target.view,
						loadOp: 'clear',
						storeOp: 'store',
						clearValue: { r: 0, g: 0, b: 0, a: 0 }
					}
				]
			});
			pass.end();
		}
		this.lease.device.queue.submit([encoder.finish()]);
	}

	private clearTarget(encoder: GPUCommandEncoder, target: WebGpuTarget): void {
		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{ view: target.view, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }
			]
		});
		pass.end();
	}

	private resampleTarget(
		encoder: GPUCommandEncoder,
		pipeline: GPURenderPipeline,
		source: WebGpuTarget,
		target: WebGpuTarget,
		label: string
	): void {
		this.pass(
			encoder,
			pipeline,
			target.view,
			[
				{ binding: 0, resource: source.view },
				{ binding: 1, resource: this.sampler }
			],
			label
		);
	}

	private reallocateFieldsPreservingState(preserve = true, preserveScalar = preserve): void {
		const previous = this.currentFieldResources();
		const limit = this.lease.device.limits.maxTextureDimension2D;
		const simSize = resolutionFor(this.config.simResolution, this.canvas.width, this.canvas.height, limit);
		const dyeSize = resolutionFor(this.config.dyeResolution, this.canvas.width, this.canvas.height, limit);
		this.assertTransitionBudget(this.estimateFieldGraphBytes(simSize, dyeSize));
		const replacement = this.createFieldResources(simSize, dyeSize);
		try {
			const encoder = this.lease.device.createCommandEncoder({ label: 'svelte-fluid-resize-preserve' });
			if (preserve) {
				this.resampleTarget(
					encoder,
					this.pipelines.resampleVelocity,
					previous.velocity.read,
					replacement.velocity.read,
					'svelte-fluid-resize-velocity'
				);
				this.resampleTarget(
					encoder,
					this.pipelines.resampleScalar,
					previous.dye.read,
					replacement.dye.read,
					'svelte-fluid-resize-dye'
				);
				this.resampleTarget(
					encoder,
					this.pipelines.resamplePressure,
					previous.pressure.read,
					replacement.pressure.read,
					'svelte-fluid-resize-pressure'
				);
				if (preserveScalar && previous.scalar && replacement.scalar) {
					this.resampleTarget(
						encoder,
						this.pipelines.resampleScalar,
						previous.scalar.read,
						replacement.scalar.read,
						'svelte-fluid-resize-scalar'
					);
				} else if (replacement.scalar) this.clearTarget(encoder, replacement.scalar.read);
			} else {
				for (const target of [
					replacement.velocity.read,
					replacement.dye.read,
					replacement.pressure.read,
					...(replacement.scalar ? [replacement.scalar.read] : [])
				])
					this.clearTarget(encoder, target);
			}
			for (const target of [
				replacement.velocity.write,
				replacement.velocitySource,
				replacement.dye.write,
				replacement.pressure.write,
				replacement.divergence,
				replacement.curl,
				...(replacement.scalar ? [replacement.scalar.write] : [])
			])
				this.clearTarget(encoder, target);
			this.lease.device.queue.submit([encoder.finish()]);
		} catch (error) {
			this.bindGroups.clear();
			this.destroyFieldResources(replacement);
			throw error;
		}
		this.installFieldResources(replacement);
		this.destroyFieldResources(previous);
		if (!preserve) {
			this.solverMayContainContent = flowCanDriveSolver(this.config.flow) || this.splats.length > 0;
			this.dyeMayContainContent = !!this.config.flow?.sources?.some((source) => source.dye) || this.splats.length > 0;
		}
		/*
		 * Queue submission is ordered, so the old textures remain valid until all
		 * resampling commands that reference them have completed even after destroy().
		 */
	}

	private createPresentationResources(
		simSize: [number, number] = this.simSize,
		dyeSize: [number, number] = this.dyeSize
	): {
		bloom: WebGpuDoubleTarget | null;
		sunrays: WebGpuTarget | null;
	} {
		const limit = this.lease.device.limits.maxTextureDimension2D;
		let bloom: WebGpuDoubleTarget | null = null;
		let sunrays: WebGpuTarget | null = null;
		try {
			this.assertFieldGraphBudget(simSize, dyeSize);
			if (this.config.bloom && !this.config.distortion) {
				const size = resolutionFor(this.config.bloomResolution, this.canvas.width, this.canvas.height, limit);
				bloom = createDoubleTarget(
					this.lease.device,
					this.lease.tracker,
					size[0],
					size[1],
					'rgba16float',
					'svelte-fluid-bloom'
				);
			}
			if (this.config.sunrays && !this.config.distortion) {
				const size = resolutionFor(this.config.sunraysResolution, this.canvas.width, this.canvas.height, limit);
				sunrays = createTarget(
					this.lease.device,
					this.lease.tracker,
					size[0],
					size[1],
					'r16float',
					'svelte-fluid-sunrays'
				);
			}
			return { bloom, sunrays };
		} catch (error) {
			bloom?.destroy();
			sunrays?.destroy();
			throw error;
		}
	}

	private replacePresentationResources(): void {
		this.assertFieldGraphBudget(this.simSize, this.dyeSize);
		this.assertTransitionBudget(this.estimatePresentationBytes());
		const previousBloom = this.bloomTarget;
		const previousSunrays = this.sunraysTarget;
		const replacement = this.createPresentationResources();
		this.bloomTarget = replacement.bloom;
		this.sunraysTarget = replacement.sunrays;
		this.bindGroups.clear();
		previousBloom?.destroy();
		previousSunrays?.destroy();
	}

	private async syncDistortionImage(): Promise<void> {
		const token = ++this.distortionLoadToken;
		this.distortionAbort?.abort();
		this.distortionAbort = null;
		const url = this.config.distortion ? this.config.distortionImageUrl : null;
		if (!url) {
			const previous = this.distortionTexture;
			const changed = previous !== null || this.distortionImageRatio !== 1;
			this.distortionTexture = null;
			this.distortionImageRatio = 1;
			this.bindGroups.clear();
			previous?.destroy();
			if (changed) this.frameDirty = true;
			return;
		}
		const abort = new AbortController();
		this.distortionAbort = abort;
		try {
			const response = await fetch(url, { signal: abort.signal });
			if (!response.ok) throw new Error(`svelte-fluid: distortion image request failed (${response.status})`);
			const bitmap = await createImageBitmap(await response.blob());
			if (this.disposed || token !== this.distortionLoadToken) {
				bitmap.close();
				return;
			}
			const imageRatio = bitmap.width / Math.max(1, bitmap.height);
			const limit = this.lease.device.limits.maxTextureDimension2D;
			if (
				bitmap.width > limit ||
				bitmap.height > limit ||
				bitmap.width * bitmap.height * 4 > MAX_DISTORTION_IMAGE_BYTES
			) {
				bitmap.close();
				throw new RangeError('svelte-fluid: distortion image exceeds the adapter or per-image safety limit');
			}
			const imageBytes = bitmap.width * bitmap.height * 4;
			const persistentBytes = this.estimateFieldGraphBytes(this.simSize, this.dyeSize) + imageBytes;
			if (persistentBytes > MAX_INSTANCE_FIELD_BYTES) {
				bitmap.close();
				throw new RangeError('svelte-fluid: distortion image exceeds the aggregate per-instance GPU texture budget');
			}
			try {
				this.assertTransitionBudget(imageBytes);
			} catch (error) {
				bitmap.close();
				throw error;
			}
			let texture: WebGpuTarget | null = null;
			const device = this.lease.device;
			device.pushErrorScope('validation');
			device.pushErrorScope('out-of-memory');
			let creationError: unknown;
			try {
				texture = createExternalImageTexture(
					device,
					this.lease.tracker,
					bitmap,
					'svelte-fluid-distortion-image'
				);
			} catch (error) {
				creationError = error;
			}
			let scopeError: unknown;
			try {
				await finishGpuErrorScopes(device, 'distortion image upload');
			} catch (error) {
				scopeError = error;
			}
			bitmap.close();
			if (creationError || scopeError || !texture) {
				texture?.destroy();
				throw creationError ?? scopeError ?? new Error('svelte-fluid: distortion texture creation failed');
			}
			if (this.disposed || token !== this.distortionLoadToken) {
				texture.destroy();
				return;
			}
			const previous = this.distortionTexture;
			this.distortionTexture = texture;
			this.distortionImageRatio = imageRatio;
			this.bindGroups.clear();
			previous?.destroy();
			this.frameDirty = true;
			this.onAssetReady?.();
		} catch (cause) {
			if (this.disposed || token !== this.distortionLoadToken) return;
			const error = cause instanceof Error ? cause : new Error(String(cause));
			if (this.onAssetError) this.onAssetError(error);
			else console.error(error);
		} finally {
			if (this.distortionAbort === abort) this.distortionAbort = null;
		}
	}

	private createPrescribedResources(): PrescribedResources {
		const prescribed = this.config.flow?.prescribed;
		if (!prescribed || prescribed.kind !== 'grid') {
			return { velocity: null, scalars: [], velocityScale: 1 };
		}
		const scalarEntries = Object.entries(prescribed.scalars ?? {}).filter(
			(entry): entry is [string, FlowGridField] => entry[1] !== undefined
		);
		const velocityScale = prescribed.velocity?.scale ?? 1000;
		// Validate every grid before allocating any texture. One bad field must not
		// partially replace an otherwise valid prescribed-resource group.
		if (prescribed.velocity) this.validateGridField(prescribed.velocity, 2, 'svelte-fluid-prescribed-velocity');
		for (const [name, grid] of scalarEntries) {
			this.validateGridField(grid, 1, `svelte-fluid-prescribed-scalar-${name}`);
		}
		let velocity: WebGpuTarget | null = null;
		const scalars: PrescribedScalarResource[] = [];
		try {
			if (prescribed.velocity) {
				velocity = this.createGridTexture(
					prescribed.velocity,
					2,
					velocityScale,
					true,
					'svelte-fluid-prescribed-velocity'
				);
			}
			for (const [name, grid] of scalarEntries) {
				scalars.push({
					name,
					channel: flowScalarChannel(name, this.config.flow?.scalarFields),
					scale: grid.scale ?? 1,
					texture: this.createGridTexture(
						grid,
						1,
						grid.scale ?? 1,
						true,
						`svelte-fluid-prescribed-scalar-${name}`
					)
				});
			}
			return { velocity, scalars, velocityScale };
		} catch (error) {
			velocity?.destroy();
			for (const resource of scalars) resource.texture.destroy();
			throw error;
		}
	}

	private replacePrescribedResources(): void {
		this.assertFieldGraphBudget(this.simSize, this.dyeSize);
		this.assertTransitionBudget(this.estimatePrescribedBytes());
		const previousVelocity = this.prescribedVelocityTexture;
		const previousScalars = this.prescribedScalarResources;
		const replacement = this.createPrescribedResources();
		this.prescribedVelocityTexture = replacement.velocity;
		this.prescribedScalarResources = replacement.scalars;
		this.prescribedVelocityScale = replacement.velocityScale;
		this.bindGroups.clear();
		previousVelocity?.destroy();
		for (const resource of previousScalars) resource.texture.destroy();
	}

	private prescribedSignature(flow: FlowConfig | null | undefined): string {
		const prescribed = flow?.prescribed;
		if (!prescribed || prescribed.kind !== 'grid') return 'none';
		const scalarName = flow?.visualization?.scalar ?? flow?.scalarFields?.[0]?.name ?? 'temperature';
		const fieldSignature = (field: FlowGridField | undefined): string => {
			if (!field) return '-';
			const data = field.data;
			const identity = typeof data === 'object' && data !== null ? this.resourceId(data) : String(data);
			return `${field.width}:${field.height}:${field.scale ?? ''}:${field.version ?? ''}:${identity}`;
		};
		const scalars = Object.entries(prescribed.scalars ?? {})
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([name, field]) => `${name}=${fieldSignature(field)}`)
			.join('|');
		return `${scalarName}|v=${fieldSignature(prescribed.velocity)}|s=${scalars}`;
	}

	private maskSignature(config: FluidConfig | NativeFluidConfig): string {
		const sticky = config.stickyMask;
		return JSON.stringify([
			this.topologySignature(config),
			config.containerShape?.type === 'svgPath' ? config.containerShape.maskResolution : null,
			config.openBoundary ?? false,
			config.sticky ?? false,
			sticky
				? [
						sticky.d,
						sticky.text,
						sticky.font,
						sticky.viewBox,
						sticky.fillRule,
						sticky.maskResolution,
						sticky.blur,
						sticky.padding
					]
				: null
		]);
	}

	private topologySignature(config: FluidConfig | NativeFluidConfig): string {
		const shape = config.containerShape;
		const canonicalShape = !shape
			? null
			: shape.type === 'circle'
				? ['circle', shape.cx, shape.cy, shape.radius]
				: shape.type === 'frame'
					? [
							'frame',
							shape.cx,
							shape.cy,
							shape.halfW,
							shape.halfH,
							shape.innerCornerRadius,
							shape.outerHalfW,
							shape.outerHalfH,
							shape.outerCornerRadius
						]
					: shape.type === 'roundedRect'
						? ['roundedRect', shape.cx, shape.cy, shape.halfW, shape.halfH, shape.cornerRadius]
						: shape.type === 'annulus'
							? ['annulus', shape.cx, shape.cy, shape.innerRadius, shape.outerRadius]
							: ['svgPath', shape.d, shape.text, shape.font, shape.viewBox, shape.fillRule];
		const obstructions = (config.obstructions ?? []).map((obstruction) => [
			obstruction.d,
			obstruction.text,
			obstruction.font,
			obstruction.viewBox,
			obstruction.fillRule,
			obstruction.offset?.x,
			obstruction.offset?.y,
			obstruction.scale,
			obstruction.fit
		]);
		return JSON.stringify([canonicalShape, obstructions]);
	}

	private beginScopedGpuWork(label: string): () => void {
		const device = this.lease.device;
		device.pushErrorScope('validation');
		device.pushErrorScope('out-of-memory');
		let closed = false;
		return () => {
			if (closed) return;
			closed = true;
			const pending = finishGpuErrorScopes(device, label).catch((cause) => {
				const error = cause instanceof Error ? cause : new Error(String(cause));
				this.failGpuWork(error, error.cause as GPUError | undefined);
			});
			this.pendingGpuWork.add(pending);
			void pending.finally(() => {
				this.pendingGpuWork.delete(pending);
				if (this.pendingGpuWork.size === 0) this.flushQueuedTransitions();
			});
		};
	}

	private flushQueuedTransitions(): void {
		if (this.disposed || this.deviceLost) {
			this.queuedConfigPatch = null;
			this.queuedResize = null;
			return;
		}
		const config = this.queuedConfigPatch;
		const resize = this.queuedResize;
		this.queuedConfigPatch = null;
		this.queuedResize = null;
		if (config) {
			try {
				this.setConfig(config);
			} catch (cause) {
				this.reportRejectedTransition(cause, {
					kind: 'config',
					acceptedConfig: this.acceptedConfigSnapshot()
				});
			}
		}
		if (resize && !this.deviceLost) {
			try {
				this.resize(resize[0], resize[1]);
			} catch (cause) {
				this.reportRejectedTransition(cause, {
					kind: 'resize',
					acceptedWidth: this.canvas.width,
					acceptedHeight: this.canvas.height
				});
			}
		}
	}

	private acceptedConfigSnapshot(): FluidConfig {
		const config = snapshotFluidConfig(this.config as unknown as FluidConfig);
		// `null` is an internal sentinel for the default seeded random-count policy;
		// omission is the equivalent public representation.
		if (this.config.initialSplatCount === null) delete config.initialSplatCount;
		return config;
	}

	private reportRejectedTransition(cause: unknown, transition: NativeWebGpuRejectedTransition): void {
		const error = cause instanceof Error ? cause : new Error(String(cause));
		if (!this.onConfigurationError) {
			console.error('svelte-fluid: rejected coalesced WebGPU configuration update', error);
			return;
		}
		try {
			this.onConfigurationError(error, transition);
		} catch (callbackError) {
			console.error('svelte-fluid: onConfigurationError callback threw', callbackError);
		}
	}

	private failGpuWork(error: Error, gpuError?: GPUError): void {
		if (this.disposed || this.deviceLost) return;
		this.terminalError = error;
		this.deviceLost = true;
		this.pause();
		if (gpuError) this.onError?.(gpuError);
		if (this.onFatalError) {
			try {
				this.onFatalError(error);
			} catch (cause) {
				console.error('svelte-fluid: onFatalError callback threw', cause);
			}
		} else console.error(error);
	}

	private validateGridField(field: FlowGridField, channels: 1 | 2, label: string): void {
		if (!Number.isFinite(field.width) || !Number.isFinite(field.height)) {
			throw new RangeError(`svelte-fluid: ${label} grid extent must be finite`);
		}
		const width = Math.max(1, Math.floor(field.width));
		const height = Math.max(1, Math.floor(field.height));
		const limit = Math.min(4096, this.lease.device.limits.maxTextureDimension2D);
		if (width > limit || height > limit || width * height > MAX_PRESCRIBED_GRID_PIXELS) {
			throw new RangeError(`svelte-fluid: ${label} grid exceeds the adapter or per-grid safety limit`);
		}
		if (field.data.length < width * height * channels) {
			throw new Error(`svelte-fluid: ${label} grid data is shorter than its extent`);
		}
		for (let index = 0; index < width * height * channels; index += 1) {
			if (!Number.isFinite(Number(field.data[index]))) {
				throw new RangeError(`svelte-fluid: ${label} grid data contains a non-finite sample`);
			}
		}
	}

	private createGridTexture(
		field: FlowGridField,
		channels: 1 | 2,
		scale: number,
		signed: boolean,
		label: string
	): WebGpuTarget {
		const width = Math.max(1, Math.floor(field.width));
		const height = Math.max(1, Math.floor(field.height));
		this.validateGridField(field, channels, label);
		const safeScale = Math.max(Math.abs(scale), 0.000001);
		const data = new Uint8Array(width * height * 4);
		const encodeSigned = (value: number): number =>
			Math.round(Math.max(-1, Math.min(1, value / safeScale)) * 127 + 128);
		for (let index = 0; index < width * height; index += 1) {
			const x = index % width;
			const y = Math.floor(index / width);
			// Public grids are y-up/bottom-row-first. WebGPU texture uploads and our
			// fullscreen UVs are top-row-first, so reverse rows at the boundary.
			const sourceIndex = (height - 1 - y) * width + x;
			if (channels === 2) {
				const valueX = Number(field.data[sourceIndex * 2] ?? 0);
				const valueY = -Number(field.data[sourceIndex * 2 + 1] ?? 0);
				data[index * 4] = encodeSigned(valueX);
				data[index * 4 + 1] = encodeSigned(valueY);
			} else {
				const value = Number(field.data[sourceIndex] ?? 0);
				data[index * 4] = signed
					? encodeSigned(value)
					: Math.round(Math.max(0, Math.min(1, value / safeScale)) * 255);
			}
			data[index * 4 + 3] = 255;
		}
		return createMaskTexture(this.lease.device, this.lease.tracker, width, height, data, label);
	}

	private writeUniform(uniform: UniformBuffer, values: Float32Array): void {
		this.lease.device.queue.writeBuffer(uniform.buffer, 0, values.buffer, values.byteOffset, values.byteLength);
	}

	private bindGroup(pipeline: GPURenderPipeline, entries: GPUBindGroupEntry[]): GPUBindGroup {
		const key = `${this.resourceId(pipeline)}|${entries
			.map((entry) => `${entry.binding}:${this.bindingResourceKey(entry.resource)}`)
			.join('|')}`;
		const cached = this.bindGroups.get(key);
		if (cached) return cached;
		const bindGroup = this.lease.device.createBindGroup({
			layout: pipeline.getBindGroupLayout(0),
			entries
		});
		this.bindGroups.set(key, bindGroup);
		return bindGroup;
	}

	private resourceId(resource: object): number {
		let id = this.resourceIds.get(resource);
		if (id !== undefined) return id;
		id = this.nextResourceId++;
		this.resourceIds.set(resource, id);
		return id;
	}

	private bindingResourceKey(resource: GPUBindingResource): string {
		if ('buffer' in resource) {
			return `b${this.resourceId(resource.buffer)}:${resource.offset ?? 0}:${resource.size ?? 0}`;
		}
		return `r${this.resourceId(resource)}`;
	}

	private pass(
		encoder: GPUCommandEncoder,
		pipeline: GPURenderPipeline,
		target: GPUTextureView,
		entries: GPUBindGroupEntry[],
		label: string
	): void {
		const pass = encoder.beginRenderPass({
			label,
			colorAttachments: [
				{
					view: target,
					loadOp: 'clear',
					storeOp: 'store',
					clearValue: { r: 0, g: 0, b: 0, a: 0 }
				}
			]
		});
		pass.setPipeline(pipeline);
		pass.setBindGroup(0, this.bindGroup(pipeline, entries));
		pass.draw(3);
		pass.end();
	}

	private applySplats(encoder: GPUCommandEncoder): void {
		const events = this.splats.splice(0, MAX_SPLATS_PER_FRAME);
		for (let index = 0; index < events.length; index += 1) {
			const event = events[index]!;
			const velocityUniform = this.splatVelocityUniforms[index]!;
			const dyeUniform = this.splatDyeUniforms[index]!;
			this.writeUniform(
				velocityUniform,
				new Float32Array([
					event.x,
					event.y,
					correctedRadius(this.config.splatRadius, this.simSize[0] / this.simSize[1]),
					this.simSize[0] / this.simSize[1],
					event.dx,
					event.dy,
					0,
					0
				])
			);
			this.pass(
				encoder,
				this.pipelines.splatVelocity,
				this.velocity.write.view,
				[
					{ binding: 0, resource: { buffer: velocityUniform.buffer } },
					{ binding: 1, resource: this.velocity.read.view },
					{ binding: 2, resource: this.sampler },
					{ binding: 3, resource: this.maskTexture.view },
					{ binding: 4, resource: this.nearestSampler }
				],
				`svelte-fluid-splat-velocity-${index}`
			);
			this.velocity.swap();
			this.writeUniform(
				dyeUniform,
				new Float32Array([
					event.x,
					event.y,
					correctedRadius(this.config.splatRadius, this.dyeSize[0] / this.dyeSize[1]),
					this.dyeSize[0] / this.dyeSize[1],
					event.color.r,
					event.color.g,
					event.color.b,
					this.config.sticky ? this.config.stickyAmplify : 0
				])
			);
			this.pass(
				encoder,
				this.pipelines.splatDye,
				this.dye.write.view,
				[
					{ binding: 0, resource: { buffer: dyeUniform.buffer } },
					{ binding: 1, resource: this.dye.read.view },
					{ binding: 2, resource: this.sampler },
					{ binding: 3, resource: this.visualMaskTexture.view },
					{ binding: 4, resource: this.nearestSampler }
				],
				`svelte-fluid-splat-dye-${index}`
			);
			this.dye.swap();
		}
	}

	private simulateStep(encoder: GPUCommandEncoder, dt: number): void {
		const texelX = 1 / this.simSize[0];
		const texelY = 1 / this.simSize[1];
		const prescribedOnly = this.config.flow?.mode === 'prescribed';
		if (this.config.flow?.prescribed && this.config.flow.mode !== 'live') this.applyPrescribedFields(encoder);
		this.applyFlowSources(encoder, dt);
		this.applyFlowForce(encoder, dt);
		this.applyFlowOutlet(encoder, 'velocity');
		if (prescribedOnly) {
			this.advectDye(encoder, dt, texelX, texelY);
			this.advectScalar(encoder, dt);
			this.applyFlowOutlet(encoder, 'dye');
			this.applyFlowOutlet(encoder, 'scalar');
			return;
		}
		if (this.config.curl > 0) {
			this.pass(
				encoder,
				this.pipelines.curl,
				this.curlTarget.view,
				[{ binding: 0, resource: this.velocity.read.view }],
				'svelte-fluid-curl'
			);
			this.writeUniform(
				this.vorticityUniform,
				new Float32Array([
					dt,
					curlScale(this.config.curl, this.simSize[0], this.simSize[1]),
					this.config.vorticityAdaptive,
					vorticityNormalizationScale(this.simSize[0], this.simSize[1])
				])
			);
			this.pass(
				encoder,
				this.pipelines.vorticity,
				this.velocity.write.view,
				[
					{ binding: 0, resource: { buffer: this.vorticityUniform.buffer } },
					{ binding: 1, resource: this.velocity.read.view },
					{ binding: 2, resource: this.curlTarget.view },
					{ binding: 3, resource: this.maskTexture.view }
				],
				'svelte-fluid-vorticity'
			);
			this.velocity.swap();
		}
		this.advectVelocity(encoder, dt, texelX, texelY);
		this.applyViscosity(encoder, dt);
		this.applyWallFriction(encoder);
		const pressureIterations = this.performancePressureIterations;
		if (pressureIterations <= 0) {
			// Zero iterations means no projection. Clear the warm-start field so a
			// later re-enable cannot resurrect stale pressure, and skip divergence
			// plus gradient work entirely.
			this.clearTarget(encoder, this.pressure.write);
			this.pressure.swap();
			this.advectDye(encoder, dt, texelX, texelY);
			this.advectScalar(encoder, dt);
			this.applyFlowOutlet(encoder, 'dye');
			this.applyFlowOutlet(encoder, 'scalar');
			return;
		}
		this.pass(
			encoder,
			this.pipelines.divergence,
			this.divergence.view,
			[
				{ binding: 0, resource: { buffer: this.boundaryUniform.buffer } },
				{ binding: 1, resource: this.velocity.read.view },
				{ binding: 2, resource: this.maskTexture.view }
			],
			'svelte-fluid-divergence'
		);
		const usePairedPressure = this.simSize[0] * this.simSize[1] <= 150_000;
		const pressurePasses = usePairedPressure ? Math.floor(pressureIterations / 2) : 0;
		for (let index = 0; index < pressurePasses; index += 1) {
			const uniform = index === 0 ? this.pressureFirstUniform : this.pressureSteadyUniform;
			this.pass(
				encoder,
				this.pipelines.pressure,
				this.pressure.write.view,
				[
					{ binding: 0, resource: { buffer: uniform.buffer } },
					{ binding: 1, resource: this.pressure.read.view },
					{ binding: 2, resource: this.divergence.view },
					{ binding: 3, resource: this.maskTexture.view }
				],
				`svelte-fluid-pressure-${index}`
			);
			this.pressure.swap();
		}
		const singlePasses = pressureIterations - pressurePasses * 2;
		for (let index = 0; index < singlePasses; index += 1) {
			const uniform = pressurePasses === 0 && index === 0 ? this.pressureFirstUniform : this.pressureSteadyUniform;
			this.pass(
				encoder,
				this.pipelines.pressureSingle,
				this.pressure.write.view,
				[
					{ binding: 0, resource: { buffer: uniform.buffer } },
					{ binding: 1, resource: this.pressure.read.view },
					{ binding: 2, resource: this.divergence.view },
					{ binding: 3, resource: this.maskTexture.view }
				],
				`svelte-fluid-pressure-single-${index}`
			);
			this.pressure.swap();
		}
		this.pass(
			encoder,
			this.pipelines.gradientSubtract,
			this.velocity.write.view,
			[
				{ binding: 0, resource: this.pressure.read.view },
				{ binding: 1, resource: this.velocity.read.view },
				{ binding: 2, resource: this.maskTexture.view }
			],
			'svelte-fluid-gradient-subtract'
		);
		this.velocity.swap();
		this.advectDye(encoder, dt, texelX, texelY);
		this.advectScalar(encoder, dt);
		this.applyFlowOutlet(encoder, 'dye');
		this.applyFlowOutlet(encoder, 'scalar');
	}

	private applyFlowSources(encoder: GPUCommandEncoder, dt: number): void {
		const sources = this.config.flow?.sources;
		if (!sources?.length) return;
		this.applyFlowSourceTarget(encoder, 'velocity', dt);
		this.applyFlowSourceTarget(encoder, 'dye', dt);
		this.applyFlowSourceTarget(encoder, 'scalar', dt);
	}

	private applyFlowSourceTarget(
		encoder: GPUCommandEncoder,
		targetKind: 'velocity' | 'dye' | 'scalar',
		dt: number
	): void {
		if (targetKind === 'velocity' && this.config.flow?.mode === 'prescribed') return;
		if (targetKind === 'scalar' && !this.scalar) return;
		const entries = (this.config.flow?.sources ?? []).filter((source) =>
			targetKind === 'velocity'
				? !!source.velocity
				: targetKind === 'dye'
					? !!source.dye
					: !!source.scalars && Object.keys(source.scalars).length > 0
		);
		if (entries.length === 0) return;
		const aspect = this.canvas.width / Math.max(1, this.canvas.height);
		const uniformPool =
			targetKind === 'velocity'
				? this.flowSourceVelocityUniforms
				: targetKind === 'dye'
					? this.flowSourceDyeUniforms
					: this.flowSourceScalarUniforms;
		const pipeline =
			targetKind === 'velocity'
				? this.pipelines.flowSourceVelocity
				: targetKind === 'dye'
					? this.pipelines.flowSourceDye
					: this.pipelines.flowSourceScalar;
		const target = targetKind === 'velocity' ? this.velocity : targetKind === 'dye' ? this.dye : this.scalar!;
		for (let start = 0, batchIndex = 0; start < entries.length; start += FLOW_BATCH_SIZE, batchIndex += 1) {
			const values = new Float32Array(260);
			const count = Math.min(FLOW_BATCH_SIZE, entries.length - start);
			values[0] = count;
			values[1] = targetKind === 'dye' && this.config.sticky ? this.config.stickyAmplify : 0;
			for (let index = 0; index < count; index += 1) {
				const source = entries[start + index]!;
				const offset = 4 + index * 16;
				const thickness = source.kind === 'line' ? source.thickness : undefined;
				const radius = correctedRadius(source.radius ?? thickness ?? this.config.splatRadius, aspect);
				values[offset] = source.kind === 'point' ? 0 : source.kind === 'line' ? 1 : 2;
				values[offset + 1] = source.profile === 'parabolic' ? 1 : 0;
				values[offset + 2] = radius;
				values[offset + 3] = aspect;
				if (source.kind === 'point') {
					values[offset + 4] = source.x;
					values[offset + 5] = 1 - source.y;
					values[offset + 6] = source.x;
					values[offset + 7] = 1 - source.y;
				} else if (source.kind === 'line') {
					values[offset + 4] = source.from.x;
					values[offset + 5] = 1 - source.from.y;
					values[offset + 6] = source.to.x;
					values[offset + 7] = 1 - source.to.y;
				} else {
					values[offset + 8] = source.x;
					values[offset + 9] = 1 - source.y - source.height;
					values[offset + 10] = source.width;
					values[offset + 11] = source.height;
				}
				const scale = (source.rate ?? 60) * dt;
				if (targetKind === 'velocity') {
					values[offset + 12] = source.velocity!.x * scale;
					values[offset + 13] = -source.velocity!.y * scale;
				} else if (targetKind === 'dye') {
					values[offset + 12] = source.dye!.r * scale;
					values[offset + 13] = source.dye!.g * scale;
					values[offset + 14] = source.dye!.b * scale;
				} else {
					const color = this.scalarColor(source.scalars!, scale);
					values[offset + 12] = color.r;
					values[offset + 13] = color.g;
					values[offset + 14] = color.b;
				}
			}
			const uniform = this.batchUniform(uniformPool, batchIndex, 1040, `flow-source-${targetKind}-uniform`);
			this.writeUniform(uniform, values);
			this.pass(
				encoder,
				pipeline,
				target.write.view,
				[
					{ binding: 0, resource: { buffer: uniform.buffer } },
					{ binding: 1, resource: target.read.view },
					{ binding: 2, resource: this.sampler },
					{
						binding: 3,
						resource: targetKind === 'dye' ? this.visualMaskTexture.view : this.maskTexture.view
					},
					{ binding: 4, resource: this.nearestSampler }
				],
				`svelte-fluid-flow-source-${targetKind}-${batchIndex}`
			);
			target.swap();
		}
	}

	private applyFlowForce(encoder: GPUCommandEncoder, dt: number): void {
		if (this.config.flow?.mode === 'prescribed') return;
		let x = 0;
		let y = 0;
		const buoyancy: Array<Extract<FlowForce, { kind: 'buoyancy' }>> = [];
		for (const force of this.config.flow?.forces ?? []) {
			if (force.kind === 'gravity' || force.kind === 'pressureGradient') {
				x += force.vector.x;
				y -= force.vector.y;
			} else buoyancy.push(force);
		}
		let passIndex = 0;
		if (x !== 0 || y !== 0) {
			this.applyFlowForcePass(encoder, dt, x, y, 0, 0, 0, 0, 0, passIndex);
			passIndex += 1;
		}
		for (const force of buoyancy) {
			const direction = force.direction ?? { x: 0, y: 1 };
			this.applyFlowForcePass(
				encoder,
				dt,
				0,
				0,
				flowScalarChannel(force.scalar, this.config.flow?.scalarFields),
				direction.x,
				-direction.y,
				force.strength,
				force.ambient ?? 0,
				passIndex
			);
			passIndex += 1;
		}
	}

	private scalarColor(scalars: NonNullable<NonNullable<FlowConfig['sources']>[number]['scalars']>, scale: number): RGB {
		const color: RGB = { r: 0, g: 0, b: 0 };
		for (const [name, raw] of Object.entries(scalars)) {
			const value = (raw ?? 0) * scale;
			const channel = flowScalarChannel(name, this.config.flow?.scalarFields);
			if (channel === 0) color.r += value;
			else if (channel === 1) color.g += value;
			else color.b += value;
		}
		return color;
	}

	private applyFlowForcePass(
		encoder: GPUCommandEncoder,
		dt: number,
		gravityX: number,
		gravityY: number,
		scalarChannel: number,
		buoyancyX: number,
		buoyancyY: number,
		buoyancyStrength: number,
		buoyancyAmbient: number,
		index: number
	): void {
		const uniform = this.batchUniform(this.flowForceUniforms, index, 32, 'flow-force-uniform');
		this.writeUniform(
			uniform,
			new Float32Array([
				dt,
				gravityX,
				gravityY,
				scalarChannel,
				buoyancyX,
				buoyancyY,
				buoyancyStrength,
				buoyancyAmbient
			])
		);
		this.pass(
			encoder,
			this.pipelines.flowForce,
			this.velocity.write.view,
			[
				{ binding: 0, resource: { buffer: uniform.buffer } },
				{ binding: 1, resource: this.velocity.read.view },
				{ binding: 2, resource: this.maskTexture.view },
				{ binding: 3, resource: this.scalar?.read.view ?? this.dye.read.view }
			],
			`svelte-fluid-flow-force-${index}`
		);
		this.velocity.swap();
	}

	private applyPrescribedFields(encoder: GPUCommandEncoder): void {
		const mode = this.config.flow?.mode === 'hybrid' ? 1 : 0;
		if (this.prescribedVelocityTexture) {
			this.writeUniform(
				this.prescribedVelocityUniform,
				new Float32Array([this.prescribedVelocityScale, mode, 0, 0])
			);
			this.pass(
				encoder,
				this.pipelines.prescribedVelocity,
				this.velocity.write.view,
				[
					{ binding: 0, resource: { buffer: this.prescribedVelocityUniform.buffer } },
					{ binding: 1, resource: this.velocity.read.view },
					{ binding: 2, resource: this.prescribedVelocityTexture.view },
					{ binding: 3, resource: this.sampler },
					{ binding: 4, resource: this.maskTexture.view }
				],
				'svelte-fluid-prescribed-velocity'
			);
			this.velocity.swap();
		}
		if (this.scalar) {
			for (const [index, prescribed] of this.prescribedScalarResources.entries()) {
				const uniform = this.batchUniform(
					this.prescribedScalarUniforms,
					index,
					16,
					'prescribed-scalar-uniform'
				);
				this.writeUniform(
					uniform,
					new Float32Array([prescribed.scale, mode, 1, prescribed.channel])
				);
				this.pass(
					encoder,
					this.pipelines.prescribedScalar,
					this.scalar.write.view,
					[
						{ binding: 0, resource: { buffer: uniform.buffer } },
						{ binding: 1, resource: this.scalar.read.view },
						{ binding: 2, resource: prescribed.texture.view },
						{ binding: 3, resource: this.sampler },
						{ binding: 4, resource: this.maskTexture.view }
					],
					`svelte-fluid-prescribed-scalar-${prescribed.name}`
				);
				this.scalar.swap();
			}
		}
	}

	private advectDye(encoder: GPUCommandEncoder, dt: number, texelX: number, texelY: number): void {
		// Sticky is retention, not a second decay convention. Keeping it on the
		// ordinary time-based path makes densityDissipation mean the same thing
		// for every Fluid mode: larger values fade faster.
		const multiplicative = this.config.reveal;
		this.writeUniform(
			this.advectDyeUniform,
			new Float32Array([
				dt,
				this.currentDensityDissipation(),
				1,
				multiplicative ? 1 : 0,
				texelX,
				texelY,
				this.config.sticky ? this.config.stickyStrength : 0,
				this.config.sticky ? 2 : 0
			])
		);
		this.pass(
			encoder,
			this.pipelines.advectDye,
			this.dye.write.view,
			[
				{ binding: 0, resource: { buffer: this.advectDyeUniform.buffer } },
				{ binding: 1, resource: this.dye.read.view },
				{ binding: 2, resource: this.velocity.read.view },
				{ binding: 3, resource: this.sampler },
				{ binding: 4, resource: this.visualMaskTexture.view },
				{ binding: 5, resource: this.nearestSampler }
			],
			'svelte-fluid-advect-dye'
		);
		this.dye.swap();
	}

	private advectScalar(encoder: GPUCommandEncoder, dt: number): void {
		if (!this.scalar) return;
		const fallback = this.currentDensityDissipation();
		const dissipation = [fallback, fallback, fallback];
		for (const field of this.config.flow?.scalarFields ?? []) {
			dissipation[flowScalarChannel(field.name, this.config.flow?.scalarFields)] = flowScalarDissipation(
				field,
				fallback
			);
		}
		this.writeUniform(
			this.advectScalarUniform,
			new Float32Array([dt, 0, 0, 0, dissipation[0]!, dissipation[1]!, dissipation[2]!, 0])
		);
		this.pass(
			encoder,
			this.pipelines.advectScalar,
			this.scalar.write.view,
			[
				{ binding: 0, resource: { buffer: this.advectScalarUniform.buffer } },
				{ binding: 1, resource: this.scalar.read.view },
				{ binding: 2, resource: this.velocity.read.view },
				{ binding: 3, resource: this.sampler },
				{ binding: 4, resource: this.maskTexture.view }
			],
			'svelte-fluid-advect-scalar'
		);
		this.scalar.swap();
	}

	private applyFlowOutlet(encoder: GPUCommandEncoder, targetKind: 'velocity' | 'dye' | 'scalar'): void {
		if (targetKind === 'velocity' && this.config.flow?.mode === 'prescribed') return;
		if (targetKind === 'scalar' && !this.scalar) return;
		const outlets = (this.config.flow?.outlets ?? []).filter((outlet) =>
			targetKind === 'velocity' ? !!outlet.clearVelocity : targetKind === 'scalar' ? outlet.clearScalars !== false : true
		);
		if (outlets.length === 0) return;
		const target = targetKind === 'velocity' ? this.velocity : targetKind === 'dye' ? this.dye : this.scalar!;
		const uniformPool =
			targetKind === 'velocity'
				? this.flowOutletVelocityUniforms
				: targetKind === 'dye'
					? this.flowOutletDyeUniforms
					: this.flowOutletScalarUniforms;
		const pipeline =
			targetKind === 'velocity'
				? this.pipelines.flowOutletVelocity
				: targetKind === 'dye'
					? this.pipelines.flowOutletDye
					: this.pipelines.flowOutletScalar;
		for (let start = 0, batchIndex = 0; start < outlets.length; start += FLOW_BATCH_SIZE, batchIndex += 1) {
			const values = new Float32Array(132);
			const count = Math.min(FLOW_BATCH_SIZE, outlets.length - start);
			values[0] = count;
			for (let index = 0; index < count; index += 1) {
				const outlet = outlets[start + index]!;
				const offset = 4 + index * 8;
				values[offset] =
					outlet.edge === 'left' ? 0 : outlet.edge === 'right' ? 1 : outlet.edge === 'top' ? 2 : 3;
				values[offset + 1] = Math.max(0, Math.min(1, outlet.from ?? 0));
				values[offset + 2] = Math.max(0, Math.min(1, outlet.to ?? 1));
				values[offset + 3] = Math.max(0.001, outlet.width ?? 0.035);
				values[offset + 4] = targetKind === 'velocity' ? 0.25 : targetKind === 'dye' ? (outlet.clearDye ?? 0) : 0;
			}
			const uniform = this.batchUniform(uniformPool, batchIndex, 528, `flow-outlet-${targetKind}-uniform`);
			this.writeUniform(uniform, values);
			this.pass(
				encoder,
				pipeline,
				target.write.view,
				[
					{ binding: 0, resource: { buffer: uniform.buffer } },
					{ binding: 1, resource: target.read.view },
					{ binding: 2, resource: this.sampler }
				],
				`svelte-fluid-flow-outlet-${targetKind}-${batchIndex}`
			);
			target.swap();
		}
	}

	private flowOpenEdges(): [number, number, number, number] {
		const boundary = this.config.flow?.boundary;
		const fallback = this.config.openBoundary ? 1 : 0;
		const edge = (kind: 'wall' | 'open' | undefined): number =>
			kind === 'open' ? 1 : kind === 'wall' ? 0 : fallback;
		return [edge(boundary?.left), edge(boundary?.right), edge(boundary?.top), edge(boundary?.bottom)];
	}

	private advectVelocity(encoder: GPUCommandEncoder, dt: number, texelX: number, texelY: number): void {
		const multiplicative = this.config.reveal;
		const velocityDissipation =
			multiplicative && this.config.velocityDissipation <= 0.5 ? 0.98 : this.config.velocityDissipation;
		this.writeUniform(
			this.advectVelocityUniform,
			new Float32Array([
				dt,
				velocityDissipation,
				1,
				multiplicative ? 1 : 0,
				texelX,
				texelY,
				this.config.sticky ? this.config.stickyStrength * 0.8 : 0,
				this.config.sticky ? 2 : 0
			])
		);
		if (this.config.advectionScheme === 'maccormack') {
			const openEdges = this.flowOpenEdges();
			this.writeUniform(
				this.macCormackUniform,
				new Float32Array([
					dt,
					velocityDissipation,
					multiplicative ? 1 : 0,
					this.config.sticky ? 2 : 0,
					texelX,
					texelY,
					this.config.sticky ? this.config.stickyStrength * 0.8 : 0,
					0,
					...openEdges
				])
			);
			this.writeUniform(
				this.advectVelocityUniform,
				new Float32Array([dt, 0, 1, 0, texelX, texelY, 0, 0])
			);
			this.pass(
				encoder,
				this.pipelines.advectVelocity,
				this.velocitySource.view,
				[
					{ binding: 0, resource: { buffer: this.advectVelocityUniform.buffer } },
					{ binding: 1, resource: this.velocity.read.view },
					{ binding: 2, resource: this.velocity.read.view },
					{ binding: 3, resource: this.sampler },
					{ binding: 4, resource: this.maskTexture.view },
					{ binding: 5, resource: this.nearestSampler }
				],
				'svelte-fluid-advect-velocity-forward'
			);
			this.pass(
				encoder,
				this.pipelines.advectMacCormack,
				this.velocity.write.view,
				[
					{ binding: 0, resource: { buffer: this.macCormackUniform.buffer } },
					{ binding: 1, resource: this.velocity.read.view },
					{ binding: 2, resource: this.velocitySource.view },
					{ binding: 3, resource: this.sampler },
					{ binding: 4, resource: this.maskTexture.view }
				],
				'svelte-fluid-advect-velocity-maccormack'
			);
		} else {
			this.pass(
				encoder,
				this.pipelines.advectVelocity,
				this.velocity.write.view,
				[
					{ binding: 0, resource: { buffer: this.advectVelocityUniform.buffer } },
					{ binding: 1, resource: this.velocity.read.view },
					{ binding: 2, resource: this.velocity.read.view },
					{ binding: 3, resource: this.sampler },
					{ binding: 4, resource: this.maskTexture.view },
					{ binding: 5, resource: this.nearestSampler }
				],
				'svelte-fluid-advect-velocity'
			);
		}
		this.velocity.swap();
	}

	private applyViscosity(encoder: GPUCommandEncoder, dt: number): void {
		if (this.config.viscosity <= 0 || this.config.viscosityIterations <= 0) return;
		encoder.copyTextureToTexture(
			{ texture: this.velocity.read.texture },
			{ texture: this.velocitySource.texture },
			[this.simSize[0], this.simSize[1]]
		);
		this.writeUniform(
			this.viscosityUniform,
			new Float32Array([
				viscosityAlpha(this.config.viscosity, dt, this.simSize[0], this.simSize[1]),
				0,
				0,
				0
			])
		);
		for (let index = 0; index < this.config.viscosityIterations; index += 1) {
			this.pass(
				encoder,
				this.pipelines.viscosity,
				this.velocity.write.view,
				[
					{ binding: 0, resource: { buffer: this.viscosityUniform.buffer } },
					{ binding: 1, resource: this.velocity.read.view },
					{ binding: 2, resource: this.velocitySource.view },
					{ binding: 3, resource: this.maskTexture.view }
				],
				`svelte-fluid-viscosity-${index}`
			);
			this.velocity.swap();
		}
	}

	private applyWallFriction(encoder: GPUCommandEncoder): void {
		const physicalContainer = !!this.config.containerShape && !this.config.openBoundary;
		if (this.config.wallFriction <= 0 || (!physicalContainer && !this.config.obstructions?.length)) return;
		this.writeUniform(
			this.wallFrictionUniform,
			new Float32Array([this.config.wallFriction, this.config.wallFrictionWidth, 0, 0])
		);
		this.pass(
			encoder,
			this.pipelines.wallFriction,
			this.velocity.write.view,
			[
				{ binding: 0, resource: { buffer: this.wallFrictionUniform.buffer } },
				{ binding: 1, resource: this.velocity.read.view },
				{ binding: 2, resource: this.maskTexture.view }
			],
			'svelte-fluid-wall-friction'
		);
		this.velocity.swap();
	}

	private applyPresentation(encoder: GPUCommandEncoder): void {
		if (this.config.distortion && this.distortionTexture) return;
		if (this.bloomTarget && this.dyeMayContainContent) {
			this.writeUniform(
				this.bloomPrefilterUniform,
				new Float32Array([
					this.config.bloomThreshold,
					this.config.bloomThreshold * this.config.bloomSoftKnee + 0.0001,
					0,
					0
				])
			);
			this.pass(
				encoder,
				this.pipelines.bloomPrefilter,
				this.bloomTarget.read.view,
				[
					{ binding: 0, resource: { buffer: this.bloomPrefilterUniform.buffer } },
					{ binding: 1, resource: this.dye.read.view },
					{ binding: 2, resource: this.sampler }
				],
				'svelte-fluid-bloom-prefilter'
			);
			for (let index = 0; index < this.config.bloomIterations; index += 1) {
				const pipeline = index % 2 === 0 ? this.pipelines.bloomBlurHorizontal : this.pipelines.bloomBlurVertical;
				this.pass(
					encoder,
					pipeline,
					this.bloomTarget.write.view,
					[
						{ binding: 0, resource: this.bloomTarget.read.view },
						{ binding: 1, resource: this.sampler }
					],
					`svelte-fluid-bloom-blur-${index}`
				);
				this.bloomTarget.swap();
			}
		}
		if (this.sunraysTarget && this.dyeMayContainContent) {
			this.pass(
				encoder,
				this.pipelines.sunrays,
				this.sunraysTarget.view,
				[
					{ binding: 0, resource: this.dye.read.view },
					{ binding: 1, resource: this.sampler }
				],
				'svelte-fluid-sunrays'
			);
		}
	}

	private present(encoder: GPUCommandEncoder): void {
		const background = this.config.backColor;
		const obstruction = this.config.obstructionColor ?? { r: 0, g: 0, b: 0 };
		const distortionActive = this.config.distortion && !!this.distortionTexture;
		const visualization = this.config.flow?.visualization;
		const colorBy = visualization?.colorBy ?? 'dye';
		const flowMode =
			!this.config.reveal && !distortionActive && colorBy !== 'dye'
				? colorBy === 'speed'
					? 1
					: colorBy === 'pressure'
						? 2
						: 3
				: 0;
		const scalarChannel = flowScalarChannel(visualization?.scalar, this.config.flow?.scalarFields);
		const scalarName = visualization?.scalar ?? this.config.flow?.scalarFields?.[0]?.name ?? 'temperature';
		const scalarDefinition =
			this.config.flow?.scalarFields?.find((field) => field.name === scalarName) ?? this.config.flow?.scalarFields?.[0];
		const range = visualization?.range ?? scalarDefinition?.range ?? [0, 1];
		const flowScale = visualization?.scale ?? (flowMode === 1 ? 0.002 : 1);
		const transfer = flowTransferKind(visualization?.transfer);
		const glow = visualization?.glowBy === 'speed' ? 1 : visualization?.glowBy === 'scalar' ? 2 : 0;
		const flowColor = scalarDefinition?.color ?? { r: 1, g: 1, b: 1 };
		this.writeUniform(
			this.displayUniform,
			new Float32Array([
				background.r / 255,
				background.g / 255,
				background.b / 255,
				1,
				this.config.transparent ? 1 : 0,
				this.config.shading && !distortionActive ? 1 : 0,
				this.config.reveal && !distortionActive ? 1 : 0,
				this.config.obstructionColor ? 1 : 0,
				this.config.revealCoverColor.r,
				this.config.revealCoverColor.g,
				this.config.revealCoverColor.b,
				this.config.revealSensitivity,
				this.config.revealAccentColor.r,
				this.config.revealAccentColor.g,
				this.config.revealAccentColor.b,
				this.config.revealCurve,
				this.config.revealFringeColor.r,
				this.config.revealFringeColor.g,
				this.config.revealFringeColor.b,
				0,
				obstruction.r / 255,
				obstruction.g / 255,
				obstruction.b / 255,
				0,
				flowMode,
				transfer,
				glow,
				scalarChannel,
				range[0],
				range[1],
				flowScale,
				visualization?.range || flowMode === 3 ? 1 : 0,
				flowColor.r,
				flowColor.g,
				flowColor.b,
				0,
				this.config.bloomIntensity,
				this.bloomTarget && !distortionActive ? 1 : 0,
				this.sunraysTarget && !distortionActive ? 1 : 0,
				this.config.sunraysWeight,
				this.config.glass && this.config.containerShape && !distortionActive ? 1 : 0,
				this.config.glassThickness,
				this.config.glassRefraction,
				this.config.glassChromatic,
				this.config.glassReflectivity,
				this.glassLightX,
				this.glassLightY,
				0,
				distortionActive ? 1 : 0,
				this.config.distortionPower,
				this.distortionImageRatio,
				this.canvas.width / Math.max(1, this.canvas.height),
				this.config.distortionScale,
				this.config.distortionFit === 'contain' ? 1 : 0,
				this.config.distortionBleedX,
				this.config.distortionBleedY
			])
		);
		this.pass(
			encoder,
			this.pipelines.display,
			this.context.getCurrentTexture().createView(),
			[
				{ binding: 0, resource: { buffer: this.displayUniform.buffer } },
				{ binding: 1, resource: this.dye.read.view },
				{ binding: 2, resource: this.sampler },
				{ binding: 3, resource: this.visualMaskTexture.view },
				{ binding: 4, resource: this.velocity.read.view },
				{ binding: 5, resource: this.pressure.read.view },
				{ binding: 6, resource: this.scalar?.read.view ?? this.dye.read.view },
				{ binding: 7, resource: this.bloomTarget?.read.view ?? this.dye.read.view },
				{ binding: 8, resource: this.sunraysTarget?.view ?? this.dye.read.view },
				{ binding: 9, resource: this.distortionTexture?.view ?? this.dye.read.view }
			],
			'svelte-fluid-display'
		);
	}

	private renderFrame(steps: number, dt: number, present: boolean): void {
		if (this.disposed || this.deviceLost) return;
		const stickyPressure = this.config.sticky ? this.config.stickyPressure : 0;
		this.writeUniform(this.pressureFirstUniform, new Float32Array([this.config.pressure, stickyPressure, 0, 0]));
		this.writeUniform(this.pressureSteadyUniform, new Float32Array([1, stickyPressure, 0, 0]));
		this.writeUniform(this.boundaryUniform, new Float32Array(this.flowOpenEdges()));
		const encoder = this.lease.device.createCommandEncoder({
			label: 'svelte-fluid-frame'
		});
		this.applySplats(encoder);
		for (let index = 0; index < steps; index += 1) {
			this.simulationTime += dt;
			this.simulateStep(encoder, dt);
		}
		if (present) {
			this.applyPresentation(encoder);
			this.present(encoder);
		}
		this.lease.device.queue.submit([encoder.finish()]);
		this.frameSubmissionCount += 1;
		this.frameDirty = this.splats.length > 0;
	}

	private activateConfiguredFlow(): void {
		if (flowCanDriveSolver(this.config.flow)) this.solverMayContainContent = true;
		if (this.config.flow?.sources?.some((source) => source.dye)) this.dyeMayContainContent = true;
	}

	private updateInputs(dt: number): void {
		if (this.config.colorful) {
			this.colorUpdateTimer += dt * this.config.colorUpdateSpeed;
			if (this.colorUpdateTimer >= 1) {
				this.colorUpdateTimer %= 1;
				for (const pointer of this.pointers) pointer.color = generateColor(this.rng);
			}
		}
		for (const pointer of this.pointers) {
			if (!pointer.moved) continue;
			pointer.moved = false;
			this.splat(
				pointer.texcoordX,
				pointer.texcoordY,
				pointer.deltaX * this.config.splatForce,
				pointer.deltaY * this.config.splatForce,
				pointer.color
			);
		}
		if (!this.config.paused) this.accumulateAutoSplats(dt);
	}

	private accumulateAutoSplats(dt: number): void {
		if (this.config.autoSplatRate <= 0) {
			this.autoSplatTimer = 0;
			return;
		}
		const baseInterval = 1 / this.config.autoSplatRate;
		this.autoSplatTimer = Math.min(this.autoSplatTimer + dt, baseInterval * 3);
		let remaining = Math.max(0, MAX_SPLATS_PER_FRAME - this.splats.length);
		if (remaining === 0) {
			this.autoSplatTimer = 0;
			return;
		}
		for (;;) {
			const interval = baseInterval * (0.3 + this.rng() * 1.7);
			if (this.autoSplatTimer < interval) return;
			this.autoSplatTimer -= interval;
			for (let index = 0; index < this.config.autoSplatCount; index += 1) {
				if (remaining === 0) {
					// Drop stale scheduled bursts instead of building input latency.
					this.autoSplatTimer = 0;
					return;
				}
				let x = this.config.autoSplatEvenX
					? (index + 0.5) / this.config.autoSplatCount
					: Math.max(
							0,
							Math.min(1, this.config.autoSplatCenterX + (this.rng() - 0.5) * this.config.autoSplatBandWidth)
						);
				let y = Math.max(
					0,
					Math.min(1, this.config.autoSplatCenterY + (this.rng() - 0.5) * this.config.autoSplatBandHeight)
				);
				let attempts = 10;
				while (attempts > 0 && !this.maskAllows(x, y)) {
					if (!this.config.autoSplatEvenX) {
						x = Math.max(
							0,
							Math.min(
								1,
								this.config.autoSplatCenterX + (this.rng() - 0.5) * this.config.autoSplatBandWidth
							)
						);
					}
					y = Math.max(
						0,
						Math.min(1, this.config.autoSplatCenterY + (this.rng() - 0.5) * this.config.autoSplatBandHeight)
					);
					attempts -= 1;
				}
				if (attempts === 0) continue;
				const color = this.config.autoSplatColor
					? { ...this.config.autoSplatColor }
					: generateColor(this.rng);
				const hdr = this.config.containerShape ? Math.max(3, 10 * Math.sqrt(this.allowedAreaFraction)) : 10;
				color.r *= hdr;
				color.g *= hdr;
				color.b *= hdr;
				let dx = this.config.autoSplatVelocityX;
				let dy = this.config.autoSplatVelocityY;
				if (this.config.autoSplatSwirl !== 0) {
					const shape = this.config.containerShape;
					const centerX = shape && shape.type !== 'svgPath' ? shape.cx : 0.5;
					const centerY = shape && shape.type !== 'svgPath' ? shape.cy : 0.5;
					dx = -(y - centerY) * this.config.autoSplatSwirl;
					dy = (x - centerX) * this.config.autoSplatSwirl;
				}
				this.splat(x, y, dx, dy, color);
				remaining -= 1;
			}
		}
	}

	private installPointerListeners(): void {
		if (this.pointerListenersInstalled) return;
		const target: EventTarget = this.config.pointerTarget === 'window' ? window : this.canvas;
		this.installedPointerTarget = target;
		target.addEventListener('pointerdown', this.onPointerDown as EventListener);
		target.addEventListener('pointermove', this.onPointerMove as EventListener);
		window.addEventListener('pointerup', this.onPointerUp);
		window.addEventListener('pointercancel', this.onPointerUp);
		this.canvas.addEventListener('pointerleave', this.onPointerLeave);
		this.pointerListenersInstalled = true;
	}

	private removePointerListeners(): void {
		if (!this.pointerListenersInstalled) return;
		const target = this.installedPointerTarget ?? this.canvas;
		target.removeEventListener('pointerdown', this.onPointerDown as EventListener);
		target.removeEventListener('pointermove', this.onPointerMove as EventListener);
		window.removeEventListener('pointerup', this.onPointerUp);
		window.removeEventListener('pointercancel', this.onPointerUp);
		this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
		this.installedPointerTarget = null;
		this.pointerListenersInstalled = false;
	}

	private resetPointerGestures(): void {
		for (const pointer of this.pointers) {
			pointer.down = false;
			pointer.moved = false;
			pointer.deltaX = 0;
			pointer.deltaY = 0;
		}
	}

	private pointerPosition(event: PointerEvent): { x: number; y: number } {
		const rect = this.canvas.getBoundingClientRect();
		return {
			x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * this.canvas.width,
			y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * this.canvas.height
		};
	}

	private readonly onPointerDown = (event: PointerEvent): void => {
		const position = this.pointerPosition(event);
		let pointer = this.pointers.find((candidate) => candidate.id === event.pointerId);
		if (!pointer) {
			pointer = this.pointers.find((candidate) => !candidate.down) ?? createPointer();
			if (!this.pointers.includes(pointer)) this.pointers.push(pointer);
		}
		updatePointerDownData(
			pointer,
			event.pointerId,
			position.x,
			position.y,
			this.canvas.width,
			this.canvas.height,
			generateColor(this.rng)
		);
	};

	private readonly onPointerMove = (event: PointerEvent): void => {
		let pointer = this.pointers.find((candidate) => candidate.id === event.pointerId);
		const position = this.pointerPosition(event);
		this.glassLightX = position.x / Math.max(1, this.canvas.width);
		this.glassLightY = position.y / Math.max(1, this.canvas.height);
		if (this.config.glass) this.frameDirty = true;
		if (!pointer?.down) {
			if (!this.config.splatOnHover) return;
			pointer ??= this.pointers.find((candidate) => !candidate.down) ?? createPointer();
			if (!this.pointers.includes(pointer)) this.pointers.push(pointer);
			updatePointerDownData(
				pointer,
				event.pointerId,
				position.x,
				position.y,
				this.canvas.width,
				this.canvas.height,
				generateColor(this.rng)
			);
			return;
		}
		updatePointerMoveData(pointer, position.x, position.y, this.canvas.width, this.canvas.height);
	};

	private readonly onPointerUp = (event: PointerEvent): void => {
		const pointer = this.pointers.find((candidate) => candidate.id === event.pointerId);
		if (pointer) updatePointerUpData(pointer);
	};

	private readonly onPointerLeave = (): void => {
		if (!this.config.splatOnHover) return;
		for (const pointer of this.pointers) updatePointerUpData(pointer);
	};

	private readonly tick = (now: number): void => {
		if (this.disposed || this.deviceLost || !this.cancelFrameSubscription) return;
		const frameMs = Math.max(0, now - this.lastUpdateTime);
		this.recordPerformanceFrameTime(frameMs);
		const elapsed = frameMs / 1000;
		this.lastUpdateTime = now;
		this.updateInputs(elapsed);
		const active = this.solverMayContainContent || flowCanDriveSolver(this.config.flow) || this.splats.length > 0;
		if ((!this.config.paused && active) || this.frameDirty || this.splats.length > 0) {
			const bounded = Math.min(elapsed, this.config.maxTimeStep * this.config.substeps);
			const requiredSteps = Math.max(1, Math.ceil(bounded / this.config.maxTimeStep));
			const steps = this.config.paused ? 0 : Math.max(this.performanceSubsteps, requiredSteps);
			const stepDt = steps > 0 ? bounded / steps : 0;
			this.renderFrame(steps, stepDt, true);
		}
	};

	private resetPerformanceGovernor(): void {
		this.performanceEmaMs = 0;
		this.performanceTier = 'none';
		this.performanceMsSinceLastChange = 0;
		this.performanceContinuousOverloadMs = 0;
		this.performanceLastAction = 'none';
		this.performancePressureIterations = this.config.pressureIterations;
		this.performanceSubsteps = this.config.substeps;
	}

	private currentDensityDissipation(): number {
		const duration = this.config.initialDensityDissipationDuration;
		if (duration <= 0) return this.config.densityDissipation;
		const elapsed = this.deterministicAdvance
			? this.simulationTime
			: (performance.now() - this.engineStartTime) / 1000;
		if (elapsed >= duration) return this.config.densityDissipation;
		const mix = Math.max(0, elapsed / duration);
		return (
			this.config.initialDensityDissipation * (1 - mix) +
			this.config.densityDissipation * mix
		);
	}

	private recordPerformanceFrameTime(frameMs: number): void {
		if (!this.config.autoPerformance || this.config.paused) return;
		const sampleMs = sanitizePerformanceFrameSampleMs(frameMs);
		const thresholds = { targetFrameMs: this.config.autoPerformanceTargetFrameMs };
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
				pressureIterations: this.config.autoPerformanceMinPressureIterations,
				substeps: this.config.autoPerformanceMinSubsteps
			},
			thresholds
		});
		if (!decision.changed) return;
		this.performancePressureIterations = decision.pressureIterations;
		this.performanceSubsteps = decision.substeps;
		this.performanceTier = decision.tier;
		this.performanceMsSinceLastChange = 0;
		this.performanceContinuousOverloadMs = 0;
		this.performanceLastAction = decision.action;
	}
}
