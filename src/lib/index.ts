/*
 * svelte-fluid — public library entry
 * Derivative work of WebGL-Fluid-Simulation by Pavel Dobryakov (c) 2017, MIT.
 */

export { default as Fluid } from './Fluid.svelte';
export type { FluidProps } from './Fluid.svelte';

export { default as FluidBackground } from './FluidBackground.svelte';
export type { FluidBackgroundProps } from './FluidBackground.svelte';

export { default as FluidReveal } from './FluidReveal.svelte';
export type { FluidRevealProps } from './FluidReveal.svelte';

export { default as FluidDistortion } from './FluidDistortion.svelte';
export type { FluidDistortionProps } from './FluidDistortion.svelte';

export { default as FluidStick } from './FluidStick.svelte';
export type { FluidStickProps } from './FluidStick.svelte';

export { default as FluidText } from './FluidText.svelte';
export type { FluidTextProps } from './FluidText.svelte';

export { FluidEngine, type FluidEngineOptions } from './engine/FluidEngine.js';
export type {
	FluidConfig,
	FluidHandle,
	PresetSplat,
	ResolvedConfig,
	RGB,
	FBO,
	DoubleFBO,
	ExtInfo,
	ContainerShape,
	StickyMask
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
export { default as ToroidalTempest, type ToroidalTempestProps } from './presets/ToroidalTempest.svelte';
