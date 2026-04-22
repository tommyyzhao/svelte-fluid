<!--
  svelte-fluid — CircularFluid preset

  Visual intent: a vivid plasma ball physically confined inside a circle.
  The simulation enforces the circular boundary — velocity is zeroed
  outside after every physics pass and dye is masked after advection,
  so fluid accumulates and swirls strictly within the circle.

  The container circle is centered at (0.5, 0.5) with radius 0.45
  (45% of canvas height). This fits comfortably inside landscape canvases
  while leaving room for the background to show around it.

  Eight inward preset jets converge from the compass points, establishing
  the initial convergence pattern. The circular boundary immediately
  reflects the jets back inward, producing a self-sustaining vortex.
  `randomSplatRate` maintains fresh colour after the initial jets fade.

  The background outside the circle uses the configured `backColor`
  (default black). For a transparent background — showing the CSS
  parent background through the circle exterior — add `transparent`.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<CircularFluid />`. */
	export type CircularFluidProps = Pick<
		FluidProps,
		'width' | 'height' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label'
	>;
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
		splatOnHover
	}: CircularFluidProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// Eight jets from compass directions, each pointing inward toward
	// center (0.5, 0.5). Positioned at physical distance ~0.35 from center
	// (inside the 0.45-radius circle) assuming aspect ~1.8. This keeps all
	// jets inside the circle for aspect ratios up to ~2.3:1.
	//
	// Color values are scaled down from the full-canvas Plasma preset
	// because the circular area concentrates dye into ~35% of the canvas.
	// The engine's random-splat path applies a 10× multiplier, so these
	// moderate values prevent instant over-saturation inside the circle.
	const PRESET_SPLATS: PresetSplat[] = [
		{ x: 0.50, y: 0.85, dx:    0, dy: -500, color: { r: 0.9, g: 0.03, b: 0.05 } }, // N  → red
		{ x: 0.64, y: 0.75, dx: -354, dy: -354, color: { r: 0.9, g: 0.35, b: 0.03 } }, // NE → orange
		{ x: 0.69, y: 0.50, dx: -500, dy:    0, color: { r: 0.8, g: 0.80, b: 0.03 } }, // E  → yellow
		{ x: 0.64, y: 0.25, dx: -354, dy:  354, color: { r: 0.05, g: 0.90, b: 0.10 } }, // SE → green
		{ x: 0.50, y: 0.15, dx:    0, dy:  500, color: { r: 0.03, g: 0.75, b: 0.90 } }, // S  → cyan
		{ x: 0.36, y: 0.25, dx:  354, dy:  354, color: { r: 0.05, g: 0.08, b: 1.10 } }, // SW → blue
		{ x: 0.31, y: 0.50, dx:  500, dy:    0, color: { r: 0.50, g: 0.03, b: 1.00 } }, // W  → purple
		{ x: 0.36, y: 0.75, dx:  354, dy: -354, color: { r: 0.90, g: 0.03, b: 0.60 } }  // NW → magenta
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
	containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 }}
	curl={35}
	densityDissipation={0.15}
	initialDensityDissipation={0.5}
	initialDensityDissipationDuration={2.0}
	velocityDissipation={0.06}
	pressure={0.8}
	splatRadius={0.38}
	splatForce={5000}
	shading
	colorful
	colorUpdateSpeed={8}
	bloom
	bloomThreshold={0.6}
	bloomIntensity={1.0}
	sunrays={false}
	initialSplatCount={0}
	backColor={{ r: 4, g: 2, b: 12 }}
	presetSplats={PRESET_SPLATS}
	randomSplatRate={1.2}
	randomSplatCount={1}
	randomSplatSpawnY={0.5}
	randomSplatSpread={0.8}
	randomSplatSwirl={500}
/>
