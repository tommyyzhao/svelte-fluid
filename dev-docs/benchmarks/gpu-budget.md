# GPU budget (per-instance frame time)

Evidence for the 1.0 bar: p95 GPU execution per instance per frame <2 ms at native DPR.
**Owner changed the target on 2026-10-06 after seeing the native Metal results**
([ADR 0101](../decisions/0101-p95-gpu-budget.md)); it was not pre-registered.
**Current p95 verdict: 28 PASS / 15 FAIL**, 43 scenes, native DPR 2;
[re-tabulation below](#owner-adopted-p95-verdict--2026-10-06). Optimisation remains pending.
The original strict-max verdict (18 PASS / 25 FAIL), measured numbers and
[ceilings below](#native-metal-execution-measurement--2026-10-0506) remain unchanged as history.
Earlier wall-throughput/UNCERTIFIED sections remain historical evidence.
Harness: `src/lib/engine/__benches__/gpu-budget.browser.test.ts`. Measurement,
not a performance gate. Decision records: ADRs 0089, 0093, 0099.

## Run

```sh
SVELTE_FLUID_GPU_BENCH=1 VITEST_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  bun run test:browser src/lib/engine/__benches__/gpu-budget.browser.test.ts
# JSON: /tmp/svelte-fluid-gpu-budget.json (override SVELTE_FLUID_GPU_BENCH_OUT)
# Subset: SVELTE_FLUID_GPU_BENCH_PRESETS='Karman,(default)'
# CSS size: SVELTE_FLUID_GPU_BENCH_CSS=1440x900 (default 800x500)
# Tier: SVELTE_FLUID_GPU_BENCH_TIER=shared (default own)
```

About 2 minutes per size. Excluded by default unless `SVELTE_FLUID_GPU_BENCH`
is set. Requires hardware Chrome; no unsafe GPU flags.

## Method

- Own-tier `FluidEngine`, `autoStart:false`, CSS canvas at DPR 1/2/3. Preset
  config plus `Fluid.svelte`'s canvas-derived caps and `cssQualityPolicy`.
  `(default)` is empty config. Pointer input off, no synthetic input.
- **Ordinary frame:** 200 warm-up frames, 12 batches of 20 fixed-60-Hz
  `update()` frames. A 1-px default-framebuffer `readPixels` brackets each
  batch, draining the queue. Report median per-frame time / worst batch.
  This is synced batch throughput, a conservative upper bound on submitted GPU
  work, not a timer query or full individually presented-frame certification.
- **Probe CPU:** one warm-up probe, 24 checks. Time issuing the async PBO
  readback plus all polling attempts; scheduler delays excluded. The JSON
  `settleDrainMs` is the post-submit drain remainder, **not GPU elapsed time**.
  Do not add it to CPU cost as a separate GPU cost.
- **1-in-30 probe:** 12 batches of 30 ordinary frames, then one probe, queue
  drain, result polling. Report per-frame median; scheduling delays excluded.
- **Checked-frame workload:** warm paired 20-frame batches of ordinary frames
  versus identical frames with reduction + PBO readback enqueued **every
  frame**, no polling in the timed span. Alternate order across 12 pairs.
  Median difference bounds incremental probe workload; checked throughput
  directly measures check frames without counting CPU/readback latency twice.
  Real continuous-driver presets do not check; the stress variant forces it.
- **Passes:** replay `simulateFrame`, `applyBloom`, `applySunrays`,
  `drawDisplay`, `drawGlass` alone 60 times with captured arguments, flush
  each replay. Without flush Apple's tiler culls overwritten opaque draws.
  Replayed passes overlap in real frames; their sum can exceed frame time.

### Why not timer queries

ANGLE Metal charges a TIME_ELAPSED query the full span of each command buffer
created while active, counting partial/overlapping buffers in full. Large
canvas render passes over-read by 2–100× (a 0.08 ms composite read 13.8 ms).
Synced throughput, fence-synced throughput and replayed passes agreed in
ADR 0089. The harness retains old queries only as evidence of this artifact.
`EngineProfiler` group timings have the same bias; its frame ends before
`trackSettle()` and **omits probe work**. This harness measures it separately.

## Result (this machine)

- Apple M1 Max, ANGLE Metal, hardware Chrome. Date **2026-10-02**.
- Full 90-case matrix measured at **`7baa954`**, runtime **`1c154e4`**: includes
  lighting 0087, contrast floor 0086, JFA 0084, context tiers 0093, async
  settle probe 0099. No preset or solver defaults changed.
- Final runtime HEAD **`b278b11`** adds GL-error/FBO validation and failure
  cleanup. Its default/GasFlare/Karman 1440x900 subset was remeasured below.
  **The full matrix was not rerun after validation.** Do not claim its cheaper
  CPU numbers for final HEAD. Later docs-only commits do not change runtime.
- Cells: ordinary median / worst 20-frame batch, ms. Last two columns are
  per-frame medians including the stated probe frequency, not added costs.

### Full viewport (1440x900 CSS; DPR 3 = 4320x2700)

| Preset | DPR 1 | DPR 2 | DPR 3 | 1-in-30 probe @ DPR 3 | Probe every frame @ DPR 3 |
|---|---|---|---|---|---|
| (default) | 1.45 / 1.49 | 1.46 / 1.48 | 1.51 / 1.52 | 1.49 | 1.82 |
| LavaLamp | 0.76 / 0.78 | 0.93 / 1.07 | 1.84 / 1.94 | 1.75 | 1.94 |
| Plasma | 1.42 / 1.47 | 1.48 / 1.51 | 1.54 / 1.70 | 1.49 | 1.84 |
| InkInWater | 1.28 / 1.30 | 1.29 / 1.30 | 1.35 / 1.43 | 1.32 | 1.65 |
| FrozenSwirl | 1.28 / 1.29 | 1.30 / 1.32 | 1.38 / 1.40 | 1.33 | 1.67 |
| Aurora | 1.43 / 1.45 | 1.46 / 1.48 | 1.53 / 1.56 | 1.49 | 1.82 |
| CircularFluid | 1.29 / 1.32 | 1.31 / 1.39 | 1.39 / 1.43 | 1.33 | 1.67 |
| FrameFluid | 1.30 / 1.32 | 1.33 / 1.34 | 1.50 / 1.56 | 1.44 | 1.69 |
| AnnularFluid | 1.32 / 1.38 | 1.32 / 1.34 | 1.42 / 1.45 | 1.35 | 1.69 |
| SvgPathFluid | 1.33 / 1.35 | 1.31 / 1.32 | 1.38 / 1.41 | 1.33 | 1.66 |
| Toroidal | 1.45 / 1.50 | 1.48 / 1.49 | 1.55 / 1.63 | 1.49 | 1.83 |
| GasFlare | 1.54 / 1.56 | 1.64 / 1.80 | 1.65 / 1.68 | 1.60 | 1.94 |
| Venturi | 1.04 / 1.06 | 1.10 / 1.24 | 1.11 / 1.15 | 1.08 | 1.40 |
| Karman | 1.60 / 1.62 | 1.65 / 1.72 | 1.66 / 1.71 | 1.62 | 1.97 |
| TeslaValve | 1.54 / 1.56 | 1.55 / 1.57 | 1.58 / 1.61 | 1.58 | 1.88 |

### Component (800x500 CSS)

| Preset | DPR 1 | DPR 2 | DPR 3 | 1-in-30 probe @ DPR 3 | Probe every frame @ DPR 3 |
|---|---|---|---|---|---|
| (default) | 1.50 / 1.57 | 1.45 / 1.46 | 1.47 / 1.49 | 1.46 | 1.76 |
| LavaLamp | 0.74 / 0.76 | 0.81 / 0.92 | 0.78 / 0.80 | 0.79 | 1.08 |
| Plasma | 1.43 / 1.47 | 1.46 / 1.52 | 1.47 / 1.48 | 1.46 | 1.77 |
| InkInWater | 1.26 / 1.29 | 1.35 / 1.51 | 1.29 / 1.30 | 1.29 | 1.58 |
| FrozenSwirl | 1.27 / 1.28 | 1.35 / 1.46 | 1.29 / 1.33 | 1.30 | 1.60 |
| Aurora | 1.43 / 1.58 | 1.46 / 1.57 | 1.47 / 1.58 | 1.48 | 1.77 |
| CircularFluid | 1.28 / 1.40 | 1.29 / 1.39 | 1.30 / 1.31 | 1.30 | 1.60 |
| FrameFluid | 1.28 / 1.31 | 1.30 / 1.39 | 1.32 / 1.33 | 1.31 | 1.62 |
| AnnularFluid | 1.28 / 1.31 | 1.30 / 1.32 | 1.32 / 1.46 | 1.32 | 1.68 |
| SvgPathFluid | 1.28 / 1.31 | 1.29 / 1.30 | 1.32 / 1.43 | 1.30 | 1.61 |
| Toroidal | 1.43 / 1.45 | 1.46 / 1.47 | 1.47 / 1.48 | 1.46 | 1.76 |
| GasFlare | 1.57 / 1.67 | 1.53 / 1.55 | 1.57 / 1.58 | 1.56 | 1.87 |
| Venturi | 1.04 / 1.06 | 1.05 / 1.07 | 1.11 / 1.12 | 1.10 | 1.39 |
| Karman | 1.58 / 1.59 | 1.61 / 1.63 | 1.63 / 1.78 | 1.62 | 1.93 |
| TeslaValve | 1.53 / 1.56 | 1.55 / 1.57 | 1.56 / 1.60 | 1.57 | 1.85 |

## Verdict vs 2 ms

**GPU compliance is UNCERTIFIED; the 1.0 budget goal is not met until proved.**
Wall throughput above 2 ms does not prove GPU execution alone exceeds 2 ms;
favorable batch averages do not certify every individually presented frame.
Independent GPU attribution is blocked; see
[measurement blocker and resume protocol](gpu-measurement-blocker.md).
Latest full own-tier matrix: worst ordinary
median **LavaLamp 1.845 ms**, worst batch **LavaLamp 1.945 ms** (1440x900 DPR 3).
Worst checked median **Karman 1.970 ms** (same). These favorable averages do not
establish an every-frame bar. Earlier repeats must not be hidden:

| SHA / run | GasFlare, 1440x900 DPR 3: ordinary median / worst | Probe-every-frame median / paired overhead |
|---|---|---|
| `3222036`, before final hardening | **2.060 / 2.085** | not measured |
| `1c154e4` plus paired-harness draft | 1.780 / — | **2.040 / 0.290** |
| `7baa954` full matrix | 1.650 / 1.680 | 1.940 / 0.305 |
| `b278b11` validated HEAD subset | 1.660 / 1.685 | 1.985 / 0.305 |

GasFlare reached **>= 2 ms wall-throughput median** on both ordinary and checked
repeats. No preset was tuned to hide it. Clock/contention/presentation variance
is real; a favorable rerun does not erase the exceedance. Shared Karman also
exceeds 2 ms wall throughput (below), not proven GPU-only time. No lower-end
laptop GPU was tested.

## Native DPR and dominant passes

`maxPixelRatio:null` remains the default; it was chosen under earlier own-tier
measurements (ADR 0089), not proof of this stricter bar. Consumers can opt into
`maxPixelRatio={2}`; this lane did not cap native DPR or change defaults.

GasFlare 1440x900 DPR 3 (`7baa954`): isolated solver **1.023 ms**, bloom
**0.425 ms**, display **0.745 ms**, ordinary frame 1.650 ms. Passes overlap.
On the earlier 2.060 ms run these passes were 1.077/0.473/1.007 ms: ordinary
solver/display work, not settling, accounts for that excess. Paired probe
work adds about 0.30 ms, producing the separate 2.040 ms checked repeat.

## Shared tier (ADR 0093)

Forced shared Karman, 1440x900 CSS, `7baa954`, fired (not awaited) presents:

| DPR | Ordinary median / worst batch | Probe every frame median | Paired probe overhead | 1-in-30 probe median |
|---|---|---|---|---|
| 1 | 2.575 / 5.535 | 2.590 | 0.495 | 2.183 |
| 2 | 5.355 / 16.250 | 2.775 | 0.375 | 2.473 |
| 3 | 4.440 / 16.985 | 5.605 | 0.370 | 2.863 |

Snapshot/presentation scheduling makes these wall-throughput numbers volatile;
they are **not clean GPU-only attribution**. Even the 30-frame averages exceed
2 ms wall throughput; this does not prove GPU execution alone exceeds 2 ms.
Historical 800x500 shared Karman was ~2.37 ms at DPR 3 (ADR 0093); that is
historical, not a final-HEAD measurement. Reduction parity tests cover both
tiers. Shared-tier compliance remains UNCERTIFIED, not exempt from the 1.0 bar.
Even the later synchronous 20-frame harness awaits jobs, not necessarily 20
bitmap deliveries: `gl-host.ts` drops stale-sequence snapshots before
`transferFromImageBitmap`. Such batches are conservative submitted-work upper
bounds, not full individually presented-frame certification.

## Settled engines (ADR 0099)

Settled engines stop: 0 ms GPU, 0 rAF callbacks until input. Previously every
30th frame synchronously read full velocity and dye fields to CPU. At
1440x900 CSS DPR 3, component-derived resolutions:

| Preset | Before check median / max wall ms (`db8d41a`) | Before median / 30 | After CPU check median / max (`b278b11`) | After CPU median / 30 | Paired workload overhead | Overhead / 30 |
|---|---|---|---|---|---|---|
| (default) | 33.90 / 42.80 | 1.130 | 0.90 / 1.20 | 0.030 | 0.285 | 0.0095 |
| GasFlare | 19.30 / 23.30 | 0.643 | 0.90 / 1.20 | 0.030 | 0.305 | 0.0102 |
| Karman | 35.80 / 40.10 | 1.193 | 0.90 / 1.10 | 0.030 | 0.300 | 0.0100 |

Before: 12 drained checks. After: one warm-up (first-use chain/PBO allocation
excluded), 24 checks, issue plus all poll CPU costs, scheduling delays excluded.
Async CPU time is not the old GPU-synchronized wall time; paired throughput
supplies workload evidence. CPU max still reached **1.20 ms**; averaged CPU
cost is 0.030 ms/frame. Pre-validation full matrix measured 0.30 ms CPU median,
<=0.70 ms max: do not claim those cheaper values for final HEAD.

Replacement: 8x8 absolute max-pool chains, velocity rg and dye rgb, to 1x1 R16F
per field. Two pixels enter a 32-byte PBO; consume only after its fence signals.
`isQuiet` thresholds unchanged. Discard stale probes after field/config/input
changes. Allocation/read errors fail closed; candidate chains are transactional.
WebGL1/missing float readback stays active rather than claiming quietness.

Final HEAD subset ordinary / checked medians: default 1.545/1.835, GasFlare
1.660/1.985, Karman 1.705/1.990 ms. Little headroom; amortization is not the
per-frame bar. GPU workload/snapshot optimization remains separate work.

## Model engines

Cheap surface/enamel/dropzone benches rerun DPR 2/3 at `1c154e4`, 2026-10-02,
hardware Chrome, synced busy batches. Models were unchanged by this lane.
InkPaper not rerun. FoilSwitch removed by owner 2026-10-02; its measurement is historical, not shipped evidence.

| Component | Size (CSS) | DPR | Median ms / worst batch | Source |
|---|---|---|---|---|
| InkPaper wet | 800x500 | 2 / 3 | 0.97 / 1.46 (historical medians) | ADR 0090 |
| LiquidButton | 220x56 / 480x64 | 2 / 3 | 0.43–0.44 / <=0.51 | remeasured |
| LiquidSegmented | 360x56 | 2 | 0.46 / 0.55 | remeasured |
| LiquidSegmented | 360x56 | 3 | 0.44 / 0.48 | remeasured |
| LiquidDropZone dragging | 480x200 | 2 | 0.46 / 0.48 | remeasured |
| LiquidDropZone dragging | 480x200 | 3 | 0.58 / 0.60 | remeasured |
| LiquidCaustics busy | 720x400 | 2 | 0.34 / 0.39 | remeasured |
| LiquidCaustics busy | 720x400 | 3 | 0.40 / 0.41 | remeasured |
| EnamelText held press | 96px bold / 64px two words | 2 | 0.74 / 0.81; 0.76 / 0.78 | remeasured |
| EnamelText held press | same | 3 | 0.73 / 0.81; 0.73 / 0.74 | remeasured |
| Removed FoilSwitch (historical only) | 96x48 / 192x96 | 2 / 3 | 0.012–0.015 (historical medians) | ADR 0096 |

```sh
SVELTE_FLUID_GPU_BENCH=1 SVELTE_FLUID_DPR=2 VITEST_CHROME_PATH=... \
  bun run test:browser src/lib/engine/__benches__/surface-gpu.browser.test.ts \
  src/lib/engine/__benches__/enamel-gpu.browser.test.ts \
  src/lib/engine/__benches__/dropzone-gpu.browser.test.ts
```

## Native Metal execution measurement — 2026-10-05/06

**Outcome: the strict every-frame <2 ms goal FAILS on this laptop.** 43 distinct
scenes: **18 PASS / 25 FAIL**, using the worst-max valid clean capture when a scene
has repeats. Passing a later repeat never erases an earlier clean exceedance.
There were also contended and attribution-inconclusive attempts, preserved below.
This is the local-main **WebGL2 1.0** runtime at `9df58fc`, not the later WebGPU
replacement. No runtime/shader/config/default changes were made.

### Environment and protocol

- MacBookPro18,4, Apple M1 Max (32 GPU cores), 64 GiB RAM; built-in Liquid Retina
  XDR display, 3024×1964 physical pixels; **actual native DPR 2** (unemulated probe).
- macOS **27.0.1 (26A434)**; Xcode / xctrace **27.0 (27A266a)**; installed Chrome
  **154.0.8037.98**, ANGLE Metal. Default developer directory remained CommandLineTools.
- Headed hardware Chrome; no unsafe/experimental GPU flags. The script explicitly
  removes Playwright's default `--enable-unsafe-swiftshader`. User Chrome untouched.
- One measured instance per static foreground page. Own and forced-shared tiers
  are separate rows; shared pages have no other fluid instances. This removes
  ambiguity about which fluid instance owns ANGLE command buffers. No mixed24 or
  simultaneous-instance fairness claim. Safe `createImageBitmap` transport retained.
- **200 warm-up frames**, await presentation and one originating-GL 1px drain before
  capture. Then **60 individual frames**, each fixed simulation dt 1/60 s, paced
  three RAFs apart; no competing engine RAF. Production driver/settle eligibility
  retained via the same private gates as `paced-presentation.mjs`. No measured
  readPixels or timer query. Snapshot transfer counted per frame on shared/model
  pages; own tier presents directly and has no bitmap transfer by design.
- Own preset matrix: 1440×900 and 800×500 CSS, native DPR 2; corresponding backing
  2880×1800 and 1600×1000. Additional fractional Karman 480.25×300.5 CSS gives
  **960×601** backing (production `canvasPixelSize`, floor). Enamel actual fractional
  CSS: 322.3125×105.59375 (96px; backing 644×211), 351.375×70.3984375
  (64px; backing 702×140). Model canvas sizes include documented effect padding.
- Preset configs and CSS quality policy match the existing budget harness.
  Surface cases use the existing surface/dropzone benches' configs, `busyFrames(1)`
  worst-case impulse workload; enamel held-press workload. InkPaper: one full
  step+display held wet with one 120×100 CSS resist, matching ADR0090's workload
  class; seed 5, paper #f4ecdc, one initial loaded dab (not calibrated painting).
- Each recording has `--time-limit 10s`, stopped early by SIGINT. Exported TOCs
  verify all recorded durations below 10 s (range recorded below). No permission
  prompt, TCC change, security change, sudo or developer-directory switch.

### Verdict metric, attribution and ceilings

The existing protocol explicitly requires **every individual frame**, not favorable
averages (`gpu-budget.md` verdict; `strict-budget-followup.md` lines 60–62). Verdict
is therefore **max <2 ms** across 60 frames. Median: sorted index 30; p95: index 56;
max: index 59. The p95 reading is shown separately, not substituted after results.
A finite sample cannot prove all future frames or other machines.

Metric: union of native **`metal-gpu-intervals` execution intervals** (Vertex,
Fragment, Compute) whose `cmdbuffer-id` belongs to the measured Chrome GPU-process
command-buffer burst. Not CPU submit duration, buffer lifetime, wall time, vsync,
throughput, or ANGLE elapsed query. Overlapping intervals are unioned, never double
counted. Metal submissions/IOSurface accesses supply buffer identity and output size.

Encoder-bearing commits are clustered by >6 ms idle gaps. Exactly 60 consecutive
bursts must match the 60 JS frame marks' relative spacing within 4 ms. No zero or
merged frame is accepted. For each accepted scene: 60 native canvas IOSurface-write
bursts; shared/model rows also **60 requested / 60 delivered transfers**, zero stale
measured jobs. Warm-up snapshots may be stale, outside the measured run.

Concrete frame mapping: Karman own 1440×900 DPR2, attempt1, frame index5, Chrome
GPU pid96735. Commit burst owns `0x3b43d4c8` (16 encoders), `0x3b43d4d9`
(16), `0x3b43d4ea` (8). Join those IDs to GPU interval rows; union gives
**1.565792 ms**, versus **2.402042 ms** first-to-last envelope (idle gaps excluded).
The burst writes 2880×1800 IOSurface output. Original 60-mark spacing error
**0.312417 ms**, zero stray bursts, all 60 writes present.

All buffers in a burst are charged to that single instance, including ANGLE clear,
copy and same-burst Chrome presentation work. This is conservative, not a claim to
separate each native encoder's shader. Other measured-Chrome buffers and WindowServer
work are separately included in the **browser/OS ceiling**: union of all measured
Chrome GPU-process plus WindowServer intervals inside that frame's commit window,
extended through the instance's last execution. It is a window ceiling, not exact
instance compositor attribution; foreign browser/process work is not charged to it.

Presentation evidence is native writes, completed transfers and frame marks.
**Scanout of every frame is not proven.** `metal-object-dependency-chain-display`
and `ca-client-present-request` were empty; WindowServer consumes Chrome's tiled
surfaces, not the same native canvas IOSurface IDs. The OS compositor is reported,
not treated as fluid work or an excuse to change the verdict. No blanket display-
scanout or downstream-copy completion guarantee.

Foreign contention gate, applied uniformly: sum per-frame intersections of each
foreign client's execution with the instance's unioned GPU intervals, divided by
sum of instance per-frame GPU execution. **>=5% is CONTENDED**; below 5% counts as
clean with the overlap disclosed. WindowServer excluded from this gate. Separate
foreign-client total busy time/pct is in the attempt metadata. No foreign process
was stopped. Original Chrome GPU pid4411, ghostty14036 and intermittent MLX Python
jobs caused contention; retries bounded to one per case with 30s wait, then move on.

### Per-scene execution (ms)

`OS max` = browser/OS window ceiling maximum. Bold statistic is not used to conceal
exceedances: all median/p95/max retained. Rows select **worst max among valid captures
below the 5% contention gate**, not a favorable final repeat. `p95 verdict` is the
alternative interpretation only. All rows below have complete 60-burst attribution.

| Scene | Tier | CSS / native backing | Median | p95 | Max | Every-frame verdict | p95 verdict | OS max | Foreign overlap ms / % |
|---|---|---|---:|---:|---:|---|---|---:|---:|
| (default) | own | 1440×900 / 2880×1800 | 1.526 | 2.020 | 2.216 | **FAIL** | FAIL | 3.517 | 1.926 / 2.079% |
| (default) | own | 800×500 / 1600×1000 | 1.243 | 1.634 | 1.813 | **PASS** | PASS | 2.346 | 0.000 / 0.000% |
| LavaLamp | own | 1440×900 / 2880×1800 | 1.221 | 1.913 | 2.098 | **FAIL** | PASS | 3.170 | 0.709 / 0.857% |
| LavaLamp | own | 800×500 / 1600×1000 | 1.092 | 1.347 | 1.537 | **PASS** | PASS | 2.358 | 0.021 / 0.034% |
| Plasma | own | 1440×900 / 2880×1800 | 1.687 | 2.321 | 2.470 | **FAIL** | FAIL | 4.059 | 2.237 / 2.185% |
| Plasma | own | 800×500 / 1600×1000 | 1.338 | 1.983 | 2.740 | **FAIL** | PASS | 3.942 | 1.472 / 1.724% |
| InkInWater | own | 1440×900 / 2880×1800 | 1.302 | 1.851 | 2.088 | **FAIL** | PASS | 2.882 | 0.000 / 0.000% |
| InkInWater | own | 800×500 / 1600×1000 | 1.003 | 1.308 | 1.786 | **PASS** | PASS | 2.746 | 0.671 / 1.126% |
| FrozenSwirl | own | 1440×900 / 2880×1800 | 1.670 | 1.934 | 2.124 | **FAIL** | PASS | 3.284 | 3.879 / 4.287% |
| FrozenSwirl | own | 800×500 / 1600×1000 | 1.197 | 1.471 | 1.581 | **PASS** | PASS | 2.366 | 0.000 / 0.000% |
| Aurora | own | 1440×900 / 2880×1800 | 1.494 | 1.977 | 2.153 | **FAIL** | PASS | 3.368 | 0.185 / 0.203% |
| Aurora | own | 800×500 / 1600×1000 | 1.271 | 1.594 | 1.722 | **PASS** | PASS | 2.170 | 0.066 / 0.088% |
| CircularFluid | own | 1440×900 / 2880×1800 | 1.391 | 1.765 | 1.910 | **PASS** | PASS | 2.807 | 0.000 / 0.000% |
| CircularFluid | own | 800×500 / 1600×1000 | 1.083 | 1.334 | 1.370 | **PASS** | PASS | 2.060 | 0.000 / 0.000% |
| FrameFluid | own | 1440×900 / 2880×1800 | 1.475 | 1.884 | 2.405 | **FAIL** | PASS | 3.180 | 0.000 / 0.000% |
| FrameFluid | own | 800×500 / 1600×1000 | 1.186 | 1.423 | 2.056 | **FAIL** | PASS | 3.124 | 0.713 / 1.043% |
| AnnularFluid | own | 1440×900 / 2880×1800 | 1.474 | 2.056 | 2.281 | **FAIL** | FAIL | 3.979 | 1.348 / 1.489% |
| AnnularFluid | own | 800×500 / 1600×1000 | 0.989 | 1.271 | 2.046 | **FAIL** | PASS | 2.504 | 0.954 / 1.589% |
| SvgPathFluid | own | 1440×900 / 2880×1800 | 1.443 | 1.765 | 1.936 | **PASS** | PASS | 2.440 | 0.363 / 0.438% |
| SvgPathFluid | own | 800×500 / 1600×1000 | 0.972 | 1.330 | 1.457 | **PASS** | PASS | 2.032 | 0.307 / 0.501% |
| Toroidal | own | 1440×900 / 2880×1800 | 1.636 | 2.211 | 2.427 | **FAIL** | FAIL | 3.716 | 0.210 / 0.210% |
| Toroidal | own | 800×500 / 1600×1000 | 1.370 | 1.788 | 2.428 | **FAIL** | PASS | 2.856 | 1.543 / 1.865% |
| GasFlare | own | 1440×900 / 2880×1800 | 2.020 | 2.443 | 2.611 | **FAIL** | FAIL | 4.031 | 0.173 / 0.154% |
| GasFlare | own | 800×500 / 1600×1000 | 1.716 | 1.933 | 2.820 | **FAIL** | PASS | 3.908 | 2.798 / 2.941% |
| Venturi | own | 1440×900 / 2880×1800 | 1.357 | 1.681 | 1.861 | **PASS** | PASS | 2.895 | 0.000 / 0.000% |
| Venturi | own | 800×500 / 1600×1000 | 0.960 | 1.270 | 1.715 | **PASS** | PASS | 3.005 | 1.891 / 3.258% |
| Karman | own | 1440×900 / 2880×1800 | 2.289 | 2.720 | 3.405 | **FAIL** | FAIL | 3.516 | 0.000 / 0.000% |
| Karman | own | 800×500 / 1600×1000 | 2.366 | 2.901 | 3.428 | **FAIL** | FAIL | 4.006 | 1.486 / 1.146% |
| TeslaValve | own | 1440×900 / 2880×1800 | 2.057 | 2.733 | 2.907 | **FAIL** | FAIL | 3.214 | 0.371 / 0.312% |
| TeslaValve | own | 800×500 / 1600×1000 | 1.690 | 2.491 | 2.728 | **FAIL** | FAIL | 3.424 | 0.535 / 0.497% |
| Karman | shared | 1440×900 / 2880×1800 | 2.775 | 3.150 | 3.433 | **FAIL** | FAIL | 4.413 | 0.000 / 0.000% |
| GasFlare | shared | 1440×900 / 2880×1800 | 2.237 | 2.531 | 2.768 | **FAIL** | FAIL | 3.540 | 0.556 / 0.432% |
| LavaLamp | shared | 1440×900 / 2880×1800 | 1.751 | 2.030 | 2.655 | **FAIL** | FAIL | 4.164 | 0.000 / 0.000% |
| (default) | shared | 1440×900 / 2880×1800 | 1.644 | 2.235 | 2.452 | **FAIL** | FAIL | 3.942 | 0.354 / 0.333% |
| Karman | own | 480.25×300.5 / 960×601 | 1.991 | 2.694 | 2.830 | **FAIL** | FAIL | 3.286 | 0.088 / 0.072% |
| LiquidButton (220×56; canvas 232×68) | shared | 232×68 / 464×136 | 0.692 | 0.700 | 0.903 | **PASS** | PASS | 1.214 | 0.385 / 0.951% |
| LiquidButton wide (480×64; canvas 492×76) | shared | 492×76 / 984×152 | 0.734 | 0.758 | 0.784 | **PASS** | PASS | 1.633 | 0.000 / 0.000% |
| LiquidSegmented (360×56; canvas 372×68) | shared | 372×68 / 744×136 | 0.790 | 0.811 | 0.925 | **PASS** | PASS | 1.771 | 0.959 / 2.157% |
| LiquidDropZone dragging (480×200; canvas 492×212) | shared | 492×212 / 984×424 | 1.133 | 1.361 | 1.406 | **PASS** | PASS | 2.381 | 1.219 / 1.812% |
| LiquidCaustics (720×400) | shared | 720×400 / 1440×800 | 1.051 | 1.076 | 1.135 | **PASS** | PASS | 1.979 | 0.540 / 0.984% |
| EnamelText 96px bold | shared | 322.3125×105.59375 / 644×211 | 0.459 | 0.503 | 0.536 | **PASS** | PASS | 1.286 | 0.038 / 0.145% |
| EnamelText 64px two words | shared | 351.375×70.3984375 / 702×140 | 0.408 | 0.469 | 0.550 | **PASS** | PASS | 1.184 | 0.000 / 0.000% |
| InkPaper held wet (800×500) | shared | 800×500 / 1600×1000 | 1.617 | 2.453 | 2.771 | **FAIL** | FAIL | 3.572 | 4.772 / 4.225% |

Only the smaller model controls' browser/OS ceilings consistently fit 2 ms (button,
wide button, segmented, caustics and both enamel cases). Their instance metric
passes. Other passing rows do **not** claim total browser/OS GPU execution below 2 ms.

### Owner-adopted p95 verdict — 2026-10-06

The owner chose **“Adopt p95 < 2 ms target”** after seeing the native Metal results
recorded in `aec018e`. [ADR 0101](../decisions/0101-p95-gpu-budget.md) replaces the
strict-max 1.0 target with 95th-percentile GPU execution per instance per frame
<2 ms at native DPR. **Post hoc, not pre-registered; not a waiver.** Scenes still
failing p95 must be optimised.

Every one of the 43 rows below was checked against the existing per-scene table:
**28 PASS / 15 FAIL**, matching the lead's count. These are the same selected
worst-max valid clean captures, not new captures or worst-p95 repeat selection.
No measured numbers changed. The strict-max table above remains historical;
median, p95 and **max stay reported alongside** there.

Measurement: M1 Max, native DPR 2, 200 warm-up frames then 60 paced frames per
capture. Recorded p95 is sorted zero-based index 56: roughly the 3rd-worst frame
in such a small sample (exactly 4th-worst under this convention, three above it).
This coarse tail estimate cannot establish a sustained population percentile,
every-frame compliance or other-hardware/DPR performance. GPU attribution,
contention and browser/OS/scanout limits above still apply.

| Scene | Tier | CSS size | Existing p95 ms | p95 <2 ms verdict |
|---|---|---|---:|---|
| (default) | own | 1440×900 | 2.020 | FAIL |
| (default) | own | 800×500 | 1.634 | PASS |
| LavaLamp | own | 1440×900 | 1.913 | PASS |
| LavaLamp | own | 800×500 | 1.347 | PASS |
| Plasma | own | 1440×900 | 2.321 | FAIL |
| Plasma | own | 800×500 | 1.983 | PASS |
| InkInWater | own | 1440×900 | 1.851 | PASS |
| InkInWater | own | 800×500 | 1.308 | PASS |
| FrozenSwirl | own | 1440×900 | 1.934 | PASS |
| FrozenSwirl | own | 800×500 | 1.471 | PASS |
| Aurora | own | 1440×900 | 1.977 | PASS |
| Aurora | own | 800×500 | 1.594 | PASS |
| CircularFluid | own | 1440×900 | 1.765 | PASS |
| CircularFluid | own | 800×500 | 1.334 | PASS |
| FrameFluid | own | 1440×900 | 1.884 | PASS |
| FrameFluid | own | 800×500 | 1.423 | PASS |
| AnnularFluid | own | 1440×900 | 2.056 | FAIL |
| AnnularFluid | own | 800×500 | 1.271 | PASS |
| SvgPathFluid | own | 1440×900 | 1.765 | PASS |
| SvgPathFluid | own | 800×500 | 1.330 | PASS |
| Toroidal | own | 1440×900 | 2.211 | FAIL |
| Toroidal | own | 800×500 | 1.788 | PASS |
| GasFlare | own | 1440×900 | 2.443 | FAIL |
| GasFlare | own | 800×500 | 1.933 | PASS |
| Venturi | own | 1440×900 | 1.681 | PASS |
| Venturi | own | 800×500 | 1.270 | PASS |
| Karman | own | 1440×900 | 2.720 | FAIL |
| Karman | own | 800×500 | 2.901 | FAIL |
| TeslaValve | own | 1440×900 | 2.733 | FAIL |
| TeslaValve | own | 800×500 | 2.491 | FAIL |
| Karman | shared | 1440×900 | 3.150 | FAIL |
| GasFlare | shared | 1440×900 | 2.531 | FAIL |
| LavaLamp | shared | 1440×900 | 2.030 | FAIL |
| (default) | shared | 1440×900 | 2.235 | FAIL |
| Karman | own | 480.25×300.5 | 2.694 | FAIL |
| LiquidButton (220×56; canvas 232×68) | shared | 232×68 | 0.700 | PASS |
| LiquidButton wide (480×64; canvas 492×76) | shared | 492×76 | 0.758 | PASS |
| LiquidSegmented (360×56; canvas 372×68) | shared | 372×68 | 0.811 | PASS |
| LiquidDropZone dragging (480×200; canvas 492×212) | shared | 492×212 | 1.361 | PASS |
| LiquidCaustics (720×400) | shared | 720×400 | 1.076 | PASS |
| EnamelText 96px bold | shared | 322.3125×105.59375 | 0.503 | PASS |
| EnamelText 64px two words | shared | 351.375×70.3984375 | 0.469 | PASS |
| InkPaper held wet (800×500) | shared | 800×500 | 2.453 | FAIL |

Open optimisation: the 15 FAIL rows remain `svelte-fluid-7n8` work. Ten rows
change from strict-max FAIL to p95 PASS without runtime improvement; their max
exceedances are not erased. No new captures, tuning or per-shader GPU shares
are claimed by this re-tabulation.

### Pinned-seed optimisation protocol — 2026-10-06

Use `bun scripts/gpu-capture.mjs [--seed N[,N...]]`: reference seed **5** by
default; optionally supply up to five distinct uint32 seeds, for example
`--seed 5,42,2026`. Every preset result and console row records the explicit seed;
trace names include it. InkPaper retains its existing seed 5 workload; other model
rows label seed as not applicable. Replayed older rows without seed metadata are
labelled **`unseeded (historical)`**, never assigned the reference seed retroactively.

Report **every clean repeat**, with median, p95 and max. A scene passes only if
**each clean repeat's p95 is <2 ms**; one clean failure cannot be erased by a later
pass. `capture.json` retains all attempt rows and scene summaries counting clean
repeats, including every supplied seed. CONTENDED/INCONCLUSIVE attempts stay visible
but do not certify a scene. Separate invocations must retain separate output
directories and combine all clean repeats when reporting; do not overwrite or
select a favourable run. Historical strict-max tables and the selected-row p95
re-tabulation above remain unchanged, not certification under this new repeat rule.

Optimisation lanes must compare **same-seed before/after captures using this script
unchanged**, matching CSS size, tier, native DPR and environment. Pin the same seed
set in both captures. Preserve 200 warm-up frames, 60 fixed-dt measured frames,
three-RAF pacing, Metal interval-union attribution, complete native writes, 60
shared transfers and the >=5% foreign-overlap contention gate. No new capture or
runtime optimisation was performed for this protocol update.

### Shared snapshot investigation — 2026-10-06

[ADR 0103](../decisions/0103-untransformed-shared-snapshots.md) removes only the
redundant colour-tag transform: `createImageBitmap(surface)` retains the safe
snapshot transport. No solver, shader, pigment, preset or capture-script changes.
The five target shared scenes still **FAIL** p95 <2 ms across clean repeats.

M1 Max, Chrome 154.0.8037.98, ANGLE Metal, actual native DPR 2. Baseline runtime
is unchanged from `76bdaa2` (capture SHA `e3f9e1d`, tests-only WIP); candidate
capture SHA `d948732`. Same seed **5**, unchanged script, 200 warm-up / 60 paced
frames, native Metal interval union. The four 1440×900 presets use 2880×1800
backing; InkPaper 800×500 uses 1600×1000; button 232×68 uses 464×136; enamel
actual 322.3125×105.59375 uses 644×211. Cases interleave own then shared twice
per preset, then InkPaper/button/enamel twice. Both invocations retain 22 rows.
Raw evidence: `/tmp/opt-shared/{baseline,candidate}/capture.json`, matching
per-attempt `.trace`/`.frames.json` and three native export hashes per row.
No contended attempt; foreign overlap at most 0.040% baseline, 0.014% candidate.
Every accepted row has 60 native-write bursts; every shared/model attempt has
60 requested / 60 delivered transfers, including attribution-inconclusive ones.

**Every attempt below remains visible.** Values are native median / p95 / max
milliseconds; `a1` and `a2` are repeats, not selected best rows. A clean FAIL
cannot be erased by a PASS. `—` is attribution-inconclusive, not zero execution.

| Scene / tier | Baseline a1 | Baseline a2 | Candidate a1 | Candidate a2 | Candidate all-clean-repeat verdict |
|---|---|---|---|---|---|
| Karman / own | 2.258 / 3.214 / 3.583 (FAIL) | 2.280 / 3.550 / 4.798 (FAIL) | 2.308 / 3.301 / 4.569 (FAIL) | 2.360 / 3.165 / 3.717 (FAIL) | FAIL |
| Karman / shared | 2.442 / 4.388 / 4.826 (FAIL) | 2.597 / 4.219 / 5.202 (FAIL) | 2.390 / 3.656 / 5.756 (FAIL) | 2.355 / 3.666 / 4.718 (FAIL) | FAIL |
| GasFlare / own | 1.932 / 2.912 / 3.921 (FAIL) | 1.875 / 2.469 / 2.678 (FAIL) | 1.918 / 3.325 / 4.679 (FAIL) | 1.984 / 3.036 / 4.440 (FAIL) | FAIL |
| GasFlare / shared | 2.130 / 3.649 / 4.327 (FAIL) | 2.098 / 2.723 / 4.299 (FAIL) | 1.971 / 2.522 / 4.601 (FAIL) | — (INCONCLUSIVE) | FAIL |
| LavaLamp / own | 1.429 / 1.844 / 3.388 (PASS) | 2.122 / 3.433 / 3.835 (FAIL) | 1.508 / 2.252 / 4.065 (FAIL) | 1.631 / 2.542 / 3.687 (FAIL) | FAIL |
| LavaLamp / shared | 1.893 / 2.563 / 3.197 (FAIL) | 1.589 / 2.049 / 3.857 (FAIL) | 1.528 / 2.455 / 3.594 (FAIL) | 1.595 / 2.454 / 3.101 (FAIL) | FAIL |
| (default) / own | — (INCONCLUSIVE) | 1.710 / 2.353 / 2.949 (FAIL) | — (INCONCLUSIVE) | 1.693 / 2.430 / 3.590 (FAIL) | FAIL |
| (default) / shared | 1.883 / 2.314 / 3.551 (FAIL) | 1.783 / 3.005 / 3.965 (FAIL) | 1.812 / 2.721 / 5.092 (FAIL) | 1.677 / 2.779 / 4.509 (FAIL) | FAIL |
| model-inkpaper / shared | 1.807 / 3.986 / 4.065 (FAIL) | 1.846 / 2.438 / 2.465 (FAIL) | — (INCONCLUSIVE) | 1.772 / 3.850 / 4.036 (FAIL) | FAIL |
| model-button / shared | 0.662 / 0.742 / 0.802 (PASS) | 0.699 / 0.764 / 0.907 (PASS) | 0.645 / 0.743 / 0.785 (PASS) | 0.635 / 0.748 / 0.790 (PASS) | PASS |
| model-enamel96 / shared | 0.478 / 0.506 / 0.622 (PASS) | 0.468 / 0.597 / 2.183 (PASS) | 0.448 / 0.461 / 0.469 (PASS) | 0.452 / 0.537 / 0.644 (PASS) | PASS |

Paired **shared minus immediately preceding own** native statistics (median /
p95 / max ms); same seed, scene, native size, run order. These quantify observed
tier differences, **not isolated snapshot time**: unchanged own and shared
execution vary substantially. Negative deltas expose that limit rather than
being clipped or interpreted as a free snapshot.

| Preset | Baseline pair 1 | Baseline pair 2 | Candidate pair 1 | Candidate pair 2 |
|---|---|---|---|---|
| Karman | 0.184 / 1.174 / 1.243 | 0.317 / 0.668 / 0.404 | 0.081 / 0.355 / 1.187 | -0.004 / 0.500 / 1.001 |
| GasFlare | 0.198 / 0.737 / 0.406 | 0.223 / 0.254 / 1.621 | 0.053 / -0.802 / -0.078 | INCONCLUSIVE |
| LavaLamp | 0.464 / 0.719 / -0.191 | -0.533 / -1.385 / 0.021 | 0.020 / 0.203 / -0.471 | -0.035 / -0.087 / -0.587 |
| (default) | INCONCLUSIVE | 0.073 / 0.651 / 1.016 | INCONCLUSIVE | -0.016 / 0.349 / 0.918 |

Attribution failures retained: baseline default-own a1 spacing error 11.712 ms;
candidate default-own a1 14.515 ms, GasFlare-shared a2 4.101 ms, InkPaper a1
4.072 ms (gate <4 ms). No invented replacement marks or relaxed gate.

Native copy evidence: Karman shared a1 baseline 41 encoders in 59/60 frames,
candidate 40 in 59/60. Frame 5: baseline two full-native-size raster copies,
IOSurfaces 229→238→254; candidate one, 94→637. Detailed buffer identities in
ADR 0103. Necessary snapshot copy remains; no per-shader time ranking claimed.
The code removes demonstrably redundant work, but these variable tails do not
prove a universal GPU-time improvement or certify the open p95 goal.

Same-seed before/after PNGs and manifests stay under `/tmp/opt-shared/visual/`.
Hardware tests cover explicit-none reference parity, saturated/translucent
sRGB and display-p3 composites on light/dark backgrounds, every tone map and
transparent/reveal/distortion output; existing 24-instance, overlapping/stale
snapshot, forced-loss restore and lazy/churn coverage remains. No profile
setting changed; preserving a tagged sRGB canvas is independent of a monitor
profile, not a claim to have exercised every OS profile.

### Hot-pass attribution — bounded negative result

No truthful per-shader top-three GPU shares could be derived. Native labels are
`Command Buffer 0:Render Command N`, not GLSL program names. A bench-only draw/program
log found **Karman 39 WebGL draws versus 40 Metal encoders** per steady frame; ANGLE
inserts an unlabelled clear/copy encoder at an unknown position. GasFlare's diagnostic
cluster run was attribution-inconclusive. There is no proved 1:1 mapping or coarse
boundary separating simulation from display/copy. Thus shader shares are **not
estimated**, and historical wall pass replay numbers are not relabelled GPU times.

Workload inventory only (not GPU-time share): Karman 17 paired-Jacobi draws, 8 viscosity
draws, 2 advection draws, 1 display draw among 39; GasFlare 12 paired-Jacobi, 9 bloom-
blur, 3 advection, plus bloom prefilter/final and display among 38. These identify
optimization candidates, not hot-pass rankings. Other failing scenes' top-three
GPU shares remain unmeasured for the same generic-label/boundary ceiling. Runtime
optimization left to the lead; none performed to make the numbers pass.

### Reproducibility / exact commands

Single script: `scripts/gpu-capture.mjs`; no new dependencies. Raw `.trace`, TOC,
frame details and exploratory exports remain only under `/tmp/gpu-capture/`.
Capture script revisions: `c1f93e1` (preset matrix), `23ad9d3` (shared/models/InkPaper),
`f932c7a` (attribution retries). Underlying production runtime remains `9df58fc`.
Preset matrix re-derived with `23ad9d3` analysis: stored frame→buffer mapping reused
for browser/OS ceilings and exact foreign intersections; original JS alignment
errors retained. The two originally ambiguous viewport rows were freshly retried,
not certified by manufactured marks. Components/retries already include ceilings.

```sh
GPU_CAPTURE_DIR=/tmp/gpu-capture/native-matrix bun scripts/gpu-capture.mjs
GPU_CAPTURE_CASES='Karman@1440x900:shared:2,GasFlare@1440x900:shared:2,LavaLamp@1440x900:shared:2,(default)@1440x900:shared:2,Karman@480.25x300.5:own:2,model-button@232x68:shared:2,model-wide-button@492x76:shared:2,model-segmented@372x68:shared:2,model-dropzone@492x212:shared:2,model-caustics@720x400:shared:2,model-enamel96@1x1:shared:2,model-enamel64@1x1:shared:2' GPU_CAPTURE_DIR=/tmp/gpu-capture/components bun scripts/gpu-capture.mjs
GPU_CAPTURE_CASES='model-inkpaper@800x500:shared:2' GPU_CAPTURE_DIR=/tmp/gpu-capture/inkpaper bun scripts/gpu-capture.mjs
GPU_CAPTURE_CASES='CircularFluid@1440x900:own:2,FrameFluid@1440x900:own:2,InkInWater@800x500:own:2' GPU_CAPTURE_DIR=/tmp/gpu-capture/retry-attribution bun scripts/gpu-capture.mjs
bun scripts/gpu-capture.mjs --replay /tmp/gpu-capture/native-matrix/capture.json
bun scripts/gpu-capture.mjs --self-check
```

Per-capture native command (table below supplies exact PID, path and notification suffix):
```sh
env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun xctrace record   --template 'Metal System Trace' --attach <GPU_PID> --time-limit 10s --no-prompt   --notify-tracing-started <notification> --output <trace>
env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun xctrace export --input <trace> --toc
env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun xctrace export --input <trace>   --xpath '/trace-toc/run[@number="1"]/data/table[@schema="metal-gpu-intervals"]'
# Same XPath for metal-application-command-buffer-submissions and metal-io-surface-access.
```

### All attempts, clients and export SHA256 provenance

Numbers remain even for CONTENDED/INCONCLUSIVE attempts. Hash order: **GPU intervals /
submissions / IOSurface accesses / TOC**. Exports are XML text; ID/ref deduplication
is resolved before interval arithmetic. No raw table committed. Prefix all trace
paths with `/tmp/gpu-capture/`; notification is the exact record-command value.

| Trace | GPU PID | Notification | Seconds | Median / p95 / max | Verdict | Foreign overlap ms / % | Other GPU clients (name/PID) |
|---|---:|---|---:|---|---|---|---|
| `native-matrix/default-1440x900-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.default-1440x900-own-dpr2.1` | 3.368 | 1.682 / 1.994 / 2.111 | FAIL | 0.019 / 0.020% | WindowServer (397), ghostty (14036) |
| `native-matrix/default-1440x900-own-dpr2-a2.trace` | 96735 | `svelte-fluid.gpu-capture.96022.default-1440x900-own-dpr2.2` | 3.362 | 1.526 / 2.020 / 2.216 | FAIL | 1.926 / 2.079% | WindowServer (397), ghostty (14036), Google Chrome Helper (4411), unattributed |
| `native-matrix/default-800x500-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.default-800x500-own-dpr2.1` | 3.259 | 1.152 / 1.522 / 1.724 | PASS | 0.259 / 0.355% | WindowServer (397), ghostty (14036) |
| `native-matrix/default-800x500-own-dpr2-a2.trace` | 96735 | `svelte-fluid.gpu-capture.96022.default-800x500-own-dpr2.2` | 3.196 | 1.243 / 1.634 / 1.813 | PASS | 0.000 / 0.000% | WindowServer (397), Google Chrome Helper (4411), ghostty (14036) |
| `native-matrix/LavaLamp-1440x900-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.LavaLamp-1440x900-own-dpr2.1` | 3.222 | 1.696 / 1.887 / 2.096 | FAIL | 0.376 / 0.421% | WindowServer (397), Google Chrome Helper (4411), ghostty (14036) |
| `native-matrix/LavaLamp-1440x900-own-dpr2-a2.trace` | 96735 | `svelte-fluid.gpu-capture.96022.LavaLamp-1440x900-own-dpr2.2` | 3.284 | 1.221 / 1.913 / 2.098 | FAIL | 0.709 / 0.857% | WindowServer (397), ghostty (14036) |
| `native-matrix/LavaLamp-800x500-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.LavaLamp-800x500-own-dpr2.1` | 3.228 | 1.092 / 1.347 / 1.537 | PASS | 0.021 / 0.034% | WindowServer (397), ghostty (14036), unattributed |
| `native-matrix/Plasma-1440x900-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.Plasma-1440x900-own-dpr2.1` | 3.211 | 1.508 / 1.963 / 2.195 | FAIL | 0.292 / 0.324% | WindowServer (397), ghostty (14036) |
| `native-matrix/Plasma-1440x900-own-dpr2-a2.trace` | 96735 | `svelte-fluid.gpu-capture.96022.Plasma-1440x900-own-dpr2.2` | 3.243 | 1.687 / 2.321 / 2.470 | FAIL | 2.237 / 2.185% | ghostty (14036), WindowServer (397) |
| `native-matrix/Plasma-800x500-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.Plasma-800x500-own-dpr2.1` | 3.207 | 1.338 / 1.983 / 2.740 | FAIL | 1.472 / 1.724% | WindowServer (397), ghostty (14036) |
| `native-matrix/Plasma-800x500-own-dpr2-a2.trace` | 96735 | `svelte-fluid.gpu-capture.96022.Plasma-800x500-own-dpr2.2` | 3.218 | 1.357 / 1.762 / 1.927 | PASS | 0.101 / 0.127% | WindowServer (397), ghostty (14036) |
| `native-matrix/InkInWater-1440x900-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.InkInWater-1440x900-own-dpr2.1` | 3.255 | 1.302 / 1.851 / 2.088 | FAIL | 0.000 / 0.000% | WindowServer (397) |
| `native-matrix/InkInWater-800x500-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.InkInWater-800x500-own-dpr2.1` | 3.238 | 1.003 / 1.308 / 1.786 | PASS | 0.671 / 1.126% | WindowServer (397), ghostty (14036) |
| `native-matrix/InkInWater-800x500-own-dpr2-a2.trace` | 96735 | `svelte-fluid.gpu-capture.96022.InkInWater-800x500-own-dpr2.2` | 3.218 | 1.111 / 1.364 / 1.834 | CONTENDED | 5.062 / 7.921% | ghostty (14036), WindowServer (397), unattributed |
| `native-matrix/FrozenSwirl-1440x900-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.FrozenSwirl-1440x900-own-dpr2.1` | 3.246 | 1.456 / 1.844 / 2.069 | FAIL | 0.310 / 0.373% | ghostty (14036), WindowServer (397) |
| `native-matrix/FrozenSwirl-1440x900-own-dpr2-a2.trace` | 96735 | `svelte-fluid.gpu-capture.96022.FrozenSwirl-1440x900-own-dpr2.2` | 3.203 | 1.670 / 1.934 / 2.124 | FAIL | 3.879 / 4.287% | ghostty (14036), WindowServer (397), unattributed |
| `native-matrix/FrozenSwirl-800x500-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.FrozenSwirl-800x500-own-dpr2.1` | 3.247 | 1.197 / 1.471 / 1.581 | PASS | 0.000 / 0.000% | WindowServer (397), ghostty (14036) |
| `native-matrix/Aurora-1440x900-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.Aurora-1440x900-own-dpr2.1` | 3.205 | 1.675 / 2.003 / 2.061 | FAIL | 0.507 / 0.532% | WindowServer (397), ghostty (14036) |
| `native-matrix/Aurora-1440x900-own-dpr2-a2.trace` | 96735 | `svelte-fluid.gpu-capture.96022.Aurora-1440x900-own-dpr2.2` | 3.235 | 1.494 / 1.977 / 2.153 | FAIL | 0.185 / 0.203% | WindowServer (397), ghostty (14036) |
| `native-matrix/Aurora-800x500-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.Aurora-800x500-own-dpr2.1` | 3.243 | 1.271 / 1.594 / 1.722 | PASS | 0.066 / 0.088% | WindowServer (397), ghostty (14036) |
| `native-matrix/CircularFluid-1440x900-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.CircularFluid-1440x900-own-dpr2.1` | 3.211 | 1.247 / 1.716 / 1.823 | PASS | 1.550 / 1.927% | ghostty (14036), WindowServer (397), Google Chrome Helper (4411) |
| `native-matrix/CircularFluid-1440x900-own-dpr2-a2.trace` | 96735 | `svelte-fluid.gpu-capture.96022.CircularFluid-1440x900-own-dpr2.2` | 3.242 | — / — / — | INCONCLUSIVE | 0.000 / —% | none |
| `native-matrix/CircularFluid-800x500-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.CircularFluid-800x500-own-dpr2.1` | 3.230 | 1.083 / 1.334 / 1.370 | PASS | 0.000 / 0.000% | WindowServer (397), Google Chrome Helper (4411) |
| `native-matrix/FrameFluid-1440x900-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.FrameFluid-1440x900-own-dpr2.1` | 3.229 | — / — / — | INCONCLUSIVE | 0.000 / —% | none |
| `native-matrix/FrameFluid-800x500-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.FrameFluid-800x500-own-dpr2.1` | 3.234 | 1.186 / 1.423 / 2.056 | FAIL | 0.713 / 1.043% | WindowServer (397), ghostty (14036) |
| `native-matrix/FrameFluid-800x500-own-dpr2-a2.trace` | 96735 | `svelte-fluid.gpu-capture.96022.FrameFluid-800x500-own-dpr2.2` | 3.220 | 1.166 / 1.438 / 1.721 | PASS | 0.000 / 0.000% | WindowServer (397) |
| `native-matrix/AnnularFluid-1440x900-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.AnnularFluid-1440x900-own-dpr2.1` | 3.212 | 1.401 / 1.779 / 2.189 | FAIL | 0.097 / 0.117% | WindowServer (397), ghostty (14036) |
| `native-matrix/AnnularFluid-1440x900-own-dpr2-a2.trace` | 96735 | `svelte-fluid.gpu-capture.96022.AnnularFluid-1440x900-own-dpr2.2` | 3.225 | 1.474 / 2.056 / 2.281 | FAIL | 1.348 / 1.489% | WindowServer (397), ghostty (14036) |
| `native-matrix/AnnularFluid-800x500-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.AnnularFluid-800x500-own-dpr2.1` | 3.221 | 1.133 / 1.372 / 1.834 | PASS | 0.394 / 0.594% | ghostty (14036), WindowServer (397) |
| `native-matrix/AnnularFluid-800x500-own-dpr2-a2.trace` | 96735 | `svelte-fluid.gpu-capture.96022.AnnularFluid-800x500-own-dpr2.2` | 3.386 | 0.989 / 1.271 / 2.046 | FAIL | 0.954 / 1.589% | WindowServer (397), ghostty (14036) |
| `native-matrix/SvgPathFluid-1440x900-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.SvgPathFluid-1440x900-own-dpr2.1` | 3.225 | 1.338 / 1.782 / 1.875 | PASS | 0.361 / 0.441% | WindowServer (397), ghostty (14036) |
| `native-matrix/SvgPathFluid-1440x900-own-dpr2-a2.trace` | 96735 | `svelte-fluid.gpu-capture.96022.SvgPathFluid-1440x900-own-dpr2.2` | 3.206 | 1.443 / 1.765 / 1.936 | PASS | 0.363 / 0.438% | WindowServer (397), Google Chrome Helper (4411), ghostty (14036) |
| `native-matrix/SvgPathFluid-800x500-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.SvgPathFluid-800x500-own-dpr2.1` | 3.196 | 0.972 / 1.330 / 1.457 | PASS | 0.307 / 0.501% | WindowServer (397), ghostty (14036), Google Chrome Helper (4411) |
| `native-matrix/Toroidal-1440x900-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.Toroidal-1440x900-own-dpr2.1` | 3.229 | 1.636 / 2.211 / 2.427 | FAIL | 0.210 / 0.210% | WindowServer (397), ghostty (14036) |
| `native-matrix/Toroidal-800x500-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.Toroidal-800x500-own-dpr2.1` | 3.210 | 1.370 / 1.788 / 2.428 | FAIL | 1.543 / 1.865% | ghostty (14036), WindowServer (397) |
| `native-matrix/Toroidal-800x500-own-dpr2-a2.trace` | 96735 | `svelte-fluid.gpu-capture.96022.Toroidal-800x500-own-dpr2.2` | 3.191 | 1.401 / 1.787 / 2.273 | FAIL | 1.423 / 1.702% | WindowServer (397), ghostty (14036) |
| `native-matrix/GasFlare-1440x900-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.GasFlare-1440x900-own-dpr2.1` | 3.213 | 2.020 / 2.443 / 2.611 | FAIL | 0.173 / 0.154% | WindowServer (397), ghostty (14036), Google Chrome Helper (4411) |
| `native-matrix/GasFlare-800x500-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.GasFlare-800x500-own-dpr2.1` | 3.267 | 1.716 / 1.933 / 2.820 | FAIL | 2.798 / 2.941% | ghostty (14036), WindowServer (397), unattributed |
| `native-matrix/GasFlare-800x500-own-dpr2-a2.trace` | 96735 | `svelte-fluid.gpu-capture.96022.GasFlare-800x500-own-dpr2.2` | 3.207 | 1.451 / 1.870 / 2.015 | FAIL | 0.000 / 0.000% | WindowServer (397), ghostty (14036), Google Chrome Helper (4411) |
| `native-matrix/Venturi-1440x900-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.Venturi-1440x900-own-dpr2.1` | 3.194 | 1.357 / 1.681 / 1.861 | PASS | 0.000 / 0.000% | ghostty (14036), WindowServer (397) |
| `native-matrix/Venturi-800x500-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.Venturi-800x500-own-dpr2.1` | 3.328 | 0.960 / 1.270 / 1.715 | PASS | 1.891 / 3.258% | ghostty (14036), WindowServer (397) |
| `native-matrix/Venturi-800x500-own-dpr2-a2.trace` | 96735 | `svelte-fluid.gpu-capture.96022.Venturi-800x500-own-dpr2.2` | 3.222 | 0.958 / 1.173 / 1.276 | PASS | 0.000 / 0.000% | WindowServer (397) |
| `native-matrix/Karman-1440x900-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.Karman-1440x900-own-dpr2.1` | 3.324 | 2.289 / 2.720 / 3.405 | FAIL | 0.000 / 0.000% | WindowServer (397), Google Chrome Helper (4411) |
| `native-matrix/Karman-800x500-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.Karman-800x500-own-dpr2.1` | 3.216 | 2.366 / 2.901 / 3.428 | FAIL | 1.486 / 1.146% | WindowServer (397), ghostty (14036), unattributed |
| `native-matrix/Karman-800x500-own-dpr2-a2.trace` | 96735 | `svelte-fluid.gpu-capture.96022.Karman-800x500-own-dpr2.2` | 3.787 | 2.094 / 2.714 / 3.222 | FAIL | 0.000 / 0.000% | WindowServer (397), Google Chrome Helper (4411), ghostty (14036) |
| `native-matrix/TeslaValve-1440x900-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.TeslaValve-1440x900-own-dpr2.1` | 3.186 | 2.057 / 2.733 / 2.907 | FAIL | 0.371 / 0.312% | WindowServer (397), ghostty (14036) |
| `native-matrix/TeslaValve-800x500-own-dpr2-a1.trace` | 96735 | `svelte-fluid.gpu-capture.96022.TeslaValve-800x500-own-dpr2.1` | 3.195 | 1.812 / 2.424 / 2.717 | FAIL | 0.182 / 0.169% | ghostty (14036), WindowServer (397) |
| `native-matrix/TeslaValve-800x500-own-dpr2-a2.trace` | 96735 | `svelte-fluid.gpu-capture.96022.TeslaValve-800x500-own-dpr2.2` | 3.268 | 1.690 / 2.491 / 2.728 | FAIL | 0.535 / 0.497% | WindowServer (397), ghostty (14036) |
| `components/Karman-1440x900-shared-dpr2-a1.trace` | 48493 | `svelte-fluid.gpu-capture.48446.Karman-1440x900-shared-dpr2.1` | 3.214 | 2.775 / 3.150 / 3.433 | FAIL | 0.000 / 0.000% | ghostty (14036), WindowServer (397) |
| `components/GasFlare-1440x900-shared-dpr2-a1.trace` | 48493 | `svelte-fluid.gpu-capture.48446.GasFlare-1440x900-shared-dpr2.1` | 3.230 | 2.237 / 2.531 / 2.768 | FAIL | 0.556 / 0.432% | WindowServer (397), ghostty (14036) |
| `components/LavaLamp-1440x900-shared-dpr2-a1.trace` | 48493 | `svelte-fluid.gpu-capture.48446.LavaLamp-1440x900-shared-dpr2.1` | 3.324 | 1.751 / 2.030 / 2.655 | FAIL | 0.000 / 0.000% | WindowServer (397), ghostty (14036) |
| `components/default-1440x900-shared-dpr2-a1.trace` | 48493 | `svelte-fluid.gpu-capture.48446.default-1440x900-shared-dpr2.1` | 2.989 | 1.644 / 2.235 / 2.452 | FAIL | 0.354 / 0.333% | WindowServer (397), ghostty (14036) |
| `components/Karman-480.25x300.5-own-dpr2-a1.trace` | 48493 | `svelte-fluid.gpu-capture.48446.Karman-480.25x300.5-own-dpr2.1` | 3.044 | 1.991 / 2.694 / 2.830 | FAIL | 0.088 / 0.072% | WindowServer (397), ghostty (14036) |
| `components/modelbutton-232x68-shared-dpr2-a1.trace` | 48493 | `svelte-fluid.gpu-capture.48446.modelbutton-232x68-shared-dpr2.1` | 2.998 | 0.692 / 0.700 / 0.903 | PASS | 0.385 / 0.951% | WindowServer (397), ghostty (14036) |
| `components/modelwidebutton-492x76-shared-dpr2-a1.trace` | 48493 | `svelte-fluid.gpu-capture.48446.modelwidebutton-492x76-shared-dpr2.1` | 3.028 | 0.734 / 0.758 / 0.784 | PASS | 0.000 / 0.000% | WindowServer (397), ghostty (14036) |
| `components/modelsegmented-372x68-shared-dpr2-a1.trace` | 48493 | `svelte-fluid.gpu-capture.48446.modelsegmented-372x68-shared-dpr2.1` | 3.055 | 0.790 / 0.811 / 0.925 | PASS | 0.959 / 2.157% | ghostty (14036), WindowServer (397), unattributed |
| `components/modeldropzone-492x212-shared-dpr2-a1.trace` | 48493 | `svelte-fluid.gpu-capture.48446.modeldropzone-492x212-shared-dpr2.1` | 3.051 | 1.133 / 1.361 / 1.406 | PASS | 1.219 / 1.812% | WindowServer (397), ghostty (14036) |
| `components/modelcaustics-720x400-shared-dpr2-a1.trace` | 48493 | `svelte-fluid.gpu-capture.48446.modelcaustics-720x400-shared-dpr2.1` | 3.065 | 1.051 / 1.076 / 1.135 | PASS | 0.540 / 0.984% | WindowServer (397), ghostty (14036) |
| `components/modelenamel96-1x1-shared-dpr2-a1.trace` | 48493 | `svelte-fluid.gpu-capture.48446.modelenamel96-1x1-shared-dpr2.1` | 3.036 | 0.459 / 0.503 / 0.536 | PASS | 0.038 / 0.145% | unattributed, WindowServer (397), ghostty (14036), mediaanalysisd (749) |
| `components/modelenamel64-1x1-shared-dpr2-a1.trace` | 48493 | `svelte-fluid.gpu-capture.48446.modelenamel64-1x1-shared-dpr2.1` | 2.989 | 0.467 / 0.548 / 1.433 | CONTENDED | 2.652 / 9.259% | ghostty (14036), WindowServer (397) |
| `components/modelenamel64-1x1-shared-dpr2-a2.trace` | 48493 | `svelte-fluid.gpu-capture.48446.modelenamel64-1x1-shared-dpr2.2` | 2.987 | 0.408 / 0.469 / 0.550 | PASS | 0.000 / 0.000% | WindowServer (397), ghostty (14036) |
| `inkpaper/modelinkpaper-800x500-shared-dpr2-a1.trace` | 57828 | `svelte-fluid.gpu-capture.57735.modelinkpaper-800x500-shared-dpr2.1` | 3.008 | 1.617 / 2.453 / 2.771 | FAIL | 4.772 / 4.225% | ghostty (14036), WindowServer (397) |
| `retry-attribution/CircularFluid-1440x900-own-dpr2-a1.trace` | 83454 | `svelte-fluid.gpu-capture.83434.CircularFluid-1440x900-own-dpr2.1` | 3.752 | 6.254 / 14.023 / 18.149 | CONTENDED | 445.547 / 99.542% | python3.12 (73759), WindowServer (397) |
| `retry-attribution/CircularFluid-1440x900-own-dpr2-a2.trace` | 83454 | `svelte-fluid.gpu-capture.83434.CircularFluid-1440x900-own-dpr2.2` | 3.008 | 1.391 / 1.765 / 1.910 | PASS | 0.000 / 0.000% | WindowServer (397) |
| `retry-attribution/FrameFluid-1440x900-own-dpr2-a1.trace` | 83454 | `svelte-fluid.gpu-capture.83434.FrameFluid-1440x900-own-dpr2.1` | 3.035 | 1.475 / 1.884 / 2.405 | FAIL | 0.000 / 0.000% | WindowServer (397) |
| `retry-attribution/InkInWater-800x500-own-dpr2-a1.trace` | 83454 | `svelte-fluid.gpu-capture.83434.InkInWater-800x500-own-dpr2.1` | 3.030 | 0.951 / 1.111 / 1.215 | PASS | 0.000 / 0.000% | WindowServer (397) |

SHA256 by trace (same order as attempt rows):

- `native-matrix/default-1440x900-own-dpr2-a1.trace`: `95f6f1148c00795b6b7210aa9040dec66bb157ecf8f8a4cda7cc8d5373e032ce` / `119a4ee25998846da276eced3aec159709191364d91d14a37fd70197c0e5d058` / `481139dfeee7b71df5221db3cadb4cf4610888b52d1d86103f1fb8e41a76e30d` / `ba08ff87587d100635779cbb6c3c67562267d90111de5085bf6ae08e8036e1ff`
- `native-matrix/default-1440x900-own-dpr2-a2.trace`: `b9737ee1157be3d1673215a4774993518ffbd7e13a40ff7c749b7624c7537905` / `103d629c21005df1b40c201029d1262f72568bca530beddcf5a8ca2712e07158` / `60b3bd62b1977ea77be6779a92ffbb125d4a7248848639775053e9581ac8830f` / `a8663ab9df729ab63824a2cf175fb8130ba7dd826ac4a8bfae92a1ed4ca29eff`
- `native-matrix/default-800x500-own-dpr2-a1.trace`: `e593fc34541f16a1d128d0bff37557351573b04e29f51c17723029c3e43a5875` / `8853c819b169ad1b934f090a32764e2fb40e4e596c6cd5bc601e1513fe4acead` / `cd1797234091fc8f67c98a375525cf470ffd2195020e4894146fc399dfb77f97` / `ded45801b104852116e3fc44c4effbd27cf52a18fed2d95e01bcad062e2a6de2`
- `native-matrix/default-800x500-own-dpr2-a2.trace`: `77fe3805f3f9a4a3e1aa8a9fce1203cce61bb535f143334701b3b76fef0423aa` / `e661cdbe189e5604c4aa6fad0d35fde046aa4d312d90c14f9ab2fd4803ae61ae` / `2dcaca747754eae258cec08e2551876d95d5de09d433dd7c0d6377998a9b89d7` / `7d718038272f9ef9113fdd178078de4571ed647ffb1607a4f55910e62e97af69`
- `native-matrix/LavaLamp-1440x900-own-dpr2-a1.trace`: `51db38c0b39c6c6fa5e798d1c3a0bb310ed8356bd24b814b2046868ba7b6f09f` / `72af2678525292c9ea089f4151878c27695e6cdeabead27d6e29c7a3e147b01d` / `828b463812fe35e3f9ab017ca5a83907d93399689c1c645964893f260a6a015c` / `8a13c3df95e77db4614125e6687a281735504ee0d2baa6afdb8e46124276b707`
- `native-matrix/LavaLamp-1440x900-own-dpr2-a2.trace`: `afe0065477542547afbcefff44b87978fd5643bed15b0d36bee408de34a2ec76` / `671450024d9891b0e9467ea0c33e7eca4ed2b876491a87201f7d6f6c92c85b7d` / `30587b284593947d95ca763bc8e664df41c1e1017601dc35a97941531f33e8db` / `e061c0f144bef6dd23c5a349e68c2758dffe884065196ccf6686c1a7f749835d`
- `native-matrix/LavaLamp-800x500-own-dpr2-a1.trace`: `32266954fd969ac854c4d5554ba6e2fc4fb8fe093fe2afe7c9a4035e50b5130a` / `b5b25655e5636534c23fc82886d3eea075d9241d414c49329c676c7b7de28ba8` / `652e42098b83fabe472d08963aeda2af91be7f0cd03b15c86c249471b7b46efd` / `7b64873ed36115af1c557a398ed7d771640b20b854dfa68f8d99b92606063d05`
- `native-matrix/Plasma-1440x900-own-dpr2-a1.trace`: `ad0d66b049755f43790914110d9cda5b740d2582ac6b88b214fa14e97562acfb` / `2ba4317ce068d3543d91616131ef246d48a7d4a501de7ad6b7b633064c823078` / `1aca321799a6c1f5d9ad9f7acd475cd7280f27ccf7cbeb86b67b37c3cf960604` / `83c726b1c2133c058d41acd7a7b17653e053064d2744c0164c0a9b84e5b48ece`
- `native-matrix/Plasma-1440x900-own-dpr2-a2.trace`: `75073f621aa50462f1ee46da8217857967bcba424b869b8e2147771cbf2d6971` / `c8828d0519505f147b19904ab285a5debf4418f1347b1d1964073d35da13d571` / `d44f72b75d0b64eb207f76622dbac3a4dd25db3ede65227521a52e96ec528aad` / `70a4bdb8775a6c9c57f0c6f9f9714ccbdce687e78877ef2190173c78badc934b`
- `native-matrix/Plasma-800x500-own-dpr2-a1.trace`: `456cdd355361cbfef2a9af7307cb804582074daf74a132decab70444dc53ac4d` / `83c0a4d86cbe3dfc709d9838d77a98d25d39339f3a27502a6a4ff584b65f1aa8` / `0bdd79f641eccef11d88e7d6043cacaeea33362697572ff3c96a6a1054c41c06` / `2fe5f884e564098d51f3ea9f6f03c34ea9f7dbdbd40691bb6bd39909a701f407`
- `native-matrix/Plasma-800x500-own-dpr2-a2.trace`: `d7868deac6692e678092e1511b1668e128b5934f6b5379ff93ef7fbccffb18bf` / `05d9d3066f531ab4dbec969fb042c40c292a199e13a1f02ef73a45a769754b4e` / `67e498229b41fb54fa8fbac09a6c06569b4fb09b9a14a729e571b18cb11e24be` / `9390d2fbbb44ec3c3e4d4988c196147db47236b18fc6d65617046387317e02b0`
- `native-matrix/InkInWater-1440x900-own-dpr2-a1.trace`: `0c393a33eb5792eaa29cf2cb480a9838b6e9a6bb285611d5cb0046b6772d5ce2` / `2fe6671049f649d037c3f1b90bed0782e3a27501afb008c81853f2bbfede6c0d` / `b2555ce8489becf31ec69bbbe8b71bdeed73fb9b83c9deaf1db6d286de87f79a` / `52630d9d606729af6ea3c2672da981fc594554495063c01f3d8b3a55f86a7d1d`
- `native-matrix/InkInWater-800x500-own-dpr2-a1.trace`: `dbfb4f5eee6d08a6038baa0a143bf1209f75e7f29c7b9f256fc5a5774b7b7083` / `64c9aeb22fe6a33ed7ebb398d5eed3553114d587bc3eba175b985c99658d6154` / `71ef94b04ee79b11a7f03d6ab58d30eb0cb0a952e9e50a56e80284db1950270d` / `35429b53479a78b8eea527995cb439bd840855fa236cd8eb4d27bdabad5a8738`
- `native-matrix/InkInWater-800x500-own-dpr2-a2.trace`: `8aa2090b3d9f20d998c4ce574b60385b8aeb071226d1a049f07c709168cb63e9` / `b190d6312e258d4fd98e31a02b759eb83140c3b086bc8f6ecb0aeb82c96a6a64` / `420095bbb7bdaaeeb7b0563692ded1293566844ee147b99ff8607a4930840f4b` / `e8012a1ca702272cf7ed37ca79a632fc9c31d3706342a7552901598f7913e1ea`
- `native-matrix/FrozenSwirl-1440x900-own-dpr2-a1.trace`: `3af337c51f5c73de46c78596f3660b9b78cbc8ed92c0a5b7b9a2bf37c355ca3b` / `1945f7f8db0e6e35142ee91057a3cfa870e09fcc92fe974aa4d29906a579609c` / `566a8a7ed1930bb27ff0c3ea86e5309e93caedc57a5f3ce7ad006fe5a5443132` / `2c904db2fddac979e625f2e07b5f6da532d179c9cfbf138e07756d66717f7a05`
- `native-matrix/FrozenSwirl-1440x900-own-dpr2-a2.trace`: `06854c4037c72b17fcf00e267ba2579c5f3ed3c1f34f6a072cdd58d2481b86d4` / `02d406bf67d212719fe23e07da9d82cda97ecf05a485c6d03ebd2f5fc20659e0` / `bc4d980111603aebb72fcc132d54978ca6514c404fb54f8cc6e4978fccc3e928` / `1ba2af3121bdd1337b58037929c3564de539c94ddfc05e69154062f66c955dc7`
- `native-matrix/FrozenSwirl-800x500-own-dpr2-a1.trace`: `970be8b69e4eeb86f52a3e2e3cc19887a7143f8be7d4225058722f60c560d7ca` / `151b61cd343effbc803aeefd7f7bc115a040035793620966cdeeca866f7ec91c` / `ed37220a0d7499329ddad1d8b8c5c31db9c3c243e319df2e55e10ebd6164140c` / `5c824a31550da9303afc7d890a781a32ffafff95fede8ce0d04f6adfb7f5fe63`
- `native-matrix/Aurora-1440x900-own-dpr2-a1.trace`: `6fa7c5495a4e253aa1517e4c7e57370d99082089e732cae82b04f44c5ca995b8` / `49b3cdace22d5ad48d9fa40e52493351648610dcf4080adb27d3fe1b4ce895c2` / `ef83ed5aad907da76297758da46c05aa535f957d265593bd0031efc2ac2c1285` / `d0fa83752d0a5d4a80a5d1b136a6f2bf3e326991b60c907520d32936731fc692`
- `native-matrix/Aurora-1440x900-own-dpr2-a2.trace`: `276322c935b7f4254609eeb44834d523624745caf8e1f97e62054c9e9aabe35a` / `57d5995650f30d8a7bb28e41b864d9d7ae3a0918b8f92517669ca171596e39aa` / `313d7bf9ae7c84561352b77b6d469e7d11779deb0c3209a582c47c6f2b69a98f` / `6deed531057b7c52f962472af257a75cc62bb5f1d6bda04afde47b86d8769293`
- `native-matrix/Aurora-800x500-own-dpr2-a1.trace`: `dbb541668b4fcfe42daf96680fc57e6d2fd323d4275016f5e5911538cb8b74f3` / `767c9d6fe006f9f36dde765b2f330f0cdc076b76552162779064a90553e118a2` / `89d99c3628b61a2124240a52fd4d75df182770d4eb2b0eb6d02ff00f7afae009` / `1c27e220e2d40e2524e10fd7d8e20616c086f639c9daf57ce8ed5f641d72e12c`
- `native-matrix/CircularFluid-1440x900-own-dpr2-a1.trace`: `61d1b6649abcf8be0a468508379e1c2d893db503c6738d960752008d1dc2de07` / `21f3994f14c517d23bba567bbdd6c0b7c3cda50ecce0ba02ba5b64ed660c01ed` / `5a5d1e26ad1eb6465b774fa225d70834dd72913339e4ee6be42e873479116225` / `83041817e98ce7cb806471b0f7bc34147e37ae058b4ba379595fedcbf1e53d29`
- `native-matrix/CircularFluid-1440x900-own-dpr2-a2.trace`: `25b87eb22e755fadbc4bc29e14e35be8f670526317a259347336fc3546a8d277` / `6e8e43aaf748ee92d040f64afa6351764dc5052405c87120f59208068ade27f7` / `959e5a025ea8f4a63a056fa8c610747da36a8ffbd25d182ca654f91d39007ac7` / `892c445bf43e26dc233802271961077a66f285bbc68d61af5fa0f09542f5539b`
- `native-matrix/CircularFluid-800x500-own-dpr2-a1.trace`: `c3372f38567b3dbd760ea01a02d8fa49ee968fbf1d03957a37f443f2d8bd6345` / `de7847a935a03ab9a747b2ebf68a90d8164488aef7d80a575a614655d66e686f` / `78d437f33e04311821a6ba7589c23ddd1caf243ada92928f83d44a07b57e7c52` / `057798001dbe429b64fecbfb1c442b9deedb63ccbcf7b046dfd6f3b6ef9168ee`
- `native-matrix/FrameFluid-1440x900-own-dpr2-a1.trace`: `5ad617a84dc6aec3a456e1e7dbe3f567c7b6a333e9ab97bf706143aa75ba9ca3` / `cac875ad2f39f6de64fe8ff52c85aa90546679a03f899cbf21be5ed8a9fc52c6` / `c4f47232896302c8a1a0a935570494dde9d85e5944b114ce554d3a27fafee00e` / `e21ec3553f40fb3e39b2f3015f150670dcf4091b44e87ec2d80f466afc943d62`
- `native-matrix/FrameFluid-800x500-own-dpr2-a1.trace`: `1d1584ba34bfb1f1f7d81963acdb74fbb8868c2d1a2ca24f7828edd15ee3943d` / `7b35a5c333744d2372128e8bd212106d616fd6ffb1d3dfec38af4592d7a36993` / `b0dabdfef96d62e439fa2d983f0f4d107dfffcf7cce862f254afaf9bf68fd6d1` / `6118f0a5603dcca1821eb8b91664113f64ec3740587167fb702244a233902071`
- `native-matrix/FrameFluid-800x500-own-dpr2-a2.trace`: `bc2c3f368471f61ff3a58f59615ba222f19a829c7102ed4d0a914b21e56f174c` / `43c84526b8da354d212133383b211512e4e8cf98173d449889fe26c9bb03d82f` / `3a848c2842c32efc7e297cd1dcd669a191aea05b3e117428567e10b338a4e9ad` / `7d545d18a625510b9a4e4647b62b679c7de713d41522dc8664ad37f3f183d51b`
- `native-matrix/AnnularFluid-1440x900-own-dpr2-a1.trace`: `faaa578f0bbd41667d225f4feabfdaced76ed6dcbedad8f7d8a0a56506db68c1` / `39ac2b82a7ec7a353ec5338c722d4d41306b9e975030f0d4fac51d16525f47d3` / `099b80cbef17b259dde911b0181b80099d1899bfd65d06b84695ffed1edaa50a` / `9c4cbef1762fc808939f8c9a69166d51817f54ba2df0ae390abd764c387caf6e`
- `native-matrix/AnnularFluid-1440x900-own-dpr2-a2.trace`: `cb8e4f819bdce95ff8f4b0cef50c7b2ac7e980ad750c627b7fede59005ab91ce` / `2b64189922f0e33511692827a62add70dcac1c45d1a713d9b7c994646160428f` / `c3466a901098679af4e0ae146a64e8bbb55e31e52e978d536376933f64307d93` / `2fc218d758f22ed56f47a726011b2de7854ffcedd66cb247ab663e07810947a8`
- `native-matrix/AnnularFluid-800x500-own-dpr2-a1.trace`: `51923d4779f997f2879ea41e412307e0cc9a39db28a410e6105d37a814665d57` / `744bbc8633829ade7a60f5a6dfabeab39c2383c4cb4a379f62c35c81980eef46` / `0dc027524d57fdc28da63298fac022c04d1146cdd28c3cbe54ab85658a41c271` / `070bb76ca8319aee42b58b97992ce29938ddf8716ab59c477ae0867963f0b201`
- `native-matrix/AnnularFluid-800x500-own-dpr2-a2.trace`: `fe8403163c699c500fc736623f0b9ea73be7e6f67b5bc9c9d4dde451e12722f5` / `23cda8c425f871e9e20e79344df9da4973ff9a51fc69f98bc639aa926b86482f` / `1ef9e967b69e403280638e5da89c7b04666f8d68a0e0d4f752d7bc6f602ec400` / `fe3504e2f2e0dc7cf4ae0cdb77f831b0bdc27083986ea32180aba58c2033d4f0`
- `native-matrix/SvgPathFluid-1440x900-own-dpr2-a1.trace`: `8b22f88acda67e7c14def878c9d94ce2b969125c7ef1beec5ee5006ef69977ff` / `8e492357d83f2ae5f82a5b3c494acedd190e7cdd91e9203133c2c3e0c7688daa` / `17438f6cd9cb30e7559041f26dbf03508578728ed34781f6b1a973ef546cd62d` / `44c7edd26732480a37ae8234971798e0b68bec3c10f270923d9bb194a90ea246`
- `native-matrix/SvgPathFluid-1440x900-own-dpr2-a2.trace`: `f7e61d36413bbe6bd5256dea9b96c0219dcff6f5ef17d27a55c8b187d8316b9f` / `64ac815357e04ad80ab9ec5a45f6ac987e1580d0c701310fd0f84b3cacc3ac4c` / `148ebb3dccc247d0766e9a52544e601640a7777192f39a0e6b31c9410385cb87` / `db072530c6be644d1a287d5f4bb80978027aafd48d1916bc1f7862a4c497cd20`
- `native-matrix/SvgPathFluid-800x500-own-dpr2-a1.trace`: `d8e9097ffb8c405dbf7c23511be385cb374a6aef8625c23baf3bbb0cbf5e06de` / `1684a7b7b2eb1d236c7f83c1b73c84e4f1124fc6349c3b351e548e9e42eb3ed8` / `3582a98ca711fa9922fe49a5dc1997918928d054f39d97c4067758dd3f20b71d` / `2a45c8c2149c6fd8145448ca9894aa4aebd5d35ba3d86c828456bfb0a2b75d6b`
- `native-matrix/Toroidal-1440x900-own-dpr2-a1.trace`: `a6348d3d8f22991815d08f2654a48371667132d5e53251c0247d9ed8f26a3822` / `6fa7d34f7bc6294dd497ef4d2df20386b38f7aebf7257c298fb0e87d268d539e` / `bcbfc82376cf7c2e4d843b01d0ee851d79e72c96a9cd58d155e26b1de457f3e2` / `ac8cd007d00b4053d3b39b26485b3c3e6150e3bde1673467a38bdacdc03c92ea`
- `native-matrix/Toroidal-800x500-own-dpr2-a1.trace`: `6af6b8046fc2e941c5c6d38e0572dcc24ca3ba3b3bfd39d9b0b569895e6043e1` / `cbebd5279d32a7855d2211a2676e2fadfaf891c68785be0e61572b7fe2c99487` / `0dc3409a6cf3654717e89a06f1f4761cc1bd20d9736b73535d0723131ffcb7ca` / `9bbc50b453a6f348ea8e097a7b5ffa3765506da5bc05650f5e869fddd4284631`
- `native-matrix/Toroidal-800x500-own-dpr2-a2.trace`: `2f4f2d0ad70cbea42e673e9a26d6b705661567e34454462ec89f91090034ed82` / `806edb12d9ad40fcbbfb8bfe8b315d1d40c0a2fc64e09f3dd56522cc8a8cd12d` / `f431da58f78094cd9a9b87d4e86dde73f2ad9fd3d7689606495fa8200349b10d` / `4adea9cf88bbeae1d6788ce3cdb142c9247469a1f5c653085d0156d7f67870ce`
- `native-matrix/GasFlare-1440x900-own-dpr2-a1.trace`: `9568c326458bf4606e1463b7d4088aa365f248c331a073304bbe87bfc820fe7d` / `5cec02a2d32d27292eb9fda20ed7e0295f424289b0504731f668d49264a220ca` / `b80850859f400815e015de9c00ece001a849f2c111ac8b371f674ca516113495` / `043bca1bacee3ffad33703b775c3a8242ae1da236595ebd3c8572cce6076befc`
- `native-matrix/GasFlare-800x500-own-dpr2-a1.trace`: `cbc1e775ab7a679ccd41cc0308e6fb635d728f849f8bb4d02201fe8e84e12c42` / `a760645e2786016324c179cb4291043f086483b1efe8d1f5987981d19253ab8e` / `712871d1c5b41902374e2a5bcf4d928288b00d997aaef23d11f397236063ec58` / `775c98954c65b12a03b0001c9368447399411f5db947b1ac4af8db5b9a122ea0`
- `native-matrix/GasFlare-800x500-own-dpr2-a2.trace`: `0244643d85e0b778ecb21d9d9f92f0c78413771a250d5f7953bc5f2f023da2a0` / `fc1444bfb1e5ff83daa9e90386e24d9f5b419a343599b13ec3bcfcf73687f3d6` / `1c0753d322f68c05753eaa1e5a02ee4306620e04dbc1d41601856ed45da59deb` / `da920ef1587dfe8cdef3069577fb0b5582b37093d0bdb4756ec6f1f604772dbd`
- `native-matrix/Venturi-1440x900-own-dpr2-a1.trace`: `77c6a1e7cfa360d2cdaeb41d3e8baf4a4080f068cc3ea9c70fe168f0db6d2ce8` / `20f6e06602659a76e1c31d3775e3eab53932956e9a11b6ed4fbaf8dbb5de5833` / `7f2244990987cafb0739a5d7b61d1ac17740ca517b80b74593c0da03c64ad9b4` / `6d5cb75061e8e763ff70f226d20d0bddb5238bba76da17671783b509acdb2eeb`
- `native-matrix/Venturi-800x500-own-dpr2-a1.trace`: `7bf35299eb54e642119bf05e76ac85147d749da647c4460bf76958df986c7ec1` / `7ad3fab1f21e4de79141e6d68724f83d26b99f99caf2dcdb47000b03759258fe` / `18f487b9b931744c4428a0b2a69b05e856e48fee041250f0f123adab624f3102` / `2ed4f6f1e48a044252b41a6a08ebe5ae15a5a368a4f42e4a67f1b1be0328d9b6`
- `native-matrix/Venturi-800x500-own-dpr2-a2.trace`: `4ffd9762bcdea4d835473bfa57078e61dc90fba594533a00c04e4d24f5c9f745` / `639fc750d1b040f80287d924bcf872b5e33c392dbca6598ce8b2cb42e303cae5` / `18cc3cc81cfc7a94530521e7a52ed64b077a27f9d01e403fda807bc44790183e` / `c5eafe899797bb4c8827bff0cc3af33e799660c822cc7c7ce08bd48497859d18`
- `native-matrix/Karman-1440x900-own-dpr2-a1.trace`: `8940bce97e98eacdc63264e4a493f575c941c04892afdb16e441ec41b3714204` / `b7e0b52d54b574166185ffd883da484d0bcad89d4376ca140f30ad0b1842e24e` / `81971da7a616b883862c79c1732696a0e9bfc9beea13ba01d6f87dba25d78ed3` / `62adcc7af9a9fc6b9411c5129f82775ff64a507aeb3960cd0ce5c745717534d6`
- `native-matrix/Karman-800x500-own-dpr2-a1.trace`: `005f62a5684ee58a4708cc33b2d7233e9f5c274100f4305c393b5217486c876d` / `60fecd57176ef034057c20610141cdfef1b02c62be0fe1ce6a97a22b9459fa55` / `76446e6dfdd4632fe3dc53402fc433e37af155a82820cb0432ac681c0b2c561a` / `b1cbcc6868af9f6b4266e57f0cbef851ceda7f8165b47e121cd13133c6578054`
- `native-matrix/Karman-800x500-own-dpr2-a2.trace`: `34faf7db3e7a62915e0793ddfba6c8a465f0eb405d74deead071d47b87f8502e` / `94ef0adf22133840aca89ae6ecd3eabc340ea25e8c51939407a4060407e49d52` / `54084eff3eca908f8873c04dfc7d6b95a0a75c0f389f935d77c7165ff94e75b2` / `23030b223d23329816288146720de2eabd5195d731a0c7ad17ac951850be7abf`
- `native-matrix/TeslaValve-1440x900-own-dpr2-a1.trace`: `22ed46cb6b3d79d35187d1bbc327de29d79926841ac02546984047d66b3dba2b` / `6ef432248e073a6d441ad6dbf49bfcf8379a199986285603ff3d40bfb8cf0b8b` / `8f04d9be57921060e038cefa1be11ea7d1916db859a9c3ba37b6fee29c5450e3` / `f8402e409db81532dd803a0bd263abca8976d6d5be0b0f90c5333daf8d60f01c`
- `native-matrix/TeslaValve-800x500-own-dpr2-a1.trace`: `38b4324b8e8964c444025d9ed67cc166d55fdc2a9d206f784a094404137492cf` / `b7009cc95c31a40401714d4184d7a5dd50f2d0b468df92dc8d706280038971bb` / `b23efbb072a7c14dcc63374a29a418598cca57231fd90d471ca6af2eea88d6bd` / `23d480f022ffb0831875fc85bb4cd2603937fb492411fce8b4e92a289eda7b95`
- `native-matrix/TeslaValve-800x500-own-dpr2-a2.trace`: `cacf0d7a632808f3da1bd21d9e690031aff8273769a55fb6444854c91c967fd6` / `9d84d1c0f0cec10d8f8d6b35a26006b160820cad3286cc4e9720479bb61b3884` / `e8db92ceb5d738fdb66a58a8875a12e852683eb982c33547ada8de39bb58e749` / `ef921b78d0d176e1b511ae02f9122cc0b8fd138be9757175547ccc9ace8b3fb2`
- `components/Karman-1440x900-shared-dpr2-a1.trace`: `76727b05ebf5df4e59f50fda8831769e8a7415211b14094da660408b64bb330e` / `01c975e28690e1b32a2f7a046afadb2f589e1f1e19c344d0cb5f356dae7010aa` / `cd259f9124d72a3a4d95530d02984aad942f8da72e262d5e81600d4d64d26d45` / `37f6eeee41cf80f0d15399ccc938ca88b1c42043e5166946173fe18f7f45ca5a`
- `components/GasFlare-1440x900-shared-dpr2-a1.trace`: `d8e57a03735cf224ba760dee909bc6eadc73ec395710f63650dd889fd0bf3845` / `c39ef6cf7d383e28a4577de736454c43b69f9ea75e8de6825fa27b57d5dd4d69` / `73ad540063d9e7441ac4e51bec0aed661f88da0541b2f43bebff1dcca6f9cd7f` / `e390e9ceec1be441b4871f9c48dc4344a3424c59e40b343e0593252e1bd9ceb5`
- `components/LavaLamp-1440x900-shared-dpr2-a1.trace`: `d4ad9024d8803052934556c3cc210b6b565ec3d4d6e098b3ce763cabfc17a78e` / `8ff200de57c22406dee229bd8947b392f423e4807f45051683a09b1810d1aa66` / `b46fb69bf7b859210b2d7c5e5a06acb69ba5fd7b86e439fde4e06f1a440bf6e6` / `b0fb2cc2e09844d4de279dde5b00dd9374b8f133be0f61bd6091ece829c887d8`
- `components/default-1440x900-shared-dpr2-a1.trace`: `e4453fc3676e796d43d4b4fc237299d7e7e3c691892499f06ab648c34060414b` / `c1fc71697bb90fb54fbd0963d8df0471578c4c9dddbd8da23eea2d24ea310594` / `a453fcfe5d50b02f3397c790f1033c80dfa3a77acf313fc8740dc683f227b12b` / `0aec2b445e8ec904aa8b42f9972c8117caa4bf43316153f067e1264ebff2b1d3`
- `components/Karman-480.25x300.5-own-dpr2-a1.trace`: `8354ffc36c11959dfb39e72a6072bf3454a3ac666e835c8488093ec5dfe1be0a` / `7b66a0100524b1a9932fd3edd89f56cf2c46fe79199f2bc7e6f5e970ceb4e2a7` / `2c2374ece5a948ab01d29a3cd69e77f51671495a5cde8600955625358f696bfc` / `6f82a360f38c4ba6e8626eb89d0c0ec92de9ff4cfea6abc265e663c2bd8578be`
- `components/modelbutton-232x68-shared-dpr2-a1.trace`: `e1a0ff21af316c19a732292811d37eeb5e42f34b4ef83b2a51b4668e0975d80d` / `75b1368a462f8309542fad1c2a431e5532a94088e3774fca2cf977c618d25dd1` / `7955a4fd72225f9f06d8f7dbd6c489c3c9600626fea432f3fd4e117bfac73086` / `2a1cd9113a8415683bb18d9eaf66a800f8a249aa7d909ef03eae79912164c6f1`
- `components/modelwidebutton-492x76-shared-dpr2-a1.trace`: `acb8d29eafb998cb03c585d8a4d379dc4c4dfebcf1451f0536d51843d4cf6403` / `9798d89e3b9275e2638653b3e421ab2933b36d73372fb1f172f86fc0021d7e9d` / `d030c6200a389816bc81893e0eda4d3fdf2ca658f86c2291a35ff4a9d1fa3bf4` / `56934c6b6342e6d7ca31b56db6761558c3f95f924b09ca75de0287b84326233b`
- `components/modelsegmented-372x68-shared-dpr2-a1.trace`: `8864fe5d02a6af938812760ab9b6d971138a1ec5c7f6ac2290ff16f79e7b07d5` / `694fb6cece01b2483c049a7d7193f00dd598dd1fdb69bbb62925a22632d18962` / `2068420b1d5b6f0e6f45ddbe09b8084f369d06a6c836d5d8a7c0e75326fa1121` / `4c140502f52f8332c15c380fd06f4610d583b0a68716ca251ce5fc009032007d`
- `components/modeldropzone-492x212-shared-dpr2-a1.trace`: `6d433e8baa8fd75c0576db779a494c2674a701e366cef36ade3aef8d505cd3d2` / `be87d018eb731f5fe2b4189a48cd0bb9d31c72f2f22762d7a70ec3eefa1ae614` / `b691c10f8d59e05ff46d176e716519110ce569be52d942d41511f890bb17acfc` / `408ee6e5178fb89c1ad1af2fbfb4a28fd178b61fc7ab7337a6b5cf48ffd4262e`
- `components/modelcaustics-720x400-shared-dpr2-a1.trace`: `7485d758c24f0ecc9f77bf89c3fc085b71f0d91bd477064dd29f7df16092ddf4` / `9acd5e6d1ece743e40352db5f9ca76dbe0151ba7d61c1ebf0941ab83a0c3e285` / `7f575b857dbeb8dace6ec6f474a7ca7d78605486cf020cb85cdae5781877b5e5` / `51fd3230ca5f613395f243d403b750dd92a450ea3f2a3cbbb3b0313b96c76045`
- `components/modelenamel96-1x1-shared-dpr2-a1.trace`: `82d1846233853dca9df4c9e00a4e65d76af2f027aae1fc419ac3882608b26e1f` / `27fb618d5236d61fff1e8ce737f1ba4f5b52d174f9fd9aa2c69baf5b68b02569` / `ba008e9449933fee6e12624f2fae300d4f3f28916badee4de69b5c0fc973280a` / `477e4960398d521816bbb790d7c049de9b52929efd1d21246164ec7caa14529c`
- `components/modelenamel64-1x1-shared-dpr2-a1.trace`: `92f6dbb644c600cb7a0af0c6ab9be99cc92b3f7c534009a47bdbb5652cac6b73` / `0ffe5b47bed2d703bdf7c737a37111a9a5b972dc4a8e2e8e87bff802628f3a1d` / `2d81593155d16c8028d01a2249c8626d42504b51bfa54d4122a4e5ccc3704c1d` / `8dcbaf5b800a72b6a21607e7540d8a9475f39caab1f04a39a8a69191b9a75402`
- `components/modelenamel64-1x1-shared-dpr2-a2.trace`: `c2b890ddd0d25132887d806751bce11ccc399bb0a96d14058bad3bf2cc7056bc` / `d3258ecb2415b95861f82c19ae58d21ecd850b5b592c38622b3fcc20c8cec202` / `239b5abc505f4e783d1b95863156df23254d1dc7677873508f40ccdeb630686c` / `a7c7288e7095bc09c82db5e6c78fa5c38e26f3e4f0116e71f49a2d53f6af8ecf`
- `inkpaper/modelinkpaper-800x500-shared-dpr2-a1.trace`: `47143dfb0a8f5d038ccdb6c2e80c5f0b7e6f38a59a5512be03ae82b811d1e926` / `3a88c6f5ca6a72c474ee2cd7473b5d56a11c8db4f1f8e52ddd4f401fd2ca101c` / `e7dea3c8f531dd71a989b8474550c175b8bc0669b88131b92aa505cd15ad3553` / `b62b04f4a881fe2a37d3f1b75c8fc15ebdcb047c0a3d0fec89bf4cd317b6dcf9`
- `retry-attribution/CircularFluid-1440x900-own-dpr2-a1.trace`: `44cf16e9cce281c51d7274306c1f2a3fe6f02af1460c4454bcf0e1520dfe8244` / `a7bad2a8ceebcef26f726c67d7aa748d0ac6ce433e03ecab48f43bc92b871be6` / `10f47f50b15890ed0f0bf037b39db7f6f90d00c3712ec1cb7bbc45ae7b73ddd3` / `d247ca3ae1f828c294e2287983217d1ce1d6bed0f4bed22ea471550a17e69e27`
- `retry-attribution/CircularFluid-1440x900-own-dpr2-a2.trace`: `35e3e1cf09b987ad63736f92ae6b138b641050f239c9ef8fc2c99366d706d4c9` / `f251ebc3f52c61ad060c618b20d60148e8de2f47bef642e2375493cd130283c4` / `20ff66b0640b83c091757d5561b96380a49746133175f58d4bce6efd8a787305` / `beaa8dff891dfa52f80cb1374e27306af6160d7fb682012e9606cfa2675233ff`
- `retry-attribution/FrameFluid-1440x900-own-dpr2-a1.trace`: `8f89ce340827b9017fbe2ec5f640e317da1dd2b75df3f8a6b04be6a72ac011ae` / `5cbf69bfe5a72e2e327a92c3fc7d3084972e9fff5ace4f82b35257968ccf2c72` / `06060a3d4c4a44bfc3f15a1033205b04c4bcf41705c7e030ccad7f03dbba4dd2` / `fb321ab2430838826514c4225b33da2736ca886c8f3f899ddb690cabbc9ecc3d`
- `retry-attribution/InkInWater-800x500-own-dpr2-a1.trace`: `52b16280a2d680565174c1b6fa3b639fd4f0f6c0c33cc2e1e73108086e1e6725` / `0606887bc2069c274c1d3b47fe2054055c4f70e49ba941264bae55a0ce044546` / `38d3cc10f9031c305a7ff6ead9769e0c0acdf44aba357c9f885d493660639c7b` / `ae652a2408245f046a4e77336efd5c8006f1f0d9d0bc71cc60ff1e70711122d0`

Trace duration range: **2.987–3.787 s**.

Earlier exploratory runs (wrong Playwright-probe DPR1; missing final own-tier frame;
MLX-contended trials with zero/merged frame attribution) are excluded, not budget
success evidence. MLX pids14378/21939/28157/32792/77371/79117 and original Chrome4411
were never signalled. Hot-pass diagnostic traces are not scene-verdict repeats.

### Checks and cleanup

`bun scripts/gpu-capture.mjs --self-check`, `bun run test && bun run check`,
`bun run prepack`, `git diff --check` passed after script changes. No installs,
tracker writes, push, merge, publish or runtime edits. Hardware capture is the
browser evidence for this docs/bench-only lane; no full release rerun claimed.

Every owned Chrome, xctrace recorder/export, notifyutil waiter and Bun/Vite server
was closed by its handle/PID. The interrupted wrong-DPR run was closed by exact
owned PIDs89020/89031/89032/89085; export91973 had already completed. Final process
inventory contains no `gpu-capture.mjs`, xctrace or port5198 server. User Chrome
pid4386 / GPU4411 left alone. Worktree retained (not remotely preserved); untracked
node_modules symlink retained, never staged. Traces retained in /tmp only, no live
profiling processes. No cleanup of shared/unknown resources.
