<!--
  svelte-fluid — TeslaValve preset

  Visual intent: a passive Tesla-valve-like channel with asymmetric baffles.
  A pressure-gradient drive moves discrete multicolor inlet splats from the
  left, keeping dye packets readable as they recirculate through side pockets.

  Honest note: this is a live incompressible throughflow visualization. It
  shows plausible routing, separation, and pocket recirculation cues, but it
  does not compute a reverse/forward pressure-drop ratio or real valve
  rectification.

  The pinned configuration lives in `registry.ts` (TESLA_VALVE_CONFIG); see
  that file and ADR-0040 — the even-odd svgPath channel container, the
  pressure-gradient force, and the inlet auto-splat band are defined there.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<TeslaValve />`. Sizing/seed/styling are forwarded; valve geometry and flow settings are pinned. */
	export type TeslaValveProps = Pick<
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
	import { TESLA_VALVE_CONFIG } from './registry.js';

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
	}: TeslaValveProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

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
	{...TESLA_VALVE_CONFIG}
	{width}
	{height}
	class={className}
	{style}
	{seed}
	{lazy}
	{pointerInput}
	{splatOnHover}
	aria-label={ariaLabel}
	backColor={backColor ?? TESLA_VALVE_CONFIG.backColor}
/>
