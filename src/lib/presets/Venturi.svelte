<!--
  svelte-fluid — Venturi preset

  Visual intent: Bernoulli's principle made visible. A gentle left-to-right
  pressure-gradient-style body force drives fluid through a wide channel that
  is squeezed through a central throat formed by two concave islands.
  Continuity forces the flow to accelerate through the constriction; the
  display maps velocity magnitude to a CFD-style color axis.

  Key design choices:
  - **Open boundary.** Obstructions are physical walls regardless of the
    canvas-edge condition, so the islands still pinch the flow — but the
    open boundary lets streamlines exit the right edge instead of
    recirculating and saturating the sealed box. A horizontal body force
    acts like a maintained pressure gradient without repainting the inlet
    with high velocity each frame.
  - **Two obstruction islands** pinch a horizontal channel. The channel
  spans SVG y≈18..82 at the inlet/outlet and narrows to y≈44..56 at the
  throat (x=50) — roughly a 5.3:1 area contraction. SVG path space is
    y-DOWN, so the TOP island (SVG y 0..~38) sits at the TOP of the canvas
    (splat-space y≈0.62..1.00) and vice-versa.
  - **curl 0 (laminar).** Bernoulli is about smooth, ordered streamlines —
    no vorticity confinement that would shred them into turbulence.
  - **Field visualization, not dye coloring.** Color comes from the live speed
    field using a blue→red CFD ramp. A direct velocity inlet was rejected
    because it saturated the upstream channel and hid the throat speed-up.
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
	import Fluid from '../Fluid.svelte';
	import type { FlowConfig, FluidHandle } from '../engine/types.js';

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
	}: VenturiProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// --- Obstruction geometry (viewBox [0,0,100,100], SVG y-DOWN) ---
	//
	// TOP island: fills from the top edge (y=0) down to a concave curve
	// that dips from y=18 at the side walls to y=44 at the throat (x=50).
	// In canvas/splat space this sits at the TOP (y≈0.56..1.00).
	//
	// BOTTOM island: mirror image — fills from the bottom edge (y=100) up
	// to a curve that rises from y=82 at the walls to y=56 at the throat.
	//
	// Channel half-height goes from 32 (inlet, y 18..82) to 6 (throat,
	// y 44..56): a (32/6)≈5.3:1 area contraction. The cubic Béziers give
	// a smooth, nozzle-like concave bulge rather than a sharp orifice.
	const TOP =
		'M0 0 L100 0 L100 18 C75 18 62 44 50 44 C38 44 25 18 0 18 Z';
	const BOTTOM =
		'M0 100 L100 100 L100 82 C75 82 62 56 50 56 C38 56 25 82 0 82 Z';

	const FLOW: FlowConfig = {
		mode: 'live',
		boundary: { left: 'open', right: 'open', top: 'wall', bottom: 'wall' },
			forces: [{ kind: 'pressureGradient', vector: { x: 42, y: 0 } }],
		outlets: [{ edge: 'right', from: 0, to: 1, width: 0.05, clearDye: 0.35, clearScalars: true, clearVelocity: true }],
		visualization: { colorBy: 'speed', glowBy: 'none', transfer: 'cfd', range: [0, 260], scale: 1.0 }
	};

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
	{width}
	{height}
	class={className}
	{style}
	{seed}
	{lazy}
	{splatOnHover}
	aria-label={ariaLabel}
	obstructions={[{ d: TOP, fit: 'fill' }, { d: BOTTOM, fit: 'fill' }]}
	flow={FLOW}
	openBoundary
	curl={0}
		densityDissipation={0.35}
		velocityDissipation={0.09}
		maxTimeStep={1 / 120}
		substeps={2}
		viscosity={0.018}
		viscosityIterations={10}
		wallFriction={0.18}
		wallFrictionWidth={2}
		pressure={0.9}
	pressureIterations={36}
	splatRadius={0.055}
	splatForce={6000}
	shading={false}
	colorful={false}
	bloom={false}
	bloomThreshold={0.6}
	bloomIntensity={0.5}
	sunrays={false}
	simResolution={192}
	dyeResolution={1024}
	initialSplatCount={0}
	backColor={backColor ?? { r: 6, g: 10, b: 14 }}
/>
