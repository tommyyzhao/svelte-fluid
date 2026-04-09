# Changelog

All notable changes to **svelte-fluid** are documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [semantic versioning](https://semver.org/spec/v2.0.0.html):

- **patch** — bug fixes, doc fixes, internal refactors
- **minor** — new presets, new props, additive engine features
- **major** — breaking API changes

## [Unreleased]

### Added

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

- `pointerInput` hot-update lifecycle — toggling at runtime now
  correctly installs or removes event listeners and drains in-flight
  pointer state.
- Phantom `<meta name="text-scale">` tag removed from `app.html`.

### Documentation

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
