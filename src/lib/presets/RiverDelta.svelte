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
    flows in from the left, braids around the islands, and vents off the
    right edge instead of recirculating.)
  - **Wide left-edge inlet** via autoSplat: a tall band (bandHeight 1.2)
    of +x jets (velocityX 700, swirl 0 so X/Y aren't overridden) feeds a
    steady sheet of fresh dye that braids around the islands.
  - **Low velocity dissipation (0.05)** keeps the current coherent across
    the canvas; **moderate density dissipation (0.5)** clears the
    recirculated wash so the fresh inflow stream reads cleanly.
  - **Sediment/glacial palette** — warm silt browns blending into
    glacial cyans, on a near-black river bed.

  Honest note: the branching around islands is faithful — incompressible
  continuity genuinely forces flux through the gaps between obstacles. The
  open boundary lets the braided flow exit downstream like a real delta
  mouth rather than recirculating in a sealed box.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<RiverDelta />`. Sizing/seed/styling are forwarded; all physics props are hard-coded. */
	export type RiverDeltaProps = Pick<
		FluidProps,
		'width' | 'height' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
	>;
</script>

<script lang="ts">
	import Fluid from '../Fluid.svelte';
	import type { FluidHandle, PresetSplat, Obstruction } from '../engine/types.js';

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

	// Opening burst: a vertical line of +x jets along the left edge so the
	// river is already flowing when the scene appears. y in [0,1],
	// bottom-to-top; dy=0 (pure rightward); warm-silt → glacial-cyan ramp.
	const V = 700;
	const PRESET_SPLATS: PresetSplat[] = [
		{ x: 0.03, y: 0.12, dx: V, dy: 0, color: { r: 0.55, g: 0.38, b: 0.18 } },
		{ x: 0.03, y: 0.3, dx: V, dy: 0, color: { r: 0.45, g: 0.42, b: 0.28 } },
		{ x: 0.03, y: 0.5, dx: V, dy: 0, color: { r: 0.3, g: 0.5, b: 0.5 } },
		{ x: 0.03, y: 0.7, dx: V, dy: 0, color: { r: 0.2, g: 0.55, b: 0.7 } },
		{ x: 0.03, y: 0.88, dx: V, dy: 0, color: { r: 0.15, g: 0.6, b: 0.85 } }
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
	obstructions={OBSTRUCTIONS}
	openBoundary
	curl={6}
	densityDissipation={0.5}
	velocityDissipation={0.05}
	pressure={0.9}
	pressureIterations={26}
	splatRadius={0.12}
	splatForce={6000}
	shading
	colorful
	bloom
	simResolution={160}
	dyeResolution={1024}
	initialSplatCount={0}
	backColor={backColor ?? { r: 10, g: 14, b: 18 }}
	presetSplats={PRESET_SPLATS}
	autoSplatRate={22}
	autoSplatCount={4}
	autoSplatVelocityX={700}
	autoSplatVelocityY={0}
	autoSplatSwirl={0}
	autoSplatCenterY={0.5}
	autoSplatBandHeight={1.2}
	autoSplatEvenX={false}
/>
