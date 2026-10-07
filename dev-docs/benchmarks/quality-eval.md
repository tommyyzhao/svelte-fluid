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

Protocol deviation: the judge model (Opus) is the same tier as the implementer of rounds 1–2 (Opus), contrary to ADR 0107's 'model ≠ implementer'. The judge sees only blind renders (no code or authorship), so self-preference risk is low, but this is recorded rather than silently accepted.

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

### Round 2 — presentation-only 60 Hz cap (2a57fcb), TRAIN pre-check

2026-10-07. Candidate `2a57fcb4fe9612ef10fc5fd6b3f7120d8184d290`, frozen baseline `1006e8fae1e670a72be67e1ff75800a43b35ff5e`; empty props, `--spatial-safe`, ADR 0107 Amendment 1. Solver steps every RAF; only presentation is capped. TRAIN only: 11 presets × two sizes (1440×900, 800×500), DPR2, seed 5, **22 pairs**. This is a train pre-check, not a held-out keep/revert decision. No test split run or temporal-smoothness claim.

**ADR verdict: WORSE.** **6 losses / 6 non-ties = 100%**, limit 33.3333%; 0 candidate wins, 16 ties. Statistics fail: **29 violations across 14/22 scenes** (low 16, mid 7, coverage 3, chroma 2, high 1). Both gates fail. Diagnostic-only null: **WORSE**, candidate losses over all pairs **6/22 = 27.2727%**, original pooled identical-render null **2/18 = 11.1111%**. Recheck evidence below does not replace that frozen null.

Result JSON: `/tmp/quality-eval/r2-2a57fcb-train/verdict.json`. Command: `bun scripts/quality-eval.mjs compare --label r2-2a57fcb-train --source-root /tmp/r2-candidate-2a57fcb --props '{}' --spatial-safe --split train`.

The first attempt failed with **ENOSPC**; owned partial label outputs were deleted before retry. Disk preflight showed 14 GiB free (minimum 6 GiB). Retry captured all 22 scenes successfully using ordinary installed hardware Chrome. GPU lock acquisition observed 08:26:51, release 08:34:48 -0700 (one-second observation granularity): **approximately 7 min 57 s**, below 12 minutes. One batch, no reacquisition. Subsequent judging used cached captures, no GPU lock.

Judge startup then failed: `Judge exit 143: [claude-code:unrecognized_model] {"model":"opus-class[1m]","query_source":"sdk"}` after the ten-minute timeout. Recovery used environment-only `ANTHROPIC_DEFAULT_OPUS_MODEL=opus-class`; no source/config edits. CLI JSON `modelUsage` reported **`opus-class`**, not an underlying provider model. The same frozen rubric and stored seed-5 calibration composites were rejudged twice with sides swapped: identical **6/6 tie-or-split (100%)**, half-resolution **5/6 reference-preferred (83.3333%)**, both ≥80%. One half-resolution Karman pair split to tie. Recheck JSON: `/tmp/quality-eval/r2-2a57fcb-train-calibration-recheck.json`. Five candidate pairs had been judged before the coordinator's recheck prerequisite arrived; the owned judging process was stopped, those five cached judgments discarded, and all 22 candidate pairs rejudged only after the recheck passed. This ordering deviation is disclosed, not treated as valid premature evidence.

Protocol deviation: the judge model (Opus) is the same tier as the implementer of rounds 1–2 (Opus), contrary to ADR 0107's 'model ≠ implementer'. The judge sees only blind renders (no code or authorship), so self-preference risk is low, but this is recorded rather than silently accepted.

Agent sanity read (not owner review): inspected three actual composites and both judge reasons for each. All three are consistent reference preferences. LavaLamp 800×500: reference retains layered red/orange filaments and readable late vortex bodies; candidate late native crops are paler/more diffuse. CircularFluid 1440×900: both coherent, reference has clearer layered ribbons and stronger mid-sequence colour; preference plausible, still affected by chaotic layout. SvgPathFluid 1440×900: reference retains connected late ribbons and distinguishable internal gradients; candidate purple late crop is diffuse/dark. Static mask crispness was not used. Owner review remains pending; stills cannot establish temporal smoothness.

Cited composites retained:
- LavaLamp: `/tmp/quality-eval/judge-inputs/52d98240-538a-4f7c-82e6-4b4ce7b992ea/pair.png`
- CircularFluid: `/tmp/quality-eval/judge-inputs/6cb6593a-9910-48a8-aa8c-1507bf9dd421/pair.png`
- SvgPathFluid: `/tmp/quality-eval/judge-inputs/637bee59-8c54-40fc-a502-4c7d04a70d87/pair.png`

#### Actual sample-time offsets

Candidate minus matching frozen baseline `actualWall`, milliseconds, from capture JSONs. Across 88 samples: **min −7.70, median +1.05, max +17.20 ms**. First drawn frame after a target can be approximately 16 ms later under the cap; RAF phase/readback variability also changes offsets, including negative values. These are recorded actual offsets, not an assumed alignment. All captures met the ±250 ms hard gate.

| Scene | 2 s | 5 s | 10 s | 20 s |
|---|---:|---:|---:|---:|
| Aurora-1440x900-dpr2-seed5 | +3.50 | -3.00 | +3.80 | -3.20 |
| Aurora-800x500-dpr2-seed5 | -5.80 | -4.00 | -3.60 | -3.90 |
| CircularFluid-1440x900-dpr2-seed5 | -2.60 | -1.20 | -3.50 | +6.00 |
| CircularFluid-800x500-dpr2-seed5 | +2.80 | +2.90 | +4.10 | +3.00 |
| GasFlare-1440x900-dpr2-seed5 | +0.40 | -6.10 | +1.00 | -6.40 |
| GasFlare-800x500-dpr2-seed5 | +3.70 | +1.70 | +3.60 | +4.80 |
| InkInWater-1440x900-dpr2-seed5 | +7.80 | +12.70 | +5.00 | +14.30 |
| InkInWater-800x500-dpr2-seed5 | +3.90 | +5.90 | +5.00 | +4.80 |
| Karman-1440x900-dpr2-seed5 | -2.30 | -0.90 | +8.50 | +7.80 |
| Karman-800x500-dpr2-seed5 | -2.60 | -2.60 | +5.70 | -2.70 |
| LavaLamp-1440x900-dpr2-seed5 | +1.60 | +0.10 | +0.80 | -7.70 |
| LavaLamp-800x500-dpr2-seed5 | +0.20 | -0.20 | +1.20 | +1.10 |
| Plasma-1440x900-dpr2-seed5 | +1.90 | +1.20 | +3.70 | +9.60 |
| Plasma-800x500-dpr2-seed5 | +3.40 | +2.50 | +2.10 | +4.60 |
| SvgPathFluid-1440x900-dpr2-seed5 | +0.70 | -6.20 | -6.60 | +17.20 |
| SvgPathFluid-800x500-dpr2-seed5 | -4.20 | +6.40 | -4.00 | +5.40 |
| Toroidal-1440x900-dpr2-seed5 | -1.80 | -0.40 | +8.10 | +9.50 |
| Toroidal-800x500-dpr2-seed5 | -1.20 | -1.20 | +10.30 | +1.50 |
| Venturi-1440x900-dpr2-seed5 | -3.10 | -0.90 | -1.00 | -0.20 |
| Venturi-800x500-dpr2-seed5 | +5.70 | +6.30 | -2.60 | +6.40 |
| default-1440x900-dpr2-seed5 | +0.20 | +8.80 | -0.60 | -1.70 |
| default-800x500-dpr2-seed5 | -1.90 | -4.00 | -0.40 | -0.10 |

#### Out-of-band statistics

Wall times seconds; values/bands rounded to nine significant digits, full precision in verdict JSON.

| Scene | Wall | Metric | Value | Band [lower, upper] |
|---|---:|---|---:|---|
| default-1440x900-dpr2-seed5 | 5 | low | 0.0206191618 | [0.0112129264, 0.0197875885] |
| LavaLamp-1440x900-dpr2-seed5 | 10 | low | 0.0711673777 | [0.0751075598, 0.112376961] |
| LavaLamp-800x500-dpr2-seed5 | 5 | low | 0.119457354 | [0.153901724, 0.206577412] |
| LavaLamp-800x500-dpr2-seed5 | 10 | low | 0.0823488396 | [0.0845599127, 0.129152053] |
| LavaLamp-800x500-dpr2-seed5 | 10 | mid | 0.203956445 | [0.206151333, 0.295020469] |
| Plasma-1440x900-dpr2-seed5 | 10 | chroma | 0.0247499429 | [0.0404768254, 0.0602062212] |
| Plasma-1440x900-dpr2-seed5 | 20 | mid | 0.0659638477 | [0.0506168795, 0.064339949] |
| Aurora-1440x900-dpr2-seed5 | 10 | low | 0.00512907038 | [0.0035602834, 0.00497850537] |
| Aurora-800x500-dpr2-seed5 | 2 | low | 0.0496784765 | [0.0570519433, 0.0776922746] |
| Aurora-800x500-dpr2-seed5 | 20 | low | 0.00539451727 | [0.00353099734, 0.00529911764] |
| CircularFluid-1440x900-dpr2-seed5 | 20 | low | 0.069717966 | [0.0544339633, 0.0670998376] |
| CircularFluid-800x500-dpr2-seed5 | 10 | chroma | 0.0426106495 | [0.0434776465, 0.056691626] |
| CircularFluid-800x500-dpr2-seed5 | 10 | low | 0.0342870657 | [0.0436789225, 0.066412829] |
| CircularFluid-800x500-dpr2-seed5 | 20 | low | 0.0377879428 | [0.0527252315, 0.0934891902] |
| CircularFluid-800x500-dpr2-seed5 | 20 | mid | 0.197908112 | [0.205504336, 0.270057157] |
| SvgPathFluid-1440x900-dpr2-seed5 | 10 | low | 0.0140088395 | [0.0295981834, 0.0560815145] |
| SvgPathFluid-1440x900-dpr2-seed5 | 20 | low | 0.0109595022 | [0.0160216605, 0.076860791] |
| SvgPathFluid-1440x900-dpr2-seed5 | 20 | mid | 0.0863116341 | [0.0893935609, 0.19622295] |
| SvgPathFluid-800x500-dpr2-seed5 | 10 | coverage | 0.151856875 | [0.168534, 0.252043] |
| SvgPathFluid-800x500-dpr2-seed5 | 20 | coverage | 0.211230625 | [0.086308875, 0.183673188] |
| SvgPathFluid-800x500-dpr2-seed5 | 20 | low | 0.0306967692 | [0.0110963003, 0.0142898707] |
| SvgPathFluid-800x500-dpr2-seed5 | 20 | mid | 0.161055403 | [0.0904670902, 0.137010492] |
| Toroidal-1440x900-dpr2-seed5 | 2 | mid | 0.183709173 | [0.189808155, 0.265357834] |
| Toroidal-800x500-dpr2-seed5 | 5 | low | 0.0932570976 | [0.0587584798, 0.0797558929] |
| Toroidal-800x500-dpr2-seed5 | 20 | coverage | 0.24666 | [0, 0] |
| GasFlare-1440x900-dpr2-seed5 | 10 | mid | 0.427638252 | [0.339515789, 0.427583547] |
| GasFlare-800x500-dpr2-seed5 | 10 | low | 0.219587169 | [0.229172331, 0.353079652] |
| GasFlare-800x500-dpr2-seed5 | 10 | high | 0.409768763 | [0.29000116, 0.40463337] |
| GasFlare-800x500-dpr2-seed5 | 20 | low | 0.207494792 | [0.211677047, 0.326250516] |

Verification: harness `--self-check`, `bun run test` (52 files, 870 tests), `bun run check` (496 files, zero errors/warnings) passed. Label PNG/curl capture directories removed after recording verdict, offsets and three cited composites; verdict JSON and those three `pair.png` files retained. Owned browser, Vite, judge and observer processes exited; no owned GPU lock remains. No package/library change, no push.

### Eval diagnostic — null control (baseline vs itself)

2026-10-07. Candidate is the unmodified frozen baseline `1006e8fae1e670a72be67e1ff75800a43b35ff5e`, detached checkout `/tmp/e2-null-1006e8f`, dependencies symlinked from main. Empty props, `--spatial-safe`; identical scene seeds/configuration. Commands: `bun scripts/quality-eval.mjs compare --label null-train --source-root /tmp/e2-null-1006e8f --props '{}' --spatial-safe --split train`, then equivalent `null-test --split test`. Coordinator authorised overlapping test captures with train judging, after the intervening E1 hold/release. This diagnoses the gate; it is not candidate tuning or evidence of physical regression.

Freshness verified: both labels absent before launch; capture cache is **label-scoped**, not shared by source SHA. All 38 new capture records identify the baseline SHA; none equal matching baseline capture JSON bytes. Train capture mtimes 10:22:19–10:29:59; test 11:06:23–11:11:41, local time −0700. Frozen 90-record baseline manifest SHA256 remained `3b01821e3bf72fdf1bbaa95da1f4d8fbe5ff3252fa64740040d1ff4cf58e97cc`. No library/harness edits. Nonfatal Vite missing generated tsconfig/dependency-scan warnings did not prevent engine captures.

#### Original gate: unchanged engine rejected on both splits

| Split | Losses / wins / ties | Non-tie loss fraction | ADR Amendment 1 verdict | Violations / checks | Scenes affected | Metrics: coverage / chroma / low / mid / high |
|---|---|---|---|---|---|---|
| TRAIN | 4 / 0 / 18 | 4/4 = 100% | WORSE | 15/440 = 3.4091% | 9/22 | 2 / 2 / 9 / 2 / 0 |
| TEST | 4 / 1 / 11 | 4/5 = 80% | WORSE | 17/320 = 5.3125% | 11/16 | 0 / 2 / 9 / 5 / 1 |
| Round 2 TRAIN | 6 / 0 / 16 | 6/6 = 100% | WORSE | 29/440 = 6.5909% | 14/22 | 3 / 2 / 16 / 7 / 1 |
| Round 1 TEST | 6 / 1 / 9 | 6/7 = 85.7143% | WORSE | 45/320 = 14.0625% | 15/16 | 0 / 9 / 30 / 6 / 0 |

Original diagnostic-only null comparison also returns **WORSE** for both unchanged-engine splits: train all-pair loss 4/22 = 18.1818%, test 4/16 = 25%, versus frozen calibration 2/18 = 11.1111%. That calibration was train-only; these are candidate-scale fresh nulls, including held-out scenes. Results retained at `/tmp/quality-eval/null-train/verdict.json` and `/tmp/quality-eval/null-test/verdict.json`.

**Conclusion:** the absolute gate false-rejects the baseline itself on both splits. TRAIN null non-tie loss fraction equals Round 2; TEST null 80% is below Round 1's 85.7143%. All-pair loss rates and per-check violations are lower than the corresponding rounds, so the null does **not** establish that every observed candidate failure is noise. One judged null per split cannot estimate a population-level whole-run false-rejection probability.

#### Checks, replicates and Amendment 2

Verified from `baseline-bands.json`: all 30 scene groups have four wall times and five metrics, **20 checks per scene**, 600 distinct group-wall-metric bands. A new independent exchangeable continuous observation falls outside a three-observation raw min–max with probability **2/(3+1) = 50%**. This is before 10% widening; repeated scene seeds, deterministic/zero metrics, correlated walls/metrics and RAF variation violate a simple independent-check model. The empirical widened-band rates below, not 50%, are the relevant estimates.

Amendment 2 was committed before test-null results, completed train judging or replicates. Two additional fresh re-renders per split were explicitly authorised. Labels `null-train-2`, `null-train-3`, `null-test-2`, `null-test-3`: **stats-only (judge stubbed)**. An owned temporary `claude` executable exited 99 through command-local PATH; real CLI/global PATH unchanged. Every expected capture JSON parsed; no partial judgment cache was written. Compact stats-only `verdict.json` records were saved before capture cleanup.

| Label | Violations / checks | Scenes | coverage / chroma / low / mid / high | Fresh capture mtimes (−0700) |
|---|---|---|---|---|
| null-train-2 | 18/440 | 12/22 | 2 / 2 / 11 / 3 / 0 | 11:20:21–11:28:01 |
| null-train-3 | 17/440 | 9/22 | 2 / 1 / 12 / 2 / 0 | 12:04:23–12:12:04 |
| null-test-2 | 20/320 | 9/16 | 0 / 4 / 12 / 4 / 0 | 11:46:56–11:52:13 |
| null-test-3 | 10/320 | 8/16 | 0 / 3 / 7 / 0 / 0 | 12:33:29–12:38:46 |

Pooled null **TRAIN p0 = 50/1320 = 3.787879%**, **TEST p0 = 47/960 = 4.895833%**. One-sided exact binomial tails use P[X ≥ observed violations], fixed pooled p0; this plug-in calculation does not propagate p0 uncertainty or fully account for scene clustering.

| Comparison | Candidate checks | Statistics p-value | Amendment 2 statistics | Judge p-value / gate |
|---|---|---|---|---|
| Round 2 original TRAIN | 29/440 | 0.0031970982 | WORSE (<0.01) | 0.0999452491 / NO_WORSE |
| Round 2 pooled two TRAIN runs | 47/880 | 0.0130842313 | NO_WORSE (≥0.01) | 0.0999452491 / NO_WORSE; original judged run only |
| Round 1 TEST | 45/320 | 2.80615056×10⁻¹⁰ | WORSE | 0.0484557179 / WORSE |

Judge null pools combine identical calibration with the corresponding split: TRAIN 6/40 = 15%; TEST 6/34 = 17.6471%. Candidate losses remain 6/22 and 6/16. Amendment 2's >1/3 non-tie condition holds for both rounds, but its one-sided all-pair loss test rejects only Round 1. Thus Round 1 remains **WORSE**; Round 2's original single-run pre-check is **WORSE** on statistics, while its authorised pooled two-run TRAIN check is **NO_WORSE**. No Round 2 held-out keep verdict or energy claim follows. **Round 2 train pooled stats p = 0.013, a borderline pass; the single-run result failed (p = 0.003). The pass depends on the replicate that Amendment 2 §2 permits, and the excess over null is small and weakly linked to timing.**

#### Where Round 2's original excess occurs

Original null / Round 2 violations by wall 2/5/10/20 s: **1/6/2/6 versus 2/3/12/12**; net +1/−3/+10/+6. Excess concentrates at 10/20 s, not the 2 s sample. Exact scene-wall-metric overlap 8; null-only 7; Round-2-only 21 (1/2/10/8 by wall). Entries below are `wall:metric`; unchanged scenes InkInWater at both sizes, Venturi at both sizes and Karman at both sizes have no violations in either run. All listed scenes DPR2 seed5.

| Scene | null-train | Round 2 original |
|---|---|---|
| default 1440×900 | 5:low | 5:low |
| default 800×500 | 5:low | — |
| LavaLamp 1440×900 | — | 10:low |
| LavaLamp 800×500 | — | 5:low, 10:low/mid |
| Plasma 1440×900 | 10:chroma, 20:chroma/low | 10:chroma, 20:mid |
| Plasma 800×500 | — | — |
| Aurora 1440×900 | 5:mid | 10:low |
| Aurora 800×500 | 5:low | 2:low, 20:low |
| CircularFluid 1440×900 | 20:low | 20:low |
| CircularFluid 800×500 | — | 10:chroma/low, 20:low/mid |
| SvgPathFluid 1440×900 | 10:low, 20:low | 10:low, 20:low/mid |
| SvgPathFluid 800×500 | 5:coverage, 20:coverage/low | 10:coverage, 20:coverage/low/mid |
| Toroidal 1440×900 | 2:mid, 5:low | 2:mid |
| Toroidal 800×500 | — | 5:low, 20:coverage |
| GasFlare 1440×900 | — | 10:mid |
| GasFlare 800×500 | — | 10:low/high, 20:low |

#### Round 2 full-stat replicate and timing diagnosis

Original Round 2 captures were previously deleted; its full-stat z analysis is unavailable. Coordinator authorised fresh `r2-train-rep2`, source `2a57fcb4fe9612ef10fc5fd6b3f7120d8184d290`, stats-only (judge stubbed). **HEADED (pre-directive launch):** all 22 captures completed, including the last two scenes within approximately one minute after the headless-only directive arrived; no subsequent browser launched. These captures are **retained** at `/tmp/quality-eval/r2-train-rep2/` until coordinator releases them. 18 violations/440 = 4.0909%, 11/22 scenes: coverage5/chroma2/low9/mid2/high0; wall counts 0/6/5/7. Failures affect **appearance and dynamics**, not curl spectrum alone.

Mean signed z = (rep2 value − mean of three matching null values) / sample SD of those null values, computed separately per scene/wall then averaged across scenes. Zero-SD entries excluded, never assigned zero. These descriptive z values have noisy three-run denominators, not Gaussian significance tests.

| Wall | coverage mean z (n) | chroma | low | mid | high |
|---|---|---|---|---|---|
| 2 | +1.0042 (18) | +0.3750 (22) | +1.4985 (20) | +0.3923 (20) | −0.1374 (20) |
| 5 | +0.2615 (18) | +0.5327 (22) | +0.6950 (20) | −0.9666 (20) | +1.0495 (20) |
| 10 | −1.0974 (18) | +0.3467 (22) | −0.8313 (20) | −0.3096 (20) | +0.6314 (20) |
| 20 | +0.1051 (17) | +0.6571 (22) | −0.2719 (20) | +0.8888 (20) | −0.9118 (20) |

No consistently lower low-band bias: rep2 out-of-band low values are six above / three below; chroma one above / one below; coverage two above / three below; mid two above. Chroma mean z is positive at every wall, but does not establish a consistent visual degradation.

Rep2 `actualWall` minus matching three-null mean: min −6.4333, median +2.8000, max +22.4667 ms. Pearson offset versus violations/sample **r = 0.09290**, versus excess over null mean violations **r = −0.05995**. Violating samples mean +3.2804 ms; clean +2.6920 ms. Original 88 documented Round-2-minus-frozen offsets correlate weakly with violation count (**r = 0.16627**; violating +2.3182 ms, clean +1.3303 ms). No strong linear timing association; sample-offset data cannot establish solver-step counts or causally explain live divergence. Real RAF integration/readback/presentation timing remains a plausible source, not a demonstrated cause.

#### Judge infrastructure and capacity

Inherited `ANTHROPIC_DEFAULT_OPUS_MODEL=opus-class[1m]` replaced proactively with command-local `opus-class`, using the previously verified Round 2 workaround; no new alias rejection claimed. First TRAIN attempt completed five pairs then a Plasma 800×500 call timed out at 600 s (exit143; unknown-model catalog warning). Retried once from fresh cached captures; all remaining pairs completed, no timeout manufactured as tie. TEST completed without retry. Rubric/calibration unchanged.

Per-pair successful judging wall time (seconds), first `pair.png` mtime to cached judgment JSON mtime, includes both swapped trials; excludes failed attempt, capture and queue time. TRAIN median53.84 s, range38.51–359.51, 3/22 pairs ≥120 s; TEST median61.64 s, range37.47–682.23, 3/16 ≥120 s. Successful total28.14/36.00 min; additionally approximately10 min lost to infrastructure timeout. Individual successful calls ≥120 s: 2/44 TRAIN, 4/32 TEST. Typical throughput is roughly one pair/minute; long-tail stalls matter, but ≥2-minute calls are not routine.

| TRAIN scene | Seconds | TEST scene | Seconds |
|---|---:|---|---:|
| default 1440×900 | 46.5 | FrozenSwirl DPR2 seed11 | 58.9 |
| default 800×500 | 49.9 | FrozenSwirl DPR2 seed23 | 69.5 |
| LavaLamp 1440×900 | 359.5 | FrozenSwirl DPR1 seed11 | 50.2 |
| LavaLamp 800×500 | 64.1 | FrozenSwirl DPR1 seed23 | 37.5 |
| Plasma 1440×900 | 57.5 | AnnularFluid DPR2 seed11 | 60.5 |
| Plasma 800×500 | 169.3 | AnnularFluid DPR2 seed23 | 345.6 |
| InkInWater 1440×900 | 41.2 | AnnularFluid DPR1 seed11 | 73.4 |
| InkInWater 800×500 | 45.8 | AnnularFluid DPR1 seed23 | 62.8 |
| Aurora 1440×900 | 71.1 | FrameFluid DPR2 seed11 | 76.0 |
| Aurora 800×500 | 43.6 | FrameFluid DPR2 seed23 | 367.4 |
| CircularFluid 1440×900 | 56.7 | FrameFluid DPR1 seed11 | 51.6 |
| CircularFluid 800×500 | 48.9 | FrameFluid DPR1 seed23 | 54.2 |
| SvgPathFluid 1440×900 | 56.9 | TeslaValve DPR2 seed11 | 69.1 |
| SvgPathFluid 800×500 | 55.0 | TeslaValve DPR2 seed23 | 682.2 |
| Toroidal 1440×900 | 51.6 | TeslaValve DPR1 seed11 | 59.1 |
| Toroidal 800×500 | 43.7 | TeslaValve DPR1 seed23 | 41.9 |
| GasFlare 1440×900 | 64.5 | — | — |
| GasFlare 800×500 | 88.7 | — | — |
| Venturi 1440×900 | 47.1 | — | — |
| Venturi 800×500 | 135.3 | — | — |
| Karman 1440×900 | 52.7 | — | — |
| Karman 800×500 | 38.5 | — | — |

#### GPU fairness, headless directive and cleanup

Ordinary installed hardware Chrome, no unsafe WebGPU. Harness launch at `scripts/quality-eval.mjs:166`: `headless: false`, `ignoreDefaultArgs: ['--enable-unsafe-swiftshader']`. Future headless hardware captures require `headless: true` (Playwright supplies headless mode) while retaining that default-argument exclusion, without `--disable-gpu`, SwiftShader forcing or `--enable-unsafe-webgpu`; adapter availability must still be verified. No claim that headed and headless performance distributions are equivalent.

Observed E2 holds (−0700, one-second granularity except original TEST release, bounded by final capture11:11:41 and next E1 observation11:12:46): TRAIN10:21:55–10:30:01 (8m06s); TEST11:06:00–approximately11:11:42 (about5m42s); TRAIN2 11:19:58–11:28:03 (8m05s); TEST2 11:46:33–11:52:15 (5m42s); TRAIN3 12:04:00–12:12:05 (8m05s); TEST3 12:33:05–12:38:49 (5m44s); R2 replicate12:41:48–12:50:01 (8m13s). Every reacquisition followed observed E1 ownership/release. All below12-minute ceiling. Disk preflight before every capture exceeded15 GiB (initial444 GiB). No foreign lock/process removal; protected Chrome PIDs untouched.

Verification: harness self-check; 52 test files/870 tests; Svelte check496 files, zero errors/warnings. Null capture directories and owned detached baseline checkout removed after recording; six null verdict JSONs retained. R2 replicate captures/verdict retained intentionally. Owned judge stub, browser/Vite/judge processes and lock/timing observers cleaned; no owned GPU lock remains. Frozen baseline untouched; no package/library change, no push.
