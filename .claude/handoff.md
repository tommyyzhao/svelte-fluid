# Session Handoff — 2026-04-24 (session 12)

## Project

svelte-fluid — WebGL Navier-Stokes fluid simulation as a Svelte 5 component library. MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.

Repo: github.com/tommyyzhao/svelte-fluid · Branch: main · Latest commit: 505b1dd

## Current state

- 153 tests, all passing. 0 type errors. Build + publint clean.
- 10 presets: LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora, ToroidalTempest, CircularFluid, FrameFluid, AnnularFluid, SvgPathFluid
- 5 container shapes: circle, frame, roundedRect, annulus, svgPath (mask texture)
- Glass post-processing: hemisphere dome (circles) and rim model (all others)
- FluidReveal: multiplicative dissipation, customizable cover/accent colors (ADR-0029), iridescent fringes
- FluidDistortion: velocity-driven image warping with bleed, initial chaos, auto-distort (ADR-0030)
- FluidBackground: full-viewport fluid with DOM exclusion zones
- 30 ADRs, 6 learning docs, architecture.md, porting-notes.md, contributing.md
- ~32 demo instances on the main page (27 previous + 4 distortion + FluidBackground)
- Every demo card has `</>` code toggle + "Customize" button
- Playground with Fluid/Reveal mode toggle, accordion ControlPanel, URL hash state, `</>` code preview
- Floating `</>` button for FluidBackground code snippet
- 4 extra routes: `/background-fluid`, `/fluid-reveal/`, `/svelte-fluid`, `/svg`
- CI runs tests + type-check + publint + build on every push. GitHub Pages auto-deploys.
- Package ready for `npm publish --access public --provenance`.

## What this session built

1. **FluidDistortion component** (`src/lib/FluidDistortion.svelte`, ~290 LOC):
   - Wraps `<Fluid>` with `distortion={true}` and distortion-specific props
   - Props: `src` (image URL), `strength` (UV offset power, default 0.4), `intensity` (dye per interaction, default 24), `fit` ('cover'|'contain'), `scale`, `bleed` (CSS px, default 60), `initialSplats` (default 20), `autoDistort`, `autoDistortSpeed`
   - Manual pointer handling: injects scalar dye `{ r: intensity * 0.001, g: 0, b: 0 }` + velocity from pointer delta
   - Auto-distort: Lissajous animation before first interaction (like FluidReveal's autoReveal)
   - Distortion-tuned defaults: `splatRadius: 1`, `pressure: 0`, `curl: 0`, `bloom: false`, `densityDissipation: 0.98`

2. **Bleed system** (canvas edge overflow):
   - `bleed` prop (CSS pixels, default 60) extends canvas via `style:inset="{-bleed}px"` with `overflow: hidden` on container
   - `bind:clientWidth/Height` tracks container dimensions; computes UV bleed fractions
   - Shader remaps `vUv` to visible sub-region: `visUv = (vUv - uBleed) / (1.0 - 2.0 * uBleed)`
   - Visible-area aspect ratio computed for correct image fit within the visible portion
   - Velocity field flows freely past visible edges — no bounce artifacts

3. **Initial chaos splats**:
   - `initialSplats` prop (default 20) generates random high-velocity (4000–8000) preset splats
   - Dye intensity 0.15 saturates the canvas with distortion on load
   - `initialDensityDissipation: 0.5` with 2-second ramp to steady-state 0.98
   - Creates dramatic warp-to-clear transition effect on load

4. **DISTORTION display shader keyword** (`shaders.ts`):
   - Mutually exclusive with REVEAL via `#ifdef DISTORTION / #elif defined(REVEAL) / #else`
   - Reads `dye.r` as distortion intensity, `velocity.xy` as direction
   - Offsets image UVs by `normalize(vel) * dye.r * distortionPower`
   - Cover/contain fit modes via `uDistortionFit` uniform
   - `uDistortionScale` for zoom control, `uBleed` vec2 for UV remapping
   - Soft edge alpha fadeout at image borders

5. **Engine changes** (`FluidEngine.ts`):
   - `distortionTexture` field + `loadDistortionImage(url)` — async Image load, CORS, GL texture upload
   - Stale load cancellation (URL changed while loading)
   - Context restore re-loads the distortion image
   - `updateKeywords()` adds `DISTORTION` (mutually exclusive with `REVEAL`)
   - `drawDisplay()` binds distortion texture (slot 5), velocity (slot 6), power/ratio/fit/scale/bleed uniforms
   - `render()` distortion path: `gl.disable(gl.BLEND)` + drawDisplay + early return (no background, no glass)
   - `setConfig()`: `distortion` → Bucket B; power/fit/scale/bleedX/bleedY → Bucket A; imageUrl → async load
   - `dispose()` cleans up distortion texture

6. **Types** (`types.ts`):
   - FluidConfig: `distortion`, `distortionPower`, `distortionImageUrl`, `distortionFit`, `distortionScale`, `distortionBleedX`, `distortionBleedY`
   - ResolvedConfig: `DISTORTION`, `DISTORTION_POWER`, `DISTORTION_IMAGE_URL`, `DISTORTION_FIT`, `DISTORTION_SCALE`, `DISTORTION_BLEED_X`, `DISTORTION_BLEED_Y`

7. **Demo: Distortion section** (`+page.svelte`):
   - 4 cards: Image distortion, Auto-distort, Strong warp, Contained with shape
   - Uses `static/bosch-garden.jpg` — Hieronymus Bosch's *Garden of Earthly Delights* (public domain, 1490–1500, 1870x924)

8. **Tests** (`distortion.test.ts`, 14 new tests):
   - UV offset math (zero dye, zero power, directional shift, power/dye scaling)
   - Cover/contain fit behavior
   - Scale zoom-out behavior
   - Edge alpha (center, outside, edge)
   - Bleed UV remapping (identity, edge mapping, center invariance, CSS pixel computation)
   - Config defaults, mutual exclusivity with REVEAL

9. **Acknowledgment**: README credits Ksenia Kondrashova's CodePen demos as inspiration for reveal and distortion effects.

10. **ADR-0030**: Documents FluidDistortion architecture, image texture management, fit modes, bucket classification, render path.

## Key files

| File | Role |
|------|------|
| src/lib/engine/FluidEngine.ts (~1720 LOC) | The engine: WebGL state, physics step, render, dispose, mask texture, glass pass, reveal path, distortion path (loadDistortionImage, drawDisplay DISTORTION uniforms), multiplicative dissipation |
| src/lib/Fluid.svelte (~430 LOC) | Svelte wrapper: DOM, ResizeObserver, adaptive resolution, lazy/autoPause, context slot management. Destructures ALL FluidConfig props including distortion fields. |
| src/lib/FluidDistortion.svelte (~290 LOC) | Fluid as image distortion: bleed canvas extension, initial chaos splats, pointer-driven scalar dye injection, auto-distort Lissajous, cover/contain fit |
| src/lib/FluidReveal.svelte (~300 LOC) | Fluid as opacity mask: coverColor/accentColor props, derived dye injection color, manual pointer handling, auto-reveal Lissajous |
| src/lib/FluidBackground.svelte (~180 LOC) | Full-viewport fluid background with DOM exclusion via CSS selector |
| src/lib/engine/gl-utils.ts | WebGL utilities: Material class (keyword shader variants), FBO create/resize/dispose, shader compile |
| src/lib/engine/shaders.ts | All GLSL: advection (with uMultiplicative), display (with REVEAL and DISTORTION branches), glass, container mask |
| src/lib/engine/types.ts | FluidConfig (with distortion* fields), ResolvedConfig, ContainerShape (5 variants), FluidHandle |
| src/routes/+page.svelte (~1550 LOC) | Demo page: ~32 instances, FluidBackground wrapper, playground state, loadConfig, URL hash, PRESET_CONFIGS, 4 distortion cards |
| src/routes/components/ControlPanel.svelte (~1120 LOC) | Playground controls: mode toggle, accordion sections with badges, quick controls, code generation, cover/accent color pickers |
| src/routes/components/Card.svelte | Demo card: canvas slot, caption, `</>` code toggle, Customize button, "Copied!" feedback |
| src/routes/background-fluid/+page.svelte | Extra route: background fluid demo with feature cards |

## What needs attention next

### Planned features

1. **npm publish** — Package is ready. Run `npm publish --access public --provenance`. Create a GitHub release with tag `v0.1.0`.
2. **Test gaps** — Priority 1: dispose() cleanup, setConfig() bucket transitions, context loss/restore. Priority 2: FluidBackground DOM exclusion, glass post-processing, distortion image loading.
3. **Changesets setup** — `@changesets/cli` for automated CHANGELOG + npm publish + GitHub releases.
4. **Playground distortion mode** — Add distortion as a third playground mode alongside Fluid and Reveal. Would need image URL input and distortion-specific controls.

### Known issues

5. **~32 demo instances + background** — Exceeds browser's ~16 WebGL context limit. The loseContext() fix in lazy teardown releases slots, but fast scrolling can still briefly exceed the cap.
6. **FluidReveal pointer-events limitation** — Canvas sits above content; interactive elements can't receive clicks. Same applies to FluidDistortion. Documented in JSDoc.
7. **`{#key revealAutoReveal}` remount semantics** — toggling autoReveal destroys/rebuilds the fluid state. Needed because autoReveal starts in `onMount`. Accepted tradeoff.
8. **Distortion image load race** — First frame may render before image texture is loaded. Displays black until the image arrives. Could add a loading placeholder.

### Follow-ups

9. **Named glass presets** — `glass="crystal"`, `glass="frosted"`, `glass="orb"`.
10. **Animated specular drift** — Slow sinusoidal light direction wobble when cursor is idle.
11. **FluidReveal/FluidDistortion interactive content** — Proper event forwarding so revealed/distorted buttons/links work.
12. **Video/canvas as distortion source** — Per-frame texture updates for animated content.
13. **Distortion + glass** — Currently mutually exclusive (distortion returns early). Could compose them.

## Architecture quick-reference

- Engine is per-instance, no module-level mutable state. Each canvas gets its own WebGL context.
- Fluid.svelte applies adaptive resolution in instantiate() before constructing the engine — caps textures to canvas pixel size, suppresses expensive effects on small canvases.
- Resize: teardown immediately (blank canvas), debounce rebuild by 150ms.
- Lazy teardown: dispose engine + loseContext() (releases browser context slot). Rebuild: restoreContext() + wait for webglcontextrestored event + create new engine.
- setConfig() has 4 buckets: A (scalars incl. splatOnHover, glass params, revealSensitivity, revealCurve, revealCoverColor, distortionPower, distortionFit, distortionScale, distortionBleedX/Y — picked up next frame), B (keyword recompile — shading, bloom, sunrays, reveal, distortion), C (FBO rebuild), D (construct-only). Additionally, svgPath shape changes trigger mask texture rebuild, `glass` toggle triggers sceneFBO alloc/dispose, `distortionImageUrl` change triggers async image load, and `reveal`/`distortion` toggles trigger keyword recompile.
- Container shapes: two approaches coexist:
  - **Analytical** (circle/frame/roundedRect/annulus): SDF computed per-fragment in shaders, mirrored in TypeScript for rejection sampling.
  - **Mask texture** (svgPath): rasterized via OffscreenCanvas at canvas aspect ratio, uploaded as R8/LUMINANCE texture. Text mode uses alphabetic baseline with `(ascent - descent) / 2` offset for visual centering.
- Glass post-processing: two models. **Hemisphere** (circles): full-surface dome with Snell's law; `glassThickness` boosts rim refraction, specular, and glow. **Rim** (all others): refraction band at container boundary. Glass requires a container shape — `CONTAINER_SHAPE` must be non-null.
- Reveal mode: `REVEAL` keyword in display shader outputs `max(uRevealCoverColor - c, vec3(0.0))` with non-premultiplied alpha. Advection switches to multiplicative dissipation via `uMultiplicative` uniform. Render path skips backColor/checkerboard/glass when REVEAL is active. FluidReveal derives dye injection color as `max(coverColor - accentColor, 0)`.
- Distortion mode: `DISTORTION` keyword in display shader, mutually exclusive with `REVEAL`. Reads `dye.r` as distortion intensity and `velocity.xy` as direction. Offsets image UVs by `normalize(vel) * offset * uDistortionPower`. Remaps UVs via `uBleed` to account for canvas bleed overflow. Image loaded asynchronously via `loadDistortionImage()`. Render path skips backColor/checkerboard/glass.
- Transparent mode: `gl.clear(0,0,0,0)` replaces checkerboard. Canvas CSS background = transparent.
- FluidBackground: evenodd SVG path mask. Outer rect = viewport, inner rounded-rect holes = excluded elements.
- Material class caches compiled shader variants by sorted keyword string key.
- Context loss/restore: handled via webglcontextlost/webglcontextrestored events. dispose() does NOT call loseContext() — the Svelte component does it separately for lazy instances. Distortion texture is re-loaded on context restore.
- Demo page: `<main>` has `pointer-events: none`; interactive elements re-enable individually so FluidBackground splats work across full page width.
- Playground: `loadConfig()` calls `resetAllDefaults()` first, then applies overrides from `PRESET_CONFIGS`. For reveal configs, sets `prevMode = targetMode` to skip the physics snapshot $effect. URL hash uses compact short keys serialized as base64 JSON. Glass enable stores `shapeBeforeGlass` and restores on glass disable.
