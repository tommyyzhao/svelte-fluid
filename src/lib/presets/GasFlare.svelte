<!--
  svelte-fluid — GasFlare preset

  Visual intent: excess gas burning from a flare tip. A hot jet exits a
  simple stack/nozzle near the bottom of the canvas, rolls into shear-layer
  vortices, and rises as the temperature scalar adds buoyancy.

  Honest note: this is a qualitative incompressible jet/plume scene. The
  solver captures obstruction routing, entrainment, advection, and scalar
  buoyancy; it does not solve combustion chemistry, compressibility, soot,
  radiation, or heat release.

  The pinned configuration lives in `registry.ts` (GAS_FLARE_CONFIG); see
  that file and ADR-0040 — the two stack-wall obstructions, the hot line
  source, scalar buoyancy, and temperature visualization are defined there.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<GasFlare />`. Sizing/seed/styling are forwarded; flare geometry and plume behavior are pinned. */
	export type GasFlareProps = Pick<
		FluidProps,
		| 'width'
		| 'height'
		| 'class'
		| 'style'
		| 'seed'
		| 'lazy'
		| 'pointerInput'
		| 'splatOnHover'
		| 'aria-label'
		| 'backColor'
	>;
</script>

<script lang="ts">
	import Fluid from '../Fluid.svelte';
	import type { FluidHandle } from '../engine/types.js';
	import { GAS_FLARE_CONFIG } from './registry.js';

	let {
		width,
		height,
		class: className,
		style,
		seed,
		lazy,
		pointerInput = true,
		splatOnHover = true,
		'aria-label': ariaLabel,
		backColor
	}: GasFlareProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	export const handle: FluidHandle = {
		splat: (x, y, dx, dy, color) => inner?.handle.splat(x, y, dx, dy, color),
		randomSplats: (count) => inner?.handle.randomSplats(count),
		pause: () => inner?.handle.pause(),
		resume: () => inner?.handle.resume(),
		get isPaused() {
			return inner?.handle.isPaused ?? true;
		}
	};
</script>

<Fluid
	bind:this={inner}
	{...GAS_FLARE_CONFIG}
	{width}
	{height}
	class={className}
	{style}
	{seed}
	{lazy}
	{pointerInput}
	{splatOnHover}
	aria-label={ariaLabel}
	backColor={backColor ?? GAS_FLARE_CONFIG.backColor}
/>
