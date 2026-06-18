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
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<FrozenSwirl />`. */
	export type FrozenSwirlProps = Pick<
		FluidProps,
		'width' | 'height' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
	>;
</script>

<script lang="ts">
	import Fluid from '../Fluid.svelte';
	import type { FluidHandle } from '../engine/types.js';
	import { FROZEN_SWIRL_CONFIG } from './registry.js';

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
	}: FrozenSwirlProps = $props();

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
	{...FROZEN_SWIRL_CONFIG}
	{width}
	{height}
	class={className}
	{style}
	{seed}
	{lazy}
	{splatOnHover}
	aria-label={ariaLabel}
	backColor={backColor ?? FROZEN_SWIRL_CONFIG.backColor}
/>
