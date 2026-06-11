<!--
  svelte-fluid — Karman preset

  Visual intent: flow past a single cylinder, evocative of a von Kármán
  vortex street — the alternating wake of vortices shed behind a bluff
  body in a steady cross-flow. Multicolor tracer packets (fresh generated
  hue per packet) enter from the left and thread the wake, so successive
  sheddings read as distinct colored filaments.

  HONEST NOTE (faithful vs. evocative): this is *evocative of* a vortex
  street, NOT a validated shedding simulation. Real Kármán shedding is a
  Navier–Stokes boundary-layer instability; here the cylinder is a
  post-hoc rasterized mask that zeroes velocity+dye inside its footprint.
  Shedding emerges only weakly and intermittently from the shear layers
  rolling up behind the masked disc, and its frequency is NOT a real
  Strouhal number. Treat this as art that gestures at the phenomenon.

  How the throughflow works:
  - A pressure-gradient body force drives the live velocity field from left
    to right, while intermittent tracer packets enter from the left at the
    same speed as the startup jets. The tracers reveal the wake without
    repainting a persistent dye line every frame.
  - A curtain of startup presetSplats establishes the freestream instantly;
    without it the first tracer packets mushroom into still fluid near the
    inlet while the body force spins up (the force needs ~10 s to reach
    terminal velocity against the dissipation).
  - All canvas edges are open and have dye sponge outlets, so the wake can
    drain instead of saturating or bouncing against the domain. Only the
    downstream outlet damps velocity.

  Geometry: a single circle (authored as two SVG arcs) centered at
  viewBox (35, 52), radius 10, in a [0,0,100,100] viewBox. SVG y is DOWN,
  so SVG y=52 maps to splat-space y≈0.48 — the cylinder sits left of
  center and slightly below the inflow band center. That deliberate vertical offset breaks the up/down symmetry to
  coax the wake into shedding rather than forming a stable standing pair.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<Karman />`. Sizing/seed/styling are forwarded; all physics is pinned. */
	export type KarmanProps = Pick<
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
	import type { FlowConfig, FluidHandle, Obstruction, PresetSplat } from '../engine/types.js';

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
	}: KarmanProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// Single cylinder: a circle authored as two semicircular arcs. Center
	// (35, 52) in viewBox units, radius 10. Left-of-center horizontally so
	// there is room downstream for a wake; SVG y=52 → splat-space y≈0.48,
	// just off the inflow centerline to break symmetry.
	const CYLINDER: Obstruction = {
		d: 'M 25 52 A 10 10 0 1 0 45 52 A 10 10 0 1 0 25 52 Z',
		viewBox: [0, 0, 100, 100],
		fit: 'fill'
	};

	// Startup jets: a full-height curtain of rightward impulses that
	// establishes the freestream immediately, so the first tracer packets
	// ride a moving field instead of mushrooming into still fluid while
	// the pressure-gradient drive spins up (~10 s to terminal velocity).
	const V0 = 460;
	const PRESET_SPLATS: PresetSplat[] = [
		{ x: 0.04, y: 0.14, dx: V0, dy: 0, color: { r: 0.2, g: 0.12, b: 0.3 } },
		{ x: 0.04, y: 0.32, dx: V0, dy: 0, color: { r: 0.1, g: 0.25, b: 0.3 } },
		{ x: 0.04, y: 0.5, dx: V0, dy: 0, color: { r: 0.28, g: 0.22, b: 0.1 } },
		{ x: 0.04, y: 0.68, dx: V0, dy: 0, color: { r: 0.1, g: 0.28, b: 0.16 } },
		{ x: 0.04, y: 0.86, dx: V0, dy: 0, color: { r: 0.3, g: 0.12, b: 0.18 } }
	];

	const FLOW: FlowConfig = {
		mode: 'live',
		boundary: { left: 'open', right: 'open', top: 'open', bottom: 'open' },
		forces: [{ kind: 'pressureGradient', vector: { x: 64, y: 0 } }],
		outlets: [
			{ edge: 'right', from: 0, to: 1, width: 0.075, clearDye: 0.08, clearScalars: true, clearVelocity: true },
			{ edge: 'top', from: 0, to: 1, width: 0.045, clearDye: 0.12, clearScalars: true, clearVelocity: false },
			{ edge: 'bottom', from: 0, to: 1, width: 0.045, clearDye: 0.12, clearScalars: true, clearVelocity: false },
			{ edge: 'left', from: 0, to: 1, width: 0.02, clearDye: 0.45, clearScalars: true, clearVelocity: false }
		],
		visualization: { colorBy: 'dye' }
	};

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
	{pointerInput}
	{splatOnHover}
	aria-label={ariaLabel}
	obstructions={[CYLINDER]}
	flow={FLOW}
	openBoundary
	curl={10}
	densityDissipation={0.7}
	velocityDissipation={0.075}
	maxTimeStep={1 / 120}
	substeps={2}
	viscosity={0.014}
	viscosityIterations={8}
	wallFriction={0.16}
	wallFrictionWidth={2}
	pressure={0.9}
	pressureIterations={34}
	splatRadius={0.06}
	splatForce={6000}
	autoSplatRate={4.5}
	autoSplatCount={3}
	autoSplatColor={null}
	autoSplatVelocityX={460}
	autoSplatVelocityY={0}
	autoSplatCenterX={0.035}
	autoSplatBandWidth={0.025}
	autoSplatCenterY={0.52}
	autoSplatBandHeight={0.5}
	autoSplatSwirl={0}
	shading={false}
	colorful={false}
	bloom={false}
	sunrays={false}
	simResolution={192}
	dyeResolution={1024}
	initialSplatCount={0}
	presetSplats={PRESET_SPLATS}
	backColor={backColor ?? { r: 4, g: 6, b: 14 }}
/>
