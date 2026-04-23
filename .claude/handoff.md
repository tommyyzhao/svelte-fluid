# Session Handoff — 2026-04-23 (session 10)

## Project

svelte-fluid — WebGL Navier-Stokes fluid simulation as a Svelte 5 component library. MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.

Repo: github.com/tommyyzhao/svelte-fluid · Branch: main · Latest commit: faddc47

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

1. **Reveal cover/accent color props** (ADR-0029):
   - `revealCoverColor: RGB` added to FluidConfig (Bucket A). Shader changed from `1.0 - c` to `max(uRevealCoverColor - c, vec3(0.0))`. Default white → pixel-identical behavior.
   - `FluidReveal.coverColor` and `FluidReveal.accentColor` props. Dye injection derived as `max(cover - accent, 0)` per channel. No engine uniform for accent — it lives entirely in FluidReveal.
   - `Fluid.svelte` updated to destructure and forward `revealCoverColor` in props + `buildConfig()`.

2. **Customize on ALL demo cards** — every card now has Customize + PRESET_CONFIGS:
   - Config cards: Default
   - Container shapes: Circle, Frame, Annulus, Rounded frame, SVG path, Text glyph
   - Glass effects: Portal ring, Glass frame
   - Reveal cards: Scratch to reveal, Permanent reveal, Auto-reveal, Soft reveal
   - `loadConfig()` updated to handle `playgroundMode: 'reveal'` (applies reveal physics defaults, skips snapshot $effect via `prevMode` sync).
   - `customContainerShape` state enables svgPath shapes in playground (cleared on dropdown change).

3. **Physics snapshot on Reveal mode switch**:
   - Switching to Reveal: snapshots curl/velocityDissipation/splatRadius/bloom/sunrays/shading, applies reveal defaults (curl=0, vd=0.9, sr=0.2, bloom/sunrays/shading off).
   - Switching back to Fluid: restores snapshot.
   - Uses `untrack()` to prevent circular $effect dependencies.

4. **`</>` code preview redesign**:
   - ControlPanel: "Copy code" button replaced with `</>` toggle showing inline code panel + Copy button (same pattern as Card component).
   - FluidBackground: floating `</>` button (fixed top-right) with expandable code panel showing exact FluidBackground props.

5. **UX polish**:
   - Share button "Copied!" feedback (1.8s flash).
   - Card copy button "Copied!" feedback.
   - Label audit: "Even spacing", "Show shape outline".
   - Underlying content section simplified (type dropdown only, colors invariant).
   - Reveal playground default curve changed to 0.25.
   - `controlsRef` typed with proper `FluidHandle` import.
   - `planned-fixes.md` deleted (all items completed).

## Key files

| File | Role |
|------|------|
| src/lib/engine/FluidEngine.ts (~1620 LOC) | The engine: WebGL state, physics step, render, dispose, mask texture, glass pass, reveal path, multiplicative dissipation |
| src/lib/Fluid.svelte (~420 LOC) | Svelte wrapper: DOM, ResizeObserver, adaptive resolution, lazy/autoPause, context slot management. Destructures ALL FluidConfig props including revealCoverColor. |
| src/lib/FluidReveal.svelte (~300 LOC) | Fluid as opacity mask: coverColor/accentColor props, derived dye injection color, manual pointer handling, auto-reveal Lissajous |
| src/lib/FluidBackground.svelte (~180 LOC) | Full-viewport fluid background with DOM exclusion via CSS selector |
| src/lib/engine/gl-utils.ts | WebGL utilities: Material class (keyword shader variants), FBO create/resize/dispose, shader compile |
| src/lib/engine/shaders.ts | All GLSL: advection (with uMultiplicative), display (with REVEAL coverColor), glass, container mask |
| src/lib/engine/types.ts | FluidConfig (with revealCoverColor), ResolvedConfig, ContainerShape (5 variants), FluidHandle |
| src/routes/+page.svelte (~1100 LOC) | Demo page: ~28 instances, FluidBackground wrapper, playground state, loadConfig (with reveal mode support), URL hash, PRESET_CONFIGS, customContainerShape |
| src/routes/components/ControlPanel.svelte (~1100 LOC) | Playground controls: mode toggle, accordion sections with badges, quick controls, code generation, cover/accent color pickers |
| src/routes/components/Card.svelte | Demo card: canvas slot, caption, `</>` code toggle, Customize button, "Copied!" feedback |
| docs/decisions/0029-reveal-cover-accent-colors.md | ADR for cover/accent color architecture |
| docs/architecture.md | System design — Bucket A now lists revealSensitivity, revealCurve, revealCoverColor |

## What needs attention next

### User-reported playground issues (DO NOT FIX — document only)

1. **Shape "none" label** — should say "Rectangle" or "Full canvas" instead of "none". The default shape is the full rectangular canvas, not "no shape."

2. **Glass + "none" shape → auto-circle is wrong** — when enabling glass from the default shape, the `$effect` switches containerShapeType to `'circle'` (hemisphere dome). The user expects either: (a) glass applied to the rectangle (rim refraction around the canvas edge), or (b) switch to `'roundedRect'` instead of `'circle'`. Investigate whether glass-on-full-canvas is feasible. If not, default to roundedRect. The offending code is the `$effect` at +page.svelte line ~109: `if (glass && containerShapeType === 'none') containerShapeType = 'circle'`.

3. **initialDensityDissipation / initialDensityDissipationDuration controls do nothing visible** — these are construct-only (Bucket D) params that affect the first N seconds after engine creation. Changing them at runtime via setConfig has no effect because the engine's internal timer has already elapsed. To make them previewable: consider adding a "restart simulation" button, or re-creating the engine when these change, or moving them to a separate "Initial Conditions" section with a restart action.

4. **initialDensityDissipationDuration naming is unclear** — the relationship: `densityDissipation` is the steady-state value; `initialDensityDissipation` is the starting value; `initialDensityDissipationDuration` is how many seconds to linearly interpolate from initial → steady-state. Consider renaming to something like `dissipationRampDuration` or adding inline help text explaining the ramp.

5. **densityDissipation placement** — currently in the quick-controls bar at the top. User expects it in the "Physics" accordion section alongside velocityDissipation, pressure, etc. Consider moving it to Physics and replacing the quick-controls slot with something else (or keeping it in both places).

6. **"colorful" label is not self-explanatory** — the prop cycles pointer color over time (HSV rotation). Consider renaming the label to "Cycle colors" or adding a tooltip/description.

### Planned features

7. **npm publish** — Package is ready. Run `npm publish --access public --provenance`. Create a GitHub release with tag `v0.1.0`.
8. **Test gaps** — Priority 1: dispose() cleanup, setConfig() bucket transitions, context loss/restore. Priority 2: FluidBackground DOM exclusion, glass post-processing.
9. **Changesets setup** — `@changesets/cli` for automated CHANGELOG + npm publish + GitHub releases.

### Known issues

10. **~28 demo instances + background** — Exceeds browser's ~16 WebGL context limit. The loseContext() fix in lazy teardown releases slots, but fast scrolling can still briefly exceed the cap.
11. **FluidReveal pointer-events limitation** — Canvas sits above content; interactive elements can't receive clicks. Documented in JSDoc.
12. **`{#key revealAutoReveal}` remount semantics** — toggling autoReveal destroys/rebuilds the fluid state. Needed because autoReveal starts in `onMount`. Accepted tradeoff.

### Follow-ups

13. **Named glass presets** — `glass="crystal"`, `glass="frosted"`, `glass="orb"`.
14. **Animated specular drift** — Slow sinusoidal light direction wobble when cursor is idle.
15. **FluidReveal interactive content** — Proper event forwarding so revealed buttons/links work.

## Architecture quick-reference

- Engine is per-instance, no module-level mutable state. Each canvas gets its own WebGL context.
- Fluid.svelte applies adaptive resolution in instantiate() before constructing the engine — caps textures to canvas pixel size, suppresses expensive effects on small canvases.
- Resize: teardown immediately (blank canvas), debounce rebuild by 150ms.
- Lazy teardown: dispose engine + loseContext() (releases browser context slot). Rebuild: restoreContext() + wait for webglcontextrestored event + create new engine.
- setConfig() has 4 buckets: A (scalars incl. splatOnHover, glass params, revealSensitivity, revealCurve, revealCoverColor — picked up next frame), B (keyword recompile — shading, bloom, sunrays, reveal), C (FBO rebuild), D (construct-only). Additionally, svgPath shape changes trigger mask texture rebuild, `glass` toggle triggers sceneFBO alloc/dispose, and `reveal` toggle triggers keyword recompile.
- Container shapes: two approaches coexist:
  - **Analytical** (circle/frame/roundedRect/annulus): SDF computed per-fragment in shaders, mirrored in TypeScript for rejection sampling.
  - **Mask texture** (svgPath): rasterized via OffscreenCanvas at canvas aspect ratio, uploaded as R8/LUMINANCE texture. Text mode uses actualBoundingBox metrics for sizing.
- Glass post-processing: two models. **Hemisphere** (circles): full-surface dome with Snell's law; `glassThickness` boosts rim refraction, specular, and glow. **Rim** (all others): refraction band at container boundary.
- Reveal mode: `REVEAL` keyword in display shader outputs `max(uRevealCoverColor - c, vec3(0.0))` with non-premultiplied alpha. Advection switches to multiplicative dissipation via `uMultiplicative` uniform. Render path skips backColor/checkerboard/glass when REVEAL is active. FluidReveal derives dye injection color as `max(coverColor - accentColor, 0)`.
- Transparent mode: `gl.clear(0,0,0,0)` replaces checkerboard. Canvas CSS background = transparent.
- FluidBackground: evenodd SVG path mask. Outer rect = viewport, inner rounded-rect holes = excluded elements.
- Material class caches compiled shader variants by sorted keyword string key.
- Context loss/restore: handled via webglcontextlost/webglcontextrestored events. dispose() does NOT call loseContext() — the Svelte component does it separately for lazy instances.
- Demo page: `<main>` has `pointer-events: none`; interactive elements re-enable individually so FluidBackground splats work across full page width.
- Playground: `loadConfig()` calls `resetAllDefaults()` first, then applies overrides from `PRESET_CONFIGS`. For reveal configs, sets `prevMode = targetMode` to skip the physics snapshot $effect. URL hash uses compact short keys serialized as base64 JSON.
