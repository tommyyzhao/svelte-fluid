# Session Handoff — 2026-04-22 (session 7)

## Project

svelte-fluid — WebGL Navier-Stokes fluid simulation as a Svelte 5 component library. MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.

Repo: github.com/tommyyzhao/svelte-fluid · Branch: main · Latest commit: 03d858f

## Current state

- 135 tests, all passing. 0 type errors. Build + publint clean.
- 9 presets: LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora, CircularFluid, FrameFluid, AnnularFluid, SvgPathFluid
- 5 container shapes: circle, frame (with inner+outer rounding), roundedRect, annulus, svgPath (mask texture)
- Glass post-processing layer with two models: hemisphere orb (circles) and rim (all others)
- Mouse-tracked specular: glass highlight follows cursor (always-on when glass active)
- FluidBackground component: full-viewport fluid with DOM exclusion zones via CSS selector
- FluidReveal component: fluid as opacity mask over slotted content (see "what needs attention next" — revision planned)
- `/ascend-fluid` route: standalone reference replication, completely decoupled from FluidEngine
- 28 ADRs, 6 learning docs, architecture.md, porting-notes.md, contributing.md
- 31 demo instances on the main page
- Every demo card has a `</>` toggle showing copy-pasteable code snippet
- 5 extra routes: `/background-fluid`, `/fluid-reveal/`, `/svelte-fluid`, `/svg`, `/ascend-fluid`
- CI runs tests + type-check + publint + build on every push. GitHub Pages auto-deploys.
- Package ready for `npm publish --access public --provenance`.

## What this session built

1. **FluidReveal CSS sizing fix** (`FluidReveal.svelte`): Added `width: 100%; height: 100%` to `.svelte-fluid-reveal` and `.svelte-fluid-reveal__content`. Without this, the component collapsed to content intrinsic height instead of filling its parent container (e.g., the Card's 240px slot). The mosaic card partially worked because its grid tiles had intrinsic height; the other 3 cards appeared empty.

2. **Lazy teardown releases WebGL context slots** (`Fluid.svelte`): Added `loseContext()` via `WEBGL_lose_context` extension after `engine.dispose()` during lazy teardown. Before this fix, all 27 canvases kept their context slots even when disposed, exhausting the browser's ~16 cap and causing the Reveal section (near the page bottom) to lose contexts. Implementation details:
   - `teardown()`: captures the extension ref while context is alive, disposes engine, adds a one-time `webglcontextlost` listener calling `preventDefault()` (required by spec for later restore), then calls `loseContext()`.
   - `instantiate()`: if `savedLoseExt` exists, calls `restoreContext()`, listens for `webglcontextrestored` event, then retries via `reconcile()`.
   - Active contexts dropped from 22 to ~8 (only visible instances).

3. **FluidReveal physics tuning** (`FluidReveal.svelte`): Changed defaults to match Ascend-Fluid reference for clean, laminar reveals:
   - `curl`: 15 → 0 (no vorticity injection — eliminated turbulent swirls)
   - `velocityDissipation`: 0.3 → 3 (≈95% retention/frame, matches reference's multiplicative 0.9)
   - `pointerInput`: true → false (engine pointer handling disabled)
   - `splatOnHover`: true → false (handled manually)

4. **FluidReveal manual pointer handling** (`FluidReveal.svelte`): Component now tracks `pointermove` and `pointerleave` events itself and calls `handle.splat()` with uniform gray `{ r: 0.15, g: 0.15, b: 0.15 }`. This replaces the engine's random-color `generateColor()`, ensuring `max(r,g,b)` produces spatially consistent alpha in the reveal mask.

5. **`/ascend-fluid` standalone route** (`src/routes/ascend-fluid/+page.svelte`): Direct port of Ascend-Fluid's reveal effect. Zero dependency on FluidEngine — its own raw WebGL fluid sim. Includes:
   - Same 6 shaders as reference (vertex, advection, divergence, pressure, gradient subtraction, splat, display)
   - Same physics: no curl, multiplicative dissipation (0.995 density, 0.9 velocity), 10 pressure iterations
   - Same display shader: `vec4(1-C, 1-a)` with `a = pow(0.1 * max_channel, 0.1)`
   - Same auto-animation (Lissajous pattern before first interaction)
   - tsParticles loaded from CDN with the reference's color palette
   - Text + gradient content behind the fluid canvas

6. **CHANGELOG + architecture.md updates**: Documented all changes. Architecture.md now describes the `loseContext()` mechanism in the lazy teardown section.

## Critical insight from this session

**The FluidReveal implementation needs a deeper revision.** Building the standalone `/ascend-fluid` route revealed that our FluidEngine is fundamentally different from the reference in ways that can't be fixed by tuning parameters:

| Aspect | Reference (Ascend-Fluid) | Our FluidEngine |
|--------|--------------------------|-----------------|
| Dissipation formula | Multiplicative: `result *= dissipation` | Divisor: `result /= (1 + dissipation * dt)` |
| Physics pipeline | splat → divergence → pressure → grad subtract → advect | Same + curl + vorticity steps |
| Pressure iterations | 10 | 20 (configurable) |
| Pointer velocity | Raw pixel deltas (`5 * pixelDelta`) | Normalized + SPLAT_FORCE + aspect correction |
| Splat color | Single fixed color for all splats | Random HSV per interaction via `generateColor()` |
| Display shader | One shader, always reveal mode | Complex #ifdef branches (SHADING, BLOOM, etc.) |
| Canvas DPR | 1:1 with CSS (`canvas.width = clientWidth`) | Scaled by `devicePixelRatio` |

**The user's plan for next session:** Revise the canonical `<FluidReveal>` component and the demo page Reveal presets to align with the reference. The `/ascend-fluid` route serves as the benchmark.

## Key files

| File | Role |
|------|------|
| src/lib/engine/FluidEngine.ts (~1620 LOC) | The engine: WebGL state, physics step, render, dispose, mask texture, glass pass, reveal path, splatOnHover |
| src/lib/Fluid.svelte (~420 LOC) | Svelte wrapper: DOM, ResizeObserver, adaptive resolution, lazy/autoPause, context slot management |
| src/lib/FluidReveal.svelte (~300 LOC) | Fluid as opacity mask: CSS layering, manual pointer handling, convenience props, auto-reveal Lissajous |
| src/lib/FluidBackground.svelte (~180 LOC) | Full-viewport fluid background with DOM exclusion via CSS selector |
| src/lib/engine/gl-utils.ts | WebGL utilities: Material class (keyword shader variants), FBO create/resize/dispose, shader compile |
| src/lib/engine/shaders.ts | All GLSL shader sources (22 shaders + glass shader + REVEAL branch + container mask branches) |
| src/lib/engine/types.ts | FluidConfig (incl. glass + svgPath + reveal), ContainerShape (5 variants), FluidHandle |
| src/lib/engine/pointer.ts | Pointer state, updatePointerDownData/MoveData, aspect-corrected deltas |
| src/lib/engine/container-shapes.ts | TypeScript SDF mirrors, MaskContext, containerMask(), maskAreaFraction() |
| src/routes/ascend-fluid/+page.svelte (~500 LOC) | Standalone reference replication — raw WebGL, no FluidEngine |
| src/routes/+page.svelte | Demo page with 31 instances, FluidBackground wrapper, code snippets on every card |
| docs/architecture.md | Start here for understanding the system |

## What needs attention next

### Immediate (user-requested)

1. **Revise `<FluidReveal>` to match `/ascend-fluid` reference** — The canonical FluidReveal component still uses our FluidEngine with parameter tuning. The `/ascend-fluid` standalone route proves that the reference's minimal solver produces cleaner results. Options:
   a) Build a lightweight, purpose-built reveal solver (separate from FluidEngine) that uses multiplicative dissipation, no curl, raw pixel velocity, fixed splat color
   b) Or refactor FluidEngine to support a "reveal mode" that switches to the reference's physics
   c) The user will decide the approach next session

2. **Revise demo page Reveal section** — The 4 reveal cards should use the revised FluidReveal and look as clean as `/ascend-fluid`.

3. **Investigate cursor y-inversion on presets** — User reports splats spawn with inverted y-direction/position on preset cards. Investigation found pointer code looks correct (texcoord-based deltas with proper y-flip), but the bug needs visual debugging. Possible causes: DPR rounding in `scaleByPixelRatio`, aspect ratio correction in `correctDeltaY`, or an issue specific to certain canvas sizes.

### Planned features

4. **npm publish** — Package is ready. Run `npm publish --access public --provenance`. Create a GitHub release with tag `v0.1.0`.

5. **6th preset ("Tempest")** — Chaotic storm swirl on dark background. Fills the "turbulent decay" gap.

6. **Test gaps** — Priority 1: dispose() cleanup, setConfig() bucket transitions, context loss/restore. Priority 2: FluidBackground DOM exclusion, glass post-processing.

7. **Changesets setup** — `@changesets/cli` for automated CHANGELOG + npm publish + GitHub releases.

### Known issues

8. **31 demo instances + background** — Exceeds browser's ~16 WebGL context limit. The loseContext() fix in lazy teardown now properly releases slots, but fast scrolling can still briefly exceed the cap.
9. **FluidReveal pointer-events limitation** — Canvas sits above content; interactive elements can't receive clicks. Documented in JSDoc.
10. **`glassThickness` unused for circles** — Hemisphere model covers the full surface.
11. **Presets section has 5 items** — Odd count in 2-column grid. Tempest preset would fix this.

### Follow-ups

12. **Visual tuning of glass defaults** — Parameters were tuned analytically, not by eye.
13. **Named glass presets** — `glass="crystal"`, `glass="frosted"`, `glass="orb"`.
14. **Animated specular drift** — Slow sinusoidal light direction wobble when cursor is idle.
15. **FluidReveal interactive content** — Proper event forwarding so revealed buttons/links work.

## Architecture quick-reference

- Engine is per-instance, no module-level mutable state. Each canvas gets its own WebGL context.
- Fluid.svelte applies adaptive resolution in instantiate() before constructing the engine — caps textures to canvas pixel size, suppresses expensive effects on small canvases.
- Resize: teardown immediately (blank canvas), debounce rebuild by 150ms.
- Lazy teardown: dispose engine + loseContext() (releases browser context slot). Rebuild: restoreContext() + wait for webglcontextrestored event + create new engine. The engine's dispose() itself does NOT call loseContext() (invariant) — the Svelte component manages it.
- setConfig() has 4 buckets: A (scalars incl. splatOnHover, glass params, reveal params — picked up next frame), B (keyword recompile — shading, bloom, sunrays, reveal), C (FBO rebuild), D (construct-only). Additionally, svgPath shape changes trigger mask texture rebuild, `glass` toggle triggers sceneFBO alloc/dispose, and `reveal` toggle triggers keyword recompile.
- Container shapes: two approaches coexist:
  - **Analytical** (circle/frame/roundedRect/annulus): SDF computed per-fragment in shaders, mirrored in TypeScript for rejection sampling.
  - **Mask texture** (svgPath): rasterized via OffscreenCanvas at canvas aspect ratio, uploaded as R8/LUMINANCE texture.
- Glass post-processing: two models (hemisphere orb for circles, rim for others). Mouse-tracked specular, transparent mode support.
- Reveal mode: REVEAL keyword in display shader. Premultiplied alpha output `vec4(cover * alpha, alpha)`. Render path skips backColor/checkerboard/glass. CONTAINER_MASK interaction: `coverAlpha *= cmask` (outside shape = transparent). Auto-reveal is component-level Lissajous via handle.splat().
- FluidReveal now handles pointer events itself (pointerInput=false on engine), injecting uniform-color splats to avoid dye pattern artifacts.
- Transparent mode: `gl.clear(0,0,0,0)` replaces checkerboard. Canvas CSS background = transparent.
- FluidBackground: evenodd SVG path mask. Outer rect = viewport, inner rounded-rect holes = excluded elements. 80ms throttled rebuilds.
- Material class caches compiled shader variants by sorted keyword string key.
- Context loss/restore: handled via webglcontextlost/webglcontextrestored events in the engine. dispose() does NOT call loseContext() — the Svelte component does it separately for lazy instances.
- Demo page: `<main>` has `pointer-events: none`; interactive elements re-enable individually so FluidBackground splats work across full page width.
