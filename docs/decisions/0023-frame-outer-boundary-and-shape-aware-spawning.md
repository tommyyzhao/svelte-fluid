# ADR 0023: Rounded outer frame boundary and shape-aware splat spawning

**Status:** Accepted
**Date:** 2026-04-13

## Context

The frame container shape only bounded the inner cutout — the outer edge was
always the canvas rectangle. Users wanted rounded outer edges too, with
fluid-conforming masking (not visual cropping). Additionally, random splats
scattered across the full canvas even when a container shape masked most of
it, wasting GPU work.

## Decision

**Outer frame boundary:** Added `outerHalfW`, `outerHalfH`, `outerCornerRadius`
(all optional) to the frame type. The SDF computes `innerMask * outerMask`.
Defaults (0.5/0.5/0) cover the full canvas. Renamed `cornerRadius` to
`innerCornerRadius` (breaking change) for clarity.

**Shape-aware spawning:** Added rejection sampling (10 attempts) in both
`multipleSplats()` and the continuous splat loop. Uses the existing
`containerMask()` JS function to test each `(x, y)` before splatting.
When `evenSpacing` is active, only `y` is re-sampled.

## Consequences

- Frame shapes can now have fully rounded outer edges with fluid physically
  contained inside them — same quality as circle/annulus.
- The `cornerRadius` → `innerCornerRadius` rename is a breaking API change.
- Thin annuli and small frames waste far fewer splats.
- ~5.6% of splats may be silently dropped for shapes with small valid area
  (10-attempt cap prevents infinite loops).
