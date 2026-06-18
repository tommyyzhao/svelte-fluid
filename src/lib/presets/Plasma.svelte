<!--
  svelte-fluid — Plasma preset

  Visual intent: a vivid plasma ball confined at the center of the canvas,
  like a magnetic or gravitational field preventing the energy from escaping.
  Full-spectrum colors converge from all compass directions and churn in place;
  dark edges keep the bright core distinct against a near-black backdrop.

  The pinned configuration lives in `registry.ts` (PLASMA_CONFIG); see that
  file and ADR-0040. The eight inward compass jets, high curl, and burn-in
  that produce the confinement illusion are documented there.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<Plasma />`. Sizing/seed/styling are forwarded, and `backColor` may be overridden so the preset adapts to its host page; all other physics props are hard-coded. */
	export type PlasmaProps = Pick<
		FluidProps,
		'width' | 'height' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
	>;
</script>

<script lang="ts">
	import Fluid from '../Fluid.svelte';
	import type { FluidHandle } from '../engine/types.js';
	import { PLASMA_CONFIG } from './registry.js';

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
	}: PlasmaProps = $props();

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
	{...PLASMA_CONFIG}
	{width}
	{height}
	class={className}
	{style}
	{seed}
	{lazy}
	{splatOnHover}
	aria-label={ariaLabel}
	backColor={backColor ?? PLASMA_CONFIG.backColor}
/>
