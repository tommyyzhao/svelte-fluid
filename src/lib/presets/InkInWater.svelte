<!--
  svelte-fluid — InkInWater preset

  Visual intent: concentrated ink droplets sinking through dark water,
  blooming outward as they fall. Modeled after india ink in a deep tank.

  The pinned configuration lives in `registry.ts` (INK_IN_WATER_CONFIG); see
  that file and ADR-0040 for the physics rationale (low curl micro-vortices,
  gentle splatForce, viscous velocity dissipation, slow ink dispersal).
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<InkInWater />`. */
	export type InkInWaterProps = Pick<
		FluidProps,
		'width' | 'height' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
	>;
</script>

<script lang="ts">
	import Fluid from '../Fluid.svelte';
	import type { FluidHandle } from '../engine/types.js';
	import { INK_IN_WATER_CONFIG } from './registry.js';

	let {
		width,
		height,
		class: className,
		style,
		seed,
		lazy,
		splatOnHover = true,
		'aria-label': ariaLabel,
		backColor
	}: InkInWaterProps = $props();

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
	{...INK_IN_WATER_CONFIG}
	{width}
	{height}
	class={className}
	{style}
	{seed}
	{lazy}
	{splatOnHover}
	aria-label={ariaLabel}
	backColor={backColor ?? INK_IN_WATER_CONFIG.backColor}
/>
