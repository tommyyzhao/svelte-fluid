# ADR 0105: Pre-register the longer native GPU budget protocol

**Status:** Accepted
**Date:** 2026-10-06
**Amends:** [ADR 0101](0101-p95-gpu-budget.md), sampling only

## Context

The owner chose **“Stabilise measurement, then sweep.”** This protocol is fixed
**before any new sweep data or feasibility-pilot capture exists**. No runtime,
shader or preset change belongs to this decision. Native means Metal execution
measurement of the local-main WebGL2/ANGLE runtime, not the WebGPU replacement.

The existing [post-optimisation matrix](../benchmarks/gpu-budget.md#post-optimisation-full-matrix--2026-10-06)
contains 31 unchanged own-tier scenes / 136 clean 60-frame repeats. Their median
scene p95 range is **0.530916 ms**, maximum **1.703376 ms**. The 27 own scenes with
two clean post-opt seed-5 repeats have median absolute p95 difference
**0.318750 ms**, maximum **0.949169 ms**. Many residual gaps are only 0.08–0.6 ms.
At N=60, index 56 is the fourth-worst frame; three observations determine the tail.

Existing frame arrays only: `/tmp/post-opt-matrix/run{1,2}/capture.json`,
`/tmp/gpu-capture/{native-matrix,components,retry-attribution}/capture.json`,
`/tmp/opt-solver/before/capture.json`, and
`/tmp/opt-solver/sunrays-pairs/p{1,2,3}-baseline/capture.json`. Restrict to the
136 clean, aligned own-tier arrays, each 60 frames. Deterministic xorshift32 seed
5, 2,000 bootstrap replicates **per original run**, with replacement, existing
`round(.95*(N-1))` rank; never pool different scenes or runs. IID resampling gives
median estimated p95 SD **0.120444 → 0.036563 ms** for N=60 → 600 (70% reduction);
median central-95% width **0.3224 → 0.0788 ms**. Circular five-frame block bootstrap
sensitivity gives median SD **0.130325 → 0.033368 ms**, width **0.3026 → 0.1002 ms**.
The 90th-percentile IID SD remains **0.431058 → 0.202318 ms**: difficult tails
remain. N=1200 gives median SD 0.022547 ms, only 0.014016 ms beyond N=600 while
doubling capture cost. These are conditional empirical estimates, not confidence
bounds on new captures; 60-point distributions cannot establish unseen tails,
stationarity or long-range dependence. Between-run clocks/contention variability
will not shrink merely by increasing N.

## Decision

- Default **N=600 measured frames, R=3 independent runs, 200 warm-up frames**.
  Each run launches a fresh owned Chrome process; each scene reconstructs and
  warms independently. Matrix runs traverse the same fixed scene order, rather
  than three adjacent scene repeats. Reference seed **5**, unchanged native DPR,
  fixed dt 1/60 s, three-RAF pacing, presentation drain before measurement.
- Keep warm-up 200: no existing evidence justifies changing simulation age;
  first/last 20-frame medians after warm-up have median signed difference
  −0.0169 ms (median absolute difference 0.0761 ms), not a uniform startup ramp.
  This does not establish sustained thermal equilibrium.
- Compute each run's p95 separately, zero-based sorted index **569**, the
  **31st-worst of 600** (30 observations above). **PASS requires all three runs
  clean for every requested seed and every clean run p95 strictly <2 ms**.
  Any clean failure remains FAIL; missing clean runs remain INCONCLUSIVE unless
  already FAIL. Do not pool frames, average p95s or choose favorable retries.
  Report every attempt's median/p95/max and clean cross-run min/max/range of each.
- Preserve Metal interval-union attribution, <4 ms relative mark alignment,
  exactly N attributed clusters, zero strays, N native IOSurface writes, N
  requested/delivered shared/model transfers, and **≥5% foreign overlap gate**
  (WindowServer excluded). No attribution thresholds change. Existing bounded
  CONTENDED retry remains one after 30 s; never retry FAIL into PASS or relax
  alignment. All attempts remain visible; incomplete R cannot certify PASS.
- `--frames N` / `GPU_CAPTURE_FRAMES`, `--runs R` / `GPU_CAPTURE_RUNS` override
  defaults for explicit experiments; CLI wins. `--legacy` fixes 60 frames / one
  run / old 10 s ceiling for historical comparisons, not new certification.
  Preserve `--seed`, `--self-check`, `--replay`; replay uses recorded protocol,
  never silently applies 600/3 to historical captures.
- `xctrace help record` confirms `--time-limit <time[ms|s|m|h]>` and
  `--window <duration[ms|s|m]>`. **No rolling window**: it would discard frames.
  600 frames at three RAFs require about **30 s at 60 Hz**, not 10 s (15 s at
  120 Hz). Raise default hard limit to **70 s**, stop early after final drain:
  `ceil(N*3/60*2+10)` seconds, except historical `--legacy` at 10 s.
  Prefix every xcrun with the explicit Xcode `DEVELOPER_DIR` environment.

## Consequences

R=3 exposes between-run spread without claiming its reduction by √R; the verdict
uses the **worst** clean p95, not an average. Three runs are a practical minimum
for detecting repeat instability, not proof of population reliability. The
smallest residual gaps may remain undecidable; do not tune quality against
single favorable short captures. Later protocol changes require another dated
pre-registration, not adjustment after seeing a sweep.

Pilot **only Karman own 1440×900, native DPR**, three runs. Verify feasibility:
N aligned clusters/writes, complete transfers where applicable, recording and
export size/time. Preserve failed/inconclusive attempts rather than altering
thresholds. No full matrix in this task. Historical measurements/verdicts remain
unchanged. Pilot evidence will be appended separately after protocol commitment.
