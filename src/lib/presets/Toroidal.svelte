<!--
  svelte-fluid — Toroidal preset

  Visual intent: a violent full-spectrum storm circulating in a toroidal
  ring. Eight high-velocity dye blobs orbit inside an annular container
  with strong tangential velocity that seeds fierce counter-clockwise
  flow. Periodic re-injection every 2 s keeps the ring fed with fresh
  color and momentum.

  The pinned configuration lives in `registry.ts` (TOROIDAL_CONFIG); see
  that file and ADR-0040. The re-injection interval below is runtime
  behavior (not config) and reuses the registry's ring splats.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<Toroidal />`. Sizing/seed/styling are forwarded; all other physics props are hard-coded. */
	export type ToroidalProps = Pick<
		FluidProps,
		'width' | 'height' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
	>;
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import Fluid from '../Fluid.svelte';
	import type { FluidHandle } from '../engine/types.js';
	import { TOROIDAL_CONFIG } from './registry.js';

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
	}: ToroidalProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// Re-injected each interval; same ring splats the config seeds initially.
	const PRESET_SPLATS = TOROIDAL_CONFIG.presetSplats ?? [];

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
	{...TOROIDAL_CONFIG}
	{width}
	{height}
	class={className}
	{style}
	{seed}
	{lazy}
	{splatOnHover}
	aria-label={ariaLabel}
	backColor={backColor ?? TOROIDAL_CONFIG.backColor}
/>
