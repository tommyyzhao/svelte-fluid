<!--
  svelte-fluid — Galaxy preset

  Visual intent: a rotating spiral galaxy on a deep-space backdrop. The
  initial splats are placed on a logarithmic-ish spiral with their
  velocities perpendicular to the radial direction, so the simulation
  spins them into trailing arms. Density dissipation is locked to zero
  in steady state so the arms persist forever.

  How the brightness is tuned:
  - **No bloom and no sunrays.** The display brightness tracks the dye
    texture exactly — see `docs/learnings/presets.md` for the
    "spreading-coverage runaway" analysis. Vivid display comes from
    bright splat colors plus 3D shading, not from post-process glow.
  - **Minimal burn-in.** `initialDensityDissipation: 0.3` for 1.0
    second (linear ramp to 0). Average dissipation 0.15 over 60
    frames; surviving fraction ≈ 86%. Just enough to bleed the
    overlap overshoot near the dense central core before locking
    dissipation to zero.
  - **Big splats** (`splatRadius: 0.65`) so the spiral arms are wide
    bands rather than thin filaments.
  - Channels go up to ~1.5 (palette) and ~1.55 (core). High enough
    that the burn-in produces a vivid steady state.
  - **Black background** is preserved because the deep-space backdrop
    is core to the galaxy aesthetic.
  - 12 arm splats — two windings around the disc. Tangential velocity
    spins them into trailing arms before density locks.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<Galaxy />`. */
	export type GalaxyProps = Pick<FluidProps, 'width' | 'height' | 'class' | 'style' | 'seed'>;
</script>

<script lang="ts">
	import Fluid from '../Fluid.svelte';
	import type { FluidHandle, PresetSplat, RGB } from '../engine/types.js';

	let { width, height, class: className, style, seed }: GalaxyProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// Hand-picked palette. Channels go up to ~1.5 — vivid arms without
	// relying on bloom amplification (which is disabled below).
	const PALETTE: RGB[] = [
		{ r: 1.4, g: 0.32, b: 1.3 }, // magenta
		{ r: 0.32, g: 0.5, b: 1.5 }, // electric blue
		{ r: 1.45, g: 0.8, b: 0.3 }, // gold
		{ r: 0.8, g: 0.32, b: 1.45 } // violet
	];

	function buildSpiral(): PresetSplat[] {
		const splats: PresetSplat[] = [];
		const N = 12;
		// Bright central seed — anchors the visual centerpiece.
		splats.push({ x: 0.5, y: 0.5, dx: 0, dy: 0, color: { r: 1.55, g: 1.25, b: 0.85 } });
		for (let i = 0; i < N; i++) {
			const t = i / N;
			// Two arm-windings: angle wraps twice around the disc as we
			// move outward, producing crossed spiral arms.
			const angle = t * Math.PI * 4;
			const radius = 0.08 + t * 0.3;
			const x = 0.5 + Math.cos(angle) * radius;
			const y = 0.5 + Math.sin(angle) * radius;
			// Tangential velocity (perpendicular to radial direction).
			const speed = 1400;
			const dx = -Math.sin(angle) * speed;
			const dy = Math.cos(angle) * speed;
			splats.push({ x, y, dx, dy, color: PALETTE[i % PALETTE.length] });
		}
		return splats;
	}

	const PRESET_SPLATS = buildSpiral();

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
	curl={50}
	densityDissipation={0}
	initialDensityDissipation={0.3}
	initialDensityDissipationDuration={1.0}
	velocityDissipation={0.1}
	pressure={0.9}
	splatRadius={0.65}
	splatForce={10000}
	shading
	colorful={false}
	bloom={false}
	sunrays={false}
	initialSplatCount={0}
	backColor={{ r: 2, g: 0, b: 8 }}
	presetSplats={PRESET_SPLATS}
/>
