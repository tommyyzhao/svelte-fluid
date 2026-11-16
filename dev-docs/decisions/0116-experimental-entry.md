# ADR 0116: `svelte-fluid/experimental` subpath for the liquid engine and stepped air

**Status:** Accepted
**Date:** 2026-11-01

## Context

An external game consumer (github.com/tommyyzhao/verdigris) lives in its own
repository (owner, 2026-11-01). It needs `LiquidEngine` (ADR 0114) and, from
`FluidEngine`, the caller-clocked `advance`/`renderOnce`/`resize` path plus the velocity
snapshot ring (ADR 0115). All of these were internal: `stripInternal` removes them
from `dist` declarations, and `LiquidEngine` was never exported.

## Decision

- Add a second package entry, `svelte-fluid/experimental` (`src/lib/experimental.ts`):
  - `LiquidEngine` and the names listed in `engine/liquid/types.ts` (explicit export list, no `export *`);
  - `createSteppedFluidEngine(options)`, which builds a `FluidEngine` with
    `autoStart: false`;
  - the `SteppedFluidEngine` and `VelocitySnapshot` types, which declare the
    five stepped methods publicly.
- The engine code is unchanged. The internal tags stay on `FluidEngine` itself, so
  the root entry and its docs keep their current surface.
- No semver promise. A minor release may change or remove any experimental name.
  The root entry keeps its 1.x guarantees.
- The declaration rules of ADR 0098 apply to this entry too: no GL type names.
  `prepack` compiles a strict consumer against both entries.

## Consequences

- External consumers and labs can use the liquid engine without vendoring ~3k lines.
- Each experimental change still needs a changeset. Breaking changes ship as a
  `minor` with a release note, never silently in a `patch`.
- Rejected: copying the engine into the game repo (two diverging copies of shader
  code). Rejected: promoting these names to the root entry (that would freeze a
  consumer-shaped API under 1.x semver).

## Amendment (2026-11-15)

Standardised the entry for 1.2.0 (no semver promise; owner kept aliases for one minor):

- `experimental.ts` uses an explicit export list instead of `export *`.
- Neutral names; the old names stay as `@deprecated` aliases for one minor and
  are removed in the next: `Rect`→`CellRect`, `Vec`→`CellVec`,
  `Counts`→`SpeciesCounts`, `Species`→`LiquidSpecies`, `Wind`→`LiquidWind`,
  `RenderOptions`→`LiquidRenderOptions`. Inline object types gained names:
  `LiquidFill`, `LiquidRegion` (sensors and drains), `LiquidEmit`. The unused
  `Rgb` type was deleted.
- Terrain: the shaders and CPU paths only test `terrain > 0` (solid vs air); the
  engine validates 0..6 but never colours or collides kinds differently. The new
  `Cell = { Air: 0, Solid: 1 }` documents 2..6 as solid and free for caller-defined
  tags. `AIR`/`STONE` alias `Cell`; `LOAM/INK/GATE/VINE/ROOT` stay as deprecated
  `CellKind` literals 2..6 with identical values.
- `SteppedFluidEngine` omits `pause`/`resume`/`isPaused` (type-only):
  `resume()` would start the RAF loop and defeat the caller's clock.
- `_debugParticles()` stays public (synchronous readback, stalls the GPU) so existing consumers keep building.
- Missing float-render support now throws `WebGLUnavailableError('no-float-textures')`;
  `'no-webgl'` is kept for a missing context.
