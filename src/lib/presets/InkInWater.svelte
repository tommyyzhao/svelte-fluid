<!--
  svelte-fluid — InkInWater preset

  Visual intent: concentrated ink droplets sinking through dark water,
  blooming outward as they fall. Modeled after india ink in a deep tank.

  The pinned configuration lives in `registry.ts` (INK_IN_WATER_CONFIG); see
  that file and ADR-0040 for the physics rationale (low curl micro-vortices,
  gentle splatForce, viscous velocity dissipation, slow ink dispersal).
-->

<script lang="ts" module>
	export type { InkInWaterProps } from '../engine/types.js';
</script>

<script lang="ts">
	import Fluid from '../Fluid.svelte';
	import { DISABLED_PERFORMANCE_STATE } from '../engine/performance-governor.js';
	import type { InkInWaterProps, FluidHandle } from '../engine/types.js';
	import { INK_IN_WATER_CONFIG } from './registry.js';

	let {
		width,
		height,
		maxPixelRatio,
		maxFps,
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
		get isPaused() { return inner?.handle.isPaused ?? true; },
		getPerformanceState: () => inner?.handle.getPerformanceState() ?? DISABLED_PERFORMANCE_STATE
	};
</script>

<Fluid
	bind:this={inner}
	{...INK_IN_WATER_CONFIG}
	{width}
	{height}
	{maxPixelRatio}
	{maxFps}
	class={className}
	{style}
	{seed}
	{lazy}
	{splatOnHover}
	aria-label={ariaLabel}
	backColor={backColor ?? INK_IN_WATER_CONFIG.backColor}
/>
