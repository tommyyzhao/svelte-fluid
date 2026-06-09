<!--
  svelte-fluid — Fluid maze solve (DEMO-ONLY, not a shipped preset)

  Visual intent: an SVG maze whose walls are a single obstruction. Fluid is
  injected at the top entrance and floods the one winding channel until it
  reaches and pours out the bottom-right exit hole — a "fluid solving the
  maze" effect.

  Geometry note (why the viewBox is landscape): the obstruction rasteriser
  uniform-fits the viewBox into the canvas and centres it. A SQUARE viewBox in
  a wide card leaves open margins on the sides where dye escapes the maze
  entirely. So the viewBox matches the card's aspect (~1.69:1 → 135×80) and the
  walls fill it edge to edge — no open margin, no escape.

  Physics:
  - The maze WALLS are obstruction geometry; the bottom edge is physically
    open, but the bottom-wall obstruction blocks every segment except the exit
    gap. That makes the visible exit a real pressure boundary instead of only
    a dye-clearing sponge.
  - A sheet-like inlet, low-dissipation scalar, and downward gravity make this
    read more like incompressible liquid filling a channel than smoke diffusing
    through a room. It is still not a true free-surface/multiphase water solve.

  Channel trace (viewBox [0,0,135,80], SVG y DOWN so y=0 is the TOP):
      entrance gap (top, x60..75)
        → corridor 1 (y5..22)   → baffle A gap on the RIGHT (x118..130)
        → corridor 2 (y27..39)  → baffle B gap on the LEFT  (x5..17)
        → corridor 3 (y44..56)  → baffle C gap on the RIGHT (x118..130)
        → corridor 4 (y61..75)  → exit hole (bottom, x105..120)
  One connected serpentine; no pocket is walled off on all sides.

  Coordinate notes:
  - Obstruction path space is y-DOWN: SVG y=0 → TOP of canvas (splat y≈1.0).
  - handle.splat: x,y in [0,1], y BOTTOM-to-TOP (y=1 top); dx,dy are RAW
    velocity (not scaled by splatForce); dy NEGATIVE points DOWN.
-->

<script lang="ts" module>
	import type { FluidProps } from '$lib/Fluid.svelte';

	/** Props consumed by `<Maze />`. Sizing/seed/styling/backColor are forwarded; the maze geometry and flood physics are pinned. */
	export type MazeProps = Pick<
		FluidProps,
		'width' | 'height' | 'class' | 'style' | 'seed' | 'lazy' | 'splatOnHover' | 'aria-label' | 'backColor'
	>;
</script>

<script lang="ts">
	import Fluid from '$lib/Fluid.svelte';
	import type { FlowConfig, FluidHandle, PresetSplat } from '$lib/engine/types.js';

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
	}: MazeProps = $props();

	let inner = $state<{ handle: FluidHandle } | undefined>(undefined);

	// The maze as ONE obstruction: axis-aligned rectangular wall subpaths
	// (each `M..Z`), fillRule nonzero, viewBox [0,0,135,80] (landscape, matches
	// the card so the walls fill it edge to edge). Walls are 5 units thick.
	const rect = (x0: number, y0: number, x1: number, y1: number) =>
		`M ${x0} ${y0} L ${x1} ${y0} L ${x1} ${y1} L ${x0} ${y1} Z`;

	const MAZE = [
		// Top wall, split by the ENTRANCE GAP at x60..75.
		rect(0, 0, 60, 5),
		rect(75, 0, 135, 5),
		// Side walls (full height).
		rect(0, 0, 5, 80),
		rect(130, 0, 135, 80),
		// Bottom wall, split by the EXIT HOLE at x105..120.
		rect(0, 75, 105, 80),
		rect(120, 75, 135, 80),
		// Serpentine baffles with alternating gaps.
		rect(5, 22, 118, 27), // baffle A — gap on the RIGHT (x118..130)
		rect(17, 39, 130, 44), // baffle B — gap on the LEFT  (x5..17)
		rect(5, 56, 118, 61) // baffle C — gap on the RIGHT (x118..130)
	].join(' ');

	// Entrance gap is viewBox x60..75 → x≈0.44..0.56. Push the inlet sheet
	// against the TOP wall (splat y≈0.9 ≈ SVG y8, just inside) so liquid can
	// only head DOWN into the channel, not back out the entrance.
	const ENTRANCE_X = 0.5;
	const ENTRANCE_Y = 0.9;
	const ENTRANCE_LEFT = 0.445;
	const ENTRANCE_RIGHT = 0.555;
	// dy NEGATIVE = DOWN. Dye is deliberately faint; the scalar field is the
	// liquid volume proxy used for display.
	const INJECT_DY = -620;
	const DYE = { r: 0.03, g: 0.18, b: 0.34 } as const;

	// Opening pulse so the flood has already started on frame 1.
	const PRESET_SPLATS: PresetSplat[] = [
		{ x: ENTRANCE_X, y: ENTRANCE_Y, dx: 0, dy: INJECT_DY, color: DYE }
	];

	const FLOW: FlowConfig = {
		mode: 'live',
		boundary: { left: 'wall', right: 'wall', top: 'wall', bottom: 'open' },
		sources: [
			{
				kind: 'line',
				from: { x: ENTRANCE_LEFT, y: ENTRANCE_Y },
				to: { x: ENTRANCE_RIGHT, y: ENTRANCE_Y },
				velocity: { x: 0, y: INJECT_DY },
				dye: DYE,
				scalars: { ink: 0.38 },
				rate: 40,
				radius: 0.045,
				profile: 'uniform'
			}
		],
		outlets: [{ edge: 'bottom', from: 0.77, to: 0.9, width: 0.035, clearDye: 0.75, clearScalars: true, clearVelocity: false }],
		scalarFields: [{ name: 'ink', dissipation: 0.045, advection: 'low-dissipation', color: { r: 0.75, g: 0.95, b: 1.0 }, range: [0, 1.6] }],
		forces: [{ kind: 'gravity', vector: { x: 0, y: -140 } }],
		visualization: { colorBy: 'scalar', scalar: 'ink', transfer: 'water', scale: 0.78 }
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
	obstructions={[{ d: MAZE, fillRule: 'nonzero', viewBox: [0, 0, 135, 80], fit: 'fill' }]}
	flow={FLOW}
	densityDissipation={0.08}
	initialDensityDissipation={0.08}
	velocityDissipation={0.025}
	maxTimeStep={1 / 120}
	substeps={2}
	viscosity={0.01}
	viscosityIterations={8}
	wallFriction={0.08}
	wallFrictionWidth={2}
	curl={0}
	pressure={0.9}
	pressureIterations={40}
	splatRadius={0.1}
	splatForce={6000}
	bloom={false}
	bloomThreshold={0.7}
	bloomIntensity={0.4}
	shading={false}
	colorful={false}
	simResolution={256}
	dyeResolution={1024}
	initialSplatCount={0}
	backColor={backColor ?? { r: 4, g: 6, b: 14 }}
	presetSplats={PRESET_SPLATS}
/>
