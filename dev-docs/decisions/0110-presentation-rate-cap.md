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
(`a3d2dee`) primary: median paired saving **40.1514%**, median baseline active
noise **2.81076%**, twice noise **5.62152%**, ≥5% floor: **PASS**. Active arm
headlines **205.3913 → 116.8297 GPU-ms/s**. Untouched nonzero complete-scene
paired saving **39.2635%**, own measured noise **3.53698%** descriptive; the
registered active-noise rule is not replaced by an untouched threshold.
Default/Toroidal untouched windows preserve 0/0 rest without a relative ratio.
All clean RAF probes approximately 120 Hz, genuine hidden RAF 0. One hidden
window is nonzero but within its blank-control floor; not called exact zero.

Full tables, missing slots, load/CI/wrapper incidents and verified cleanup:
`dev-docs/benchmarks/energy-eval.md`, “120 Hz paired maxFps evaluation”. Train
results committed before held-out. Lead accepted train A6 go; held-out decision
still pending. Amendment 5 uses existing byte-equality hardware evidence for E2
stills; motion review still belongs to the owner. **Default remains 0**.
