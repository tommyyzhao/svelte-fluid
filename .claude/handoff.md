# Session Handoff — 2026-04-23 (session 8)

## Project

svelte-fluid — WebGL Navier-Stokes fluid simulation as a Svelte 5 component library. MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.

Repo: github.com/tommyyzhao/svelte-fluid · Branch: main · Latest commit: 96f5bd6

## Current state

- 134 tests, all passing. 0 type errors. Build + publint clean.
- 9 presets: LavaLamp (glass+roundedRect), Plasma (annulus), InkInWater (dark water+bloom), FrozenSwirl (circle), Aurora, CircularFluid, FrameFluid, AnnularFluid, SvgPathFluid (ampersand glyph)
- 5 container shapes: circle, frame, roundedRect, annulus, svgPath (mask texture)
- Glass post-processing: hemisphere dome (circles, now with rim effects via glassThickness) and rim model (all others)
- FluidReveal: multiplicative dissipation, inverted-dye display shader, iridescent fringes
- FluidBackground: full-viewport fluid with DOM exclusion zones
- 29 ADRs, 6 learning docs, architecture.md, porting-notes.md, contributing.md
- ~27 demo instances on the main page
- Every demo card has a `</>` toggle showing copy-pasteable code snippet
- 4 extra routes: `/background-fluid`, `/fluid-reveal/`, `/svelte-fluid`, `/svg`
- CI runs tests + type-check + publint + build on every push. GitHub Pages auto-deploys.
- Package ready for `npm publish --access public --provenance`.

## What this session built

1. **Multiplicative dissipation for reveal mode** (ADR-0028): Added `uniform float uMultiplicative` to the advection shader. When `reveal=true`, the engine switches from divisor-based `result / (1 + dissipation * dt)` to multiplicative `dissipation * result`, matching the Ascend-Fluid reference physics exactly.

2. **Inverted-dye display shader for reveals**: Changed the REVEAL branch from premultiplied flat `vec4(coverColor * alpha, alpha)` to non-premultiplied inverted `vec4(1.0 - c, alpha)`. Browser premultipliedAlpha clamping creates sharp iridescent fringes at reveal edges. Removed `coverColor`/`revealCoverColor` prop entirely (dead code).

3. **FluidReveal y-coordinate fix**: The manual pointer handler was passing DOM-space y (0=top) to `engine.splat()` which expects GL-space y (0=bottom). Fixed with `1.0 - y` flip.

4. **FluidReveal defaults revision**: sensitivity 0.12→0.1, velocityDissipation 3→0.9, splatRadius 0.4→0.2, REVEAL_DYE from uniform gray `{0.15}` to warm non-uniform `{0.95, 0.84, 0.68}`, fadeBack dissipation 0.97→0.995 (multiplicative), permanent 0→1.0.

5. **Curl skip optimization**: `step()` wraps curl+vorticity passes in `if (this.config.CURL > 0)`, saving 2 draw calls/frame for reveal and any curl-0 config.

6. **Preset modernization** — all presets now use container shapes:
   - **LavaLamp**: roundedRect container + glass (refraction 0.3, chromatic 0.1)
   - **Plasma**: annulus container (r=0.15–0.42), 8 tangential ring splats with slight CCW velocity (V=60), periodic re-injection every 2.5s with ±0.02 positional jitter, velocityDissipation 0.02, densityDissipation 0.2
   - **InkInWater**: full rewrite — dark water backColor {6,8,20}, volumetric bloom (0.6 intensity), shading, 5 chromatically varied droplets (indigo/ultramarine/violet), curl 8, splatForce 800, realistic ink physics
   - **FrozenSwirl**: circle container (r=0.45)
   - **SvgPathFluid**: star path → bold ampersand "&" via text-mode with `fillRule: 'evenodd'`

7. **Text-mode mask sizing fix**: `initMaskTexture()` now uses `metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent` instead of hardcoded `refSize * 1.2`, fixing glyph clipping at large font sizes.

8. **Hemisphere glass rim effects**: `glassThickness` now affects circles — boosts refraction displacement (`rimBoost = smoothstep(0.3, 0.95, rimFactor) * thickness * 5.0`), rim specular (`thicknessFactor = 1.0 + thickness * 8.0`), and rim glow (`0.25 + thickness * 3.0`) toward the dome edge. Crystal orb uses `glassThickness={0.08}`.

9. **Demo page changes**: Container shapes grid reordered (Rounded frame before Rounded rect); Rounded rect replaced with SVG path lightning bolt; SVG star renamed to "Text glyph"; Soft lens and Glass frame get faster splats with swirl velocity; all 4 reveal cards drop coverColor.

10. **Semantic language audit**: Replaced "plasma", "energy field", "tokamak", "confined/confinement" with accurate fluid terminology across all presets, demo cards, types.ts JSDoc, README, CHANGELOG, 5 ADRs, and learnings docs. Kept "vorticity confinement" as the correct technical term.

11. **Dead code removal**: Removed `/ascend-fluid` route (~650 LOC), `coverColor`/`revealCoverColor` prop+config+uniform+resolveConfig mapping, obsolete test cases.

## Key files

| File | Role |
|------|------|
| src/lib/engine/FluidEngine.ts (~1620 LOC) | The engine: WebGL state, physics step, render, dispose, mask texture, glass pass, reveal path, multiplicative dissipation |
| src/lib/Fluid.svelte (~420 LOC) | Svelte wrapper: DOM, ResizeObserver, adaptive resolution, lazy/autoPause, context slot management |
| src/lib/FluidReveal.svelte (~270 LOC) | Fluid as opacity mask: inverted-dye display, manual pointer handling, auto-reveal Lissajous |
| src/lib/FluidBackground.svelte (~180 LOC) | Full-viewport fluid background with DOM exclusion via CSS selector |
| src/lib/engine/gl-utils.ts | WebGL utilities: Material class (keyword shader variants), FBO create/resize/dispose, shader compile |
| src/lib/engine/shaders.ts | All GLSL: advection (with uMultiplicative), display (with REVEAL inverted-dye), glass (hemisphere rim + rim model), container mask |
| src/lib/engine/types.ts | FluidConfig (no coverColor), ResolvedConfig, ContainerShape (5 variants), FluidHandle |
| src/lib/engine/pointer.ts | Pointer state, updatePointerDownData/MoveData, aspect-corrected deltas |
| src/lib/engine/container-shapes.ts | TypeScript SDF mirrors, MaskContext, containerMask(), maskAreaFraction() |
| src/lib/presets/Plasma.svelte | Annulus ring, tangential splats, periodic re-injection with jitter |
| src/routes/+page.svelte | Demo page with ~27 instances, FluidBackground wrapper, code snippets |
| docs/architecture.md | Start here for understanding the system |

## What needs attention next

### Immediate (user-requested for next session)

1. **Code snippet accuracy for Presets** — The `</>` code examples on each preset card need to exactly reproduce the preset's visual, including all `randomSplat*` params, coloring, physics config. Currently many snippets just show `<LavaLamp />` without the internal props.

2. **Code snippet accuracy for Reveal section** — The 4 reveal card snippets need exact color/gradient configs: what CSS gradient stops to use for the revealed content, how gradual the gradient should be, overlay colors, etc. Users should be able to copy-paste and get the exact demo look.

3. **Playground overhaul** — Modernize the Playground to include controls for all latest features: container shapes (type picker + params), glass toggle + thickness/refraction/chromatic/reflectivity sliders, reveal mode toggle + sensitivity/curve/fadeBack, randomSplat rate/count/swirl/spread. May need a tabbed or sectioned UI to fit everything.

### Planned features

4. **npm publish** — Package is ready. Run `npm publish --access public --provenance`. Create a GitHub release with tag `v0.1.0`.

5. **6th preset ("Tempest")** — Chaotic storm swirl on dark background. Fills the "turbulent decay" gap and makes the 5-item grid even.

6. **Test gaps** — Priority 1: dispose() cleanup, setConfig() bucket transitions, context loss/restore. Priority 2: FluidBackground DOM exclusion, glass post-processing.

7. **Changesets setup** — `@changesets/cli` for automated CHANGELOG + npm publish + GitHub releases.

### Known issues

8. **~27 demo instances + background** — Exceeds browser's ~16 WebGL context limit. The loseContext() fix in lazy teardown releases slots, but fast scrolling can still briefly exceed the cap.
9. **FluidReveal pointer-events limitation** — Canvas sits above content; interactive elements can't receive clicks. Documented in JSDoc.
10. **Presets section has 5 items** — Odd count in 2-column grid. Tempest preset would fix this.

### Follow-ups

11. **Visual tuning of glass defaults** — Parameters were tuned analytically, not by eye.
12. **Named glass presets** — `glass="crystal"`, `glass="frosted"`, `glass="orb"`.
13. **Animated specular drift** — Slow sinusoidal light direction wobble when cursor is idle.
14. **FluidReveal interactive content** — Proper event forwarding so revealed buttons/links work.
15. **Cursor y-inversion on splatOnHover cards** — Engine pointer handling code looks correct in analysis. Could not reproduce from code alone. May need visual debugging if user reports it again.

## Architecture quick-reference

- Engine is per-instance, no module-level mutable state. Each canvas gets its own WebGL context.
- Fluid.svelte applies adaptive resolution in instantiate() before constructing the engine — caps textures to canvas pixel size, suppresses expensive effects on small canvases.
- Resize: teardown immediately (blank canvas), debounce rebuild by 150ms.
- Lazy teardown: dispose engine + loseContext() (releases browser context slot). Rebuild: restoreContext() + wait for webglcontextrestored event + create new engine.
- setConfig() has 4 buckets: A (scalars incl. splatOnHover, glass params, revealSensitivity, revealCurve — picked up next frame), B (keyword recompile — shading, bloom, sunrays, reveal), C (FBO rebuild), D (construct-only). Additionally, svgPath shape changes trigger mask texture rebuild, `glass` toggle triggers sceneFBO alloc/dispose, and `reveal` toggle triggers keyword recompile.
- Container shapes: two approaches coexist:
  - **Analytical** (circle/frame/roundedRect/annulus): SDF computed per-fragment in shaders, mirrored in TypeScript for rejection sampling.
  - **Mask texture** (svgPath): rasterized via OffscreenCanvas at canvas aspect ratio, uploaded as R8/LUMINANCE texture. Text mode uses actualBoundingBox metrics for sizing.
- Glass post-processing: two models. **Hemisphere** (circles): full-surface dome with Snell's law; `glassThickness` boosts rim refraction, specular, and glow. **Rim** (all others): refraction band at container boundary.
- Reveal mode: `REVEAL` keyword in display shader outputs `vec4(1.0 - c, alpha)` — inverted dye, non-premultiplied. Advection switches to multiplicative dissipation (`result *= dissipation`) via `uMultiplicative` uniform. Render path skips backColor/checkerboard/glass. Curl+vorticity skipped when CURL=0. FluidReveal handles pointer events itself, injecting warm non-uniform dye `{0.95, 0.84, 0.68}`.
- Transparent mode: `gl.clear(0,0,0,0)` replaces checkerboard. Canvas CSS background = transparent.
- FluidBackground: evenodd SVG path mask. Outer rect = viewport, inner rounded-rect holes = excluded elements.
- Material class caches compiled shader variants by sorted keyword string key.
- Context loss/restore: handled via webglcontextlost/webglcontextrestored events. dispose() does NOT call loseContext() — the Svelte component does it separately for lazy instances.
- Demo page: `<main>` has `pointer-events: none`; interactive elements re-enable individually so FluidBackground splats work across full page width.
