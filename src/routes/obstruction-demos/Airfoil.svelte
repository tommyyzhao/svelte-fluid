<!--
  svelte-fluid — Airfoil obstruction demo (DEMO-ONLY, not a shipped preset)

  Visual intent: a wind-tunnel "schlieren" look. Even horizontal dye
  streamlines enter from the left, split over and under a single cambered
  airfoil obstruction, then rejoin downstream.

  How the flow look is produced:
  - openBoundary is ON. Obstructions are physical walls regardless of the
    canvas-edge condition, so the airfoil still deflects the fluid — but the
    open boundary lets the wind-tunnel stream exit the right edge instead of
    recirculating and saturating the sealed box.
  - Continuous left-edge injection sustains a steady +x stream of
    streamlines; they split over/under the body and vent downstream.

  HONEST FAITHFULNESS NOTE: this is partly faithful — the streamline SPLIT
  over/under the body is real (the mask genuinely blocks the fluid). But NO
  real lift or circulation emerges from post-hoc masking of a velocity
  field; do not read this as an aerodynamics solver. It is evocative of a
  wind-tunnel schlieren image, not a validated airfoil simulation.

  Coordinate notes:
  - SVG path space is y-DOWN: SVG y=0 → TOP of canvas. The body is centered
    near SVG y=50 (canvas middle), so injection rows in splat-space
    (y bottom-to-top) cluster around y≈0.5 to feed the leading edge.
  - PresetSplat/handle.splat: x,y in [0,1], y bottom-to-top; dx,dy are RAW
    velocity (not scaled by splatForce) — hence absolute magnitudes ~700.
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
	import { onMount } from 'svelte';
	import Fluid from '../../lib/Fluid.svelte';
	import type { FluidHandle, PresetSplat, RGB } from '../../lib/engine/types.js';

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
	}: AirfoilProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// A single cambered NACA-ish airfoil in viewBox [0,0,100,100].
	// Rounded leading edge at left (~x25), tapering to a sharp trailing
	// edge at right (~x66). Centered near (45,50), chord ~40. The body is
	// drawn at a small angle of attack: the trailing edge sits slightly
	// LOWER in SVG y than the leading edge, which (SVG y is down) tilts the
	// nose UP on the canvas — a few degrees of incidence.
	// Cubic Béziers give a smooth upper camber line over a flatter lower
	// surface; the two curves meet at the sharp trailing edge point.
	const AIRFOIL =
		'M 25 49' + // leading-edge tip (rounded by the first control handles)
		' C 27 40, 38 35, 50 35' + // upper surface rising toward max camber
		' C 58 35, 64 41, 66 52' + // upper surface sweeping down to trailing edge
		' C 60 51, 44 53, 34 54' + // lower surface (flatter, slightly cambered) back toward nose
		' C 28 54, 24 53, 25 49' + // close the rounded leading edge
		' Z';

	// Trackable, distinct hues for the six entering streamlines so the
	// viewer can follow each band as it splits over/under the body.
	// 0–1 linear; values >1 push into HDR/bloom for a glow on the brightest.
	// Kept below ~0.9 (not HDR): the closed box accumulates the continuously
	// re-injected streamlines, so >1 values bloom-saturate the canvas to white.
	const STREAM_COLORS: RGB[] = [
		{ r: 0.6, g: 0.08, b: 0.1 }, // red
		{ r: 0.6, g: 0.35, b: 0.05 }, // amber
		{ r: 0.1, g: 0.55, b: 0.18 }, // green
		{ r: 0.05, g: 0.42, b: 0.6 }, // cyan
		{ r: 0.18, g: 0.22, b: 0.62 }, // blue
		{ r: 0.55, g: 0.1, b: 0.52 } // magenta
	];

	// Six streamlines entering at the left edge, evenly spaced y ∈ 0.30..0.70.
	// All push straight +x (dy=0). Several rows straddle the body's vertical
	// extent (centered ~y0.5) so the stream is forced to split around it.
	const INJECT_X = 0.03;
	const INJECT_DX = 700;
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

	export const handle: FluidHandle = {
		splat: (x, y, dx, dy, color) => inner?.handle.splat(x, y, dx, dy, color),
		randomSplats: (count) => inner?.handle.randomSplats(count),
		pause: () => inner?.handle.pause(),
		resume: () => inner?.handle.resume(),
		get isPaused() {
			return inner?.handle.isPaused ?? true;
		}
	};

	// Continuous left-edge injection sustains the "wind tunnel" stream inside
	// the closed box. Guarded for SSR (no window) and reduced-motion (no
	// animation injected — the static opening streamlines remain visible).
	onMount(() => {
		if (typeof window === 'undefined') return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

		const id = setInterval(() => {
			if (!inner) return;
			for (const s of buildStreamlines()) {
				inner.handle.splat(s.x, s.y, s.dx, s.dy, s.color);
			}
		}, 450);
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
	obstructions={[{ d: AIRFOIL }]}
	openBoundary
	curl={4}
	densityDissipation={1.2}
	velocityDissipation={0.04}
	pressure={0.9}
	pressureIterations={28}
	splatRadius={0.07}
	splatForce={6000}
	bloom
	bloomThreshold={0.6}
	bloomIntensity={0.5}
	shading
	colorful={false}
	simResolution={192}
	dyeResolution={1024}
	initialSplatCount={0}
	backColor={backColor ?? { r: 6, g: 8, b: 16 }}
	presetSplats={PRESET_SPLATS}
/>
