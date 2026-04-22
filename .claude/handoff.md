# Session Handoff — 2026-04-22 (session 5)

## Project

svelte-fluid — WebGL Navier-Stokes fluid simulation as a Svelte 5 component library. MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.

Repo: github.com/tommyyzhao/svelte-fluid · Branch: main · Latest commit: 796b17b

## Current state

- 126 tests, all passing. 0 type errors. Build + publint clean.
- 9 presets: LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora, CircularFluid, FrameFluid, AnnularFluid, SvgPathFluid
- 5 container shapes: circle, frame (with inner+outer rounding), roundedRect, annulus, svgPath (mask texture)
- Glass post-processing layer with two models: hemisphere orb (circles) and rim (all others)
- Mouse-tracked specular: glass highlight follows cursor (always-on when glass active)
- FluidBackground component: full-viewport fluid with DOM exclusion zones via CSS selector
- 27 ADRs, 6 learning docs, architecture.md, porting-notes.md, contributing.md
- 23 demo instances on the main page (1 background + 2 hero title + 5 presets + 4 config + 6 shapes + 4 effects + 1 playground)
- Every demo card has a `</>` toggle showing copy-pasteable code snippet
- 3 extra routes: `/background-fluid` (FluidBackground demo), `/svelte-fluid` (fluid-filled text), `/svg` (SVG path test cases)
- CI runs tests + type-check + publint + build on every push. GitHub Pages auto-deploys.
- Package ready for `npm publish --access public --provenance`.

## What this session built

1. **`<FluidBackground>` component** (`src/lib/FluidBackground.svelte`): Full-viewport fluid canvas behind page content with automatic DOM exclusion. Accepts `exclude` CSS selector — matched elements become "holes" the fluid physically cannot enter. Uses evenodd SVG path via existing `svgPath` container shape (zero engine changes). Throttled mask rebuilds (80ms), MutationObserver for dynamic DOM, background-optimized defaults (`simResolution: 64`, `dyeResolution: 512`, `initialSplatCount: 0`). Exported from package.

2. **`/background-fluid` demo route** (`src/routes/background-fluid/+page.svelte`): Prototype page using FluidBackground with 6 feature cards + 5 embedded preset demos (LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora). Turbulent cursor-only fluid background (`curl: 50`, `velocityDissipation: 0.3`). Cards excluded via `exclude=".card, .preset-card"`.

3. **FluidBackground on main demo page** (`src/routes/+page.svelte`): Wrapped the entire main page with `<FluidBackground exclude=".card, .get-started, .playground-canvas, .panel">`. Cursor-only splats in the margins. All interactive content has `pointer-events: auto`.

4. **Rounded rect shape card** (`+page.svelte`): New "Rounded rect" card in Container shapes section using `containerShape: { type: 'roundedRect', cx: 0.5, cy: 0.5, halfW: 0.35, halfH: 0.35, cornerRadius: 0.08 }`. Shapes section now has 6 cards (was 5) for symmetric 2-column layout.

5. **`splatOnHover` on shape presets** (`CircularFluid.svelte`, `FrameFluid.svelte`, `AnnularFluid.svelte`, `SvgPathFluid.svelte`): All 4 shape preset components now accept and forward the `splatOnHover` prop. All shape demo cards on the main page use it.

6. **ADR-0026** (`docs/decisions/0026-background-fluid-component.md`): Documents the evenodd SVG path approach, coordinate mapping (viewBox matches viewport CSS pixels, Y-flip via mask shader), throttling strategy, performance analysis, pointer-events pattern, and alternatives considered.

## Key files

| File | Role |
|------|------|
| src/lib/engine/FluidEngine.ts (~1600 LOC) | The engine: WebGL state, physics step, render, dispose, mask texture, glass pass, splatOnHover |
| src/lib/Fluid.svelte (~400 LOC) | Svelte wrapper: DOM, ResizeObserver, adaptive resolution, lazy/autoPause |
| src/lib/FluidBackground.svelte (~180 LOC) | Full-viewport fluid background with DOM exclusion via CSS selector |
| src/lib/engine/gl-utils.ts | WebGL utilities: Material class, FBO create/resize/dispose, shader compile |
| src/lib/engine/shaders.ts | All GLSL shader sources (22 shaders + glass shader + container mask branches) |
| src/lib/engine/types.ts | FluidConfig (incl. glass + svgPath), ContainerShape (5 variants), FluidHandle |
| src/lib/engine/container-shapes.ts | TypeScript SDF mirrors, MaskContext, containerMask(), maskAreaFraction() |
| src/lib/presets/*.svelte (9 files) | Preset wrapper components (shape presets now accept splatOnHover) |
| src/routes/+page.svelte | Demo page with 23 instances, FluidBackground wrapper, code snippets on every card |
| src/routes/background-fluid/+page.svelte | FluidBackground demo with feature cards + embedded presets |
| src/routes/components/Card.svelte | Demo card with optional snippet toggle + Copy button |
| src/routes/components/ControlPanel.svelte | Playground control panel with buildSnippet + glass controls |
| docs/architecture.md | Start here for understanding the system |
| docs/decisions/README.md | Index of 27 ADRs |

## What needs attention next

### Planned features

1. **npm publish** — package is ready. Run `npm publish --access public --provenance`. Create a GitHub release with tag `v0.1.0` afterward.

2. **Visual tuning of glass defaults** — the effect works but default parameter values were tuned analytically, not by eye. Needs visual iteration across different presets and backgrounds.

3. **Changesets setup** — every successful Svelte library uses `@changesets/cli` for automated CHANGELOG + npm publish + GitHub releases. This is the #1 operational gap for ongoing maintenance.

### Known issues

4. **23 demo instances + background** — exceeds browser's ~16 WebGL context limit. Lazy loading mitigates but fast scrolling can still hit the cap. The 2 hero title instances + 1 background are always-visible (not lazy).
5. **Presets section has 5 items** — odd count in 2-column grid (Aurora sits alone). Consider adding a 6th preset for symmetry.
6. **`glassThickness` unused for circles** — hemisphere model covers the full surface. Document this or repurpose the prop.
7. **FluidBackground cursor interaction on main demo** — `pointer-events: auto` on `main` means cursor splats only work in the narrow side margins outside the 1100px content area. Consider whether this is sufficient or if a more granular pointer-events approach is warranted.

### Follow-ups

8. **Test gaps** — no WebGL context loss tests, no engine unit tests, no splat/disposal tests. Glass and FluidBackground have zero automated tests.
9. **SDF texture upgrade** — for higher-quality svgPath glass, generate an SDF texture via EDT instead of binary mask + LINEAR filtering.
10. **Named glass presets** — `glass="crystal"`, `glass="frosted"`, `glass="orb"` for better DX.
11. **Animated specular drift** — slow sinusoidal light direction wobble when cursor is idle. Nearly free (one sin/cos per frame).
12. **FluidBackground worker offload** — move mask rasterization (Canvas2D + getImageData) to a Web Worker for zero-jank scroll updates.

## Architecture quick-reference

- Engine is per-instance, no module-level mutable state. Each canvas gets its own WebGL context.
- Fluid.svelte applies adaptive resolution in instantiate() before constructing the engine — caps textures to canvas pixel size, suppresses expensive effects on small canvases.
- Resize: teardown immediately (blank canvas), debounce rebuild by 150ms.
- setConfig() has 4 buckets: A (scalars incl. splatOnHover, glass params, picked up next frame), B (keyword recompile), C (FBO rebuild), D (construct-only). Additionally, svgPath shape changes trigger mask texture rebuild, and `glass` toggle triggers sceneFBO alloc/dispose.
- Container shapes: two approaches coexist:
  - **Analytical** (circle/frame/roundedRect/annulus): SDF computed per-fragment in shaders, mirrored in TypeScript for rejection sampling.
  - **Mask texture** (svgPath): rasterized via OffscreenCanvas at canvas aspect ratio, uploaded as R8/LUMINANCE texture.
- Glass post-processing: two models coexist:
  - **Hemisphere orb** (circles): Snell's law refract() with hemisphere normal, full-surface Fresnel + chromatic aberration + fluid-driven specular.
  - **Rim** (all others): SDF boundary band, central-difference normals, chromatic rim refraction.
  - **Mouse-tracked specular**: `uLightScreenPos` uniform from `pointers[0]`, always-on.
  - **Transparent mode**: `uTransparent` uniform controls alpha output per model.
- FluidBackground: evenodd SVG path mask. Outer rect = viewport, inner rounded-rect holes = excluded elements. 80ms throttled rebuilds on scroll/resize/mutation. Zero engine changes — reuses svgPath container shape pipeline.
- Both use the same `CONTAINER_MASK` keyword for display shader compilation.
- Material class caches compiled shader variants by sorted keyword string key.
- Context loss/restore: handled via webglcontextlost/webglcontextrestored events. dispose() does NOT call loseContext().
- `splatOnHover`: handleMouseMove auto-inits pointer on first hover, handleMouseLeave resets.
- Demo page: 23 instances (1 background + 2 hero title + 5 presets + 4 config w/ splatOnHover + 6 shapes w/ splatOnHover + 4 effects + 1 playground). Every card has a `</>` code snippet toggle. Playground has glass controls with auto-shape.
