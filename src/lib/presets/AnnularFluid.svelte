<!--
  svelte-fluid — AnnularFluid preset

  Visual intent: a ring-vortex of fluid contained between two concentric
  circles. The simulation enforces the annular boundary — velocity and
  dye are zeroed inside the inner circle and outside the outer circle
  after every physics pass.

  The pinned configuration lives in `registry.ts` (ANNULAR_FLUID_CONFIG); see
  that file and ADR-0040. The annulus is centered at (0.5, 0.5) with
  innerRadius 0.15 and outerRadius 0.45; eight tangential jets seed a
  counter-clockwise ring vortex.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<AnnularFluid />`. */
	export type AnnularFluidProps = Pick<
		FluidProps,
		'width' | 'height' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
	>;
</script>

<script lang="ts">
	import Fluid from '../Fluid.svelte';
	import type { FluidHandle } from '../engine/types.js';
	import { ANNULAR_FLUID_CONFIG } from './registry.js';

	let {
		width,
		height,
		class: className,
		style,
		seed,
		lazy,
		'aria-label': ariaLabel,
		splatOnHover = true,
		backColor
	}: AnnularFluidProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	export const handle: FluidHandle = {
		splat: (x, y, dx, dy, color) => inner?.handle.splat(x, y, dx, dy, color),
		randomSplats: (count) => inner?.handle.randomSplats(count),
		pause: () => inner?.handle.pause(),
		resume: () => inner?.handle.resume(),
		get isPaused() { return inner?.handle.isPaused ?? true; }
	};
</script>

<Fluid
	bind:this={inner}
	{...ANNULAR_FLUID_CONFIG}
	{width}
	{height}
	class={className}
	{style}
	{seed}
	{lazy}
	{splatOnHover}
	aria-label={ariaLabel}
	backColor={backColor ?? ANNULAR_FLUID_CONFIG.backColor}
/>
