<!--
  svelte-fluid — TeslaValve preset

  Visual intent: a pulsed flame-salt jet through a passive Tesla-valve-like
  channel. Copper, potassium and sodium salts cycle through the inlet, glow as
  thermal emission, and cold isothermal walls remove heat (not salt). The
  channel is black on white walls under a glass cover.

  Honest note: this is a live incompressible throughflow visualization. It
  shows plausible routing, separation, and pocket recirculation cues, but it
  does not compute a reverse/forward pressure-drop ratio or real valve
  rectification.

  The pinned configuration lives in `registry.ts` (TESLA_VALVE_CONFIG); see
  that file, ADR-0040 and ADR-0132 — the even-odd svgPath channel container,
  the pulsed salt source and the emission overlay are defined there.

  White walls need markup: the canvas is transparent and an SVG of the channel
  sits under it. The nozzle matches the pipe mouth only at 3:1, so the stage
  letterboxes inside the frame. `class`, `style`, `width` and `height` apply to
  the frame, which fills its parent by default.
-->

<script lang="ts" module>
	export type { TeslaValveProps } from '../engine/types.js';
</script>

<script lang="ts">
	import Fluid from '../Fluid.svelte';
	import { DISABLED_PERFORMANCE_STATE } from '../engine/performance-governor.js';
	import type { TeslaValveProps, FluidHandle } from '../engine/types.js';
	import { TESLA_VALVE_CONFIG } from './registry.js';
	// Separate import: registry.test.ts greps for the line above.
	import { TESLA_VALVE_FRAME } from './registry.js';

	let {
		width,
		height,
		maxPixelRatio,
		maxFps,
		class: className,
		style,
		seed,
		lazy,
		// Off by default: the emission overlay hides hover dye (ADR 0132).
		pointerInput = false,
		splatOnHover = false,
		'aria-label': ariaLabel,
		backColor
	}: TeslaValveProps = $props();

	const valve = TESLA_VALVE_CONFIG.containerShape as { d: string; viewBox: [number, number, number, number] };
	const wall = $derived(backColor ?? TESLA_VALVE_CONFIG.backColor!);
	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	export const handle: FluidHandle = {
		splat: (x, y, dx, dy, color) => inner?.handle.splat(x, y, dx, dy, color),
		randomSplats: (count) => inner?.handle.randomSplats(count),
		pause: () => inner?.handle.pause(),
		resume: () => inner?.handle.resume(),
		get isPaused() { return inner?.handle.isPaused ?? true; },
		getPerformanceState: () => inner?.handle.getPerformanceState() ?? DISABLED_PERFORMANCE_STATE
	};
</script>

<div
	class={className}
	style:--tv-wall={TESLA_VALVE_FRAME.wallColor}
	style:--tv-aspect={TESLA_VALVE_FRAME.aspect}
	style:width={width != null ? `${width}px` : undefined}
	style:height={height != null ? `${height}px` : undefined}
	{style}
	data-teslavalve-frame
>
	<div class="tv-stage">
		<svg viewBox={valve.viewBox.join(' ')} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
			<path d={valve.d} fill="rgb({wall.r} {wall.g} {wall.b})" fill-rule="evenodd" />
		</svg>
		<Fluid
			bind:this={inner}
			{...TESLA_VALVE_CONFIG}
			{maxPixelRatio}
			{maxFps}
			{seed}
			{lazy}
			{pointerInput}
			{splatOnHover}
			aria-label={ariaLabel}
			backColor={backColor ?? TESLA_VALVE_CONFIG.backColor}
		/>
	</div>
</div>

<style>
	[data-teslavalve-frame] {
		height: 100%;
		display: grid;
		place-items: center;
		container-type: size;
		background: var(--tv-wall);
	}
	.tv-stage {
		position: relative;
		width: min(100cqw, calc(100cqh * var(--tv-aspect)));
		aspect-ratio: var(--tv-aspect);
	}
	svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
</style>
