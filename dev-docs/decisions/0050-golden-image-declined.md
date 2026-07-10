# ADR-0050: Decline CI golden-image visual regression testing

## Status

Accepted (2026-07-09)

## Context

The epic doc (§7) listed "CI golden-image visual-regression over all presets at
fixed seed" as a Phase-0 follow-on, and `.ralph/prd.json` carried it as two
backlog tasks: `golden-image-adr` (design the determinism/regen/diff-metric
approach — human-gated, since an undesigned regen workflow is the classic flaky
gate every team eventually disables) and `golden-image-impl` (gated on the ADR
plus `maccormack-flow-retune`).

Research for the ADR (done, not written) surfaced the real shape of the problem:

- The existing deterministic harness (`advance(steps, dt)`, fixed seed, no
  pointer/wall-clock input — ADR-0042) is genuinely bit-identical **within one
  GPU/browser**. It is not identical **across** renderers: CI's `ubuntu-latest`
  runners have no GPU, so Playwright Chromium falls back to SwiftShader software
  rendering, which rounds floats differently than a contributor's real GPU. Because
  the solver is chaotically sensitive, that rounding difference compounds over
  simulation steps into visible pixel drift — the textbook cause of golden-image
  tests going permanently flaky and getting disabled.
- `@vitest/browser` (already installed) ships a built-in `toMatchScreenshot()`
  pixel-diff matcher, so the diff-metric half of the original task ("write SSIM or
  add pixelmatch") was already solved for free. That lowered the *implementation*
  cost estimate, but not the *maintenance* risk described above.
- The existing numeric regression nets (`divergenceL2`, `gridScaleEnergyFraction`,
  energy/liveness bands, resolution-invariance) all read raw internal simulation
  fields via `readField()`. None of them exercise the display/composite pass
  (bloom, sunrays, shading, glass, color grading, obstruction fill, container
  masking) — `advance()` doesn't even trigger that pass today; it's wired only to
  the live RAF loop. A golden-image test would be the only thing covering that
  code, which is a real, non-overlapping gap given "the composited look is the
  product" (`CLAUDE.md`).

Weighed against that real gap: the product is explicitly decorative and
degrade-not-break, not pixel-perfect-by-contract. A CI job that is expected to need
~5 runs of stabilization, ongoing tolerance tuning, and a new engine surface just to
be trustworthy is a lot of standing infrastructure and maintenance burden for a
library whose own thesis says slight visual variance is acceptable, even expected,
across devices.

## Decision

Do not build CI golden-image testing. `golden-image-adr` and `golden-image-impl`
both close as **cut**. The compositing pipeline (bloom/sunrays/shading/glass/etc.)
stays covered by manual visual QA when it changes — the same real-browser,
side-by-side human-verification pattern already used for `maccormack-flow-retune`
(ADR-0049) — rather than by a new always-on CI gate.

## Consequences

- No new CI job, no new devDependency, no new `@internal` engine surface for
  deterministic display-pass compositing is built for this purpose.
- Compositing/display-pipeline regressions (bloom, sunrays, glass, shading, color,
  obstruction fill, container masking) remain uncaught by automation. Changes to
  `shaders.ts` display code or the `render()` path should get a manual real-browser
  look before merging, same as any other visual change.
- `dev-docs/epics/0001-engine-first-principles-upgrade.md` §7's golden-image bullet
  is superseded by this ADR (cut, not merely deferred).
- Revisit only on demonstrated need — e.g. a real compositing regression that
  shipped and that manual QA missed — not speculatively. If revisited, the renderer-
  jitter and short-capture/scoped-preset framing from this ADR's research still
  apply.
