<!--
  svelte-fluid — Pinwheel / turbine vanes (DEMO-ONLY)

  Visual intent: a fast jet aimed at a radial assembly of angled vanes
  around a central hub. The incoming flow can't pass straight through, so
  it is deflected tangentially by the skewed blades and spun off around
  the hub — it reads like flow through a turbine stage.

  HONEST NOTE (faithful vs. evocative): the vanes are STATIC. Obstructions
  are fixed rasterized masks (velocity + dye zeroed inside their
  footprint); there is NO rigid-body rotation, so this is NOT a spinning
  rotor. What you see is flow deflected through a fixed STATOR ring, which
  evokes a turbine's swirl without simulating one. The tangential
  deflection around the blades IS real (the mask genuinely blocks the
  fluid); the "rotation" is read into it by the eye, not solved for.

  How the throughflow works:
  - Obstacle physics applies even with an open boundary, so `openBoundary`
    is ON: the jet enters from the left, deflects through the vanes, and
    vents off the canvas edges rather than recirculating in a sealed box.
  - The jet is a steady `autoSplat` inflow from the left pushing +x with a
    slight +y bias, aimed at the vane assembly.

  Geometry: ONE obstruction `d` with seven subpaths in viewBox
  [0,0,100,100] (SVG y-DOWN), centered on (50,50): six angled blade quads
  radiating from r≈9 to r≈34, each skewed tangentially (~14 units at the
  tip) so an incoming radial stream is turned sideways, plus a small hub
  circle (r≈7). Blade slabs are ~4.8 units wide, above the rasterizer's
  minimum feature size.
-->

<script lang="ts" module>
	import type { FluidProps } from '$lib/Fluid.svelte';

	/** Props consumed by `<Pinwheel />`. Sizing/seed/styling are forwarded; all physics is pinned. */
	export type PinwheelProps = Pick<
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
	}: PinwheelProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// Track reduced-motion. The continuous jet (autoSplatRate) is the only
	// motor of this demo, so we gate it to 0 when the user prefers reduced
	// motion — the scene then renders a single static opening pulse.
	let reducedMotion = $state(false);
	$effect(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		reducedMotion = mq.matches;
		const onChange = (e: MediaQueryListEvent) => (reducedMotion = e.matches);
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	});

	// The vane assembly: six angled blade quads + a hub circle, authored as
	// one multi-subpath `d` in viewBox [0,0,100,100], centered on (50,50).
	// Each blade runs from r≈9 (just outside the hub) to r≈34, skewed
	// tangentially at the tip so a radial inflow is turned sideways — the
	// stator that gives the turbine read. Coordinates are precomputed (six
	// blades at 60° spacing, ~4.8u slab width) rather than generated, to
	// keep this descriptor static and inspectable.
	const VANES: Obstruction = {
		d:
			'M 57.8 52.1 L 82.8 66.1 L 85.2 61.9 L 60.2 47.9 Z ' + // blade 0 (→ down-right)
			'M 52.1 57.8 L 52.5 86.5 L 57.3 86.4 L 56.9 57.8 Z ' + // blade 1 (→ down)
			'M 44.3 55.7 L 19.6 70.4 L 22.1 74.5 L 46.7 59.9 Z ' + // blade 2 (→ down-left)
			'M 42.2 47.9 L 17.2 33.9 L 14.8 38.1 L 39.8 52.1 Z ' + // blade 3 (→ up-left)
			'M 47.9 42.2 L 47.5 13.5 L 42.7 13.6 L 43.1 42.2 Z ' + // blade 4 (→ up)
			'M 55.7 44.3 L 80.4 29.6 L 77.9 25.5 L 53.3 40.1 Z ' + // blade 5 (→ up-right)
			'M 43.0 50.0 A 7.0 7.0 0 1 0 57.0 50.0 A 7.0 7.0 0 1 0 43.0 50.0 Z', // hub circle
		viewBox: [0, 0, 100, 100]
	};

	// Opening scene: a short stack of fast +x jets along the left edge,
	// aimed at the hub (y≈0.5), so the jet is already striking the vanes
	// when the scene appears. y is BOTTOM-to-TOP; dx/dy are RAW velocity
	// (not splatForce-scaled). A small +dy bias on each preloads the swirl
	// in one direction so the deflection reads consistently. Cool→warm tint
	// reads as a moving stream.
	const JET_DX = 600;
	const JET_DY = 120;
	const PRESET_SPLATS: PresetSplat[] = [
		{ x: 0.04, y: 0.58, dx: JET_DX, dy: JET_DY, color: { r: 0.2, g: 0.7, b: 1.4 } },
		{ x: 0.04, y: 0.5, dx: JET_DX, dy: JET_DY, color: { r: 0.4, g: 1.1, b: 0.9 } },
		{ x: 0.04, y: 0.42, dx: JET_DX, dy: JET_DY, color: { r: 1.2, g: 0.8, b: 0.3 } }
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
	obstructions={[VANES]}
	openBoundary
	curl={12}
	densityDissipation={0.7}
	velocityDissipation={0.04}
	pressure={0.9}
	pressureIterations={24}
	splatRadius={0.09}
	splatForce={6000}
	shading
	colorful
	bloom
	bloomThreshold={0.6}
	bloomIntensity={0.6}
	simResolution={192}
	dyeResolution={1024}
	initialSplatCount={0}
	backColor={backColor ?? { r: 6, g: 8, b: 16 }}
	presetSplats={PRESET_SPLATS}
	autoSplatRate={reducedMotion ? 0 : 16}
	autoSplatCount={2}
	autoSplatVelocityX={600}
	autoSplatVelocityY={120}
	autoSplatSwirl={0}
	autoSplatCenterY={0.5}
	autoSplatBandHeight={0.5}
	autoSplatEvenX={false}
/>
