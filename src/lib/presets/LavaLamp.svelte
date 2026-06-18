<!--
  svelte-fluid — LavaLamp preset

  Visual intent: warm, slow-rising blobs inside a glass vessel on a
  light-silver canvas. Density is locked to zero in steady state so the
  blobs never fade; velocity dissipation is tiny so the lazy buoyant
  motion meanders rather than freezing. A roundedRect container with
  glass refraction sells the physical metaphor of a real lamp body.

  The pinned configuration lives in `registry.ts` (LAVA_LAMP_CONFIG); see
  that file's design notes and ADR-0040 for why. The rationale for the
  individual values is preserved in the registry comments and
  `docs/learnings/presets.md`.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<LavaLamp />`. Sizing/seed/styling are forwarded; all other physics props are hard-coded. */
	export type LavaLampProps = Pick<
		FluidProps,
		'width' | 'height' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
	>;
</script>

<script lang="ts">
	import Fluid from '../Fluid.svelte';
	import type { FluidHandle } from '../engine/types.js';
	import { LAVA_LAMP_CONFIG } from './registry.js';

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
	}: LavaLampProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	/** Imperative API forwarded to the inner Fluid. */
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
	{...LAVA_LAMP_CONFIG}
	{width}
	{height}
	class={className}
	{style}
	{seed}
	{lazy}
	{splatOnHover}
	aria-label={ariaLabel}
	backColor={backColor ?? LAVA_LAMP_CONFIG.backColor}
/>
