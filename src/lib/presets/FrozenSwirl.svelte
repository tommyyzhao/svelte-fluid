<!--
  svelte-fluid — FrozenSwirl preset

  Visual intent: a single dramatic icy whirlpool that spins itself out
  and comes to rest. High velocity dissipation freezes the motion fast,
  leaving a permanent crystalline curl on a deep navy backdrop.

  Trade-offs:
  - `velocityDissipation: 1.0` is aggressive — the simulation comes to a
    near-stop within a couple of seconds. That's the entire point: a
    snapshot rather than an animation.
  - `densityDissipation: 0` so the dye that the swirl draws stays put
    after motion ceases.
  - High curl + high splatForce + a single off-center splat with strong
    horizontal velocity → asymmetric vortex.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<FrozenSwirl />`. */
	export type FrozenSwirlProps = Pick<
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
	}: FrozenSwirlProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// One large central splat plus two smaller off-axis ones to break
	// perfect symmetry. The central splat carries strong horizontal
	// velocity so vorticity confinement spins it into a vortex before
	// the high velocity dissipation locks it in place.
	const PRESET_SPLATS: PresetSplat[] = [
		{ x: 0.5, y: 0.5, dx: 1100, dy: 0, color: { r: 0.4, g: 0.85, b: 1.6 } },
		{ x: 0.35, y: 0.42, dx: -300, dy: 200, color: { r: 0.55, g: 0.95, b: 1.5 } },
		{ x: 0.62, y: 0.58, dx: 400, dy: -150, color: { r: 0.7, g: 1.1, b: 1.7 } }
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
	curl={50}
	densityDissipation={0}
	velocityDissipation={1.0}
	pressure={0.95}
	splatRadius={0.5}
	splatForce={8000}
	shading
	colorful={false}
	bloom
	bloomIntensity={1.0}
	sunrays={false}
	initialSplatCount={0}
	backColor={{ r: 4, g: 8, b: 24 }}
	presetSplats={PRESET_SPLATS}
/>
