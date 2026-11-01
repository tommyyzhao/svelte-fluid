# ADR 0116: `svelte-fluid/experimental` subpath for the liquid engine and stepped air

**Status:** Accepted
**Date:** 2026-11-01

## Context

The Verdigris puzzle game moves out of this repo's `/puzzles` route into its own
repository (owner, 2026-11-01). It needs `LiquidEngine` (ADR 0114) and, from
`FluidEngine`, the caller-clocked `advance`/`renderOnce`/`resize` path plus the velocity
snapshot ring (ADR 0115). All of these were internal: `stripInternal` removes them
from `dist` declarations, and `LiquidEngine` was never exported.

## Decision

- Add a second package entry, `svelte-fluid/experimental` (`src/lib/experimental.ts`):
  - `LiquidEngine` and every name in `engine/liquid/types.ts`;
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

- External games and labs can use the liquid engine without vendoring ~3k lines.
- Each experimental change still needs a changeset. Breaking changes ship as a
  `minor` with a release note, never silently in a `patch`.
- Rejected: copying the engine into the game repo (two diverging copies of shader
  code). Rejected: promoting these names to the root entry (that would freeze a
  game-shaped API under 1.x semver).
