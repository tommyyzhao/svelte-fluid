# ADR-0047: Bucket-A frame-time governor

## Status

Accepted (2026-07-03)

## Context

ADR-0042 split the frame-time governor into a low-risk Bucket-A slice and a later
Bucket-C dye-resolution tier. The product goal is degrade-not-break on weak devices,
but the MacCormack regression showed that automatic quality systems must avoid
changes that can create grid-scale visual churn or invalidate deterministic
readback tests.

The live RAF loop already measures frame time in `calcDeltaTime()`. Deterministic
bench harnesses use `autoStart: false` and `advance(steps, dt)`, so any governor
must stay out of that path or seeded readback tests become timing-dependent.

## Decision

Add opt-in `autoPerformance` with two configurable floors:

- `autoPerformanceMinPressureIterations` (default 8)
- `autoPerformanceMinSubsteps` (default 1)

The governor is Bucket-A-only. It samples raw RAF frame time into an EMA and, after
a >=3 second hysteresis window above the internal budget, sheds quality in this
order:

1. lower `PRESSURE_ITERATIONS` toward the configured floor;
2. lower `SUBSTEPS` toward the configured floor.

It never auto-restores quality on fast frames. Applications that want to raise
quality again must call `setConfig()` with explicit values. This asymmetric policy
avoids hunting between tiers on borderline devices.

The decision logic lives in `src/lib/engine/performance-governor.ts` as a pure
function, with node tests for ladder ordering, floors, hysteresis, monotonic shed,
and no auto-restore. `FluidEngine` owns only the live-frame EMA/state integration.

Expose a pull API, `FluidHandle.getPerformanceState()`, instead of events. Wrapper
components forward it the same way they forward `isPaused`; before an engine exists,
they return a disabled safe-default state.

## Consequences

- Default behavior is unchanged because `autoPerformance` is `false`.
- Deterministic `advance()` runs remain byte-stable because the governor sampler is
  hard-guarded outside deterministic mode and is not called from `advance()`.
- This slice cannot trigger FBO rebuilds, shader recompiles, or dye-resolution pops.
  Those remain gated behind the later governor dye-tier task.
- The threshold numbers are empirical defaults, not a CI timing contract; browser
  tests inject synthetic frame times for smoke coverage rather than depending on
  wall-clock performance.
