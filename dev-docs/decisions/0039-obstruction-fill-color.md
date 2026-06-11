# ADR-0039: Obstruction fill color (`obstructionColor`)

## Status

Accepted (2026-06-12).

## Context

Interior obstructions (ADR-0034) are display-cropped: the display shader
multiplies dye by `1 − obstructionMask`, so a solid body renders as a
`backColor`-colored hole. On scenes whose background is near-black
(Karman, GasFlare), the obstacle is invisible unless glowing dye happens
to silhouette it. The Karman vortex street needs its cylinder to read as
a *visible bluff body* — the wake is meaningless without the obstacle.

Alternatives considered:

1. **DOM/SVG overlay in the preset component.** Rejected: it must
   replicate the engine's `fit`/`offset`/`scale`/viewBox mapping
   (including `fit: 'fill'` stretch), drifts on resize, and breaks the
   "the canvas is the whole scene" invariant.
2. **Per-`Obstruction` color.** Rejected for now: the combined mask is a
   single-channel union texture; per-obstruction colors would need a
   second rasterization channel or per-obstruction draw passes. A single
   scene-level color covers every current need; per-obstruction color can
   be layered on later without breaking this API.
3. **Scene-level `obstructionColor` painted in the display pass.**
   Chosen.

## Decision

Add `obstructionColor?: RGB | null` to `FluidConfig` (0–255 CSS-style,
same convention as `backColor`; default `null` = legacy silhouette).

- A new display-shader keyword `OBSTRUCTION_FILL` (nested inside
  `OBSTRUCTION_MASK`) mixes the obstruction coverage toward
  `uObstructionFillColor` after dye cropping and before background
  compositing: `c = mix(c, fill, coverage); a = max(a, coverage)`.
  The rasterized mask is anti-aliased, so painted edges stay smooth.
- Bucket classification (ADR-0005): the **presence** of a color is
  Bucket B — `setConfig` recompiles keywords when `obstructionColor`
  transitions between `null` and non-null. The color **value** is a
  per-frame uniform (Bucket A); changing it costs nothing.
- The uniform is only bound when the obstruction mask texture is bound
  (same `!DISTORTION` guard, texture unit 6 comment in `drawDisplay`).
- REVEAL/DISTORTION display modes ignore the fill (they have their own
  compositing); the fill applies to the standard composite path only.

## Consequences

- Karman pins `obstructionColor={{ r: 86, g: 98, b: 122 }}` (slate) so
  the cylinder is visible against its near-black background. Other
  obstruction scenes keep the default silhouette until tuned.
- `resolveConfig` round-trips `obstructionColor` → `OBSTRUCTION_COLOR`;
  covered in `resolve-config.test.ts`.
- Future per-obstruction colors would extend the mask rasterization, not
  this API; `obstructionColor` would remain the scene default.
