/*
 * svelte-fluid — public library entry
 * Derivative work of WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017, MIT.
 */

export { default as Fluid } from './Fluid.svelte';

export { default as FluidBackground } from './FluidBackground.svelte';

export { default as FluidReveal } from './FluidReveal.svelte';

export { default as FluidDistortion } from './FluidDistortion.svelte';

export { default as FluidStick } from './FluidStick.svelte';

export { default as FluidText } from './FluidText.svelte';

// Interface primitives on the shared WebGL2 host (ADR-0088/0093). Without
// WebGL2 each falls back to a plain native control.
export { default as InkPaper } from './InkPaper.svelte';

export { default as LiquidButton } from './LiquidButton.svelte';

export { default as LiquidSegmented } from './LiquidSegmented.svelte';

export { default as LiquidDropZone } from './LiquidDropZone.svelte';

export { default as LiquidCaustics } from './LiquidCaustics.svelte';

export { default as FoilSwitch } from './FoilSwitch.svelte';

export { FluidEngine, type FluidEngineOptions } from './engine/FluidEngine.js';
export {
	isWebGLAvailable,
	WebGLUnavailableError,
	type WebGLUnavailableReason,
	type GetContextOptions
} from './engine/gl-support.js';
export type {
	FluidConfig,
	FluidHandle,
	PerformanceAction,
	PerformanceState,
	PerformanceTier,
	PresetSplat,
	RGB,
	ToneMapping,
	ContainerShape,
	StickyMask,
	Vec2,
	FlowMode,
	FlowBoundary,
	FlowBoundaryKind,
	FlowSource,
	FlowOutlet,
	FlowScalarField,
	FlowForce,
	FlowGridField,
	PrescribedFlowField,
	FlowVisualization,
	FlowConfig,
	FluidProps,
	FluidBackgroundProps,
	FluidRevealProps,
	FluidDistortionProps,
	FluidStickProps,
	FluidTextProps,
	InkBrush,
	InkPaperProps,
	LiquidTone,
	LiquidButtonProps,
	LiquidSegmentedOption,
	LiquidSegmentedProps,
	LiquidDropZoneProps,
	LiquidCausticsProps,
	FoilSwitchProps
} from './engine/types.js';
export { mulberry32, randomSeed, generateColor, HSVtoRGB, normalizeColor, type Rng } from './engine/rng.js';

// Preset wrapper components — opinionated, hard-coded `<Fluid />`
// configurations for common visual themes. See `src/lib/presets/`.
export { default as LavaLamp, type LavaLampProps } from './presets/LavaLamp.svelte';
export { default as Plasma, type PlasmaProps } from './presets/Plasma.svelte';
export { default as InkInWater, type InkInWaterProps } from './presets/InkInWater.svelte';
export { default as FrozenSwirl, type FrozenSwirlProps } from './presets/FrozenSwirl.svelte';
export { default as Aurora, type AuroraProps } from './presets/Aurora.svelte';
export { default as CircularFluid, type CircularFluidProps } from './presets/CircularFluid.svelte';
export { default as FrameFluid, type FrameFluidProps } from './presets/FrameFluid.svelte';
export { default as AnnularFluid, type AnnularFluidProps } from './presets/AnnularFluid.svelte';
export { default as SvgPathFluid, type SvgPathFluidProps } from './presets/SvgPathFluid.svelte';
export { default as Toroidal, type ToroidalProps } from './presets/Toroidal.svelte';
export { default as GasFlare, type GasFlareProps } from './presets/GasFlare.svelte';
export { default as Venturi, type VenturiProps } from './presets/Venturi.svelte';
export { default as Karman, type KarmanProps } from './presets/Karman.svelte';
export { default as TeslaValve, type TeslaValveProps } from './presets/TeslaValve.svelte';
