# ADR-0065: Keep fractional face apertures gated

## Status

Accepted (2026-07-11)

## Context

The projection sweep isolated a 96-class boundary spike but did not establish
that binary obstacle rasterization causes a visible shipping defect. Fractional
face apertures would expand every divergence, pressure-diagonal, and pressure-
gradient stencil, so the roadmap requires direct curved, narrow, and subcell
evidence before paying that complexity and GPU cost.

## Decision

Keep FID-006 and FID-007 closed. Deterministic WebGL2 gates now measure
post-projection divergence, mirror symmetry, solid-adjacent normal velocity,
tangential grid-scale energy, and flux around curved-cylinder, narrow-throat,
and subcell-wall geometry. The resolved scenes remain live and bounded; the
subcell wall has no center-sampled solid cells yet measured zero mean velocity
through its intended blocked segment. Synthetic reducer tests still detect
mirrored leakage, boundary chatter, and weighted barrier flux.

Pinned Chromium results at a 192x96 velocity grid:

| Scene | Divergence RMS / max | Symmetry error | Adjacent grid scale | Solid flux mean | Upstream / downstream mean |
| --- | ---: | ---: | ---: | ---: | ---: |
| Curved cylinder | 1.488 / 16.710 | 0.0234 | 0.1585 | 0.9335 | 13.532 / 13.386 |
| Narrow throat | 1.447 / 16.071 | 0.0007 | 0.1121 | 0.6595 | 8.885 / 8.626 |
| Subcell wall | 1.412 / 16.408 | 0.0008 | 0 | 0 | 10.675 / 10.265 |

## Consequences

- The current binary mask/stencil path remains unchanged.
- No extra textures, supersampling pass, shader variants, or pressure work ship.
- The new scenes and reducers remain regression evidence for future reports.
- FID-006 may be activated only with a reproducible, human-visible shipping
  defect and an explicit human decision, as required by the roadmap gate.
