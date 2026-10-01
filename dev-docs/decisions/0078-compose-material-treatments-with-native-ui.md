# ADR 0078: Compose material treatments with native UI

**Status:** Accepted — first three treatments implemented experimentally
**Date:** 2026-09-14

## Context

The user now asks which cleanroom material experiments can form a genuinely
useful modern design library, and directs us to drop poor-fit ideas. Successful
physics demonstrations alone are insufficient. The private lab assumes isolated
large specimens and owns one GPU device per session; it is not an exportable UI kit.

## Decision

Build composable treatments for native text/marks, explicit imagery, existing
controls and state-bound indicators/edges. Native DOM/application state keeps
ownership of content, layout, focus, hit areas and activation. Physics and optics
provide a distinct visible consequence; they never delay or infer semantic state.
Keep imprint/Afterheat as narrowly justified recipes rather than new families.

Reject exporting each experiment as a component, inventing workflows to justify
simulations, capturing arbitrary DOM into one GPU scene, and forcing unrelated
material laws into a universal fluid solver. Reuse audited shared GPU ownership
and scheduling where appropriate; do not promote `LabSession` unchanged or start
another production-engine rewrite.

The first implementation exports `MaterialEnamel`, `MaterialFoil` and
`MaterialImage`: plain display-text enamel, a decorative selected-state foil and
an explicit local-wake image. Each has `enabled`, status reporting and `retry()`;
none owns a theme, navigation, heading role or asynchronous operation. Remaining
families/variants are candidates, not implicitly approved exports.

Reuse the same model sources from `engine/webgpu/materials/` in the lab through
compatibility re-exports. The material host shares the production device pool
and frame scheduler but has a separate per-device immutable compute/render cache
because the existing fluid cache has fixed entry points and a render-only graph.
Do not copy the shaders or widen the fluid engine into a universal material solver.

## Consequences

- Useful visual identity is valid; compulsory motion or questionable workflows are not.
- Candidates must earn their place at actual design-element sizes against simpler
  baselines. Native semantics, static fallbacks, motion preferences and actual DPR
  are part of the proof, not later integration work.
- The first proof is `/lab/interfaces/library`: native toggle, enamel heading,
  local image wake and a matched plain view. Experimental exports are not a claim
  that every candidate passed human design review or real-phone performance testing.
- Mutable candidates own their cleanup and synchronous error scopes. Cancellation
  generations cannot reserve against a later retry. Frame queues are bounded;
  idle/hidden/offscreen instances unsubscribe. Native fallback is independent of GPU health.
- Enamel color updates are allocation-free; DPR-only profile changes retain fields.
  A genuine text/reflow change resets transient deformation. Image maps retain a
  finite three-second tail; enamel also uses a bounded presentation tail, not a
  mathematical convergence claim.
- Full disposition and implementation gaps:
  [material design library plan](../plans/2026-09-14-material-design-library.md),
  Beads `svelte-fluid-edt` (decision), `svelte-fluid-7ky` (implementation).
