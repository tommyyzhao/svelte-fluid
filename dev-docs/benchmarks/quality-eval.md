# Visual-quality guardrail — ADR 0107 E2

## Method

[Pre-registered protocol](../decisions/0107-energy-quality-docs-eval-protocol.md). Frozen baseline `1006e8fae1e670a72be67e1ff75800a43b35ff5e`. Ordinary installed hardware Chrome, native canvas DPR, registry configuration plus Fluid CSS-quality policy, real FluidEngine RAF loop; no `advance` or manual frame driver. Foreground frames/readbacks at fixed **wall** times 2/5/10/20 s (±250 ms hard capture gate). An observer wraps the original production update (never drives it): at each target wall time, it copies the just-rendered canvas before compositor clearing, then reads curl and encodes the retained 2D canvas. At natural RAF stop it retains the final draw, so settled scenes remain visible. Copy/readback/encoding briefly perturbs RAF in both variants; sampling timestamps recorded. Initial outside-draw toDataURL attempt discarded (cleared settled buffers); Playwright screenshot and primed CDP attempts rejected by timing gate (1.43s and 0.47s latency). Observer repair performed before bands/calibration. No temporal-smoothness claim from stills.

Coverage uses display sRGB Rec.709-weighted luminance > configured background + 4/255; colour energy is mean OKLCH chroma (OKLab a/b norm after sRGB linearisation). Curl readback: zero-mean 128×128 normalized-domain nearest resampling, 2D FFT, radial integer bins; low <0.1 Nyquist, mid <0.3, high remainder. Zero curl reports three zeros. These bin edges are harness operationalisation (ADR does not specify edges), frozen with the baseline. Bands are **per wall time** min/max over seeds 5/11/23; widened lower=min×0.9, upper=max×1.1. All five statistics must remain within bands.

Blind Opus judge sees only `pair.png` in an isolated input directory, no mapping or metadata. Each panel has four whole-frame thumbnails, four matching 192×192 native-pixel detail crops; composite width 1544 px avoids vision-input downscaling. Crops (reference-gradient-selected, fixed for both variants). Mapping lives separately; second independent session swaps sides. Inconsistent decisions count as tie. Native details prevent global-sheet downsampling hiding 2-pixel blur. Candidate loses must be ≤1/3 of non-ties; calibration must pass before compare runs. CLI limits tools to Read, disables settings/MCP inheritance. Stills cannot establish frame-rate smoothness; owner review remains required.

## Calibration

Six train-only seed-5 DPR2 scenes: Plasma 1440×900, CircularFluid 800×500, Aurora 1440×900, InkInWater 800×500, Karman at both train sizes. Karman sim128/p24 applies only to the two Karman scenes. 2 px Gaussian blur means sigma=2 physical PNG pixels, radius=6; 50% desaturation mixes displayed RGB with luminance gray. These are post-process controls, not production changes.

Status: **FAIL — E2 unusable; compare blocked**.

| Control | Pairs | Reference preferred | Ties | Split pairs | Pass |
|---|---:|---:|---:|---:|---|
| identical | 6 | 0.0% | 6 | 3 | yes |
| blur | 6 | 66.7% | 2 | 0 | no |
| half-resolution | 6 | 83.3% | 0 | 0 | yes |
| karman128-p24 | 2 | 100.0% | 0 | 0 | yes |
| desaturation | 6 | 100.0% | 0 | 0 | yes |

Identical requires tie-or-split ≥80%; each degradation requires reference preferred ≥80%. No threshold relaxation.

### Repair attempts

- Attempt 1: FAIL; prompt hash `a3edc303a197181f480d8213c6eca112061d3307817f153cbca7d456658928ef`. identical: 5/6; blur: 6/6; half-resolution: 4/6; karman128-p24: 0/2; desaturation: 6/6.
- Attempt 2: FAIL; prompt hash `2cef6696665bbf576d9e9f646f83dfd444ec3bc615a3e939a7eb2abc9018569e`. identical: 6/6; blur: 4/6; half-resolution: 5/6; karman128-p24: 2/2; desaturation: 6/6.
- Attempt 3: FAIL; prompt hash `6f6c346436d32cb7f2abbb8448650e7f52a638d81c0ee9a26478cb12c3634e31`. identical: 2/6; blur: 5/6; half-resolution: 5/6; karman128-p24: 2/2; desaturation: 6/6.
- Attempt 4: FAIL; prompt hash `c29e7b2cc65f423a0b95219176cda611c7d368ad7314ba47d87e8ab4fa43a099`. identical: 6/6; blur: 4/6; half-resolution: 5/6; karman128-p24: 2/2; desaturation: 6/6.

Attempt 1 over-rewarded sharp/noisy fine curls. Attempt 2 added describe-both, sequence reading and multiscale coherence; static obstacle softness caused blur ties. Attempt 3 excluded static silhouettes but added a general tie-breaking clause; this amplified chaotic rerender differences and failed identical calibration. Coordinator authorised a **post-hoc fourth attempt beyond the planned three-attempt cap**: attempt-2 rubric plus only fluid/static-silhouette exclusion, no tie-breaking clause. No 80% threshold, bands or no-worse rule changed.

### Fresh validation (train seeds 11/23; untouched during prompt repair)

Status: **FAIL**, rubric hash c29e7b2cc65f423a0b95219176cda611c7d368ad7314ba47d87e8ab4fa43a099.

| Control | Pairs | Reference preferred | Ties | Pass |
|---|---:|---:|---:|---|
| identical | 12 | 16.7% | 10 | yes |
| blur | 12 | 58.3% | 5 | no |
| half-resolution | 12 | 91.7% | 1 | yes |
| karman128-p24 | 4 | 100.0% | 0 | yes |
| desaturation | 12 | 100.0% | 0 | yes |

Fresh blur ties: Karman at both sizes, both seeds; Aurora 1440×900 seed 11. The blind spot is therefore **not exclusively obstacle scenes**. Identical rerender specificity is pooled across fresh seeds (seed 11: 4/6 ties; seed 23: 6/6).

### Future-round null diagnostic

The fixed ADR rule remains authoritative: losses ≤1/3 of non-ties, all statistics in band. `compare` also reports a diagnostic-only null comparison: candidate reference-loss fraction over **all pairs**, ties included, versus identical-render reference-loss fraction. Final calibration null: seed 5 = 0/6, fresh seeds = 2/12, pooled = **2/18 (11.1%)**. These train controls are not a held-out-scene null estimate. No candidate round run; both verdict paths remain blocked by failed calibration.

### Statistics separation

| Degradation | Scenes with out-of-band statistics | Metrics |
|---|---:|---|
| blur | 0/6 | none |
| half-resolution | 6/6 | low, mid, high, chroma, coverage |
| karman128-p24 | 2/2 | coverage, mid, high, low |
| desaturation | 6/6 | chroma |

Fresh statistics separate half-resolution 12/12, Karman128/p24 4/4, desaturation 12/12; blur 0/12. Desaturation violates chroma at all four wall times. Karman violates vorticity spectrum bands at both train sizes. Post-process blur/desaturation leave curl unchanged by construction. Statistics and judge are separate gates; not every control must perturb every statistic. Detailed records: `evals/quality/calibration.json`, `evals/quality/calibration-fresh.json`; all four prompts/summaries preserved in `evals/quality/calibration-attempts.json`.

## Baseline bands

30 scene-size-DPR groups × 3 seeds × 4 wall times; 90 captures. Train: all 11 train presets, both sizes, DPR2. Test: all four held-out presets, 1024×640, DPR2/DPR1. Compact per-time bands in `evals/quality/baseline-bands.json`; PNGs/curl in `/tmp/quality-eval/baseline/<scene>/`. Train extra seeds exist only for the specified band estimation, not candidate tuning.

## Owner spot-check

Five randomly sampled calibration pairs; owner review **pending**. Disagreement reopens the affected decision. Composites committed (2938902 bytes total); original /tmp paths ephemeral. Read the composite before consulting verdict/mapping. Owner copies are losslessly re-encoded PNGs, preserving pixels.

| # | Scene | Control | Unblinded pair verdict | Durable image | Original input |
|---|---|---|---|---|---|
| 1 | Karman-1440x900-dpr2-seed5 | desaturation | reference | [Composite](quality-eval/spot-1.png) | `/tmp/quality-eval/judge-inputs/7f625127-2333-42aa-93cb-b5d3c9772d39/pair.png` |
| 2 | Karman-800x500-dpr2-seed5 | half-resolution | candidate | [Composite](quality-eval/spot-2.png) | `/tmp/quality-eval/judge-inputs/c8bc6624-5ab6-4943-aa98-c2d8a5b4eac0/pair.png` |
| 3 | InkInWater-800x500-dpr2-seed5 | blur | reference | [Composite](quality-eval/spot-3.png) | `/tmp/quality-eval/judge-inputs/af9cbd1d-55b2-4c7b-a567-8efa363d83fc/pair.png` |
| 4 | Plasma-1440x900-dpr2-seed5 | blur | reference | [Composite](quality-eval/spot-4.png) | `/tmp/quality-eval/judge-inputs/de46ad7f-0c75-4693-8849-b560b4a9eed0/pair.png` |
| 5 | Aurora-1440x900-dpr2-seed5 | identical | tie (split) | [Composite](quality-eval/spot-5.png) | `/tmp/quality-eval/judge-inputs/0dc7568c-47f7-4532-837d-3f2fb3c3f812/pair.png` |

## Usage

`bun scripts/quality-eval.mjs --self-check`

`bun scripts/quality-eval.mjs baseline` (run at frozen baseline SHA only)

`bun scripts/quality-eval.mjs calibrate --attempt 1`

`bun scripts/quality-eval.mjs compare --label round1 --props '{"pressureIterations":24}'`

Code candidate at `8f27341` (dependencies installed in that checkout):

`bun scripts/quality-eval.mjs compare --label cap-8f27341 --source-root /Users/admin/Projects/personal-archive/fluid-project/svelte-fluid/.claude/worktrees/agent-ad633c470d2438e83 --props '{}'`

This serves/builds the candidate modules through its own Vite checkout. The recorded `sourceSha` identifies its Git HEAD; no checkout/reset is performed by the harness. Baseline/config cache is separate. Calibration currently fails, so these commands intentionally refuse before capturing/judging a candidate; a protocol amendment must explicitly change the gate, not mutate calibration evidence.

An independently built candidate checkout: `--source-root /absolute/candidate/worktree`; Vite serves that checkout without changing this lane. Default compare: test seeds 11/23, both DPRs; `--split train` supports train-only diagnostics at seed 5. Results: `/tmp/quality-eval/<label>/verdict.json`. Labels must be unique per variant; cached captures verify source SHA/config. GPU lock acquired automatically, ports 5230–5239 only, ≤25-scene capture chunks.

## Rounds
