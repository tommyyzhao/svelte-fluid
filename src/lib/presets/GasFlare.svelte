<!--
  svelte-fluid — GasFlare preset

  Visual intent: excess gas burning from a flare tip. A hot jet exits a
  simple stack/nozzle near the bottom of the canvas, rolls into shear-layer
  vortices, and rises as the temperature scalar adds buoyancy.

  Geometry: two obstruction slabs form the left/right walls of a short flare
  stack. The center slot remains open, so the live solver injects a vertical
  gas jet through a physical nozzle mouth rather than pretending to model a
  compressible rocket throat.

  Honest note: this is a qualitative incompressible jet/plume scene. The
  solver captures obstruction routing, entrainment, advection, and scalar
  buoyancy; it does not solve combustion chemistry, compressibility, soot,
  radiation, or heat release.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<GasFlare />`. Sizing/seed/styling are forwarded; flare geometry and plume behavior are pinned. */
	export type GasFlareProps = Pick<
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
	}: GasFlareProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// Flare stack walls in viewBox [0,0,100,100], SVG y DOWN. The pipe occupies
	// the lower quarter of the canvas; the center slot at x≈45..55 is open.
	const LEFT_STACK_WALL =
		'M 34 100 ' +
		'L 46 100 ' +
		'L 46 74 ' +
		'C 44 72, 41 71, 37 72 ' +
		'L 34 76 ' +
		'Z';

	const RIGHT_STACK_WALL =
		'M 54 100 ' +
		'L 66 100 ' +
		'L 66 76 ' +
		'L 63 72 ' +
		'C 59 71, 56 72, 54 74 ' +
		'Z';

	const FLOW: FlowConfig = {
		mode: 'live',
		boundary: { left: 'open', right: 'open', top: 'open', bottom: 'wall' },
		sources: [
			{
				kind: 'line',
				from: { x: 0.455, y: 0.245 },
				to: { x: 0.545, y: 0.245 },
				velocity: { x: 25, y: 760 },
				dye: { r: 0.9, g: 0.24, b: 0.025 },
				scalars: { temperature: 2.4 },
				rate: 60,
				radius: 0.045,
				profile: 'parabolic'
			},
			{
				kind: 'line',
				from: { x: 0.18, y: 0.42 },
				to: { x: 0.18, y: 0.82 },
				velocity: { x: 42, y: 0 },
				rate: 10,
				radius: 0.18,
				profile: 'uniform'
			}
		],
		outlets: [
			{ edge: 'top', from: 0, to: 1, width: 0.09, clearDye: 0.18, clearScalars: true, clearVelocity: true },
			{ edge: 'left', from: 0.36, to: 1, width: 0.035, clearDye: 0.35, clearScalars: false, clearVelocity: false },
			{ edge: 'right', from: 0.36, to: 1, width: 0.035, clearDye: 0.35, clearScalars: false, clearVelocity: false }
		],
		scalarFields: [{ name: 'temperature', dissipation: 0.5, advection: 'standard', range: [0, 3.2] }],
		forces: [{ kind: 'buoyancy', scalar: 'temperature', direction: { x: 0, y: 1 }, strength: 160, ambient: 0.03 }],
		visualization: { colorBy: 'temperature', scalar: 'temperature', glowBy: 'scalar', transfer: 'fire', range: [0, 3.2], scale: 0.9 }
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
	obstructions={[{ d: LEFT_STACK_WALL, fit: 'fill' }, { d: RIGHT_STACK_WALL, fit: 'fill' }]}
	flow={FLOW}
	openBoundary
	curl={16}
	densityDissipation={0.42}
	initialDensityDissipation={0.55}
	velocityDissipation={0.055}
	pressure={0.85}
	pressureIterations={28}
	splatRadius={0.06}
	splatForce={3800}
	shading={false}
	colorful={false}
	bloom={true}
	bloomThreshold={0.48}
	bloomIntensity={1.0}
	sunrays={false}
	sunraysWeight={0}
	simResolution={192}
	dyeResolution={1024}
	initialSplatCount={0}
	backColor={backColor ?? { r: 6, g: 6, b: 8 }}
/>
