# Session Handoff — 2026-04-25 (session 20)

## Project

svelte-fluid — WebGL Navier-Stokes fluid simulation as a Svelte 5 component library. MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.

Repo: github.com/tommyyzhao/svelte-fluid · Branch: main · Latest commit: (pending push)

## Current state

- 272 tests, all passing. 0 type errors. Build + publint clean.
- 10 presets: LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora, ToroidalTempest, CircularFluid, FrameFluid, AnnularFluid, SvgPathFluid
- 5 container shapes: circle, frame, roundedRect, annulus, svgPath (mask texture)
- Glass post-processing: hemisphere dome (circles) and rim model (all others)
- FluidReveal: multiplicative dissipation, customizable cover/accent colors (ADR-0029), iridescent fringes, pressure=1.0 default (Ascend-matching), **openBoundary=true default**
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
- 1 temporary route: `/test-boundary` (openBoundary visual validation)
- CI runs tests + type-check + publint + build on every push. GitHub Pages auto-deploys.
- @changesets/cli configured for automated CHANGELOG + npm publish + GitHub releases.
- Package ready for `npm publish --access public --provenance`.

## What this session built

1. **`openBoundary` prop** — New `FluidConfig.openBoundary?: boolean` (default `false`). When `true`:
   - Divergence shader (`shaders.ts`) skips no-penetration boundary conditions at canvas edges via `uniform float uOpenBoundary` (lines 744, 754-758).
   - Container shape `applyMask()` is skipped for velocity and dye (`FluidEngine.ts` lines 1522, 1526, 1553) — shapes become visual crops rather than physical walls. Display shader still clips via `CONTAINER_MASK`.
   - FluidReveal defaults to `openBoundary={true}` for natural scratch behavior.
   - Bucket A (hot-updatable scalar).

2. **Ascend-Fluid reference research** — Confirmed via subagent investigation:
   - Ascend divergence shader has NO boundary enforcement (just CLAMP_TO_EDGE).
   - Ascend has no per-frame pressure clear (svelte-fluid's `pressure=1.0` matches).
   - Ascend defaults: `velocityDissipation=0.95`, `densityDissipation=0.995`, `pressureIterations=10`, `splatRadius=1/innerHeight`.
   - Ascend pointer velocity is `5 * pixelDelta` (mouse) / `8 * pixelDelta` (touch).

3. **`/test-boundary` route** — Temporary visual validation page comparing open vs closed boundary behavior across no-shape, circle, roundedRect, and svgPath. Auto-reveal + pointer interaction for hands-free testing.

## Key files

| File | Role |
|------|------|
| src/lib/engine/FluidEngine.ts (~1780 LOC) | The engine: WebGL state, physics step, render, dispose, mask texture, glass pass, reveal path, distortion path, sticky mask. `applyMask` gated by `!OPEN_BOUNDARY` at lines 1522/1553. |
| src/lib/engine/shaders.ts | All GLSL: advection (uMultiplicative, uStickyMask), pressure, splat, display (REVEAL/DISTORTION branches), glass, container mask. **Divergence shader `uOpenBoundary` uniform at line 744.** |
| src/lib/engine/types.ts | FluidConfig (`openBoundary` at line 415), StickyMask, ResolvedConfig (`OPEN_BOUNDARY`), ContainerShape, FluidHandle |
| src/lib/engine/gl-utils.ts | WebGL utilities: Material class (keyword shader variants), FBO create/resize/dispose |
| src/lib/Fluid.svelte (~445 LOC) | Svelte wrapper: DOM, ResizeObserver, adaptive resolution, lazy/autoPause. Passes `openBoundary` through buildConfig. |
| src/lib/FluidReveal.svelte (~320 LOC) | Fluid as opacity mask: coverColor/accentColor, revealDye computation, manual pointer handling, auto-reveal Lissajous. **Defaults: openBoundary=true, pressure=1.0, velocityDissipation=0.98, curl=0** |
| src/lib/FluidStick.svelte (~260 LOC) | Fluid as sticky text/path: auto-animate Lissajous, color-cycling, maskPadding |
| src/lib/FluidDistortion.svelte (~290 LOC) | Fluid as image distortion: bleed canvas (CSS inset + UV remap), initial chaos splats |
| src/lib/FluidBackground.svelte (~180 LOC) | Full-viewport fluid background with DOM exclusion via CSS selector |
| src/routes/+page.svelte (~1900 LOC) | Demo page: ~36 instances, 4-tab playground, PRESET_CONFIGS, loadConfig, URL hash |
| src/routes/components/ControlPanel.svelte (~1600 LOC) | Playground sidebar: mode toggle, snippet builders, shared accordions |
| src/routes/test-boundary/+page.svelte (~230 LOC) | Temporary boundary testing: open vs closed across shape types |

## What needs attention next

### Priority: User-requested next-session work

1. **Add shaped reveal examples to demo page** — The Reveal section currently has no container-shape demos. Add both open and closed boundary examples (e.g. circle reveal, roundedRect reveal) to showcase the `openBoundary` prop visually.

2. **Investigate cursor splat velocity mismatch** — svelte-fluid's cursor-generated splats have noticeably more velocity/momentum than the Ascend reference. Ascend uses `5 * pixelDelta` for mouse, `8 * pixelDelta` for touch. svelte-fluid's FluidReveal uses `SPLAT_FORCE = 6000` multiplied by normalized coordinate deltas. Need to investigate and ideally make splat force/velocity a configurable param on FluidReveal (or tune the existing `splatForce` prop to match Ascend).

3. **Iterate on playground for reveal mode** — Continue refining playground controls and presets for reveal behavior.

### Remaining plan items (from session 19)

4. **loadConfig gaps** — `loadConfig()` in +page.svelte silently drops `pressureIterations`, `revealCoverColor`, `revealAccentColor` from PRESET_CONFIG. Scratch-to-Reveal preset specifies `pressureIterations: 10` but playground ignores it.
5. **revealCurve default mismatch** — ControlPanel D.revealCurve = 0.25, but FluidReveal.curve default = 0.1. Snippet builder compares against wrong value.
6. **Stale `/fluid-reveal/` route** — Line 75 still says "Soft reveal", lacks `pressure={0.8}` override.
7. **Stale test comment** — lifecycle.test.ts line 281 says "FluidReveal sets velocityDissipation=0.9" — now 0.98.

### Bleed decision

Bleed for FluidReveal was investigated this session. With `openBoundary=true`, the canvas-edge CLAMP_TO_EDGE effect is minimal — dye at the edge dissipates naturally via multiplicative dissipation. No visible seam or accumulation was observed in testing. **Bleed is deferred** — revisit only if edge artifacts surface in real-world use.

### Planned features

1. **npm publish** — Package is ready. Run `npm publish --access public --provenance`. Create a GitHub release with tag `v0.1.0`.
2. **ADR-0032** — Document openBoundary architecture decision (divergence BCs + applyMask gating).
3. **Additional test gaps** — FluidBackground DOM exclusion, glass post-processing, distortion image loading.

### Known issues

1. **~36 demo instances + background** — Exceeds browser's ~16 WebGL context limit. Lazy teardown helps but fast scrolling can briefly exceed the cap. The `/test-boundary` page was reduced to 8 instances to stay within limits.
2. **FluidReveal/FluidDistortion/FluidStick pointer-events** — Canvas sits above content; interactive elements can't receive clicks.
3. **Velocity dissipation threshold boundary** — `> 0.5` check means exactly 0.5 falls back to 0.98.
4. **Texture unit 7** — Sticky mask uses the last guaranteed WebGL texture unit.
5. **Vite HMR for engine** — FluidEngine.ts and shaders.ts changes don't hot-reload. Full page reload + cache clear required.
6. **splatOnHover silently ignored in Reveal mode** — FluidReveal sets `pointerInput=false` by default.
7. **FluidStick auto-animate uses `window.innerWidth/Height`** instead of canvas dimensions.

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
- setConfig() has 4 buckets: A (scalars incl. splatOnHover, glass params, sticky params, **openBoundary** — picked up next frame), B (keyword recompile — shading, bloom, sunrays, reveal, distortion; sticky/stickyMask triggers mask rebuild), C (FBO rebuild), D (construct-only). Additionally, svgPath shape changes trigger mask texture rebuild, `glass` toggle triggers sceneFBO alloc/dispose, `distortionImageUrl` change triggers async image load, and `sticky`/`stickyMask` changes trigger sticky mask texture rebuild.
- Container shapes: two approaches coexist:
  - **Analytical** (circle/frame/roundedRect/annulus): SDF computed per-fragment in shaders, mirrored in TypeScript for rejection sampling.
  - **Mask texture** (svgPath): rasterized via OffscreenCanvas at canvas aspect ratio, uploaded as R8/LUMINANCE texture. **`d` takes precedence over `text`** when both are set.
- **`openBoundary` changes container shape semantics**: when `true`, `applyMask()` is skipped on velocity and dye — the shape becomes a **visual crop** (display shader still clips via `CONTAINER_MASK`) rather than a physical wall. The divergence shader also skips no-penetration BCs at canvas edges. FluidReveal defaults to `openBoundary=true`.
- **Sticky mask**: separate from container mask. Rasterized via same OffscreenCanvas approach, uploaded to texture unit 7 with `UNPACK_ALIGNMENT=1`. Optional blur via blurMaskData(). `padding` field controls text fill fraction (default 0.9). Physics shaders sample this mask to modulate dissipation (advection), inject pressure (pressure Jacobi), and amplify splats (splat shader). **Velocity damping**: advection shader uses negative `uStickyStrength` to dampen velocity on the mask (~80%/frame with strength=1.0). All uniforms default to 0.0 when sticky is disabled — zero overhead.
- Glass post-processing: two models. Hemisphere (circles), Rim (all others). Requires container shape.
- Reveal mode: REVEAL keyword, multiplicative dissipation, `max(coverColor - dye, 0)` output with `1 - revealAmount` alpha. FluidReveal defaults: openBoundary=true, pressure=1.0 (no relaxation), velocityDissipation=0.98, curl=0.
- **Velocity dissipation in multiplicative mode**: Engine uses threshold — if prop > 0.5, honored; if ≤ 0.5, falls back to 0.98.
- **Divergence shader boundary conditions** (shaders.ts:753-758): No-penetration BCs (`L = -C.x` at edges) gated by `uOpenBoundary < 0.5`. When `openBoundary=true`, BCs are skipped — matches Ascend-Fluid behavior.
- Distortion mode: DISTORTION keyword, dye.r as UV offset magnitude, velocity as direction.
- Sticky mode: no display keyword (purely physics-level). Uses multiplicative dissipation for dye (0.98 default = 2%/frame off-mask). Velocity dissipation overridden to 0.98 in multiplicative mode. Velocity damped on mask via negative uStickyStrength.
- Transparent mode: `gl.clear(0,0,0,0)` replaces checkerboard.
- FluidBackground: evenodd SVG path mask. Outer rect = viewport, inner rounded-rect holes = excluded elements.
- Material class caches compiled shader variants by sorted keyword string key.
- Context loss/restore: handled via events. dispose() does NOT call loseContext(). Sticky mask texture is re-created on context restore.
- Texture unit budget: 0=dye, 1=bloom/various, 2=dithering(display), 3=sunrays, 4=containerMask, 5=distortionTexture, 6=velocity(distortion), 7=stickyMask.
- Random splat jitter: engine uses `baseInterval * (0.3 + rng() * 1.7)` for 0.3-2.0x organic timing variation. **Paused state blocks random splat timer accumulation.**
- Playground: 4-tab mode toggle. Mode switch snapshots 14 fluid physics values when leaving fluid mode, applies mode-specific defaults when entering non-fluid modes, restores on return to fluid. Only active tab's WebGL context renders. Shared accordions render for all non-fluid tabs. URL hash persists all state for sharing (initial load doesn't show "Loaded" banner). Reset clears snapshot to prevent stale restoration.
- **Ascend-Fluid reference**: Located at `/Users/admin/Projects/personal-archive/fluid-project/Ascend-Fluid`. Key differences from svelte-fluid: no pressure clear step, no divergence boundary conditions, velocity dissipation 0.95, density dissipation 0.995, 10 pressure iterations, pointer force `5 * pixelDelta` (mouse) / `8 * pixelDelta` (touch). **Cursor velocity mismatch** — Ascend uses raw pixel delta * 5, svelte-fluid uses normalized coord delta * 6000. This is the main remaining physics difference to investigate.
