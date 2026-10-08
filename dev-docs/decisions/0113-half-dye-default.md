# ADR 0113: Half dye resolution as the generic default

**Status:** Rejected (round 6, A6 primary incomplete / secondary fail); default restored to 1024
**Date:** 2026-10-08

## Context

The TRAIN-only, noisy R1 cost ladder reports Plasma 1.83→1.22 and Karman
2.43→1.83 ms/frame for dye 1024→512. [Per-encoder attribution](../benchmarks/gpu-budget.md#e1-per-encoder-attribution-train-only)
finds Plasma dye advection area-like (126 µs); Karman dye-source/outlet
allocate about 29% of busy time. These are diagnostic budgets, not additive
or universally significant savings.

The owner reviewed the [committed six-TRAIN-preset packet](../benchmarks/owner-review/dye-resolution/README.md)
and approved half dye resolution **2026-10-08**, without naming presets.
ADR 0107 Amendment 4 registers that approval as the visual gate because E2
cannot certify resolution changes.

## Decision

Trial the generic `dyeResolution` default at 512 (was 1024). Explicit preset
or prop values remain unchanged; no preset-name special cases. This remains
Bucket C; no shader, lifecycle, simulation-grid or native-DPR change.
Set `dyeResolution={1024}` on Fluid to restore the previous default.

## E1 result

Round 6 candidate `1a60913`, archived at `archive/e1-r6-dye-default`.
Lead futility stop after 41/66 clean TRAIN slots: 13/22 complete R3 scenes,
SvgPath small n2, eight scenes not started. Amendment 6 primary split verdict
**INCOMPLETE**, secondary strict per-scene **FAIL** (4/13 pass).
Matched13-scene active headline saving 23.405%, untouched 23.646%, descriptive
only. The lead's stop is judgement, not a mathematically proven primary failure.
Held-out not run; gain unproven, generic default restored to 1024.
Full tables: [energy-eval.md](../benchmarks/energy-eval.md#round-6--owner-approved-half-dye-default-not-kept).

## Consequences

Lower default dye texture area; potentially softer detail. Owner approval
covers appearance, not an energy claim. E1 failure restores the prior default.
