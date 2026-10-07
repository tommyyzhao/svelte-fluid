# Energy eval — ADR 0107 E1

**Baseline status:** held-out complete, **48/48 clean slots**. Train R1: 21/22 clean; one logged infrastructure failure awaiting retry. Train R2/R3 pending; no train noise-floor claim yet.

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
- Closed infrastructure classes: recorder start timeout; recorder finalisation timeout (including outer-task ceiling during finalisation); missing execution coverage; GPU-process exit; contention; ENOSPC; raw-trace oversize. Exactly one logged end-of-run retry per failed slot. Original failure JSON retained. No clean-metric retry.
- Instruments ignored `TMPDIR`, leaked raw scratch into macOS user temp. Exact before/after `instruments*.ktrace` name diff under exclusive GPU lock, same-UID check, deletion after recording/export. Smoke verified deletion of **6.12 GB**, no residual ktrace. Raw bundles deleted after parse/error JSON. **15 GiB** free-space guard; **10 GiB** raw-scratch watchdog; **110 s** recorder ceiling. Initial 3 GiB watchdog smoke aborts were calibration errors, excluded from baseline/infrastructure counts.
- Captures serialized under `/tmp/svelte-fluid-gpu.lock`, batches ≤25 min including exports. No foreign processes killed. Evidence: `/tmp/energy-eval/baseline-native/`.

## Frozen baseline

**Held-out median active: 141.703 GPU-ms/s. Untouched: 140.898 GPU-ms/s.** Blank control median/range **0 / 0–0**. All clean offscreen/hidden windows **0**, within control noise.

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

No E1 keep/revert round completed. Solve-rate cap `8f27341` received no E1 candidate captures: E2 rejected it first. Presentation-only cap train go/no-go pending. Six-scene, one-run **15%** saving heuristic is scheduling only, not ADR 0107 keep rule. Any later train candidate R2 is exploratory, n shown; held-out candidate R3 remains required.
