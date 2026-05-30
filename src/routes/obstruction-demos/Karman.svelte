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
    an open boundary, so the cross-flow enters at the left, passes the
    cylinder, and drains through a right-edge outlet.
  - The left→right stream is a persistent flow source, not random auto splats.

  Geometry: a single circle (authored as two SVG arcs) centered at
  viewBox (35, 52), radius 10, in a [0,0,100,100] viewBox. SVG y is DOWN,
  so SVG y=52 maps to splat-space y≈0.48 — the cylinder sits left of
  center and slightly below the inflow band center. That deliberate vertical offset breaks the up/down symmetry to
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
	import type { FlowConfig, FluidHandle, PresetSplat, Obstruction } from '$lib/engine/types.js';

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

	const FLOW: FlowConfig = {
		mode: 'live',
		boundary: { left: 'open', right: 'open', top: 'open', bottom: 'open' },
		sources: [
			{
				kind: 'line',
				from: { x: 0.035, y: 0.14 },
				to: { x: 0.035, y: 0.90 },
				velocity: { x: INFLOW_DX, y: 0 },
				dye: { r: 0.015, g: 0.09, b: 0.125 },
				scalars: { ink: 0.65 },
				rate: 58,
				radius: 0.045,
				profile: 'uniform'
			}
		],
		outlets: [{ edge: 'right', from: 0.05, to: 0.95, width: 0.09, clearDye: 0.9, clearScalars: true, clearVelocity: true }],
		scalarFields: [{ name: 'ink', dissipation: 0.22, advection: 'low-dissipation' }],
		visualization: { colorBy: 'dye', scalar: 'ink' }
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
	{splatOnHover}
	aria-label={ariaLabel}
	obstructions={[CYLINDER]}
	flow={FLOW}
	openBoundary
	curl={34}
	densityDissipation={2.2}
	velocityDissipation={0.03}
	pressure={0.9}
	pressureIterations={26}
	splatRadius={0.06}
	splatForce={6000}
	shading={false}
	colorful={false}
	bloom={false}
	sunrays={false}
	simResolution={192}
	dyeResolution={1024}
	initialSplatCount={0}
	backColor={backColor ?? { r: 4, g: 6, b: 14 }}
	presetSplats={PRESET_SPLATS}
/>
