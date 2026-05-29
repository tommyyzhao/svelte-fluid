<!--
  svelte-fluid — Venturi preset

  Visual intent: Bernoulli's principle made visible. Five colored
  streamlines enter from the left inlet and are squeezed through a
  central throat formed by two concave islands (top + bottom) that
  bulge toward the centerline. Continuity forces the flow to accelerate
  through the constriction; the bunching streamlines concentrate dye in
  the throat, which crosses the bloom threshold and glows.

  Key design choices:
  - **Open boundary.** Obstructions are physical walls regardless of the
    canvas-edge condition, so the islands still pinch the flow — but the
    open boundary lets streamlines exit the right edge instead of
    recirculating and saturating the sealed box. Continuous left-inlet
    injection feeds a steady stream; the streamlines accelerate through the
    throat (continuity) and vent downstream.
  - **Two obstruction islands** pinch a horizontal channel. The channel
    spans SVG y≈18..82 at the inlet/outlet and narrows to y≈38..62 at the
    throat (x=50) — roughly a 2.7:1 area contraction. SVG path space is
    y-DOWN, so the TOP island (SVG y 0..~38) sits at the TOP of the canvas
    (splat-space y≈0.62..1.00) and vice-versa.
  - **curl 0 (laminar).** Bernoulli is about smooth, ordered streamlines —
    no vorticity confinement that would shred them into turbulence.
  - **Thin splatRadius (0.08) + crisp pressure (30 iters).** Tight
    filaments read as individual streamlines, and accurate incompressible
    continuity makes the throat acceleration crisp.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<Venturi />`. Sizing/seed/styling are forwarded; all physics props are pinned. */
	export type VenturiProps = Pick<
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
	}: VenturiProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// --- Obstruction geometry (viewBox [0,0,100,100], SVG y-DOWN) ---
	//
	// TOP island: fills from the top edge (y=0) down to a concave curve
	// that dips from y=18 at the side walls to y=38 at the throat (x=50).
	// In canvas/splat space this sits at the TOP (y≈0.62..1.00).
	//
	// BOTTOM island: mirror image — fills from the bottom edge (y=100) up
	// to a curve that rises from y=82 at the walls to y=62 at the throat.
	//
	// Channel half-height goes from 32 (inlet, y 18..82) to 12 (throat,
	// y 38..62): a (32/12)≈2.7:1 area contraction. The cubic Béziers give
	// a smooth, nozzle-like concave bulge rather than a sharp orifice.
	const TOP =
		'M0 0 L100 0 L100 18 C75 18 62 38 50 38 C38 38 25 18 0 18 Z';
	const BOTTOM =
		'M0 100 L100 100 L100 82 C75 82 62 62 50 62 C38 62 25 82 0 82 Z';

	// --- Inlet streamlines ---
	//
	// Five horizontal jets entering at the left inlet (x≈0.04), spread
	// across the wide inlet channel (splat-space y 0.32..0.68, inside the
	// y≈18..82 SVG channel once flipped). All push +x toward the throat.
	// dx/dy are RAW velocity (not scaled by splatForce). A trackable
	// cool→warm-ish palette keeps each streamline individually legible as
	// it bends through the constriction.
	const INLET_X = 0.04;
	const INLET_DX = 700;
	// Colors kept below ~0.9 (not HDR): in a closed box the continuously
	// re-injected streamlines accumulate, so >1 values bloom-saturate to white.
	const STREAMLINES: PresetSplat[] = [
		{ x: INLET_X, y: 0.32, dx: INLET_DX, dy: 0, color: { r: 0.85, g: 0.12, b: 0.12 } },
		{ x: INLET_X, y: 0.41, dx: INLET_DX, dy: 0, color: { r: 0.85, g: 0.5, b: 0.08 } },
		{ x: INLET_X, y: 0.50, dx: INLET_DX, dy: 0, color: { r: 0.12, g: 0.8, b: 0.28 } },
		{ x: INLET_X, y: 0.59, dx: INLET_DX, dy: 0, color: { r: 0.08, g: 0.55, b: 0.85 } },
		{ x: INLET_X, y: 0.68, dx: INLET_DX, dy: 0, color: { r: 0.25, g: 0.22, b: 0.9 } }
	];

	// Opening scene: the same five streamlines at t=0.
	const PRESET_SPLATS: PresetSplat[] = STREAMLINES;

	export const handle: FluidHandle = {
		splat: (x, y, dx, dy, color) => inner?.handle.splat(x, y, dx, dy, color),
		randomSplats: (count) => inner?.handle.randomSplats(count),
		pause: () => inner?.handle.pause(),
		resume: () => inner?.handle.resume(),
		get isPaused() { return inner?.handle.isPaused ?? true; }
	};

	// Continuously re-inject the inlet streamlines so a steady stream feeds
	// the throat (the open boundary vents spent dye off the right edge).
	// SSR-guarded (onMount only runs client-side) and reduced-motion guarded:
	// users who opt out of motion get the static opening scene, no animation.
	onMount(() => {
		const reduced =
			typeof window !== 'undefined' &&
			window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
		if (reduced) return;

		const id = setInterval(() => {
			if (!inner) return;
			for (const s of STREAMLINES) {
				inner.handle.splat(s.x, s.y, s.dx, s.dy, s.color);
			}
		}, 320);
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
	obstructions={[{ d: TOP, fit: 'fill' }, { d: BOTTOM, fit: 'fill' }]}
	openBoundary
	curl={0}
	densityDissipation={0.9}
	velocityDissipation={0.04}
	pressure={0.9}
	pressureIterations={30}
	splatRadius={0.08}
	splatForce={6000}
	shading
	colorful={false}
	bloom
	bloomThreshold={0.6}
	bloomIntensity={0.5}
	sunrays={false}
	simResolution={192}
	dyeResolution={1024}
	initialSplatCount={0}
	backColor={backColor ?? { r: 6, g: 10, b: 14 }}
	presetSplats={PRESET_SPLATS}
/>
