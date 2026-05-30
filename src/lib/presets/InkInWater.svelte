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
		'width' | 'height' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
	>;
</script>

<script lang="ts">
	import Fluid from '../Fluid.svelte';
	import type { FlowConfig, FluidHandle, PresetSplat } from '../engine/types.js';

	let {
		width,
		height,
		class: className,
		style,
		seed,
		lazy,
		splatOnHover = true,
		'aria-label': ariaLabel,
		backColor
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

	const FLOW: FlowConfig = {
		mode: 'live',
		sources: [
			{
				kind: 'line',
				from: { x: 0.28, y: 0.92 },
				to: { x: 0.72, y: 0.92 },
				velocity: { x: 0, y: -40 },
				dye: { r: 0.018, g: 0.025, b: 0.16 },
				scalars: { ink: 0.7 },
				rate: 7,
				radius: 0.06,
				samples: 5,
				profile: 'parabolic'
			}
		],
		scalarFields: [{ name: 'ink', dissipation: 0.05, advection: 'low-dissipation' }],
		forces: [{ kind: 'buoyancy', scalar: 'ink', direction: { x: 0, y: -1 }, strength: 230, ambient: 0.02 }],
		visualization: { colorBy: 'scalar', scalar: 'ink', transfer: 'ink', scale: 1.25 }
	};

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
	flow={FLOW}
	curl={8}
	densityDissipation={0.18}
	velocityDissipation={0.12}
	pressure={0.85}
	splatRadius={0.12}
	splatForce={800}
	shading
	colorful={false}
	bloom={false}
	bloomIntensity={0.35}
	bloomThreshold={0.4}
	sunrays={false}
	initialSplatCount={0}
	backColor={backColor ?? { r: 6, g: 8, b: 20 }}
	presetSplats={PRESET_SPLATS}
/>
