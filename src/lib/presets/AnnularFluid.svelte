<!--
  svelte-fluid — AnnularFluid preset

  Visual intent: a ring-vortex of fluid contained between two concentric
  circles. The simulation enforces the annular boundary — velocity and
  dye are zeroed inside the inner circle and outside the outer circle
  after every physics pass.

  The annulus is centered at (0.5, 0.5) with innerRadius 0.15 and
  outerRadius 0.45. Eight tangential preset jets are positioned at the
  midpoint radius (0.30) to establish a counter-clockwise ring vortex.
  `randomSplatSwirl` sustains the orbital motion after the initial jets
  fade.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<AnnularFluid />`. */
	export type AnnularFluidProps = Pick<
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
	}: AnnularFluidProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// Eight tangential jets at 45° intervals on the midpoint circle
	// (radius 0.30 from center). Velocities are perpendicular to the
	// radial direction, driving a counter-clockwise ring vortex.
	// Positions are in UV space (center 0.5, 0.5). At aspect ~1.8,
	// x-offsets are compressed so all jets land inside the annular band.
	const PRESET_SPLATS: PresetSplat[] = [
		{ x: 0.50, y: 0.80, dx:  400, dy:    0, color: { r: 0.9, g: 0.1, b: 0.1 } },  // N  → rightward
		{ x: 0.61, y: 0.71, dx:  283, dy: -283, color: { r: 0.9, g: 0.5, b: 0.1 } },  // NE → SE-tangent
		{ x: 0.67, y: 0.50, dx:    0, dy: -400, color: { r: 0.8, g: 0.8, b: 0.1 } },  // E  → downward
		{ x: 0.61, y: 0.29, dx: -283, dy: -283, color: { r: 0.1, g: 0.9, b: 0.2 } },  // SE → SW-tangent
		{ x: 0.50, y: 0.20, dx: -400, dy:    0, color: { r: 0.1, g: 0.7, b: 0.9 } },  // S  → leftward
		{ x: 0.39, y: 0.29, dx: -283, dy:  283, color: { r: 0.1, g: 0.1, b: 0.9 } },  // SW → NW-tangent
		{ x: 0.33, y: 0.50, dx:    0, dy:  400, color: { r: 0.6, g: 0.1, b: 0.9 } },  // W  → upward
		{ x: 0.39, y: 0.71, dx:  283, dy:  283, color: { r: 0.9, g: 0.1, b: 0.6 } }   // NW → NE-tangent
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
	containerShape={{ type: 'annulus', cx: 0.5, cy: 0.5, innerRadius: 0.15, outerRadius: 0.45 }}
	curl={35}
	densityDissipation={0.08}
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
	randomSplatRate={0.5}
	randomSplatCount={5}
	randomSplatSpawnY={0.5}
	randomSplatSpread={0.8}
	randomSplatSwirl={600}
/>
