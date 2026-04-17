# Changelog

All notable changes to **svelte-fluid** are documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [semantic versioning](https://semver.org/spec/v2.0.0.html):

- **patch** — bug fixes, doc fixes, internal refactors
- **minor** — new presets, new props, additive engine features
- **major** — breaking API changes

## [Unreleased]

### Added

- **SVG path container shapes** — new `{ type: 'svgPath' }` variant for
  `containerShape` confines fluid to arbitrary SVG paths or Canvas 2D
  text. Rasterized to a mask texture via `OffscreenCanvas` + `Path2D`.
  Supports `d` (SVG path data), `text` (Canvas2D fillText), `font`,
  `viewBox`, `fillRule`, and `maskResolution` fields. See ADR-0024.
- `SvgPathFluid` preset — fluid confined inside a 5-pointed star shape.
- `/svelte-fluid` route — "SVELTE FLUID" as fluid-filled text with
  `splatOnHover` interaction.
- `/svg` test route — 4 SVG path test cases (star, heart, rect, evenodd).
- 20 new tests for `svgPath` equality, CPU mask sampling, and
  `maskAreaFraction` (126 total, up from 106).
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

## [0.1.0] — Unreleased

Initial release. See the project README for the feature inventory.

[Unreleased]: https://github.com/tommyyzhao/svelte-fluid/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/tommyyzhao/svelte-fluid/releases/tag/v0.1.0
