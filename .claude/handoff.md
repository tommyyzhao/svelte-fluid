# Session Handoff — 2026-04-23 (session 9)

## Project

svelte-fluid — WebGL Navier-Stokes fluid simulation as a Svelte 5 component library. MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.

Repo: github.com/tommyyzhao/svelte-fluid · Branch: main · Latest commit: ccfb57d

## Current state

- 134 tests, all passing. 0 type errors. Build + publint clean.
- 10 presets: LavaLamp (glass+roundedRect), Plasma (inward jets, rectangular), InkInWater (dark water+bloom), FrozenSwirl (circle), Aurora, ToroidalTempest (annulus+high-velocity ring), CircularFluid, FrameFluid, AnnularFluid, SvgPathFluid (ampersand glyph)
- 5 container shapes: circle, frame, roundedRect, annulus, svgPath (mask texture)
- Glass post-processing: hemisphere dome (circles, with rim effects via glassThickness) and rim model (all others)
- FluidReveal: multiplicative dissipation, inverted-dye display shader, iridescent fringes
- FluidBackground: full-viewport fluid with DOM exclusion zones
- 29 ADRs, 6 learning docs, architecture.md, porting-notes.md, contributing.md
- ~28 demo instances on the main page (27 cards + FluidBackground)
- Every demo card has a `</>` code toggle + "Customize" button (presets, configs, glass cards)
- Playground with Fluid/Reveal mode toggle, accordion ControlPanel, URL hash state sharing
- 4 extra routes: `/background-fluid`, `/fluid-reveal/`, `/svelte-fluid`, `/svg`
- CI runs tests + type-check + publint + build on every push. GitHub Pages auto-deploys.
- Package ready for `npm publish --access public --provenance`.

## What this session built

1. **Plasma reverted to original design** — removed annulus container, restored 8 inward compass-point jets on rectangular canvas with `randomSplatRate={0.4}`, no container shape.

2. **ToroidalTempest preset** (`src/lib/presets/ToroidalTempest.svelte`) — 6th visual preset based on old Plasma's annulus ring but with V=300 tangential velocity (5× higher), curl=50, bloomIntensity=1.8, 2s re-injection interval. Exported from `src/lib/index.ts`.

3. **Playground completely redesigned** (`src/routes/components/ControlPanel.svelte`, `src/routes/+page.svelte`):
   - **Fluid/Reveal mode toggle** — pill buttons at top of ControlPanel. Fluid mode shows `<Fluid>` canvas; Reveal mode swaps to `<FluidReveal>` wrapping sample content with `{#key revealAutoReveal}` for autoReveal remount.
   - **Accordion ControlPanel** — 7 collapsible sections with blue "N changed" badges. Pinned quick-controls bar (curl, splatRadius, densityDissipation, bloom, glass, shape picker). Reveal mode shows separate streamlined controls.
   - **"Customize" buttons** on all preset, config, and glass effect cards. `loadConfig()` resets all defaults first via `resetAllDefaults()`, then applies config overrides, then scrolls to playground.
   - **URL hash state** — `#pg=<base64 JSON>` with short keys. Covers all physics, glass, container shape, reveal params. "Share" button copies URL. `history.replaceState` debounced 300ms.
   - **Reveal content controls** — accent color picker, "Gradient + Text" / "Tile Mosaic" content selector.
   - **Code output** — `buildSnippet()` generates `<Fluid>` or `<FluidReveal>` based on mode.

4. **Card component updated** (`src/routes/components/Card.svelte`) — added optional `onCustomize` callback, "Customize" button with hover styling.

5. **Code snippets updated** — all 6 preset cards show full `<Fluid>` equivalent props. All 4 reveal cards include exact CSS gradient stops and FluidReveal props.

6. **Audit and fixes** — Sonnet review council found 27 issues. Fixed: loadConfig dirty state bleed (#8), dead HASH_KEYS array (#4), incomplete URL serialization (#5), stale preset count (#11), incomplete PRESET_CONFIGS (#7/#24/#26), shape badge counting (#12), reset mode (#13), glass hint as button (#19), config cards missing Customize (#16), magic numbers in loadConfig (#18), inline font-size (#25).

## Planned fixes for NEXT session

**IMPORTANT**: Read `.claude/planned-fixes.md` for the full implementation plan. Delete that file after completing all items.

Key items from the plan:
1. **Reveal content controls** — single accent color (gradient is always `accent → transparent`), rename labels ("Underlying Content", "Gradient + Text", "Tile Mosaic")
2. **Reveal physics defaults** — switching to Reveal mode should snap to FluidReveal defaults (curl=0, velocityDissipation=0.9, splatRadius=0.2), store/restore Fluid physics on mode switch
3. **`</>` code preview** as inline dropdown (like Cards) instead of "Copy code" button
4. **FluidBackground code preview** — `</>` button in top-right showing FluidBackground usage
5. **Customize on ALL remaining cards** — container shape cards, reveal cards (switches to Reveal mode)
6. **Share button "Copied!" feedback**
7. **Language audit** — "Even spacing", "Show shape outline", no leaked bucket terminology

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
| src/lib/presets/ToroidalTempest.svelte | Annulus ring, V=300 tangential splats, periodic re-injection |
| src/routes/+page.svelte (~1050 LOC) | Demo page: ~28 instances, FluidBackground wrapper, playground state, loadConfig, URL hash, PRESET_CONFIGS |
| src/routes/components/ControlPanel.svelte (~850 LOC) | Playground controls: mode toggle, accordion sections with badges, quick controls, code generation |
| src/routes/components/Card.svelte | Demo card: canvas slot, caption, `</>` code toggle, Customize button |
| docs/architecture.md | Start here for understanding the system |

## What needs attention next

### Immediate (from planned-fixes.md — delete after completing)

1. **Reveal content & color controls** — single accent color, `accent → transparent` gradient, labels renamed, physics snap to FluidReveal defaults on mode switch
2. **Customize on ALL cards** — container shape cards, reveal cards (with mode switch)
3. **Code preview as `</>` dropdown** — consistent pattern with Cards, replaces "Copy code" button
4. **FluidBackground code preview** — floating `</>` in top-right
5. **Share button feedback** — "Copied!" flash
6. **Language audit** — label improvements throughout ControlPanel

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
16. **Card Copy button feedback** — "Copied!" flash (finding #15 from audit).

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
- Playground: `loadConfig()` calls `resetAllDefaults()` first, then applies overrides from `PRESET_CONFIGS`. URL hash uses compact short keys (`cu`=curl, `sr`=splatRadius, etc.) serialized as base64 JSON.
