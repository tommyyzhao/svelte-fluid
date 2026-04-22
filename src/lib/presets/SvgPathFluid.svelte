<!--
  svelte-fluid — SvgPathFluid preset

  Visual intent: fluid physically confined inside an SVG star shape,
  demonstrating arbitrary path-based container shapes. The star is
  rasterized to a mask texture via Canvas 2D Path2D, and the simulation
  enforces the boundary the same way it does for analytical shapes.

  The star has 5 points, centered in a 100x100 viewBox. Random splats
  spawn via rejection sampling against the CPU-side mask copy.
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

	// 5-pointed star centered at (50, 50) with outer radius 45, inner radius 20.
	// Authored in a 100x100 coordinate space matching the default viewBox.
	const STAR_PATH = 'M50,5 L61.8,37.6 L97.6,37.6 L68.8,58.8 L79.4,91.4 L50,72 L20.6,91.4 L31.2,58.8 L2.4,37.6 L38.2,37.6 Z';

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
	containerShape={{ type: 'svgPath', d: STAR_PATH }}
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
/>
