# GPU budget (per-instance frame time)

Evidence for the 1.0 bar "< 2 ms GPU per instance per frame at native DPR".
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
