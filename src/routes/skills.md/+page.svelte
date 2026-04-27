<script lang="ts">
	// Plain text page optimized for LLM consumption.
	// No interactive components — just structured reference text.
</script>

<svelte:head>
	<title>svelte-fluid &mdash; SKILLS.md</title>
	<meta name="description" content="LLM-friendly API reference for svelte-fluid" />
	<meta name="robots" content="noindex" />
</svelte:head>

<article class="skills">
<pre>{@html `
# svelte-fluid — SKILLS.md

> WebGL Navier-Stokes fluid simulation as a Svelte 5 component library.
> Multi-instance, resize-stable, deterministic seeding.
> Port of Pavel Dobryakov's WebGL-Fluid-Simulation.

Package: svelte-fluid
License: MIT
Repository: https://github.com/tommyyzhao/svelte-fluid
Homepage: https://tommyyzhao.github.io/svelte-fluid/

## Install

\`\`\`sh
npm install svelte-fluid
# or
bun add svelte-fluid
\`\`\`

Requires Svelte 5. No runtime dependencies.

---

## Components

### 1. Fluid

The core component. Renders a WebGL fluid simulation on a canvas.

\`\`\`svelte
&lt;script&gt;
  import { Fluid } from 'svelte-fluid';
&lt;/script&gt;

&lt;Fluid /&gt;
\`\`\`

**Props**: All FluidConfig fields (see below) plus:

| Prop       | Type     | Default | Description                                         |
|------------|----------|---------|-----------------------------------------------------|
| width      | number   | —       | Fixed width in CSS px. Omit to fill parent.         |
| height     | number   | —       | Fixed height in CSS px. Omit to fill parent.        |
| class      | string   | —       | Class on wrapper div.                               |
| style      | string   | —       | Inline style on wrapper div.                        |
| lazy       | boolean  | false   | Defer engine until element enters viewport.         |
| autoPause  | boolean  | true    | Pause RAF loop when not visible or tab hidden.      |

Exposes \`handle: FluidHandle\` via \`bind:this\`.


### 2. FluidBackground

Full-viewport fluid behind page content. Pointer events captured from window.

\`\`\`svelte
&lt;script&gt;
  import { FluidBackground } from 'svelte-fluid';
&lt;/script&gt;

&lt;FluidBackground exclude=".card" splatOnHover&gt;
  &lt;div class="card"&gt;Content here&lt;/div&gt;
&lt;/FluidBackground&gt;
\`\`\`

**Props**: All FluidConfig fields plus:

| Prop           | Type    | Default                 | Description                                      |
|----------------|---------|-------------------------|--------------------------------------------------|
| exclude        | string  | —                       | CSS selector for elements to exclude from fluid. |
| excludeRadius  | number  | 16                      | Border radius of exclusion zones (CSS px).       |
| excludePad     | number  | 4                       | Padding around exclusion zones (CSS px).         |
| class          | string  | —                       | Class on wrapper div.                            |
| style          | string  | —                       | Inline style on wrapper div.                     |
| children       | Snippet | —                       | Page content rendered above the fluid canvas.    |

Default overrides: simResolution=64, dyeResolution=512, pointerTarget='window',
splatOnHover=true, initialSplatCount=0, backColor={r:8,g:8,b:16}.


### 3. FluidReveal

Fluid as an opacity mask. Cursor movement reveals content underneath.

\`\`\`svelte
&lt;script&gt;
  import { FluidReveal } from 'svelte-fluid';
&lt;/script&gt;

&lt;FluidReveal sensitivity={0.24} curve={0.5}&gt;
  &lt;img src="/hero.jpg" alt="Hero" /&gt;
&lt;/FluidReveal&gt;
\`\`\`

**Props**: All FluidConfig fields plus:

| Prop             | Type    | Default                          | Description                                       |
|------------------|---------|----------------------------------|---------------------------------------------------|
| sensitivity      | number  | 0.1                              | How easily areas reveal. Higher = less dye needed. |
| curve            | number  | 0.5                              | Power exponent. Higher = crisper edge.             |
| coverColor       | RGB     | {r:1, g:1, b:1}                 | Cover layer color (0-1 linear).                    |
| accentColor      | RGB     | {r:0.05, g:0.16, b:0.32}        | Fringe accent color (0-1 linear).                  |
| fringeColor      | RGB     | {r:0.6, g:0.7, b:0.85}          | Outer fringe color (0-1 linear).                   |
| fadeBack         | boolean | true                             | Revealed areas gradually fade back.                |
| fadeSpeed        | number  | —                                | Explicit dissipation (1.0=permanent, 0.99=slow).   |
| autoReveal       | boolean | false                            | Lissajous animation before user interaction.       |
| autoRevealSpeed  | number  | 1.0                              | Speed multiplier for auto-reveal.                  |
| width            | number  | —                                | Fixed width in CSS px.                             |
| height           | number  | —                                | Fixed height in CSS px.                            |
| lazy             | boolean | false                            | Defer engine until visible.                        |
| autoPause        | boolean | true                             | Auto-pause when not visible.                       |
| class            | string  | —                                | Class on wrapper div.                              |
| style            | string  | —                                | Inline style on wrapper div.                       |
| children         | Snippet | —                                | Content revealed by interaction.                   |

Default overrides: bloom=false, sunrays=false, shading=false,
velocityDissipation=0.98, pressure=1.0, curl=0, openBoundary=true,
pointerInput=false, initialSplatCount=0, splatOnHover=false.


### 4. FluidDistortion

Fluid velocity warps an underlying image like liquid glass.

\`\`\`svelte
&lt;script&gt;
  import { FluidDistortion } from 'svelte-fluid';
&lt;/script&gt;

&lt;FluidDistortion src="/photo.jpg" strength={0.4} /&gt;
\`\`\`

**Props**: All FluidConfig fields plus:

| Prop              | Type              | Default | Description                                         |
|-------------------|-------------------|---------|-----------------------------------------------------|
| src               | string            | —       | Image URL to distort. Required.                     |
| strength          | number            | 0.4     | Warp intensity (0=none, 1=strong).                  |
| intensity         | number            | 24      | Dye amount per pointer interaction.                 |
| fit               | 'cover'|'contain' | 'cover' | How the image fits the canvas.                      |
| scale             | number            | 1.0     | Image scale (>1 zooms out).                         |
| autoDistort       | boolean           | false   | Lissajous animation before user interaction.        |
| autoDistortSpeed  | number            | 1.0     | Speed multiplier for auto-distort.                  |
| initialSplats     | number            | 20      | Random chaos splats at startup. 0=start undistorted.|
| bleed             | number            | 60      | Extra canvas px beyond each edge.                   |
| width             | number            | —       | Fixed width in CSS px.                              |
| height            | number            | —       | Fixed height in CSS px.                             |
| lazy              | boolean           | false   | Defer engine until visible.                         |
| autoPause         | boolean           | true    | Auto-pause when not visible.                        |
| class             | string            | —       | Class on wrapper div.                               |
| style             | string            | —       | Inline style on wrapper div.                        |
| children          | Snippet           | —       | Content behind the distorted image.                 |

Default overrides: bloom=false, sunrays=false, shading=false,
densityDissipation=0.98, velocityDissipation=0.97, pressure=0,
curl=0, pointerInput=false, initialSplatCount=0, splatOnHover=false.


### 5. FluidStick

Fluid where dye "sticks" to a mask shape (text or SVG path).

\`\`\`svelte
&lt;script&gt;
  import { FluidStick } from 'svelte-fluid';
&lt;/script&gt;

&lt;FluidStick text="HELLO" font="bold 120px sans-serif" /&gt;
\`\`\`

**Props**: All FluidConfig fields plus:

| Prop                  | Type                              | Default                | Description                                 |
|-----------------------|-----------------------------------|------------------------|---------------------------------------------|
| text                  | string                            | —                      | Text to render as sticky mask.              |
| font                  | string                            | 'bold 72px sans-serif' | CSS font string for text mode.              |
| d                     | string                            | —                      | SVG path data (takes precedence over text). |
| maskViewBox           | [number,number,number,number]     | [0,0,100,100]          | viewBox for path mode.                      |
| maskFillRule          | 'nonzero'|'evenodd'               | 'nonzero'              | Fill rule for path mode.                    |
| maskResolution        | number                            | 512                    | Mask rasterization resolution.              |
| maskBlur              | number                            | 4                      | Blur radius on mask (mask px).              |
| maskPadding           | number                            | 0.9                    | Text fill fraction (text mode only).        |
| strength              | number                            | 0.95                   | How strongly dye persists on mask (0-1).    |
| stickyPressureAmount  | number                            | 0.15                   | Pressure to push fluid around shape.        |
| amplify               | number                            | 2.0                    | Splat intensity multiplier on mask.         |
| autoAnimate           | boolean                           | true                   | Lissajous auto-animation.                   |
| autoAnimateSpeed      | number                            | 2.0                    | Auto-animation speed multiplier.            |
| autoAnimateDuration   | number                            | 5.0                    | Seconds before auto-animation stops.        |
| width                 | number                            | —                      | Fixed width in CSS px.                      |
| height                | number                            | —                      | Fixed height in CSS px.                     |
| lazy                  | boolean                           | false                  | Defer engine until visible.                 |
| autoPause             | boolean                           | true                   | Auto-pause when not visible.                |
| class                 | string                            | —                      | Class on wrapper div.                       |
| style                 | string                            | —                      | Inline style on wrapper div.                |

Default overrides: densityDissipation=0.98, velocityDissipation=0.2,
curl=20, splatRadius=1.0, splatForce=6000, colorful=true,
shading=true, bloom=false, sunrays=false, initialSplatCount=20,
randomSplatRate=0.4, randomSplatCount=3, randomSplatSwirl=500,
randomSplatSpread=2.0, pointerInput=true, splatOnHover=true.


### 6. FluidText

Fluid confined inside text letterforms. Auto-sizes aspect ratio from text metrics.

\`\`\`svelte
&lt;script&gt;
  import { FluidText } from 'svelte-fluid';
&lt;/script&gt;

&lt;FluidText text="FLUID" height={200} /&gt;
\`\`\`

**Props**: All FluidConfig fields plus:

| Prop           | Type   | Default                                            | Description                            |
|----------------|--------|----------------------------------------------------|----------------------------------------|
| text           | string | —                                                  | Text to render. Required.              |
| font           | string | 'bold 100px "Helvetica Neue", Arial, sans-serif'  | CSS font string for mask rasterization.|
| maskResolution | number | 512                                                | Mask rasterization resolution.         |
| height         | number | —                                                  | Fixed height in CSS px.                |
| lazy           | boolean| false                                              | Defer engine until visible.            |
| autoPause      | boolean| true                                               | Auto-pause when not visible.           |
| class          | string | —                                                  | Class on wrapper div.                  |
| style          | string | —                                                  | Inline style on wrapper div.           |

Default overrides: transparent=true. Width is auto-computed from text aspect ratio.

---

## FluidConfig Interface

All fields are optional. The engine fills defaults at construction.

### Simulation

| Field                              | Type    | Default | Description                                              |
|------------------------------------|---------|---------|----------------------------------------------------------|
| simResolution                      | number  | 128     | Velocity grid resolution.                                |
| dyeResolution                      | number  | 1024    | Dye grid resolution (clamped to 512 without linear ext). |
| densityDissipation                 | number  | 1       | How fast dye fades.                                      |
| initialDensityDissipation          | number  | =densityDissipation | Initial dissipation for ramp.                |
| initialDensityDissipationDuration  | number  | 0       | Ramp duration in seconds (0=no ramp).                    |
| velocityDissipation                | number  | 0.2     | How fast velocity fades.                                 |
| pressure                           | number  | 0.8     | Pressure solver weight.                                  |
| pressureIterations                 | number  | 20      | Pressure solver iterations.                              |
| curl                               | number  | 30      | Vorticity confinement strength.                          |
| splatRadius                        | number  | 0.25    | Splat radius (NDC units).                                |
| splatForce                         | number  | 6000    | Splat impulse force.                                     |
| paused                             | boolean | false   | Pause the simulation step.                               |

### Rendering

| Field            | Type    | Default          | Description                               |
|------------------|---------|------------------|-------------------------------------------|
| shading          | boolean | true             | 3D-style shading.                         |
| colorful         | boolean | true             | Cycle pointer color over time.            |
| colorUpdateSpeed | number  | 10               | Color rotation rate (1/seconds).          |
| backColor        | RGB     | {r:0,g:0,b:0}   | Background color (0-255 CSS-style RGB).   |
| transparent      | boolean | false            | Transparent background.                   |

### Bloom

| Field           | Type    | Default | Description                |
|-----------------|---------|---------|----------------------------|
| bloom           | boolean | true    | Enable bloom effect.       |
| bloomIterations | number  | 8       | Bloom blur iterations.     |
| bloomResolution | number  | 256     | Bloom FBO resolution.      |
| bloomIntensity  | number  | 0.8     | Bloom intensity.           |
| bloomThreshold  | number  | 0.6     | Bloom luminance threshold. |
| bloomSoftKnee   | number  | 0.7     | Bloom soft-knee.           |

### Sunrays

| Field             | Type    | Default | Description              |
|-------------------|---------|---------|--------------------------|
| sunrays           | boolean | true    | Enable sunrays effect.   |
| sunraysResolution | number  | 196     | Sunrays FBO resolution.  |
| sunraysWeight     | number  | 1       | Sunrays weight.          |

### Input

| Field         | Type              | Default  | Description                                     |
|---------------|-------------------|----------|-------------------------------------------------|
| pointerInput  | boolean           | true     | Enable mouse/touch input.                       |
| pointerTarget | 'canvas'|'window' | 'canvas' | Where to attach pointer listeners.              |
| splatOnHover  | boolean           | false    | Splat on hover without click.                   |

### Initial Splats

| Field                | Type                    | Default | Description                                     |
|----------------------|-------------------------|---------|-------------------------------------------------|
| initialSplatCount    | number                  | —       | Exact count (overrides min/max).                |
| initialSplatCountMin | number                  | 5       | Min random initial splats.                      |
| initialSplatCountMax | number                  | 25      | Max random initial splats.                      |
| seed                 | number                  | —       | 32-bit PRNG seed. Auto-generated if omitted.    |
| presetSplats         | ReadonlyArray&lt;PresetSplat&gt; | —    | Hand-crafted initial splats. Construct-only.    |

### Continuous Random Splats

| Field                   | Type     | Default | Description                                       |
|-------------------------|----------|---------|---------------------------------------------------|
| randomSplatRate         | number   | 0       | Splats per second (0=disabled).                   |
| randomSplatCount        | number   | 1       | Splats per burst.                                 |
| randomSplatColor        | RGB|null | null    | Fixed color (null=random). 0-1 linear.            |
| randomSplatDx           | number   | 0       | X velocity (raw, not scaled by splatForce).       |
| randomSplatDy           | number   | 0       | Y velocity (raw). Negative=downward in DOM.       |
| randomSplatSpawnY       | number   | 0.5     | Vertical spawn center (0-1, bottom-to-top).       |
| randomSplatEvenSpacing  | boolean  | false   | Distribute splats evenly across horizontal axis.  |
| randomSplatSwirl        | number   | 0       | Tangential velocity relative to center.           |
| randomSplatSpread       | number   | 0.1     | Vertical spread of spawning.                      |

### Container Shape

| Field          | Type                  | Default | Description                                         |
|----------------|-----------------------|---------|-----------------------------------------------------|
| containerShape | ContainerShape | null | null    | Confine fluid to a geometric shape.                 |

### Glass Effect

| Field            | Type    | Default | Description                                        |
|------------------|---------|---------|----------------------------------------------------|
| glass            | boolean | false   | Enable glass vessel effect on container shape.     |
| glassThickness   | number  | 0.04    | Wall thickness in UV units.                        |
| glassRefraction  | number  | 0.4     | Refraction strength (0-1).                         |
| glassReflectivity| number  | 0.12    | Specular reflectivity / Fresnel F0 (0-1).          |
| glassChromatic   | number  | 0.15    | Chromatic aberration strength (0-1).               |

### Reveal Mode

| Field              | Type    | Default                     | Description                              |
|--------------------|---------|-----------------------------|------------------------------------------|
| reveal             | boolean | false                       | Enable reveal mode (fluid as opacity mask). |
| revealSensitivity  | number  | 0.1                         | Dye intensity multiplier.                |
| revealCurve        | number  | 0.5                         | Power exponent for alpha curve.          |
| revealCoverColor   | RGB     | {r:1, g:1, b:1}            | Cover layer color (0-1 linear).          |
| revealAccentColor  | RGB     | {r:0.05, g:0.16, b:0.32}   | Fringe accent color (0-1 linear).        |
| revealFringeColor  | RGB     | {r:0.6, g:0.7, b:0.85}     | Outer fringe color (0-1 linear).         |

### Distortion Mode

| Field              | Type              | Default | Description                                      |
|--------------------|-------------------|---------|--------------------------------------------------|
| distortion         | boolean           | false   | Enable distortion mode (velocity warps image).   |
| distortionPower    | number            | 0.4     | Warp strength (0-1).                             |
| distortionImageUrl | string            | —       | URL of image to distort.                         |
| distortionFit      | 'cover'|'contain' | 'cover' | How the image fits the canvas.                   |
| distortionScale    | number            | 1.0     | Image scale factor.                              |
| distortionBleedX   | number            | 0       | Horizontal bleed fraction (0-0.5).               |
| distortionBleedY   | number            | 0       | Vertical bleed fraction (0-0.5).                 |

### Sticky Mode

| Field           | Type       | Default | Description                                        |
|-----------------|------------|---------|----------------------------------------------------|
| sticky          | boolean    | false   | Enable sticky mode (dye clings to mask).           |
| stickyMask      | StickyMask | —       | Mask shape dye sticks to. Required when sticky=true.|
| stickyStrength  | number     | 0.9     | How strongly dissipation is reduced on mask (0-1). |
| stickyPressure  | number     | 0.15    | Pressure injected on mask to push fluid around.    |
| stickyAmplify   | number     | 0.3     | Splat intensity multiplier on mask.                |

### Boundary

| Field        | Type    | Default | Description                                          |
|--------------|---------|---------|------------------------------------------------------|
| openBoundary | boolean | false   | Open boundaries (fluid flows out instead of bouncing).|

---

## ContainerShape Union

Five variants. Coordinates: cx/cy in [0,1] (left-right, bottom-top).
Radii normalized by canvas height.

### circle
\`{ type: 'circle', cx: number, cy: number, radius: number }\`
Fluid inside a circle. Everything outside is zeroed.

### frame
\`{ type: 'frame', cx: number, cy: number, halfW: number, halfH: number,
  innerCornerRadius?: number, outerHalfW?: number, outerHalfH?: number,
  outerCornerRadius?: number }\`
Fluid everywhere *except* inside the inner rectangular cutout (picture frame).
halfW/halfH in UV space (0-1).

### roundedRect
\`{ type: 'roundedRect', cx: number, cy: number, halfW: number,
  halfH: number, cornerRadius: number }\`
Fluid *inside* a rounded rectangle. halfW/halfH in UV space.

### annulus
\`{ type: 'annulus', cx: number, cy: number, innerRadius: number,
  outerRadius: number }\`
Fluid in a ring between innerRadius and outerRadius.

### svgPath
\`{ type: 'svgPath', d?: string, text?: string, font?: string,
  viewBox?: [number,number,number,number],
  fillRule?: 'nonzero'|'evenodd', maskResolution?: number }\`
Fluid inside an SVG path or text shape. Rasterized to mask texture.
Path mode: uses Path2D(d) with viewBox mapping.
Text mode: uses ctx.fillText() with font. Centered in mask.
At least one of d or text required. d takes precedence.

---

## StickyMask Interface

Describes a mask shape for sticky mode.

| Field          | Type                              | Default                | Description                              |
|----------------|-----------------------------------|------------------------|------------------------------------------|
| d              | string                            | —                      | SVG path data string.                    |
| text           | string                            | —                      | Text to rasterize as mask.               |
| font           | string                            | 'bold 72px sans-serif' | CSS font for text mode.                  |
| viewBox        | [number,number,number,number]     | [0,0,100,100]          | viewBox for path mode.                   |
| fillRule       | 'nonzero'|'evenodd'               | 'nonzero'              | Fill rule for path mode.                 |
| maskResolution | number                            | 512                    | Rasterization resolution.                |
| blur           | number                            | 0                      | Blur radius in mask pixels.              |
| padding        | number                            | 0.9                    | Text fill fraction (text mode only).     |

At least one of d or text must be provided.

---

## FluidHandle — Imperative API

Exposed via \`bind:this\` on any component.

\`\`\`svelte
&lt;script&gt;
  import { Fluid } from 'svelte-fluid';
  let fluid;
&lt;/script&gt;

&lt;Fluid bind:this={fluid} /&gt;

&lt;button onclick={() =&gt; fluid.handle.randomSplats(5)}&gt;Splat!&lt;/button&gt;
\`\`\`

| Method / Property | Signature                                                    | Description                                |
|-------------------|--------------------------------------------------------------|--------------------------------------------|
| splat             | (x, y, dx, dy, color: RGB) =&gt; void                       | Inject a splat. Coords 0-1. Color 0-1 linear. dx/dy raw velocity. |
| randomSplats      | (count: number) =&gt; void                                  | Push N random splats onto the queue.       |
| pause             | () =&gt; void                                                | Stop animation loop. Context stays alive.  |
| resume            | () =&gt; void                                                | Restart animation loop. Idempotent.        |
| isPaused          | readonly boolean                                             | Whether the engine is currently paused.    |

---

## Presets

Pre-configured \`&lt;Fluid /&gt;\` wrappers with opinionated physics. All accept:
width, height, class, style, seed, lazy, aria-label.

| Preset          | Visual                                          | Container Shape              |
|-----------------|------------------------------------------------|------------------------------|
| LavaLamp        | Warm rising blobs in glass vessel               | roundedRect + glass          |
| Plasma          | Vivid swirling plasma ball at center            | none (full canvas)           |
| InkInWater      | Concentrated ink droplets sinking through water  | none                         |
| FrozenSwirl     | Single icy vortex that freezes in place          | circle + glass               |
| Aurora          | Northern lights ribbons drifting laterally        | none                         |
| ToroidalTempest | Violent full-spectrum storm in a ring             | annulus                      |
| CircularFluid   | Vivid swirling fluid in a circle                  | circle                       |
| FrameFluid      | Fluid around a rectangular cutout (picture frame) | frame                        |
| AnnularFluid    | Ring-vortex between two concentric circles        | annulus                      |
| SvgPathFluid    | Fluid inside an "&amp;" ampersand glyph              | svgPath (text mode)          |

---

## RGB Interface

\`{ r: number, g: number, b: number }\`

Color range depends on context:
- backColor: 0-255 (CSS-style). Normalized internally.
- presetSplats / handle.splat / randomSplatColor: 0-1 (linear). Values &gt;1 are HDR.
- revealCoverColor / revealAccentColor / revealFringeColor: 0-1 (linear).

---

## Quick Examples

### Basic Fluid
\`\`\`svelte
&lt;script&gt;
  import { Fluid } from 'svelte-fluid';
&lt;/script&gt;

&lt;div style="width: 600px; height: 400px;"&gt;
  &lt;Fluid /&gt;
&lt;/div&gt;
\`\`\`

### Fluid in a Circle
\`\`\`svelte
&lt;Fluid
  containerShape={{ type: 'circle', cx: 0.5, cy: 0.5, radius: 0.45 }}
  transparent
/&gt;
\`\`\`

### Reveal Effect
\`\`\`svelte
&lt;FluidReveal sensitivity={0.24} curve={0.5} autoReveal&gt;
  &lt;img src="/hero.jpg" alt="Hero" style="width:100%;height:100%;object-fit:cover" /&gt;
&lt;/FluidReveal&gt;
\`\`\`

### Distortion Effect
\`\`\`svelte
&lt;FluidDistortion
  src="/photo.jpg"
  strength={0.4}
  autoDistort
/&gt;
\`\`\`

### Sticky Text
\`\`\`svelte
&lt;FluidStick
  text="HELLO"
  font="bold 120px sans-serif"
  strength={0.95}
  autoAnimate
/&gt;
\`\`\`

### Fluid-Filled Text
\`\`\`svelte
&lt;FluidText text="FLUID" height={200} /&gt;
\`\`\`

### Background Fluid
\`\`\`svelte
&lt;FluidBackground exclude=".card, .nav" splatOnHover&gt;
  &lt;nav class="nav"&gt;...&lt;/nav&gt;
  &lt;main&gt;
    &lt;div class="card"&gt;Content&lt;/div&gt;
  &lt;/main&gt;
&lt;/FluidBackground&gt;
\`\`\`

### Using a Preset
\`\`\`svelte
&lt;script&gt;
  import { LavaLamp } from 'svelte-fluid';
&lt;/script&gt;

&lt;div style="width: 400px; height: 600px;"&gt;
  &lt;LavaLamp /&gt;
&lt;/div&gt;
\`\`\`

### Imperative Splat
\`\`\`svelte
&lt;script&gt;
  import { Fluid } from 'svelte-fluid';
  let fluid;

  function fireSplat() {
    fluid.handle.splat(0.5, 0.5, 1000, 0, { r: 1, g: 0.2, b: 0.1 });
  }
&lt;/script&gt;

&lt;Fluid bind:this={fluid} /&gt;
&lt;button onclick={fireSplat}&gt;Fire!&lt;/button&gt;
\`\`\`

---

## PresetSplat Interface

\`{ x: number, y: number, dx: number, dy: number, color: RGB }\`

- x, y: normalized coordinates [0,1]. x left-right, y bottom-top.
- dx, dy: raw velocity (pixels per frame). NOT scaled by splatForce.
- color: 0-1 linear RGB. Values &gt;1 are HDR (bloom highlights).

---

## Update Buckets

When props change at runtime, setConfig classifies each field:

- **Bucket A** (hot scalars): applied immediately, picked up next frame.
- **Bucket B** (keyword recompile): shading, bloom, sunrays, reveal, distortion.
- **Bucket C** (FBO rebuild): simResolution, dyeResolution, bloomResolution, bloomIterations, sunraysResolution.
- **Bucket D** (construct-only): seed, initialSplatCount*, presetSplats. Ignored after construction.

---

Generated from svelte-fluid v0.1.0 source code.
`}</pre>
</article>

<style>
	.skills {
		max-width: 90ch;
		margin: 0 auto;
		padding: 2rem 1.5rem;
	}

	pre {
		white-space: pre-wrap;
		word-wrap: break-word;
		font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
		font-size: 0.875rem;
		line-height: 1.6;
		color: #d4d4d4;
		background: #0a0a0a;
		tab-size: 4;
	}
</style>
