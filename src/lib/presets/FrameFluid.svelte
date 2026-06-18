<!--
  svelte-fluid — FrameFluid preset

  Visual intent: fluid swirls around a rectangular inner cutout, like a
  living picture frame. The simulation physically enforces the boundary —
  velocity and dye are zeroed inside the inner rectangle after every
  physics pass, so fluid flows only in the border region.

  The pinned configuration lives in `registry.ts` (FRAME_FLUID_CONFIG); see
  that file and ADR-0040. The base frame is centered at (0.5, 0.5) with
  halfW=0.25, halfH=0.25; the forwarded `innerCornerRadius`/`outerCornerRadius`
  props are merged over that base here.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<FrameFluid />`. */
	export type FrameFluidProps = Pick<
		FluidProps,
		'width' | 'height' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
	> & { innerCornerRadius?: number; outerCornerRadius?: number };
</script>

<script lang="ts">
	import Fluid from '../Fluid.svelte';
	import type { ContainerShape, FluidHandle } from '../engine/types.js';
	import { FRAME_FLUID_CONFIG } from './registry.js';

	let {
		width,
		height,
		class: className,
		style,
		seed,
		lazy,
		'aria-label': ariaLabel,
		innerCornerRadius,
		outerCornerRadius,
		splatOnHover = true,
		backColor
	}: FrameFluidProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// Merge the forwarded corner radii over the registry's base frame shape so
	// the geometry stays single-source while remaining customizable.
	const frameBase = FRAME_FLUID_CONFIG.containerShape as Extract<ContainerShape, { type: 'frame' }>;
	const containerShape = $derived<ContainerShape>({ ...frameBase, innerCornerRadius, outerCornerRadius });

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
	{...FRAME_FLUID_CONFIG}
	{containerShape}
	{width}
	{height}
	class={className}
	{style}
	{seed}
	{lazy}
	{splatOnHover}
	aria-label={ariaLabel}
	backColor={backColor ?? FRAME_FLUID_CONFIG.backColor}
/>
