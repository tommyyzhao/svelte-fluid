<!--
  svelte-fluid — InkInWater preset

  Visual intent: dark blue dye blooms drifting through still water on a
  pale background. No bloom, no shading, no sunrays — the look is
  painterly rather than glowy. Low curl prevents tight turbulence.

  Tuning notes:
  - Earlier iterations had `velocityDissipation: 0.5`, `splatRadius:
    0.3`, `splatForce: 4000`. The big splats with high force shot the
    ink across the canvas in a fraction of a second; the high velocity
    dissipation then froze the now-spread ink in place, producing a
    homogeneous blue wash. Fix:
      • smaller `splatRadius` (0.14) so each ink drop is a tight bead
      • lower `splatForce` (1500) so the drops sink gently instead of
        exploding outward
      • `velocityDissipation: 0.1` (per user request) so the slow
        sinking motion persists long enough for the drops to thread
        their way down the canvas
      • slightly higher `densityDissipation` (0.4) so the wake behind
        each drop fades, leaving a clean trail rather than a uniform
        background tint
  - Cream-white `backColor` (R/G/B in 0–255 space, normalized at render
    time). Pure white is avoided so the lighter ink edges still read.
  - `shading: false` because the 3D-style shading reads as plastic on a
    light background; flat compositing reads more like watercolor.
  - Four deep-blue splats placed near the top edge with downward
    velocity. y is bottom-up, so y near 1 is the top of the canvas and
    `dy < 0` falls toward the viewer's bottom.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<InkInWater />`. */
	export type InkInWaterProps = Pick<FluidProps, 'width' | 'height' | 'class' | 'style' | 'seed'>;
</script>

<script lang="ts">
	import Fluid from '../Fluid.svelte';
	import type { FluidHandle, PresetSplat } from '../engine/types.js';

	let { width, height, class: className, style, seed }: InkInWaterProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	const PRESET_SPLATS: PresetSplat[] = [
		{ x: 0.32, y: 0.88, dx: 30, dy: -300, color: { r: 0.05, g: 0.1, b: 0.55 } },
		{ x: 0.5, y: 0.93, dx: -25, dy: -380, color: { r: 0.03, g: 0.07, b: 0.45 } },
		{ x: 0.68, y: 0.9, dx: 20, dy: -340, color: { r: 0.07, g: 0.12, b: 0.6 } },
		{ x: 0.5, y: 0.82, dx: 0, dy: -260, color: { r: 0.04, g: 0.08, b: 0.5 } }
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
	curl={5}
	densityDissipation={0.4}
	velocityDissipation={0.1}
	pressure={0.85}
	splatRadius={0.14}
	splatForce={1500}
	shading={false}
	colorful={false}
	bloom={false}
	sunrays={false}
	initialSplatCount={0}
	backColor={{ r: 240, g: 240, b: 245 }}
	presetSplats={PRESET_SPLATS}
/>
