<!--
  svelte-fluid — Aurora preset

  Visual intent: northern lights — green, magenta, and pale-blue ribbons
  layered across a deep night sky. Five horizontal-band splats give the
  initial composition a sideways push, then velocity dissipation lets the
  bands settle into a luminous steady wash; high bloom and sunrays
  produce the characteristic glow.

  The pinned configuration lives in `registry.ts` (AURORA_CONFIG); see that
  file and ADR-0040. Note `sunraysWeight: 1.4` is intentionally above the
  whiteout-resistant ceiling — the slow brightening wash is the desired look
  (see `docs/learnings/presets.md`).
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<Aurora />`. */
	export type AuroraProps = Pick<
		FluidProps,
		'width' | 'height' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
	>;
</script>

<script lang="ts">
	import Fluid from '../Fluid.svelte';
	import type { FluidHandle } from '../engine/types.js';
	import { AURORA_CONFIG } from './registry.js';

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
	}: AuroraProps = $props();

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
	{...AURORA_CONFIG}
	{width}
	{height}
	class={className}
	{style}
	{seed}
	{lazy}
	{splatOnHover}
	aria-label={ariaLabel}
	backColor={backColor ?? AURORA_CONFIG.backColor}
/>
