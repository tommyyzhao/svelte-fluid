# ADR 0110: Presentation-only rate cap

**Status:** Accepted as opt-in (`maxFps` default 0); default-on not adopted — see Outcome
**Date:** 2026-10-07

## Context

Round 1 (ADR 0109) failed E2: halving solver steps at equal wall time changed
step-count-dependent pressure, decay, forcing and RNG. Round 2 caps only
presentation; no physics or spatial filtering change is proposed. ADR 0107,
including Amendment 1, remains the keep/revert protocol.

## Decision

- `FluidConfig.maxFps?: number | null`, default 0 (opt-in; see Outcome), Bucket A. `0`/`null`
  presents every RAF; undefined preserves the resolved value; negative and
  nonfinite values are ignored. Fluid, config wrappers and every preset forward
  it uniformly, without preset-specific tuning or wrapper-loop changes.
- Every scheduler callback still executes `calcDeltaTime`, input draining,
  colour timers, auto-splat RNG, `simulateFrame`, governor and settle exactly
  as before. No accumulated dt, reduced step count or wrapper RAF gating.
  Only `renderCore` / `renderProfiled` (bloom, sunrays, display, glass and
  shared-host snapshot/present) are gated by the scheduler's RAF timestamp.
- Each engine owns a phase-preserving deadline gate, ported from round 1:
  rolling median of five display deltas in 1–100 ms, default 60 Hz estimate,
  half-display-interval due tolerance, ideal-period deadline advancement,
  reanchor after falling over three periods behind. Displays at/below the cap
  pass through. Reset on start/resume, resize, hot rate change, reversed time
  or suspension gap over 100 ms.
- Simulation makes the displayed image dirty even when presentation is skipped.
  Paused-dirty renders bypass the gate; explicit render/readback APIs remain
  ungated. Start/resume/resize/restore first frames are due. Settle renders a
  dirty final state before stopping RAF. No extra textures or changed GL context
  attributes are introduced. Own-tier `preserveDrawingBuffer: false` remains;
  shared canvases retain their last bitmap until the next due snapshot.
- The governor's existing sample is live inter-update wall time, not CPU/GPU
  submission cost. It is still sampled on **every** RAF before the presentation
  decision, with unchanged EMA/dwell/cooldown policy. Equal RAF timestamps and
  clocks therefore yield identical tiers. Less real rendering work can relieve
  genuine display stalls and thus avoid shedding; no synthetic compensation,
  rate-dependent reset or fabricated render-cost estimate is added.
- Surface, pigment, enamel and other model engines are unchanged.

## Cost model and limits

For display refresh above 60 Hz, ideal saving is
`render share × (1 − 60 / display Hz)`: at 120 Hz, half of rendering's share,
not half of total solver+render work. Below/equal 60 Hz there is no cadence
saving. Shared-tier snapshot copies are part of rendering's share. Presentation
exceptions and refresh jitter reduce this bound. No energy claim until E1.

At a fixed solver clock, velocity/dye should remain byte-identical because
presentation reads current fields (sunrays uses only disposable dye write
scratch). Same-wall-time displayed stills can lag by one presentation period.
Temporal smoothness and uneven 90/144 Hz cadence require owner motion review;
E2 still images cannot certify motion. No spatial resolution, filtering,
interpolation, dithering or postprocess parameters change, satisfying Amendment 1.

## Verification

Node policy checks: 60/90/120/144 Hz, 60 Hz pass-through, jitter, ideal phase,
hot rate changes, reset/suspension/reversed clocks and far-behind reanchor.
Config checks cover default, undefined and invalid hot patches and generated
agent documentation.

Hardware browser checks compare capped/uncapped seeded generic scenes after
identical synthetic 120 Hz RAF timestamps: velocity/dye byte equality, every
solver tick, half render submissions; both own/shared tiers and profiled paths.
Default-framebuffer draw/clear spies and page-region compositor screenshots
check skipped-frame retention on both tiers. Shared bitmap canvases also retain
`drawImage` pixels. Own WebGL `drawImage` outside its draw frame can legally
observe a cleared drawing buffer despite a retained compositor image; it is
not an on-screen retention oracle. Paused-dirty rendering, resize/resume/explicit renders, settle's
last image and identical governor state are checked. Required focused idle,
paused-dirty, shared-present and governor suites plus the full hardware suite
and Node/check/prepack results are recorded upon completion.

Recorded checks: Node **880/880** (52 files), check **0 errors / 0 warnings**,
prepack/publint/public declarations pass. New hardware tests **9/9**: after
120 identical synthetic 120 Hz updates, velocity/dye readback bytes match
exactly on own/shared and normal/profiled paths; each executes 120 solver
updates and capped rendering submits **60/120 = 0.5**. Both composited-image
retention checks pass with zero default-framebuffer writes on skipped frames.
Focused hardware suite **56/56** across idle, paused-dirty-render,
shared-present (measurement opt-in), performance-governor and shared-frame-
scheduler, **268.96 s**. Each browser run holds the exclusive GPU lock and
releases it immediately, yielding E1 or five continuously free minutes before
reacquisition. Full installed hardware Chrome suite **344/344** (37 files),
**314.50 s**, including the nine presentation tests. No unsafe GPU flags.
Read-only review found no surviving high-confidence defects.

E1/E2 evals and owner motion review are intentionally not run by this lane.

## Outcome (2026-10-07)

Hill-climb round 2 under ADR 0107. The pre-registered keep rule was **not
completed**:

- **E1 energy (exploratory):** the training go/no-go across 5 fully active
  scenes gave a median **44.6%** GPU-ms/s saving at 120 Hz. On held-out scenes
  only **2 of 48** candidate slots completed: **35.0%** saving against
  interleaved paired baselines, **30.0%** against the frozen baseline. That is
  far short of the registered coverage. The block stopped when the owner
  directed headless-only browsers. macOS headless Chrome runs at a fixed
  60 Hz (`BeginFrameControl is not supported on MacOS yet`), where this cap
  has no effect. The owner chose not to collect more headed data.
- **E2 visual guardrail:** under ADR 0107 Amendment 2 (null-relative), the
  train statistics fail on one run (p = 0.003) and pass borderline when pooled
  over two replicates (p = 0.013, threshold 0.01). The excess over null is
  small and only weakly correlated with sample timing. **No held-out E2 run
  was made.** Temporal smoothness was never assessed (still images only).

Decision: ship `maxFps` as an **opt-in** control, default `0`. Default output
is byte-identical to before. The physics stays unchanged (proven by byte-identical
readbacks), and the energy evidence is strong but exploratory, so users on
high-refresh displays can choose `maxFps={60}`. Changing the default needs the
full held-out E1 matrix at 120 Hz (headed or on a 120 Hz-capable runner), a
held-out E2 pass, and an owner motion review.

### Owner-approved paired follow-up (2026-10-09 train checkpoint)

ADR 0107 Amendment 5 (`9678d33`, before capture) reopened headed 120 Hz
measurement for this lane only. Engine source `9984ca1`, harness `d9563ce`;
public `maxFps=0`/`60` overrides, independent-browser paired R3, frozen
windows/parser/retry list. Train attempted all 132 originals plus 18 registered
retries: 126 resolved clean slots, 18/22 complete scenes. Six missing slots
and four incomplete scenes remain descriptive, never silently replayed.

Train active Amendment 5 secondary: **18/18 complete scenes pass**. Amendment 6
(`a3d2dee`) primary: registered ratio-of-scene-arm-median headline saving
**43.1184815%**, from **205.3912554 → 116.8296649 GPU-ms/s**. Median baseline
active noise **2.81076%**, twice noise **5.62152%**, ≥5% floor: threshold
**PASS on the 18/22 complete-pair subset**, not a full-matrix pass. Median
per-scene paired saving **40.1514%** is secondary/descriptive; independent
audit corrected the initial checkpoint's primary label before held-out verdict. Untouched nonzero complete-scene
paired saving **39.2635%**, own measured noise **3.53698%** descriptive; the
registered active-noise rule is not replaced by an untouched threshold.
Default/Toroidal untouched windows preserve 0/0 rest without a relative ratio.
All clean RAF probes approximately 120 Hz, genuine hidden RAF 0. One hidden
window exceeds the registered `max(idle) ≤ max(control)` floor: 0.0645543
versus 0.0477459 GPU-ms/s. A post-hoc control-spread relaxation was withdrawn;
whole-process GPU attribution is not engine-submission accounting.

Full tables, missing slots, load/CI/wrapper incidents and verified cleanup:
`dev-docs/benchmarks/energy-eval.md`, “120 Hz paired maxFps evaluation”. Train
results committed before held-out. Lead accepted train A6 go; held-out decision
is reported below. Amendment 5 cites equal-clock byte-equality hardware evidence;
that is not displayed-image certification at equal wall time. Default adoption
still needs full held-out E1, held-out E2 and owner motion review. These
measurements do not authorize adoption. **Default remains 0**.

### Outcome — paired held-out completion (2026-10-10)

All 96 held-out originals attempted; 22 retry/rerun rows, 83/96 resolved clean
slots, 7/16 complete paired scenes.

**Verdict: held-out INCOMPLETE; the saving is unproven.**
- Coverage is too thin to certify the held-out split (7/16, or 6/16 without lead reruns).
- Two lead-applied reruns sit outside the registered retry list. They widened it, which
  the protocol forbids.

Descriptive subset arithmetic only, not a pass: A6 headline **15.6764%**
(167.8875845 / 141.568812 GPU-ms/s) against a **11.5884%** bar; excluding the lead
reruns, 21.8538% against 8.6144%.

A5 secondary passes 6/7 scenes; TeslaValve DPR1 seed11 fails its own noise
bar. Complete-scene matched-run active savings **12.3880%–35.4736%**, median
**22.1601%**. Complete R3 arm groups satisfy frozen max(idle) ≤ max(control);
incomplete groups remain unclassified, including two individual nonzero idle
windows. Clean refresh gates pass. Recorded quiet-ack timeouts/watchdog errors
are zero, with the separately disclosed inactive-watchdog FrameFluid DPR2
seed23 R3 pair (maximum parsed trace 582,384,902 bytes, below 10 GiB).

Compact rows/hashes, missing-slot causes, lead annotations and sensitivity:
`dev-docs/benchmarks/max-fps-120hz-summary.json` and the held-out section of
`energy-eval.md`. Two successful blind lead-applied reruns preserve their
operator-aborted FAILED originals; byte-copy provenance is explicit.
No held-out equal-wall-time E2 quality pass or owner motion approval exists.
**Default remains 0** (lead decision under owner delegation, 2026-10-09, Bead
v73): a 60 Hz cap halves presented motion cadence on 120 Hz displays, and the
held-out E2 and owner motion review a default change would need do not exist.
Because the energy saving is unproven, the configuration docs no longer claim
one. They now describe only the mechanism: half the presented frames. The
earlier "roughly halving GPU work" claim is removed.
