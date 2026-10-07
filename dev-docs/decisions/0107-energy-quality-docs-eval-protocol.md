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
