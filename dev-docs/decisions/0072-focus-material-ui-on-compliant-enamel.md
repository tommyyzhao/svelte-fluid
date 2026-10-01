# ADR 0072: Focus material UI on compliant enamel

**Status:** Accepted for R&D only
**Date:** 2026-09-09

## Context

Human review found enamel typography useful in a design system, but letterpress
and the coating reveal lacked a coherent purpose. Greater simulation capability
is not itself a reason to add an effect. The useful question is whether native
typography can acquire believable depth and a soft response.

## Decision

Remove the letterpress choice and its unused geometry recipe. Park the existing
product route instead of extending it. Focus `/lab/interfaces/editorial` on one
material, with a hot Rounded/Flat presentation comparison of the same state.

Construct a high-resolution rounded rest profile from the native glyph coverage.
Thin strokes remain lower than broad strokes; a smooth plateau avoids sharp
medial ridges. Pack physical slopes, rest height, and coverage into one texture.
Area-average its quantized height for the coarse simulation's initial state.

Extend the private film experiment with an opt-in compliant profile. Pairwise
transport descends the potential `height − restHeight + contactPressure`, bounded
by available donor thickness. A local press displaces material, and release
relaxes the deviation. Ordinary gravity leveling is disabled for this material,
because it would fight the deposited rest shape. This is an illustrative
overdamped gel, not a calibrated liquid, elastic solid, or capillary solve.

Render the fine rest profile plus the coarse deviation, without counting its
base curvature twice. Soften enamel reflections to avoid pixel-sized glints.
Track explicit primary-pointer contact separately from hover velocity. Preserve
an unconsumed tap for a bounded simulation submission; cancellation and lifecycle
pauses clear it. Native selection, scrolling, and keyboard controls remain DOM
behavior; the canvas neither captures input nor blocks it.

## Consequences

- Surface height deforms, but letter outlines do not. This is molded enamel
  within native glyphs, not silhouette squash/stretch or springy wobble.
- Pairwise mass conservation applies to the coarse state. Fine reconstruction,
  masking, and nonnegative clipping are not exactly volume-conserving at partial
  cells. Coverage-aware reconstruction is a possible targeted follow-up.
- Geometry/size changes still reset this private experiment. It is not a general
  DOM rasterizer. Visible scenes still run continuously; phone energy/performance
  and idle scheduling are unresolved, not inferred from desktop viewport tests.
- No production API, engine replacement, preset catalog, new runtime dependency,
  or additional solver family is introduced by these routes.
- Next work depends on perceived usefulness: if local surface response remains
  too subtle, test actual coordinated outline deformation separately rather than
  claiming that stronger highlights constitute squishing.
