# Session Handoff — 2026-04-24 (session 11)

## Project

svelte-fluid — WebGL Navier-Stokes fluid simulation as a Svelte 5 component library. MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.

Repo: github.com/tommyyzhao/svelte-fluid · Branch: main · Latest commit: 2b3ed7a

## Current state

- 134 tests, all passing. 0 type errors. Build + publint clean.
- 10 presets: LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora, ToroidalTempest, CircularFluid, FrameFluid, AnnularFluid, SvgPathFluid
- 5 container shapes: circle, frame, roundedRect, annulus, svgPath (mask texture)
- Glass post-processing: hemisphere dome (circles) and rim model (all others)
- FluidReveal: multiplicative dissipation, customizable cover/accent colors (ADR-0029), iridescent fringes
- FluidBackground: full-viewport fluid with DOM exclusion zones
- 29 ADRs, 6 learning docs, architecture.md, porting-notes.md, contributing.md
- ~28 demo instances on the main page (27 cards + FluidBackground)
- Every demo card has `</>` code toggle + "Customize" button
- Playground with Fluid/Reveal mode toggle, accordion ControlPanel, URL hash state, `</>` code preview
- Floating `</>` button for FluidBackground code snippet
- 4 extra routes: `/background-fluid`, `/fluid-reveal/`, `/svelte-fluid`, `/svg`
- CI runs tests + type-check + publint + build on every push. GitHub Pages auto-deploys.
- Package ready for `npm publish --access public --provenance`.

## What this session built

1. **Playground UX bug fixes**:
   - Shape dropdown "Rectangle" (was "none") now works: `containerShape` derived returns `null` instead of `undefined` so the engine processes it.
   - Glass auto-switch to roundedRect now remembers the previous shape in `shapeBeforeGlass` and restores it when glass is unchecked.
   - "Rectangle" `<option>` disabled when glass is on, with tooltip "Glass requires a container shape".
   - Container Shape accordion hidden when shape is Rectangle (was showing empty section).
   - 7 missing URL hash serialization variables added: `randomSplatDx`, `randomSplatDy`, `randomSplatEvenSpacing`, `revealAutoRevealSpeed`, `revealContent`, `revealCoverColor`, `revealAccentColor`. Also added to the hash-push $effect tracking array.

2. **Text mask glyph centering** (`FluidEngine.ts:initMaskTexture()`):
   - `textBaseline` was set to `'middle'` after `measureText`, so ascent/descent measured from alphabetic baseline but drawing used em-square midpoint. Glyphs like `&` were visually off-center and clipped.
   - Fixed: set `textBaseline: 'alphabetic'` and `textAlign: 'center'` before `measureText`, then offset `fillText` by `(ascent - descent) / 2` for true visual centering.

3. **Label standardization** (ControlPanel.svelte):
   - All checkbox labels → sentence case: bloom→Bloom, glass→Glass, shading→Shading, sunrays→Sunrays, transparent→Transparent, paused→Paused, splatOnHover→Splat on hover, fadeBack→Fade back, autoReveal→Auto-reveal, colorful→Cycle colors.
   - Shape dropdown → capitalized: circle→Circle, frame→Frame, roundedRect→Rounded rect, annulus→Ring. Label "shape"→"Shape".
   - `glassChromatic` → "Color fringing". `autoRevealSpeed` → "Auto-reveal speed".

4. **Control layout improvements**:
   - `densityDissipation` moved from quick-controls bar to Physics accordion section.
   - `Paused` moved from Visuals section to quick-controls row (alongside Bloom, Glass).
   - `bloomIntensity` slider hidden when bloom is off. `sunraysWeight` slider hidden when sunrays is off.
   - `initialDensityDissipation` / duration: added field hint explaining construct-only semantics ("applied at engine start only"). Duration label changed to "Ramp duration (s)".

5. **"Annulus" → "Ring"** throughout user-facing UI:
   - Dropdown label, card title ("Ring"), card description ("Fluid flowing in a ring between two circles"), PRESET_CONFIGS key, Portal ring description. Internal `type: 'annulus'` in ContainerShape API unchanged.

6. **Comprehensive jargon cleanup** across all card descriptions and extra routes:
   - Snell's law → optical refraction; Fresnel → soft edge reflections; chromatic aberration → rainbow color fringing; analytical shapes → built-in shapes; volumetric bloom → soft glow; velocity decay → slowdown; Lissajous → automated cursor pattern; Navier-Stokes → Fluid Simulation; annuli → rings; India ink → Deep blue ink; churning vortex → rapid color jets; whirlpool → flash-frozen; fadeBack={false} → disable fade-back.

7. **Inaccurate description fixes**:
   - Plasma: "churning vortex at the center" → "strong curl and vivid bloom lighting up a dark canvas"
   - Ink in Water: "India ink sinking" → "Deep blue ink diffusing" (ink is blue, not black; nothing sinks)
   - Frozen Swirl: "icy whirlpool" → "cyan dye flash-frozen" (velocity dies instantly, no ongoing whirlpool)

## Key files

| File | Role |
|------|------|
| src/lib/engine/FluidEngine.ts (~1620 LOC) | The engine: WebGL state, physics step, render, dispose, mask texture (text centering fix here), glass pass, reveal path, multiplicative dissipation |
| src/lib/Fluid.svelte (~420 LOC) | Svelte wrapper: DOM, ResizeObserver, adaptive resolution, lazy/autoPause, context slot management. Destructures ALL FluidConfig props including revealCoverColor. |
| src/lib/FluidReveal.svelte (~300 LOC) | Fluid as opacity mask: coverColor/accentColor props, derived dye injection color, manual pointer handling, auto-reveal Lissajous |
| src/lib/FluidBackground.svelte (~180 LOC) | Full-viewport fluid background with DOM exclusion via CSS selector |
| src/lib/engine/gl-utils.ts | WebGL utilities: Material class (keyword shader variants), FBO create/resize/dispose, shader compile |
| src/lib/engine/shaders.ts | All GLSL: advection (with uMultiplicative), display (with REVEAL coverColor), glass, container mask |
| src/lib/engine/types.ts | FluidConfig (with revealCoverColor), ResolvedConfig, ContainerShape (5 variants), FluidHandle |
| src/routes/+page.svelte (~1500 LOC) | Demo page: ~28 instances, FluidBackground wrapper, playground state, loadConfig (with reveal mode support), URL hash, PRESET_CONFIGS (Ring not Annulus), customContainerShape, shapeBeforeGlass |
| src/routes/components/ControlPanel.svelte (~1120 LOC) | Playground controls: mode toggle, accordion sections with badges, quick controls (curl, splatRadius, Bloom, Glass, Paused, Shape), code generation, cover/accent color pickers |
| src/routes/components/Card.svelte | Demo card: canvas slot, caption, `</>` code toggle, Customize button, "Copied!" feedback |
| src/routes/background-fluid/+page.svelte | Extra route: background fluid demo with feature cards (jargon cleaned up) |
| src/routes/fluid-reveal/+page.svelte | Extra route: FluidReveal demos (Lissajous description fixed) |

## What needs attention next

### Planned features

1. **npm publish** — Package is ready. Run `npm publish --access public --provenance`. Create a GitHub release with tag `v0.1.0`.
2. **Test gaps** — Priority 1: dispose() cleanup, setConfig() bucket transitions, context loss/restore. Priority 2: FluidBackground DOM exclusion, glass post-processing.
3. **Changesets setup** — `@changesets/cli` for automated CHANGELOG + npm publish + GitHub releases.

### Known issues

4. **~28 demo instances + background** — Exceeds browser's ~16 WebGL context limit. The loseContext() fix in lazy teardown releases slots, but fast scrolling can still briefly exceed the cap.
5. **FluidReveal pointer-events limitation** — Canvas sits above content; interactive elements can't receive clicks. Documented in JSDoc.
6. **`{#key revealAutoReveal}` remount semantics** — toggling autoReveal destroys/rebuilds the fluid state. Needed because autoReveal starts in `onMount`. Accepted tradeoff.

### Follow-ups

7. **Named glass presets** — `glass="crystal"`, `glass="frosted"`, `glass="orb"`.
8. **Animated specular drift** — Slow sinusoidal light direction wobble when cursor is idle.
9. **FluidReveal interactive content** — Proper event forwarding so revealed buttons/links work.

## Architecture quick-reference

- Engine is per-instance, no module-level mutable state. Each canvas gets its own WebGL context.
- Fluid.svelte applies adaptive resolution in instantiate() before constructing the engine — caps textures to canvas pixel size, suppresses expensive effects on small canvases.
- Resize: teardown immediately (blank canvas), debounce rebuild by 150ms.
- Lazy teardown: dispose engine + loseContext() (releases browser context slot). Rebuild: restoreContext() + wait for webglcontextrestored event + create new engine.
- setConfig() has 4 buckets: A (scalars incl. splatOnHover, glass params, revealSensitivity, revealCurve, revealCoverColor — picked up next frame), B (keyword recompile — shading, bloom, sunrays, reveal), C (FBO rebuild), D (construct-only). Additionally, svgPath shape changes trigger mask texture rebuild, `glass` toggle triggers sceneFBO alloc/dispose, and `reveal` toggle triggers keyword recompile.
- Container shapes: two approaches coexist:
  - **Analytical** (circle/frame/roundedRect/annulus): SDF computed per-fragment in shaders, mirrored in TypeScript for rejection sampling.
  - **Mask texture** (svgPath): rasterized via OffscreenCanvas at canvas aspect ratio, uploaded as R8/LUMINANCE texture. Text mode uses alphabetic baseline with `(ascent - descent) / 2` offset for visual centering.
- Glass post-processing: two models. **Hemisphere** (circles): full-surface dome with Snell's law; `glassThickness` boosts rim refraction, specular, and glow. **Rim** (all others): refraction band at container boundary. Glass requires a container shape — `CONTAINER_SHAPE` must be non-null. When shape is 'none' (Rectangle), glass is not applicable because there's no visible boundary to refract around (the canvas edges are clipped by CSS).
- Reveal mode: `REVEAL` keyword in display shader outputs `max(uRevealCoverColor - c, vec3(0.0))` with non-premultiplied alpha. Advection switches to multiplicative dissipation via `uMultiplicative` uniform. Render path skips backColor/checkerboard/glass when REVEAL is active. FluidReveal derives dye injection color as `max(coverColor - accentColor, 0)`.
- Transparent mode: `gl.clear(0,0,0,0)` replaces checkerboard. Canvas CSS background = transparent.
- FluidBackground: evenodd SVG path mask. Outer rect = viewport, inner rounded-rect holes = excluded elements.
- Material class caches compiled shader variants by sorted keyword string key.
- Context loss/restore: handled via webglcontextlost/webglcontextrestored events. dispose() does NOT call loseContext() — the Svelte component does it separately for lazy instances.
- Demo page: `<main>` has `pointer-events: none`; interactive elements re-enable individually so FluidBackground splats work across full page width.
- Playground: `loadConfig()` calls `resetAllDefaults()` first, then applies overrides from `PRESET_CONFIGS`. For reveal configs, sets `prevMode = targetMode` to skip the physics snapshot $effect. URL hash uses compact short keys serialized as base64 JSON. Glass enable stores `shapeBeforeGlass` and restores on glass disable.
