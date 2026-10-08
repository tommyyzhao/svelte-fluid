# ADR 0112: Half dye resolution as the generic default

**Status:** Proposed
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

Pending Round 6: committed candidate, headless hardware Chrome at 60 Hz,
TRAIN R3 then held-out only after passing TRAIN. Frozen Amendment 3 baseline;
per-scene >2× registered noise and ≥5% bars unchanged. Record the result here
before accepting or rejecting this ADR.

## Consequences

Lower default dye texture area; potentially softer detail. Owner approval
covers appearance, not an energy claim. E1 failure restores the prior default.
