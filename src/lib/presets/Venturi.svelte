<!--
  svelte-fluid — Venturi preset

  Visual intent: Bernoulli's principle made visible. A gentle left-to-right
  pressure-gradient-style body force drives fluid through a wide channel that
  is squeezed through a central throat formed by two concave islands.
  Continuity forces the flow to accelerate through the constriction; the
  display maps velocity magnitude to a CFD-style color axis.

  The pinned configuration lives in `registry.ts` (VENTURI_CONFIG); see that
  file and ADR-0040 — the two obstruction islands (≈5.3:1 area contraction),
  the pressure-gradient force, and the speed/CFD visualization are defined
  there.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<Venturi />`. Sizing/seed/styling are forwarded; all physics props are pinned. */
	export type VenturiProps = Pick<
		FluidProps,
		| 'width'
		| 'height'
		| 'class'
		| 'style'
		| 'seed'
		| 'lazy'
		| 'pointerInput'
		| 'splatOnHover'
		| 'aria-label'
		| 'backColor'
	>;
</script>

<script lang="ts">
	import Fluid from '../Fluid.svelte';
	import type { FluidHandle } from '../engine/types.js';
	import { VENTURI_CONFIG } from './registry.js';

	let {
		width,
		height,
		class: className,
		style,
		seed,
		lazy,
		pointerInput = true,
		splatOnHover = true,
		'aria-label': ariaLabel,
		backColor
	}: VenturiProps = $props();

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
	{...VENTURI_CONFIG}
	{width}
	{height}
	class={className}
	{style}
	{seed}
	{lazy}
	{pointerInput}
	{splatOnHover}
	aria-label={ariaLabel}
	backColor={backColor ?? VENTURI_CONFIG.backColor}
/>
