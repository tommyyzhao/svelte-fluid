<!--
  svelte-fluid — CircularFluid preset

  Visual intent: vivid swirling fluid contained inside a circle.
  The simulation enforces the circular boundary — velocity is zeroed
  outside after every physics pass and dye is masked after advection,
  so fluid accumulates and swirls strictly within the circle.

  The pinned configuration lives in `registry.ts` (CIRCULAR_FLUID_CONFIG);
  see that file and ADR-0040. The container circle is centered at (0.5, 0.5)
  with radius 0.45; eight inward compass jets seed a self-sustaining vortex.

  For a transparent background — showing the CSS parent background through the
  circle exterior — add `transparent`.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<CircularFluid />`. */
	export type CircularFluidProps = Pick<
		FluidProps,
		'width' | 'height' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
	>;
</script>

<script lang="ts">
	import Fluid from '../Fluid.svelte';
	import type { FluidHandle } from '../engine/types.js';
	import { CIRCULAR_FLUID_CONFIG } from './registry.js';

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
	}: CircularFluidProps = $props();

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
	{...CIRCULAR_FLUID_CONFIG}
	{width}
	{height}
	class={className}
	{style}
	{seed}
	{lazy}
	{splatOnHover}
	aria-label={ariaLabel}
	backColor={backColor ?? CIRCULAR_FLUID_CONFIG.backColor}
/>
