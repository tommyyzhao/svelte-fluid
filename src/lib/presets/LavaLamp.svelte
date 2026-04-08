<!--
  svelte-fluid — LavaLamp preset

  Visual intent: warm, slow-rising blobs on a light-silver canvas that
  persist forever. Density is locked to zero in steady state so the
  blobs never fade; velocity dissipation is tiny so the lazy buoyant
  motion meanders rather than freezing.

  How the brightness is tuned:
  - **No bloom and no sunrays.** The display brightness tracks the dye
    texture exactly. Earlier iterations relied on bloom for the molten
    glow but bloom + persistent dye produced runaway brightness via
    spreading-coverage. See `docs/learnings/presets.md`.
  - **Minimal burn-in.** `initialDensityDissipation: 0.25` for 1.0
    second (linear ramp to 0). Average dissipation 0.125, surviving
    fraction ≈ 88%. Just enough to bleed the overlap overshoot from
    the eight large splats before locking dissipation to zero.
  - **Eight blobs across the warm spectrum**: crimson, orange, gold,
    amber, coral, rose, burnt orange, deep red. Spectral variety
    prevents the canvas from collapsing to one homogeneous warm hue
    as the dye field mixes — even the long-term blend remains varied.
  - **Big splats** (`splatRadius: 0.75`) so each blob is a substantial
    presence rather than a point; combined with `splatForce: 2200`
    the rise is gentle rather than jetting.
  - **Light silver background** ({ 222, 218, 215 } — a warm silver
    that sympathizes with the warm dye). Bright dye dominates with
    its color; dim wake regions show silver rather than black.
  - **Slow drift, not swirl.** `velocityDissipation: 0` and per-splat
    velocities around 140–210 (about 1/4 of typical splat velocities)
    give a lazy upward drift that persists forever rather than the
    fast swirling that previous iterations had. The blobs sway gently
    instead of jetting.
  - **Tiny `curl: 5` (was 50).** Vorticity confinement amplifies any
    rotation in the velocity field — at 50 it whips even gentle
    initial impulses into tight spinning vortices that quickly mix
    the dye into a uniform warm wash. At 5 it adds just enough
    rotational subtlety to read as "viscous and dense" without
    pumping itself into a spin-out. Real molten wax has near-zero
    vorticity; the lava lamp aesthetic is buoyancy-dominated, not
    rotation-dominated.
  - **`pressure: 0.8` (default, was 0.95).** The pressure field has a
    "memory coefficient" that controls how much last-frame's pressure
    carries forward. At 0.95 the rotational pressure patterns from
    high-curl iterations persist across frames and reinforce the
    spin-out; at the engine default 0.8 the field decays cleanly each
    frame so the motion stays smooth and dominated by the new
    buoyant impulses.
  - `colorful: false` keeps the hand-picked palette in charge.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<LavaLamp />`. Sizing/seed/styling are forwarded; all other physics props are hard-coded. */
	export type LavaLampProps = Pick<FluidProps, 'width' | 'height' | 'class' | 'style' | 'seed'>;
</script>

<script lang="ts">
	import Fluid from '../Fluid.svelte';
	import type { FluidHandle, PresetSplat } from '../engine/types.js';

	let { width, height, class: className, style, seed }: LavaLampProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// Eight warm blobs spanning the full warm spectrum: deep red →
	// orange → gold → yellow → coral → rose. Spectral variety prevents
	// the canvas from collapsing to one warm hue as the blobs mix in
	// the persistent (densityDissipation=0) dye field. Remember y = 0
	// is the BOTTOM of the canvas — `dy > 0` rises.
	// Velocities are intentionally tiny (~1/4 of typical splat velocities)
	// so the blobs rise as a slow lazy drift instead of jetting upward.
	// Combined with `velocityDissipation: 0` below, the gentle initial
	// momentum is the *only* force the blobs ever feel.
	const PRESET_SPLATS: PresetSplat[] = [
		{ x: 0.18, y: 0.06, dx: 8, dy: 180, color: { r: 1.7, g: 0.12, b: 0.08 } }, // crimson
		{ x: 0.32, y: 0.1, dx: -5, dy: 160, color: { r: 1.8, g: 0.45, b: 0.08 } }, // orange
		{ x: 0.46, y: 0.04, dx: 12, dy: 210, color: { r: 1.7, g: 0.95, b: 0.18 } }, // gold
		{ x: 0.6, y: 0.12, dx: -8, dy: 180, color: { r: 1.8, g: 0.62, b: 0.12 } }, // amber
		{ x: 0.74, y: 0.06, dx: -15, dy: 200, color: { r: 1.7, g: 0.3, b: 0.22 } }, // coral
		{ x: 0.86, y: 0.1, dx: -10, dy: 170, color: { r: 1.6, g: 0.18, b: 0.4 } }, // rose
		{ x: 0.5, y: 0.18, dx: 4, dy: 140, color: { r: 1.7, g: 0.55, b: 0.05 } }, // burnt orange
		{ x: 0.28, y: 0.16, dx: 10, dy: 150, color: { r: 1.5, g: 0.08, b: 0.18 } } // deep red
	];

	/** Imperative API forwarded to the inner Fluid. */
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
	densityDissipation={0}
	initialDensityDissipation={0.25}
	initialDensityDissipationDuration={1.0}
	velocityDissipation={0}
	pressure={0.8}
	splatRadius={0.75}
	splatForce={2200}
	shading
	colorful={false}
	bloom={false}
	sunrays={false}
	initialSplatCount={0}
	backColor={{ r: 222, g: 218, b: 215 }}
	presetSplats={PRESET_SPLATS}
/>
