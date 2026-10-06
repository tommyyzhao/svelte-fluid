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

## Pre-sweep implementation correction (after first feasibility pilot)

Initial registration commit `bb6f3b46cfd1ffceac951c120f9d77b57251c1ec` predates
all pilot data. The first Karman invocation exposed a capture implementation
weakness, not a quality result: run 2 split three normal 40-encoder frames into
16+24 encoders across 8.571334, 8.424917 and 7.867041 ms CPU-submit gaps. The fixed
6 ms cluster heuristic created 603 bursts for 600 marks; contiguous matching
then accumulated whole-frame offsets (47.941250 ms), not clock drift.

Before any sweep, use **`max(10.75 ms, 0.4 × median JS inter-mark interval)`** for
clustering; record its value and the old 6 ms burst count/disagreement. This
changes a frame-grouping parameter, **not the independent <4 ms alignment gate**,
exact N clusters, native-write/transfer checks, union attribution or contention
gate. At measured 120 Hz, three RAFs give ~25 ms spacing and the 10.75 ms floor.
A unique native-write terminator was rejected: normal Karman frames write the
same native-sized IOSurface in both first and final command buffers, so writes
alone cannot independently segment frames.

Original Karman run 1 replays identically (p95 3.583163 ms, alignment 2.564792 ms);
run 2 now has 600 aligned clusters/native-write frames, zero strays, p95
3.365292 ms, alignment 2.711333 ms; all three split frames recover 40 encoders.
Pilot gap separation: maximum intra-frame 8.571334 ms, minimum inter-frame
14.001583 ms. These diagnostic replays do not overwrite original verdicts.

Original run 3 hit the 70 s ceiling; its trace has about 75 frames over 1.826 s,
then no further measured submissions. The old script returned JS marks only at
completion; visibility/focus and the exact stalled wait are unrecoverable.
It remains INCONCLUSIVE, not an inferred zero execution or a visibility claim.
Measurement now exports progressive marks to the owned runner, records
visibility/focus transitions, bounds each RAF/presentation/progress wait to 2 s,
and bounds page evaluation to 62 s (under the recorder ceiling). Partial/error
attempts remain INCONCLUSIVE and close their owned page. No system focus changes,
security changes or repeated screen takeover: a visible unoccluded headed window
is required; genuine occlusion/focus interference must stop measurement.

Replay validation before the fresh pilot: 206 trace entries inspected, **197
historical 60-frame traces + two 600-frame pilot traces replayable**; seven lack
marks/retained ownership or contain zero marks and cannot be validated. All
previously aligned historical frame assignments are identical (therefore GPU
interval unions/statistics/verdicts unchanged). Three prior INCONCLUSIVE rows
recover split bursts: exploratory pass-log GasFlare (61→60 bursts, alignment
6.963042→1.374208 ms, p95 13.152002 ms FAIL), post-opt run1 Plasma (61→60,
22.959125→3.812375 ms, p95 3.444751 ms FAIL), p3 solver-baseline default
(62→60, 24.328000→2.464166 ms). Preserve their original reports.
Across replayable aligned mappings: **25,838 intra-frame gaps**, median
0.486208 / p95 1.170375 / p99 2.367667 / max **8.571334 ms**;
**12,467 inter-frame gaps**, min **12.915791 ms** / p01 18.794166 /
median 24.031750 / p95 25.832625 ms. Initial 12 ms floor separated observed
groups but left only 0.915791 ms inter-frame margin. Before a fresh pilot or any
sweep, centre the floor at **10.75 ms** (rounded midpoint 10.7435625), giving
**2.178666 ms intra / 2.165791 ms inter** observed margins. Cached replay confirms
identical assignments/results versus the 12 ms trial across all 199 replayable
traces. No per-scene gap tuning; unseen stalls remain possible.

Misassignment is intended to fail closed: exact N attributed clusters, the
independent <4 ms JS-spacing gate, zero strays and complete native writes/transfers
are all mandatory; split/merged bursts fail these checks as INCONCLUSIVE rather
than yielding a budget verdict. These gates validate this paced workload, not a
mathematical proof against every possible coincident misassignment. A thin gap
margin primarily increases the inconclusive rate; never relax the alignment gate
to conceal it. Fresh validation remains required.

Mechanical harness hardening before any sweep: a 90 s outer attempt deadline
covers navigation, warm-up, recording, export and cleanup; AbortController cancels
async export/analysis, exact owned PID+command census cleanup retains all foreign
processes. Every phase writes progress; partial attempts remain INCONCLUSIVE and
advance. No completed attempt for five minutes saves partial results, cleans owned
resources and exits nonzero. Self-check simulates a never-resolving phase and
asserts deadline cleanup. Attached GPU PID disappearance is checked during
startup and measurement and reported as INCONCLUSIVE, not an attribution failure.
Exports use async `execFile` with a 15 s bound. Parsing each trace in a short-lived
Bun child prevents ~2 GiB XML/parser RSS accumulating in the Chrome-owning parent;
log parent RSS before each browser launch. Two earlier third-run attempts stalled
or lost targets (one trace ended at 70 s after submissions stopped, another at
1.393218 s with “Target app exited”); memory pressure is a hypothesis, not proved
causation. Preserve all
failed pilot attempts and revalidate the hardened harness on Karman only.

### Pre-sweep infrastructure retry amendment

Fixed before any matrix data: **GPU-process-exit attempts are infrastructure
INCONCLUSIVE and may be retried at most twice extra per run slot** (three total
attempts, 30 s wait). Preserve and report every attempt. Never retry a clean
FAIL to erase it, never discard a clean result. A scene requires **R=3 distinct
clean run slots per requested seed**; otherwise report **INCOMPLETE**, with
observed clean failures retained separately. CONTENDED retains the existing
one-extra-attempt bound. Fresh Playwright temporary profile/browser per attempt
(no shared user-data-dir); close owned context/browser after each, `Bun.gc(true)`.
Record parent RSS before launch and ordinary Chrome stderr logging; no GPU-behavior
flags. Run six Karman-only slots to diagnose the repeated third-slot exit pattern,
not a quality sweep. DiagnosticReports inspection found no matching Chrome crash/
hang report at the pilot times; the Chrome Helper report dated 06:32 is an earlier
user-Chrome disk-write advisory, unrelated and untouched.
