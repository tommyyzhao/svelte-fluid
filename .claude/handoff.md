# Session Handoff — 2026-04-25 (session 21)

## Project

svelte-fluid — WebGL Navier-Stokes fluid simulation as a Svelte 5 component library. MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.

Repo: github.com/tommyyzhao/svelte-fluid · Branch: main · Latest commit: 919afd4

## Current state

- 272 tests, all passing. 0 type errors. Build + publint clean.
- 10 presets: LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora, ToroidalTempest, CircularFluid, FrameFluid, AnnularFluid, SvgPathFluid
- 5 container shapes: circle, frame, roundedRect, annulus, svgPath (mask texture)
- Glass post-processing: hemisphere dome (circles) and rim model (all others)
- FluidReveal: multiplicative dissipation, **revealAccentColor as separate uniform** (ADR pending), iridescent fringes via `mix(cover, accent, revealAmount)`, pressure=1.0 default (Ascend-matching), openBoundary=true default, curve=0.24 default
- FluidDistortion: velocity-driven image warping with bleed, initial chaos, auto-distort (ADR-0030)
- FluidStick: physics-level dye sticking via mask texture — velocity damping, tuned dissipation (0.98) (ADR-0031)
- FluidBackground: full-viewport fluid with DOM exclusion zones
- 31 ADRs, 6 learning docs, architecture.md, porting-notes.md, contributing.md
- ~38 demo instances on the main page (6 reveal, 4 sticky, 4 distortion, 4 glass, 6 shapes, 6 presets, 4 config, 1 background, playground)
- Every demo card has `</>` code toggle + "Customize" button
- Playground with 4-tab mode toggle (Fluid/Reveal/Sticky/Distortion), accordion ControlPanel, URL hash state, `</>` code preview
- Floating `</>` button for FluidBackground code snippet
- 4 extra routes: `/background-fluid`, `/fluid-reveal/`, `/svelte-fluid`, `/svg`
- 1 temporary route: `/test-boundary` (openBoundary visual validation)
- CI runs tests + type-check + publint + build on every push. GitHub Pages auto-deploys.
- @changesets/cli configured for automated CHANGELOG + npm publish + GitHub releases.
- Package ready for `npm publish --access public --provenance`.

## What this session built

1. **`revealAccentColor` prop + shader architecture change** — Added `FluidConfig.revealAccentColor?: RGB` as a separate engine uniform. Display shader changed from `max(coverColor - dye, 0)` to `mix(coverColor, accentColor, revealAmount)`. The accent color now appears directly in the fringe zone, independent of the cover color. Matches Ascend-Fluid reference where the accent is a distinct parameter. Previously, accent was baked into dye via `cover - accent` subtraction, which produced invisible fringes with dark covers.

2. **Pixel-based pointer velocity** — FluidReveal and FluidDistortion switched from normalized deltas * 6000 to pixel-based deltas * 5 (mouse) / 8 (touch), matching Ascend-Fluid. Eliminates canvas-size-dependent velocity — small demo cards previously produced 3-4x more velocity than full-screen canvases.

3. **Shaped reveal demo cards** — Added "Circle reveal" (openBoundary + circle + teal mosaic) and "Bounded reveal" (openBoundary=false + roundedRect + warm mosaic) to the Reveal section. Both with Customize buttons and code snippets.

4. **Reveal shader smoothstep threshold** — Added `smoothstep(0.0, 0.01, raw)` to kill near-zero dye intensity, preventing the "brightening" artifact where faint Gaussian tails made the solid cover slightly transparent.

5. **Default curve raised 0.1 → 0.24** — Across FluidReveal, engine DEFAULTS, and ControlPanel. The old 0.1 exponent produced `pow(0.01, 0.1) = 0.74` — tiny dye amounts created massive reveal. 0.24 gives crisper boundaries.

6. **Preset tuning** — All reveal presets now use curve >= 0.24 and splatRadius >= 0.2. Permanent reveal and Auto-reveal use velocityDissipation=0.95 for blobby behavior. "Liquid reveal" renamed to "Turbulent reveal". revealDye simplified to white (intensity-only).

7. **loadConfig gaps fixed** — `revealCoverColor`, `revealAccentColor`, and `pressureIterations` now correctly loaded from PRESET_CONFIGS into playground state.

8. **revealCurve default mismatch fixed** — ControlPanel was 0.25, FluidReveal was 0.1. Both now 0.24.

## Key files

| File | Role |
|------|------|
| src/lib/engine/FluidEngine.ts (~1780 LOC) | The engine: WebGL state, physics step, render, dispose, mask texture, glass pass, reveal path, distortion path, sticky mask. `REVEAL_ACCENT_COLOR` uniform set at line 1670. |
| src/lib/engine/shaders.ts | All GLSL: advection, pressure, splat, display (REVEAL branch: `mix(cover, accent, revealAmount)` at line 313), glass, container mask. |
| src/lib/engine/types.ts | FluidConfig (`revealAccentColor` at line 362), ResolvedConfig (`REVEAL_ACCENT_COLOR`), ContainerShape, FluidHandle |
| src/lib/engine/gl-utils.ts | WebGL utilities: Material class (keyword shader variants), FBO create/resize/dispose |
| src/lib/Fluid.svelte (~445 LOC) | Svelte wrapper: DOM, ResizeObserver, adaptive resolution, lazy/autoPause. |
| src/lib/FluidReveal.svelte (~310 LOC) | Fluid as opacity mask: coverColor/accentColor (accent passed as revealAccentColor to engine), pixel-based pointer velocity (MOUSE_FORCE=5, TOUCH_FORCE=8), revealDye = white intensity-only. |
| src/lib/FluidStick.svelte (~260 LOC) | Fluid as sticky text/path: auto-animate Lissajous, color-cycling, maskPadding |
| src/lib/FluidDistortion.svelte (~290 LOC) | Fluid as image distortion: bleed canvas, pixel-based pointer velocity, initial chaos splats |
| src/lib/FluidBackground.svelte (~180 LOC) | Full-viewport fluid background with DOM exclusion via CSS selector |
| src/routes/+page.svelte (~1950 LOC) | Demo page: ~38 instances, 6 reveal cards, 4-tab playground, PRESET_CONFIGS, loadConfig, URL hash |
| src/routes/components/ControlPanel.svelte (~1600 LOC) | Playground sidebar: mode toggle, snippet builders, shared accordions |
| src/routes/test-boundary/+page.svelte (~230 LOC) | Temporary boundary testing: open vs closed across shape types |

## What needs attention next

### Priority: User-requested next-session work

1. **Tune reveal fringe crispness** — The gap between "fully revealed transparent area" and the solid surrounding cover is still too wide/drawn out. The transition needs to be crisper with only a slight gradient. Investigate `curve`, `sensitivity`, and potentially the smoothstep threshold parameters. May need higher curve values (0.5+), adjusted sensitivity, or a tighter smoothstep band.

2. **Fix accent color visibility** — The accent color is still not visible in the reveal fringe during user testing. Despite the shader formula change to `mix(coverColor, accentColor, revealAmount)`, the accent isn't showing. Possible causes: (a) the `revealAmount` transitions too quickly from 0 to 1, leaving no intermediate zone where the mix produces visible accent; (b) the smoothstep threshold is cutting off the transition band; (c) the sensitivity/curve combination maps dye intensity to a step function rather than a gradient. Needs hands-on investigation with different parameter combinations.

3. **Iterate on playground for reveal mode** — Continue refining playground controls. `pressureIterations` has a state variable but no ControlPanel UI control. `openBoundary` not wired into playground at all.

### Remaining plan items (from session 20)

4. **Stale `/fluid-reveal/` route** — Line 75 still says "Soft reveal", lacks `pressure={0.8}` override.
5. **Stale test comment** — lifecycle.test.ts line 281 says "FluidReveal sets velocityDissipation=0.98" — correct now, was fixed this session.

### Planned features

1. **npm publish** — Package is ready. Run `npm publish --access public --provenance`. Create a GitHub release with tag `v0.1.0`.
2. **ADR-0032** — Document openBoundary architecture decision (divergence BCs + applyMask gating).
3. **ADR-0033** — Document revealAccentColor architecture change (separate uniform, mix formula, Ascend reference).
4. **Additional test gaps** — FluidBackground DOM exclusion, glass post-processing, distortion image loading.

### Known issues

1. **~38 demo instances + background** — Exceeds browser's ~16 WebGL context limit. Lazy teardown helps but fast scrolling can briefly exceed the cap.
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
- setConfig() has 4 buckets: A (scalars incl. splatOnHover, glass params, sticky params, openBoundary, **revealAccentColor** — picked up next frame), B (keyword recompile — shading, bloom, sunrays, reveal, distortion; sticky/stickyMask triggers mask rebuild), C (FBO rebuild), D (construct-only). Additionally, svgPath shape changes trigger mask texture rebuild, `glass` toggle triggers sceneFBO alloc/dispose, `distortionImageUrl` change triggers async image load, and `sticky`/`stickyMask` changes trigger sticky mask texture rebuild.
- Container shapes: two approaches coexist:
  - **Analytical** (circle/frame/roundedRect/annulus): SDF computed per-fragment in shaders, mirrored in TypeScript for rejection sampling.
  - **Mask texture** (svgPath): rasterized via OffscreenCanvas at canvas aspect ratio, uploaded as R8/LUMINANCE texture.
- **`openBoundary` changes container shape semantics**: when `true`, `applyMask()` is skipped on velocity and dye — the shape becomes a visual crop rather than a physical wall.
- **Sticky mask**: separate from container mask. Rasterized via same OffscreenCanvas approach, uploaded to texture unit 7.
- Glass post-processing: two models. Hemisphere (circles), Rim (all others). Requires container shape.
- **Reveal mode**: REVEAL keyword, multiplicative dissipation. Display shader: `mix(uRevealCoverColor, uRevealAccentColor, revealAmount)` with `alpha = 1.0 - revealAmount`. `revealAmount = pow(raw, curve) * smoothstep(0, 0.01, raw)` where `raw = clamp(dye_intensity * sensitivity, 0, 1)`. FluidReveal defaults: openBoundary=true, pressure=1.0, velocityDissipation=0.98, curl=0, curve=0.24.
- **Pointer velocity in FluidReveal/FluidDistortion**: pixel-based deltas * MOUSE_FORCE(5) / TOUCH_FORCE(8), matching Ascend-Fluid. The engine's internal pointer handler still uses normalized deltas * splatForce (for the <Fluid> component).
- **Velocity dissipation in multiplicative mode**: Engine uses threshold — if prop > 0.5, honored; if <= 0.5, falls back to 0.98.
- Distortion mode: DISTORTION keyword, dye.r as UV offset magnitude, velocity as direction.
- Sticky mode: no display keyword (purely physics-level). Uses multiplicative dissipation for dye.
- Transparent mode: `gl.clear(0,0,0,0)` replaces checkerboard.
- FluidBackground: evenodd SVG path mask. Outer rect = viewport, inner rounded-rect holes = excluded elements.
- Material class caches compiled shader variants by sorted keyword string key.
- Context loss/restore: handled via events. dispose() does NOT call loseContext().
- Texture unit budget: 0=dye, 1=bloom/various, 2=dithering(display), 3=sunrays, 4=containerMask, 5=distortionTexture, 6=velocity(distortion), 7=stickyMask.
- Random splat jitter: engine uses `baseInterval * (0.3 + rng() * 1.7)` for 0.3-2.0x organic timing variation.
- Playground: 4-tab mode toggle. Mode switch snapshots 14 fluid physics values when leaving fluid mode, applies mode-specific defaults when entering non-fluid modes, restores on return to fluid.
- **Ascend-Fluid reference**: Located at `/Users/admin/Projects/personal-archive/fluid-project/Ascend-Fluid`. Key differences from svelte-fluid: no pressure clear step, no divergence boundary conditions, velocity dissipation 0.95, density dissipation 0.995, 10 pressure iterations, pointer force `5 * pixelDelta` (mouse) / `8 * pixelDelta` (touch). Display shader: `vec4(1. - C, 1. - a)` with `a = pow(.1 * max_intensity, .1)`.
