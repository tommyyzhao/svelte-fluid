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
  - The maze WALLS are obstruction geometry; obstruction physics is always on,
    and a CLOSED boundary (openBoundary omitted) makes the canvas edges contain
    the flood so it can only leave through the exit hole.
  - LOW density dissipation (0.2, not literally zero): continuous injection into
    a sealed maze with *zero* dissipation accumulates without bound and
    saturates every channel to white. A small dissipation bounds the steady
    state so the channels stay legible (bright near the entrance, fading toward
    the exit) while still flooding the whole maze over the first few seconds.

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
	import { onMount } from 'svelte';
	import Fluid from '$lib/Fluid.svelte';
	import type { FluidHandle, PresetSplat } from '$lib/engine/types.js';

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

	// Entrance gap is viewBox x60..75 → centre x67.5/135 ≈ 0.5. Push the splat
	// against the TOP wall (splat y≈0.875 ≈ SVG y10, just inside) so dye can
	// only head DOWN into the channel, not back out the entrance.
	const ENTRANCE_X = 0.5;
	const ENTRANCE_Y = 0.875;
	// dy NEGATIVE = DOWN. Below 1.0 (no HDR) so the flooded channels stay a
	// legible blue rather than blowing out to white as they accumulate.
	const INJECT_DY = -700;
	const DYE = { r: 0.1, g: 0.5, b: 0.9 } as const;

	// Opening pulse so the flood has already started on frame 1.
	const PRESET_SPLATS: PresetSplat[] = [
		{ x: ENTRANCE_X, y: ENTRANCE_Y, dx: 0, dy: INJECT_DY, color: DYE }
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

	// Continuous downward injection at the entrance feeds the flood. Guarded for
	// SSR (no window) and reduced-motion (the static opening pulse remains).
	onMount(() => {
		if (typeof window === 'undefined') return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

		const id = setInterval(() => {
			if (!inner) return;
			inner.handle.splat(ENTRANCE_X, ENTRANCE_Y, 0, INJECT_DY, DYE);
		}, 110);
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
	obstructions={[{ d: MAZE, fillRule: 'nonzero', viewBox: [0, 0, 135, 80], fit: 'fill' }]}
	densityDissipation={0.2}
	initialDensityDissipation={0.2}
	velocityDissipation={0.04}
	curl={0}
	pressure={0.9}
	pressureIterations={28}
	splatRadius={0.1}
	splatForce={6000}
	bloom
	bloomThreshold={0.7}
	bloomIntensity={0.4}
	shading
	colorful={false}
	simResolution={256}
	dyeResolution={1024}
	initialSplatCount={0}
	backColor={backColor ?? { r: 4, g: 6, b: 14 }}
	presetSplats={PRESET_SPLATS}
/>
