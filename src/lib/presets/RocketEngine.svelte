<!--
  svelte-fluid — RocketEngine preset

  Visual intent: a rocket combustion chamber + converging-diverging
  (de Laval) nozzle. Hot exhaust is injected at the chamber head on the
  left, accelerates as the channel pinches to the throat, expands through
  the diverging bell, and dissipates past the bell mouth on the right.

  Geometry: the nozzle is built from TWO obstruction slabs on a full-rect
  canvas (no containerShape). The UPPER slab fills from the top edge down
  to the upper nozzle wall; the LOWER slab fills from the bottom edge up
  to the lower nozzle wall. Between them they leave an open channel:

      chamber (x 5..38) → converging cone (38..50) → throat (50..55,
      narrowest) → diverging bell (55..90) → open exhaust (90..100).

  The bell mouth opens toward the RIGHT. Paths are authored in viewBox
  [0,0,100,100]; SVG y is DOWN, so SVG y=0 is the TOP of the canvas
  (splat-space y≈1) and the centerline (SVG y=50) is splat-space y≈0.5.

  Why openBoundary: obstructions are physical walls regardless of the
  canvas-edge condition, so the slabs still force the flow through the
  throat — but the open boundary lets the exhaust vent off the right edge
  instead of recirculating and saturating the sealed box. Continuous
  injection at the chamber head feeds a steady plume; density dissipation
  cools it to orange down the bell.

  Honest note: the converging-diverging ACCELERATION is faithful (mass
  continuity forces the flow to speed up through the narrow throat). The
  white→yellow→orange→dark COLOR gradient is evocative, not physical — it is
  dye dissipating over distance, not a blackbody temperature falloff.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<RocketEngine />`. Sizing/seed/styling are forwarded; nozzle geometry and combustion physics are pinned. */
	export type RocketEngineProps = Pick<
		FluidProps,
		'width' | 'height' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
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
		splatOnHover,
		'aria-label': ariaLabel,
		backColor
	}: RocketEngineProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// Nozzle walls in viewBox [0,0,100,100], SVG y DOWN. Centerline at y=50.
	// The open channel half-heights (distance from centerline) by station:
	//   chamber 22 → converging → throat 7 (x 50..55) → bell opens to 30 at
	//   the mouth (x 90). Upper wall y = 50 - half; lower wall y = 50 + half.
	//
	// UPPER slab: a closed polygon hugging the top edge (y=0) and dropping to
	// the upper wall contour. Filled region = top edge down to the contour.
	const UPPER =
		'M 5 0 ' + // top-left corner of the canvas
		'L 100 0 ' + // across the top edge to the right
		'L 100 20 ' + // down the right edge to the bell-mouth upper lip
		'L 90 20 ' + // bell mouth (widest opening)
		'L 55 43 ' + // diverging bell tapers in to the throat
		'L 50 43 ' + // throat (flat, narrowest gap)
		'L 38 28 ' + // converging cone opens out toward the chamber
		'L 5 28 ' + // chamber head wall (wide)
		'Z';

	// LOWER slab: mirror of UPPER about the centerline, hugging the bottom
	// edge (y=100). Filled region = bottom edge up to the lower wall contour.
	const LOWER =
		'M 5 100 ' + // bottom-left corner of the canvas
		'L 100 100 ' + // across the bottom edge to the right
		'L 100 80 ' + // up the right edge to the bell-mouth lower lip
		'L 90 80 ' + // bell mouth (widest opening)
		'L 55 57 ' + // diverging bell tapers in to the throat
		'L 50 57 ' + // throat (flat, narrowest gap)
		'L 38 72 ' + // converging cone opens out toward the chamber
		'L 5 72 ' + // chamber head wall (wide)
		'Z';

	// Hot-jet palette (0–1 linear; >1 drives bloom). White-hot at the head,
	// cooling to yellow and orange as the dye spreads downstream.
	// Kept modest (core just above 1, tail well below): in a closed box the
	// continuously re-injected jet accumulates, so hot HDR values bloom-
	// saturate the whole canvas to white. Heavy density dissipation + a small
	// radius keep a bright core that fades to orange down the bell.
	const WHITE = { r: 1.1, g: 0.95, b: 0.65 } as const;
	const YELLOW = { r: 0.95, g: 0.6, b: 0.15 } as const;
	const ORANGE = { r: 0.8, g: 0.3, b: 0.05 } as const;

	// Opening scene: three hot splats at the chamber head so the plume exists
	// on frame 1. y is BOTTOM-to-TOP; the channel centerline sits at y≈0.50.
	const PRESET_SPLATS: PresetSplat[] = [
		{ x: 0.08, y: 0.5, dx: 900, dy: 0, color: WHITE },
		{ x: 0.08, y: 0.45, dx: 900, dy: 0, color: YELLOW },
		{ x: 0.08, y: 0.55, dx: 900, dy: 0, color: ORANGE }
	];

	export const handle: FluidHandle = {
		splat: (x, y, dx, dy, color) => inner?.handle.splat(x, y, dx, dy, color),
		randomSplats: (count) => inner?.handle.randomSplats(count),
		pause: () => inner?.handle.pause(),
		resume: () => inner?.handle.resume(),
		get isPaused() {
			return inner?.handle.isPaused ?? true;
		}
	};

	// Continuous combustion: re-inject the hot jet at the chamber head. The
	// open boundary vents the exhaust off the right edge so it never piles up;
	// density dissipation cools the plume to orange as it travels down the bell.
	onMount(() => {
		// SSR guard: setInterval/matchMedia only exist in the browser.
		if (typeof window === 'undefined') return;
		// Respect users who opt out of motion — keep only the static opening frame.
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

		const id = setInterval(() => {
			if (!inner) return;
			inner.handle.splat(0.08, 0.5, 900, 0, WHITE);
			inner.handle.splat(0.08, 0.45, 900, 0, YELLOW);
			inner.handle.splat(0.08, 0.55, 900, 0, ORANGE);
		}, 120);

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
	{splatOnHover}
	aria-label={ariaLabel}
	obstructions={[{ d: UPPER, fit: 'fill' }, { d: LOWER, fit: 'fill' }]}
	openBoundary
	curl={18}
	densityDissipation={0.85}
	initialDensityDissipation={0.85}
	velocityDissipation={0.05}
	pressure={0.85}
	pressureIterations={24}
	splatRadius={0.11}
	splatForce={6000}
	shading
	colorful={false}
	bloom
	bloomThreshold={0.6}
	bloomIntensity={0.7}
	sunrays
	sunraysWeight={0.6}
	simResolution={192}
	dyeResolution={1024}
	initialSplatCount={0}
	backColor={backColor ?? { r: 8, g: 6, b: 10 }}
	presetSplats={PRESET_SPLATS}
/>
