# Session Handoff — 2026-04-22 (session 6)

## Project

svelte-fluid — WebGL Navier-Stokes fluid simulation as a Svelte 5 component library. MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.

Repo: github.com/tommyyzhao/svelte-fluid · Branch: main · Latest commit: 4af3b3a

## Current state

- 135 tests, all passing. 0 type errors. Build + publint clean.
- 9 presets: LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora, CircularFluid, FrameFluid, AnnularFluid, SvgPathFluid
- 5 container shapes: circle, frame (with inner+outer rounding), roundedRect, annulus, svgPath (mask texture)
- Glass post-processing layer with two models: hemisphere orb (circles) and rim (all others)
- Mouse-tracked specular: glass highlight follows cursor (always-on when glass active)
- FluidBackground component: full-viewport fluid with DOM exclusion zones via CSS selector
- FluidReveal component: fluid as opacity mask over slotted content with auto-reveal animation
- 28 ADRs, 6 learning docs, architecture.md, porting-notes.md, contributing.md
- 31 demo instances on the main page (1 background + 2 hero title + 5 presets + 4 config + 6 shapes + 4 effects + 4 reveal + 1 playground + 4 section headers with text)
- Every demo card has a `</>` toggle showing copy-pasteable code snippet
- 4 extra routes: `/background-fluid`, `/fluid-reveal/`, `/svelte-fluid`, `/svg`
- CI runs tests + type-check + publint + build on every push. GitHub Pages auto-deploys.
- Package ready for `npm publish --access public --provenance`.

## What this session built

1. **`<FluidReveal>` component** (`src/lib/FluidReveal.svelte`): Fluid simulation as opacity mask over slotted content. Cursor movement injects dye → REVEAL display shader converts dye intensity to premultiplied alpha → content below becomes visible. Props: `coverColor` (0-255 RGB), `sensitivity` (dye multiplier), `curve` (power exponent), `fadeBack` (boolean convenience for dissipation), `fadeSpeed` (explicit dissipation override), `autoReveal` (Lissajous pre-interaction animation), `autoRevealSpeed`, `lazy`, `autoPause`. Wraps `<Fluid>` like FluidBackground does. Exported from package.

2. **`REVEAL` engine display mode** (`FluidEngine.ts`, `shaders.ts`, `types.ts`): New `REVEAL` keyword in display shader. Config fields: `reveal` (Bucket B — keyword recompile), `revealCoverColor`/`revealSensitivity`/`revealCurve` (Bucket A — hot uniforms). Render path: skips backColor, checkerboard, glass; disables blend; outputs premultiplied `vec4(coverColor * coverAlpha, coverAlpha)`. CONTAINER_MASK interaction: `coverAlpha *= cmask` so outside shape = transparent, inside = cover with reveal.

3. **True transparent mode** (`FluidEngine.ts`, `Fluid.svelte`): Replaced checkerboard draw with `gl.clear(0,0,0,0)` when `transparent: true`. Canvas CSS `background` automatically set to `transparent` when `transparent` or `reveal` is active (inline style override in Fluid.svelte). Enables proper alpha compositing with the page.

4. **Hero title transparency** (`+page.svelte`): "SVELTE FLUID" text instances now use `transparent` mode — fluid-filled letters composite directly over the FluidBackground with no opaque rectangle.

5. **Demo page pointer-events fix** (`+page.svelte`): `<main>` set to `pointer-events: none` so FluidBackground splats work across the full page. Only interactive elements re-enable: `.hero-word`, `.header-links`, `.get-started`, `.grid-2col`, `.playground-section`.

6. **`/fluid-reveal/` demo route** (`src/routes/fluid-reveal/+page.svelte`): 5 test instances: default (black cover, fade-back), custom cover color + permanent reveal, auto-reveal animation, soft reveal (high curve), circular container shape reveal zone.

7. **Reveal section on main demo page** (`+page.svelte`): 4 cards with code snippets: "Scratch to reveal", "Permanent reveal", "Auto-reveal", "Soft reveal". All lazy.

8. **ADR-0027** (`docs/decisions/0027-fluid-reveal-mode.md`): Documents reveal shader math, premultiplied alpha, CONTAINER_MASK interaction, render path, auto-reveal as component-level, glass incompatibility.

9. **9 new tests** (`src/lib/engine/__tests__/reveal.test.ts`): Alpha curve math mirror (zero/high/clamped dye, sensitivity/curve controls, linear behavior, premultiplied invariant), cover color normalization.

10. **Review fixes**: Auto-reveal race condition (retries if inner ref not bound), FluidRevealProps added lazy/autoPause, densityDissipation destructured to prevent spread override, main page reveal cards use lazy.

## Key files

| File | Role |
|------|------|
| src/lib/engine/FluidEngine.ts (~1620 LOC) | The engine: WebGL state, physics step, render, dispose, mask texture, glass pass, reveal path, splatOnHover |
| src/lib/Fluid.svelte (~410 LOC) | Svelte wrapper: DOM, ResizeObserver, adaptive resolution, lazy/autoPause, transparent canvas bg |
| src/lib/FluidReveal.svelte (~260 LOC) | Fluid as opacity mask: CSS layering, convenience props, auto-reveal Lissajous, handle forwarding |
| src/lib/FluidBackground.svelte (~180 LOC) | Full-viewport fluid background with DOM exclusion via CSS selector |
| src/lib/engine/gl-utils.ts | WebGL utilities: Material class (keyword shader variants), FBO create/resize/dispose, shader compile |
| src/lib/engine/shaders.ts | All GLSL shader sources (22 shaders + glass shader + REVEAL branch + container mask branches) |
| src/lib/engine/types.ts | FluidConfig (incl. glass + svgPath + reveal), ContainerShape (5 variants), FluidHandle |
| src/lib/engine/container-shapes.ts | TypeScript SDF mirrors, MaskContext, containerMask(), maskAreaFraction() |
| src/lib/presets/*.svelte (9 files) | Preset wrapper components (shape presets accept splatOnHover) |
| src/routes/+page.svelte | Demo page with 31 instances, FluidBackground wrapper, code snippets on every card |
| src/routes/fluid-reveal/+page.svelte | FluidReveal demo with 5 test instances |
| src/routes/components/Card.svelte | Demo card with optional snippet toggle + Copy button |
| docs/architecture.md | Start here for understanding the system |

## What needs attention next

### Planned features

1. **npm publish** — package is ready. Run `npm publish --access public --provenance`. Create a GitHub release with tag `v0.1.0` afterward.

2. **6th preset ("Tempest")** — chaotic storm swirl on dark background. Fills the "turbulent decay" gap: `curl: 35`, `densityDissipation: 0.3`, `velocityDissipation: 0.5`, cool purple/blue/teal palette. Would make presets section symmetric (6 cards).

3. **Test gaps** — Priority 1: dispose() cleanup (mock GL, ~20-30 cases), setConfig() bucket transitions (~30-40 cases), context loss/restore (~15-20 cases). Priority 2: FluidBackground DOM exclusion, glass post-processing. Recommended approach: mock GL for state machines, headless-gl for integration if warranted.

4. **Changesets setup** — `@changesets/cli` for automated CHANGELOG + npm publish + GitHub releases. The #1 operational gap for ongoing maintenance.

### Known issues

5. **31 demo instances + background** — exceeds browser's ~16 WebGL context limit. Lazy loading mitigates but fast scrolling can still hit the cap. The 2 hero title instances + 1 background are always-visible (not lazy).
6. **FluidReveal pointer-events limitation** — canvas sits above content for alpha compositing, so interactive elements (buttons, links) in children can't receive clicks. Documented in JSDoc. Workaround: `pointerInput={false}` + manual `handle.splat()`. Proper fix requires event forwarding architecture.
7. **`glassThickness` unused for circles** — hemisphere model covers the full surface.
8. **Presets section has 5 items** — odd count in 2-column grid (Aurora sits alone). The Tempest preset would fix this.

### Follow-ups

9. **Visual tuning of glass defaults** — parameters were tuned analytically, not by eye.
10. **Named glass presets** — `glass="crystal"`, `glass="frosted"`, `glass="orb"` for better DX.
11. **Animated specular drift** — slow sinusoidal light direction wobble when cursor is idle.
12. **FluidBackground worker offload** — move mask rasterization to a Web Worker.
13. **SDF texture upgrade** — for svgPath glass, generate SDF texture via EDT instead of binary mask.
14. **FluidReveal interactive content** — proper event forwarding so revealed buttons/links work.

## Architecture quick-reference

- Engine is per-instance, no module-level mutable state. Each canvas gets its own WebGL context.
- Fluid.svelte applies adaptive resolution in instantiate() before constructing the engine — caps textures to canvas pixel size, suppresses expensive effects on small canvases.
- Resize: teardown immediately (blank canvas), debounce rebuild by 150ms.
- setConfig() has 4 buckets: A (scalars incl. splatOnHover, glass params, reveal params — picked up next frame), B (keyword recompile — shading, bloom, sunrays, reveal), C (FBO rebuild), D (construct-only). Additionally, svgPath shape changes trigger mask texture rebuild, `glass` toggle triggers sceneFBO alloc/dispose, and `reveal` toggle triggers keyword recompile.
- Container shapes: two approaches coexist:
  - **Analytical** (circle/frame/roundedRect/annulus): SDF computed per-fragment in shaders, mirrored in TypeScript for rejection sampling.
  - **Mask texture** (svgPath): rasterized via OffscreenCanvas at canvas aspect ratio, uploaded as R8/LUMINANCE texture.
- Glass post-processing: two models (hemisphere orb for circles, rim for others). Mouse-tracked specular, transparent mode support.
- Reveal mode: REVEAL keyword in display shader. Premultiplied alpha output `vec4(cover * alpha, alpha)`. Render path skips backColor/checkerboard/glass. CONTAINER_MASK interaction: `coverAlpha *= cmask` (outside shape = transparent). Auto-reveal is component-level Lissajous via handle.splat().
- Transparent mode: `gl.clear(0,0,0,0)` replaces checkerboard. Canvas CSS background = transparent. Enables proper alpha compositing with page.
- FluidBackground: evenodd SVG path mask. Outer rect = viewport, inner rounded-rect holes = excluded elements. 80ms throttled rebuilds.
- FluidReveal: wraps `<Fluid>` with CSS layering (content z:0, canvas z:1). Convenience props map to engine config. Auto-reveal is a RAF loop calling handle.splat() with Lissajous coordinates.
- Material class caches compiled shader variants by sorted keyword string key.
- Context loss/restore: handled via webglcontextlost/webglcontextrestored events. dispose() does NOT call loseContext().
- Demo page: `<main>` has `pointer-events: none`; interactive elements re-enable individually so FluidBackground splats work across full page width.
