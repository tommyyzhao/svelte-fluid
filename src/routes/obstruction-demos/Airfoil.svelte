<!--
  svelte-fluid — Airfoil obstruction demo (DEMO-ONLY, not a shipped preset)

  Visual intent: a wind-tunnel "schlieren" look. A broad inlet velocity field
  enters from the left, splits over and under a single cambered airfoil
  obstruction, then rejoins downstream.

  How the flow look is produced:
  - openBoundary is ON. Obstructions are physical walls regardless of the
    canvas-edge condition, so the airfoil still deflects the fluid — but the
    open boundary lets the wind-tunnel stream exit the right edge instead of
    recirculating and saturating the sealed box.
  - A persistent line source sustains a steady +x wind-tunnel field. The
    display colors by speed, not accumulated dye, so the view does not blow
    out to white as the inlet keeps running.

  HONEST FAITHFULNESS NOTE: this is partly faithful — the streamline SPLIT
  over/under the body is real (the mask genuinely blocks the fluid). But NO
  real lift or circulation emerges from post-hoc masking of a velocity
  field; do not read this as an aerodynamics solver. It is evocative of a
  wind-tunnel schlieren image, not a validated airfoil simulation.

  Coordinate notes:
  - SVG path space is y-DOWN: SVG y=0 → TOP of canvas. The body is centered
    near SVG y=50 (canvas middle), so injection rows in splat-space
    (y bottom-to-top) cluster around y≈0.5 to feed the leading edge.
  - FlowSource velocity is in solver units. The startup pulse is intentionally
    faint; the persistent inlet and speed visualization carry the scene.
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
	import type { FlowConfig, FluidHandle, PresetSplat, RGB } from '../../lib/engine/types.js';

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

	// Faint startup tracer rows; the sustained field is speed-colored below.
	// These are intentionally dim so they add structure without becoming the
	// dominant visual or hiding the airfoil.
	const STREAM_COLORS: RGB[] = [
		{ r: 0.08, g: 0.01, b: 0.015 }, // red
		{ r: 0.09, g: 0.05, b: 0.01 }, // amber
		{ r: 0.01, g: 0.08, b: 0.025 }, // green
		{ r: 0.01, g: 0.07, b: 0.10 }, // cyan
		{ r: 0.025, g: 0.03, b: 0.10 }, // blue
		{ r: 0.08, g: 0.015, b: 0.08 } // magenta
	];

	// Six faint tracer rows entering at the left edge. Several rows straddle
	// the body's vertical extent so the startup dye hints at the split.
	const INJECT_X = 0.03;
	const INJECT_DX = 460;
	const ROW_Y = [0.3, 0.38, 0.46, 0.54, 0.62, 0.7];

	function buildStreamlines(): PresetSplat[] {
		return ROW_Y.map((y, i) => ({
			x: INJECT_X,
			y,
			dx: INJECT_DX,
			dy: 0,
			color: STREAM_COLORS[i]
		}));
	}

	// Opening scene: the streamlines already present at t=0.
	const PRESET_SPLATS: PresetSplat[] = buildStreamlines();

	const FLOW: FlowConfig = {
		mode: 'live',
		boundary: { left: 'open', right: 'open', top: 'open', bottom: 'open' },
		sources: [
			{
				kind: 'line',
				from: { x: 0.025, y: 0.18 },
				to: { x: 0.025, y: 0.82 },
				velocity: { x: 560, y: 0 },
				dye: { r: 0.004, g: 0.014, b: 0.025 },
				scalars: { ink: 0.08 },
				rate: 30,
				radius: 0.032,
				profile: 'uniform'
			}
		],
		outlets: [{ edge: 'right', from: 0, to: 1, width: 0.05, clearDye: 0.45, clearScalars: true, clearVelocity: true }],
		scalarFields: [{ name: 'ink', dissipation: 0.65, advection: 'low-dissipation' }],
		visualization: { colorBy: 'speed', glowBy: 'speed', transfer: 'water', scale: 0.00072 }
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
	obstructions={[{ d: AIRFOIL, fit: 'fill' }]}
	flow={FLOW}
	openBoundary
	curl={4}
	densityDissipation={1.8}
	velocityDissipation={0.04}
	pressure={0.9}
	pressureIterations={34}
	splatRadius={0.035}
	splatForce={2800}
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
