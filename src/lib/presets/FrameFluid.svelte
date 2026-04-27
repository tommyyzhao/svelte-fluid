<!--
  svelte-fluid — FrameFluid preset

  Visual intent: fluid swirls around a rectangular inner cutout, like a
  living picture frame. The simulation physically enforces the boundary —
  velocity and dye are zeroed inside the inner rectangle after every
  physics pass, so fluid flows only in the border region.

  The inner cutout is centered at (0.5, 0.5) with halfW=0.25, halfH=0.25,
  creating a 50%×50% hole. Fluid fills the surrounding frame region.

  Four jets push fluid along the frame edges in a clockwise circulation,
  with four diagonal jets adding turbulence at the corners.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<FrameFluid />`. */
	export type FrameFluidProps = Pick<
		FluidProps,
		'width' | 'height' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label'
	> & { innerCornerRadius?: number; outerCornerRadius?: number };
</script>

<script lang="ts">
	import Fluid from '../Fluid.svelte';
	import type { FluidHandle, PresetSplat } from '../engine/types.js';

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
		splatOnHover
	}: FrameFluidProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// Clockwise circulation jets along the frame edges, positioned in the
	// frame border region (between the inner rect and canvas edge).
	// Additional corner jets add diagonal turbulence.
	const PRESET_SPLATS: PresetSplat[] = [
		// Edge jets — clockwise circulation
		{ x: 0.50, y: 0.92, dx:  400, dy:    0, color: { r: 0.9, g: 0.1, b: 0.1 } }, // top → right
		{ x: 0.92, y: 0.50, dx:    0, dy: -400, color: { r: 0.1, g: 0.9, b: 0.1 } }, // right → down
		{ x: 0.50, y: 0.08, dx: -400, dy:    0, color: { r: 0.1, g: 0.1, b: 0.9 } }, // bottom → left
		{ x: 0.08, y: 0.50, dx:    0, dy:  400, color: { r: 0.9, g: 0.9, b: 0.1 } }, // left → up
		// Corner jets — diagonal turbulence
		{ x: 0.90, y: 0.90, dx: -300, dy: -300, color: { r: 0.9, g: 0.5, b: 0.1 } }, // TR corner
		{ x: 0.90, y: 0.10, dx: -300, dy:  300, color: { r: 0.1, g: 0.9, b: 0.5 } }, // BR corner
		{ x: 0.10, y: 0.10, dx:  300, dy:  300, color: { r: 0.5, g: 0.1, b: 0.9 } }, // BL corner
		{ x: 0.10, y: 0.90, dx:  300, dy: -300, color: { r: 0.9, g: 0.1, b: 0.9 } }  // TL corner
	];

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
	containerShape={{ type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.25, halfH: 0.25, innerCornerRadius, outerCornerRadius }}
	curl={30}
	densityDissipation={0.08}
	initialDensityDissipation={0.5}
	initialDensityDissipationDuration={2.0}
	velocityDissipation={0.06}
	pressure={0.8}
	splatRadius={0.42}
	splatForce={5000}
	shading
	colorful
	colorUpdateSpeed={8}
	bloom
	bloomThreshold={0.6}
	bloomIntensity={0.9}
	sunrays={false}
	initialSplatCount={0}
	backColor={{ r: 0, g: 0, b: 0 }}
	presetSplats={PRESET_SPLATS}
	randomSplatRate={0.5}
	randomSplatCount={6}
	randomSplatSpawnY={0.5}
	randomSplatSpread={2.0}
	randomSplatSwirl={300}
/>
