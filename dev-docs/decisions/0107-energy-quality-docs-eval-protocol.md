# ADR 0107: Energy, visual-quality and agent-docs eval protocol (pre-registered)

**Status:** Accepted
**Date:** 2026-10-06

## Context

The owner reprioritised performance from the <2 ms frame budget (ADR 0105/0106)
to "don't drain laptop and phone batteries". Battery drain follows GPU work per
second, not per frame: on this 120 Hz ProMotion M1 Max the shared RAF loop
(`engine/frame-scheduler.ts`) submits a full solve + render every display
frame, with no frame-rate cap. ADR 0099 settles only driver-free scenes; 9 of
14 presets have a continuous driver (`autoSplatRate`, `flow`, `sources`) and
never settle.

Optimising an energy number alone invites the cheapest win: a worse image. This
ADR fixes three evals, their train/test splits, noise rules and the keep/revert
rule **before** any harness code or library change, so the split and margins
cannot drift after data is seen (the post-hoc margin in ADR 0106 is the
counter-example this prevents).

## Decision

### Splits (frozen; hash-derived, not chosen)

Presets are ordered within category by
`sha256("svelte-fluid-eval-split-v1:" + id)`. Test = first preset of each
category plus the next-lowest hash overall (4/14 ≈ 29%):

| Split | Presets |
|---|---|
| **Test (held out)** | FrozenSwirl, AnnularFluid, FrameFluid, TeslaValve |
| Train | `(default)`, LavaLamp, Plasma, InkInWater, Aurora, CircularFluid, SvgPathFluid, Toroidal, GasFlare, Venturi, Karman |

| Split | CSS sizes | DPR | Seeds |
|---|---|---|---|
| Train | 1440×900, 800×500 | 2 | 5 |
| Test | 1024×640 (unseen) | 2 and 1 | 11, 23 |

Candidates may be designed, debugged and tuned only on train scenes. Test
scenes are run only for the frozen baseline and for a candidate's single
keep/revert decision. No per-preset change may name a test preset.

### E1 — energy (programmatic)

- **Metric:** Chrome GPU-process GPU-busy ms per wall-second: the union of
  Metal command-buffer execution intervals (xctrace Metal System Trace, same
  parser as `scripts/gpu-capture.mjs`) over a fixed window ÷ window length.
  Ordinary hardware Chrome, real `<Fluid>` component and real RAF loop (not the
  manual `update()` driver of ADR 0105, because the levers are scheduling).
- **Scenarios per scene** (one mount, sequential windows, 10 s each):
  `active` (t = 5–15 s after mount), `untouched` (t = 30–40 s, no input),
  `offscreen` (scrolled out of viewport, from 5 s after scroll), `hidden`
  (tab backgrounded, from 5 s after hide). A blank-page control is measured
  each run; `offscreen`/`hidden` pass "0 GPU" when within the control's noise.
- **Refresh:** native (ProMotion; measured RAF Hz recorded) is the primary
  condition. A 60 Hz display condition is measured only if achievable without
  changing system settings; otherwise recorded as not measurable here.
- **Settle latency** (driver-free scenes): time from the scene first meeting
  `isQuiet` (`engine/settle.ts`, probed in a separate diagnostic run) to the
  engine stopping its RAF subscription. Target ≤ 5 s.
- **Noise floor:** R = 3 independent browser runs per train scene at baseline;
  per-scene noise = (max − min) / median of the active-window metric. Test
  baseline also R = 3.
- **Headline:** median over held-out scenes of `active` and `untouched`
  GPU-ms/s. Goal: ≥ 25% lower than the frozen baseline.

### E2 — visual-quality guardrail

- **Statistics** (per scene, frames at fixed wall times 2/5/10/20 s): dye
  coverage (fraction of pixels whose luminance exceeds background + 4/255),
  colour energy (mean OKLCH chroma), and vorticity spectrum (radially binned
  power spectrum of curl read back via `readField`, reported as
  low/mid/high-band fractions). Band = baseline min–max over seeds 5/11/23;
  "no worse" = candidate within band widened by 10%.
- **Judge:** blind pairwise LLM judge, model tier different from the
  implementer (judge = Opus when Sonnet implements). Inputs are contact
  sheets of the same scene at the same wall times; A/B side randomised per
  trial with the mapping held outside the prompt; verdict ∈ {A, B, tie}.
  Each pair is judged twice with sides swapped; inconsistent verdicts count
  as tie.
- **Calibration (must pass before use):** identical renders → tie or split in
  ≥ 80% of pairs; known degradations (2 px Gaussian blur, half sim/dye
  resolution, Karman sim128/p24, dye desaturated 50%) → the reference is
  preferred in ≥ 80% of pairs each. If calibration fails, fix the judge prompt
  or inputs before any candidate is judged.
- **"No worse":** candidate loses in ≤ 1/3 of non-tie pairs across test scenes
  and all statistics stay in band. The owner spot-checks 5 randomly sampled
  verdicts later; a disagreement reopens the affected decision.
- Known limit: stills cannot show temporal smoothness (frame rate). That is
  covered by the owner review, not claimed by the judge.

### E3 — agent docs

- **Tasks:** ~30 realistic integration requests (fixture SvelteKit app, local
  packed `svelte-fluid`). Held out = tasks ordered by
  `sha256("svelte-fluid-e3-split-v1:" + taskId)`, first 30% (rounded up).
- **Subjects:** fresh `claude -p` sessions, Haiku and Sonnet, each given only
  `llms-full.txt` and `SKILL.md` from the current build; no web, no repo
  access.
- **Grader (programmatic):** `svelte-check` clean, `vite build` succeeds,
  non-blank hardware render of the target route, and per-task prop/component
  assertions. Pass = all four.
- **Noise:** R = 2 per task × model at baseline; report Wilson 95% intervals.
  "Up beyond CI" = held-out pass rate's lower bound exceeds the baseline point
  estimate.

### Hill-climb rule

1. One root-cause change per round, designed on train only.
2. **Keep** only if train and test both improve by more than 2× the measured
   noise floor (E1: and ≥ 5% relative), and E2 judges quality no worse.
   Otherwise revert and log the round in the eval's results page.
3. After 2 consecutive non-kept rounds, make no library change: bucket the
   remaining failures by cause and fix harness/eval errors first.
4. Never copy test-scene or held-out-task specifics into code, presets or
   docs. Cost reduction at equal quality is always a valid objective.
5. Results are reported against the frozen baseline with intervals.

## Consequences

- Easier: every energy or docs claim has a baseline, a split and a noise
  floor; the next agent can rerun one command per eval.
- Harder: changes that only help named scenes cannot be kept; a frame-rate
  cap must win on held-out scenes and survive the visual judge.
- Rejected: Battery Status API (Chrome-only, coarse); per-frame p95 as the
  energy metric (ignores frame rate); pixel-diff quality metrics (fluid is
  chaotic); lowering default render resolution (native-resolution rule).

## Amendment 1 — E2 judge scope (post-hoc, 2026-10-07)

**Labelled post-hoc:** decided after calibration data was seen.

Calibration (four bounded prompt attempts, the fourth authorised beyond the
planned three; seed 5 then fresh train seeds 11/23, thresholds unchanged):

| Control | Seed 5 | Fresh 11/23 | Stats |
|---|---|---|---|
| Identical (tie/split) | 100% | 83.3% | — |
| 2 px blur (reference preferred) | 66.7% | **58.3%** | 0/6 out of band |
| Half sim+dye resolution | 83.3% | 91.7% | 6/6 out of band |
| Karman sim128/p24 | 100% | 100% | spectrum 2/2 out of band |
| Dye desaturated 50% | 100% | 100% | chroma 6/6 out of band |

Under the original rule E2 is unusable. The single failure is a
reproducible blind spot (2 px post-process blur, ties concentrated on
obstacle-dominated Karman scenes), and neither judge nor statistics detect it.

Decision: **E2 is usable with a scoped exclusion.** It may gate a candidate
only if the candidate does not change spatial resolution, filtering,
interpolation or display post-processing (blur/bloom/sunrays radius,
resolution fields, dithering, texture filtering, advection scheme). Such
candidates need owner visual review instead; E2 cannot certify them. Every
other calibrated degradation is detected by the judge on unseen seeds.

"No worse" adds a diagnostic beside the unchanged 1/3 rule: candidate
reference-loss rate (all pairs) versus the identical-render null
(2/18 = 11.1%, pooled). The 1/3 rule decides; the null comparison is
reported only.

Rationale: the scheduling candidates in this sprint (frame-rate cap, idle
settling) change temporal cadence, not spatial filtering, so the blind spot
does not bear on them; the judge sees same-wall-time stills, and temporal
smoothness remains an owner-review item as stated above.

## Amendment 2: E2 gates are relative to a measured null (added after seeing the data, 2026-10-07)

**Added after seeing the data:** written after Round 1 failed and Round 2 failed on train,
and after seeing the null-train statistics (baseline re-render vs baseline:
15/440 checks out of band, 3.4%). It is written **before** the null-test
results, the null-train judge verdicts and any replicate, and it is applied
unchanged to every round, including re-judging Rounds 1–2.

Finding: the statistics bands (min–max of 3 seeds, widened 10%) reject an
unchanged re-render of the frozen engine in 9 of 22 train scenes. Read as an
absolute zero-violation rule, the statistics gate falsely rejects a
null candidate. The identical-render calibration measured only the judge.

Decision:
1. **Null distribution.** For each split, capture K = 3 fresh baseline
   re-renders (stats; one of them also judged). The pooled null per-check
   violation rate is p0 = Σ null violations / Σ null checks.
2. **Statistics gate.** A candidate is WORSE on statistics if and only if its
   violations, pooled over its replicates, exceed p0 under a one-sided
   binomial test with p < 0.01. The test is stricter than 0.05 to allow
   loosely for scene-level clustering. Replicates: at least 1 on the test
   split; the train pre-check may use 1.
3. **Judge gate.** WORSE if and only if the non-tie loss fraction is greater
   than 1/3 **and** the all-pair candidate loss rate exceeds the pooled null
   all-pair loss rate (identical-render calibration plus null-split judge
   verdicts) under a one-sided binomial test with p < 0.05.
4. "No worse" requires both gates to pass. Calibration controls, bands,
   seeds and the Amendment 1 scope are unchanged.

## Amendment 3 — E1 headless 60 Hz baseline (post-hoc, 2026-10-07)

**Post-hoc:** the owner prohibited agent-headed browsers after the historical
baseline and Rounds 1–2 were observed. Existing headless feasibility smokes
are exploratory, not registered baseline slots. This amendment is committed
**before any new headless E1 baseline data**. Rounds 1–2 produced no registered
keep; hill-climb rule 3 requires an eval repair before another library change.

From Round 3 onward the measurement condition is installed hardware Chrome
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless=new`,
**60 Hz** on this Mac, verified by the independent RAF probe. Renderer must
be ANGLE Metal Apple M1 Max; no SwiftShader or unsafe GPU flags. macOS lacks
BeginFrameControl. The headed native-120-Hz baseline remains historical;
never pool it with, or compare candidate savings against, headless data.

New frozen baseline engine is local main
`37bbe851c0d52c86241f6964c3b443f17e95611b`: `maxFps` defaults to 0,
behaviour-equivalent to `e4be335` at present-every-frame. The harness asserts
`src/lib` unchanged from `37bbe85`; `--self-check` retains its non-capture
escape. No library changes in this repair. All splits, CSS sizes, DPRs,
seeds, windows, blank controls, independent-browser **R=3**, active-window
noise formula, headline, keep rule, E2 guardrail and 0-GPU rule are unchanged.
Train captures precede held-out captures; held-out scenes are baseline only.

Additional **measurement-only** motion telemetry: separate diagnostic mounts
for driver-free baseline scenes on R1 (one diagnostic per matrix scene),
same config/size/DPR/seed, no input. In the
untouched t=30–40 s interval, sample consecutive engine-frame pairs at the
first frames at/after t=30/32/34/36/38 s (five pairs). `readField('velocity')`
reports max Euclidean speed in simulation texels/s; `readField('dye')` reports
max absolute RGB-channel change between each pair, also the window maximum.
Record actual pair times/frame intervals, independent RAF/engine cadence,
production settle-probe maxima/verdicts and quiet-to-unsubscribe latency.
Settled scenes are recorded as settled, not assumed to have sampled movement.
These readbacks occur **after the energy trace**, never inside energy windows;
telemetry cannot alter the E1 metric. Nonzero dye change proves evolution,
not perceptual visibility by itself; compare its magnitude to 1/255 only as
an explicitly diagnostic scale, not a new settle/keep threshold. Preserve
missing/failed probes; never infer rest from an invalid zero-filled readback.

Closed infrastructure-retry list stays: recorder-start timeout; recorder
finalisation timeout (including outer-task ceiling during finalisation);
missing execution coverage; GPU-process exit; contention; ENOSPC; raw-trace
oversize; visibility gate not met. Exactly one logged end-of-run retry per
failed slot; retain originals, never retry a clean metric. Unclassified
failures stay missing with their reason. Existing 15 GiB free-space guard,
10 GiB scratch watchdog, exclusive owned GPU lock and ≤25-minute batches
remain mandatory. Rank stages on TRAIN only using existing measurement
facilities; unavailable stage attribution must be reported, not fabricated.

## Amendment 5: 120 Hz headed paired condition for presentation-cadence candidates (owner-approved 2026-10-08)

**Pre-registered before capture:** the owner approved headed browser runs for
this 120 Hz measurement on 2026-10-08 and said "go". This exception applies
only to lane `E1-120hz`; Amendment 3's headless condition remains separate.
Amendment 4 is registered independently by the spatial-candidate lane.

Use installed hardware Chrome, ordinary flags, direct launch and CDP
`noDefaults:true`, genuine hidden tabs, ANGLE Metal Apple M1 Max. Native
ProMotion RAF must be approximately 120 Hz in every slot: the independent RAF
probe in active, untouched, offscreen and blank-control windows must be
114–126 Hz (±5%); hidden RAF remains 0. A failed refresh check is an
infrastructure failure under the existing visibility/refresh gate, not a
candidate loss. Preserve the original; allow exactly one end-of-run retry.

Engine source is local main `9984ca1`; public prop overrides compare
`{"maxFps":0}` with `{"maxFps":60}`. For each frozen scene and independent
browser run, measure the two arms back to back: baseline then candidate on
R1/R3, candidate then baseline on R2. R=3 per arm. Train precedes held out.
Fresh pairs eliminate days of drift; the historical headed baseline is not
reused for this decision. All frozen splits, sizes, DPRs, seeds, windows,
blank controls, parser/metric, closed retry list, 0-GPU rules and keep rule
remain unchanged: saving must exceed twice that scene's baseline-arm R3
active noise and be at least 5%. Report each window's paired saving as the
median of its three matched-run relative savings; report arm median GPU-ms/s
and split headlines separately. Missing pairs cannot establish a keep.

E2 stills are no-worse by construction: `maxFps` gates presentation only,
not solver updates, forcing, RNG, filtering or spatial resolution. ADR 0110
Verification records byte-identical velocity/dye readbacks after 120 equal
synthetic 120 Hz updates on own/shared, normal/profiled paths (9/9 hardware
checks), with 120 solver updates and 60/120 render submissions. Still-frame
statistics/judging need not re-test identical solver fields. Temporal
smoothness remains the owner's motion review at `/examples/bench/max-fps`;
this evaluation does not authorize changing default `maxFps=0`.

Exclusive atomic-mkdir GPU lock: owner lane `E1-120hz`, purpose, start,
worktree and PID, plus acquired-at. Hold ≤25 minutes per batch. Yield after
release until the other lane has acquired and released or five continuously
free minutes; never SOLO with both lanes. No tests/builds during captures.
Retain free-space guard, raw watchdog and ktrace diff cleanup; delete raw
traces after parse. Never touch foreign locks or Chrome processes.

## Amendment 7 — held-out liveness only (lead decision, 2026-10-09)

Pre-registered after the FrameFluid hang, before further held-out data. This
is the lead's liveness-only decision, not owner approval for adoption or a
change to successful measurements. FrameFluid DPR1 seed11 baseline R2 stalled
in `offscreen`; PID 12260 held the lock from 02:30:35Z until operator SIGTERM
at approximately 03:50Z on 2026-10-10 (78 minutes at discovery). No exception
was emitted. Its preserved reason is `Unclassified liveness hang in offscreen;
pending page/CDP call did not settle; stopped PID 12260 after 78-minute hold`.
It is missing and unclassified, with no retry. Only its owned raw trace and
empty temporary directory were removed after PID exit and owner-checked release.

Every awaited page/CDP operation inside a capture must race the existing
per-slot abort signal. A wall deadline terminates exactly the owned
Chrome/xctrace/Vite process tree, records the slot FAILED as
`attempt timeout (liveness)`, completes cleanup and releases the lock. The
25-minute hold cap becomes a hard timer: stop the invocation after cleanup
and release, rather than checking elapsed hold only between slots. Liveness
timeouts are **not retryable**; they remain missing under the unchanged closed
retry list. A bounded cleanup must not await the same stalled CDP transport.

Measured windows, parser, RAF/control gates, metrics, retry list and thresholds
are unchanged. All slots captured before this amendment used the old harness;
their successful measurements remain valid because this fix does not change
the measurement path. Preserve per-row harness SHA and measurement hash to
identify the split. Commit this amendment before implementing the liveness
fix; commit the fix separately after self-check, tests and Svelte checks under
the load/free-lock gates. Further captures require independent review and the
lead's explicit review OK. Default `maxFps` remains 0.

Implementation note (lead rule, 2026-10-10): each attempt samples lock freedom
and five-minute load average every 5 seconds. Five continuous minutes means
all samples show the lock free and load below 15. The gate exits cleanly after
85 minutes without writing a slot row or touching another owner's lock.
After acquiring its own lock, the harness rechecks load once; load at or above
15 causes owner-checked release and a fresh wait. These environment gates sit
outside the frozen measurement block.
