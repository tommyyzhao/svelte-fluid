<!--
  svelte-fluid — SvgPathFluid preset

  Visual intent: fluid flowing inside a bold ampersand "&"
  glyph, demonstrating text-mode container shapes. The letter is
  rasterized to a mask texture via Canvas 2D fillText, with evenodd
  fill rule so the counter (hole) in the glyph stays transparent.

  Random splats spawn via rejection sampling against the CPU-side mask.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<SvgPathFluid />`. */
	export type SvgPathFluidProps = Pick<
		FluidProps,
		'width' | 'height' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label'
	>;
</script>

<script lang="ts">
	import Fluid from '../Fluid.svelte';
	import type { FluidHandle } from '../engine/types.js';

	let {
		width,
		height,
		class: className,
		style,
		seed,
		lazy,
		'aria-label': ariaLabel,
		splatOnHover
	}: SvgPathFluidProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	const LETTER = '&';
	const FONT = 'bold 200px Georgia, serif';

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
	{width}
	{height}
	class={className}
	{style}
	{seed}
	{lazy}
	{splatOnHover}
	aria-label={ariaLabel}
	containerShape={{ type: 'svgPath', text: LETTER, font: FONT, fillRule: 'evenodd' }}
	curl={30}
	densityDissipation={0.3}
	velocityDissipation={0.1}
	pressure={0.8}
	splatRadius={0.3}
	splatForce={5000}
	shading
	colorful
	bloom
	bloomIntensity={0.9}
	sunrays={false}
	initialSplatCount={8}
	backColor={{ r: 2, g: 2, b: 8 }}
	randomSplatRate={0.8}
	randomSplatCount={1}
	randomSplatSpread={2.0}
	randomSplatSwirl={400}
/>
