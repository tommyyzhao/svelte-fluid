<!--
  svelte-fluid — InkInWater preset

  Visual intent: concentrated ink droplets sinking through dark water,
  blooming outward as they fall. Modeled after india ink in a deep tank.

  Physics rationale:
  - **Low curl (8)**: real ink creates micro-vortices from density
    differences (Rayleigh-Taylor instability) as the heavier ink sinks
    through lighter water. Mild vorticity gives organic tendrils.
  - **Low splatForce (800)**: ink drops enter gently — gravity is the
    driver, not momentum. The drops bloom outward from diffusion.
  - **Small splatRadius (0.12)**: concentrated droplets, not sprayed.
  - **velocityDissipation (0.15)**: water is viscous at this scale.
    The sinking motion persists long enough for tendrils to form but
    doesn't sustain forever.
  - **densityDissipation (0.3)**: ink disperses slowly — the cloud
    fades as it mixes with the surrounding water.
  - **Bloom enabled**: light scattering through the ink cloud produces
    a subtle glow, especially at the thinner edges.
  - **Shading enabled**: gives volumetric depth to the ink clouds.
  - **Deep navy background** with slight warm undertone to simulate
    ambient light through dark water.
  - **Varied ink colors**: real ink has chromatic variation — indigo
    core, ultramarine edges, slight violet undertones.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<InkInWater />`. */
	export type InkInWaterProps = Pick<
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
	}: InkInWaterProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// Ink droplets near the top with gentle downward velocity.
	// Chromatic variation: indigo, ultramarine, violet, deep blue.
	const PRESET_SPLATS: PresetSplat[] = [
		{ x: 0.30, y: 0.90, dx: 15,  dy: -180, color: { r: 0.08, g: 0.06, b: 0.55 } }, // indigo
		{ x: 0.50, y: 0.94, dx: -10, dy: -220, color: { r: 0.04, g: 0.10, b: 0.50 } }, // ultramarine
		{ x: 0.70, y: 0.88, dx: 12,  dy: -200, color: { r: 0.12, g: 0.05, b: 0.45 } }, // violet
		{ x: 0.42, y: 0.85, dx: -8,  dy: -160, color: { r: 0.03, g: 0.08, b: 0.48 } }, // deep blue
		{ x: 0.60, y: 0.92, dx: 5,   dy: -190, color: { r: 0.06, g: 0.04, b: 0.52 } }  // dark indigo
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
	curl={8}
	densityDissipation={0.3}
	velocityDissipation={0.15}
	pressure={0.85}
	splatRadius={0.12}
	splatForce={800}
	shading
	colorful={false}
	bloom
	bloomIntensity={0.6}
	bloomThreshold={0.4}
	sunrays={false}
	randomSplatRate={0.2}
	randomSplatColor={{ r: 0.06, g: 0.07, b: 0.50 }}
	randomSplatDx={0}
	randomSplatDy={-180}
	randomSplatSpawnY={0.90}
	initialSplatCount={0}
	backColor={{ r: 6, g: 8, b: 20 }}
	presetSplats={PRESET_SPLATS}
/>
