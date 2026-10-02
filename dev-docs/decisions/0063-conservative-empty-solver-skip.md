# ADR-0063: Skip solver work only while emptiness is provable

## Status

Accepted (2026-07-11); partly superseded by ADR 0099 (decayed scenes now settle)

## Context

Fresh simulation and dye framebuffers are cleared to zero, yet an empty engine
submitted the full advection, vorticity, projection, and dye pipeline every
step. Detecting when an active fluid later decays to equilibrium would require
GPU reductions/readback and introduce false-idle risk.

## Decision

Track one conservative, monotonic `solverMayContainContent` bit per live WebGL
context. Fresh fields begin provably empty. Any splat activates the solver,
including a numerically zero splat; flow sources, forces, and prescribed grids
are continuous unknown drivers and activate before their first step. Outlets and
boundaries alone cannot create content and do not activate it.

When the bit is false and no continuous driver exists, `step` advances the
deterministic simulation clock and returns before every GL solver draw. Once
activated, it never infers equilibrium or returns to idle. Only fresh
construction/context restore resets the proof; resize preserves it.

## Consequences

- Never-used and zero-opening scenes submit zero solver draws.
- First input and every declarative driver enter the unchanged solver path.
- There is no readback, tolerance, timer, or per-frame branch after activation.
- A decayed scene keeps stepping until reconstruction; this intentionally favors
  correctness and simplicity over speculative steady-state detection.
