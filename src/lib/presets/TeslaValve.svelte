<!--
  svelte-fluid — TeslaValve preset

  Visual intent: a passive Tesla-valve-like channel with asymmetric baffles.
  A pressure-gradient drive moves discrete multicolor inlet splats from the
  left, keeping dye packets readable as they recirculate through side pockets.

  Honest note: this is a live incompressible throughflow visualization. It
  shows plausible routing, separation, and pocket recirculation cues, but it
  does not compute a reverse/forward pressure-drop ratio or real valve
  rectification. A rigorous Tesla valve demo would need paired forward/reverse
  runs or precomputed CFD.
-->

<script lang="ts" module>
	import type { FluidProps } from '../Fluid.svelte';

	/** Props consumed by `<TeslaValve />`. Sizing/seed/styling are forwarded; valve geometry and flow settings are pinned. */
	export type TeslaValveProps = Pick<
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
	import type { ContainerShape, FlowConfig, FluidHandle } from '../engine/types.js';

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
	}: TeslaValveProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// Cropped to the first three patent cells from the reference SVG
	// (`/Users/admin/Projects/free-will/tesla_valve_svg/tesla_valve.svg`) and
	// simplified to a compact polygon path. The even-odd holes are the internal
	// slots, so the valve is one physical container rather than an approximation
	// built from separate tongue obstructions.
	const TESLA_VALVE_PATH = `
		M 0 93.5 L 0.5 173.8 L 32.5 173.7 L 149.5 155.3 L 163.5 154.4 L 179.5 155.3 L 196.5 158.3 L 427.5 223.7 L 460.5 231.8 L 476.5 229.8 L 489.5 222.7 L 499.9 210.5 L 503.9 201.5 L 505.8 193.5 L 505.8 179.5 L 500.8 164.5 L 496.5 157.9 L 489.1 150.5 L 474.5 142.1 L 474.1 137.5 L 476.5 135.9 L 797.5 226.7 L 818.5 231.7 L 825.5 231.8 L 834.5 229.8 L 846.1 223.5 L 856.9 211.5 L 862.8 195.5 L 862.9 179.5 L 859 166.5 L 850.5 154.4 L 842.5 148 L 832.5 142.5 L 831.2 138.5 L 832.5 136.2 L 834.5 135.7 L 1157.5 227.8 L 1174.5 231.7 L 1190.5 229.8 L 1197.5 226.8 L 1204.5 221.7 L 1214 209.5 L 1219 193.5 L 1217.9 175.5 L 1212.6 162.5 L 1204.1 152.5 L 1188.5 143.1 L 1186.7 139.5 L 1188.5 136.1 L 1191.5 135.9 L 1220 144 L 1220 64.7 L 1031.5 118.6 L 1011.5 123 L 1009.2 120.5 L 1010.5 116.5 L 1024.5 108.8 L 1036.8 95.5 L 1041.8 83.5 L 1043.2 68.5 L 1039.8 53.5 L 1032.5 40.8 L 1020.5 31.2 L 1006.5 27.2 L 987.5 30.3 L 657.5 123.2 L 654 121.5 L 654.4 117.5 L 665.5 111.8 L 672.5 106.7 L 682 95.5 L 686.9 82.5 L 687.9 68.5 L 683.7 51.5 L 676.9 40.5 L 671.5 35.3 L 663.5 30.2 L 651.5 27.3 L 641.5 28 L 628.5 31.3 L 300.5 123.7 L 296.9 121.5 L 297.2 117.5 L 313.5 108.9 L 324.8 96.5 L 329.8 85.5 L 331.8 70.5 L 328.9 54.5 L 320.9 40.5 L 315.5 35.3 L 307.5 30.3 L 295.5 27.3 L 278.5 29.3 L 36.5 90.8 L 0.5 91.8 Z
		M 142.4 96.5 L 142.5 95.4 L 146.5 94.1 L 288.5 56.2 L 295.5 57 L 299.4 59.5 L 303 64.5 L 304.6 70.5 L 302.8 80.5 L 299.5 85 L 295.5 87.8 L 200.5 114.1 Z
		M 323.2 162.5 L 379.5 144.4 L 469.5 172 L 473.3 174.5 L 477 179.5 L 478.5 185.5 L 477.9 191.5 L 475.7 196.5 L 472.5 199.8 L 468.5 201.9 L 461.5 202.7 Z
		M 684 162.5 L 741.5 144.8 L 829.5 172.1 L 833.7 175.5 L 836.8 180.5 L 837.7 185.5 L 837 191.5 L 834.7 196.5 L 831.5 199.8 L 825.4 202.5 L 820.5 202.7 Z
		M 507.8 96.5 L 529.5 89.2 L 647.5 56.3 L 652.5 57.1 L 656.5 59.4 L 659.9 63.5 L 661.8 68.5 L 661.9 75.5 L 659.9 81.5 L 656.5 85.7 L 652.5 87.9 L 564.5 114.1 Z
		M 1040.1 162.5 L 1097.5 144.7 L 1185.5 172.4 L 1190.9 177.5 L 1192.7 181.5 L 1192.8 191.5 L 1189.6 197.5 L 1185.5 200.9 L 1180.5 202.5 L 1175.5 202.5 Z
		M 864.8 96.5 L 879.5 91.3 L 1003.5 56.3 L 1008.5 57.2 L 1012.5 59.7 L 1015.7 63.5 L 1017.6 69.5 L 1017.6 75.5 L 1015.6 81.5 L 1008.5 87.7 L 921.5 114.1 Z
	`;

	const VALVE_CHANNEL: ContainerShape = {
		type: 'svgPath',
		viewBox: [0, 0, 1220, 257],
		fillRule: 'evenodd',
		maskResolution: 2048,
		d: TESLA_VALVE_PATH
	};

	const FLOW: FlowConfig = {
		mode: 'live',
		boundary: { left: 'open', right: 'open', top: 'wall', bottom: 'wall' },
		forces: [{ kind: 'pressureGradient', vector: { x: 28, y: 0 } }],
		outlets: [{ edge: 'right', from: 0.16, to: 0.84, width: 0.08, clearDye: 0.32, clearScalars: true, clearVelocity: true }]
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
	{pointerInput}
	{splatOnHover}
	aria-label={ariaLabel}
	containerShape={VALVE_CHANNEL}
	flow={FLOW}
	curl={10}
	densityDissipation={0.36}
	velocityDissipation={0.085}
	maxTimeStep={1 / 60}
	substeps={1}
	viscosity={0.04}
	viscosityIterations={10}
	wallFriction={0.14}
	wallFrictionWidth={2}
	pressure={0.9}
	pressureIterations={30}
	splatRadius={0.085}
	splatForce={6000}
	autoSplatRate={5}
	autoSplatCount={4}
	autoSplatVelocityX={190}
	autoSplatVelocityY={0}
	autoSplatCenterX={0.035}
	autoSplatBandWidth={0.024}
	autoSplatCenterY={0.49}
	autoSplatBandHeight={0.18}
	shading={false}
	colorful={false}
	bloom={false}
	sunrays={false}
	simResolution={192}
	dyeResolution={768}
	initialSplatCount={0}
	backColor={backColor ?? { r: 5, g: 9, b: 12 }}
/>
