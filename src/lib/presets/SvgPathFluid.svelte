<!--
  svelte-fluid — SvgPathFluid preset

  Visual intent: fluid flowing inside a bold ampersand "&"
  glyph, demonstrating text-mode container shapes. The letter is
  rasterized to a mask texture via Canvas 2D fillText, with evenodd
  fill rule so the counter (hole) in the glyph stays transparent.

  Random splats spawn via rejection sampling against the CPU-side mask.

  The pinned configuration lives in `registry.ts` (SVG_PATH_FLUID_CONFIG);
  see that file and ADR-0040.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<SvgPathFluid />`. */
	export type SvgPathFluidProps = Pick<
		FluidProps,
		'width' | 'height' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
	>;
</script>

<script lang="ts">
	import Fluid from '../Fluid.svelte';
	import type { FluidHandle } from '../engine/types.js';
	import { SVG_PATH_FLUID_CONFIG } from './registry.js';

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
	}: SvgPathFluidProps = $props();

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
	{...SVG_PATH_FLUID_CONFIG}
	{width}
	{height}
	class={className}
	{style}
	{seed}
	{lazy}
	{splatOnHover}
	aria-label={ariaLabel}
	backColor={backColor ?? SVG_PATH_FLUID_CONFIG.backColor}
/>
