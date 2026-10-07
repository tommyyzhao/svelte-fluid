# ADR 0109: Per-instance automatic frame-rate cap

**Status:** Rejected (see Outcome)
**Date:** 2026-10-07

## Context

ADR 0080 shares one RAF, but continuously driven Fluid instances still submit
at display refresh. ADR 0099 stops quiet scenes, not continuous drivers.
This is energy hill-climb round 1: one scheduling change, designed against
synthetic clocks and train-only generic scenes. No E1/E2 result is claimed.

## Decision

- `FluidConfig.maxFps?: number | null` defaults to **60**. `0`/`null` is
  uncapped; omitted values preserve resolved hot state, negative/nonfinite
  values are ignored. Bucket A; no framebuffer allocation/recompilation.
  `Fluid` consumes it; all fluid wrappers/presets forward it normally.
- `subscribeFrame` accepts an optional per-subscriber rate getter. Existing
  model engines stay uncapped. The gate runs before the callback/host/GL;
  capped and uncapped siblings coexist. Error eviction, last-unsubscribe
  cancellation and SSR-safe import remain.
- Five valid RAF deltas (1–100 ms) give a rolling median display interval.
  Reset on restart, resume, rate change, nonmonotonic time or a >100 ms gap;
  suspension gaps do not enter the median. Default estimate is 60 Hz until
  evidence arrives. Submit at `now >= nextDeadline - displayInterval/2`;
  advance the *ideal* deadline by whole target periods, never from submission
  time. Re-anchor when >3 periods behind; at most one callback per display
  tick. Displays no faster than the target pass through. Quantized cadence
  averages 60/s on 90/120/144 Hz instead of the broken elapsed-only 90/72/s.
- The scheduler timestamp reaches `update`. Skipped ticks never change the
  simulation clock or drain queued pointer segments. Capped operation on a
  faster display admits `targetPeriod + displayInterval`, bounded to 250 ms
  (or the legacy configured `maxTimeStep * substeps` when larger). Existing
  required-substep logic divides this dt into steps no larger than
  `maxTimeStep`. Stalls are discarded past that bound, not replayed in bursts.
  Uncapped/no-gating displays keep the legacy dt clamp. Manual `advance()` and
  reduced-motion `settleStill()` are unchanged.
- The autoPerformance governor receives the mean of display-tick deltas since
  the last submission (each bounded to 250 ms), not the multi-tick submission gap. Thus deliberate gaps do not
  shed quality; actual display stalls remain visible. Dwell/cooldown clocks
  still count elapsed submission time, separately bounded to 250 ms per sample.
  Uncapped/manual sample semantics remain. A rate change resets governor history.
- Auto-reveal/distort/sticky loops use the same phase gate before synchronous
  splats. All ready elapsed trajectory time counts, including skipped ticks;
  not-ready/offscreen pause clears the delta anchor and gate, preventing
  resume jumps. >100 ms RAF suspension gaps do not advance the wrapper trajectory,
  matching the gate's suspension reset; this intentionally also discards long
  main-thread stalls in these illustrative auto-curves. Interaction cancellation, duration cutoff, reduced-motion
  and cleanup remain. These loops retain their existing RAF lifecycle;
  wrapper and engine phases are independent. Imperative `splat()` (including
  pointer-driven wrapper splats) stays synchronous **outside** the cap.

## Consequences and quality limits

Fewer presentations are not necessarily half the solver work: 90/144 Hz
quantization requires occasional extra substeps to preserve elapsed time.
This is a candidate, not a certified energy saving or quality equivalence.

Sticky/reveal multiplicative dye decay, velocity decay in those modes,
pressure warm-start retention and some forcing are per solver step, not per
wall second. Their appearance can differ with step counts. Auto-splat interval
jitter is resampled per submitted update, so timing/random sequences can differ.
Automatic wrapper dye doses occur less often; geometry follows ready wall time,
not a resampled fixed-timestep trajectory. None of these algorithms is changed
in this round. E2 must inspect coverage/energy/vorticity; owner review must
inspect motion smoothness and uneven refresh cadence, which still images cannot
judge. Settle checks remain per submitted frame; settle latency can increase
relative to a high-refresh baseline. Surface/pigment/enamel and other model
engines are explicitly out of scope.

## Verification

Node tests cover 30/60/90/120/144 Hz, jitter, refresh switch, suspension,
uncapped siblings, hot rates, restart, error eviction, resolution semantics and
dt admission/substep bounds. Hardware browser tests exercise synthetic RAF
against the real engine and automatic wrappers: submit counts, skipped GL draws,
accumulated simulation time, queued pointer input, governor, hot allocation,
imperative/manual semantics, pause trajectory and interaction cleanup.
Relevant idle/governor/paused-dirty-render/lifecycle suites and full browser
suite are required alongside Node/check/prepack; results recorded at completion.
E1/E2 keep/revert evals belong to the lead, not this implementation lane.

Validation at code commit `cb5c125`: Node **875/875** (52 files), check **0 errors /
0 warnings**, prepack/publint/public declarations pass. Installed hardware Chrome
full browser suite **338/338** (37 files, 295.27 s), including idle, governor,
paused-dirty-render, lifecycle/wrappers and the eight frame-cap tests. Synthetic
90/120/144 Hz clocks each submit **60/s** over five seconds and retain >4.96 s
simulation time; skipped ticks leave GL and queued pointer input untouched.
Real hardware-browser RAF in this headless run measured **61.22 display ticks/s
and 61.22 submissions/s** (display-rate pass-through tolerance; not native
ProMotion evidence). Browser execution held the exclusive GPU lock for <5 min,
then released it. Post-review coverage includes governor wall-time dwell,
skipped-tick display stalls and wrapper suspension gaps. No E1/E2 or owner
smoothness verdict was run; status remains Proposed.

## Outcome — Rejected (2026-10-07)

Hill-climb round 1 under [ADR 0107](./0107-energy-quality-docs-eval-protocol.md).
The code (`cb5c125`, `8f27341`) was **not merged**; it stays reachable via
those SHAs.

- **E2 visual guardrail: WORSE** on all 16 held-out pairs (`--spatial-safe`,
  Amendment 1 scope). Judge: 6 losses / 7 non-tie pairs (85.7%, limit 33.3%);
  null diagnostic 6/16 = 37.5% vs identical-render 11.1%. Statistics: 45
  band violations across 15/16 scenes (curl low band 30, mid 6, chroma 9).
  Details: [quality-eval Round 1](../benchmarks/quality-eval.md).
- **E1 energy:** not decisive. The keep rule needs both gates; the
  candidate runs that were in progress are logged as data only.
- **Likely cause:** halving the step count at equal simulated time changes
  physics that depend on the number of steps. Large-scale vorticity and
  dye colour drift out of the baseline band. A cap is only quality-neutral if
  every step-count-dependent term is dt-correct, or if the solver keeps its
  cadence. That is the round-2 design question.

Status: **Rejected.** No `maxFps` prop ships.
