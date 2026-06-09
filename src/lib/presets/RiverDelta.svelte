<!--
  svelte-fluid — RiverDelta preset

  Visual intent: a wide river entering from the left edge and braiding
  around a chain of staggered teardrop islands. The flow can't go
  straight through, so continuity routes the flux through the open
  channels between islands — the single inlet stream fans out into
  branching distributaries, exactly like a sediment delta.

  Key design choices:
  - **Five teardrop islands**, each pointed UPSTREAM (sharp tip facing
    the inflow on the left, rounded bulge trailing downstream). Authored
    once as a single path in viewBox [0,0,100,100] and instanced five
    times via `offset`/`scale` so they stagger across x and y with open
    channels between them. (Obstruction physics — velocity + dye zeroed
    inside the islands — applies even with an open boundary, so the river
    flows in from the left, braids around the islands, and vents off any
    open canvas edge instead of recirculating.)
  - **Wide left-edge inlet** via the `flow` scene API plus low-rate muted
    tracer packets from the same edge. This keeps the current physically
    legible without returning to random HDR splats across the whole canvas.
  - **Moderate dissipation + no bloom** keeps the channels readable while
    the tracer packets make the braided paths visible.
  - **Sediment palette** — dark teal water with restrained silt highlights.

  Honest note: the branching around islands is faithful — incompressible
  continuity genuinely forces flux through the gaps between obstacles. The
  open boundary plus edge drains let braided dye leave instead of
  recirculating in a sealed box.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<RiverDelta />`. Sizing/seed/styling are forwarded; all physics props are hard-coded. */
	export type RiverDeltaProps = Pick<
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
	import type { FlowConfig, FluidHandle, PresetSplat, Obstruction } from '../engine/types.js';

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
	}: RiverDeltaProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// A single teardrop authored in viewBox [0,0,100,100], SVG y-DOWN.
	// Sharp tip at the LEFT (x≈8) so it points UPSTREAM into the +x inflow;
	// rounded bulge trails to the RIGHT. The two cubic arcs sweep from the
	// tip out to a fat lobe (peak radius ~28 around x≈70) and back.
	const TEARDROP =
		'M 8 50 ' +
		'C 30 22, 58 22, 78 38 ' +
		'C 92 49, 92 51, 78 62 ' +
		'C 58 78, 30 78, 8 50 ' +
		'Z';

	// Five islands staggered in x and y, scaled down so each occupies a
	// small footprint with wide open channels between them. The base fit
	// maps the viewBox to the full canvas; scale shrinks it and offset
	// (UV space, y bottom-to-top) places each island. The stagger forces
	// the flow to split: front island on-axis, then two pairs flanking it
	// above and below, progressively downstream.
	const OBSTRUCTIONS: Obstruction[] = [
		// Lead island, dead-center, takes the first hit of the inflow.
		{ d: TEARDROP, scale: 0.26, offset: { x: -0.18, y: 0.0 } },
		// Second rank: one above, one below — split the two side branches.
		{ d: TEARDROP, scale: 0.22, offset: { x: 0.06, y: 0.2 } },
		{ d: TEARDROP, scale: 0.22, offset: { x: 0.06, y: -0.2 } },
		// Third rank: smaller, further downstream, braids the branches finer.
		{ d: TEARDROP, scale: 0.18, offset: { x: 0.3, y: 0.1 } },
		{ d: TEARDROP, scale: 0.18, offset: { x: 0.3, y: -0.12 } }
	];

	// Opening burst: a few muted rows along the left edge so the river has
	// visible structure before the persistent flow source and tracer packets
	// take over.
	const V = 260;
	const PRESET_SPLATS: PresetSplat[] = [
		{ x: 0.035, y: 0.2, dx: V, dy: 0, color: { r: 0.18, g: 0.28, b: 0.24 } },
		{ x: 0.035, y: 0.38, dx: V, dy: 0, color: { r: 0.3, g: 0.28, b: 0.16 } },
		{ x: 0.035, y: 0.55, dx: V, dy: 0, color: { r: 0.14, g: 0.34, b: 0.3 } },
		{ x: 0.035, y: 0.72, dx: V, dy: 0, color: { r: 0.13, g: 0.3, b: 0.36 } }
	];

	const FLOW: FlowConfig = {
		mode: 'live',
		boundary: { left: 'open', right: 'open', top: 'open', bottom: 'open' },
		sources: [
			{
				kind: 'line',
				from: { x: 0.025, y: 0.12 },
				to: { x: 0.025, y: 0.88 },
				velocity: { x: 260, y: 0 },
				dye: { r: 0.075, g: 0.17, b: 0.15 },
				rate: 24,
				radius: 0.07,
				profile: 'parabolic'
			}
		],
		outlets: [
			{ edge: 'right', from: 0, to: 1, width: 0.085, clearDye: 0.08, clearScalars: true, clearVelocity: true },
			{ edge: 'top', from: 0, to: 1, width: 0.055, clearDye: 0.1, clearScalars: true, clearVelocity: false },
			{ edge: 'bottom', from: 0, to: 1, width: 0.055, clearDye: 0.1, clearScalars: true, clearVelocity: false },
			{ edge: 'left', from: 0, to: 1, width: 0.012, clearDye: 0.65, clearScalars: true, clearVelocity: false }
		]
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
	obstructions={OBSTRUCTIONS}
	flow={FLOW}
	openBoundary
	curl={10}
	densityDissipation={0.68}
	velocityDissipation={0.07}
	maxTimeStep={1 / 60}
	substeps={1}
	viscosity={0.012}
	viscosityIterations={5}
	wallFriction={0.12}
	wallFrictionWidth={2}
	pressure={0.9}
	pressureIterations={24}
	splatRadius={0.08}
	splatForce={6000}
	shading={false}
	colorful={false}
	bloom={false}
	sunrays={false}
	simResolution={160}
	dyeResolution={640}
	initialSplatCount={0}
	backColor={backColor ?? { r: 4, g: 9, b: 10 }}
	presetSplats={PRESET_SPLATS}
	autoSplatRate={1.15}
	autoSplatCount={2}
	autoSplatColor={{ r: 0.12, g: 0.22, b: 0.18 }}
	autoSplatVelocityX={260}
	autoSplatVelocityY={0}
	autoSplatCenterX={0.035}
	autoSplatBandWidth={0.03}
	autoSplatCenterY={0.5}
	autoSplatBandHeight={0.84}
	autoSplatSwirl={0}
/>
