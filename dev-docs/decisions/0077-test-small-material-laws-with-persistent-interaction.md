# ADR 0077: Test small material laws with persistent interaction

**Status:** Accepted for R&D only
**Date:** 2026-09-11

## Context

The user authorized all seven scenes from the Fable brainstorm, plus immediate
repair of the remaining DPR continuity bug. Most scenes need far less state
than a general liquid/cloth solver. The existing reversible `EffectSurface`
resets on idle: that would erase the very history ink, velvet and cracks test.

## Decision

Use the smallest representation that exposes each proposed material law:
bounded reverse-drift strokes; one bistable foil amplitude; an explicit
volume-normalized bridge proxy; polar pile lean; a sparse crack graph; and
analytic finite-contact stress/refraction. CPU state authoring is legitimate
where cheaper and simpler than a dispatch. Native WebGPU reconstruction is not
evidence that every effect requires compute or is exclusive to WebGPU.

Add one private persistent `MaterialSurface` on the existing `LabSession`, not
seven lifecycle wrappers or a renderer framework. Distinguish availability for
still native controls from permission to animate under reduced motion. Release
input before a settling interval; pause without resetting history. The private
optional `endInput()` hook terminates CPU gesture bookkeeping even on blur or
visibility loss when no GPU step runs. Explicit reset alone clears a specimen.

For DPR-only typography updates, replace the packed optical profile/render
binding rather than the model. Retain physical fields, deformation, pause and
clock; build/validate the candidate before adopting it, bound pending candidates,
and expose failures. Do not introduce checkpointing or serialization.

## Consequences

- The seven routes remain private, illustrative proofs, not a new public API.
  No runtime dependencies, individual-hair solver, shell framework, advected
  pigment texture or general render-target allocator is introduced.
- Actual-DPR native output and visual sources from ADR 0076 still apply;
  sampling footprints, native edge coverage and allocation rejection need tests.
- Different material signatures have different acceptance tests. A visually
  interesting bounded proxy can complete a spike without becoming calibrated
  mechanics or a production-ready component.
- Measure CPU encoding, queued throughput, GPU pass time and logical memory
  separately. Same-device experiments are not mobile or WebGL superiority proof.
- Beads owns current status; the [experiment report](../plans/2026-09-11-seven-material-proofs.md)
  records sources, limits and validation, including rejected shortcuts.
