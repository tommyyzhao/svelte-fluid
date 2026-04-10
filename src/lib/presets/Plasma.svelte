<!--
  svelte-fluid — Plasma preset

  Visual intent: a vivid plasma ball confined at the center of the canvas,
  like a magnetic or gravitational field preventing the energy from escaping.
  Full-spectrum colors converge from all compass directions and churn in place;
  dark edges keep the bright core distinct against a near-black backdrop.

  How confinement is achieved:
  - **Eight inward preset jets.** Splats are placed at the eight compass
    points (N, NE, E, SE, S, SW, W, NW) near the canvas edges, each carrying
    inward velocity toward center (0.5, 0.5). The jets carry dye to the center,
    where it piles up and swirls — the visual analog of a magnetic pinch.
  - **High curl (40).** Once converging jets establish a vortex at center,
    the vorticity-confinement term maintains it. The curl force adds energy to
    tighten and sustain any rotating structure, so the center vortex persists
    long after the initial jets have decayed.
  - **Slow velocity dissipation (0.08).** Inward momentum carries dye toward
    center for several seconds (92% after 1 s, 65% after 5 s) before the
    velocity field relaxes. This gives the jets time to fully establish the
    convergence zone before releasing control to the vortex.
  - **Moderate density dissipation (0.1).** Colors fade at roughly 90% per
    second so edge dye deposited by the jets gradually clears while the dense
    center stays bright. This maintains the radial brightness gradient (bright
    core, dark periphery) that reads as confinement. Without it, all colors
    accumulate uniformly and grey-wash the canvas.
  - **Continuous random splats (rate: 0.4 /s, spawnY 0.5).** Fresh HDR color
    is injected into the center-height strip. The existing vortex carries new
    blobs into the swirling core, preventing the plasma from fading over time.
  - **Dark background { 4, 2, 12 }.** Near-black deep purple maximizes the
    contrast between the glowing center and empty edges, sharpening the
    confinement illusion.
  - **Burn-in.** `initialDensityDissipation: 0.6` for 2 s bleeds the initial
    brightness spike as 8 HDR jets converge and overlap at center, then ramps
    down to steady-state 0.1.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<Plasma />`. Sizing/seed/styling are forwarded; all other physics props are hard-coded. */
	export type PlasmaProps = Pick<
		FluidProps,
		'width' | 'height' | 'class' | 'style' | 'seed' | 'lazy' | 'aria-label'
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
		'aria-label': ariaLabel
	}: PlasmaProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// Eight jets from compass points, each carrying inward velocity toward
	// center (0.5, 0.5). Colors span the full visible spectrum.
	// dx/dy are raw velocity values (not scaled by splatForce).
	// y-axis is bottom→top (y=0.95 = top of canvas, y=0.05 = bottom).
	const PRESET_SPLATS: PresetSplat[] = [
		{ x: 0.50, y: 0.95, dx:    0, dy: -600, color: { r: 1.8, g: 0.05, b: 0.10 } }, // N  → red
		{ x: 0.83, y: 0.83, dx: -424, dy: -424, color: { r: 1.8, g: 0.70, b: 0.05 } }, // NE → orange
		{ x: 0.95, y: 0.50, dx: -600, dy:    0, color: { r: 1.5, g: 1.50, b: 0.05 } }, // E  → yellow
		{ x: 0.83, y: 0.17, dx: -424, dy:  424, color: { r: 0.1, g: 1.80, b: 0.20 } }, // SE → green
		{ x: 0.50, y: 0.05, dx:    0, dy:  600, color: { r: 0.05, g: 1.50, b: 1.80 } }, // S  → cyan
		{ x: 0.17, y: 0.17, dx:  424, dy:  424, color: { r: 0.10, g: 0.15, b: 2.20 } }, // SW → blue
		{ x: 0.05, y: 0.50, dx:  600, dy:    0, color: { r: 1.00, g: 0.05, b: 2.00 } }, // W  → purple
		{ x: 0.17, y: 0.83, dx:  424, dy: -424, color: { r: 1.80, g: 0.05, b: 1.20 } }  // NW → magenta
	];

	export const handle: FluidHandle = {
		splat: (x, y, dx, dy, color) => inner?.handle.splat(x, y, dx, dy, color),
		randomSplats: (count) => inner?.handle.randomSplats(count)
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
	aria-label={ariaLabel}
	curl={40}
	densityDissipation={0.1}
	initialDensityDissipation={0.6}
	initialDensityDissipationDuration={2.0}
	velocityDissipation={0.08}
	pressure={0.8}
	splatRadius={0.35}
	splatForce={5000}
	shading
	colorful
	colorUpdateSpeed={8}
	bloom
	bloomThreshold={0.9}
	bloomIntensity={1.2}
	sunrays
	sunraysWeight={0.5}
	initialSplatCount={0}
	backColor={{ r: 4, g: 2, b: 12 }}
	presetSplats={PRESET_SPLATS}
	randomSplatRate={0.4}
	randomSplatSpawnY={0.5}
/>
