<!--
  svelte-fluid — Airfoil obstruction demo (DEMO-ONLY, not a shipped preset)

  Visual intent: wind-tunnel tracer dye. A broad pressure-driven velocity
  field enters from the left, while discrete dye splats reveal how the flow
  splits over and under a single cambered airfoil obstruction before
  rejoining downstream.

  How the flow look is produced:
  - openBoundary is ON. Obstructions are physical walls regardless of the
    canvas-edge condition, so the airfoil still deflects the fluid — but the
    open boundary lets the wind-tunnel stream exit any canvas edge instead of
    recirculating and saturating the sealed box.
  - A gentle pressure-gradient body force sustains a steady +x wind-tunnel
    field. Discrete left-edge automatic dye splats use the previous tracer
    velocity scale, so the pattern shows the split/rejoin behavior without
    painting a continuous inlet band.

  HONEST FAITHFULNESS NOTE: this is partly faithful — the streamline SPLIT
  over/under the body is real (the mask genuinely blocks the fluid). But NO
  real lift or circulation emerges from post-hoc masking of a velocity
  field; do not read this as an aerodynamics solver. It is evocative of a
  wind-tunnel schlieren image, not a validated airfoil simulation.

  Coordinate notes:
  - SVG path space is y-DOWN: SVG y=0 → TOP of canvas. The body is centered
    near SVG y=50 (canvas middle).
  - The pressure-gradient force is in solver velocity units per second; speed
    forcing carries the scene while dye splats supply the visible tracers.
-->

<script lang="ts" module>
	import type { FluidProps } from '../../lib/Fluid.svelte';

	/** Props consumed by `<Airfoil />`. Sizing/seed/styling/backColor are forwarded; all physics is pinned. */
	export type AirfoilProps = Pick<
		FluidProps,
		'width' | 'height' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
	>;
</script>

<script lang="ts">
	import Fluid from '../../lib/Fluid.svelte';
	import type { FlowConfig, FluidHandle, PresetSplat } from '../../lib/engine/types.js';

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
	}: AirfoilProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// A long, narrow cambered airfoil in viewBox [0,0,100,100].
	// Chord ~64, max thickness ~10: visibly airfoil-like instead of a chunky
	// blob, with a small positive angle of attack.
	const AIRFOIL =
		'M 18 50' +
		' C 22 43, 42 41, 62 44' +
		' C 74 46, 80 49, 82 51' +
		' C 70 52, 48 55, 29 55' +
		' C 21 55, 17 53, 18 50' +
		' Z';

	const FLOW: FlowConfig = {
		mode: 'live',
		boundary: { left: 'open', right: 'open', top: 'open', bottom: 'open' },
		forces: [{ kind: 'pressureGradient', vector: { x: 38, y: 0 } }],
		outlets: [
			{ edge: 'right', from: 0, to: 1, width: 0.025, clearDye: 0.02, clearScalars: true, clearVelocity: false },
			{ edge: 'top', from: 0, to: 1, width: 0.025, clearDye: 0.04, clearScalars: true, clearVelocity: false },
			{ edge: 'bottom', from: 0, to: 1, width: 0.025, clearDye: 0.04, clearScalars: true, clearVelocity: false },
			{ edge: 'left', from: 0, to: 1, width: 0.018, clearDye: 0.55, clearScalars: true, clearVelocity: false }
		],
		visualization: { colorBy: 'dye' }
	};

	const PRESET_SPLATS: PresetSplat[] = [
		{ x: 0.11, y: 0.6, dx: 460, dy: 0, color: { r: 0.08, g: 0.8, b: 1.2 } },
		{ x: 0.11, y: 0.5, dx: 460, dy: 0, color: { r: 0.85, g: 0.08, b: 1.0 } },
		{ x: 0.11, y: 0.4, dx: 460, dy: 0, color: { r: 1.1, g: 0.72, b: 0.08 } }
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
	obstructions={[{ d: AIRFOIL, fit: 'fill' }]}
	flow={FLOW}
	openBoundary
	curl={4}
	densityDissipation={0.72}
	velocityDissipation={0.075}
	maxTimeStep={1 / 120}
	substeps={2}
	viscosity={0.012}
	viscosityIterations={8}
	wallFriction={0.14}
	wallFrictionWidth={2}
	pressure={0.9}
	pressureIterations={34}
	splatRadius={0.055}
	splatForce={2800}
	autoSplatRate={3.6}
	autoSplatCount={3}
	autoSplatVelocityX={460}
	autoSplatVelocityY={0}
	autoSplatCenterX={0.035}
	autoSplatBandWidth={0.025}
	autoSplatCenterY={0.5}
	autoSplatBandHeight={0.46}
	bloom={false}
	bloomThreshold={0.6}
	bloomIntensity={0.5}
	shading={false}
	colorful={false}
	simResolution={192}
	dyeResolution={1024}
	initialSplatCount={0}
	backColor={backColor ?? { r: 6, g: 8, b: 16 }}
	presetSplats={PRESET_SPLATS}
/>
