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

### Round 1 — 60 fps frame cap (8f27341)

2026-10-07. Scheduling-only candidate `8f27341a86eb47238a5efd00808c3d8c99533518`, frozen baseline `1006e8fae1e670a72be67e1ff75800a43b35ff5e`; empty props override, `--spatial-safe`, ADR 0107 Amendment 1 scoped calibration. Held-out test: four presets × DPR2/DPR1 × seeds 11/23, 1024×640, 16 pairs.

**ADR verdict: WORSE.** Six losses / seven non-tie pairs = **85.7143%** (limit 33.3333%); one candidate win, nine ties. Statistics fail: **45 violations across 15/16 scenes** (low 30, mid 6, chroma 9; coverage/high none). Both independent gates fail; this round does not satisfy the keep rule. Diagnostic-only null comparison: **WORSE**, candidate losses over all pairs **6/16 = 37.5%**, pooled identical-render null **2/18 = 11.1111%**. The null remains train calibration, not a held-out null estimate.

Result JSON: `/tmp/quality-eval/cap-8f27341/verdict.json`. Command: `bun scripts/quality-eval.mjs compare --label cap-8f27341 --source-root /Users/admin/Projects/personal-archive/fluid-project/svelte-fluid/.claude/worktrees/agent-ad633c470d2438e83 --props '{}' --spatial-safe`.

GPU fairness: observed E1 release 06:23:27, E2 acquire 06:23:32, E2 release 06:29:17, E1 acquire 06:29:32 (local time; 5-second observation granularity). One 16-scene hold, approximately **5 min 45 s**, below 12 minutes; no reacquisition. Ordinary installed hardware Chrome. Nonfatal Vite dependency-scan warning on the unrelated missing `SplashCursor.svelte` docs import; all 16 engine captures and 32 judge trials completed successfully.

Agent sanity read (not owner review): read three actual composite images plus both judge reasons, FrozenSwirl DPR2 seed23 and DPR1 seeds11/23. All three final ties look sane: comparable broad cyan plumes, smooth gradients and late diffusion; local folds/brightness differ without a consistent winner. Each pair had a preference in one trial and a tie in the swapped trial, so conservative split-to-tie handling is appropriate. Images: `/tmp/quality-eval/judge-inputs/1ab74f56-e7f7-4655-b181-8d87354a1719/pair.png`, `/tmp/quality-eval/judge-inputs/5f310b48-b8ae-4f04-8136-8661688bea5d/pair.png`, `/tmp/quality-eval/judge-inputs/53039ff1-dbbb-4c12-83d7-c089cf805c42/pair.png`. Owner review remains pending; stills do not establish temporal smoothness.

#### Out-of-band statistics

All scenes are 1024×640. Wall times in seconds; values and widened bands rounded to nine significant digits here, full precision in verdict JSON.

| Scene | Wall | Metric | Value | Band [lower, upper] |
|---|---:|---|---:|---|
| FrozenSwirl-dpr2-seed11 | 2 | low | 0.00840443342 | [0.00941216417, 0.0165486219] |
| FrozenSwirl-dpr2-seed11 | 5 | low | 0.00232587563 | [0.00247698896, 0.00575841019] |
| FrozenSwirl-dpr2-seed11 | 10 | low | 0.00288354621 | [0.00333679221, 0.00578066845] |
| FrozenSwirl-dpr2-seed11 | 10 | mid | 0.0407400953 | [0.0517156925, 0.0668955852] |
| FrozenSwirl-dpr2-seed11 | 20 | low | 0.00366122483 | [0.00419251772, 0.00676904949] |
| FrozenSwirl-dpr2-seed23 | 2 | low | 0.00627205271 | [0.00941216417, 0.0165486219] |
| FrozenSwirl-dpr2-seed23 | 20 | low | 0.00416444577 | [0.00419251772, 0.00676904949] |
| FrozenSwirl-dpr1-seed11 | 2 | low | 0.00794793088 | [0.00992226737, 0.0181744746] |
| FrozenSwirl-dpr1-seed11 | 5 | low | 0.00254838798 | [0.00373497254, 0.00533480801] |
| FrozenSwirl-dpr1-seed11 | 5 | mid | 0.0470242028 | [0.0475017942, 0.0630303411] |
| FrozenSwirl-dpr1-seed11 | 10 | low | 0.00359543197 | [0.00387007101, 0.00611872105] |
| FrozenSwirl-dpr1-seed11 | 10 | mid | 0.0499802671 | [0.0503635465, 0.066753209] |
| FrozenSwirl-dpr1-seed23 | 2 | low | 0.0069933936 | [0.00992226737, 0.0181744746] |
| FrozenSwirl-dpr1-seed23 | 5 | mid | 0.0470042233 | [0.0475017942, 0.0630303411] |
| FrozenSwirl-dpr1-seed23 | 10 | mid | 0.0496220823 | [0.0503635465, 0.066753209] |
| FrozenSwirl-dpr1-seed23 | 20 | mid | 0.0476622827 | [0.0480221342, 0.0606669392] |
| AnnularFluid-dpr2-seed11 | 5 | low | 0.089421831 | [0.0958143351, 0.141195153] |
| AnnularFluid-dpr2-seed11 | 10 | low | 0.120073425 | [0.140507506, 0.173313206] |
| AnnularFluid-dpr2-seed11 | 20 | low | 0.12031255 | [0.120943587, 0.16237563] |
| AnnularFluid-dpr2-seed23 | 10 | low | 0.122811653 | [0.140507506, 0.173313206] |
| AnnularFluid-dpr1-seed11 | 5 | low | 0.0839700094 | [0.089480601, 0.140602688] |
| AnnularFluid-dpr1-seed11 | 10 | low | 0.127184213 | [0.132633877, 0.175287291] |
| AnnularFluid-dpr1-seed11 | 20 | chroma | 0.0233137559 | [0.0189709743, 0.0232899336] |
| AnnularFluid-dpr1-seed11 | 20 | low | 0.108601831 | [0.124104695, 0.176211846] |
| AnnularFluid-dpr1-seed23 | 2 | low | 0.0821623974 | [0.0924551079, 0.135083097] |
| AnnularFluid-dpr1-seed23 | 5 | chroma | 0.0491586122 | [0.03221169, 0.044957232] |
| AnnularFluid-dpr1-seed23 | 5 | low | 0.0769989111 | [0.089480601, 0.140602688] |
| AnnularFluid-dpr1-seed23 | 10 | low | 0.124566752 | [0.132633877, 0.175287291] |
| AnnularFluid-dpr1-seed23 | 20 | low | 0.106347988 | [0.124104695, 0.176211846] |
| FrameFluid-dpr2-seed11 | 20 | chroma | 0.0484403184 | [0.0261037297, 0.0473217535] |
| FrameFluid-dpr2-seed11 | 20 | low | 0.128562537 | [0.0775906139, 0.110730389] |
| FrameFluid-dpr2-seed23 | 2 | chroma | 0.0469261778 | [0.0520633403, 0.0754369157] |
| FrameFluid-dpr2-seed23 | 5 | chroma | 0.078223714 | [0.0447775302, 0.0641507963] |
| FrameFluid-dpr2-seed23 | 20 | low | 0.139525363 | [0.0775906139, 0.110730389] |
| FrameFluid-dpr1-seed11 | 20 | chroma | 0.0555959817 | [0.0192346053, 0.0262455202] |
| FrameFluid-dpr1-seed11 | 20 | low | 0.127979136 | [0.0790481406, 0.109230079] |
| FrameFluid-dpr1-seed23 | 2 | chroma | 0.0461502574 | [0.0525859568, 0.0775492103] |
| FrameFluid-dpr1-seed23 | 5 | chroma | 0.0725075047 | [0.0473173119, 0.0634929955] |
| FrameFluid-dpr1-seed23 | 5 | low | 0.0969794781 | [0.0692214535, 0.0931176073] |
| FrameFluid-dpr1-seed23 | 10 | low | 0.126825249 | [0.0623182444, 0.117306449] |
| FrameFluid-dpr1-seed23 | 20 | low | 0.14232149 | [0.0790481406, 0.109230079] |
| TeslaValve-dpr2-seed23 | 5 | chroma | 0.0123122074 | [0.0124645971, 0.0175508271] |
| TeslaValve-dpr2-seed23 | 20 | low | 0.11152596 | [0.0811409342, 0.105295033] |
| TeslaValve-dpr1-seed11 | 2 | low | 0.103648264 | [0.0812689053, 0.103066669] |
| TeslaValve-dpr1-seed23 | 2 | low | 0.120402125 | [0.0812689053, 0.103066669] |

Verification: harness `--self-check`, `bun run test` (52 files, 870 tests) and `bun run check` (zero errors/warnings) passed.
