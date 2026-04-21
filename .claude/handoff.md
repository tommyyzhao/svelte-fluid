# Session Handoff — 2026-04-21 (session 4)

## Project

svelte-fluid — WebGL Navier-Stokes fluid simulation as a Svelte 5 component library. MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.

Repo: github.com/tommyyzhao/svelte-fluid · Branch: main · Latest commit: 3409340

## Current state

- 126 tests, all passing. 0 type errors. Build + publint clean.
- 9 presets: LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora, CircularFluid, FrameFluid, AnnularFluid, SvgPathFluid
- 5 container shapes: circle, frame (with inner+outer rounding), roundedRect, annulus, svgPath (mask texture)
- Glass post-processing layer with two models: hemisphere orb (circles) and rim (all others)
- Mouse-tracked specular: glass highlight follows cursor (always-on when glass active)
- Glass + transparent mode compatible
- 26 ADRs, 6 learning docs, architecture.md, porting-notes.md, contributing.md
- 21 demo instances on the demo page (2 hero title + 5 presets + 4 config + 5 shapes + 4 effects + 1 playground)
- Every demo card has a `</>` toggle showing copy-pasteable code snippet
- 2 extra routes: `/svelte-fluid` (fluid-filled text demo), `/svg` (SVG path test cases)
- CI runs tests + type-check + publint + build on every push. GitHub Pages auto-deploys.
- 10 GitHub topics set. README has CI, npm, downloads, bundle size, and license badges.
- Root `CONTRIBUTING.md` redirects to `docs/contributing.md`.
- Package ready for `npm publish --access public --provenance`.

## What this session built

1. **Mouse-tracked specular highlight** (`shaders.ts:265,333`, `FluidEngine.ts:1377-1382`): Replaced hardcoded `vec3(0.3, 0.7, 0.6)` light direction with `uLightScreenPos` uniform driven by `pointers[0].texcoordX/Y`. Always-on when glass is active, zero perf cost.

2. **Glass + transparent mode fix** (`FluidEngine.ts:1258`, `shaders.ts:349,419,431,467`): Checkerboard condition now fires when glass is active: `this.config.TRANSPARENT && (target == null || useGlass)`. Glass shader receives `uTransparent` uniform and outputs correct alpha per model.

3. **Playground glass controls** (`ControlPanel.svelte`, `+page.svelte`): "Glass effect" section with toggle + 4 sliders. `buildSnippet()` and `reset()` updated. Auto-sets `containerShapeType` to `'circle'` when glass toggled on without a shape.

4. **Fluid-filled hero title** (`+page.svelte`): Plain `<h1>` replaced with two Fluid instances rendering "SVELTE" + "FLUID" as svgPath text containers. Vigorous random splats, low dissipation, splatOnHover. Heading semantics via `role="heading" aria-level="1"`.

5. **`/svelte-fluid` route overhaul** (`svelte-fluid/+page.svelte`): Single-line tablet layout (row at >= 768px). Vigorous config: densityDissipation 0.01, velocityDissipation 0.01, splatForce 5000, initialSplatCount 8, randomSplatRate 4, randomSplatCount 2, randomSplatSpread 2, randomSplatSwirl 200.

6. **Code snippets on every demo card** (`Card.svelte`, `+page.svelte`): Card component gained `snippet` prop with `</>` toggle and Copy button. All 18 demo cards wired: presets show one-liners, config cards show key props, shapes show containerShape objects, glass effects show full glass + containerShape invocations.

7. **README updated for publish** (`README.md`): Feature counts corrected (9 presets, 5 shapes), props table gained 10 missing entries (containerShape, glass*, randomSplat*, autoPause), new Container shapes and Glass effect sections with code examples, Contributing section.

8. **Pre-publish polish** (`package.json`, `CONTRIBUTING.md`, `CHANGELOG.md`, `docs/contributing.md`): npm downloads + bundle size badges, 13 keywords (was 8), root CONTRIBUTING.md, CHANGELOG 0.1.0 fleshed out, stale instance counts fixed, 10 GitHub topics added, homepage points to demo site.

## Key files

| File | Role |
|------|------|
| src/lib/engine/FluidEngine.ts (~1600 LOC) | The engine: WebGL state, physics step, render, dispose, mask texture, glass pass, splatOnHover |
| src/lib/Fluid.svelte (~400 LOC) | Svelte wrapper: DOM, ResizeObserver, adaptive resolution, lazy/autoPause |
| src/lib/engine/gl-utils.ts | WebGL utilities: Material class, FBO create/resize/dispose, shader compile |
| src/lib/engine/shaders.ts | All GLSL shader sources (22 shaders + glass shader + container mask branches) |
| src/lib/engine/types.ts | FluidConfig (incl. glass + svgPath), ContainerShape (5 variants), FluidHandle |
| src/lib/engine/container-shapes.ts | TypeScript SDF mirrors, MaskContext, containerMask(), maskAreaFraction() |
| src/lib/presets/*.svelte (9 files) | Preset wrapper components (incl. SvgPathFluid) |
| src/routes/+page.svelte | Demo page with 21 instances, code snippets on every card |
| src/routes/components/Card.svelte | Demo card with optional snippet toggle + Copy button |
| src/routes/components/ControlPanel.svelte | Playground control panel with buildSnippet + glass controls |
| src/routes/svelte-fluid/+page.svelte | Fluid-filled "SVELTE FLUID" text demo (one-line tablet layout) |
| docs/architecture.md | Start here for understanding the system |
| docs/decisions/README.md | Index of 26 ADRs |

## What needs attention next

### Planned features

1. **npm publish** — package is ready. Run `npm publish --access public --provenance`. Create a GitHub release with tag `v0.1.0` afterward.

2. **Visual tuning of glass defaults** — the effect works but default parameter values were tuned analytically, not by eye. Needs visual iteration across different presets and backgrounds.

3. **Changesets setup** — every successful Svelte library uses `@changesets/cli` for automated CHANGELOG + npm publish + GitHub releases. This is the #1 operational gap for ongoing maintenance.

### Known issues

4. **21 demo instances** — exceeds browser's ~16 WebGL context limit. Lazy loading mitigates but fast scrolling can still hit the cap. The 2 hero title instances are always-visible (not lazy).
5. **Black void between sections** — lazy canvases tear down to black against black page background. A placeholder/skeleton for torn-down cards would fix this.
6. **`glassThickness` unused for circles** — hemisphere model covers the full surface. Document this or repurpose the prop.

### Follow-ups

7. **Test gaps** — no WebGL context loss tests, no engine unit tests, no splat/disposal tests. Glass has zero automated tests (shader logic untestable without WebGL).
8. **SDF texture upgrade** — for higher-quality svgPath glass, generate an SDF texture via EDT instead of binary mask + LINEAR filtering.
9. **Named glass presets** — `glass="crystal"`, `glass="frosted"`, `glass="orb"` for better DX.
10. **Interior tint** — glass color tint that deepens toward center (longer optical path).
11. **Animated specular drift** — slow sinusoidal light direction wobble when cursor is idle. Nearly free (one sin/cos per frame).

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
- Both use the same `CONTAINER_MASK` keyword for display shader compilation.
- Material class caches compiled shader variants by sorted keyword string key.
- Context loss/restore: handled via webglcontextlost/webglcontextrestored events. dispose() does NOT call loseContext().
- `splatOnHover`: handleMouseMove auto-inits pointer on first hover, handleMouseLeave resets.
- Demo page: 21 instances (2 hero title + 5 presets + 4 config w/ splatOnHover + 5 shapes + 4 effects + 1 playground). Every card has a `</>` code snippet toggle. Playground has glass controls with auto-shape.
