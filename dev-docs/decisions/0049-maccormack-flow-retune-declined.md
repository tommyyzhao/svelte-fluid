# ADR-0049: Decline MacCormack retune for the flow presets

## Status

Accepted (2026-07-09)

## Context

ADR-0048 promoted `advectionScheme` to a public, construct-only `FluidConfig` field
with every preset still resolving to `'semilagrangian'`. The backlog's
`maccormack-flow-retune` task asked a human to visually QA `advectionScheme:
'maccormack'` forced on, un-retuned, against each of the four flow presets
(GasFlare, Venturi, Karman, TeslaValve) in a real browser, and decide — per preset —
whether it's worth retuning `curl`/`vorticityAdaptive`/dissipation to ship it. This
is explicitly human-only: the exact failure class this task guards against (crisp on
paper, cubey/churny in motion) regressed once already and was caught only by eye,
not by the automated gate.

A side-by-side SL-vs-MacCormack QA page was built (`/examples/qa-maccormack`,
scratch-only, not part of the shipped app) rendering each flow preset twice at the
same seed, plus a Plasma "calibration" row to show what severe grid-scale churn
looks like (Plasma measures ~0.20 baseline / ~0.57 MacCormack-forced on the
grid-scale-energy metric from ADR-0042's spectral-band net — see
`grid-scale.browser.test.ts`).

Human visual QA verdict, un-retuned:
- **GasFlare**: MacCormack shows a visibly jagged/serrated flame edge and a less
  developed plume than SL — net negative.
- **Karman**: MacCormack shows fine sawtooth ripple texture along every streakline
  (most visible on the green/yellow lines); the wake still sheds recognizably, but
  with added ripple artifacting SL doesn't have — net negative-to-neutral, despite
  this preset being the plan's best guess for a win.
- **Venturi, TeslaValve**: no noticeable visual difference either way.

The jagged/ripple texture is the expected signature of MacCormack's
predictor-corrector correction step overshooting near sharp gradients (a flame
edge, a streakline boundary) when the surrounding dissipation/curl were tuned for
semi-Lagrangian's built-in smoothing, not for MacCormack's near-absence of it. It's
milder than Plasma's full grid-scale breakdown, but it's a real, consistent defect,
not noise or a rendering artifact — confirmed by re-running the QA harness after
fixing an unrelated aspect-ratio bug in it (a stretched non-square canvas had been
distorting Plasma's radially-symmetric jet geometry; the flow-preset panels were
unaffected since their aspect already matched proven real usage).

## Decision

Decline the retune. No flow preset opts into `advectionScheme: 'maccormack'`. Every
preset continues to resolve to `'semilagrangian'` (already enforced by
`maccormack.test.ts`'s `'resolves every preset to semi-Lagrangian'` registry
invariant — no code change was needed to make this permanent).

`advectionScheme` remains public API for advanced consumers who want to opt in
themselves (ADR-0048), scoped and documented as velocity-only and best suited to
flow/structured scenes they control and can retune themselves — it is simply not
worth shipping as a built-in preset default given the visual cost observed here.

## Consequences

- `maccormack-flow-retune` closes as declined (`.ralph/prd.json` status `cut`), not
  revisited without new evidence (e.g. a retuned candidate config a human explicitly
  wants QA'd again).
- No preset config, shader, or engine code changes — this ADR is a decision record,
  not an implementation.
- `governor-dye-tier` and any other backlog item that assumed a shipped MacCormack
  preset should treat this as closed; the capability stays available but unused by
  the library's own presets.
- If a future change to MacCormack's correction/limiting reduces the ripple
  artifact at the shader level (an engine decision, not a config one), this
  decision should be revisited with fresh visual QA rather than assumed stale.
