# ADR 0074: Prove material effects before component integration

**Status:** Accepted for R&D only
**Date:** 2026-09-10

## Context

Human feedback rejects click-only soft type and its text-selection highlights,
finds the small liquid selector imperceptible, and likes the wax imprint. More
importantly, requiring every new effect to justify a design-system component
prematurely narrowed the search. First prove visual interest, feasibility, and
cost; decide component integration later.

## Decision

Replace the private soft-type anchored-drag behavior with pointer-velocity input.
Disable selection on its specimen heading only; retain native heading semantics,
surrounding selectable copy, keyboard demo, and failure presentation. Enlarge the
selector rather than treating a passing numerical test as perceptual success.
Keep the imprint route intact and track it as a promising future direction.

Add two effect-first private prototypes, still outside `src/lib`:

- A 192² damped height/velocity membrane with thin-film-inspired color and broad
  reflections. Real aspect ratio and physical-coordinate velocity inform the
  forcing; CFL-bounded substeps support narrow surfaces. The optics are a
  three-band approximation, not a calibrated spectral BRDF.
- 1,800 glyph-anchored particles accumulated into a one-channel density texture,
  then shaded as an implicit chrome surface. Thresholded density can genuinely
  split/rejoin its visible contour. There is no pressure or particle-neighbor
  solve, no material conservation claim for the thresholded silhouette, and no
  calibrated mercury simulation.

One small private reversible-effect wrapper handles move input, exact rest,
GPU-idle, lifecycle pause, premultiplied composition, and visible demo availability.
It is not generalized to persistent imprints or exported as a component API.

Measure warmed compute/render pass durations with real-pass timestamp queries
where available, separately from queued wall-clock throughput. Reject invalid
timing methods rather than deriving GPU cost from animation frame rate.

## Consequences

- A compelling visual prototype does not yet establish a library architecture,
  mobile battery budget, design-system use, or need for WebGPU over alternatives.
- The selection model remains a candidate for CPU springs plus SVG/CSS. If its
  revised art direction still fails human review, park it rather than add knobs.
- Strong mercury strokes can produce many islands: topology is proven, but
  cohesive threads are not guaranteed. Lit geometry or local cohesion is a future
  visual comparison, not automatically required complexity.
- Approximation and discontinuity must stay visible in the record: resetting
  tiny residual deformation at idle, field/pixel resolution limits, and device
  timing uncertainty are not erased by attractive screenshots.
- This supersedes the component-first emphasis and selectable specimen behavior
  of ADR 0073, while retaining the isolated R&D boundary of ADRs 0070–0073.

Evidence: [effect-first material notes](../plans/2026-09-10-effect-first-materials.md).
