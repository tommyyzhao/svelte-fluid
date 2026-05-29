<!--
  svelte-fluid — Kármán vortex street (DEMO-ONLY)

  Visual intent: flow past a single cylinder, evocative of a von Kármán
  vortex street — the alternating wake of vortices shed behind a bluff
  body in a steady cross-flow.

  HONEST NOTE (faithful vs. evocative): this is *evocative of* a vortex
  street, NOT a validated shedding simulation. Real Kármán shedding is a
  Navier–Stokes boundary-layer instability; here the cylinder is a
  post-hoc rasterized mask that zeroes velocity+dye inside its footprint.
  Shedding emerges only weakly and intermittently from the shear layers
  rolling up behind the masked disc, and its frequency is NOT a real
  Strouhal number. Treat this as art that gestures at the phenomenon.

  How the throughflow works:
  - Obstacle physics (velocity+dye zeroed inside the mask) applies even with
    an open boundary, so `openBoundary` is ON: the cross-flow enters at the
    left, passes the cylinder, and vents off the right edge — a real
    downstream outflow rather than a recirculating sealed box.
  - The left→right "stream" is a steady inflow of `autoSplat` jets along
    the left edge pushing +x, plus opening preset splats.

  Geometry: a single circle (authored as two SVG arcs) centered at
  viewBox (35, 52), radius 10, in a [0,0,100,100] viewBox. SVG y is DOWN,
  so SVG y=52 maps to splat-space y≈0.48 — the cylinder sits left of
  center and slightly BELOW the inflow band center (autoSplatCenterY
  0.52). That deliberate vertical offset breaks the up/down symmetry to
  coax the wake into shedding rather than forming a stable standing pair.
-->

<script lang="ts" module>
	import type { FluidProps } from '$lib/Fluid.svelte';

	/** Props consumed by `<Karman />`. Sizing/seed/styling are forwarded; all physics is pinned. */
	export type KarmanProps = Pick<
		FluidProps,
		'width' | 'height' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
	>;
</script>

<script lang="ts">
	import Fluid from '$lib/Fluid.svelte';
	import type { FluidHandle, PresetSplat, Obstruction } from '$lib/engine/types.js';

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
	}: KarmanProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// Track reduced-motion. The continuous inflow (autoSplatRate) is the
	// only motor of this demo, so we gate it to 0 when the user prefers
	// reduced motion — the scene then renders a single static opening pulse.
	let reducedMotion = $state(false);
	$effect(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		reducedMotion = mq.matches;
		const onChange = (e: MediaQueryListEvent) => (reducedMotion = e.matches);
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	});

	// Single cylinder: a circle authored as two semicircular arcs. Center
	// (35, 52) in viewBox units, radius 10. Left-of-center horizontally so
	// there is room downstream for a wake; SVG y=52 → splat-space y≈0.48,
	// just off the inflow centerline to break symmetry.
	const CYLINDER: Obstruction = {
		d: 'M 25 52 A 10 10 0 1 0 45 52 A 10 10 0 1 0 25 52 Z',
		viewBox: [0, 0, 100, 100]
	};

	// Opening scene: a column of fast +x jets along the left edge, spanning
	// the inflow band, so the stream is already established when the wake
	// forms. y is BOTTOM-to-TOP; dx/dy are RAW velocity (not splatForce-
	// scaled). Cool→warm tint top-to-bottom reads as a moving stream.
	const INFLOW_DX = 750;
	const PRESET_SPLATS: PresetSplat[] = [
		{ x: 0.06, y: 0.86, dx: INFLOW_DX, dy: 0, color: { r: 0.1, g: 0.5, b: 1.4 } },
		{ x: 0.06, y: 0.72, dx: INFLOW_DX, dy: 0, color: { r: 0.1, g: 0.8, b: 1.3 } },
		{ x: 0.06, y: 0.58, dx: INFLOW_DX, dy: 0, color: { r: 0.2, g: 1.1, b: 1.0 } },
		{ x: 0.06, y: 0.46, dx: INFLOW_DX, dy: 0, color: { r: 0.4, g: 1.2, b: 0.6 } },
		{ x: 0.06, y: 0.32, dx: INFLOW_DX, dy: 0, color: { r: 1.0, g: 0.9, b: 0.3 } },
		{ x: 0.06, y: 0.18, dx: INFLOW_DX, dy: 0, color: { r: 1.4, g: 0.5, b: 0.2 } }
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
	obstructions={[CYLINDER]}
	openBoundary
	curl={45}
	densityDissipation={0.6}
	velocityDissipation={0.03}
	pressure={0.9}
	pressureIterations={26}
	splatRadius={0.06}
	splatForce={6000}
	shading
	colorful={false}
	bloom
	simResolution={192}
	dyeResolution={1024}
	initialSplatCount={0}
	backColor={backColor ?? { r: 4, g: 6, b: 14 }}
	presetSplats={PRESET_SPLATS}
	autoSplatRate={reducedMotion ? 0 : 26}
	autoSplatCount={3}
	autoSplatVelocityX={750}
	autoSplatVelocityY={0}
	autoSplatSwirl={0}
	autoSplatCenterY={0.52}
	autoSplatBandHeight={0.9}
	autoSplatEvenX={false}
/>
