# Session Handoff — 2026-04-25 (session 19)

## Project

svelte-fluid — WebGL Navier-Stokes fluid simulation as a Svelte 5 component library. MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.

Repo: github.com/tommyyzhao/svelte-fluid · Branch: main · Latest commit: 46bba62

## Current state

- 272 tests, all passing. 0 type errors. Build + publint clean.
- 10 presets: LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora, ToroidalTempest, CircularFluid, FrameFluid, AnnularFluid, SvgPathFluid
- 5 container shapes: circle, frame, roundedRect, annulus, svgPath (mask texture)
- Glass post-processing: hemisphere dome (circles) and rim model (all others)
- FluidReveal: multiplicative dissipation, customizable cover/accent colors (ADR-0029), iridescent fringes, pressure=1.0 default (Ascend-matching)
- FluidDistortion: velocity-driven image warping with bleed, initial chaos, auto-distort (ADR-0030)
- FluidStick: physics-level dye sticking via mask texture — velocity damping, tuned dissipation (0.98) (ADR-0031)
- FluidBackground: full-viewport fluid with DOM exclusion zones
- 31 ADRs, 6 learning docs, architecture.md, porting-notes.md, contributing.md
- ~36 demo instances on the main page (4 sticky, 4 distortion, 4 reveal, 4 glass, 6 shapes, 6 presets, 4 config, 1 background, playground)
- Every demo card has `</>` code toggle + "Customize" button (including sticky and distortion)
- Playground with 4-tab mode toggle (Fluid/Reveal/Sticky/Distortion), accordion ControlPanel, URL hash state, `</>` code preview
- All non-fluid tabs have shared accordion sections (Physics, Random Splats, Visuals, Resolution, Background, Container Shape, Glass)
- Floating `</>` button for FluidBackground code snippet
- 4 extra routes: `/background-fluid`, `/fluid-reveal/`, `/svelte-fluid`, `/svg`
- CI runs tests + type-check + publint + build on every push. GitHub Pages auto-deploys.
- @changesets/cli configured for automated CHANGELOG + npm publish + GitHub releases.
- Package ready for `npm publish --access public --provenance`.

## What this session built

1. **Reveal physics tuning to match Ascend-Fluid reference** — Investigated the
   reference implementation at `/Users/admin/Projects/personal-archive/fluid-project/Ascend-Fluid`
   and identified three root causes for physics differences:
   - **Splat radius**: svelte-fluid was 0.2-0.4 (huge washes), Ascend uses `1/height` (~0.001). After the `/100` transform in the engine, `splatRadius=0.12` yields ~0.002 effective — close to Ascend.
   - **Velocity dissipation override**: Engine hardcoded 0.98 for REVEAL/STICKY, ignoring the prop. Fixed with threshold: `> 0.5` → honor prop, `≤ 0.5` → fall back to 0.98.
   - **Pressure relaxation**: Engine's `clearProgram` does `pressure *= PRESSURE` (default 0.8) each frame before the Jacobi solver. Ascend has no such step. Setting `pressure=1.0` makes it a no-op, matching Ascend's pipeline.

2. **FluidReveal default changes** — `pressure` 0.8→1.0, `velocityDissipation` 0.9→0.98. Both are now destructured props passed explicitly to `<Fluid>`.

3. **FluidReveal zero-dye bug fix** — `revealDye = coverColor - accentColor` produced all-zero dye when accent was brighter than cover (e.g. Permanent reveal: dark gray cover + gold accent). Now uses absolute difference with 0.15 floor when all channels are negative.

4. **Scratch-to-Reveal preset**: `splatRadius=0.12`, `velocityDissipation=0.95`, `pressureIterations=10`. Tight viscous trails matching Ascend.

5. **"Soft reveal" → "Liquid reveal"**: Renamed, added explicit `pressure={0.8}` to opt into swirly flow.

6. **Auto-reveal preset**: Added `curve={0.12}` (+0.02 from default).

7. **Changesets setup** — `@changesets/cli` + `@changesets/changelog-github`, config at `.changeset/config.json`, scripts: `changeset`, `version`, `release`.

8. **85 new tests (187→272)** — `resolve-config.test.ts` (47 tests), `lifecycle.test.ts` (26 tests: dispose, setConfig buckets, context loss, velocity dissipation threshold), `reveal.test.ts` additions (5 tests: dye color edge cases, 7 velocity dissipation boundary tests).

9. **ADR-0031** — FluidStick architecture: mask rasterization, three-shader modulation, multiplicative dissipation, velocity damping, zero-overhead, texture unit budget.

10. **Exported `resolveConfig()` and `DEFAULTS`** from FluidEngine.ts with `@internal` JSDoc for test access.

## Approved plan pending implementation

A detailed plan exists at `.claude/plans/composed-giggling-marble.md` covering:

### Open boundary conditions (`openBoundary` prop)
The divergence shader (shaders.ts:753-756) has hardcoded no-penetration boundary conditions (`L = -C.x` at edges) that create wall bounce. Ascend has no such enforcement — fluid flows off-screen freely. Plan: add `uniform float uOpenBoundary` to the divergence shader, wrap the 4 boundary lines in `if (uOpenBoundary < 0.5)`. New `openBoundary?: boolean` in FluidConfig (default false). FluidReveal defaults to `true`.

### Bleed support for FluidReveal
FluidDistortion already implements bleed via CSS `inset: -{bleed}px` + UV fraction passthrough. Plan: add `bleed?: number` prop to FluidReveal (default 0). CSS inset extends canvas beyond visible area; physics runs on the larger canvas providing a physical buffer zone.

### loadConfig missing field handlers
`loadConfig()` in +page.svelte silently drops these PRESET_CONFIG fields:
- `pressureIterations` — Scratch-to-Reveal preset specifies 10 but playground ignores it
- `revealCoverColor` / `revealAccentColor` — All colored reveal presets specify these but Customize uses default white/#0d2952

### revealCurve default mismatch
ControlPanel.D.revealCurve = 0.25, but FluidReveal.curve default = 0.1. Snippet builder compares against 0.25, producing incorrect snippet output.

### Stale `/fluid-reveal/` route
Line 75 still says "Soft reveal" and lacks `pressure={0.8}` override.

### Stale test comment
lifecycle.test.ts line 281 says "FluidReveal sets velocityDissipation=0.9" — now 0.98.

## Key files

| File | Role |
|------|------|
| src/lib/engine/FluidEngine.ts (~1775 LOC) | The engine: WebGL state, physics step, render, dispose, mask texture, glass pass, reveal path, distortion path, sticky mask. Velocity dissipation threshold at line 1512. Pressure clear at line 1431. |
| src/lib/engine/shaders.ts | All GLSL: advection (uMultiplicative, uStickyMask), pressure, splat, display (REVEAL/DISTORTION branches), glass, container mask. **Divergence shader boundary conditions at lines 753-756 — target for openBoundary feature.** |
| src/lib/engine/types.ts | FluidConfig, StickyMask, ResolvedConfig, ContainerShape, FluidHandle |
| src/lib/engine/gl-utils.ts | WebGL utilities: Material class (keyword shader variants), FBO create/resize/dispose |
| src/lib/Fluid.svelte (~440 LOC) | Svelte wrapper: DOM, ResizeObserver, adaptive resolution, lazy/autoPause |
| src/lib/FluidReveal.svelte (~320 LOC) | Fluid as opacity mask: coverColor/accentColor, revealDye computation (absolute diff + floor), manual pointer handling, auto-reveal Lissajous. **Defaults: pressure=1.0, velocityDissipation=0.98, curl=0** |
| src/lib/FluidStick.svelte (~260 LOC) | Fluid as sticky text/path: auto-animate Lissajous, color-cycling, maskPadding |
| src/lib/FluidDistortion.svelte (~290 LOC) | Fluid as image distortion: bleed canvas (CSS inset + UV remap), initial chaos splats |
| src/lib/FluidBackground.svelte (~180 LOC) | Full-viewport fluid background with DOM exclusion via CSS selector |
| src/routes/+page.svelte (~1900 LOC) | Demo page: ~36 instances, 4-tab playground, PRESET_CONFIGS, loadConfig, URL hash |
| src/routes/components/ControlPanel.svelte (~1600 LOC) | Playground sidebar: mode toggle, snippet builders, shared accordions |
| src/lib/engine/container-shapes.ts | SDF evaluation, containerShapeEqual, stickyMaskEqual, maskAreaFraction |

## What needs attention next

### Priority: Implement the approved plan

1. **`openBoundary` prop** — New FluidConfig field, uniform in divergence shader, FluidReveal default=true. Eliminates wall bounce for reveal. See plan doc for full implementation details.
2. **FluidReveal `bleed` prop** — CSS inset buffer zone, same pattern as FluidDistortion.
3. **loadConfig gaps** — Add handlers for `pressureIterations`, `revealCoverColor`, `revealAccentColor`.
4. **revealCurve default mismatch** — Change ControlPanel D.revealCurve from 0.25 to 0.1.
5. **Stale `/fluid-reveal/` route** — Rename "Soft reveal" → "Liquid reveal", add pressure={0.8}.
6. **Stale test comment** — lifecycle.test.ts line 281.
7. **ADR-0032** — Document openBoundary architecture decision.

### Planned features

1. **npm publish** — Package is ready. Run `npm publish --access public --provenance`. Create a GitHub release with tag `v0.1.0`.
2. **Additional test gaps** — FluidBackground DOM exclusion, glass post-processing, distortion image loading.

### Known issues

1. **~36 demo instances + background** — Exceeds browser's ~16 WebGL context limit. Lazy teardown helps but fast scrolling can briefly exceed the cap.
2. **FluidReveal/FluidDistortion/FluidStick pointer-events** — Canvas sits above content; interactive elements can't receive clicks.
3. **Velocity dissipation threshold boundary** — `> 0.5` check means exactly 0.5 falls back to 0.98. Unintuitive but unlikely to hit.
4. **Texture unit 7** — Sticky mask uses the last guaranteed WebGL texture unit. No room for additional texture-based features without checking `MAX_COMBINED_TEXTURE_IMAGE_UNITS`.
5. **Vite HMR for engine** — FluidEngine.ts and shaders.ts changes don't hot-reload. Full page reload + cache clear required.
6. **Browser automation limitation** — `document.hidden=true` when terminal has focus prevents RAF from firing.
7. **splatOnHover silently ignored in Reveal mode** — FluidReveal sets `pointerInput=false` by default, so the shared Physics checkbox does nothing.
8. **FluidStick auto-animate uses `window.innerWidth/Height`** instead of canvas dimensions for velocity scaling. Approximately correct but wrong for small canvases.

### Follow-ups

1. **Named glass presets** — `glass="crystal"`, `glass="frosted"`, `glass="orb"`.
2. **Animated specular drift** — Slow sinusoidal light direction wobble when cursor is idle.
3. **FluidReveal/FluidDistortion/FluidStick interactive content** — Proper event forwarding.
4. **Video/canvas as distortion source** — Per-frame texture updates for animated content.
5. **Distortion + glass** — Currently mutually exclusive.
6. **Sticky + image mask** — Allow a grayscale image URL as the sticky mask source.

## Architecture quick-reference

- Engine is per-instance, no module-level mutable state. Each canvas gets its own WebGL context.
- Fluid.svelte applies adaptive resolution in instantiate() before constructing the engine.
- Resize: teardown immediately (blank canvas), debounce rebuild by 150ms.
- Lazy teardown: dispose engine + loseContext() (releases browser context slot). Rebuild: restoreContext() + wait for webglcontextrestored event + create new engine.
- setConfig() has 4 buckets: A (scalars incl. splatOnHover, glass params, sticky params — picked up next frame), B (keyword recompile — shading, bloom, sunrays, reveal, distortion; sticky/stickyMask triggers mask rebuild), C (FBO rebuild), D (construct-only). Additionally, svgPath shape changes trigger mask texture rebuild, `glass` toggle triggers sceneFBO alloc/dispose, `distortionImageUrl` change triggers async image load, and `sticky`/`stickyMask` changes trigger sticky mask texture rebuild.
- Container shapes: two approaches coexist:
  - **Analytical** (circle/frame/roundedRect/annulus): SDF computed per-fragment in shaders, mirrored in TypeScript for rejection sampling.
  - **Mask texture** (svgPath): rasterized via OffscreenCanvas at canvas aspect ratio, uploaded as R8/LUMINANCE texture. **`d` takes precedence over `text`** when both are set.
- **Sticky mask**: separate from container mask. Rasterized via same OffscreenCanvas approach, uploaded to texture unit 7 with `UNPACK_ALIGNMENT=1`. Optional blur via blurMaskData(). `padding` field controls text fill fraction (default 0.9). Physics shaders sample this mask to modulate dissipation (advection), inject pressure (pressure Jacobi), and amplify splats (splat shader). **Velocity damping**: advection shader uses negative `uStickyStrength` to dampen velocity on the mask (~80%/frame with strength=1.0). All uniforms default to 0.0 when sticky is disabled — zero overhead.
- Glass post-processing: two models. Hemisphere (circles), Rim (all others). Requires container shape.
- Reveal mode: REVEAL keyword, multiplicative dissipation, `max(coverColor - dye, 0)` output with `1 - revealAmount` alpha. FluidReveal defaults: pressure=1.0 (no relaxation), velocityDissipation=0.98, curl=0.
- **Velocity dissipation in multiplicative mode**: Engine uses threshold — if prop > 0.5, honored; if ≤ 0.5, falls back to 0.98. This prevents the engine default (0.2) from killing velocity instantly in multiplicative mode while allowing explicit tuning.
- **Divergence shader boundary conditions** (shaders.ts:753-756): Hardcoded no-penetration BCs (`L = -C.x` at edges). Creates wall bounce. Ascend-Fluid has no such enforcement. Planned `openBoundary` prop will make this configurable.
- Distortion mode: DISTORTION keyword, dye.r as UV offset magnitude, velocity as direction.
- Sticky mode: no display keyword (purely physics-level). Uses multiplicative dissipation for dye (0.98 default = 2%/frame off-mask). Velocity dissipation overridden to 0.98 in multiplicative mode. Velocity damped on mask via negative uStickyStrength.
- Transparent mode: `gl.clear(0,0,0,0)` replaces checkerboard.
- FluidBackground: evenodd SVG path mask. Outer rect = viewport, inner rounded-rect holes = excluded elements.
- Material class caches compiled shader variants by sorted keyword string key.
- Context loss/restore: handled via events. dispose() does NOT call loseContext(). Sticky mask texture is re-created on context restore.
- Texture unit budget: 0=dye, 1=bloom/various, 2=dithering(display), 3=sunrays, 4=containerMask, 5=distortionTexture, 6=velocity(distortion), 7=stickyMask.
- Random splat jitter: engine uses `baseInterval * (0.3 + rng() * 1.7)` for 0.3-2.0x organic timing variation. **Paused state blocks random splat timer accumulation.**
- Playground: 4-tab mode toggle. Mode switch snapshots 14 fluid physics values when leaving fluid mode, applies mode-specific defaults when entering non-fluid modes, restores on return to fluid. Only active tab's WebGL context renders. Shared accordions render for all non-fluid tabs. URL hash persists all state for sharing (initial load doesn't show "Loaded" banner). Reset clears snapshot to prevent stale restoration.
- **Ascend-Fluid reference**: Located at `/Users/admin/Projects/personal-archive/fluid-project/Ascend-Fluid`. Key differences from svelte-fluid: no pressure clear step, no divergence boundary conditions, velocity dissipation 0.95, density dissipation 0.995, 10 pressure iterations, pointer force 5× pixel delta.
