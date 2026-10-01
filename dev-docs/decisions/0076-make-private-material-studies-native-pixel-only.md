# ADR 0076: Make private material studies native-pixel only

**Status:** Accepted for R&D only; supersedes ADR 0075's presentation budgets and quality modes
**Date:** 2026-09-11

## Context

Human review confirms Afterheat and liquid selection work and asks us to retain
them while continuing R&D. Retina-native output is now a design requirement,
not a selectable upgrade. The previous 2× / 4-million-pixel compromise left 3×
screens undersampled, and glyph sources had a separate 1600-pixel cap.

## Decision

Private studies size presentation to fractional CSS dimensions × actual device
pixel ratio, rounded once to whole physical pixels. This includes 3× and
fractional DPR; a 1× screen stays 1×. Remove Economy, presentation-quality state,
the alternate-size UI, source-raster caps, and arbitrary startup textures.
Reuse the session's existing DPR watcher for source updates.

Native presentation does not prescribe physics density. Keep independent model
grids and particle counts; reconstruct continuous surfaces and gradients, filter
unresolved shading, and size visual coverage/warp sources to the display. A
simulation tool mask is not a final-image texture. Increasing its resolution
without increasing the receiving state does not add physical detail.

Reject unsupported native output explicitly, without silently reducing DPR.
The common output preflight limits dimensions to device limits and 16,777,216
pixels. Models with extra attachments need their own accounting: the filament
study includes four-sample color/depth, mesh storage and one external resolved
frame in a nominal 256 MiB live / 384 MiB resize-transition budget. These are
allocation estimates, not guarantees of driver VRAM or mobile suitability.
Failure invalidates pending startup; recovery requires an explicit new load.

Continue with one bounded geometry study: a closed elastic curve, lit round
cross-section and depth-tested overlap. Reuse the reversible-effect harness;
do not add a renderer framework, public API, physics mode or new wrapper.
Its 128-node state is independent of display-driven tessellation. The curve
frame and longitudinal tessellation are tested for this content family, not
promised for arbitrary knots or all possible deformations.

## Consequences

- Ordinary-browser validation from ADR 0075 remains mandatory. Test native 2×
  and 3× output, fractional layout and DPR-only changes, plus explicit failure.
- Sharper display costs pixels and memory. Measure it; do not hide the cost
  with automatic downsampling or claim desktop measurements validate phones.
- Existing working Afterheat and selection are parked in Beads, not redesigned
  to fit the new experiment. No production configuration is changed by this ADR.
- Delete unused presentation alternatives; keep earlier decisions and timings
  as dated evidence, clearly superseded where appropriate.

Evidence: [native-pixel and coherent-geometry notes](../plans/2026-09-11-native-pixel-materials-and-filaments.md).
