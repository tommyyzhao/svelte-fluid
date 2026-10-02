<!--
  svelte-fluid — FrozenSwirl preset

  Visual intent: a single dramatic icy whirlpool contained in a circular
  vessel that spins itself out and comes to rest. High velocity
  dissipation freezes the motion fast, leaving a permanent crystalline
  curl on a deep navy backdrop.

  The pinned configuration lives in `registry.ts` (FROZEN_SWIRL_CONFIG); see
  that file and ADR-0040. `velocityDissipation: 1.0` is the intentional point:
  a snapshot rather than an animation.
-->

<script lang="ts" module>
	export type { FrozenSwirlProps } from '../engine/types.js';
</script>

<script lang="ts">
	import Fluid from '../Fluid.svelte';
	import { DISABLED_PERFORMANCE_STATE } from '../engine/performance-governor.js';
	import type { FrozenSwirlProps, FluidHandle } from '../engine/types.js';
	import { FROZEN_SWIRL_CONFIG } from './registry.js';

	let {
		width,
		height,
		maxPixelRatio,
		class: className,
		style,
		seed,
		lazy,
		splatOnHover = true,
		'aria-label': ariaLabel,
		backColor
	}: FrozenSwirlProps = $props();

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
	{...FROZEN_SWIRL_CONFIG}
	{width}
	{height}
	{maxPixelRatio}
	class={className}
	{style}
	{seed}
	{lazy}
	{splatOnHover}
	aria-label={ariaLabel}
	backColor={backColor ?? FROZEN_SWIRL_CONFIG.backColor}
/>
