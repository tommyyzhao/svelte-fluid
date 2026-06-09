[![CI](https://github.com/tommyyzhao/svelte-fluid/actions/workflows/ci.yml/badge.svg)](https://github.com/tommyyzhao/svelte-fluid/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/svelte-fluid)](https://www.npmjs.com/package/svelte-fluid)
[![npm downloads](https://img.shields.io/npm/dm/svelte-fluid)](https://www.npmjs.com/package/svelte-fluid)
[![install size](https://packagephobia.com/badge?p=svelte-fluid)](https://packagephobia.com/result?p=svelte-fluid)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

# svelte-fluid

Fluid simulation for Svelte 5.

<p align="center">
  <img src="https://raw.githubusercontent.com/tommyyzhao/svelte-fluid/main/static/hero.webp" alt="svelte-fluid showcase: text-masked fluid, glass orb with chromatic refraction, reveal-scratch effect, and image distortion" width="720" />
</p>

<p align="center">
  <strong><a href="https://tommyyzhao.github.io/svelte-fluid/">Live demo</a></strong>
</p>

### Why svelte-fluid?

Most fluid packages are vanilla JS with a Svelte wrapper bolted on.
This one is built for Svelte 5 from the ground up:

- **True component API** — `<Fluid />` with 70+ typed props, live reactive updates, and full cleanup on unmount
- **Multiple independent instances** per page — no shared GL state
- **Deterministic seeding** — same `seed` reproduces the same splat pattern across resizes
- **14 example presets** — reference configurations showing the range of what's possible
- **5 container shapes** — circle, frame, roundedRect, annulus, and arbitrary SVG paths / text via mask texture
- **Glass post-processing** — refraction, specular highlights, and chromatic aberration on any container shape
- **Lazy loading + auto-pause** — defer engine creation until viewport entry
- **Imperative API** — `splat()` and `randomSplats()` via `bind:this`

## Install

```sh
npm install svelte-fluid
# or
pnpm add svelte-fluid
# or
bun add svelte-fluid
```

> Requires Svelte ≥ 5.

## Quick start

```svelte
<script lang="ts">
  import { Fluid } from 'svelte-fluid';
</script>

<div style="width:100%; height:100vh">
  <Fluid />
</div>
```

That's it. Canvas fills its parent, resize handled automatically.

For a first-run screen that shows motion immediately in a blank app,
start with a slightly brighter starter config:

```svelte
<div style="width:100%; height:100vh">
  <Fluid
    seed={42}
    initialSplatCount={20}
    autoSplatRate={0.25}
    autoSplatCount={2}
    densityDissipation={0.35}
    velocityDissipation={0.08}
    curl={45}
    splatRadius={0.35}
    bloomIntensity={1.2}
    sunraysWeight={0.6}
    backColor={{ r: 6, g: 10, b: 26 }}
  />
</div>
```

### Fixed dimensions

```svelte
<Fluid width={400} height={300} />
```

### Custom physics

```svelte
<Fluid
  curl={20}
  splatRadius={0.5}
  bloom={false}
  shading
  densityDissipation={0.4}
  initialSplatCount={12}
  seed={42}
/>
```

### Imperative API via `bind:this`

```svelte
<script lang="ts">
  import { Fluid, type FluidHandle } from 'svelte-fluid';

  let ref = $state<{ handle: FluidHandle } | undefined>();
</script>

<button onclick={() => ref?.handle.randomSplats(10)}>Splat!</button>
<Fluid bind:this={ref} />
```

## Browser compatibility

- **WebGL 1** (with linear filtering) and **WebGL 2** both work
- Tested on Chrome 120+, Firefox 121+, Safari 17+
- **Mobile:** works on iOS Safari 16+ and Chrome Android, with `lazy={true}`
  strongly recommended on dense pages
- **Linear filtering fallback:** when `OES_texture_float_linear` is unavailable,
  the engine drops shading, bloom, sunrays and clamps `dyeResolution` ≤ 512 —
  see `FluidEngine.initContext()`

## Props

All props are optional. CamelCase wraps the original SCREAMING_CASE
config from the upstream project.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `width` | `number` | — | CSS px. Omit to fill parent. |
| `height` | `number` | — | CSS px. Omit to fill parent. |
| `seed` | `number` | random | 32-bit uint; deterministic initial splats |
| `simResolution` | `number` | `128` | velocity grid; **rebuilds FBOs** |
| `dyeResolution` | `number` | `1024` | dye grid; **rebuilds FBOs** |
| `densityDissipation` | `number` | `1` | hot; **steady-state** value |
| `initialDensityDissipation` | `number` | (= `densityDissipation`) | hot; ramp start (see [burn-in pattern](#burn-in-density-dissipation)) |
| `initialDensityDissipationDuration` | `number` | `0` | seconds; duration of the linear ramp |
| `velocityDissipation` | `number` | `0.2` | hot |
| `pressure` | `number` | `0.8` | hot |
| `pressureIterations` | `number` | `20` | hot |
| `curl` | `number` | `30` | vorticity confinement; hot |
| `splatRadius` | `number` | `0.25` | hot |
| `splatForce` | `number` | `6000` | hot |
| `shading` | `boolean` | `true` | **shader recompile** |
| `colorful` | `boolean` | `true` | hot; rotate pointer/touch splat colors over time |
| `colorUpdateSpeed` | `number` | `10` | hot; pointer/touch color rotation rate |
| `paused` | `boolean` | `false` | hot |
| `backColor` | `{r,g,b}` | `{0,0,0}` | 0–255 RGB; hot |
| `transparent` | `boolean` | `false` | hot |
| `bloom` | `boolean` | `true` | **shader recompile** |
| `bloomIterations` | `number` | `8` | **rebuilds FBOs** |
| `bloomResolution` | `number` | `256` | **rebuilds FBOs** |
| `bloomIntensity` | `number` | `0.8` | hot |
| `bloomThreshold` | `number` | `0.6` | hot |
| `bloomSoftKnee` | `number` | `0.7` | hot |
| `sunrays` | `boolean` | `true` | **shader recompile** |
| `sunraysResolution` | `number` | `196` | **rebuilds FBOs** |
| `sunraysWeight` | `number` | `1` | hot |
| `initialSplatCount` | `number` | — | exact count for the first frame |
| `initialSplatCountMin` | `number` | `5` | min of random range |
| `initialSplatCountMax` | `number` | `25` | max of random range |
| `autoSplatRate` | `number` | `0` | automatic burst rate in splats/sec; 0 = disabled (Bucket A) |
| `autoSplatCount` | `number` | `1` | number of splats emitted each burst (Bucket A) |
| `autoSplatColor` | `{r,g,b}` | `null` | fixed color for automatic splats; null = fresh random color per splat (Bucket A) |
| `autoSplatVelocityX` | `number` | `0` | x velocity for automatic splats; ignored when `autoSplatSwirl` is nonzero (Bucket A) |
| `autoSplatVelocityY` | `number` | `0` | y velocity for automatic splats; negative moves downward in DOM space (Bucket A) |
| `autoSplatCenterY` | `number` | `0.5` | vertical center of the spawn band: 0 = bottom, 0.5 = center, 1 = top (Bucket A) |
| `autoSplatEvenX` | `boolean` | `false` | within each burst, use equal x positions instead of random x positions |
| `autoSplatSwirl` | `number` | `0` | orbital velocity around the container/canvas center; positive = CCW |
| `autoSplatBandHeight` | `number` | `0.1` | height of the spawn band; 0 = single line, 0.1 = ±5%, 2.0 = full canvas |
| `pointerInput` | `boolean` | `true` | hot; toggles canvas + window listeners |
| `splatOnHover` | `boolean` | `false` | hot; splat on mousemove without click |
| `containerShape` | `ContainerShape` | `null` | confine fluid to a shape; see [Container shapes](#container-shapes) |
| `glass` | `boolean` | `false` | glass post-processing; requires `containerShape`; see [Glass effect](#glass-effect) |
| `glassThickness` | `number` | `0.04` | glass wall width in UV units (rim model only) |
| `glassRefraction` | `number` | `0.4` | refraction strength 0–1; mapped to IOR 1.0–2.0 |
| `glassReflectivity` | `number` | `0.12` | specular intensity (Fresnel F0) 0–1 |
| `glassChromatic` | `number` | `0.15` | chromatic aberration strength 0–1 |
| `presetSplats` | `PresetSplat[]` | — | construct-only; declarative initial scene (see [Presets](#presets)) |
| `lazy` | `boolean` | `false` | construct-only; defer engine creation until container enters viewport |
| `autoPause` | `boolean` | `true` | pause when not visible (IntersectionObserver + visibilitychange) |

The component also forwards any standard `<canvas>` attributes
(`class`, `style`, `aria-label`, …) onto the underlying canvas via
`...rest`.

## Presets

Fourteen reference configurations demonstrating different physics setups,
container shapes, and solver-native flow scenes. Useful as starting points for building your own:

| Component | Look |
| --- | --- |
| `<LavaLamp />` | Warm blobs in a glass vessel with rim refraction |
| `<Plasma />` | Full-spectrum jets converging into a bright plasma core |
| `<InkInWater />` | India ink sinking through dark water with volumetric bloom |
| `<FrozenSwirl />` | An icy whirlpool frozen inside a circular vessel |
| `<Aurora />` | Green, magenta, and pale-blue ribbons glowing like northern lights |
| `<ToroidalTempest />` | Full-spectrum storm circulating in a high-velocity ring |
| `<CircularFluid />` | Vivid swirling fluid contained inside a circle |
| `<FrameFluid />` | Colorful fluid swirling around a rectangular inner cutout |
| `<AnnularFluid />` | Ring-vortex fluid between two concentric circles |
| `<SvgPathFluid />` | Fluid shaped by an ampersand glyph via mask texture |
| `<GasFlare />` | Temperature scalar, buoyancy, and physical nozzle obstructions |
| `<Venturi />` | Pressure-gradient throughflow with CFD-style speed visualization |
| `<RiverDelta />` | Open-edge routing around staggered island obstructions |
| `<TeslaValve />` | High-viscosity multicolor splats through an SVG conduit mask |

```svelte
<script lang="ts">
  import { LavaLamp, Plasma, ToroidalTempest } from 'svelte-fluid';
</script>

<div style="height: 100vh">
  <LavaLamp />
</div>

<div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:16px">
  <Plasma />
  <ToroidalTempest />
</div>
```

Each preset forwards a small common set of props: `width`, `height`,
`class`, `style`, `seed`, `lazy`, `splatOnHover`, `aria-label`, and
`backColor`. Flow-scene presets also expose `pointerInput`, and some shape
presets expose small shape-specific knobs such as corner radii. The main
physics recipe is intentionally fixed. They all re-expose the imperative
`handle` so you can still call `splat()` / `randomSplats()` from outside via
`bind:this`.

### Building your own preset

A preset is a tiny wrapper around `<Fluid />` that pins config and
optionally passes a `presetSplats` array. The engine consumes
`presetSplats` once at construction (right after the random initial
splats), so the opening scene is fully deterministic and reproducible
across resizes.

```svelte
<script lang="ts">
  import { Fluid, type PresetSplat, type FluidHandle } from 'svelte-fluid';

  const SPLATS: PresetSplat[] = [
    { x: 0.5, y: 0.1, dx: 0, dy: 800, color: { r: 1.6, g: 0.4, b: 0.1 } }
  ];

  let inner = $state<{ handle: FluidHandle } | undefined>();
  export const handle: FluidHandle = {
    splat: (x, y, dx, dy, c) => inner?.handle.splat(x, y, dx, dy, c),
    randomSplats: (n) => inner?.handle.randomSplats(n)
  };
</script>

<Fluid
  bind:this={inner}
  curl={50}
  densityDissipation={0}
  initialSplatCount={0}
  presetSplats={SPLATS}
/>
```

Note: `presetSplats` is **construct-only** — like `seed`, changes after
mount are ignored. To paint a new scene, change the `seed` (which forces
a teardown/rebuild) or call `handle.splat()` imperatively.

Splat coordinates are normalized: `x ∈ [0,1]` left-to-right and
`y ∈ [0,1]` **bottom-to-top**. Color components are in 0–1 range; values
above 1 are valid and read as HDR highlights through the bloom pass.

## Burn-in density dissipation

If you want a `densityDissipation: 0` "vivid persistent" look but the
opening splats are bright enough to overwhelm the canvas, use a
temporary high dissipation that decays to zero:

```svelte
<Fluid
  densityDissipation={0}
  initialDensityDissipation={1.5}
  initialDensityDissipationDuration={2}
  presetSplats={SPLATS}
/>
```

The engine linearly interpolates from `initialDensityDissipation` →
`densityDissipation` over `initialDensityDissipationDuration` seconds,
then holds at the steady-state value forever. This lets the overlapping
additive splats "burn in" — overbright pixels fade for the first couple
of seconds — before dissipation locks at zero so the remaining dye
persists indefinitely. The `LavaLamp` and `Plasma` presets
use this pattern.

The clock starts when the engine begins ticking (post-mount, post
first ResizeObserver fire), so the burn-in survives `setConfig`
updates and matches the user's perception of "since the canvas
appeared".

## Container shapes

Confine the fluid to a geometric region with `containerShape`. The
simulation physically enforces the boundary — velocity is zeroed outside
and dye is masked after advection.

```svelte
<!-- Circle -->
<Fluid containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 }} />

<!-- Frame (fluid fills the border region around a rectangular cutout) -->
<Fluid containerShape={{ type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.25, halfH: 0.25 }} />

<!-- Rounded rectangle -->
<Fluid containerShape={{ type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.35, halfH: 0.25, cornerRadius: 0.05 }} />

<!-- Annulus (ring between two circles) -->
<Fluid containerShape={{ type: 'annulus', cx: 0.5, cy: 0.5, innerRadius: 0.15, outerRadius: 0.4 }} />

<!-- SVG path -->
<Fluid containerShape={{ type: 'svgPath', d: 'M50 5 L61 40 L98 40 L68 62 L79 97 L50 75 L21 97 L32 62 L2 40 L39 40 Z' }} />

<!-- Text (fluid-filled letters) -->
<Fluid containerShape={{ type: 'svgPath', text: 'HELLO', font: 'bold 72px sans-serif' }} />
```

Coordinates are normalized: `cx`/`cy` in [0, 1] (left-to-right,
bottom-to-top). `radius` is normalized by canvas height. The `svgPath`
type rasterizes to a mask texture via `OffscreenCanvas` and supports
both SVG path data (`d`) and Canvas 2D text (`text`).

## Glass effect

Add a glass post-processing layer to any container shape with `glass`.
Circles get a hemisphere dome with Snell's law refraction; all other
shapes get rim refraction at the boundary.

```svelte
<!-- Glass orb with chromatic aberration -->
<Fluid
  containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.4 }}
  glass
  glassRefraction={0.6}
  glassChromatic={0.3}
/>

<!-- Subtle glass frame -->
<Fluid
  containerShape={{ type: 'frame', cx: 0.5, cy: 0.5, halfW: 0.3, halfH: 0.2 }}
  glass
  glassThickness={0.06}
  glassReflectivity={0.08}
/>
```

The specular highlight tracks the mouse cursor automatically. All
highlights are driven by the fluid brightness — no fluid, no highlights.

## FluidBackground composition

`FluidBackground` is a page or screen wrapper, not a local card widget.
Its fluid canvas is fixed to the viewport, and its slotted content sits
above the canvas with `pointer-events: none` so window-level pointer
input keeps feeding the simulation.

Keep elements inside the slot when they should carve holes in the fluid
via `exclude`. Add `pointer-events: auto` back to interactive children
such as nav bars, cards, and forms:

```svelte
<script lang="ts">
  import { FluidBackground } from 'svelte-fluid';
</script>

<FluidBackground class="fluid-screen" exclude=".site-nav, .panel" splatOnHover>
  <nav class="site-nav">...</nav>
  <main class="hero-copy">...</main>
  <section class="panel">...</section>
</FluidBackground>

<style>
  :global(.fluid-screen) {
    min-height: 100vh;
    isolation: isolate;
  }

  .site-nav,
  .panel {
    position: relative;
    z-index: 2;
    pointer-events: auto;
  }

  .hero-copy {
    position: relative;
    z-index: 1;
  }
</style>
```

For a local bounded canvas, use `<Fluid />` with a parent size or fixed
`width` / `height` instead.

## Resize behavior

On resize, the engine rebuilds from the same `seed` — same opening pattern,
no flicker. Omit `seed` and the component picks one at mount and holds onto it.

## Multiple instances

Each `<Fluid />` owns its own WebGL context, framebuffers, RAF loop,
listeners, and pointer state. Browsers cap simultaneous WebGL contexts at 8–16 per tab.

For pages with more than ~6 simultaneous instances, pass `lazy={true}`
on each one. The component will then defer engine creation until the
container enters the viewport (with a 200px lookahead) and tear it
down when it leaves, keeping the live context count bounded:

```svelte
<LavaLamp lazy />
<Plasma lazy />
```

The ~100–500ms shader recompile happens off-screen while the user is
still scrolling, so it lands before they get there.

## Programmatic engine

Not using the Svelte component? The raw engine works standalone:

```ts
import { FluidEngine } from 'svelte-fluid';

const canvas = document.querySelector('canvas')!;
canvas.width = canvas.clientWidth * devicePixelRatio;
canvas.height = canvas.clientHeight * devicePixelRatio;

const engine = new FluidEngine({
  canvas,
  config: { curl: 20, bloom: false, seed: 42 }
});

// later…
engine.splat(0.5, 0.5, 100, 0, { r: 1, g: 0.5, b: 0 });
engine.randomSplats(8);
engine.setConfig({ curl: 5 });
engine.dispose();
```

## Development

This project uses **bun**.

```sh
bun install
bun run dev      # demo playground at http://localhost:5173
bun run check    # svelte-check
bun run package  # produces dist/ with svelte-package
bun run build    # builds the SvelteKit demo site
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, architecture
rules, and common workflows. Please open an issue before starting large
changes.

## Acknowledgments

Built on [PavelDoGreat/WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation),
Pavel Dobryakov's iconic 2017 fluid sim. Shaders reused unchanged; both MIT-licensed.

The reveal and distortion effects were inspired by
[Ksenia Kondrashova's](https://codepen.io/ksenia-k) creative WebGL
demos built on the same fluid simulation.
