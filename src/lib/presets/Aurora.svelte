<!--
  svelte-fluid — Aurora preset

  Visual intent: northern lights — green, magenta, and pale-blue ribbons
  drifting laterally across a deep night sky. Five horizontal-band
  splats with sideways velocity create the cross-canvas drift; high
  bloom and sunrays produce the characteristic glow.

  Trade-offs:
  - `densityDissipation: 0` so the ribbons persist and layer onto each
    other. The mid velocity dissipation (0.3) softens the lateral motion
    so the bands meander rather than fly across.
  - `colorful: false` because the carefully picked aurora palette would
    be drowned out by the engine's seeded color rotation.
  - Heavy bloom (`bloomIntensity: 1.5`) is the look — without it the
    bands appear flat.
  - **`sunraysWeight: 1.4` is intentionally above the "safe ceiling"**
    derived in `docs/learnings/presets.md` (which recommends 0.3–0.4
    for whiteout-resistant glow). At 1.4 the closed-form peak
    amplification is `(1 + 11.4 × 1.4) × 0.7 ≈ 11.9×`, so the canvas
    will brighten significantly over the first ~10 seconds as the
    bands spread into more of the sunrays mask. This is the desired
    aurora look — a slowly-growing wash of color rather than a static
    snapshot. If you want a more restrained version, fork this preset
    and drop `sunraysWeight` to 0.6 and `bloomIntensity` to 1.0.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<Aurora />`. */
	export type AuroraProps = Pick<
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
	}: AuroraProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// Cross-canvas horizontal splats stacked at slightly different
	// vertical bands. Greens dominate the central band; magentas and
	// pale blues fringe it.
	const PRESET_SPLATS: PresetSplat[] = [
		{ x: 0.15, y: 0.55, dx: 700, dy: 80, color: { r: 0.10, g: 1.6, b: 0.45 } },
		{ x: 0.45, y: 0.6, dx: 600, dy: -60, color: { r: 0.15, g: 1.4, b: 0.55 } },
		{ x: 0.78, y: 0.5, dx: -550, dy: 90, color: { r: 1.5, g: 0.25, b: 1.4 } },
		{ x: 0.3, y: 0.45, dx: 500, dy: 30, color: { r: 0.45, g: 0.9, b: 1.6 } },
		{ x: 0.65, y: 0.62, dx: -650, dy: -40, color: { r: 0.30, g: 1.5, b: 0.85 } }
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
	aria-label={ariaLabel}
	curl={40}
	densityDissipation={0}
	velocityDissipation={0.3}
	pressure={0.85}
	splatRadius={0.4}
	splatForce={6000}
	shading
	colorful={false}
	bloom
	bloomIntensity={1.5}
	sunrays
	sunraysWeight={1.4}
	initialSplatCount={0}
	backColor={{ r: 2, g: 4, b: 18 }}
	presetSplats={PRESET_SPLATS}
/>
