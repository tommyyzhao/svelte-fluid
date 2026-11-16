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

// Interface primitives on the shared WebGL2 host. Without
// WebGL2 each falls back to a plain native control.
export { default as InkPaper } from './InkPaper.svelte';

export { default as LiquidButton } from './LiquidButton.svelte';

export { default as LiquidSegmented } from './LiquidSegmented.svelte';

export { default as LiquidDropZone } from './LiquidDropZone.svelte';

export { default as LiquidCaustics } from './LiquidCaustics.svelte';

export { default as LiquidToggle } from './LiquidToggle.svelte';

export { default as EnamelText } from './EnamelText.svelte';

export { FluidEngine, type FluidEngineOptions } from './engine/FluidEngine.js';
export {
	isWebGLAvailable,
	WebGLUnavailableError,
	type WebGLUnavailableReason,
	type ContextProbeAttributes
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
	Obstruction,
	StickyMask,
	Vec2,
	FlowMode,
	FlowBoundary,
	FlowBoundaryKind,
	FlowSourceKind,
	FlowProfile,
	FlowScalarName,
	FlowAdvection,
	FlowVisualizationField,
	FlowTransfer,
	FlowSource,
	FlowOutlet,
	FlowScalarField,
	FlowForce,
	FlowGridField,
	PrescribedFlowField,
	FlowVisualization,
	FlowConfig,
	FluidProps,
	PresetBaseProps,
	InteractivePresetProps,
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
	LiquidToggleProps,
	EnamelTextProps
} from './engine/types.js';
// Deprecated helper re-exports. Thin wrappers (not `export { } from`) so the
// `@deprecated` tag lives on the root declaration, in the emitted .d.ts and in
// editors, while the library's own components keep importing `rng.ts` untagged.
import * as rngImpl from './engine/rng.js';
import type { GetContextOptions as GetContextOptionsImpl } from './engine/gl-support.js';
import type { RGB } from './engine/types.js';

/** @deprecated Internal helper, not part of the supported API. Will be removed in 2.0. */
export type Rng = rngImpl.Rng;
/** @deprecated Internal helper, not part of the supported API. Will be removed in 2.0. */
export type GetContextOptions = GetContextOptionsImpl;
/** @deprecated Internal helper, not part of the supported API. Will be removed in 2.0. Mulberry32 seedable 32-bit PRNG. */
export const mulberry32: (seed: number) => Rng = rngImpl.mulberry32;
/** @deprecated Internal helper, not part of the supported API. Will be removed in 2.0. Random unsigned 32-bit seed. */
export const randomSeed: () => number = rngImpl.randomSeed;
/** @deprecated Internal helper, not part of the supported API. Will be removed in 2.0. Random splat colour (0-1) from a seeded RNG. */
export const generateColor: (rng: Rng) => RGB = rngImpl.generateColor;
/** @deprecated Internal helper, not part of the supported API. Will be removed in 2.0. HSV (0-1) to RGB (0-1). */
export const HSVtoRGB: (h: number, s: number, v: number) => RGB = rngImpl.HSVtoRGB;
/** @deprecated Internal helper, not part of the supported API. Will be removed in 2.0. 0-255 RGB to 0-1 RGB. */
export const normalizeColor: (input: RGB) => RGB = rngImpl.normalizeColor;

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
