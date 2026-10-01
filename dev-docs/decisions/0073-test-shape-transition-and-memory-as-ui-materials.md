# ADR 0073: Test shape, transition, and memory as UI materials

**Status:** Accepted for R&D only
**Date:** 2026-09-10

## Context

Enamel typography showed a plausible design-system use for the cleanroom work.
Expanding it should test distinct interactions, not put the same shiny pointer
effect behind more content. The user requested more creative prototypes.

## Decision

Keep three new private studies under `/lab/interfaces`, with implementations in
`src/experiments/liquid` and no production exports:

- **Shape:** cache the existing enamel image, evolve a small damped displacement
  field, and inverse-warp its complete premultiplied RGBA, including silhouette.
  Native heading ink is hidden only while presentation succeeds.
- **Transition:** native shelf controls update content immediately. Seven damped
  GPU blobs form a following material indicator; they never own selected state.
- **Memory:** a plastic height field retains the deepest signet impressions.
  Separate current and rest depth permit relaxation and explicit smoothing.
  Discrete actions submit in order; they cannot be coalesced like pointer motion.

Reuse the private LabSession device/lifecycle contract. Pause GPU work at rest,
offscreen, and for reduced motion. Snap residual shape/selection to its native
rest state; finish imprint compliance without altering its plastic history.
Use native buttons, headings, focus, selection, and static failure presentation.
Do not introduce a generic material framework before these behaviors earn one.

## Consequences

- These are illustrative spring/metaball/plastic models, not a new calibrated
  Navier–Stokes, viscoelastic, or volume-conserving wax solver. The inspection
  contract's `mass` slot is diagnostic only for these models.
- GPU tests require new/vacated silhouette pixels, recovery, finite bounded
  selection reversals, persistent imprints, ordered actions, and exact lifecycle
  completion. Compilation alone is insufficient.
- Native semantics remain authoritative. Deformed heading selection rectangles
  remain undeformed DOM rectangles; this is not general DOM layout deformation.
- A tiny selection model may be cheaper as CPU springs plus SVG/CSS. Its inclusion
  tests design usefulness, not a demonstrated need for WebGPU. No phone speed or
  energy advantage has been established.
- Fixed private grids, raster sharpness, one-device-per-study, and bounded local
  timers are prototype limitations, not public API commitments. Paused LabSession
  still has a lightweight RAF callback; GPU-idle is not scheduler-idle.
- ADRs 0070–0072 remain the private cleanroom boundary. Existing production demos
  must still exercise the production engine. Product coating remains parked.

Evidence and next hypotheses: [material UI expansion](../plans/2026-09-10-material-ui-expansion.md).
