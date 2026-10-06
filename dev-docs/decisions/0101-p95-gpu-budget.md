# ADR 0101: p95 GPU execution budget at native DPR

**Status:** Accepted
**Date:** 2026-10-06

## Context

The 1.0 performance target required every frame (max) to execute in <2 ms GPU
per instance at native DPR. The [native Metal measurements](../benchmarks/gpu-budget.md#native-metal-execution-measurement--2026-10-0506)
recorded in `aec018e` found 18 PASS / 25 FAIL across 43 scenes on an M1 Max at
native DPR 2. Median, p95 and max were already reported separately.

The owner saw these results before choosing “Adopt p95 < 2 ms target” via
AskUserQuestion on 2026-10-06. **This is a post hoc decision, not a pre-registered
metric.** It does not retrospectively make the strict-max target pass.

## Decision

Replace “every frame (max) <2 ms” with **95th-percentile GPU execution per
instance per frame <2 ms at native DPR** as the 1.0 performance target.
Keep max reported alongside median and p95; preserve the strict-max results as
history. This changes the acceptance statistic, not the attributed GPU execution
metric, workload, native DPR, contention gate or measured numbers.

The execution metric remains the union of native Metal execution intervals
belonging to the instance's command-buffer burst, including same-burst ANGLE and
Chrome work. It is not CPU submission time, wall throughput or total browser/OS
GPU cost.

### Statistic and limits

Each existing capture measured 60 paced frames after 200 warm-up frames. Sort
those per-frame execution times ascending; the recorded p95 is zero-based index
56 (57th of 60), with max at index 59. With only 60 frames, p95 is roughly the
3rd-worst frame; under this specific convention it is exactly the 4th-worst,
with three frames above it. This is a coarse tail estimate, not a reliable
long-run percentile or a guarantee about every frame, other hardware, native
DPRs or sustained workloads. The report's attribution and scanout limits remain.

## Consequences

- Re-tabulating the existing 43 selected scene rows gives **28 PASS / 15 FAIL**
  under p95 <2 ms. No new captures or runtime optimisation support this change.
  Row selection remains the existing worst-max valid clean capture per scene;
  this re-tabulation does not select favourable repeats or claim worst-p95 across
  all repeats.
- Ten strict-max failures become p95 passes; their max exceedances remain visible.
  Passing p95 is not a claim of stutter-free presentation or every-frame compliance.
- **This is not a waiver.** The 15 scenes still failing p95 must be optimised;
  the 1.0 performance goal remains open (`svelte-fluid-7n8`). Subsequent work needs
  fresh measurement, native-DPR preservation and visual nondegradation evidence.

## Open optimisation work

Failing rows: own 1440×900 (default), Plasma, AnnularFluid, Toroidal, GasFlare,
Karman and TeslaValve; own 800×500 Karman and TeslaValve; shared 1440×900 Karman,
GasFlare, LavaLamp and (default); own fractional 480.25×300.5 Karman; shared
800×500 InkPaper held wet. Their existing p95 values and verdicts are
[re-tabulated in the benchmark](../benchmarks/gpu-budget.md#owner-adopted-p95-verdict--2026-10-06).

Per-shader GPU shares remain unproved. Solver iteration and bloom workload
inventories identify candidates, not measured hot-pass rankings. Runtime tuning
and new captures are separate work, not part of this decision record.
