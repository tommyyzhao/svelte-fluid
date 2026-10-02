<!--
  svelte-fluid — Karman preset

  Visual intent: flow past a single cylinder, evocative of a von Kármán
  vortex street — the alternating wake of vortices shed behind a bluff
  body in a steady cross-flow. A rake of six colored streakline sources
  (persistent flow emitters, one hue each — the classic wind-tunnel
  smoke-rake) feeds continuous filaments through the wake, and the
  cylinder itself is painted via `obstructionColor` so the bluff body
  reads as a visible object instead of a background-colored hole.

  HONEST NOTE (faithful vs. evocative): this is *evocative of* a vortex
  street, NOT a validated shedding simulation. Real Kármán shedding is a
  Navier–Stokes boundary-layer instability; here the cylinder is a
  post-hoc rasterized mask that zeroes velocity+dye inside its footprint.
  Treat this as art that gestures at the phenomenon.

  The pinned configuration lives in `registry.ts` (KARMAN_CONFIG); see that
  file and ADR-0040 — the cylinder obstruction, pressure-gradient drive,
  startup freestream curtain, six-line streakline rake, and open-boundary
  drains are all defined there.
-->

<script lang="ts" module>
	export type { KarmanProps } from '../engine/types.js';
</script>

<script lang="ts">
	import Fluid from '../Fluid.svelte';
	import { DISABLED_PERFORMANCE_STATE } from '../engine/performance-governor.js';
	import type { KarmanProps, FluidHandle } from '../engine/types.js';
	import { KARMAN_CONFIG } from './registry.js';

	let {
		width,
		height,
		maxPixelRatio,
		class: className,
		style,
		seed,
		lazy,
		pointerInput = true,
		splatOnHover = true,
		'aria-label': ariaLabel,
		backColor
	}: KarmanProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	export const handle: FluidHandle = {
		splat: (x, y, dx, dy, color) => inner?.handle.splat(x, y, dx, dy, color),
		randomSplats: (count) => inner?.handle.randomSplats(count),
		pause: () => inner?.handle.pause(),
		resume: () => inner?.handle.resume(),
		get isPaused() {
			return inner?.handle.isPaused ?? true;
		},
		getPerformanceState: () => inner?.handle.getPerformanceState() ?? DISABLED_PERFORMANCE_STATE
	};
</script>

<Fluid
	bind:this={inner}
	{...KARMAN_CONFIG}
	{width}
	{height}
	{maxPixelRatio}
	class={className}
	{style}
	{seed}
	{lazy}
	{pointerInput}
	{splatOnHover}
	aria-label={ariaLabel}
	backColor={backColor ?? KARMAN_CONFIG.backColor}
/>
