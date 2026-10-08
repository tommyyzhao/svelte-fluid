# Energy eval — ADR 0107 E1

**Current headless baseline: 107/114 clean slots (TRAIN65/66; held-out42/48).** Seven infrastructure-missing slots explicitly listed; full registered R3 headline incomplete. Held-out complete11/16 scene median **80.868 active /80.995 untouched GPU-ms/s**, available16-scene n1–3 median **81.937 /80.099** descriptive only. Historical headed baseline remains48/48 clean held-out slots, train incomplete. Round2 evidence remains exploratory n2, not a registered keep. Never pool headless60Hz and historical headed120Hz.

## Method

Frozen protocol: [ADR 0107](../decisions/0107-energy-quality-docs-eval-protocol.md#e1--energy-programmatic), [Metal parser/bounds](../decisions/0105-stable-gpu-budget-protocol.md), [settling](../decisions/0099-settle-visible-idle-fluid.md). Engine baseline `e4be335997ed2cd9ee1922879efaeea8f6a4b22e`; library unchanged from `1006e8f`. Real `<Fluid>` through Vite, normal shared RAF, default `autoPause`, ordinary headed Chrome 154 / Apple M1 Max / ANGLE Metal. Fresh independent browser per scene/run; one mount, no synthetic input. Frozen size/DPR/seed matrix. CDP native metrics assert CSS/backing/DPR. No unsafe GPU flags, forced focus, lifecycle freezing or system refresh changes.

Each window lasts 10 s: active t=5–15 s; untouched t=30–40 s; offscreen 5 s after scroll; hidden 5 s after a genuine foreground-tab switch. Restore viewport before hiding, so hidden tests visibility independently. Blank control follows disposal after 5 s drain. Metric = union of attached Chrome GPU-process Metal execution intervals clipped to the wall-clock window / window seconds, GPU-busy ms/s. Trace start-date aligns page epoch timestamps, 1 ms export precision. Missing execution coverage fails closed. Foreign GPU activity recorded separately; WindowServer excluded from foreign diagnostics.

Refresh RAF differs from engine update rate: an independent no-GL RAF probe remains near 120 Hz after settling/offscreen, while engine updates and GPU work stop. Hidden browser RAF is 0. Native refresh primary; 60 Hz display condition unavailable without system-setting changes. Measurement-only private wrappers observe subscription/settled state; public handle conceals settled state. Separate diagnostic mounts observe production issue-time quiet probes; no additional readbacks or threshold changes.

Tables show medians over clean independent runs, n explicit. Noise = (max−min)/median of active GPU-ms/s across exactly R=3. Headline = median of 16 held-out scene medians, not pooled windows. Repeat ranges are observed envelopes, not population confidence intervals.

### Harness repairs / environment

- Superseded Playwright pilot: `/tmp/energy-eval/baseline-playwright-superseded`. Forced focus overrides prevented genuine hidden state. Direct Chrome + CDP `noDefaults:true` verified DPR2/DPR1 backing, ~120 Hz, genuine hidden. All frozen baseline slots use this driver; candidates must too.
- Source-root/provenance commit `cd48f4c`: one file, **52 insertions / 12 deletions**, including bounded scheduling/retry helpers. Frozen window/parser/metric regions assert byte identity against `e4be335`. Separate `harnessSha`, `engineSourceSha`, source-file SHA256, measurement-logic SHA256. Resume never mixes engines/logic. Candidate source from an owned archive, never another lane's working tree.
- Read-only presentation counter added outside frozen regions; older slots omit it. No solver cadence or GPU command modification.
- **2026-10-07:** recorder-start notification bound **15 → 45 s** after >10% infrastructure failures. Load average recorded thereafter. Non-eval background-app load present throughout, affecting baseline/candidate alike. Wait bounds only; no metric/threshold changes.
- Closed infrastructure classes: recorder start timeout; recorder finalisation timeout (including outer-task ceiling during finalisation); missing execution coverage; GPU-process exit; contention; ENOSPC; raw-trace oversize; visibility-gate not met. Exactly one logged end-of-run retry per failed slot. Original failure JSON retained. No clean-metric retry.
- Instruments ignored `TMPDIR`, leaked raw scratch into macOS user temp. Exact before/after `instruments*.ktrace` name diff under exclusive GPU lock, same-UID check, deletion after recording/export. Smoke verified deletion of **6.12 GB**, no residual ktrace. Raw bundles deleted after parse/error JSON. **15 GiB** free-space guard; **10 GiB** raw-scratch watchdog; **110 s** recorder ceiling. Initial 3 GiB watchdog smoke aborts were calibration errors, excluded from baseline/infrastructure counts.
- Captures serialized under `/tmp/svelte-fluid-gpu.lock`, batches ≤25 min including exports. No foreign processes killed. Evidence: `/tmp/energy-eval/baseline-native/`.

## Headless 60 Hz frozen baseline — Amendment 3, 2026-10-07/08

Preregistered by `66ebc38` **before new baseline captures**; engine
`37bbe851c0d52c86241f6964c3b443f17e95611b`, `maxFps:0`, no library edits.
TRAIN completed before held-out started. Installed HeadlessChrome154;
every clean slot verifies renderer
`ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version)`,
CSS/backing/DPR and active RAF59–61Hz (normally60). Historical headed120Hz
numbers below are not comparable and were never pooled. Frozen metric,
parser, windows, splits, seeds, R3 noise/keep/0-GPU rules unchanged.

**107/114 clean registered slots: TRAIN65/66, held-out42/48.** All114
original slots attempted;16 originals failed,15 received their single allowed
infrastructure retry (9 clean,6 failed). Seven slots remain missing; no
unclassified or exhausted retry was repeated. **The registered all16-scene
R3 held-out headline is incomplete.** Offscreen/hidden/control are exactly
0 GPU-ms/s in every107 clean slot, within blank-control noise0–0.

| Coverage (explicit, not interchangeable) | Active median GPU-ms/s | Descriptive bootstrap95% | Untouched median GPU-ms/s | Descriptive bootstrap95% |
|---|---:|---|---:|---|
| TRAIN21/22 completeR3 scenes | 94.184 | 84.431–98.584 | 90.491 | 79.167–92.603 |
| Held-out11/16 completeR3 scenes | 80.868 | 73.468–82.754 | 80.995 | 77.949–81.674 |
| TRAIN all22 available scenes, n2–3 | 94.382 | 87.427–99.535 | 90.766 | 81.403–93.554 |
| Held-out all16 available scenes, n1–3 | 81.937 | 76.444–82.931 | 80.099 | 76.547–82.000 |

Intervals are **descriptive**, not a keep-rule amendment:10,000 bootstrap
resamples of independent runs **within each scene**, fixed scene set,
scene medians then split median, percentile2.5/97.5%, xorshift32 seed5.
Available-scene rows resample their actual n; they cannot repair missingR3
or certify a candidate. CompleteR3 active-noise range: TRAIN **1.472%–34.214%**;
held-out **3.580%–19.513%**. Incomplete scenes have no registered noise estimate.
The original >2× per-scene noise and ≥5% keep bars remain unchanged.

### Headless TRAIN — DPR2, seed5

Units GPU-ms/s; n = clean independent runs. Offscreen/hidden/control all0.

| Preset | CSS | n | Active | Untouched | Active noiseR3 |
|---|---|---:|---:|---:|---:|
| (default) | 1440×900 | 3 | 47.673 | 0.000 | 34.21% |
| (default) | 800×500 | 3 | 42.319 | 0.000 | 12.56% |
| LavaLamp | 1440×900 | 3 | 100.513 | 103.716 | 29.95% |
| LavaLamp | 800×500 | 3 | 56.558 | 56.550 | 34.14% |
| Plasma | 1440×900 | 3 | 99.800 | 116.861 | 26.73% |
| Plasma | 800×500 | 3 | 100.699 | 103.439 | 7.92% |
| InkInWater | 1440×900 | 3 | 93.782 | 94.627 | 8.30% |
| InkInWater | 800×500 | 3 | 64.983 | 60.772 | 17.39% |
| Aurora | 1440×900 | 3 | 100.486 | 105.623 | 1.47% |
| Aurora | 800×500 | 3 | 81.071 | 89.554 | 17.59% |
| CircularFluid | 1440×900 | 3 | 94.579 | 90.491 | 17.12% |
| CircularFluid | 800×500 | 3 | 65.999 | 63.685 | 22.92% |
| SvgPathFluid | 1440×900 | 3 | 84.431 | 91.040 | 7.31% |
| SvgPathFluid | 800×500 | 3 | 75.129 | 67.237 | 7.51% |
| Toroidal | 1440×900 | 3 | 113.055 | 0.000 | 27.46% |
| Toroidal | 800×500 | 3 | 102.143 | 0.000 | 2.67% |
| GasFlare | 1440×900 | 2 | 147.393 | 149.619 | MissingR3 |
| GasFlare | 800×500 | 3 | 107.721 | 107.166 | 12.39% |
| Venturi | 1440×900 | 3 | 94.184 | 93.138 | 22.24% |
| Venturi | 800×500 | 3 | 63.322 | 63.453 | 18.28% |
| Karman | 1440×900 | 3 | 139.778 | 142.959 | 22.69% |
| Karman | 800×500 | 3 | 153.022 | 141.156 | 25.65% |

### Headless held-out — 1024×640 CSS

Units GPU-ms/s; n explicit. Offscreen/hidden/control all0. All held-out
scenes remain active untouched; no settling observed by40s.

| Preset | DPR | Seed | n | Active | Untouched | Active noiseR3 |
|---|---:|---:|---:|---:|---:|---:|
| FrozenSwirl | 2 | 11 | 3 | 80.868 | 79.204 | 17.01% |
| FrozenSwirl | 2 | 23 | 3 | 78.683 | 80.995 | 19.51% |
| FrozenSwirl | 1 | 11 | 2 | 69.499 | 70.269 | MissingR3 |
| FrozenSwirl | 1 | 23 | 3 | 70.368 | 70.808 | 4.29% |
| AnnularFluid | 2 | 11 | 2 | 83.107 | 82.326 | MissingR3 |
| AnnularFluid | 2 | 23 | 2 | 83.006 | 76.431 | MissingR3 |
| AnnularFluid | 1 | 11 | 1 | 58.792 | 63.594 | MissingR2/R3 |
| AnnularFluid | 1 | 23 | 3 | 62.216 | 63.499 | 17.97% |
| FrameFluid | 2 | 11 | 2 | 83.670 | 89.050 | MissingR1 |
| FrameFluid | 2 | 23 | 3 | 84.412 | 88.730 | 12.42% |
| FrameFluid | 1 | 11 | 3 | 67.810 | 67.416 | 3.58% |
| FrameFluid | 1 | 23 | 3 | 73.468 | 74.095 | 16.45% |
| TeslaValve | 2 | 11 | 3 | 89.531 | 98.222 | 12.08% |
| TeslaValve | 2 | 23 | 3 | 87.184 | 94.879 | 10.30% |
| TeslaValve | 1 | 11 | 3 | 91.366 | 90.707 | 7.97% |
| TeslaValve | 1 | 23 | 3 | 90.049 | 85.352 | 3.96% |

### Settle classification — descriptive, no library definition change

Every driver-free preset belongs to the following observed classes:

- **(a) At rest → settled:** `(default)` and Toroidal, both TRAIN sizes.
  Untouched GPU0, RAF subscription stopped; production quiet probes meet
  ≤5s latency target. “At rest” here means production quiet/display-rest,
  **not an assertion that all residual velocity is mathematically zero**.
  Diagnostics stop after settling, so t30–40 field pairs are intentionally
  absent, not zero-filled evidence.
- **(b) At rest but failing `isQuiet`: empty among observed driver-free scenes.**
  This is a descriptive finding from the sampled window, not proof about all
  future states or all possible configs.
- **(c) Visibly evolving/not idle:** LavaLamp, Aurora, FrozenSwirl. Nonzero
  speed plus substantial consecutive-frame RGB changes disprove field rest;
  changes exceed1/255 by7–55×. This is motion evidence, **not calibrated
  perceptual certification** (post-processing can amplify or compress it).
  All production quiet verdicts in t30–40 are false. LavaLamp's visibility
  maximum65504 is the conservative glass/shading sentinel, not measured
  dye overflow: it cannot establish rest, but fields are moving anyway.

| Driver-free scene | First quiet s | Unsubscribe s | Latency s |
|---|---:|---:|---:|
| (default) 1440×900 | 9.002 | 10.117 | 1.115 |
| (default) 800×500 | 8.506 | 9.618 | 1.112 |
| Toroidal 1440×900 | 20.982 | 22.100 | 1.118 |
| Toroidal 800×500 | 20.986 | 22.102 | 1.115 |

R1-only separate diagnostic mounts, same seeds/configs; five consecutive
engine-frame pairs first at/after t30/32/34/36/38s. Speed is maximum Euclidean
velocity, simulation texels/s; dye delta maximum absolute **RGB** channel
change (thickness excluded), window maximum over sampled pairs. **Full-field
readbacks stall the diagnostic mount**: actual pair intervals31.7–62.2ms,
not nominal16.7ms. Consecutive engine frames remain consecutive, but elapsed
simulation/chaotic trajectories can differ; do not treat these as unperturbed
60Hz per-frame display deltas. Energy mounts contain no diagnostic readbacks,
remain≈60Hz; no thresholds, solver or library definitions were changed.

| Non-settling driver-free scene | Max speed texels/s | Max RGB delta/frame | Pair interval range ms | Evolving? |
|---|---:|---:|---|---|
| LavaLamp 1440×900 DPR2 seed5 | 14.844 | 0.074219 | 31.7–49.4 | Yes |
| LavaLamp 800×500 DPR2 seed5 | 17.247 | 0.217041 | 38.9–62.2 | Yes |
| Aurora 1440×900 DPR2 seed5 | 34.116 | 0.061523 | 33.9–53.1 | Yes |
| Aurora 800×500 DPR2 seed5 | 32.442 | 0.078552 | 46.9–59.6 | Yes |
| FrozenSwirl 1024×640 DPR2 seed11 | 33.989 | 0.149414 | 32.0–42.8 | Yes |
| FrozenSwirl 1024×640 DPR2 seed23 | 31.462 | 0.129639 | 32.0–44.7 | Yes |
| FrozenSwirl 1024×640 DPR1 seed11 | 35.070 | 0.119141 | 33.5–46.1 | Yes |
| FrozenSwirl 1024×640 DPR1 seed23 | 31.703 | 0.170166 | 34.0–46.6 | Yes |

**Continuous drivers are not idle by definition:** Plasma, InkInWater,
CircularFluid, SvgPathFluid, GasFlare, Venturi, Karman (TRAIN);
AnnularFluid, FrameFluid, TeslaValve (held-out). No driver-scene diagnostic
readback was used to infer settling.

### Headless preserved failures/retries

| Original scene/run | Original reason | Single retry outcome |
|---|---|---|
| (default)800×500 DPR2 seed5 R3 | GPU process exit during owned lane handoff | OK |
| GasFlare1440×900 DPR2 seed5 R3 | Harness-ceiling interruption during **trace export**, not closed retry list | **Missing; not retried** |
| GasFlare800×500 DPR2 seed5 R1 | Recorder finalisation timeout | OK |
| SvgPathFluid1440×900 DPR2 seed5 R2 | Recorder finalisation timeout | OK |
| Toroidal800×500 DPR2 seed5 R3 | Recorder finalisation timeout | OK |
| FrozenSwirl DPR1 seed11 R3 | Recorder finalisation timeout | **Same timeout; missing** |
| AnnularFluid DPR1 seed11 R2 | Recorder finalisation timeout | **Same timeout; missing** |
| AnnularFluid DPR2 seed11 R3 | Recorder finalisation timeout | **Same timeout; missing** |
| AnnularFluid DPR2 seed23 R3 | Recorder finalisation timeout | **Same timeout; missing** |
| AnnularFluid DPR1 seed11 R3 | Recorder finalisation timeout | **15s `goto('about:blank')` timeout after hidden window; missing** |
| FrameFluid DPR2 seed11 R1 | Recorder finalisation timeout | **Same timeout; missing** |
| FrameFluid DPR2 seed23 R1 | Recorder finalisation timeout | OK |
| FrameFluid DPR2 seed23 R2 | Recorder finalisation timeout | OK |
| FrameFluid DPR1 seed11 R1 | Recorder finalisation timeout | OK |
| FrameFluid DPR1 seed23 R1 | Recorder finalisation timeout | OK |
| TeslaValve DPR2 seed23 R1 | Recorder finalisation timeout | OK |

All held-out sizes1024×640. Original JSON and retry JSON preserved. No
failed-slot active metric inferred from unparsed traces. Exit1 from the
harness also flags retained originals even when their retries succeed; it
is not itself a new failed capture.

Finalisation trend diagnosed before later subsets: Annular clean
post-control-to-result101.5–266.8s **includes finalisation, exports and
cleanup**, not exact finalisation duration; clean trace299–537MiB,
scratch2.60–5.32GiB. Timeout traces384–616MiB, scratch3.68–6.28GiB.
Free disk≈399GiB at diagnosis; no concurrent foreign xctrace observed.
Machine start-load≈6–43 during that period is a **likely infrastructure
factor, not proven causation**; GPU-free builds/tests ran concurrently.
Across all attempts start-load envelope3.55–44.34; end-load telemetry added
for later32 attempts, envelope4.94–77.15. Envelopes pool recorded1/5/15-minute
load averages (system-wide, not owned-process CPU utilization). Recorder-finalisation bound stayed
180s, exports90s/table, attempt600s, recorder110s; no post-hoc timeout or
retry-class change. Larger groups hit2h outer ceiling: later subsets reduced
by preset/DPR, never by observed metric. Annular outer ceiling occurred while
lock unowned/waiting another lane, not an extra failed metric.

Lock atomic/owned, releases reserve10min attempt within25min hold; actual
acquisition time added separately (`acquired-at`) because initial owner.start
is process-start, not re-acquisition. Initial SOLO immediately re-acquired
between holds; disabled before later subsets when other lanes began waiting.
Two exact-PID handoffs recorded; one interrupted active slot received its
allowed process-exit retry, one occurred before next recorder started.
Other lanes E4/dye-review/diagnostics interleaved; no foreign locks removed.

Evidence `/tmp/energy-eval/headless-baseline-37bbe85/`: original/retry JSON,
`summary.json`, `descriptive-summary.json`, per-batch logs/cleanup.
Runnable aggregation `/tmp/e1-summary-headless.mjs`; persistent motion
self-check `bun scripts/energy-capture.mjs --self-check`. Raw trace bundles
and owned `instruments*.ktrace` diff-cleaned; safeguards15GiB free/10GiB raw
watchdog retained. No new library code, dependency installs, system settings,
push, merge, publish or deploy. Final cleanup11:41:32UTC2026-10-08:
408 recorded owned PID handles checked, no remaining Chrome/vite/xctrace
capture processes; lock absent, scratch/raw arrays empty, protected Chrome
PIDs4386/4411/48063/48074 received no signals (`final-cleanup.json`).
`bun run test && bun run check`, `bun run prepack`, energy self-check green.
Worktree retained: commits not remotely preserved; ignored dependency symlink
retained, never staged. TRAIN cost evidence and attribution caveats are in [gpu-budget.md](gpu-budget.md#e1-eval-repair--train-only-headless-costs-2026-10-07).

## Historical headed 120 Hz frozen baseline

**Held-out median active: 141.703 GPU-ms/s. Untouched: 140.898 GPU-ms/s.** Blank control median/range **0 / 0–0**. Offscreen and hidden each **0 in all 48 clean held-out baseline slots**, within control noise. Held-out R3 active noise-floor range **2.266%–18.401%**.

Held-out scenes never settle during visible 40 s observation. Continuous train scenes stay busy untouched. Driver-free `(default)` and Toroidal stop; completed quiet-to-unsubscribe diagnostics meet ≤5 s target.

### Held out — 1024×640 CSS

| Preset | DPR | Seed | n | Active | Untouched | Offscreen | Hidden | RAF active/untouched | Engine active/untouched | Settled by 40 s | Noise |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|---:|
| FrozenSwirl | 2 | 11 | 3 | 142.080 | 149.703 | 0 | 0 | 120.0/120.0 | 120.0/120.0 | No | 12.77% |
| FrozenSwirl | 2 | 23 | 3 | 155.546 | 144.969 | 0 | 0 | 120.0/120.0 | 120.0/120.0 | No | 6.70% |
| FrozenSwirl | 1 | 11 | 3 | 122.169 | 122.992 | 0 | 0 | 120.0/120.0 | 120.0/120.0 | No | 2.27% |
| FrozenSwirl | 1 | 23 | 3 | 131.533 | 124.876 | 0 | 0 | 120.0/120.0 | 120.0/120.0 | No | 7.45% |
| AnnularFluid | 2 | 11 | 3 | 135.351 | 134.432 | 0 | 0 | 120.0/120.0 | 120.0/120.0 | No | 18.24% |
| AnnularFluid | 2 | 23 | 3 | 141.326 | 136.826 | 0 | 0 | 120.0/120.0 | 120.0/120.0 | No | 15.58% |
| AnnularFluid | 1 | 11 | 3 | 115.573 | 117.373 | 0 | 0 | 120.0/120.0 | 120.0/120.0 | No | 5.62% |
| AnnularFluid | 1 | 23 | 3 | 129.046 | 129.974 | 0 | 0 | 120.0/120.0 | 120.0/120.0 | No | 15.20% |
| FrameFluid | 2 | 11 | 3 | 168.148 | 167.344 | 0 | 0 | 120.0/120.0 | 120.0/120.0 | No | 17.37% |
| FrameFluid | 2 | 23 | 3 | 154.354 | 151.686 | 0 | 0 | 120.0/120.0 | 120.0/120.0 | No | 14.00% |
| FrameFluid | 1 | 11 | 3 | 138.078 | 136.044 | 0 | 0 | 120.0/120.0 | 120.0/120.0 | No | 13.21% |
| FrameFluid | 1 | 23 | 3 | 128.015 | 122.198 | 0 | 0 | 120.0/120.0 | 120.0/120.0 | No | 4.95% |
| TeslaValve | 2 | 11 | 3 | 187.924 | 189.670 | 0 | 0 | 120.0/120.0 | 120.0/120.0 | No | 16.49% |
| TeslaValve | 2 | 23 | 3 | 170.694 | 168.143 | 0 | 0 | 120.0/120.0 | 120.0/120.0 | No | 14.87% |
| TeslaValve | 1 | 11 | 3 | 154.096 | 157.246 | 0 | 0 | 120.0/120.0 | 120.0/120.0 | No | 8.56% |
| TeslaValve | 1 | 23 | 3 | 169.945 | 161.027 | 0 | 0 | 120.0/120.0 | 120.0/120.0 | No | 18.40% |

### Train — DPR2, seed5

Train first-run evidence only; R3 pending. No train noise-floor claim yet.

| Preset | CSS | n | Active | Untouched | Offscreen | Hidden | RAF active | Engine active | Settle time | Noise |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| (default) | 1440×900 | 1 | 82.095 | 0.000 | 0.000 | 0.000 | 120.0 | 42.8 | 8.561 s | Pending R3 |
| (default) | 800×500 | 1 | 61.086 | 0.000 | 0.000 | 0.000 | 120.0 | 39.7 | 8.306 s | Pending R3 |
| LavaLamp | 1440×900 | 1 | 198.241 | 188.702 | 0.000 | 0.000 | 120.0 | 120.0 | Not observed | Pending R3 |
| LavaLamp | 800×500 | 1 | 119.524 | 122.940 | 0.000 | 0.000 | 120.0 | 120.0 | Not observed | Pending R3 |
| Plasma | 1440×900 | 1 | 219.881 | 213.661 | 0.000 | 0.000 | 120.0 | 120.0 | Not observed | Pending R3 |
| Plasma | 800×500 | 1 | 162.198 | 155.273 | 0.000 | 0.000 | 120.0 | 120.0 | Not observed | Pending R3 |
| InkInWater | 1440×900 | 1 | 170.435 | 167.365 | 0.000 | 0.000 | 120.0 | 120.0 | Not observed | Pending R3 |
| InkInWater | 800×500 | 1 | 113.896 | 119.278 | 0.000 | 0.000 | 120.0 | 120.0 | Not observed | Pending R3 |
| Aurora | 1440×900 | 1 | 224.231 | 228.411 | 0.000 | 0.000 | 120.0 | 120.0 | Not observed | Pending R3 |
| Aurora | 800×500 | 1 | 183.752 | 180.902 | 0.000 | 0.000 | 120.0 | 120.0 | Not observed | Pending R3 |
| CircularFluid | 1440×900 | 1 | 188.288 | 197.698 | 0.000 | 0.000 | 120.1 | 120.1 | Not observed | Pending R3 |
| CircularFluid | 800×500 | 0 | — | — | — | — | — | — | Not observed | Pending R3 |
| SvgPathFluid | 1440×900 | 1 | 200.867 | 195.732 | 0.000 | 0.000 | 120.0 | 120.0 | Not observed | Pending R3 |
| SvgPathFluid | 800×500 | 1 | 134.361 | 137.683 | 0.000 | 0.000 | 120.0 | 120.0 | Not observed | Pending R3 |
| Toroidal | 1440×900 | 1 | 244.923 | 0.000 | 0.000 | 0.000 | 120.0 | 120.0 | 21.802 s | Pending R3 |
| Toroidal | 800×500 | 1 | 201.695 | 0.000 | 0.000 | 0.000 | 120.0 | 120.0 | 20.306 s | Pending R3 |
| GasFlare | 1440×900 | 1 | 287.251 | 291.147 | 0.000 | 0.000 | 120.0 | 120.0 | Not observed | Pending R3 |
| GasFlare | 800×500 | 1 | 221.806 | 220.696 | 0.000 | 0.000 | 120.0 | 120.0 | Not observed | Pending R3 |
| Venturi | 1440×900 | 1 | 192.782 | 194.709 | 0.000 | 0.000 | 120.0 | 120.0 | Not observed | Pending R3 |
| Venturi | 800×500 | 1 | 127.827 | 112.739 | 0.000 | 0.000 | 120.0 | 120.0 | Not observed | Pending R3 |
| Karman | 1440×900 | 1 | 332.372 | 357.138 | 0.000 | 0.000 | 120.1 | 120.0 | Not observed | Pending R3 |
| Karman | 800×500 | 1 | 287.079 | 280.620 | 0.000 | 0.000 | 120.0 | 120.0 | Not observed | Pending R3 |

### Separate settle diagnostics

| Scene | First quiet | RAF unsubscribe | Latency |
|---|---:|---:|---:|
| (default) 1440×900 | 8.001 s | 8.561 s | 0.560 s |
| (default) 800×500 | 8.245 s | 8.803 s | 0.558 s |
| Toroidal 1440×900 | 20.247 s | 20.805 s | 0.558 s |
| Toroidal 800×500 | 20.248 s | 20.806 s | 0.557 s |

Non-settling diagnostics observed only through 40 s. “Not observed” is censored, not infinite latency.

### Preserved failures

| Scene / run | Original failure | Retry |
|---|---|---|
| CircularFluid 800×500 DPR2 seed5 r1 | Recorder finalisation timeout | Pending |
| FrozenSwirl 1024×640 DPR1 seed23 r3 | Recorder tracing-started notification timeout | OK |
| FrozenSwirl 1024×640 DPR2 seed11 r1 | Outer background task ceiling interrupted recorder finalisation | OK |
| AnnularFluid 1024×640 DPR2 seed23 r3 | ENOSPC: oversized trace during recorder finalisation (8.3 GiB), no parsed metric | OK |
| FrozenSwirl 1024×640 DPR2 seed11 r3 | Recorder tracing-started notification timeout | OK |
| TeslaValve 1024×640 DPR1 seed23 r2 | xctrace exit 134: libc++abi: terminating due to uncaught exception of type std::__1::system_error: Could not trim file: No space left on device | OK |
| AnnularFluid 1024×640 DPR2 seed11 r2 | Missing execution coverage (one untouched command buffer) | OK |
| FrameFluid 1024×640 DPR2 seed11 r3 | Recorder finalisation timeout | OK |
| FrozenSwirl 1024×640 DPR1 seed11 r3 | xctrace exit 134: libc++abi: terminating due to uncaught exception of type std::__1::system_error: Could not trim file: No space left on device | OK |

## Rounds

No pre-registered E1 keep/revert verdict completed.

### Round 1 — solve-rate cap, rejected by E2

Candidate `8f27341`: **rejected by E2**, so no E1 candidate capture was performed. No energy result inferred. Owned rejected source archive removed.

### Round 2 — EXPLORATORY held-out energy evidence

Candidate `2a57fcb4fe9612ef10fc5fd6b3f7120d8184d290`, presentation-only cap. **n=2 completed candidate slots / 48 registered**, both FrozenSwirl DPR2 R1; two adjacent baseline pairs. Neither full held-out coverage nor registered train R3 exists. The owner selected existing windowed evidence only; no new captures.

| FrozenSwirl seed | Candidate active / untouched | Adjacent baseline active / untouched | Frozen scene median active / untouched | Paired active ratio | Frozen matched active ratio |
|---|---|---|---|---:|---:|
| 11 | 103.016 / 103.535 | 159.540 / 159.558 | 142.080 / 149.703 | 0.64571 | 0.72506 |
| 23 | 104.867 / 103.932 | 160.127 / 159.860 | 155.546 / 144.969 | 0.65490 | 0.67418 |

Median paired active ratio **0.65030**, **34.970% saving**. Median frozen matched-scene active ratio **0.69962**, **30.038% saving**; difference **4.932 percentage points**, below the diagnostic 10-point flag. Pair bootstrap 95% envelope **[0.64571, 0.65490]**, IID pairs, xorshift32 seed5, 2,000 resamples. With only two pairs this is descriptive resampling of observed values, not reliable population inference.

Completed-candidate medians: **103.942 active / 103.733 untouched GPU-ms/s**. Compared mechanically against the frozen all-16-scene headline **141.703 / 140.898**, savings **26.648% / 26.377%**, numerically ≥25%. **Different scene coverage (one preset versus four), n=2 versus48: this does not establish the registered ≥25% held-out goal, noise gate or keep decision.** Candidate engine ≈120 Hz, presents ≈60 Hz; adjacent baseline both ≈120 Hz. Parsed synthesis `/tmp/energy-eval/round2-exploratory-summary.json`.

### Round 2 — presentation-only cap, train scheduling heuristic

Candidate `2a57fcb4fe9612ef10fc5fd6b3f7120d8184d290`. Six train presets, 1440×900 DPR2 seed5, one run; comparison to frozen train R1. **15%** saving threshold is a scheduling heuristic, not ADR 0107 keep rule. Default settles during active t=5–15 s, so its partial-active window is separate, excluded from heuristic decision. Remaining five fully-active scenes: **median saving 44.602%**, continue. No held-out tuning.

| Scene | Frozen R1 ms/s | Candidate ms/s | Ratio | Saving | Engine Hz | Present Hz |
|---|---:|---:|---:|---:|---:|---:|
| `(default)` — partial, settles 8.561 s | 82.095 | 49.565 | 0.60375 | 39.63% | 42.8 | 21.5 |
| LavaLamp | 198.241 | 111.560 | 0.56275 | 43.73% | 120 | 60 |
| Plasma | 219.881 | 121.404 | 0.55214 | 44.79% | 120 | 60 |
| InkInWater | 170.435 | 94.417 | 0.55398 | 44.60% | 120 | 60 |
| Aurora | 224.231 | 120.062 | 0.53544 | 46.46% | 120 | 60 |
| CircularFluid | 188.288 | 114.795 | 0.60968 | 39.03% | 120 | 60 |

All refresh probes 120 Hz; offscreen/hidden/control 0 GPU-ms/s. Parsed ratios: `/tmp/energy-eval/round2-go-no-go/paired-ratios.json`. Large elapsed machine-time gap from frozen train R1 makes drift a concern: this is not a keep result.

Decisive paired work **stopped/incomplete**, not a registered keep decision. All completed pairs and the limited bootstrap envelope are reported above; no candidate slot omitted for a favorable metric.

Additional paired-attempt failure log: paired baseline FrozenSwirl DPR2 seed23 R1 recorder-finalisation timeout, its one infrastructure retry succeeded; candidate FrozenSwirl DPR1 seed11 failed hidden visibility-gate (retry authorized, not executed before stop); candidate AnnularFluid DPR2 seed11 R1 lost visibility during offscreen (retry authorized, not executed). These two visibility failures among five started candidate test slots exceed the 5% interference flag; foreign focus/visibility interference documented, not chased. Candidate FrozenSwirl DPR1 seed23 timed out during mount (not classified infrastructure). One bounded reproduction of seed23 against both engines mounted successfully, no browser exceptions or Vite optimisation reload: original cause unproved, not classified as a candidate defect or silently retried. Candidate AnnularFluid's first slot lost visibility during offscreen; pair driver was stopped while waiting, no active recorder, on the headless-only directive. These failed slots do not count as clean data. Evidence labels: `/tmp/energy-eval/{round2-candidate,paired-baseline}/`.

Proposed train scheduling reductions (n2 baseline, then 11 large-size pairs only) were not executed. They cannot replace registered train R3 or establish its noise floor. Frozen evidence remains separate.

## Headless-only feasibility — 2026-10-07

User directive forbids all future headed browser launches. Harness `a6aeed1` uses installed Chrome `--headless=new`, ordinary flags, native hardware renderer; resume rejects mixing headed and headless captures. Two **diagnostic smokes only**, Plasma 1440×900 CSS DPR2 seed5:

| Engine | Renderer | RAF Hz | Engine Hz | Present Hz | Active ms/s | Untouched ms/s | Offscreen / hidden / control |
|---|---|---:|---:|---:|---:|---:|---|
| Baseline `e4be335` | Apple M1 Max / ANGLE Metal | 60 | 60 | 60 | 109.005 | 121.680 | 0 / 0 / 0 |
| Candidate `2a57fcb` | Apple M1 Max / ANGLE Metal | 60 | 60 | 60 | 103.752 | 113.359 | 0 / 0 / 0 |

Metal attribution complete; CSS/backing/DPR correct. Offscreen remains genuinely visible but IntersectionObserver pauses engine. Native foreground-tab switch makes the original document genuinely hidden; its RAF/engine/present rates all 0. Hardware acceleration works, but **60 Hz cap has no scheduling effect at headless's 60 Hz**. Numeric smoke differences are not an energy win. Headless evidence is not comparable to the frozen 120 Hz baseline.

Bounded headless 120 Hz investigation:

- Installed Chrome with `--enable-begin-frame-control`, with/without `--deterministic-mode`: hardware Metal, CDP **−32601: `'HeadlessExperimental.beginFrame' wasn't found`**.
- Bundled `chromium_headless_shell-1223`: initial WebGL unavailable; ordinary `--enable-gpu --use-gl=angle --use-angle=metal` gives hardware Apple M1 Max. Begin-frame requires `--run-all-compositor-stages-before-draw`; with that, explicit `Target.createTarget({enableBeginFrameControl:true})` rejects **−32000: `BeginFrameControl is not supported on MacOS yet`**. No valid 120 Hz pacing obtained.
- Official [headless screen configuration](https://chromium.googlesource.com/chromium/src/+/main/components/headless/screen_info/README.md) and [parser](https://raw.githubusercontent.com/chromium/chromium/main/components/headless/screen_info/headless_screen_info.cc) expose size/DPR/origin/orientation/work area, **no refresh-rate parameter**. No supported virtual-refresh alternative found. Unpaced `--disable-frame-rate-limit` / `--disable-gpu-vsync` were not used.

**Environment ceiling:** E1 can measure genuine hardware **60 Hz headless**, not native 120 Hz on this Mac. No synthetic RAF/visibility/lifecycle workaround. Captures stopped for replanning. Headless smoke evidence `/tmp/energy-eval/{headless-baseline-smoke2,headless-candidate-smoke}/`; capability probes `/tmp/e1-beginframe-probe{,2,3}.log`.
