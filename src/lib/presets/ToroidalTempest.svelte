<!--
  svelte-fluid — Toroidal Tempest preset

  Visual intent: a violent full-spectrum storm circulating in a toroidal
  ring. Eight high-velocity dye blobs orbit inside an annular container
  with strong tangential velocity that seeds fierce counter-clockwise
  flow. Periodic re-injection every 2 s keeps the ring fed with fresh
  color and momentum.

  Key design choices:
  - **Annulus container** bounds the fluid to a ring between
    innerRadius 0.15 and outerRadius 0.42.
  - **Eight splats at 45° intervals** with strong tangential velocity
    orthogonal to the radius vector (V=300, ~5× the gentle ring preset).
  - **Very low velocity dissipation (0.02)** — flow persists with
    gradual decay, keeping the storm alive.
  - **High curl (50)** amplifies rotational structures and tightens
    vortex filaments.
  - **Periodic re-injection** every 2 s re-splats the same 8 blobs
    (with positional jitter) to sustain the tempest.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<ToroidalTempest />`. Sizing/seed/styling are forwarded; all other physics props are hard-coded. */
	export type ToroidalTempestProps = Pick<
		FluidProps,
		'width' | 'height' | 'class' | 'style' | 'seed' | 'lazy' | 'aria-label'
	>;
</script>

<script lang="ts">
	import { onMount } from 'svelte';
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
	}: ToroidalTempestProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// Eight dye blobs on the annular ring at 45° intervals with strong
	// tangential (counter-clockwise) velocity orthogonal to the radius.
	const R = 0.285; // mid-ring radius
	const A = 1.3;   // approximate aspect ratio for x correction
	const V = 300;   // strong tangential kick — 5× the gentle ring
	const S = V * 0.707;
	const PRESET_SPLATS: PresetSplat[] = [
		{ x: 0.5 + R / A,         y: 0.5,              dx: 0,  dy: V,  color: { r: 1.8, g: 0.05, b: 0.10 } }, // E  → red
		{ x: 0.5 + R / A * 0.707, y: 0.5 + R * 0.707,  dx: -S, dy: S,  color: { r: 1.8, g: 0.70, b: 0.05 } }, // NE → orange
		{ x: 0.5,                  y: 0.5 + R,           dx: -V, dy: 0,  color: { r: 1.5, g: 1.50, b: 0.05 } }, // N  → yellow
		{ x: 0.5 - R / A * 0.707, y: 0.5 + R * 0.707,  dx: -S, dy: -S, color: { r: 0.1, g: 1.80, b: 0.20 } }, // NW → green
		{ x: 0.5 - R / A,         y: 0.5,              dx: 0,  dy: -V, color: { r: 0.05, g: 1.50, b: 1.80 } }, // W  → cyan
		{ x: 0.5 - R / A * 0.707, y: 0.5 - R * 0.707,  dx: S,  dy: -S, color: { r: 0.10, g: 0.15, b: 2.20 } }, // SW → blue
		{ x: 0.5,                  y: 0.5 - R,           dx: V,  dy: 0,  color: { r: 1.00, g: 0.05, b: 2.00 } }, // S  → purple
		{ x: 0.5 + R / A * 0.707, y: 0.5 - R * 0.707,  dx: S,  dy: S,  color: { r: 1.80, g: 0.05, b: 1.20 } }  // SE → magenta
	];

	export const handle: FluidHandle = {
		splat: (x, y, dx, dy, color) => inner?.handle.splat(x, y, dx, dy, color),
		randomSplats: (count) => inner?.handle.randomSplats(count),
		pause: () => inner?.handle.pause(),
		resume: () => inner?.handle.resume(),
		get isPaused() { return inner?.handle.isPaused ?? true; }
	};

	// Re-inject the 8 ring splats every 2 s with positional jitter
	// so the pattern doesn't look perfectly mechanical.
	onMount(() => {
		const id = setInterval(() => {
			if (!inner) return;
			for (const s of PRESET_SPLATS) {
				const jx = (Math.random() - 0.5) * 0.04;
				const jy = (Math.random() - 0.5) * 0.04;
				inner.handle.splat(s.x + jx, s.y + jy, s.dx, s.dy, s.color);
			}
		}, 2000);
		return () => clearInterval(id);
	});
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
	containerShape={{ type: 'annulus', cx: 0.5, cy: 0.5, innerRadius: 0.15, outerRadius: 0.42 }}
	curl={50}
	densityDissipation={0.25}
	initialDensityDissipation={0.6}
	initialDensityDissipationDuration={2.0}
	velocityDissipation={0.02}
	pressure={0.8}
	splatRadius={0.4}
	splatForce={6000}
	shading
	colorful
	colorUpdateSpeed={8}
	bloom
	bloomThreshold={0.5}
	bloomIntensity={1.8}
	sunrays
	sunraysWeight={0.6}
	initialSplatCount={0}
	backColor={{ r: 2, g: 2, b: 10 }}
	presetSplats={PRESET_SPLATS}
/>
