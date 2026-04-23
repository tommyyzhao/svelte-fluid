# Changelog

All notable changes to **svelte-fluid** are documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [semantic versioning](https://semver.org/spec/v2.0.0.html):

- **patch** — bug fixes, doc fixes, internal refactors
- **minor** — new presets, new props, additive engine features
- **major** — breaking API changes

## [Unreleased]

### Added

- **`<ToroidalTempest>` preset** — 6th visual preset. Full-spectrum storm
  circulating in an annular ring with high-velocity (V=300) tangential splats,
  curl=50, periodic re-injection every 2s. Fills the odd-count gap in the
  2-column preset grid.
- **Playground Fluid/Reveal mode toggle** — pill toggle switches between
  `<Fluid>` canvas and `<FluidReveal>` wrapping actual sample content
  (gradient+text or tile mosaic). Reveal mode shows the real scratch-to-reveal
  interaction with content underneath.
- **Accordion ControlPanel** — 7 collapsible sections (Physics, Random Splats,
  Visuals, Resolution, Background, Container Shape, Glass) with blue "N changed"
  badges on each header. Pinned quick-controls bar always shows curl,
  splatRadius, densityDissipation, bloom, glass, shape picker.
- **"Customize" button on demo cards** — every preset, config, and glass effect
  card has a Customize button that loads its config into the playground and
  scrolls to it. Uses `loadConfig()` which resets to defaults first, then
  applies overrides.
- **URL hash state** — playground state serialized to `#pg=<base64 JSON>` via
  `history.replaceState` (debounced 300ms). Covers all physics, glass sub-params,
  container shape sub-params, reveal settings. "Share" button copies URL.
  Back button works as undo.
- **Reveal playground color picker** — accent color picker for the gradient
  behind the reveal mask.
- **Code snippets show full `<Fluid>` equivalents** — every preset card snippet
  now shows both the preset shorthand and the equivalent `<Fluid>` configuration
  with all physics props.
- **Reveal snippets include exact CSS** — all 4 reveal card snippets include
  gradient stops, layout styles, and FluidReveal props.

### Fixed

- **Playground reveal mode was broken** — toggling `reveal={true}` on `<Fluid>`
  showed transparency to the page background with nothing to reveal. Now uses
  actual `<FluidReveal>` wrapping sample content.
- **`loadConfig` dirty state bleed** — loading a preset config left previous
  state (e.g., randomSplatRate, glass settings) from prior customization.
  Now calls `resetAllDefaults()` before applying overrides.
- **`buildRevealSnippet` wrong defaults** — compared against hardcoded
  FluidReveal defaults instead of the playground's `D.*` defaults, producing
  misleading code output with spurious "changed" props.
- **`reset()` didn't reset playground mode** — clicking Reset in Reveal mode
  reset all sliders but stayed in Reveal mode. Now resets to Fluid mode.
- **Shape badge only counted type change** — now counts sub-param changes
  (cx, cy, radius, innerRadius, outerRadius) in the badge number.
- **Glass accordion hint was passive text** — "Enable glass in quick controls
  above" is now a clickable button that sets `glass = true`.
- **Stale preset count copy** — "Eight presets" updated to "six visual presets
  and four shape presets" in page copy and og:description.

### Changed

- **Plasma preset reverted** to original rectangular canvas design — 8 inward
  compass-point jets converging at center, `randomSplatRate={0.4}`, no container
  shape. The annulus ring design moved to ToroidalTempest.
- **PRESET_CONFIGS enriched** — added `initialDensityDissipation`,
  `initialDensityDissipationDuration` to LavaLamp/Plasma/ToroidalTempest;
  `randomSplatSpread`/`randomSplatSwirl` to Crystal orb;
  `randomSplatCount` to Soft lens.

- **Multiplicative dissipation for reveal mode** (ADR-0028) — advection shader
  now supports `uniform float uMultiplicative`. When `reveal=true`, the engine
  sets it to 1.0, switching from `result / (1 + dissipation * dt)` to
  `dissipation * result`, matching the Ascend-Fluid reference physics.
- **Hemisphere rim effects via `glassThickness`** — the circle glass model now
  uses `uGlassThickness` to boost refraction displacement, rim specular, and
  rim glow at the dome edge. Previously `glassThickness` was unused for circles.
- **Curl skip optimization** — `step()` skips curl + vorticity compute passes
  when `CURL === 0`, saving 2 draw calls per frame for reveal and flat configs.

### Fixed

- **FluidReveal y-coordinate inversion** — the manual pointer handler passed
  DOM-space y (0=top) to `engine.splat()` which expects GL-space y (0=bottom).
  Splats now appear where the cursor actually is.
- **FluidReveal CSS sizing** — `.svelte-fluid-reveal` and its content div now
  set `width: 100%; height: 100%` so the component fills its parent container.
- **Lazy teardown releases WebGL context slots** (`Fluid.svelte`) — after
  `engine.dispose()`, lazy instances now call `loseContext()` via the
  `WEBGL_lose_context` extension to free the browser's context slot (~16 cap).
- **Text-mode mask sizing** — `initMaskTexture()` text height now uses
  `actualBoundingBoxAscent + actualBoundingBoxDescent` instead of a hardcoded
  `refSize * 1.2`, fixing glyph clipping at large font sizes.

### Changed

- **FluidReveal display shader** — output changed from premultiplied flat
  cover color `vec4(coverColor * alpha, alpha)` to non-premultiplied inverted
  dye `vec4(1.0 - c, alpha)`. Produces sharp iridescent fringes at reveal
  edges matching the Ascend-Fluid reference.
- **FluidReveal physics defaults** — fully revised for multiplicative mode:
  - `sensitivity`: 0.12 → **0.1** (matches reference `pow(0.1 * a, 0.1)`)
  - `velocityDissipation`: 3 → **0.9** (multiplicative: 90% retention/frame)
  - `splatRadius`: 0.4 → **0.2** (tighter reveal strokes)
  - `REVEAL_DYE`: `{0.15, 0.15, 0.15}` → `{0.95, 0.84, 0.68}` (non-uniform
    warm dye creates blue-tinted iridescent fringes when inverted)
  - `fadeBack` dissipation: 0.97 → **0.995** (multiplicative slow fade)
  - permanent dissipation: 0 → **1.0** (multiplicative no-fade)
- **`coverColor` prop removed** from `FluidRevealProps`, `FluidConfig`,
  `ResolvedConfig`, and the display shader uniform. The inverted-dye approach
  replaces it.
- **`revealSensitivity` default**: 0.12 → **0.1** (engine + component).
- **Preset modernization** — all presets now use container shapes and
  latest features:
  - **LavaLamp**: added `roundedRect` container + `glass` (rim refraction)
  - **Plasma**: changed to `annulus` container, 8 tangential ring splats with
    periodic re-injection (2.5s interval with positional jitter),
    `velocityDissipation: 0.02`
  - **InkInWater**: full rewrite — dark water background, volumetric bloom,
    shading, 5 chromatically varied ink droplets, physics tuned for
    realistic ink-in-water behavior
  - **FrozenSwirl**: added `circle` container
  - **SvgPathFluid**: changed from star path to bold ampersand "&" glyph
    using text-mode rasterization with `fillRule: 'evenodd'`
- **Demo page Container shapes** — swapped Rounded frame / Rounded rect order;
  replaced Rounded rect with SVG path lightning bolt; renamed SVG star card
  to "Text glyph".
- **Demo page Container effects** — Crystal orb gets `glassThickness={0.08}`;
  Soft lens gets faster splats (`rate: 2.5`, `count: 2`, lower dissipation);
  Glass frame gets much faster splats (`rate: 3.0`, `count: 2`,
  `randomSplatSwirl={350}`).
- **Semantic language audit** — replaced "plasma", "energy field", "tokamak",
  "confined/confinement" with accurate fluid terminology across all presets,
  demo cards, types.ts JSDoc, README, CHANGELOG, ADRs, and learnings docs.

### Removed

- **`/ascend-fluid` route** (~650 LOC) — standalone reference implementation,
  obsolete now that FluidReveal matches its physics.
- **`coverColor` / `revealCoverColor`** — prop, config field, engine default,
  resolveConfig mapping, shader uniform, and all demo page usage.

### Previously added

- **`<FluidReveal>` component** — fluid simulation as an opacity mask over
  slotted content. Cursor movement injects dye which the `REVEAL` display
  shader converts to transparency, revealing children underneath. Props:
  `coverColor`, `sensitivity`, `curve`, `fadeBack`, `fadeSpeed`, `autoReveal`,
  `autoRevealSpeed`, `lazy`, `autoPause`. See ADR-0027.
- **`reveal` display mode** (engine-level) — new `REVEAL` keyword in the
  display shader outputs premultiplied `vec4(coverColor * alpha, alpha)`.
  New config fields: `reveal` (Bucket B), `revealCoverColor`,
  `revealSensitivity`, `revealCurve` (all Bucket A).
- **`/fluid-reveal/` demo route** — 5 test instances: default reveal, custom
  cover color, auto-reveal animation, soft edges, circular reveal zone.
- **Reveal section on main demo page** — 4 cards (scratch-to-reveal, permanent
  reveal, auto-reveal, soft reveal) with code snippets. All lazy.
- ADR-0027: FluidReveal — fluid as opacity mask.
- 9 new tests for reveal alpha curve math and cover color normalization
  (`src/lib/engine/__tests__/reveal.test.ts`).
- **`<FluidBackground>` component** — full-viewport fluid canvas that sits
  behind page content with automatic DOM element exclusion. Accepts an
  `exclude` CSS selector prop; matched elements become "holes" the fluid
  physically cannot enter. Background-optimized defaults (`simResolution: 64`,
  `dyeResolution: 512`, `initialSplatCount: 0`). See ADR-0026.
- **`/background-fluid` demo route** — prototype page demonstrating
  FluidBackground with 6 feature cards, 5 embedded preset demos, and
  a "How it works" explainer. All cards are excluded from the fluid.
- **Rounded rect shape card** on the main demo page — new "Rounded rect"
  card in the Container shapes section, using `containerShape: { type:
  'roundedRect' }`. Shapes section now has 6 cards (was 5) for symmetric
  2-column layout.
- **`splatOnHover` prop on shape presets** — `CircularFluid`, `FrameFluid`,
  `AnnularFluid`, and `SvgPathFluid` now accept and forward `splatOnHover`.
- **FluidBackground wrapped main demo page** — the main `/` route uses
  `<FluidBackground>` as a page-level background behind all content.
- ADR-0026: FluidBackground component with DOM exclusion zones.

### Changed

- **`transparent` mode now truly transparent** — replaced the checkerboard
  background draw with `gl.clear()` to `(0,0,0,0)`. Canvas CSS background
  is automatically set to `transparent` when `transparent` or `reveal` is
  active. This enables proper alpha compositing with the page.
- **Hero title uses `transparent` mode** — "SVELTE FLUID" text now composites
  directly over the FluidBackground with no opaque rectangle.
- **Demo page pointer-events** — `<main>` set to `pointer-events: none` so
  background fluid splats work across the full page. Interactive elements
  (cards, links, code blocks, playground) re-enable pointer-events.
- Container shapes section description updated: "Five analytical shapes
  plus arbitrary SVG paths" (was "Four").

## [0.1.0] — Unreleased

### Added

- **SVG path container shapes** — new `{ type: 'svgPath' }` variant for
  `containerShape` confines fluid to arbitrary SVG paths or Canvas 2D
  text. Rasterized to a mask texture via `OffscreenCanvas` + `Path2D`.
  Supports `d` (SVG path data), `text` (Canvas2D fillText), `font`,
  `viewBox`, `fillRule`, and `maskResolution` fields. See ADR-0024.
- `SvgPathFluid` preset — fluid shaped by a mask texture (originally a star, now an ampersand glyph).
- `/svelte-fluid` route — "SVELTE FLUID" as fluid-filled text with
  `splatOnHover` interaction.
- `/svg` test route — 4 SVG path test cases (star, heart, rect, evenodd).
- 20 new tests for `svgPath` equality, CPU mask sampling, and
  `maskAreaFraction` (126 total, up from 106).
- **Glass refraction/reflection post-processing layer** — new `glass`
  prop adds a post-processing pass that simulates a glass container over
  the fluid. Two rendering models: **hemisphere orb** (circles) uses
  Snell's law via GLSL `refract()` for physically correct lens distortion
  across the entire surface; **rim model** (frame, roundedRect, annulus,
  svgPath) applies refraction at the container boundary. See ADR-0025.
  - `glass: boolean` (default false) — enables the glass pass. Allocates
    a sceneFBO (RGBA8, canvas resolution) when true.
  - `glassThickness: number` (default 0.04) — rim model band width in UV
    units. Ignored by the orb model. Bucket A.
  - `glassRefraction: number` (default 0.4, 0–1) — distortion strength.
    Mapped to IOR 1.0–2.0. Bucket A.
  - `glassReflectivity: number` (default 0.12, 0–1) — Fresnel F0 for
    specular intensity. Bucket A.
  - `glassChromatic: number` (default 0.15, 0–1) — chromatic aberration
    strength. Splits R/G/B into separate refraction channels. Bucket A.
  - Fluid-driven lighting: all specular and rim glow are modulated by
    the refracted fluid brightness. No fluid = no highlights.
  - New "Container effects" section on demo page with 4 cards: Crystal
    orb, Soft lens, Portal ring, Glass frame.
- **Mouse-tracked specular** — glass specular highlight follows the
  cursor via `uLightScreenPos` uniform. Always-on when glass is active.
- **Glass + transparent mode** — fixed checkerboard routing so `glass`
  and `transparent` work together. Glass shader outputs correct alpha
  per model (edgeFade for orb, glassMask/sdf for rim).
- Playground **glass controls** — ControlPanel gains a "Glass effect"
  section with `glass` toggle and sliders for thickness, refraction,
  reflectivity, chromatic. Auto-sets containerShape to circle when
  glass is toggled on without a shape.
- **Fluid-filled hero title** — home page `<h1>` replaced with two
  Fluid instances rendering "SVELTE" and "FLUID" as svgPath text
  containers with vigorous random splats.
- **Code snippets on demo cards** — Card component gains a `snippet`
  prop with `</>` toggle and Copy button. All 18 demo cards wired with
  copy-pasteable code showing the minimal props to reproduce each effect.
- `splatOnHover` prop — when true, moving the mouse over the canvas
  creates splats without requiring a click. The splat velocity follows
  the cursor movement. Hot-updatable (Bucket A).
- `engines` field in `package.json` (`>=18`).
- npm version badge in README.
- "Why this library?" differentiator section in README.
- Hero GIF showing 4 presets (LavaLamp, Aurora, InkInWater, CircularFluid).
- `/capture` route for recording hero media from a 2×2 preset grid.
- `bun run test` step in CI workflow — 106 tests now run on every push.
- `lazy` prop on `<Fluid />` and all preset wrappers — defers engine
  construction until the container enters the viewport (with a 200px
  rootMargin lookahead) and tears it down when it leaves. Recommended
  for any page with more than ~6 simultaneous instances. Bounds the
  live WebGL context count under the 8–16/tab browser cap.
- `aria-label` forwarding on every preset wrapper for accessibility.
- Demo playground gains a "Reset to defaults" button and a "Copy as
  code" button that emits the current slider state as a
  `<Fluid ... />` snippet.
- Demo gains a "Get started" block with install command and a 3-line
  usage example, plus a header link bar (GitHub, README, Docs,
  Contribute) and a footer link bar (GitHub, Issues, License).
- GitHub Actions CI workflow runs `check`, `prepack`, and `build` on
  every push and pull request.
- `CHANGELOG.md` (this file), `CODE_OF_CONDUCT.md`, `SECURITY.md`,
  GitHub issue templates, and a pull-request template.

### Changed

- Mask texture rasterized at canvas aspect ratio (not always square) —
  fixes vertical squish on non-square canvases for all `svgPath` shapes.
- SVG path mode uniform-scales the path to fit the mask rectangle,
  preserving the path's own aspect ratio with centering.
- Demo "Container shapes" section: 4 → 5 cards (added SVG path star).
  Description updated to mention SVG paths alongside analytical shapes.
- `buildSnippet` in playground `ControlPanel` now emits `randomSplat*`,
  `initialDensity*`, and `splatOnHover` fields when non-default.
- Bloom/sunrays auto-suppress on small canvases (<600px) now applies
  unconditionally — presets that explicitly pass `bloom={true}` no
  longer bypass the guard.
- Demo page: 15 → 21 instances (added 4 "Container effects" cards,
  2 fluid hero title instances). Container shapes description reverted
  from 6 → 5 cards.
- `FluidEngine.drawDisplay()` container shape uniform-setting extracted
  to `setContainerShapeUniforms()` helper, shared with `drawGlass()`.
- Demo page: removed invisible hero background (saved 1 WebGL context),
  reordered sections (presets first), fixed grid to 2 columns (no more
  3+1 asymmetry), moved shape presets to a "Container shapes" subsection
  under Configuration, added `splatOnHover` to config example cards.
- CircularFluid preset: `densityDissipation` 0.08 → 0.15, changed from
  5 splats every 2s to 1 splat every ~0.8s for more organic appearance.
- InkInWater preset: `randomSplatRate` 0.5 → 0.167 (3× slower drops).
- README: added npm/pnpm install options alongside bun, deduplicated
  feature bullets into "Why this library?" section, added `splatOnHover`
  to props table.
- Demo page copy: "seven presets" → "eight", "~28-prop" → "40+",
  `bun add` → `npm install`, rewrote card descriptions from raw prop
  syntax to human-readable prose.
- `RGB` interface now documents per-call-site unit conventions:
  `backColor` is **0–255** (CSS-style, normalized internally),
  `PresetSplat.color` and `FluidHandle.splat` are **0–1** linear with
  HDR allowed. The previous JSDoc on `backColor` incorrectly claimed
  0–1.
- `PresetSplat` docstring corrected: `dx`/`dy` are **not** multiplied
  by `splatForce` (only pointer-driven splats are scaled by it).
- `FluidConfig.pointerInput` is now **hot-updatable** (Bucket A) — the
  engine installs/removes canvas + window listeners on transition.
  Previously the scalar was updated but the listeners were never
  reconciled.
- `package.json` exports map gains `"import"` and `"default"`
  conditions for non-Svelte-aware bundlers (plain Vite, Webpack,
  Rollup, Astro non-Svelte adapters, bare Node imports). Previously
  only `"svelte"` and `"types"` were defined.
- `package.json` `sideEffects` corrected from `["**/*.css"]` (no CSS
  ships) to `false`, enabling full tree-shaking.
- Hero overlay in the demo now has a subtle dark gradient veil so
  foreground text reads against any colored fluid state.
- Demo `+page.svelte` LavaLamp card description corrected from "dim
  purple ambience" to "warm-silver background" (matches the actual
  preset).

### Fixed

- `hdrMultiplier` aspect correction for circle and annulus shapes —
  area fraction now divides by aspect (`pi*r^2 / aspect`), fixing
  over-bright bloom on wide canvases.
- `ShapePreview` outer boundary visibility — 3px translate+scale inset
  prevents frame shapes at `outerHalfW=0.5` from being clipped by the
  card's `overflow: hidden`.
- Default pointer color sentinel `b: 300` → `b: 0` (upstream heritage,
  never rendered, but out-of-range value cleaned up for public API).
- Defensive optional chaining on `pointers[0]` in mouse handlers.
- Try-catch around async dithering texture upload to guard against
  context loss during image decode.
- `pointerInput` hot-update lifecycle — toggling at runtime now
  correctly installs or removes event listeners and drains in-flight
  pointer state.
- Phantom `<meta name="text-scale">` tag removed from `app.html`.

### Documentation

- ADR-0025: Glass refraction/reflection post-processing layer —
  documents the hemisphere orb model, rim model, chromatic aberration,
  fluid-driven lighting, Snell's law refraction, and rejected
  alternatives.
- `CLAUDE.md` updated with glass bucket docs (`glassChromatic`),
  `glass` sceneFBO lifecycle, demo instance count (19).
- ADR-0024: SVG path container shapes via mask texture — documents
  design decision, mask rasterization pipeline, rejected alternatives
  (JFA, analytical SDF, separate shader program).
- `CLAUDE.md` updated with svgPath documentation, mask texture rebuild
  bucket, and demo instance count (15).
- ADR 0005 (hot-update buckets) updated with `initialDensityDissipation`,
  `initialDensityDissipationDuration`, `pointerInput`, and `presetSplats`
  classifications.
- ADR 0001 (bun and uv only) reframed as a project-policy statement
  with the `.npmrc engine-strict=true` mechanism documented.
- `docs/contributing.md` gains a "Hard rules" section listing the five
  non-negotiables: bun-only, runes-only, .js extensions,
  ADR-before-engine-changes, no new runtime deps. Release workflow
  expanded with semver policy and explicit CHANGELOG step.
- `docs/porting-notes.md` "seven preset components" → "six".
- `docs/learnings/presets.md` Plasma sunrays state corrected — Plasma
  keeps sunrays on at weight 0.35, contradicting the previous text.
- `Aurora.svelte` header documents the intentional `sunraysWeight: 1.4`
  trade-off (above the safe ceiling derived in the learnings doc) and
  how to fork to a more restrained version.

[Unreleased]: https://github.com/tommyyzhao/svelte-fluid/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/tommyyzhao/svelte-fluid/releases/tag/v0.1.0
