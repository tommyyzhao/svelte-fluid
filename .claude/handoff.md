# Session Handoff — 2026-04-25 (session 22)

## Project

svelte-fluid — WebGL Navier-Stokes fluid simulation as a Svelte 5 component library. MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.

Repo: github.com/tommyyzhao/svelte-fluid · Branch: main · Latest commit: 20cf8a0

## Current state

- 272 tests, all passing. 0 type errors. Build + publint clean.
- 10 presets: LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora, ToroidalTempest, CircularFluid, FrameFluid, AnnularFluid, SvgPathFluid
- 5 container shapes: circle, frame, roundedRect, annulus, svgPath (mask texture)
- Glass post-processing: hemisphere dome (circles) and rim model (all others)
- FluidReveal: smoothstep-sharpened reveal with two-tone fringe (`cover → fringeColor → accentColor`), multiplicative dissipation, openBoundary=true default, pressure=1.0 default, curve=0.5 default
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

1. **Smoothstep sharpening for crisp reveal edges** — `smoothstep(0, 0.5, pow(raw, curve))` replaces the old `pow(raw, curve) * smoothstep(0, 0.01, raw)`. The S-curve kills the Gaussian tail gradient, producing tight boundaries with a proportionally large "clearly revealed" center. The old formula created a long, drawn-out gradient where the "clearly revealed" area was small relative to the soft transition zone.

2. **Two-tone `revealFringeColor` prop** — New `FluidConfig.revealFringeColor?: RGB` (default `{0.6, 0.7, 0.85}`, Bucket A). The shader does a two-segment blend: `cover → fringeColor` (outerBlend, smoothstep 0–0.15) then `fringeColor → accentColor` (innerBlend, smoothstep 0.15–0.4). This eliminates the dark band artifact that appeared when mixing distant colors (e.g. white + deep navy = ugly gray intermediates). FluidReveal exposes it as `fringeColor` prop. Wired through engine, ControlPanel (color picker between Cover and Accent), playground (hash state `fc`, presets, loadConfig).

3. **White-band artifact fix** — The old bell curve `4*r*(1-r)` reverted the color toward cover (white) at high revealAmount while alpha was still nonzero, creating a bright white glow between the accent zone and the transparent center. Replaced with a one-sided ramp `smoothstep(0.0, 0.25, revealAmount)` that saturates to accent and stays there.

4. **Default curve raised 0.24 → 0.5** — Combined with smoothstep sharpening, gives crisp scratch-card-like edges. JSDoc corrected: higher curve = crisper edge (was incorrectly described as the opposite).

5. **Turbulent reveal preset cranked up** — `curl` 3→20, `pressure` 0.8→0.4, `splatRadius` 0.3→0.35, added `velocityDissipation=0.96`. Creates much more chaotic, swirling reveals.

6. **Permanent reveal fringeColor adjusted** — Changed from warm brown `{0.45, 0.41, 0.28}` to golden `{0.72, 0.58, 0.3}` so the fringe reads as "gold" rather than washed-out white against the dark cover.

7. **All 6 reveal demo cards updated** — Each card with custom colors now includes `fringeColor` in both the rendered `<FluidReveal>` instance and the `</>` code snippet.

8. **Playground snippet builder** — `buildRevealSnippet()` now emits `coverColor`, `fringeColor`, and `accentColor` as RGB object literals when they differ from defaults.

## Key files

| File | Role |
|------|------|
| src/lib/engine/FluidEngine.ts (~1780 LOC) | The engine: WebGL state, physics step, render, dispose, mask texture, glass pass, reveal path, distortion path, sticky mask. `REVEAL_FRINGE_COLOR` uniform set at drawDisplay. |
| src/lib/engine/shaders.ts | All GLSL: advection, pressure, splat, display (REVEAL branch: two-tone fringe via nested smoothstep at line ~317), glass, container mask. |
| src/lib/engine/types.ts | FluidConfig (`revealFringeColor` at line ~370), ResolvedConfig, ContainerShape, FluidHandle |
| src/lib/engine/gl-utils.ts | WebGL utilities: Material class (keyword shader variants), FBO create/resize/dispose |
| src/lib/Fluid.svelte (~445 LOC) | Svelte wrapper: DOM, ResizeObserver, adaptive resolution, lazy/autoPause. |
| src/lib/FluidReveal.svelte (~310 LOC) | Fluid as opacity mask: coverColor/fringeColor/accentColor, pixel-based pointer velocity (MOUSE_FORCE=5, TOUCH_FORCE=8), revealDye = white intensity-only. |
| src/lib/FluidStick.svelte (~260 LOC) | Fluid as sticky text/path: auto-animate Lissajous, color-cycling, maskPadding |
| src/lib/FluidDistortion.svelte (~290 LOC) | Fluid as image distortion: bleed canvas, pixel-based pointer velocity, initial chaos splats |
| src/lib/FluidBackground.svelte (~180 LOC) | Full-viewport fluid background with DOM exclusion via CSS selector |
| src/routes/+page.svelte (~1960 LOC) | Demo page: ~38 instances, 6 reveal cards, 4-tab playground, PRESET_CONFIGS, loadConfig, URL hash |
| src/routes/components/ControlPanel.svelte (~1620 LOC) | Playground sidebar: mode toggle, snippet builders (reveal now emits colors), shared accordions |

## What needs attention next

### Planned features

1. **Iterate on playground for reveal mode** — `pressureIterations` has a state variable but no ControlPanel UI control. `openBoundary` not wired into playground at all.
2. **npm publish** — Package is ready. Run `npm publish --access public --provenance`. Create a GitHub release with tag `v0.1.0`.
3. **ADR-0032** — Document openBoundary architecture decision (divergence BCs + applyMask gating).
4. **ADR-0033** — Document revealFringeColor / two-tone fringe architecture (smoothstep sharpening, one-sided ramp, two-segment color blend).

### Known issues

1. **~38 demo instances + background** — Exceeds browser's ~16 WebGL context limit. Lazy teardown helps but fast scrolling can briefly exceed the cap.
2. **Stale `/fluid-reveal/` route** — Line 75 says "Soft reveal (high curve)" with curve=0.5 (now the default), lacks `pressure` override, no fringeColor. Should be updated or removed.
3. **FluidReveal/FluidDistortion/FluidStick pointer-events** — Canvas sits above content; interactive elements can't receive clicks.
4. **Velocity dissipation threshold boundary** — `> 0.5` check means exactly 0.5 falls back to 0.98.
5. **Texture unit 7** — Sticky mask uses the last guaranteed WebGL texture unit.
6. **Vite HMR for engine** — FluidEngine.ts and shaders.ts changes don't hot-reload. Full page reload + cache clear required.
7. **splatOnHover silently ignored in Reveal mode** — FluidReveal sets `pointerInput=false` by default.
8. **FluidStick auto-animate uses `window.innerWidth/Height`** instead of canvas dimensions.

### Follow-ups

1. **Named glass presets** — `glass="crystal"`, `glass="frosted"`, `glass="orb"`.
2. **Animated specular drift** — Slow sinusoidal light direction wobble when cursor is idle.
3. **FluidReveal/FluidDistortion/FluidStick interactive content** — Proper event forwarding.
4. **Video/canvas as distortion source** — Per-frame texture updates for animated content.
5. **Distortion + glass** — Currently mutually exclusive.
6. **Sticky + image mask** — Allow a grayscale image URL as the sticky mask source.
7. **Additional test gaps** — FluidBackground DOM exclusion, glass post-processing, distortion image loading, revealFringeColor uniform.

## Architecture quick-reference

- Engine is per-instance, no module-level mutable state. Each canvas gets its own WebGL context.
- Fluid.svelte applies adaptive resolution in instantiate() before constructing the engine.
- Resize: teardown immediately (blank canvas), debounce rebuild by 150ms.
- Lazy teardown: dispose engine + loseContext() (releases browser context slot). Rebuild: restoreContext() + wait for webglcontextrestored event + create new engine.
- setConfig() has 4 buckets: A (scalars incl. splatOnHover, glass params, sticky params, openBoundary, revealCoverColor, **revealFringeColor**, revealAccentColor — picked up next frame), B (keyword recompile — shading, bloom, sunrays, reveal, distortion; sticky/stickyMask triggers mask rebuild), C (FBO rebuild), D (construct-only). Additionally, svgPath shape changes trigger mask texture rebuild, `glass` toggle triggers sceneFBO alloc/dispose, `distortionImageUrl` change triggers async image load, and `sticky`/`stickyMask` changes trigger sticky mask texture rebuild.
- Container shapes: two approaches coexist:
  - **Analytical** (circle/frame/roundedRect/annulus): SDF computed per-fragment in shaders, mirrored in TypeScript for rejection sampling.
  - **Mask texture** (svgPath): rasterized via OffscreenCanvas at canvas aspect ratio, uploaded as R8/LUMINANCE texture.
- **`openBoundary` changes container shape semantics**: when `true`, `applyMask()` is skipped on velocity and dye — the shape becomes a visual crop rather than a physical wall.
- **Sticky mask**: separate from container mask. Rasterized via same OffscreenCanvas approach, uploaded to texture unit 7.
- Glass post-processing: two models. Hemisphere (circles), Rim (all others). Requires container shape.
- **Reveal mode**: REVEAL keyword, multiplicative dissipation. Display shader: `smoothstep(0, 0.5, pow(raw, curve))` for crisp S-curve edges. Two-tone fringe: `cover → fringeColor` (outerBlend smoothstep 0–0.15) then `fringeColor → accentColor` (innerBlend smoothstep 0.15–0.4). Alpha = `1.0 - revealAmount`. FluidReveal defaults: openBoundary=true, pressure=1.0, velocityDissipation=0.98, curl=0, curve=0.5.
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
