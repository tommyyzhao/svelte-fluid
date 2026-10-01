# ADR 0070: Isolate cleanroom liquid experiments

**Status:** Accepted for R&D only
**Date:** 2026-09-08

## Context

The user requested a fresh liquid-library concept with no legacy API or solver
constraints, and authorized running surface-film and bounded 3D liquid experiments.
The question is which physical experience merits further development, not whether
a third implementation reproduces the current library's presets.

## Decision

Put independently designed compute simulations in `src/experiments/liquid/` and
one thin route at `/lab/liquids`. Import no production engine code. These are
private experiments outside `src/lib` and the distributed package, explicitly
excepted from ADR-0068's single production solver and existing config vocabulary.

Run one selected simulation at a time. Share only an experiment interface and the
page's GPU device, input, and clock. Do not build a backend abstraction or a future
public API. Keep finite fluid amount, explicit time, bounded resources, and GPU
readback diagnostics. Compute handles simulation; rendering uses whatever shader
stage fits the job. No exact implementation claim is made for a research paper.

## Consequences

The existing library stays available but is not a dependency or parity target.
Film and vessel are different physical models; their comparison is about desired
experience and cost. Only an experiment that is visually worthwhile and validated
within its assumptions should inform a subsequent library architecture.
