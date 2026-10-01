# ADR 0075: Separate presentation quality and test ordinary browsers

**Status:** Accepted for R&D only
**Date:** 2026-09-10

**Partial supersession:** [ADR 0076](./0076-make-private-material-studies-native-pixel-only.md)
replaces the presentation caps and Display/Economy choice with native-DPR-only
output. Ordinary-browser validation and the model/presentation separation below
remain in force. The original decision is preserved as dated evidence.

## Context

Human review found the selector in an explicit GPU-error fallback and the other
material studies noticeably pixelated. Passing tests were insufficient: their
`--enable-unsafe-webgpu` flag admitted WGSL swizzle assignments that ordinary
installed Chrome rejected. The private session also capped every canvas at
1,000 pixels wide and DPR 1.5, even when stretched across a Retina display.

## Decision

Remove the experimental browser flag from the default hardware tests. Correct
the selector to use whole-vector assignments and preserve the actual first GPU
error and failure stage in expandable fallback details. Keep native controls
independent of material startup, runtime failure, and teardown.

Separate presentation from the model's state resolution. Default private output
to display DPR up to 2, bounded by 4 million pixels, a 4096-pixel dimension, and
device limits. Keep the old budget as an explicitly named Economy A/B on the two
effect-first studies. Switching output must not reset particles, fields, clock,
or pause state. This is an experiment budget, not a public configuration API or
a validated mobile performance tier.

Improve reconstruction and filter unresolved optical variation before raising
simulation density. Measure final output-size costs on the actual unflagged
browser; do not reuse old permissive-browser timing as a matched baseline.

Continue one distinct effect-first study: transient heat writes persistent oxide
thickness, which drives thin-film-inspired color. Cooling/idle preserve history;
reset removes it. This is illustrative thermal oxidation, not electrochemical
anodizing or a calibrated metallurgy model. Do not force persistent state into
the reversible wrapper, whose idle behavior deliberately resets deformation.

## Consequences

- Sharper output costs more pixels. Neither higher DPI nor smoother shading adds
  missing physical cohesion or makes these calibrated fluids.
- An actual live-canvas component test is necessary alongside buffer readback.
  Failure provenance must remain visible instead of becoming a vague diagnosis.
- Pure sizing tests establish safety bounds; GPU tests establish compatibility
  and measured costs; human review still judges whether the result looks good.
- No new production engine, public export, or runtime dependency is introduced.

Evidence: [quality and oxide-history notes](../plans/2026-09-10-material-quality-and-oxide-history.md).
