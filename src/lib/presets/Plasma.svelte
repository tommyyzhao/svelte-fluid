<!--
  svelte-fluid — Plasma preset

  Visual intent: a vivid, persistent energy field that never fades.
  Full-spectrum rotating colors and a dye texture that's locked at zero
  dissipation in steady state, so the opening splats hang on the
  light-silver canvas forever.

  How the brightness is tuned:
  - **Bloom OFF, sunrays ON with low weight.** Bloom is the runaway
    source (additive feedback through `c += bloom` once spreading
    coverage means more pixels exceed the threshold). Sunrays is
    multiplicative through `c *= sunrays` in the display shader and
    can also runaway, but only if `sunraysWeight` is large. The
    sunrays mask amplification at the central peak is roughly
    `(1 + 11.4*weight) * 0.7` (from the 16-tap geometric series).
    At `sunraysWeight: 0.35` that's ~3.5× — a meaningful radial glow
    that fades toward the edges, without saturation.
  - **Minimal burn-in.** `initialDensityDissipation: 0.3` for 1.0
    second (linear ramp to 0). Average dissipation 0.15 over 60
    frames; per-frame survival 1/(1+0.0025) ≈ 0.9975, total survival
    ≈ 86%. Just enough to bleed the additive overlap overshoot before
    locking dissipation to zero permanently.
  - **Way more splats**: `initialSplatCount: 36` (up from 18) so the
    opening field is densely populated from frame 0. Combined with
    `splatRadius: 0.85` (up from 0.75) every splat is a substantial
    presence and the canvas reads as fully filled rather than
    point-source.
  - **Light silver background** ({ 218, 218, 226 } in 0–255). The dye
    blends additively over silver so dim regions read as silver rather
    than black; bright regions show their color clearly.
  - `colorful: true` rotates the pointer color via the seeded RNG so
    the palette keeps shifting subtly. `colorUpdateSpeed: 6` is a
    little slower than default (10) for a calmer color drift.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<Plasma />`. Sizing/seed/styling are forwarded; all other physics props are hard-coded. */
	export type PlasmaProps = Pick<FluidProps, 'width' | 'height' | 'class' | 'style' | 'seed'>;
</script>

<script lang="ts">
	import Fluid from '../Fluid.svelte';
	import type { FluidHandle } from '../engine/types.js';

	let { width, height, class: className, style, seed }: PlasmaProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

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
	curl={30}
	densityDissipation={0}
	initialDensityDissipation={0.3}
	initialDensityDissipationDuration={1.0}
	velocityDissipation={0}
	pressure={0.8}
	splatRadius={0.85}
	splatForce={5000}
	shading
	colorful
	colorUpdateSpeed={6}
	bloom={false}
	sunrays
	sunraysWeight={0.35}
	initialSplatCount={36}
	backColor={{ r: 218, g: 218, b: 226 }}
/>
