# GPU budget (per-instance frame time)

Evidence for the 1.0 bar: p95 GPU execution per instance per frame <2 ms at native DPR.
**Owner changed the target on 2026-10-06 after seeing the native Metal results**
([ADR 0101](../decisions/0101-p95-gpu-budget.md)); it was not pre-registered.
**Current post-optimisation p95 verdict: 18 PASS / 25 FAIL**, 43 scenes, native DPR 2;
[full two-invocation matrix](#post-optimisation-full-matrix--2026-10-06). Only **15 PASS
scenes have two clean independent repeats**; three PASS rows lack a second clean
repeat. Goal remains open. Historical [re-tabulation](#owner-adopted-p95-verdict--2026-10-06)
was 28 PASS / 15 FAIL, not all-repeat seed-5 certification.
The original strict-max verdict (18 PASS / 25 FAIL), measured numbers and
[ceilings below](#native-metal-execution-measurement--2026-10-0506) remain unchanged as history.
Earlier wall-throughput/UNCERTIFIED sections remain historical evidence.
Harness: `src/lib/engine/__benches__/gpu-budget.browser.test.ts`. Measurement,
not a performance gate. Decision records: ADRs 0089, 0093, 0099.

## E1 round 4: pressure residual diagnostic (train only)

### Pre-registered protocol — 2026-10-08, before any GPU run

Measurement only at local-main `e104fcd`; no production solver/default change,
ADR or energy capture. Fixed train set: Plasma, Karman, InkInWater, Aurora,
CircularFluid. Own-tier 800×500 canvas, registry config unchanged, pointer input
off, seed 5. Warm 180 fixed-1/60-s production `simulateFrame` frames paced by RAF
(about 3 s); capture immediately after production divergence, before pressure,
at frames 181, 196, 211, 226, 241. Normal registry projection completes each
frame: Karman still warms with 34 iterations. Replay each identical snapshot
through production `projectVelocity` at counts 0,2,…,20 and warm-start retention
current,0.9,0.95. Store previous pressure plus its separately decayed R16F image;
replay uses raw previous pressure because production folds decay into its first
Jacobi inner level, without an intermediate R16F decay store.

Residual uses the production nearest/clamped pressure-neighbor operator,
solid-center exclusion, solid-face center substitution, sticky forcing:
`L+R+B+T-4*C-divergence+4*stickyVal*stickyPressure`. Evaluate in highp into
RGBA32F, not a second fp16-rounded Jacobi update. Post-projection divergence
uses the production divergence shader (including open edges/solid faces),
read back from its normal R16F target. Report residual RMS/max, divergence RMS,
velocity-component error RMS/max over fluid cells, including clamped edge cells.

**Primary equality (coordinator clarification, fixed before data):** every
projected velocity component differs by at most one fp16 ULP of its reference
value; zero/subnormal ULP = 2^-24, normal ULP = 2^(floor(log2(abs(v)))-10).
Downstream passes consume stored velocity. Before running, the coordinator
specified each preset's own registry count as its primary reference: Karman 34,
the other four 20. Add count 34 for Karman's reference/fallback only; retain the
complete requested 0..20 sweep and separate 20-reference measurements.
**Secondary:** residual RMS/max and post-projection divergence, compared with
the current-retention registry reference; no secondary tolerance silently added. **Also report literal strict
floor:** all absolute residual RMS/max, post-divergence RMS and velocity error
RMS/max ≤ corresponding reference-vs-identical-rerun spreads. Bit-identical
reruns give zero floor; a nonzero reference residual/divergence can therefore
fail even at 20. Also report no-worse-than-reference secondary equality with
those measured spreads. These separate gates must not be conflated.

For each snapshot/retention, report the smallest equal even count (none = ∞).
Per preset take the median of its five counts for each fixed retention; report
all retention columns, plus the best fixed-retention median (no per-snapshot
retention cherry-picking). **Lever viable only if that median is ≤12 on at least
4/5 presets**, i.e. ≥8 of the 20 iterations / ≥4 paired draws redundant,
approximately ≥8 GPU-ms/s at 60 Hz. Otherwise **lever not viable**. Literal
strict-floor verdict reported separately; disagreement authorizes no engine
implementation. No held-out scene or 1024×640 canvas; no xctrace, unsafe flags
or software renderer. Hardware renderer string mandatory. GPU lock acquired
atomically, held ≤12 min, released before CPU checks; any reacquisition observes
strict alternation or five continuously free minutes.

### Results — 2026-10-08

**Lever not viable.** Zero of five presets meet the ≤12 median-count threshold.
No tested smaller count is storage-indistinguishable from its own registry
projection; no engine implementation or energy round follows. Karman's untested
22..32 counts cannot change the ≤12 verdict. No fraction of its 34 iterations
is certified redundant by this bounded sweep; it is not a proof that all 34
are necessary. This diagnostic does not establish energy/power savings.

Hardware headless installed Chrome 154.0.8037.98 (UA HeadlessChrome/154.0.0.0),
WebGL2, renderer
`ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version)`.
Canvas 800×500; registry seed-5 workload, five pre-projection snapshots per
preset after 180 real production frames. 25 snapshots, 900 diagnostic projections
(including references/reruns), six browser tests passed. Only train presets
ran; registry imports containing held-out definitions do not execute them.

`∞` = no tested equal count. Every count listed was identical across all five
snapshot times; the count is their median, not a best snapshot.

| Preset | Registry iterations / retention | Solver grid / fluid cells | Current retention | 0.9 retention | 0.95 retention | Best fixed-retention median | Certified saved iterations / fraction | Literal 20-reference floor |
|---|---|---|---:|---:|---:|---:|---|---|
| Plasma | 20 / 0.8 | 205×128 / 26,240 | 20 | ∞ | ∞ | 20 | 0 / 0% | ∞ |
| Karman | 34 / 0.9 | 307×192 / 57,050 | 34 | 34 | ∞ | 34 | 0 / 0% | ∞ |
| InkInWater | 20 / 0.85 | 205×128 / 26,240 | 20 | ∞ | ∞ | 20 | 0 / 0% | ∞ |
| Aurora | 20 / 0.85 | 205×128 / 26,240 | 20 | ∞ | ∞ | 20 | 0 / 0% | ∞ |
| CircularFluid | 20 / 0.8 | 205×128 / 10,436 | 20 | ∞ | ∞ | 20 | 0 / 0% | ∞ |

Requested fixed-20-reference sweep gives smallest primary count **20 for every
preset** at current retention (Karman 0.9 duplicates current). All other
retentions give ∞. Thus fixing Karman's reference to 20 would not rescue the
lever. The secondary no-worse-than-reference plus zero velocity-rerun-error
gate also requires **20 / 34 / 20 / 20 / 20** at current retention.

All 25 registry-reference reruns and all 25 fixed-20 reruns are bit-identical
for pressure, velocity, residual and post-projection divergence. Their measured
RMS/max repeatability floors are **exactly zero**. The literal requested
absolute-floor gate fails even at the reference because its physical residual
and post-projection divergence are nonzero; it rejects every count/retention
on all five presets. A repeatability floor is not a convergence residual.
The primary and literal verdicts both reject; no tolerance was widened after
looking at data.

Secondary metrics below are medians of the five snapshots, current retention,
compared with each preset's registry reference. RMS velocity error uses both
stored components; max uses the largest absolute component error, not vector
norm. Residual is the highp production-stencil fixed-point defect; it is not
assumed equal to post-projection divergence. Lower divergence at a smaller
count is not convergence proof for this collocated operator.

| Preset | Count | Residual RMS | Residual max | Post-projection divergence RMS | Velocity error RMS | Velocity error max |
|---|---:|---:|---:|---:|---:|---:|
| Plasma | 12 | 0.276133 | 2.687500 | 3.133087 | 0.202494 | 1.937500 |
| Plasma | 18 | 0.195250 | 1.511719 | 3.151765 | 0.038252 | 0.312500 |
| Plasma | 20 reference | 0.179471 | 1.308594 | 3.155327 | 0 | 0 |
| Karman | 12 | 0.433911 | 1.127930 | 0.581706 | 0.103722 | 2.171875 |
| Karman | 18 | 0.432781 | 1.106445 | 0.585780 | 0.068711 | 1.125000 |
| Karman | 20 | 0.432626 | 1.139648 | 0.586618 | 0.059431 | 0.890625 |
| Karman | 34 reference | 0.431762 | 1.126953 | 0.590056 | 0 | 0 |
| InkInWater | 12 | 0.026236 | 0.519531 | 0.217695 | 0.016308 | 0.312500 |
| InkInWater | 18 | 0.023719 | 0.421875 | 0.221712 | 0.003741 | 0.062500 |
| InkInWater | 20 reference | 0.023126 | 0.398438 | 0.222540 | 0 | 0 |
| Aurora | 12 | 0.209251 | 1.708984 | 2.629897 | 0.155173 | 1.250000 |
| Aurora | 18 | 0.149246 | 1.109375 | 2.638975 | 0.029685 | 0.218750 |
| Aurora | 20 reference | 0.137247 | 0.960938 | 2.640679 | 0 | 0 |
| CircularFluid | 12 | 0.477035 | 3.242188 | 4.147227 | 0.326461 | 2.218750 |
| CircularFluid | 18 | 0.375089 | 2.250000 | 4.190553 | 0.063791 | 0.421875 |
| CircularFluid | 20 reference | 0.356239 | 2.046875 | 4.198661 | 0 | 0 |

Full per-snapshot metrics for every retention × count, warm-start raw/decayed
pressure summaries, reference metrics and measured floors:
`/tmp/E1-r4-diag.json`, SHA256
`e97d0a65796f77f1a8a4398c85578628d4a3028b0e73baf164d8ab23288f6ab9`.
Machine-local evidence retained; not a production artifact.

```sh
VITEST_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  VITEST_BROWSER=1 SVELTE_FLUID_GPU_BENCH=1 \
  SVELTE_FLUID_GPU_BENCH_OUT=/tmp/E1-r4-diag.json \
  bunx vitest run --project browser src/lib/engine/__benches__/pressure-residual.browser.test.ts
```

GPU lock acquired atomically 08:33:55Z, released 08:34:58Z (**62.9 s**); no
reacquisition. Vitest/Chrome handles exited normally; exact owned process
inventory confirmed empty. No other lock/process touched, including protected
Chrome PIDs 4386/4411/48063/48074. Node **882/882**, check **0 errors/warnings**,
prepack passed; existing import.meta.env packaging warning and unrelated
SplashCursor Vite dependency-scan warning retained. No library/default/ADR,
xctrace, held-out capture, 1024×640, memory, Beads, push or merge changes.

## E1 TRAIN framebuffer-invalidation probe — 2026-10-08

Baseline: local main `0433c88`. TRAIN only: Plasma, Karman, InkInWater,
Aurora; 1440×900 CSS, DPR2. No energy capture, held-out presets or 1024×640.
**Pre-registered cheap gate (before measurement):** median saving ≥15% on
at least three of four presets, also strictly greater than twice the A-vs-A
spread. R=4 invocations per arm, order A/B/A/B/A/B/A/B. Each invocation's
ordinary median uses the existing 12×20-frame synced wall-throughput bench
(after 200 warm-up frames). A-vs-A spread is the range of the four A medians;
B spread is likewise the range. Saving is median(A)−median(B), both absolute
ms/frame and percentage of median(A). Even-sized medians average the middle
two values. The gate compares absolute saving against twice the absolute A
range. Load is logged before/after every invocation. This is a cheap cost
screen, not GPU execution/energy certification.

### Draw inventory (audited before prototype)

Static inventory: 34 `FluidEngine` draw sites, 32 eligible, two excluded
(splat and additive bloom upsample). Dynamic per-frame counts include loop
expansion; startup splats and occasional input/auto-splats are excluded from
the representative no-input `advance(1)` + render frame count.

Every `FluidEngine` draw uses the full-target `createBlit` quad; no scissor,
color mask or viewport subset exists in its step/render paths. The shaders
have no `discard`. Listed eligible draws overwrite all texels, have blending
disabled by step/render/settle entry, use a full-target viewport, sample only
other textures. Ping-pong `.read` and `.write` are distinct allocations.

| Pass / call sites in `FluidEngine.ts` at baseline | Target | Full / blend off / full viewport / no self-read | Eligible |
|---|---|---|---|
| `splatTo` 1147 | velocity/dye/scalar `.write` | full / caller-dependent / full / yes | **No: splats explicitly excluded** |
| `applyMask` 3251,3262,3296 | input `.write` | yes / yes / yes / yes (`.read` sampled) | Yes |
| `settleReducePass` 3632 | reduction-chain target | yes / yes / yes / yes | Yes (ordinary probe excludes this stage) |
| `applyFlowSourceBatch` 4037 | velocity/dye/scalar `.write` | yes / yes / yes / yes | Yes |
| `applyFlowForce` 4092 | velocity `.write` | yes / yes / yes / yes | Yes |
| `applyFlowOutletBatch` 4151 | velocity/dye/scalar `.write` | yes / yes / yes / yes | Yes |
| `applyPrescribedGridField` 4194 | velocity/dye/scalar `.write` | yes / yes / yes / yes | Yes |
| `advectVelocity` 4252 | velocity `.write` | yes / yes / yes / yes | Yes |
| MacCormack forward/correct 4294,4326 | velocitySource / velocity `.write` | yes / yes / yes / yes | Yes |
| `advectDye`, `advectScalar` 4352,4383 | dye/scalar `.write` | yes / yes / yes / yes | Yes |
| viscosity source/iterations 4551,4571 | velocitySource / velocity `.write` | yes / yes / yes / yes | Yes |
| wall friction 4585 | velocity `.write` | yes / yes / yes / yes | Yes |
| divergence 4597 | divergence | yes / yes / yes / yes | Yes |
| zero-iteration decay, paired/single Jacobi 4606,4637,4655 | pressure `.write` | yes / yes / yes / yes | Yes |
| gradient subtraction 4665 | velocity `.write` | yes / yes / yes / yes | Yes |
| curl / vorticity 4706,4722 | curlFBO / velocity `.write` | yes / yes / yes / yes | Yes |
| display 4981 | canvas or supplied target or sceneFBO | yes / yes / yes / yes | Yes |
| glass 5070 | canvas or supplied target (sceneFBO sampled) | yes / yes / yes / yes | Yes |
| bloom prefilter/downsample 5088,5096 | bloom / chain child | yes / yes / yes / yes | Yes |
| bloom additive upsample 5109 | chain parent | yes / **no** / yes / yes | **No: blending reads target** |
| bloom final 5118 | bloom | yes / yes / yes / yes | Yes |
| sunrays mask/radial 5126,5131 | dye `.write` / sunrays | yes / yes / yes / yes | Yes |
| blur horizontal/vertical 5140,5144 | temp / target | yes / yes / yes / yes | Yes |
| `gl-utils.resizeFBO` 463 (`resizeDoubleFBO` delegates) | newly allocated target | yes / engine resize disables blend / yes / yes | Yes (not per-frame) |

`gl-utils.createBlit` 551 is the only actual draw helper; callers explicitly
mark audited overwrites. Allocation `createFBO` clears, format probing only
attaches/checks, neither draws. `clearRenderTarget` clears, does not draw.
WebGL1 skips the hint. User FBOs use `COLOR_ATTACHMENT0`; default framebuffer
uses WebGL2's required `COLOR` enum (attachment0 is invalid there). Shared-host
blit/profiler wrappers forward the explicit flag; no mutable GL state is added
outside `gl-host.ts`. Non-opted model-engine draws remain unchanged.

### Corrected results: negative; no production change retained

Eight browser cases passed: four TRAIN presets × own/shared tier, seed5,
120 real 1/60 s `advance()` steps. Velocity/dye/pressure Float32 readback bytes
and final visible-canvas RGBA bytes were **bit-identical**, zero changed bytes.
GL errors absent; canvas readback nonzero; blending/scissor asserted disabled
at each eligible draw. Representative step+render counts: Plasma **30/36**,
Karman **39/39**, InkInWater **26/32**, Aurora **30/36**, same on both tiers.
Six noneligible Plasma/Ink/Aurora draws are additive bloom upsample; no
synthetic input splats in the counted frame.

A first invocation set is **VOID: harness error**. Both arms accidentally
used constructor invalidation before the A per-instance wrapper was installed.
Do not use those numbers. Corrected A suppresses constructor hints, restores
the WebGL2 prototype in `finally`, then omits hints on every blit. Both cost
arms use seed5. Only the corrected complete parity+R4 rerun below informs the
verdict; gate definition unchanged.

Installed headless Chrome, renderer
`ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version)`.
Corrected lock window **09:04:21–09:05:50 UTC (89 s)**. Strict alternation:
first release 08:53:10, other E1 lane acquired 08:58:31 then released before
this acquisition. Both owned locks released, all browser/test processes exited;
no other lock or protected Chrome process touched.

| TRAIN preset | A median ms/frame | B median ms/frame | Saving | A range ms | B range ms | ≥15% and >2×A range |
|---|---:|---:|---:|---:|---:|---|
| Plasma | 1.5275 | 1.5175 | +0.65% | 0.0350 | 0.0250 | Fail |
| Karman | 1.6675 | 1.6850 | −1.05% | 0.0300 | 0.0250 | Fail |
| InkInWater | 1.3625 | 1.3450 | +1.28% | 0.0100 | 0.0500 | Fail |
| Aurora | 1.5275 | 1.5225 | +0.33% | 0.0350 | 0.0350 | Fail |

Invocation medians in acquisition order, ms/frame:

| Preset | A1 | B1 | A2 | B2 | A3 | B3 | A4 | B4 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Plasma | 1.515 | 1.515 | 1.540 | 1.505 | 1.505 | 1.530 | 1.540 | 1.520 |
| Karman | 1.675 | 1.690 | 1.645 | 1.665 | 1.670 | 1.680 | 1.665 | 1.690 |
| InkInWater | 1.360 | 1.355 | 1.355 | 1.335 | 1.365 | 1.325 | 1.365 | 1.375 |
| Aurora | 1.505 | 1.530 | 1.540 | 1.495 | 1.520 | 1.520 | 1.535 | 1.525 |

`uptime` load averages (1/5/15 min), before/after **each** corrected bench:

| Invocation | Before | After |
|---|---|---|
| A1 | 26.04 / 19.76 / 17.72 | 26.29 / 20.01 / 17.83 |
| B1 | 26.29 / 20.01 / 17.83 | 24.95 / 19.93 / 17.83 |
| A2 | 24.95 / 19.93 / 17.83 | 24.66 / 20.02 / 17.88 |
| B2 | 24.66 / 20.02 / 17.88 | 24.37 / 20.11 / 17.94 |
| A3 | 24.37 / 20.11 / 17.94 | 23.18 / 19.99 / 17.92 |
| B3 | 23.18 / 19.99 / 17.92 | 21.38 / 19.71 / 17.85 |
| A4 | 21.38 / 19.71 / 17.85 | 21.27 / 19.72 / 17.86 |
| B4 | 21.27 / 19.72 / 17.86 | 21.31 / 19.80 / 17.92 |

**Rejected: 0/4 pass, requires ≥3/4.** No energy capture or Proposed ADR;
no E1 GPU-busy ms/s reduction claimed. The hints were exact but cost-neutral
within the observed spread. This does not establish ANGLE's actual Metal load
action (not inspected), only that this lever failed the fixed cheap screen.
Prototype/parity/bench wrapper archived locally under
`archive/e1-invalidate-probe` (`898d58a`); `src/lib` and `vitest.config.ts` restored to
`0433c88`. Machine-local raw evidence: `/tmp/e1-invalidate-probe-valid/`
(JSON batches, renderer, logs, load), `/tmp/e1-invalidate-parity.json`.
VOID set preserved separately at `/tmp/e1-invalidate-probe/`.

Prototype and restored baseline checks: `bun run test` **882/882**;
`bun run check` **0 errors/0 warnings**; `bun run prepack` **pass** (existing
bench `import.meta.env` package warning). Browser dependency scan reports the
pre-existing absent splash-cursor route import; selected tests still execute
and pass. No new runtime dependency or public API change.

## E1 round 3: four-iteration pressure batching rejected — 2026-10-07

**Rejected at the first isolated bit-parity gate; no runtime change retained.**
Baseline `37bbe85`; faithful trial `2feb3d2`, locally tagged
`archive/pressure4-round3-rejected` (negative experiment, not for shipment).
The WebGL2 candidate evaluated two existing paired-Jacobi blocks per draw,
preserved expression order and sticky/solid substitution, and used
`packHalf2x16` / `unpackHalf2x16` only between the blocks to reproduce the
baseline R16F store. WebGL1, zero iterations, paired/single remainders and
large-grid fallback remained on the existing paths; dispatch used capability
and grid size, never preset names.

Headless installed Chrome reported
`ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version)`.
The GPU lock was held for each run, then released. First own-tier case:
800×500 canvas, odd 53×33 solver grid, cold pressure, nonzero seeded velocity
including boundary cells; pressure warm-start coefficient 0.8.

| Case | Max absolute error | Max fp16 ULP distance | Changed texels |
|---|---:|---:|---:|
| Own odd cold, 0 iterations | 0 | 0 | 0 |
| Own odd cold, 1 iteration | 0 | 0 | 0 |
| Own odd cold, 2 iterations | 0 | 0 | 0 |
| Own odd cold, 3 iterations | 0 | 0 | 0 |
| Own odd cold, 4 iterations, initial attempt | 0.0078125 | 44 | 505 |
| Own odd cold, 4 iterations, faithful audit | 0.0078125 | 44 | 505 |

The audit corrected a possible coordinate mismatch: the second block's
mediump nearest-fetch position must select the first block's stored texel,
whose pair was rendered at a highp pixel-center `vUv`. It also kept the second
block's multiply by a uniform set to 1.0, rather than a compile-time constant.
Neither rescued parity. Intermediate half conversion and clamped
boundary/solid handling were checked; the remaining cause is **not proven**.
No inner-single-iteration rounding or tolerance expansion was introduced.

Stopped with `--bail 1`: later warm-start, masks/solids/sticky, own/shared,
resize/loss/dispose and 200-step Plasma/Karman cases were authored in the
archived harness but **not executed**. No Node draw-count test, Proposed ADR,
full hardware suite, energy capture or E2 evaluation followed the rejection.
Pressure draw arithmetic forecast was Plasma 10→5, Karman 17→9 (whole-frame
forecast 36→31 / 39→31); these are **unmeasured**, not retained reductions.
The tentative 10–12% E1 forecast was below the 25% goal; no E1 gain is claimed.

Trial and restored-baseline Node suites: 880/880; `bun run check`: zero
errors/warnings; `bun run prepack`: pass (existing bench `import.meta.env`
warning).
Hardware strict parity: one failing test, unchanged after the audit.
Production `FluidEngine.ts`, `shaders.ts` and solver optimisation browser test
were restored to `37bbe85`; trial remains only in the local archive tag.

## E1 eval repair — TRAIN-only headless costs, 2026-10-07

Engine frozen at `37bbe85`; preregistration `66ebc38` (ADR 0107 Amendment 3).
No `src/lib` edits. Installed HeadlessChrome 154, renderer verified
`ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version)`.
No held-out presets/sizes ran for these cost probes.

**Per-solver-stage GPU attribution unavailable.** Current
`gpu-budget.browser.test.ts` labels are `ordinary`, `snapshot`, `velocity-N`,
`dye-N`, `readback`, `full-chain`: stages of the **settle reduction**, not
velocity advection, curl/vorticity, divergence, pressure, gradient, dye
advection, bloom or display. Shared-only `no-present` / `no-solver` are coarse
ablations. ANGLE TIME_ELAPSED / EngineProfiler groups have the command-buffer
bias documented below. `gpu-capture.mjs` attributes whole-frame Metal interval
unions; its optional draw-name log provides counts, not execution durations.
No new engine hooks or synthetic stage timings were introduced. A top-five
stage ranking, ms/frame and percentage shares cannot be certified from these
facilities; neither replay costs nor draw counts can be treated as additive
shares.

Existing opt-in bench ran only `SVELTE_FLUID_GPU_BENCH_STAGES=ordinary`,
`SVELTE_FLUID_GPU_BENCH_PRESETS=GasFlare,LavaLamp,Karman`, test-name filter
`DPR 2 own independent stages`, both train sizes. One browser per size,
200 warm-up frames; 12 batches ×20 frames, synced queue drain. These are
**wall-throughput upper bounds**, not native GPU-stage costs or independent
R3 noise estimates. The presets are the existing runnable default subset.

| TRAIN preset | CSS, DPR2 | Ordinary median ms/frame | Batch range ms/frame | (max−min)/median |
|---|---|---:|---:|---:|
| Karman | 1440×900 | 1.630 | 1.615–1.655 | 2.45% |
| GasFlare | 1440×900 | 1.570 | 1.550–1.940 | 24.84% |
| LavaLamp | 1440×900 | 0.830 | 0.775–0.965 | 22.89% |
| Karman | 800×500 | 1.615 | 1.585–2.175 | 36.53% |
| GasFlare | 800×500 | 1.560 | 1.535–1.780 | 15.71% |
| LavaLamp | 800×500 | 0.915 | 0.770–0.990 | 24.04% |

Evidence `/tmp/e1-headless-stages/{1440x900,800x500}.json`. Both benches pass;
other DPR/test cases skipped by name filter. Initial dependency scan reports
missing generated SplashCursor source, then falls back successfully; no bench
failure. Lock released after each size, owned-process cleanup records no
remaining PIDs (`/tmp/e1-headless-stages/cleanup.json`).

### Diagnostic-only public-config ablation ladder

Scope amended before ladder execution: Plasma (bloom+shading) and Karman
(no bloom/shading), 1440×900 DPR2 seed5, **R=1 per rung**; independent baseline
first and last per preset for drift. Public props only via existing
`energy-capture.mjs --override`; not candidates, not E1 keep decisions or E2
quality claims. Each rung captures real component/RAF, unchanged registered
windows/Metal parser, blank controls. Active GPU-ms/s divided by actual engine
Hz reports a whole-window mean GPU-ms/frame, not p95. Deltas are changes in
whole-frame cost under a changed workload; they are **not additive per-stage
costs**. Baseline endpoints bound observed drift only, not R3 noise.

Registered rungs: baseline, `bloom:false`, `shading:false`, `curl:0`,
`pressureIterations` half (Plasma 10, Karman 17), `pressureIterations:0`,
`dyeResolution:512`, `simResolution` half (Plasma 64, Karman 96), baseline.
Resolution/filtering probes fall outside E2 Amendment 1 certification; no
library change or keep claim follows them.

**18/18 clean captures; no failed attempts or retries.** Actual active engine
cadence 60 Hz throughout; blank/offscreen/hidden all 0 GPU-ms/s. Baseline
first/last means: Plasma **1.6735 / 1.9801 ms/frame**, drift **0.3066 ms
(16.78% of midpoint)**; Karman **2.4203 / 2.4373**, drift **0.0170 ms
(0.70%)**. Reference for deltas is the two-endpoint midpoint, Plasma 1.8268,
Karman 2.4288. Negative Δ means less whole-frame GPU work.

| Diagnostic public prop | Plasma ms/frame | Δ ms/frame | Karman ms/frame | Δ ms/frame |
|---|---:|---:|---:|---:|
| `bloom:false` | 1.4232 | −0.4036 | 2.5326 | +0.1038 |
| `shading:false` | 1.5215 | −0.3054 | 2.9042 | +0.4754 |
| `curl:0` | 1.6631 | −0.1638 | 2.2791 | −0.1496 |
| `pressureIterations` half | 1.4582 | −0.3686 | 2.4570 | +0.0282 |
| `pressureIterations:0` | 1.5595 | −0.2673 | 1.8078 | −0.6210 |
| `dyeResolution:512` | 1.2173 | −0.6095 | 1.8253 | −0.6034 |
| `simResolution` half | 1.3421 | −0.4847 | 1.9933 | −0.4354 |

**Noise warning:** Karman bloom/shading are already false. Their null rungs
increase cost 4.27% / 19.57% versus midpoint: endpoint drift alone badly
understates local timing variation. Non-monotonic pressure costs likewise
cannot rank pressure iterations robustly from R1. No significance claim,
no additive stage percentage shares, no top-five certified stage ranking.
Descriptive largest five *whole-workload saving probes* across the two
presets (not stages): Karman pressure-zero 0.6210 ms (25.57%); Plasma
dye-half 0.6095 (33.36%); Karman dye-half 0.6034 (24.85%); Plasma sim-half
0.4847 (26.53%); Karman sim-half 0.4354 (17.93%). Spatial-resolution savings
are excluded from automatic E2 certification. The next candidate needs
independent R3 noise and unchanged-quality evidence, not this noisy ranking.

Raw parsed evidence `/tmp/energy-eval/cost-{Plasma,Karman}-*-71b8ddf/`;
assert-based aggregation `/tmp/e1-aggregate-cost.mjs`, synthesis
`/tmp/e1-headless-stages/attribution-summary.json`. Every rung cleanup reports
lock released and no owned processes. All raw trace bundles and before/after
owned Instruments scratch removed; installed/user Chrome processes untouched.

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

#### Additional paired gate (fixed before additional data)

The initial repeats varied too much to establish a non-regression. Before looking
at further data, the coordinator fixed three additional alternating baseline /
candidate pairs per LavaLamp, default and InkPaper shared row, with unchanged
LavaLamp/default own controls in each invocation. Same seed 5 and protocol;
separate owned Chrome processes per unchanged-script invocation, same machine
and work session. Runtime toggles only the snapshot option between captures.

Acceptance: each row's median of **all valid paired shared p95 deltas** (candidate
minus baseline) must be **≤ +0.10 ms**, and must not exceed the unchanged own
control's p95 spread (maximum minus minimum across the two builds). InkPaper has
no own-tier backend; use the larger LavaLamp/default own-control spread.
INCONCLUSIVE pairs remain visible but do not enter the median; for an even
number of valid pairs, average the central two values. Original clean failures
still count toward scene verdicts; this non-regression gate is not budget
certification. Otherwise revert the runtime option change, retaining tests and
evidence as a negative result. These rules were fixed before the new data.

#### Additional paired results

Native median / p95 / max ms; every attempt retained. `Δ` is candidate minus
baseline; INCONCLUSIVE pairs stay excluded from gate arithmetic only.

| Pair | Scene / tier | Baseline | Candidate | Δ median / p95 / max |
|---|---|---|---|---|
| p1 | LavaLamp / own | 1.443 / 1.777 / 2.363 (PASS) | 1.463 / 2.162 / 3.890 (FAIL) | 0.020 / 0.386 / 1.527 |
| p1 | LavaLamp / shared | 1.538 / 3.137 / 3.678 (FAIL) | 1.469 / 1.914 / 2.909 (PASS) | -0.069 / -1.223 / -0.770 |
| p1 | (default) / own | INCONCLUSIVE | 1.575 / 2.144 / 3.093 (FAIL) | INCONCLUSIVE |
| p1 | (default) / shared | INCONCLUSIVE | 1.912 / 2.822 / 3.209 (FAIL) | INCONCLUSIVE |
| p1 | model-inkpaper / shared | 1.628 / 2.421 / 3.993 (FAIL) | 1.900 / 2.424 / 3.990 (FAIL) | 0.272 / 0.003 / -0.003 |
| p2 | LavaLamp / own | 1.531 / 2.152 / 2.303 (FAIL) | 1.429 / 1.881 / 3.710 (PASS) | -0.103 / -0.271 / 1.406 |
| p2 | LavaLamp / shared | 1.667 / 3.127 / 4.520 (FAIL) | 1.485 / 2.089 / 3.505 (FAIL) | -0.183 / -1.038 / -1.015 |
| p2 | (default) / own | 1.665 / 2.432 / 3.814 (FAIL) | 1.512 / 2.002 / 2.192 (FAIL) | -0.153 / -0.430 / -1.622 |
| p2 | (default) / shared | 2.020 / 3.305 / 4.267 (FAIL) | 1.626 / 2.165 / 3.779 (FAIL) | -0.394 / -1.140 / -0.488 |
| p2 | model-inkpaper / shared | 1.832 / 2.481 / 3.988 (FAIL) | 1.433 / 2.460 / 2.482 (FAIL) | -0.399 / -0.021 / -1.506 |
| p3 | LavaLamp / own | 1.455 / 1.849 / 3.688 (PASS) | 1.643 / 2.416 / 3.712 (FAIL) | 0.188 / 0.567 / 0.024 |
| p3 | LavaLamp / shared | 1.597 / 2.004 / 2.631 (FAIL) | 1.463 / 2.869 / 4.247 (FAIL) | -0.135 / 0.865 / 1.616 |
| p3 | (default) / own | 1.537 / 2.198 / 3.705 (FAIL) | 1.560 / 2.365 / 2.416 (FAIL) | 0.023 / 0.167 / -1.289 |
| p3 | (default) / shared | 1.753 / 2.485 / 2.641 (FAIL) | 1.601 / 2.461 / 3.653 (FAIL) | -0.152 / -0.024 / 1.011 |
| p3 | model-inkpaper / shared | 1.778 / 2.739 / 4.003 (FAIL) | 1.856 / 2.370 / 2.389 (FAIL) | 0.078 / -0.369 / -1.614 |

Gate includes initial matched repeats above plus all three new pairs.
Own-control spread is maximum minus minimum clean p95 across both builds,
including the original controls; no transfer attribution assigned to that spread.

| Shared scene | All paired p95 deltas (ms) | Median Δ p95 | Own-control spread | ≤ +0.10 and ≤ spread |
|---|---|---:|---:|---|
| LavaLamp | -0.108, 0.406, -1.223, -1.038, 0.865 | -0.108 | 1.657 | PASS |
| (default) | 0.407, -0.226, INCONCLUSIVE, -1.140, -0.024 | -0.125 | 0.430 | PASS |
| model-inkpaper | INCONCLUSIVE, 1.413, 0.003, -0.021, -0.369 | -0.009 | 1.657 | PASS |

Additional captures: `/tmp/opt-shared/paired/p{1,2,3}-{baseline,candidate}/`;
manifest records exact script PIDs and transport expressions, since baseline
runs intentionally use the old option on the candidate checkout. All 30 attempts
retained: 28 clean aligned, two INCONCLUSIVE (p1 baseline default own 14.330 ms,
shared 4.512 ms alignment error); no contention, maximum foreign overlap 0.189%.
Every shared attempt delivered all 60 transfers. The gate passes, so retain the
one-line transport change. Median deltas sit within broad unchanged-control
variability: **saving a native copy is proven; an overall speed-up is not**.

Worst clean candidate shared p95 across initial and additional captures:
Karman **3.666**, GasFlare **2.522**, LavaLamp **2.869**, default **2.822**,
InkPaper **3.850 ms**. Remaining excess over 2 ms: **1.666 / 0.522 / 0.869 /
0.822 / 1.850 ms**, respectively. Every target remains FAIL. Button and enamel
controls pass both initial candidate repeats; no later favourable pass erases
any earlier clean failure.

Final focused hardware suite: **59/59 passed**, covering host, shared context
and display pipeline. Eight seeded scene PNGs are **byte-identical** before /
after, white/dark pages; manifests and images stay under `/tmp/opt-shared/visual/`.
Node **864/864**, type check, prepack and diff whitespace checks passed. Existing
prepack `import.meta.env` warning and Vite's unrelated missing SplashCursor
scan warning remain; no touched route or capture-script fix.

Cleanup: owned Chrome contexts closed through Playwright; recorder, notifyutil,
Bun/Vite handles killed by exact owned PID and awaited. Every owned lock released
immediately after its operation. No user Chrome or other lane process signalled.
Worktree and untracked dependency symlink retained (not pushed/remotely preserved);
no installs, tracker writes, push or merge.

### InkPaper pressure-pairing lane — 2026-10-06

Candidate 4 ([ADR 0104](../decisions/0104-pigment-pressure-pairing.md)): fold
warm-start pressure decay into paired Jacobi, retain 16 iterations and all field
precisions. Pressure draws **17 → 8**; held-wet steady step+display **24 → 15**.
No capture-script, preset, host or FluidEngine edits.

Same-seed native comparison uses unchanged `bun scripts/gpu-capture.mjs`,
`GPU_CAPTURE_CASES='model-inkpaper@800x500:shared:2'`, seed 5, 1600×1000 native
backing, GPU lock held. Existing 200 warm-up/60 paced frame protocol, attribution,
transfer and foreign-contention gates, all-clean-repeats rule unchanged.

| Revision / capture | Median ms | p95 ms | Max ms | Verdict | Foreign overlap |
|---|---:|---:|---:|---|---|
| Base `76bdaa2`, `/tmp/opt-pigment/before/`, attempt 1 | 1.837372 | 2.636584 | 4.208206 | FAIL | 0 ms / 0% |
| Paired, `/tmp/opt-pigment/after/`, attempt 1 | 1.631124 | 2.278959 | 2.745042 | FAIL | 0 ms / 0% |
| Paired, `/tmp/opt-pigment/after-repeat2/`, attempt 1 | 1.601794 | 2.236915 | 4.021416 | FAIL | 0 ms / 0% |

All three captures aligned (0.476917/0.286375/0.521292 ms error), zero strays,
60 native writes and 60/60 requested/delivered transfers. Both clean after
repeats improve p95 against baseline by 13.6–15.2%; **all-repeats verdict remains
FAIL**. Worst after-p95 **2.278959 ms**, gap **0.278959 ms (13.95%)** above the
2 ms threshold. Pairing reduces cost but does not meet ADR 0101. Raw trace/frame
metadata and SHA256 export hashes retained in each directory's `capture.json`.
Historical InkPaper 1.617/2.453/2.771 ms remains above, not replaced by this run.
No per-shader GPU share inferred from draw counts.

Hardware pigment suite **14/14 passes**: old/new pressure parity (including odd
counts and edges) ≤2e-6 fp32 / <0.002 fp16 on the bounded fixture; painting fields
≤1e-5, mass <1e-5 relative; isolated settling/evaporation mass <1e-6 relative;
resist/drying, fixed-step resize and sibling isolation, context-loss replay ≤1e-6
per cell. fp16 bound accounts for omitted intermediate rounding, not precision
reduction. Existing semi-Lagrangian transport is not claimed globally conservative.
Same-seed wet steps 1/30/120 and final dry PNGs at native DPR are untracked under
`/tmp/opt-pigment/visual/manifest.json` (paths/SHA256s/differences). Wet stages
1/30/120 pixel-identical; dry changes only 3/1,600,000 pixels by 1 RGB LSB,
mean absolute RGB error 6.25e-7 LSB. Dry frames visually inspected with unchanged
grain/rim/resist. Required Node 863/863, check 0 errors/warnings, prepack and diff
whitespace checks pass. All owned Chrome/xctrace/Vite handles closed; locks
released, user Chrome untouched, no tracker writes/installs/push/merge.

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

## Solver/display negative optimisation lane — 2026-10-06

**No optimisation retained.** [ADR 0102](../decisions/0102-solver-display-optimisation-rejected.md)
records paired-viscosity/outlet parity failures, sunrays native-gate rejection,
packed-bloom blue/HDR rejection. Baseline `76bdaa2`; sunrays trial `8691527`.
Final production runtime unchanged from baseline. No p95 budget closure.

Unchanged `bun scripts/gpu-capture.mjs --seed 5`, M1 Max, ordinary headed Chrome,
native DPR2. Same 200 warm-up / 60 paced fixed-dt frames and interval-union
attribution; all original matrix rows aligned,60native writes, shared60/60
transfers, zero strays. Original baseline and unpaired trial foreign overlap
**0 ms / 0% every row**. WindowServer397 span busy ~3.72–4.59% is disclosed,
not foreign contention. Native backing unchanged: full2880×1800,
800CSS1600×1000, fractional960×601. Median/p95/max below in ms.

### Original matrix: before / unpaired R16F sunrays trial

Sunrays-off rows are controls only; timing changes cannot be attributed to
this candidate. CircularFluid full-size historically passed, fails fresh baseline;
Venturi and InkInWater800 provide passing controls. Earlier clean failures persist.

| Scene | CSS | Tier | Before median / p95 / max | Before | Trial median / p95 / max | Trial |
|---|---|---|---:|---|---:|---|
| Karman | 1440×900 | own | 2.438 / 3.806 / 5.043 | FAIL | 2.237 / 3.130 / 4.835 | FAIL |
| Karman | 800×500 | own | 2.205 / 3.024 / 3.366 | FAIL | 2.343 / 3.076 / 3.939 | FAIL |
| Karman | 480.25×300.5 | own | 2.164 / 2.848 / 4.164 | FAIL | 2.076 / 2.828 / 3.794 | FAIL |
| Karman | 1440×900 | shared | 2.495 / 4.091 / 4.975 | FAIL | 2.515 / 3.478 / 4.204 | FAIL |
| TeslaValve | 1440×900 | own | 2.007 / 4.129 / 4.339 | FAIL | 2.343 / 3.146 / 4.687 | FAIL |
| TeslaValve | 800×500 | own | 1.750 / 2.488 / 2.543 | FAIL | 1.739 / 2.528 / 3.648 | FAIL |
| GasFlare | 1440×900 | own | 2.485 / 4.130 / 4.448 | FAIL | 1.961 / 4.036 / 4.498 | FAIL |
| GasFlare | 800×500 | own | 1.554 / 2.154 / 3.401 | FAIL | 1.534 / 1.991 / 2.128 | PASS |
| GasFlare | 1440×900 | shared | 2.216 / 3.760 / 4.445 | FAIL | 2.111 / 3.694 / 5.119 | FAIL |
| (default) | 1440×900 | own | 1.592 / 2.424 / 3.708 | FAIL | 1.351 / 2.175 / 2.312 | FAIL |
| Plasma | 1440×900 | own | 1.777 / 2.747 / 3.508 | FAIL | 1.365 / 2.128 / 2.443 | FAIL |
| Toroidal | 1440×900 | own | 1.966 / 3.808 / 4.392 | FAIL | 1.682 / 2.454 / 3.954 | FAIL |
| AnnularFluid | 1440×900 | own | 1.475 / 2.175 / 2.870 | FAIL | 1.579 / 2.203 / 3.399 | FAIL |
| CircularFluid | 1440×900 | own | 1.776 / 2.367 / 3.333 | FAIL | 1.472 / 2.146 / 3.428 | FAIL |
| Venturi | 1440×900 | own | 1.335 / 1.876 / 2.081 | PASS | 1.451 / 1.825 / 1.888 | PASS |
| InkInWater | 800×500 | own | — | not captured | 0.956 / 1.171 / 1.450 | PASS |

### Frozen sunrays paired gate; every repeat

Only default/Plasma/Toroidal/Aurora have sunrays enabled. Fixed before data:
keep if a failing affected row has median paired p95 delta ≤−0.05 ms, and no
affected row has median delta >+0.10 ms; at least3valid pairs per affected row.
Three alternating baseline/candidate invocations,61s release gaps; seed5.
Attribution-inconclusive rows retained, not treated as zero execution.
No foreign contention; baseline Aurora p1 overlap below5% disclosed.

| Pair | Variant | Scene | Median / p95 / max | Verdict | Foreign overlap ms / % |
|---|---|---|---:|---|---:|
| 1 | baseline | (default) | 1.539 / 2.002 / 2.147 | FAIL | 0.000 / 0.000% |
| 1 | baseline | Plasma | 1.526 / 2.014 / 3.618 | FAIL | 0.000 / 0.000% |
| 1 | baseline | Toroidal | 1.719 / 2.230 / 2.410 | FAIL | 0.000 / 0.000% |
| 1 | baseline | Aurora | 1.506 / 2.102 / 3.550 | FAIL | 0.202 / 0.210% |
| 1 | baseline | Venturi | 1.242 / 1.681 / 3.332 | PASS | 0.000 / 0.000% |
| 1 | baseline | InkInWater | 0.943 / 1.123 / 1.471 | PASS | 0.000 / 0.000% |
| 1 | candidate | (default) | — | INCONCLUSIVE | 0.000 / 0.000% |
| 1 | candidate | Plasma | 1.399 / 2.071 / 3.268 | FAIL | 0.000 / 0.000% |
| 1 | candidate | Toroidal | 1.651 / 2.409 / 4.042 | FAIL | 0.000 / 0.000% |
| 1 | candidate | Aurora | 1.399 / 2.113 / 2.901 | FAIL | 0.000 / 0.000% |
| 1 | candidate | Venturi | 1.524 / 1.886 / 2.896 | PASS | 0.000 / 0.000% |
| 1 | candidate | InkInWater | 1.007 / 1.489 / 2.608 | PASS | 0.000 / 0.000% |
| 2 | baseline | (default) | 1.612 / 2.490 / 3.700 | FAIL | 0.000 / 0.000% |
| 2 | baseline | Plasma | 1.756 / 2.489 / 2.762 | FAIL | 0.000 / 0.000% |
| 2 | baseline | Toroidal | 1.676 / 2.515 / 4.319 | FAIL | 0.000 / 0.000% |
| 2 | baseline | Aurora | 1.549 / 2.182 / 3.681 | FAIL | 0.000 / 0.000% |
| 2 | baseline | Venturi | 1.444 / 1.890 / 2.562 | PASS | 0.000 / 0.000% |
| 2 | baseline | InkInWater | 0.999 / 1.457 / 2.742 | PASS | 0.000 / 0.000% |
| 2 | candidate | (default) | 1.387 / 1.700 / 2.002 | PASS | 0.007 / 0.008% |
| 2 | candidate | Plasma | 1.369 / 1.825 / 3.153 | PASS | 0.000 / 0.000% |
| 2 | candidate | Toroidal | 1.630 / 2.359 / 2.635 | FAIL | 0.013 / 0.013% |
| 2 | candidate | Aurora | 1.336 / 1.724 / 1.885 | PASS | 0.000 / 0.000% |
| 2 | candidate | Venturi | 1.333 / 1.690 / 1.968 | PASS | 0.000 / 0.000% |
| 2 | candidate | InkInWater | 0.973 / 1.484 / 2.166 | PASS | 0.000 / 0.000% |
| 3 | baseline | (default) | — | INCONCLUSIVE | 0.000 / 0.000% |
| 3 | baseline | Plasma | 1.656 / 3.018 / 3.427 | FAIL | 0.000 / 0.000% |
| 3 | baseline | Toroidal | 1.778 / 2.732 / 3.167 | FAIL | 0.000 / 0.000% |
| 3 | baseline | Aurora | — | INCONCLUSIVE | 0.000 / 0.000% |
| 3 | baseline | Venturi | 1.416 / 1.850 / 2.926 | PASS | 0.000 / 0.000% |
| 3 | baseline | InkInWater | 1.054 / 1.506 / 1.717 | PASS | 0.000 / 0.000% |
| 3 | candidate | (default) | 1.310 / 1.717 / 2.957 | PASS | 0.000 / 0.000% |
| 3 | candidate | Plasma | 1.436 / 2.232 / 2.942 | FAIL | 0.000 / 0.000% |
| 3 | candidate | Toroidal | 1.590 / 3.215 / 3.981 | FAIL | 0.000 / 0.000% |
| 3 | candidate | Aurora | — | INCONCLUSIVE | 0.000 / 0.000% |
| 3 | candidate | Venturi | 1.314 / 1.810 / 2.062 | PASS | 0.000 / 0.000% |
| 3 | candidate | InkInWater | 0.966 / 1.134 / 1.225 | PASS | 0.000 / 0.000% |

| Affected scene | Valid matched pairs | Paired p95 deltas ms | Median delta | All-clean candidate verdict |
|---|---:|---|---:|---|
| (default) | 1 | -0.789421 | -0.789421 | FAIL |
| Plasma | 3 | 0.056420, -0.663540, -0.786125 | -0.663540 | FAIL |
| Toroidal | 3 | 0.179127, -0.156250, 0.483374 | 0.179127 | FAIL |
| Aurora | 2 | 0.011252, -0.457748 | -0.223248 | FAIL |

**DROP:** Toroidal median+0.179127ms exceeds+0.10ms ceiling despite Plasma
−0.663540ms. Default/Aurora lack3valid pairs; no improvement certification.
No replacement captures after complete Toroidal failure rejected shipment.
Sunrays exact odd-grid field/image parity2/2 passed, but extra full-size R16F
mask adds3,354,624persistent bytes at1638×1024. Not worth this gate.

Viscosity/outlets failed current-fp16-reference parity before native timing.
Packed bloom failed native2880×1800 saturated-blue max16LSB (mean1.800399),
HDR max15LSB (mean3.003788), ceiling1LSB. No packed bloom native capture.
Original iteration/resolution/preset settings retained.

### Provenance, checks and hygiene

Raw unchanged-script JSON, Metal traces, frames and export SHA256 remain under
`/tmp/opt-solver/before/`, `/tmp/opt-solver/sunrays-after/`,
`/tmp/opt-solver/sunrays-pairs/p{1,2,3}-{baseline,candidate}/`. Each JSON
retains all attempts, PID/commands, client spans, alignment, hashes. No traces
committed. Kept-candidate visual manifest `/tmp/opt-solver/visual/manifest.json`
is empty: no candidate survived. No kept-candidate appearance approval claimed.

Bun Node/check/prepack/diff checks and focused ordinary-Chrome evidence recorded
in ADR0102. Owned Chrome/context, xctrace/notifyutil, Bun/Vite handles closed
after each run; lock released only for opt-solver owner. User Chrome untouched.
Worktree/ignored dependency symlink retained, not remotely preserved. No installs,
tracker writes, push, merge or system changes.

## Post-optimisation full matrix — 2026-10-06

Measured merged local main **`21041a0783155912854d94e7425385f9d6669e93`** after ADR 0103 (shared snapshot copy removal) and ADR 0104 (InkPaper pressure pairing). ADR 0102 solver/display candidates were rejected; none retained. Production own-tier FluidEngine and shaders are unchanged from `9df58fc` / the `aec018e` matrix. Surface/enamel models are unchanged except their shared snapshot transport. This is the **WebGL2 local-main runtime**, not the separate WebGPU replacement branch.

### Protocol and environment

Two independent full 43-scene invocations, separate owned headed Chrome processes and output directories. Unchanged script SHA256: `a7feec27774ca0ab5d84ec3e9daca97628f1dc847b97090f126d76df602180f7`. Seed **5** for presets and InkPaper; other models not applicable. M1 Max, MacBookPro18,4, 32 GPU cores, 64 GiB; macOS 27.0.1 (26A434), Xcode/xctrace 27.0 (27A266a), Chrome 154.0.8037.98, ANGLE Metal, Bun 1.3.11; actual native DPR **2**. No unsafe GPU flags, preset/runtime/script changes, installs or tracker writes.

The script's literal default covers only 30 own-tier preset scenes; `GPU_CAPTURE_CASES` explicitly reproduces the historical 43-scene matrix without changing the script. Same case order and env for each invocation:

```sh
export GPU_CAPTURE_CASES='(default)@1440x900:own:2,(default)@800x500:own:2,LavaLamp@1440x900:own:2,LavaLamp@800x500:own:2,Plasma@1440x900:own:2,Plasma@800x500:own:2,InkInWater@1440x900:own:2,InkInWater@800x500:own:2,FrozenSwirl@1440x900:own:2,FrozenSwirl@800x500:own:2,Aurora@1440x900:own:2,Aurora@800x500:own:2,CircularFluid@1440x900:own:2,CircularFluid@800x500:own:2,FrameFluid@1440x900:own:2,FrameFluid@800x500:own:2,AnnularFluid@1440x900:own:2,AnnularFluid@800x500:own:2,SvgPathFluid@1440x900:own:2,SvgPathFluid@800x500:own:2,Toroidal@1440x900:own:2,Toroidal@800x500:own:2,GasFlare@1440x900:own:2,GasFlare@800x500:own:2,Venturi@1440x900:own:2,Venturi@800x500:own:2,Karman@1440x900:own:2,Karman@800x500:own:2,TeslaValve@1440x900:own:2,TeslaValve@800x500:own:2,Karman@1440x900:shared:2,GasFlare@1440x900:shared:2,LavaLamp@1440x900:shared:2,(default)@1440x900:shared:2,Karman@480.25x300.5:own:2,model-button@232x68:shared:2,model-wide-button@492x76:shared:2,model-segmented@372x68:shared:2,model-dropzone@492x212:shared:2,model-caustics@720x400:shared:2,model-enamel96@1x1:shared:2,model-enamel64@1x1:shared:2,model-inkpaper@800x500:shared:2'
GPU_CAPTURE_DIR=/tmp/post-opt-matrix/run1 env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer bun scripts/gpu-capture.mjs --seed 5
GPU_CAPTURE_DIR=/tmp/post-opt-matrix/run2 env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer bun scripts/gpu-capture.mjs --seed 5
```

Unchanged 200 warm-up frames / 60 fixed-dt measured frames, three-RAF pacing; native Metal execution interval union, <4 ms mark alignment, native IOSurface writes and 60 requested/delivered shared transfers. p95 remains sorted index 56 (4th-worst of 60), a coarse sample not sustained population certification. ADR 0101's strict **p95 <2 ms** and all-clean-repeats rule apply; max remains visible. Foreign overlap **≥5% = CONTENDED**, not FAIL/PASS; WindowServer excluded. Script retries only CONTENDED, once after 30 s (two-attempt bound); INCONCLUSIVE attempts are retained without replacing marks or relaxing gates. Browser/OS ceilings, per-shader attribution and scanout limits remain as above.

Own-tier rows' runtime path is **unchanged**; shared preset/model rows include **ADR 0103**; InkPaper includes **ADRs 0103 + 0104**. Historical selected p95/verdict appear beside every scene below. The `aec018e` / ADR 0101 re-tabulation reported 28 PASS / 15 FAIL from selected worst-max historical captures, **unseeded**, not worst-p95 over every repeat. Post-opt seed-5 independent repeats and stricter repeat accounting are not a paired experiment. Changes in unchanged own-tier numbers demonstrate variability/protocol differences, not an optimisation regression or speed-up. The optimisation lanes already saw large run-to-run spread; no favorable repeat is selected here.

### Outcome, contention and completeness

**18 PASS / 25 FAIL** under the owner's every-clean-repeat rule implemented by the unchanged script. **Only 15 PASS scenes have two clean independent repeats**; Aurora own 800×500, Venturi own 800×500 and LiquidDropZone (`model-dropzone`) have one clean PASS plus one attribution-INCONCLUSIVE attempt (`PASS*` below). They are not two-repeat certified. Both full invocations nevertheless attempted all 43 scenes; no selective replacement runs. The 1.0 GPU goal remains **open**.

Across **86 preserved attempts**: run 1 **17 PASS / 23 FAIL / 3 INCONCLUSIVE**; run 2 **23 PASS / 17 FAIL / 3 INCONCLUSIVE**; combined **40 PASS / 40 FAIL / 6 INCONCLUSIVE / 0 CONTENDED**. No bounded contention retry was triggered. Every clean attempt has 60 attributed bursts, 60 native writes, zero stray bursts; every shared/model attempt, including inconclusive attempts, delivered all 60 requested transfers.

Attribution-INCONCLUSIVE attempts (spacing gate <4 ms): run1 Plasma own 1440×900 **22.959125 ms**, Aurora own 800×500 **14.828750**, fractional Karman own **25.957166**; run2 Venturi own 800×500 **4.610792**, GasFlare shared 1440×900 **5.682792**, LiquidDropZone **5.189791**. Each stays visible with null median/p95/max and exact hashes. Plasma, GasFlare shared and fractional Karman still FAIL from their other clean attempt; the other three lack a second clean repeat. No zero execution inferred.

Before each invocation, process census was retained at `/tmp/post-opt-matrix/run{1,2}/clients-before.txt`. Both included user Chrome GPU **4411** (browser 4386), Chrome-for-Testing GPU **48074**, WindowServer **397**, ghostty **14036**; no heavy MLX/Python GPU client was observed. No foreign process was signalled. During run2, foreign **Google Chrome Helper (64045)** appears in Aurora own 1440×900: **2.214% overlap**, below the 5% gate and still counted as clean FAIL. This row is explicitly foreign-client affected, not silently discarded. Run1 maximum foreign overlap **0.260%** (GasFlare own 1440×900); run2 enamel64 **0.324%** from unattributed activity. Other nonzero overlaps and client busy spans stay in the provenance table. WindowServer is reported, excluded only from the foreign gate.

Historical ADR 0101 selected-row count was **28 PASS / 15 FAIL**. All 15 historical FAIL scenes still FAIL here; ten historical PASS scenes now have at least one clean failure: own default 800×500, LavaLamp 1440×900, InkInWater 1440×900, FrozenSwirl 1440×900, Aurora 1440×900, CircularFluid 1440×900, FrameFluid 1440×900, Toroidal 800×500, GasFlare 800×500, Venturi 1440×900. **All ten run the unchanged own-tier runtime.** Different seeds, all-repeat accounting and substantial native-time variance preclude attributing these new exceedances to ADR 0103/0104. Even the same-seed post-opt repeats cross the boundary: LavaLamp full **2.605166 / 1.968084 ms p95**, InkInWater full **2.092124 / 1.535794**, FrozenSwirl full **2.121001 / 1.725292**, CircularFluid full **2.120377 / 1.816669**, AnnularFluid full **2.174582 / 1.618626**, GasFlare 800 **1.901959 / 2.403001**, default 800 **2.164956 / 1.694335**. One favorable repeat never erases another clean failure. Own Karman full spans **3.474540–4.423709** in these two runs and **2.720333–4.423709** across the comparison source set. No general regression or speed-up is claimed.

Merged InkPaper (both retained changes) has clean p95 **2.268207 / 2.159166 ms**: worst gap **0.268207 ms**, so both repeats still FAIL. The four large shared preset rows remain FAIL. ADR 0103's removed native copy and ADR 0104's reduced pressure draw count remain workload evidence; this matrix does not isolate their GPU cost or overwrite their paired-lane evidence.

### Per-scene execution: every independent repeat

All values ms: median / p95 / max, then attempt verdict and foreign overlap %. Run columns retain every bounded retry; `—` is unavailable attribution, never zero execution. Scene PASS follows the unchanged script: at least one clean repeat, every clean repeat below 2 ms. `PASS*` marks only one clean independent repeat; those three scenes lack two-repeat certification. Decisions use unrounded values.

| Scene | Tier / runtime path | CSS / native backing | Run 1 | Run 2 | Worst clean p95 | Scene verdict | Historical selected p95 / verdict |
|---|---|---|---|---|---:|---|---|
| (default) | own / unchanged | 1440×900 / 2880×1800 | a1: 1.555286 / 2.104833 / 2.171080 (FAIL; 0.000000%) | a1: 1.524163 / 2.004833 / 2.277045 (FAIL; 0.000000%) | 2.104833 | **FAIL** | 2.020 / FAIL |
| (default) | own / unchanged | 800×500 / 1600×1000 | a1: 1.523370 / 2.164956 / 3.271877 (FAIL; 0.000000%) | a1: 1.300834 / 1.694335 / 1.935251 (PASS; 0.000000%) | 2.164956 | **FAIL** | 1.634 / PASS |
| LavaLamp | own / unchanged | 1440×900 / 2880×1800 | a1: 1.536417 / 2.605166 / 3.737294 (FAIL; 0.000000%) | a1: 1.411625 / 1.968084 / 3.440126 (PASS; 0.000000%) | 2.605166 | **FAIL** | 1.913 / PASS |
| LavaLamp | own / unchanged | 800×500 / 1600×1000 | a1: 0.939668 / 1.147374 / 1.498417 (PASS; 0.000000%) | a1: 0.932585 / 1.121960 / 1.445292 (PASS; 0.000000%) | 1.147374 | **PASS** | 1.347 / PASS |
| Plasma | own / unchanged | 1440×900 / 2880×1800 | a1: — / — / — (INCONCLUSIVE; 0.000000%) | a1: 1.496249 / 2.081414 / 2.495290 (FAIL; 0.000000%) | 2.081414 | **FAIL** | 2.321 / FAIL |
| Plasma | own / unchanged | 800×500 / 1600×1000 | a1: 1.315412 / 1.963165 / 3.439499 (PASS; 0.000000%) | a1: 1.232003 / 1.618959 / 1.755584 (PASS; 0.000000%) | 1.963165 | **PASS** | 1.983 / PASS |
| InkInWater | own / unchanged | 1440×900 / 2880×1800 | a1: 1.244167 / 2.092124 / 3.558712 (FAIL; 0.000000%) | a1: 1.184500 / 1.535794 / 2.921956 (PASS; 0.000000%) | 2.092124 | **FAIL** | 1.851 / PASS |
| InkInWater | own / unchanged | 800×500 / 1600×1000 | a1: 1.055245 / 1.475792 / 1.733671 (PASS; 0.000000%) | a1: 0.962329 / 1.157042 / 1.211080 (PASS; 0.000000%) | 1.475792 | **PASS** | 1.308 / PASS |
| FrozenSwirl | own / unchanged | 1440×900 / 2880×1800 | a1: 1.407874 / 2.121001 / 2.326126 (FAIL; 0.000000%) | a1: 1.382081 / 1.725292 / 2.173541 (PASS; 0.000000%) | 2.121001 | **FAIL** | 1.934 / PASS |
| FrozenSwirl | own / unchanged | 800×500 / 1600×1000 | a1: 1.182287 / 1.566996 / 2.569669 (PASS; 0.000000%) | a1: 1.110540 / 1.330081 / 1.469790 (PASS; 0.000000%) | 1.566996 | **PASS** | 1.471 / PASS |
| Aurora | own / unchanged | 1440×900 / 2880×1800 | a1: 1.517795 / 2.273917 / 4.374207 (FAIL; 0.000000%) | a1: 1.579500 / 2.061459 / 2.208918 (FAIL; 2.214000%) | 2.273917 | **FAIL** | 1.977 / PASS |
| Aurora | own / unchanged | 800×500 / 1600×1000 | a1: — / — / — (INCONCLUSIVE; 0.000000%) | a1: 1.309710 / 1.652625 / 3.145125 (PASS; 0.000000%) | 1.652625 | **PASS*** | 1.594 / PASS |
| CircularFluid | own / unchanged | 1440×900 / 2880×1800 | a1: 1.456372 / 2.120377 / 3.343999 (FAIL; 0.000000%) | a1: 1.369045 / 1.816669 / 3.388417 (PASS; 0.000000%) | 2.120377 | **FAIL** | 1.765 / PASS |
| CircularFluid | own / unchanged | 800×500 / 1600×1000 | a1: 1.287662 / 1.655293 / 2.462170 (PASS; 0.000000%) | a1: 1.138835 / 1.313707 / 1.378749 (PASS; 0.000000%) | 1.655293 | **PASS** | 1.334 / PASS |
| FrameFluid | own / unchanged | 1440×900 / 2880×1800 | a1: 1.587248 / 2.258918 / 3.605125 (FAIL; 0.000000%) | a1: 1.508251 / 2.069918 / 3.617126 (FAIL; 0.000000%) | 2.258918 | **FAIL** | 1.884 / PASS |
| FrameFluid | own / unchanged | 800×500 / 1600×1000 | a1: 1.244872 / 1.737540 / 2.253914 (PASS; 0.000000%) | a1: 1.134955 / 1.529001 / 1.913206 (PASS; 0.000000%) | 1.737540 | **PASS** | 1.423 / PASS |
| AnnularFluid | own / unchanged | 1440×900 / 2880×1800 | a1: 1.468081 / 2.174582 / 3.286835 (FAIL; 0.000000%) | a1: 1.354084 / 1.618626 / 3.586582 (PASS; 0.000000%) | 2.174582 | **FAIL** | 2.056 / FAIL |
| AnnularFluid | own / unchanged | 800×500 / 1600×1000 | a1: 1.116952 / 1.802290 / 3.201624 (PASS; 0.000000%) | a1: 1.053919 / 1.275042 / 1.675082 (PASS; 0.000000%) | 1.802290 | **PASS** | 1.271 / PASS |
| SvgPathFluid | own / unchanged | 1440×900 / 2880×1800 | a1: 1.403834 / 1.831994 / 2.027037 (PASS; 0.000000%) | a1: 1.385462 / 1.721711 / 3.427002 (PASS; 0.000000%) | 1.831994 | **PASS** | 1.765 / PASS |
| SvgPathFluid | own / unchanged | 800×500 / 1600×1000 | a1: 1.047746 / 1.277502 / 1.383747 (PASS; 0.000000%) | a1: 1.110123 / 1.284334 / 1.690627 (PASS; 0.000000%) | 1.284334 | **PASS** | 1.330 / PASS |
| Toroidal | own / unchanged | 1440×900 / 2880×1800 | a1: 1.804042 / 2.341500 / 4.072501 (FAIL; 0.000000%) | a1: 1.701454 / 2.337250 / 2.726751 (FAIL; 0.000000%) | 2.341500 | **FAIL** | 2.211 / FAIL |
| Toroidal | own / unchanged | 800×500 / 1600×1000 | a1: 1.419289 / 2.036663 / 3.469912 (FAIL; 0.000000%) | a1: 1.474462 / 2.426627 / 3.722875 (FAIL; 0.000000%) | 2.426627 | **FAIL** | 1.788 / PASS |
| GasFlare | own / unchanged | 1440×900 / 2880×1800 | a1: 2.079041 / 3.079914 / 3.960583 (FAIL; 0.260000%) | a1: 1.907958 / 2.818959 / 4.193209 (FAIL; 0.000000%) | 3.079914 | **FAIL** | 2.443 / FAIL |
| GasFlare | own / unchanged | 800×500 / 1600×1000 | a1: 1.576957 / 2.403001 / 3.533461 (FAIL; 0.000000%) | a1: 1.566753 / 1.901959 / 2.909751 (PASS; 0.000000%) | 2.403001 | **FAIL** | 1.933 / PASS |
| Venturi | own / unchanged | 1440×900 / 2880×1800 | a1: 1.407458 / 2.831168 / 3.530459 (FAIL; 0.000000%) | a1: 1.361041 / 2.309626 / 3.513669 (FAIL; 0.000000%) | 2.831168 | **FAIL** | 1.681 / PASS |
| Venturi | own / unchanged | 800×500 / 1600×1000 | a1: 1.022373 / 1.564582 / 2.533748 (PASS; 0.000000%) | a1: — / — / — (INCONCLUSIVE; 0.000000%) | 1.564582 | **PASS*** | 1.270 / PASS |
| Karman | own / unchanged | 1440×900 / 2880×1800 | a1: 2.261041 / 4.423709 / 5.200538 (FAIL; 0.015000%) | a1: 2.518960 / 3.474540 / 5.052834 (FAIL; 0.000000%) | 4.423709 | **FAIL** | 2.720 / FAIL |
| Karman | own / unchanged | 800×500 / 1600×1000 | a1: 2.181541 / 3.102959 / 3.299334 (FAIL; 0.000000%) | a1: 2.148500 / 3.373415 / 4.735000 (FAIL; 0.000000%) | 3.373415 | **FAIL** | 2.901 / FAIL |
| TeslaValve | own / unchanged | 1440×900 / 2880×1800 | a1: 2.242332 / 3.492625 / 4.519290 (FAIL; 0.000000%) | a1: 1.904544 / 2.738748 / 4.139836 (FAIL; 0.000000%) | 3.492625 | **FAIL** | 2.733 / FAIL |
| TeslaValve | own / unchanged | 800×500 / 1600×1000 | a1: 1.696253 / 2.739666 / 4.001708 (FAIL; 0.000000%) | a1: 1.744294 / 2.650878 / 4.065829 (FAIL; 0.000000%) | 2.739666 | **FAIL** | 2.491 / FAIL |
| Karman | shared / 0103 | 1440×900 / 2880×1800 | a1: 2.956791 / 4.613166 / 5.436127 (FAIL; 0.029000%) | a1: 2.321167 / 3.407205 / 4.800458 (FAIL; 0.000000%) | 4.613166 | **FAIL** | 3.150 / FAIL |
| GasFlare | shared / 0103 | 1440×900 / 2880×1800 | a1: 2.401374 / 3.617003 / 4.143834 (FAIL; 0.138000%) | a1: — / — / — (INCONCLUSIVE; 0.000000%) | 3.617003 | **FAIL** | 2.531 / FAIL |
| LavaLamp | shared / 0103 | 1440×900 / 2880×1800 | a1: 1.724128 / 2.420461 / 4.017916 (FAIL; 0.000000%) | a1: 1.682249 / 2.934165 / 4.231499 (FAIL; 0.000000%) | 2.934165 | **FAIL** | 2.030 / FAIL |
| (default) | shared / 0103 | 1440×900 / 2880×1800 | a1: 1.971374 / 3.813541 / 4.569377 (FAIL; 0.093000%) | a1: 1.768163 / 2.798710 / 3.515751 (FAIL; 0.000000%) | 3.813541 | **FAIL** | 2.235 / FAIL |
| Karman | own / unchanged | 480.25×300.5 / 960×601 | a1: — / — / — (INCONCLUSIVE; 0.000000%) | a1: 2.068540 / 3.808042 / 4.558081 (FAIL; 0.000000%) | 3.808042 | **FAIL** | 2.694 / FAIL |
| LiquidButton (220×56; canvas 232×68) | shared / 0103 | 232×68 / 464×136 | a1: 0.687751 / 0.732456 / 0.855164 (PASS; 0.001000%) | a1: 0.676791 / 0.744625 / 0.960709 (PASS; 0.000000%) | 0.744625 | **PASS** | 0.700 / PASS |
| LiquidButton wide (480×64; canvas 492×76) | shared / 0103 | 492×76 / 984×152 | a1: 0.732666 / 0.757043 / 0.780668 (PASS; 0.000000%) | a1: 0.699000 / 0.798666 / 1.035541 (PASS; 0.000000%) | 0.798666 | **PASS** | 0.758 / PASS |
| LiquidSegmented (360×56; canvas 372×68) | shared / 0103 | 372×68 / 744×136 | a1: 0.773834 / 0.839542 / 1.073418 (PASS; 0.000000%) | a1: 0.690126 / 0.809376 / 0.899791 (PASS; 0.000000%) | 0.839542 | **PASS** | 0.811 / PASS |
| LiquidDropZone dragging (480×200; canvas 492×212) | shared / 0103 | 492×212 / 984×424 | a1: 1.057750 / 1.539336 / 2.441248 (PASS; 0.000000%) | a1: — / — / — (INCONCLUSIVE; 0.000000%) | 1.539336 | **PASS*** | 1.361 / PASS |
| LiquidCaustics (720×400) | shared / 0103 | 720×400 / 1440×800 | a1: 0.838084 / 1.032668 / 1.125500 (PASS; 0.000000%) | a1: 0.871960 / 1.065625 / 1.157668 (PASS; 0.000000%) | 1.065625 | **PASS** | 1.076 / PASS |
| EnamelText 96px bold | shared / 0103 | 322.3125×105.59375 / 644×211 | a1: 0.433502 / 0.544419 / 1.755456 (PASS; 0.000000%) | a1: 0.438083 / 0.539583 / 1.796543 (PASS; 0.000000%) | 0.544419 | **PASS** | 0.503 / PASS |
| EnamelText 64px two words | shared / 0103 | 351.375×70.3984375 / 702×140 | a1: 0.463752 / 0.603374 / 1.188957 (PASS; 0.000000%) | a1: 0.443126 / 0.555042 / 1.970792 (PASS; 0.324000%) | 0.603374 | **PASS** | 0.469 / PASS |
| InkPaper held wet (800×500) | shared / 0103 + 0104 | 800×500 / 1600×1000 | a1: 1.526001 / 2.268207 / 3.988624 (FAIL; 0.000000%) | a1: 1.590584 / 2.159166 / 3.862667 (FAIL; 0.000000%) | 2.268207 | **FAIL** | 2.453 / FAIL |

### Residual FAIL list

| Scene | Tier | CSS | Worst clean p95 ms | Gap above 2 ms |
|---|---|---|---:|---:|
| (default) | own | 1440×900 | 2.104833 | 0.104833 |
| (default) | own | 800×500 | 2.164956 | 0.164956 |
| LavaLamp | own | 1440×900 | 2.605166 | 0.605166 |
| Plasma | own | 1440×900 | 2.081414 | 0.081414 |
| InkInWater | own | 1440×900 | 2.092124 | 0.092124 |
| FrozenSwirl | own | 1440×900 | 2.121001 | 0.121001 |
| Aurora | own | 1440×900 | 2.273917 | 0.273917 |
| CircularFluid | own | 1440×900 | 2.120377 | 0.120377 |
| FrameFluid | own | 1440×900 | 2.258918 | 0.258918 |
| AnnularFluid | own | 1440×900 | 2.174582 | 0.174582 |
| Toroidal | own | 1440×900 | 2.341500 | 0.341500 |
| Toroidal | own | 800×500 | 2.426627 | 0.426627 |
| GasFlare | own | 1440×900 | 3.079914 | 1.079914 |
| GasFlare | own | 800×500 | 2.403001 | 0.403001 |
| Venturi | own | 1440×900 | 2.831168 | 0.831168 |
| Karman | own | 1440×900 | 4.423709 | 2.423709 |
| Karman | own | 800×500 | 3.373415 | 1.373415 |
| TeslaValve | own | 1440×900 | 3.492625 | 1.492625 |
| TeslaValve | own | 800×500 | 2.739666 | 0.739666 |
| Karman | shared | 1440×900 | 4.613166 | 2.613166 |
| GasFlare | shared | 1440×900 | 3.617003 | 1.617003 |
| LavaLamp | shared | 1440×900 | 2.934165 | 0.934165 |
| (default) | shared | 1440×900 | 3.813541 | 1.813541 |
| Karman | own | 480.25×300.5 | 3.808042 | 1.808042 |
| model-inkpaper | shared | 800×500 | 2.268207 | 0.268207 |

### Attempt provenance and script-provided SHA256s

Raw traces and frame detail remain under `/tmp/post-opt-matrix/run{1,2}/`, not committed or durably archived. Hash columns are exact exported XML SHA256s in order: Metal GPU intervals / command-buffer submissions / IOSurface accesses. `capture.json` records full commands, notification names, GPU PIDs, JS marks, frame execution arrays, adapter/UA/config, client busy spans and hashes. No TOC hash is supplied by this script.

| Run / trace basename | GPU PID | Alignment error ms / stray bursts | Native writes / transfers requested:delivered | Foreign overlap ms / % | Other clients (span busy %) | GPU / submissions / IOSurface SHA256 |
|---|---:|---|---|---|---|---|
| 1 / `default-1440x900-own-dpr2-seed5-a1.trace` | 33606 | 1.188458 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 3.87% | `9c28075c381e9eaa6d1b4554775b4b627127d82ce4deeb52786e268708a95103` / `961ee287a5b4a3bf307b3309ae0a3c04677feb16bdb24b37393db635c9a04b15` / `e1ba9a233a4c926d6a7fa48cf640a47aa84d2dc171b62ed825881ab62275236b` |
| 1 / `default-800x500-own-dpr2-seed5-a1.trace` | 33606 | 1.220916 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.35% | `40fdce065a2d48adf52d49a9c458d22e0f84a847377dd5e9e49e886b6d684ba0` / `6f7653465ab172137ba04c52a900c7a074130bd47a02a726f919e29507f98ee2` / `b32493a634011167671e649176befe1ed57cb44de688939ffb679cdbc44371e6` |
| 1 / `LavaLamp-1440x900-own-dpr2-seed5-a1.trace` | 33606 | 0.975166 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.25%; unattributed: 0% | `e2a2a1195c7864c5a4c083e2ff0b2d44fbe8feb688f27d2a437be348d14da47f` / `933ed710b245f70025d313ab27c48c8560ea2b2f03ee911a6a747ba6624d1216` / `7da57231c0cfd9271c8b8e2d6e65ad59919d52fa4aba06aa2bf88098654cd0b9` |
| 1 / `LavaLamp-800x500-own-dpr2-seed5-a1.trace` | 33606 | 0.216833 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.08% | `1f10467ac54a52191f77c6d262e4f96475348f3dd1f2a1d89c61406cd0c0d278` / `fbaa3a62c39b3df566f70a48439d88746e2fb2e16302c94aea933a457b021f4a` / `2a98bbd112b68253ee48588cc5f04ad8f3889cff1ef5e29552268d4d14b20b6b` |
| 1 / `Plasma-1440x900-own-dpr2-seed5-a1.trace` | 33606 | 22.959125 / — | 0 / 0:0 | 0.000000 / 0.000000% | none attributed | `799c7780613a46f4de01caa489e0ec188648e3aab798cc689e1154b90af57a96` / `068cf8445b880f9c1d53208704a874aad1d891b4b6248d1f5bc5eb4352383dc0` / `da17ad198b0926c3a5959bfbe69126cc6f8e535bc4558bcb8103508251bbe696` |
| 1 / `Plasma-800x500-own-dpr2-seed5-a1.trace` | 33606 | 0.694208 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 3.98% | `e280c4dfc633b22f2f4224003cecc71cd71c6818ad76da0240c7608ca3ca89c5` / `7e1d7e19af4c3badbb863779e18a8ababe72de1b22dce6eb41d7f03ffbe1433a` / `4d7400ffa93cd3ffdce39ff4c5249f389f52269cd0982a14cddc98d7178cd396` |
| 1 / `InkInWater-1440x900-own-dpr2-seed5-a1.trace` | 33606 | 0.706584 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.42% | `7dc332f336f1e929cf0c2d1fa313b2ee0e0f9d14142a5ba2f3bcb2b1f4848614` / `a81f4dcc2fb850efaece9fa84a438c1e0ebe9ae2b5e325f422fc1f42699b8c44` / `8fb5e17950f9cf98a7bae874a0eaf49643d112b2f90551fa4deee88dd832ed1b` |
| 1 / `InkInWater-800x500-own-dpr2-seed5-a1.trace` | 33606 | 1.814917 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.14% | `7b5cdb5f7bea3d8491e8b9cd90aafcc9acf202ecd407183b47085bed05b60f08` / `193164c6134a66bea8c7469b7fa06c79f38bb8b3951d04b2edd13b6bc0fe024f` / `75a785084e26be1ed8e205fac9b96c394e241f9f512d8873579b7c81d346ec64` |
| 1 / `FrozenSwirl-1440x900-own-dpr2-seed5-a1.trace` | 33606 | 0.918916 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.13% | `89d9654128b79f11e67c03786be7a3b1a162c0124285abe1905e79fde6f7b31a` / `5bd562d97e624735df9db78122d5199820043de35d8fc3b73047833a53dce172` / `92340f26f139d70aab3bf6d8bbc1e3dbc9d3a3cfe2d1cf0286746b9a6eb13178` |
| 1 / `FrozenSwirl-800x500-own-dpr2-seed5-a1.trace` | 33606 | 0.482541 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.06% | `d22945cde28f94078b2016631950e30eb28399866d7564db805607a358d2d990` / `5eb1d83b9072e259cb190c09b8fcd61a3bfbd0c0f253745c7453530e07955ba4` / `74e525265b1a3b3228605d4a2548dd6b7a2ead2fe1bdf707e36bef955e5c251b` |
| 1 / `Aurora-1440x900-own-dpr2-seed5-a1.trace` | 33606 | 0.643458 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 3.99% | `96a4f981f575f4960fc1e2cede753b39c00cd00250bb95e08f0ec5e05b6e991d` / `ffb75727ce3140aa3594bfc2f322674c0d0e7cc9b229464103ab5458286b8447` / `edfd049381cf86aa065ac8f8baa9225def178ce69178d9366096825a026dd7aa` |
| 1 / `Aurora-800x500-own-dpr2-seed5-a1.trace` | 33606 | 14.828750 / — | 0 / 0:0 | 0.000000 / 0.000000% | none attributed | `28d79c8e58b60d2c9d81617febd66e99e476077a261d7d571788318d7d797c0f` / `cb7eab9e237cdd2f8bcc3b47ae0a1fb12f2b2c73e6865e86100387ce0d7fa6f6` / `c04510850f18955663cc256525e378ef2d4ee2ee005846c05d755c8c13f82232` |
| 1 / `CircularFluid-1440x900-own-dpr2-seed5-a1.trace` | 33606 | 3.147000 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.35% | `a1c1f935e5a37278f8ae0e630547a1f1a0e5b08aec40e9b7932d62d29e28fd9e` / `1b1577a5b71ab1291b0c8ff245d57c8dc9d0f9046d5276c33730715c1860e23c` / `1b7b84c6c53072ade90cf4b1b19ea3291c4a247869ca665ac9ef030afaabfacd` |
| 1 / `CircularFluid-800x500-own-dpr2-seed5-a1.trace` | 33606 | 1.631708 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.24% | `149b2f22ae0ef346884860df28ba4184ad61378fb19b5d2e097234b5285546f6` / `b5e1aafdf567dc5b7cdd7c03c743b2bd34e9afefa7d4045b56947567676957fa` / `b6fd58cfe2bab75f31d41269565c8b94703957043d94256556e80c87649bad41` |
| 1 / `FrameFluid-1440x900-own-dpr2-seed5-a1.trace` | 33606 | 0.412542 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.06% | `6e4e0ad84d01a2bf32b83fdea2cd17fada2e8ba315a9242a570dfe31b28d73e6` / `0b2a4c2f40c669dd82171c8d7e8fda8b4356dda18ccd5f2ffa20b28c0d4ead09` / `fe5af13b11700659b3d9cd887b952331a55ada10ff876d4876162dc6c8341f8b` |
| 1 / `FrameFluid-800x500-own-dpr2-seed5-a1.trace` | 33606 | 0.793166 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.09% | `fbd9e520f19a3d81b8ec1b2a138c9dfa2e693e4eac3c86ef0dcf2adf0b859913` / `ebd6fbc4fbeb39a68826ca6a2b5bb03c06eeb0ca1097c6c632e5d7ec85bdfeb3` / `cbb4ffe8f109226727a32023113a9083d64f6080123536f2501151d439710216` |
| 1 / `AnnularFluid-1440x900-own-dpr2-seed5-a1.trace` | 33606 | 1.513666 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.19% | `0286780a02665276cd4479cfd4082e755190345a502693692a00abb1ff54251b` / `1d7b5c37e7cb3804d162dbb1c5c528adb6c4d92f28481e481fe726f7a52ed384` / `a63a07bab27b764ae9ce8bcedae3afc52694757d90d7a5f30617b161f06dcaa7` |
| 1 / `AnnularFluid-800x500-own-dpr2-seed5-a1.trace` | 33606 | 1.845000 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.19%; unattributed: 0% | `549d2d75dbd34892554d5f9b699ffce827f3aecad8842010a68a7a1ab16996bc` / `991e35297bd9251c7167efbfdfe6652858d3312bab02e630641815ec0054f7af` / `d7447093cf2bb1eb8d70f8367fafaa8bfc160ff78fba5f2d48793fcc6f66b7f9` |
| 1 / `SvgPathFluid-1440x900-own-dpr2-seed5-a1.trace` | 33606 | 0.216916 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 3.86% | `f55eb20fa872adc4faf8c07cd6022b65376f46521bf7799a5cf12ad20df358c4` / `72226b94f534c2623c86e2e487033778c92059e5a8a864dfdec5e7560fbddc2b` / `7b060c6df214614f6a2218cbe82c635be2a8b7355480778ec5ac48e5d7386179` |
| 1 / `SvgPathFluid-800x500-own-dpr2-seed5-a1.trace` | 33606 | 0.098500 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 3.99% | `091ed72de3153989ccdd7a8f4bc717e8afc26f1d6c046aee85773a4d8379c0c5` / `fee160b8a1f1221f82b84d2db47b2568bc74231b27ce6316a3082685aaf1b7cb` / `45eb33f1c6c2e1688ae90cd3d633e6c48fe63ca714e8f5a6aabfc979f7104b90` |
| 1 / `Toroidal-1440x900-own-dpr2-seed5-a1.trace` | 33606 | 0.179458 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.24% | `e7178cceec797b8df483b0dd093d183d8ca8af5a35f06a943c61fe2f26e3635c` / `9abb9932360a0ea099577ad555ca968e4afe7cd2cf520fea4238a8dff532fe1d` / `cad9de674e4b68c72517b77761c3d0f3b79f555766d3049f16bf7669a3fdcb26` |
| 1 / `Toroidal-800x500-own-dpr2-seed5-a1.trace` | 33606 | 0.222375 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.22% | `fa2da152b63772355e6597f3102299e4a38d8208592f51452cf65fe5899cba6b` / `526d94db5a4c806895b7150d0b9a300644fd942571bcb124d95b925807c0c66e` / `fe15881fc16a1bba2065165999ec6d2a22c1af4721df0c02162749bd11f73da3` |
| 1 / `GasFlare-1440x900-own-dpr2-seed5-a1.trace` | 33606 | 1.373625 / 0 | 60 / 0:0 | 0.335000 / 0.260000% | WindowServer (397): 4.32%; loginwindow (401): 0.17%; unattributed: 0% | `bd603367a830994ea9fb67ed6e718b3356998354066e49ea5d0d586aeb4104cf` / `e95b5d04a9e78f3df2490f67542b421bf5030cf210ca55d4ebcb6c7a2ab3df86` / `081a1cbb9b694f27c55218fa51a8484cf977f0e669021b755f64426002086df3` |
| 1 / `GasFlare-800x500-own-dpr2-seed5-a1.trace` | 33606 | 2.255917 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.13% | `1ba125ec5bd24fac0e51dcd298d31def8fe8e8d6576a7efeee5377fc1bd69c5f` / `e379ffe5d39d3c970933a1a136ae0029eeb7ded488b9c89c3edfcbdd09447e00` / `36d18d8dd9df240e3dbbe4e07e5cebcb81a732c9e356b4a30f3ba7c94e1be946` |
| 1 / `Venturi-1440x900-own-dpr2-seed5-a1.trace` | 33606 | 1.441250 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.3% | `c88ca139931729fb0b22dc1203c437f751c5fd8f6882a476872abc72c62e7f25` / `fc46b9954d1ce3d3dcac202600e3e5ec93059cf26a6af5eb5fcb0db009f4ef97` / `2cc869c308df96613de7cdcfefcc6913859048cb41072b2c423f46676ec06060` |
| 1 / `Venturi-800x500-own-dpr2-seed5-a1.trace` | 33606 | 2.721209 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.31% | `195fe74ac52e8f6ab94a1544f12a04ee108810111aca707618a8f8b721b93b1b` / `62476de819747837ed8f1102b9a574346713f5b6848e63648b14620084250c28` / `e73730ec2e65414189770b039829a2644443a407cdc877bb75d5e28bee085ce4` |
| 1 / `Karman-1440x900-own-dpr2-seed5-a1.trace` | 33606 | 1.609083 / 0 | 60 / 0:0 | 0.024000 / 0.015000% | WindowServer (397): 4.05%; unattributed: 0% | `bc438343c3e681849df890758e3fd2d25659038c0f88100de75c9f478ccdafd3` / `46d487fa6cd12db9bb7459788c447d71e94b004132c82becd1009b71b93a27bf` / `ad27d58c5050f70e841c18c064686c915100f60591927915592df82540e40603` |
| 1 / `Karman-800x500-own-dpr2-seed5-a1.trace` | 33606 | 0.834625 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 3.94% | `3ed70674ab18c25bd3bf8b8ad43dc76ba9b3609781fb06b419199b892e1a7957` / `152df302f1aea7fd836c892efb5e6339b32068d83e1956ecdbdcb8279d9c6447` / `51b706acc95336faa28b182730f329cf22b043fc3561ca3e772b908b60cafaf5` |
| 1 / `TeslaValve-1440x900-own-dpr2-seed5-a1.trace` | 33606 | 2.907583 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.25% | `6900a296d32eff6cb3d70951c83d73b29252f4ad837071925a731d20cde3e7b0` / `f2d256cd9a3ced00eba019add1dac13cc3d2951a1428cb0811aa3c8cf68d41bb` / `36c11be3084abf4e0543109d928e3f4acabaa0d938ccebba45aa6725f8c9fdf5` |
| 1 / `TeslaValve-800x500-own-dpr2-seed5-a1.trace` | 33606 | 0.705166 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4% | `43cb9351fad9bd3a3c468200e930ee76a033dd4bb1f8c37415ae2805ebc83233` / `4296ee4921f7bbb3102ebe7318968c9493d11541aa6a93c9f4d8086a3afa2b63` / `77099574a6696120be7b214129eeaa2c503e646e9dd7e155987cd3232b30e4b4` |
| 1 / `Karman-1440x900-shared-dpr2-seed5-a1.trace` | 33606 | 2.558334 / 0 | 60 / 60:60 | 0.052000 / 0.029000% | WindowServer (397): 4.22%; unattributed: 0% | `0457071dbbc7413ba435f10fefaddf3eeacabab49fbc58fdb02c58206ad18905` / `386c6dfef64d0b50056d42f92f59d5223c95f7a99159abe588dd2550352a106b` / `35a5218a034b0ee4f65d0f349a8343e25536c4354cfc114aaae1a5c9cdc3bbd7` |
| 1 / `GasFlare-1440x900-shared-dpr2-seed5-a1.trace` | 33606 | 3.951083 / 0 | 60 / 60:60 | 0.195000 / 0.138000% | WindowServer (397): 4.17%; unattributed: 0.02% | `5dc4eda0d1a9465a2ce687650824502d34e57bebf3a98761f2601cdd82f70e5e` / `cd3db60677277d170e3506739d846ee8b479425c8e8f0ea884e8ffc2eea3262b` / `022589d6aa4b1df459801101b18d45d62ac0d61d926138f84a312ea409ea902d` |
| 1 / `LavaLamp-1440x900-shared-dpr2-seed5-a1.trace` | 33606 | 1.683083 / 0 | 60 / 60:60 | 0.000000 / 0.000000% | WindowServer (397): 4.19% | `32e1de9f8ba0c526700b20d358fc454aadfe4a926ddc96d5c25aeba078909e6d` / `b5a93bd6519715822b9e4cb09347a3c742b1dd33c9cbee504a71b2fe44f4e486` / `a6ae34de58acd0ead295bd1b0b2208a2fbe741a286f19105f0850846022f18fc` |
| 1 / `default-1440x900-shared-dpr2-seed5-a1.trace` | 33606 | 0.874333 / 0 | 60 / 60:60 | 0.119000 / 0.093000% | WindowServer (397): 4.4%; unattributed: 0%; loginwindow (401): 0.01% | `36daf4e9db56c114b012d45d3be3cc55eba8a271a0e412263980120e411bdcf4` / `23dc3b6394f33e43ea668e4d42d20f2f03aad98dd29076bb781b3e0fea0dc772` / `0bbeb0067a4d3bac847f7d845de717e44ae687a2e46ead8f72389ac390177bbf` |
| 1 / `Karman-480.25x300.5-own-dpr2-seed5-a1.trace` | 33606 | 25.957166 / — | 0 / 0:0 | 0.000000 / 0.000000% | none attributed | `c93c361a24df16d946e1c8bd8a7c5af9c82e61028ba9154d0f0049400f621840` / `5063611bf9983b0b2d43a769ca1d7de59bee643a8a3cd764daf5fcfc4a6a804c` / `94a26be6815df137fed0bf74200c26df2bab5f5b6799c8e74a8946c0e5214e82` |
| 1 / `modelbutton-232x68-shared-dpr2-a1.trace` | 33606 | 1.369917 / 0 | 60 / 60:60 | 0.001000 / 0.001000% | WindowServer (397): 4.39%; unattributed: 0% | `2d70478d1bd4a5ebee8c255d57977b72741a1ddb72c3dd5346ea463627e30b42` / `356abace8e7706bdac2f264324ffa6170afd0cedfb92c8318086e74c9c06aaa2` / `c93bbd00b546fe230bd9f410170b601bd1941e9dbca6061a05850ae02e01c990` |
| 1 / `modelwidebutton-492x76-shared-dpr2-a1.trace` | 33606 | 0.186500 / 0 | 60 / 60:60 | 0.000000 / 0.000000% | WindowServer (397): 4.77% | `6b097af9e275bb661838ef0e965e0702056c6cd7aab557c630942d44545c3d99` / `a967f6b40d2c3b1ce6211582d6b216c70ea20a56ad5b00dffbd84e3ff7b5d5ca` / `8cf390e7b7ff166e62e88659fec128c6064f6fa22fc1ca6e50ad8787700979a7` |
| 1 / `modelsegmented-372x68-shared-dpr2-a1.trace` | 33606 | 2.055125 / 0 | 60 / 60:60 | 0.000000 / 0.000000% | WindowServer (397): 4.4% | `850a51f45dc97e6ff412f78d5be938225f3d5227f40e1dc84e243786ba8407f7` / `c63be9c22a9167662d637cc4fb60e0f063a5beb55623f0ac39bb436aba7e7fd0` / `f6042e31f06aa4b983631da9020e2f634907c18ebab93f29310263caba4c2038` |
| 1 / `modeldropzone-492x212-shared-dpr2-a1.trace` | 33606 | 3.158834 / 0 | 60 / 60:60 | 0.000000 / 0.000000% | WindowServer (397): 3.95% | `fc0f476f01a4b035f7ced17a7571d74c5db9c3a571f2c846488a662a13c9567e` / `768b1d41b7fd82efe90f1232062489c772f3f53e1847b7943372889c99c258c8` / `51374930e73c00f8b3ddbf04dc9bca117e5563818ea4a9673d25fafa95587d92` |
| 1 / `modelcaustics-720x400-shared-dpr2-a1.trace` | 33606 | 0.774750 / 0 | 60 / 60:60 | 0.000000 / 0.000000% | WindowServer (397): 4.36% | `4c8497aa2e2ba11e997bf416c6788b394b1f02f57b6606496e154dcbac8e606e` / `2f35e5b348e0eb023d695c075454955c9d79d62ba28bf9aeae0cb3ed4dab31b7` / `0aea2a0589c51fba86cd700e238d22e5afa0835fcccc2de6b209be78d63e55ed` |
| 1 / `modelenamel96-1x1-shared-dpr2-a1.trace` | 33606 | 1.734708 / 0 | 60 / 60:60 | 0.000000 / 0.000000% | WindowServer (397): 4.1%; unattributed: 0% | `1e7b56d2732168421eb4a2e04f7d7ecad2afba99735394dfa749388da38ad660` / `4952971a514b51681159205be74c7375d208e0528bfb376975aef117695a9c08` / `55c2d899b66097c06b13ac212c9d259d61e6c1ff300371cebf6b0ab6e5d14475` |
| 1 / `modelenamel64-1x1-shared-dpr2-a1.trace` | 33606 | 1.418542 / 0 | 60 / 60:60 | 0.000000 / 0.000000% | WindowServer (397): 4.56%; unattributed: 0% | `e33320eba4ad245f86a8c92fb873335bcda9bc36ee11a6bb114dd0c36c617a51` / `213eedca97ad01446a24a5967c63a088757b31e3d34e58a67be3b4d1ab5bb170` / `06287135baa9e6ca0827c079163742ff5dcd06442de2e3b9905acb246fc7ac74` |
| 1 / `modelinkpaper-800x500-shared-dpr2-a1.trace` | 33606 | 0.897167 / 0 | 60 / 60:60 | 0.000000 / 0.000000% | WindowServer (397): 4.11% | `c4eb5071f12e5fcd0ea9cde8add918a705f50d1d261518f7f7f859827f668f8f` / `76756413ec8f3936be62cc4d7820f46ce28c43323166be63b7e6c5d721ad46e3` / `d21a08ce8fecc796de9336a1613dcf1eaf12fe6b4383f9467b38d7a780270e4c` |
| 2 / `default-1440x900-own-dpr2-seed5-a1.trace` | 57447 | 0.156208 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 3.98% | `c20856d721ee90e7a71a2c30cd2c4101775279be6654ec8c9653bbeda6899cf4` / `5da271a2fedfb7d61e7ea2fb620197fbb78611b156acaaceb0d081ddb66eca8d` / `4756993d0a0a2928ea4b30ddbff0893dfd7f03e8aab9501cd78b7bd1083542da` |
| 2 / `default-800x500-own-dpr2-seed5-a1.trace` | 57447 | 0.112500 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 3.9% | `966f5699be983057ada15bfc1a91d97c4237afe6b42375c2585acdd3f2d9b32c` / `46e477eae2539184efa55ca766e23102f714523b29c1676216f331025f8dd178` / `885ca9a09e19dd26d5045cdfec495cb6a5d3038e1b257b42b983640a88f23e99` |
| 2 / `LavaLamp-1440x900-own-dpr2-seed5-a1.trace` | 57447 | 0.257000 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 3.84% | `b4f67df4dc2c10f99efc551709eddb31c4012374415ccfc1601a957fbb2d8a1f` / `1dbed6799398186e3396921b680df044f6c152f64d42f8f791524429fa8083f5` / `90890663a7b19a5f3b391a10f36933aca6b8cb7f8a2c8a11e4af66b094becdfc` |
| 2 / `LavaLamp-800x500-own-dpr2-seed5-a1.trace` | 57447 | 0.298542 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 3.76% | `698113cf8aa38ab4aee8785e9a12bc3ad3fda258dcb9ef1d86b6c64af796a053` / `93987b7b2b173efada25d1e7c3a21260441a07f8e3fa1f67699a890cfda800e6` / `4217c8e9bbde8a28ee5905cecf1b9bf6892642242bca194f08efeaf2620f8bae` |
| 2 / `Plasma-1440x900-own-dpr2-seed5-a1.trace` | 57447 | 0.146000 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.24% | `77698978cce8ca7da13bebf996fdb52615827908fd3a999d422b75ed3d3b5fe8` / `02c14e086d0ea9a3be8feaf6f181c3ea2588e6db9c10ec79abfb5dfd9ebec513` / `304a2e3585dfebf66f14d4ad3013fac05234f0909a1f1134672c0991623b6756` |
| 2 / `Plasma-800x500-own-dpr2-seed5-a1.trace` | 57447 | 0.214708 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 3.93% | `3292f01027b770216cdf541c337f6c520feb84493c6377f0547eaa2c336f98a5` / `fd445c72e7187592bea524d29d8ee45a1b6bd83330affabc31f7ea76b3504760` / `703c89f11642c36fb6bf36818a5e6cb7b857e62548aa28ea372921527563ea98` |
| 2 / `InkInWater-1440x900-own-dpr2-seed5-a1.trace` | 57447 | 0.157917 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 3.92% | `c324b9f48b8dd1149b8f32ba557b99a3dd5a96b7c0df9791f2355099809e105c` / `99601e2e918671c26158fed83913754b2ff8c7ff322a8f2bec99100808b07a27` / `7c18182a5b6057dcac26cba4a33301d25a7d596affbaebd5bd6be81ad320e94d` |
| 2 / `InkInWater-800x500-own-dpr2-seed5-a1.trace` | 57447 | 0.258666 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 3.92% | `bc40317444baee4f8ca08113c12f8145818d3aff9544dc87420b32a2b9457f97` / `24f7bf0baf1d2c72f732886b48409aa9af6bf15cad04abb55a13ffc24e26c574` / `553de2d07d6b9104e7a7430ae2f8a0c78c0343e03374f8e10c804fd69f81d29c` |
| 2 / `FrozenSwirl-1440x900-own-dpr2-seed5-a1.trace` | 57447 | 0.137958 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 3.95% | `04c5d2f57545cc93612cd0bb7cec9ff6c566ea23b78772e58b74cd3298b8231f` / `f0fae0748aead767fb509f1d15b263e24f6e087d86f0740696fc2b55390c2da2` / `1ab75e27277fa5f532b413466cd8821c921dc2791728bf8af7aacb9216a6f481` |
| 2 / `FrozenSwirl-800x500-own-dpr2-seed5-a1.trace` | 57447 | 0.241459 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 3.93% | `2c4e0e04b148330c942a29c81ce5bac9c6a6fb3c8b9a35195975cc718f8ba4ac` / `be14373565ec5bb49196629054dddde21addc00a1201beca02243f7960df4346` / `12d13f9aa0b477b543c06c9cd0386bb7fe54653a0099f9c8010f71912a6f72f1` |
| 2 / `Aurora-1440x900-own-dpr2-seed5-a1.trace` | 57447 | 0.156625 / 0 | 60 / 0:0 | 2.118000 / 2.214000% | WindowServer (397): 3.97%; loginwindow (401): 0.27%; Google Chrome Helper (64045): 1.4% | `1868791f101103235d6e520859f38945d1e8ceb8ea925b67961d8c6c54267636` / `cb378f6fe5cd7e67e4ef5e186471fb8b0dd55ddfc95856b79d9dd9d00e217dc3` / `185ed1cb9fcd2fb5a83ce4605ac74b444dbb3782ded9c20fb2e67701cc66614d` |
| 2 / `Aurora-800x500-own-dpr2-seed5-a1.trace` | 57447 | 0.202000 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 3.85% | `1d60344f2a3b2732c17612a52e7da6967d8390b7155af7cd1aecdd0f188a5d76` / `242878180e4caf8ccab51b3c32c30e12428acec3eb9a71fe341cfb420b327d60` / `aacdbc32e8c2972d7b5fd5b62f54b6979041f3e8f8d1da96730ddcab79f4a28d` |
| 2 / `CircularFluid-1440x900-own-dpr2-seed5-a1.trace` | 57447 | 0.292583 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.21% | `cd2b36ee38a9ba2641c64a6b9c4adceb27898f670acf97b3d465abbbbf3243bf` / `60aa91ff180bfc6aced5f9dc23490d5454f31f2d1fd7b8fa731ecb96e056cd13` / `5d33ff6f7480eeccb263111a1de3df61c7d046fcbda21382ba43416d7d8c1e1a` |
| 2 / `CircularFluid-800x500-own-dpr2-seed5-a1.trace` | 57447 | 0.215125 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 3.91% | `c2af602b9561f9294bbadca313d63f8af10bd9ceebff3aa76eed5a39ff9fe9ad` / `e3e50cd5bebd18aed0eda0546b072264b9955d87b6268725bda7f6cc605f939a` / `ac99a909525f365f5471bdf9dadc3e439b2e28c35728f7faa5591a82aeee3532` |
| 2 / `FrameFluid-1440x900-own-dpr2-seed5-a1.trace` | 57447 | 0.263291 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 3.99% | `211c198fef55fe678294c209e58a29e780b98f819e8eb361489d9a3bd1f76556` / `3d62cabd5b228bc773e2d443a14feff9585c3e28845a1f379871f1318ac58355` / `80921db92344580514d0ae2a11f4c835d179e57299793c8712bc5c0d67a0af70` |
| 2 / `FrameFluid-800x500-own-dpr2-seed5-a1.trace` | 57447 | 0.124542 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.33% | `8f84ad6550b73b777f3b6bb1e244c8911605f488b142380bef77f7ebaef0b37c` / `a2516c4112da8bbbfe8400a36bc59ad4c1e2ca06e4140076a176bc6cdb91aa3e` / `478c5715b81afdcf02ddaf3eec00030d65b1fa1e1cfe94e271cff261530915d8` |
| 2 / `AnnularFluid-1440x900-own-dpr2-seed5-a1.trace` | 57447 | 0.233750 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.13% | `78887942ef525cc15cfbe0213f5bda87fde52027a35d968351552b5e4207290a` / `b1dfc917098d92ebb991d0830e610e71166342011faf0bcc1cfde431c64b92cd` / `fef644f4bc57262984b49c33e154373949b844ca1bb00a5caf1a9098caf4f507` |
| 2 / `AnnularFluid-800x500-own-dpr2-seed5-a1.trace` | 57447 | 0.222625 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 3.87% | `15c12f40145828e7168576c228bf45b756172c6a70327cfd9f8a42aba667b25f` / `97362b2ea700875611263426dd6959dc443305f44efbd974869493e0b4e2e05e` / `3a0e726b8c6fde3a108bb876de4326a02865349e051ab04a79240620613144f5` |
| 2 / `SvgPathFluid-1440x900-own-dpr2-seed5-a1.trace` | 57447 | 0.211083 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.08% | `51bf81582b5a8f0f578a7d6f5159245324722249b48fe68c50e457dde8784a98` / `496d873381c90341bd450feab34377bff80584a23db65eb5b659d347fc9557bb` / `472c89cdd5b53e9b6461983f768606d5db19f60f0d0e3de137de08c3175bd796` |
| 2 / `SvgPathFluid-800x500-own-dpr2-seed5-a1.trace` | 57447 | 0.204958 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.03% | `abe27070666a3ee9c32e5cac3a2559894eb4077b6f1ca3fee633bc699af7dc35` / `685b483a6a419b81ef03ff8f5a5887a4ff151d7de1138e2bee658ae7401affcc` / `30f6af6cf541eb0dc6c4a81b56d4156c7b13515c65a407e0adaa37767048c214` |
| 2 / `Toroidal-1440x900-own-dpr2-seed5-a1.trace` | 57447 | 0.152833 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.13% | `e8363f5ca269a2bbc59f642fe55c2a5c1d7c6210df33bb620d515e627d3b0daf` / `bfc7ce6fb4a0778792a8314a534c284323ee15ccb4cae2bec992066a910076cf` / `dcdb6e0200d8b1811eb641ac21e8c61e16b3b23b8c34522ea37b3feccd2c7512` |
| 2 / `Toroidal-800x500-own-dpr2-seed5-a1.trace` | 57447 | 0.466500 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.26% | `7725e22306829cba9cd595cacafe0719428ee7198d08e52b6d00fface61bf6f3` / `e0fc7c56e4744b2c14e0769b1abce5994055a088731eb2757e4995d56958c020` / `cc7bb005b83b74532042416975494e224035c2ce63519c5cd4136caa85fa462f` |
| 2 / `GasFlare-1440x900-own-dpr2-seed5-a1.trace` | 57447 | 0.740042 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.12% | `48c3b72d2311888b8fea2dd58dc8a8fee8ee7a7bd9bee41a1dd7e04ad0d80805` / `cd7aa573efc1dea63b3d85de478bf018e4e420275f9eb2ce913682e3e8be5a14` / `3c56ef062bce162e0c98d4a71424df5eb15fcc408165c7599ef15e1591642a7d` |
| 2 / `GasFlare-800x500-own-dpr2-seed5-a1.trace` | 57447 | 0.311000 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.27% | `e76b36cfa1a4decf3dd39234866c62822c3b99cbef4efb9a387f1b3dc94f0bbb` / `54ec3338923f82b0397858631186a28d2c2b8c372b04855e63dba252791ce4d5` / `1855f01877015b617f78491009fb72bf5a25ce9367c516d405445893afbe08e7` |
| 2 / `Venturi-1440x900-own-dpr2-seed5-a1.trace` | 57447 | 1.905333 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.1% | `821f23d3233b6271749fc39161d7936605fc344bea1827f4b47c3ba8fb68fcad` / `52a6a48c44158d82340d9050be6692acad777ed9757cc317484ab57ebee6c862` / `25309687b816cdaafec96d853062de0fa432d354371fac104db433dde32238f1` |
| 2 / `Venturi-800x500-own-dpr2-seed5-a1.trace` | 57447 | 4.610792 / — | 0 / 0:0 | 0.000000 / 0.000000% | none attributed | `c34879d2a058f329210d4c970606b1f375cef4a01f0050d3c303ad63d7963f60` / `cf31797c1b33bb19ea1fd5fe1aa7542f3f8b84b0ef86ed855246e70c424f577b` / `9495a2baf2e44b456f8337716e466b837c7f4f89284bcb6cc07fb5042eaacdfe` |
| 2 / `Karman-1440x900-own-dpr2-seed5-a1.trace` | 57447 | 1.752958 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.26% | `bdb1b84e2db298169c66b20c8769d386ddd56d991e35f2e2aef6e8b041d459e7` / `a89bc01422146e5a39c6ff0ce5953dd688b9b533dd2ebff6f68c28a05f596a56` / `3f11d52b2479afadde43412ffcda4db8f456c8f7bea55c595f9bc36271e425bd` |
| 2 / `Karman-800x500-own-dpr2-seed5-a1.trace` | 57447 | 0.841167 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.05% | `4121dcd3428caae3ad82f112f9e7ba040c0c44d130a23d20fa262daaa76d031d` / `c6f923efcf1eadd13011609619425ad96fd1c1408f543817b35c9b73ecd8fe35` / `7971fc0bd0ea1ce6c3eaf12f50c0d4aa70b93f9a7e96d5aea8056d6d7efda87f` |
| 2 / `TeslaValve-1440x900-own-dpr2-seed5-a1.trace` | 57447 | 0.152917 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 4.15% | `2f1008e99114467cd2d30db6378e1f172ebf0f763782fe467dec69ddc3763389` / `47b4898c9299c6446db806e85aa5564279f6107fc67e85355f059d096e2368f9` / `3de3b70c2140d9b91113bc947563cbef3d104ed4e3a73dbc10cedc2d28767cd8` |
| 2 / `TeslaValve-800x500-own-dpr2-seed5-a1.trace` | 57447 | 0.866000 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 3.97%; unattributed: 0% | `c375f0a935d2350fef5fb735769df5f3d3b9459fe2ad6c14de6d167a28bc0347` / `532de432814d49d05f8c1009aec86a695380dc1dd5abe3c62f22a4ed0505ff60` / `cf0b205798e6921fc52ed10ef0aabb5a2513c122ca01f5bd7ce061a60ab9eca2` |
| 2 / `Karman-1440x900-shared-dpr2-seed5-a1.trace` | 57447 | 3.401500 / 0 | 60 / 60:60 | 0.000000 / 0.000000% | WindowServer (397): 3.89% | `222bb75b4c7c94776a3ef661f46ae6f49d6df8383ec89ecace1ac5b08881a855` / `c62329c19c2d54e33838535ed4893042fe064180133669af1c6dfcc3fdff6655` / `93ed8ce459a56a97f17d97e5cbd93949f7e98360002cb9475c9b62c4e1f1bdd3` |
| 2 / `GasFlare-1440x900-shared-dpr2-seed5-a1.trace` | 57447 | 5.682792 / — | 0 / 60:60 | 0.000000 / 0.000000% | none attributed | `892962ad8c8d1ec28bd28c031c571a431cdc8965aaff00477d447c48335ae47b` / `869f3ae38eb5a4c831b57a685f93758795452c84768e93f7a4a38446c8f7dfde` / `0e4fedf46a2c86049d1ea9665c97e236495c3ffda276ed4ed33c1803e2a379c5` |
| 2 / `LavaLamp-1440x900-shared-dpr2-seed5-a1.trace` | 57447 | 2.269375 / 0 | 60 / 60:60 | 0.000000 / 0.000000% | WindowServer (397): 4.06% | `f056fc065a41cf583a4bbabae004f24b30293b5aa54c5c39afc1d50f2c7b9d71` / `ffe157d87e13da5711ae4922056d799787b71e6645b6d5a3f0d4899479ec8dc0` / `de354289596e5481f1874f609ec321da6a330f1e0f94a039376b8722811afbcc` |
| 2 / `default-1440x900-shared-dpr2-seed5-a1.trace` | 57447 | 0.938625 / 0 | 60 / 60:60 | 0.000000 / 0.000000% | WindowServer (397): 4.16% | `3bce63d53bc91d3278b36c6d1b375851ac2ebc537550ff025998702f6fc8b7e0` / `8e5516d83c411373c6e992ef340414d715dc3ccd6caf6e39e53f11bd822d1e95` / `9ac5781b21c1d7d72ebb9276f19fdb7ab556f8eea2dab455ef230703f2221694` |
| 2 / `Karman-480.25x300.5-own-dpr2-seed5-a1.trace` | 57447 | 1.511375 / 0 | 60 / 0:0 | 0.000000 / 0.000000% | WindowServer (397): 3.92% | `4439bdd52a88791930ddfcc085b2362360438bd022b2d7f39990ebafcbb39f90` / `00fc2672d3692dadbae0027b6020ce8c2c31993a04aae74be1280310fe01229d` / `f58574677d8922d88f2a2f029995e5d70650cc8f010d90b8d7699dbfbca5f301` |
| 2 / `modelbutton-232x68-shared-dpr2-a1.trace` | 57447 | 1.490667 / 0 | 60 / 60:60 | 0.000000 / 0.000000% | WindowServer (397): 4.74%; unattributed: 0% | `b05bf1f64d13ac4d3ba7e85d79dae8f20e39e63ed0b2e27f674a568dd8c40a6c` / `83a0611cea61ff33b00b84df85398c631755704ee1da997134fe6d9f9dfae0ad` / `5617013dc52dda5c4913c873be74794d7314f5bde9132b7de303e352914e1f5c` |
| 2 / `modelwidebutton-492x76-shared-dpr2-a1.trace` | 57447 | 0.672291 / 0 | 60 / 60:60 | 0.000000 / 0.000000% | WindowServer (397): 4.36% | `ca4a69f512c64229f0a6bd597c98281b3e8a6a7605cd86be0e71e4fb82f30076` / `aaacf87b2db3b1e81af656016093e1b47e98c1cfd94a737c68a46783cbb67cd9` / `0f388161718d0bcee57eaae6babc6d1da326b616d1439a9e8ab6f323c25deaa9` |
| 2 / `modelsegmented-372x68-shared-dpr2-a1.trace` | 57447 | 0.706916 / 0 | 60 / 60:60 | 0.000000 / 0.000000% | WindowServer (397): 4.2% | `097a2935d23554021152aa7b56a37cf0cb0d6525e47be4d05e78e546e13e410d` / `ccedff9a70dbcc43c43a17de84877dad0065c6102aa26f753b23f702e2323c69` / `3e217a16f70d2b2689f9f54e7758fc31177a8ccfc217bd4e5329e0411b6bcbb1` |
| 2 / `modeldropzone-492x212-shared-dpr2-a1.trace` | 57447 | 5.189791 / — | 0 / 60:60 | 0.000000 / 0.000000% | none attributed | `aa6d2e4203e5e0e31f6f09e5e6ce79a6a181d0a01a9e8a094e45f0de8ce22bc0` / `a2fe65365d31c9065b363dc82a6415fcfd002bb916efc49ffdbd59a2622993a9` / `3f4de6c16eeb1e54ebac41f00f1345ce4f60868969bd661d412d24b628b64db6` |
| 2 / `modelcaustics-720x400-shared-dpr2-a1.trace` | 57447 | 0.589750 / 0 | 60 / 60:60 | 0.000000 / 0.000000% | WindowServer (397): 4.11% | `780671af258a80f82fd11219b40ec7c129eb15a3ac6f4485d6e083c45946fc5e` / `fc5bb9ab2a48fd7377824a480d27e7fcdf75f480c90bfb1003a00a142ccdce0e` / `431fec8ca307b0f749d6538ba11cb752c65fc9932439123b698af7be84621956` |
| 2 / `modelenamel96-1x1-shared-dpr2-a1.trace` | 57447 | 0.660167 / 0 | 60 / 60:60 | 0.000000 / 0.000000% | WindowServer (397): 4.05%; unattributed: 0.01% | `d4e926b9cc939d863c6d6f68824dfc4a6a50859e6a0cd9fd0b51f35fb8ba9dff` / `54c324355a0d1074efc6e3f8a52c83d2e3d3c9ced67901c3e6aa4af98de26fae` / `3c9f8db034b37613684937bf55f662692980b9de3e05fb58490f8a6069072f7a` |
| 2 / `modelenamel64-1x1-shared-dpr2-a1.trace` | 57447 | 2.468292 / 0 | 60 / 60:60 | 0.091000 / 0.324000% | WindowServer (397): 4.16%; unattributed: 0.01% | `918b86a8d78d9e5fea378678d96c30e3f9048896b022856b1db000c2e8e6ff4c` / `1db3635f91a486403bf65327fb08285a60a28dc9fab4712d9bd0df329d6992a7` / `e8a0ed4bd25c75f196bb5ab486b451607de76996d5a78d5abd40a0757cb7bc03` |
| 2 / `modelinkpaper-800x500-shared-dpr2-a1.trace` | 57447 | 0.188625 / 0 | 60 / 60:60 | 0.000000 / 0.000000% | WindowServer (397): 4.13% | `dd1d66f226c6b140882f14c7c02b586a5c20e327f1324b2a37e9f4b9faebbcfd` / `46783a565d2141d7c83c9968c40750988e45cd2b869c0b30d9ecf362025c4531` / `2f246547a1e356017e5dc61959968cfc00e159244c8a31f1b2fbd506faa683fd` |

- `/tmp/post-opt-matrix/run1/capture.json` SHA256: `352a4f8d366a14a3148ffd6d7cac8b100804b0f08625e236966dec0949202df6`.

- `/tmp/post-opt-matrix/run2/capture.json` SHA256: `4a22d09937707e26b686308c52cb683243d2a4501729164eba559b09c6709b1e`.
### Unchanged own-tier variability

Own-tier FluidEngine and production shaders are unchanged by this optimisation round; fresh exceedances are observations of variance/protocol differences, not demonstrated optimisation regressions. This descriptive range uses **all clean, aligned own-tier attempts** from the listed historical and opt-solver baseline captures plus both post-opt invocations. Historical captures are unseeded; later captures use seed 5. Different sessions, seeds and coarse 60-frame tails prevent causal before/after inference. Rejected solver candidate captures are excluded; no favourable selection or extra capture.

Source set: `/tmp/gpu-capture/{native-matrix,components,retry-attribution}/capture.json`; `/tmp/opt-solver/before/capture.json`; `/tmp/opt-solver/sunrays-pairs/p{1,2,3}-baseline/capture.json`; `/tmp/post-opt-matrix/run{1,2}/capture.json`.

| Scene / CSS | Clean repeats | Historical clean p95 range | opt-solver baseline clean p95 range | Post-opt clean p95 range | All-source p95 range / spread ms |
|---|---:|---|---|---|---|
| (default) / 1440×900 | 7 | 1.994083–2.019707 | 2.002298–2.489502 | 2.004833–2.104833 | 1.994083–2.489502 / 0.495419 |
| (default) / 800×500 | 4 | 1.521668–1.633876 | not captured clean | 1.694335–2.164956 | 1.521668–2.164956 / 0.643288 |
| LavaLamp / 1440×900 | 4 | 1.886542–1.913081 | not captured clean | 1.968084–2.605166 | 1.886542–2.605166 / 0.718624 |
| LavaLamp / 800×500 | 3 | 1.347457–1.347457 | not captured clean | 1.121960–1.147374 | 1.121960–1.347457 / 0.225497 |
| Plasma / 1440×900 | 7 | 1.963205–2.320624 | 2.014168–3.018292 | 2.081414–2.081414 | 1.963205–3.018292 / 1.055087 |
| Plasma / 800×500 | 4 | 1.761500–1.982707 | not captured clean | 1.618959–1.963165 | 1.618959–1.982707 / 0.363748 |
| InkInWater / 1440×900 | 3 | 1.850708–1.850708 | not captured clean | 1.535794–2.092124 | 1.535794–2.092124 / 0.556330 |
| InkInWater / 800×500 | 7 | 1.110999–1.307624 | 1.123247–1.506167 | 1.157042–1.475792 | 1.110999–1.506167 / 0.395168 |
| FrozenSwirl / 1440×900 | 4 | 1.843875–1.934499 | not captured clean | 1.725292–2.121001 | 1.725292–2.121001 / 0.395709 |
| FrozenSwirl / 800×500 | 3 | 1.471293–1.471293 | not captured clean | 1.330081–1.566996 | 1.330081–1.566996 / 0.236915 |
| Aurora / 1440×900 | 6 | 1.976876–2.003499 | 2.102040–2.182081 | 2.061459–2.273917 | 1.976876–2.273917 / 0.297041 |
| Aurora / 800×500 | 2 | 1.594376–1.594376 | not captured clean | 1.652625–1.652625 | 1.594376–1.652625 / 0.058249 |
| CircularFluid / 1440×900 | 5 | 1.716374–1.764830 | 2.366544–2.366544 | 1.816669–2.120377 | 1.716374–2.366544 / 0.650170 |
| CircularFluid / 800×500 | 3 | 1.333876–1.333876 | not captured clean | 1.313707–1.655293 | 1.313707–1.655293 / 0.341586 |
| FrameFluid / 800×500 | 4 | 1.423374–1.438213 | not captured clean | 1.529001–1.737540 | 1.423374–1.737540 / 0.314166 |
| AnnularFluid / 1440×900 | 5 | 1.778706–2.056251 | 2.175497–2.175497 | 1.618626–2.174582 | 1.618626–2.175497 / 0.556871 |
| AnnularFluid / 800×500 | 4 | 1.271374–1.372332 | not captured clean | 1.275042–1.802290 | 1.271374–1.802290 / 0.530916 |
| SvgPathFluid / 1440×900 | 4 | 1.764871–1.781920 | not captured clean | 1.721711–1.831994 | 1.721711–1.831994 / 0.110283 |
| SvgPathFluid / 800×500 | 3 | 1.329873–1.329873 | not captured clean | 1.277502–1.284334 | 1.277502–1.329873 / 0.052371 |
| Toroidal / 1440×900 | 7 | 2.211372–2.211372 | 2.230125–3.808121 | 2.337250–2.341500 | 2.211372–3.808121 / 1.596749 |
| Toroidal / 800×500 | 4 | 1.787161–1.788251 | not captured clean | 2.036663–2.426627 | 1.787161–2.426627 / 0.639466 |
| GasFlare / 1440×900 | 4 | 2.443002–2.443002 | 4.129625–4.129625 | 2.818959–3.079914 | 2.443002–4.129625 / 1.686623 |
| GasFlare / 800×500 | 5 | 1.869623–1.932543 | 2.154250–2.154250 | 1.901959–2.403001 | 1.869623–2.403001 / 0.533378 |
| Venturi / 1440×900 | 7 | 1.680918–1.680918 | 1.681085–1.889750 | 2.309626–2.831168 | 1.680918–2.831168 / 1.150250 |
| Venturi / 800×500 | 3 | 1.172587–1.269710 | not captured clean | 1.564582–1.564582 | 1.172587–1.564582 / 0.391995 |
| Karman / 1440×900 | 4 | 2.720333–2.720333 | 3.806084–3.806084 | 3.474540–4.423709 | 2.720333–4.423709 / 1.703376 |
| Karman / 800×500 | 5 | 2.714040–2.901164 | 3.024126–3.024126 | 3.102959–3.373415 | 2.714040–3.373415 / 0.659375 |
| TeslaValve / 1440×900 | 4 | 2.732835–2.732835 | 4.128668–4.128668 | 2.738748–3.492625 | 2.732835–4.128668 / 1.395833 |
| TeslaValve / 800×500 | 5 | 2.424291–2.491166 | 2.487503–2.487503 | 2.650878–2.739666 | 2.424291–2.739666 / 0.315375 |
| Karman / 480.25×300.5 | 3 | 2.693667–2.693667 | 2.848210–2.848210 | 3.808042–3.808042 | 2.693667–3.808042 / 1.114375 |
| FrameFluid / 1440×900 | 3 | 1.883710–1.883710 | not captured clean | 2.069918–2.258918 | 1.883710–2.258918 / 0.375208 |

Comparison capture provenance (ephemeral raw data):

- `/tmp/gpu-capture/native-matrix/capture.json`: capture SHA `c1f93e1d77fba15dd3282cf97bb58a774b6593d7`; SHA256 `fed1748a23c40ebb7f0ba7671c0219fe2977f9cd92227e41ea477c3db8d91cc6`.
- `/tmp/gpu-capture/components/capture.json`: capture SHA `23ad9d3e75fbf3825993827445e0fdc734caf93a`; SHA256 `52f6352ce3c649ff53643a0db185e1eff9a72a37ae0b145dd23613dbddbbfbe8`.
- `/tmp/gpu-capture/retry-attribution/capture.json`: capture SHA `f932c7a636ad90ef17861bd5fa129258d67efc84`; SHA256 `6e5080658b04a5943ffb01edf256311392afaa532e42d835649f8eb57d7bcd81`.
- `/tmp/opt-solver/before/capture.json`: capture SHA `76bdaa255d34b68efc9284e08d9ed31565d9df27`; SHA256 `a7c50349ae41170ee98a0fd05babc90259ec7ed2249a233e353b3dfb2e72b1ac`.
- `/tmp/opt-solver/sunrays-pairs/p1-baseline/capture.json`: capture SHA `869152762b697fa1bb97638cce8d9f65d08fc0d5`; SHA256 `f53d7c01b60e66ada1a2cc484af08bc9454f1cb7c472a8ad47cf2ee285e528b9`.
- `/tmp/opt-solver/sunrays-pairs/p2-baseline/capture.json`: capture SHA `869152762b697fa1bb97638cce8d9f65d08fc0d5`; SHA256 `8372cb2c1cf92acc7db4c4f146f8fc659a8602e2150effad3bc52539471fc89c`.
- `/tmp/opt-solver/sunrays-pairs/p3-baseline/capture.json`: capture SHA `869152762b697fa1bb97638cce8d9f65d08fc0d5`; SHA256 `2f0b317f88e8fcdf544530b21d4fed6d0348fa6cd5f917d621656bf20e1347b1`.
### Checks, cleanup and retained resources

`bun scripts/gpu-capture.mjs --self-check`, `bun run test && bun run check` passed: **52 Node files / 864 tests**, **471 checked files / 0 errors / 0 warnings**. `bun run prepack` passed publint and strict public declarations; existing `import.meta.env` advisory retained. `git diff --check` passed. Captures supply native hardware evidence, not a full release/browser-suite rerun. Initial run1 Vite reported the not-yet-generated `.svelte-kit/tsconfig.json` and existing missing SplashCursor dependency-scan advisory; static measurement pages still completed. No runtime/preset/script fixes made.

Ownership: `/tmp/svelte-fluid-gpu.lock` acquired with lane/worktree/SHA owner file before run1, retained through run2, released after both captures closed. Run1 Bun **33589**, Vite **33592**, Chrome GPU **33606**; run2 Bun **57419**, Vite **57425**, Chrome GPU **57447**. Playwright closed each owned browser and contexts; unchanged script stopped every recorder by exact owned handle/PID, awaited completion, closed notifyutil handles, killed and awaited owned Bun/Vite. Final exact-PID census confirms captured owned descendants gone; no xctrace, gpu-capture or port5198 listener remains. User Chrome **4386/4411**, foreign Chrome-for-Testing **48074** remain alive, untouched. Process ownership snapshots stay machine-local under each run directory.

Worktree and ignored `node_modules` symlink retained: work not remotely preserved, so no worktree removal. Symlink targets `/Users/admin/Projects/personal-archive/fluid-project/svelte-fluid/.claude/worktrees/integrate-main/node_modules`, never staged. Raw traces, logs, aggregation checks and process snapshots remain `/tmp/post-opt-matrix/` only; ephemeral, not durable archived binaries. No tracker writes, installs, push, merge or foreign process signals.

## Pre-registered stable measurement protocol — 2026-10-06

Owner decision: **“Stabilise measurement, then sweep.”** [ADR 0105](../decisions/0105-stable-gpu-budget-protocol.md)
amends ADR 0101 sampling, fixed **before any new sweep or feasibility pilot**.
Default **600 measured frames × three independent fresh-Chrome runs**, **200 warm-up**,
seed **5**, native DPR, fixed dt, three-RAF pacing. p95 sorted index **569**
(31st-worst), not pooled across runs. PASS requires all three runs clean for each
requested seed, each p95 **<2 ms**; any clean failure persists, missing clean runs
cannot certify PASS. Report per-run median/p95/max and their clean min/max/range.
Attribution/gates unchanged: Metal interval union, <4 ms alignment, exactly 600
clusters/native writes, zero strays, 600 shared/model transfers, ≥5% foreign
overlap CONTENDED. Preserve all attempts; bounded contention retry only.

Existing 31-scene / 136-clean-own-repeat frame arrays, no new captures: 2,000
conditional bootstraps per run, seed 5. IID median p95 SD **0.120444 → 0.036563 ms**
(60 → 600), circular five-frame blocks **0.130325 → 0.033368 ms**; IID central-95%
width **0.3224 → 0.0788 ms**. N=1200 adds only 0.014016 ms median SD reduction
for twice the capture time. Empirical tails/systematic between-run variation
remain: historical median scene spread **0.530916 ms**, maximum **1.703376 ms**;
27 same-seed post-opt pairs differ by median **0.318750 ms**, max **0.949169 ms**.
No promise to resolve every 0.08 ms gap; no retrospective PASS reclassification.

`bun scripts/gpu-capture.mjs` now uses the registered default; explicit
`--frames N` / `GPU_CAPTURE_FRAMES`, `--runs R` / `GPU_CAPTURE_RUNS` overrides
are experimental. `--legacy` retains 60/1 and the 10 s ceiling for comparison.
Separate output directories required. `--replay` honors recorded run count.
`xctrace help record` confirms `--time-limit` and rolling `--window`; no window
used. Three RAFs mean **30 s** measurement at 60 Hz, 15 s at 120 Hz for N=600;
raise default ceiling to **70 s**, stop early. Pilot restricted to Karman own
1440×900; no full matrix authorized here.

### Pre-sweep capture implementation validation

Registration committed **`bb6f3b46cfd1ffceac951c120f9d77b57251c1ec`** before
pilot data. Initial Karman run2 exposed three 8 ms submit stalls splitting
40-encoder frames into 16+24 under the old 6 ms heuristic. ADR 0105 records the
pre-sweep correction **`max(10.75 ms, 0.4 × median JS mark spacing)`**, derived
from existing replay gap distributions, not preset timing/quality outcomes.
Keep <4 ms alignment, exact N clusters/writes, zero strays and transfer gates.
Report original 6 ms burst counts/disagreements. The unique-native-write-terminator
alternative was rejected: a frame writes the same IOSurface in both early and
final command buffers.

206 trace entries inspected, **197 historical 60-frame + two 600-frame pilot
traces replayable**, seven lack marks/ownership or have zero marks. Every
previously aligned 60-frame command-buffer assignment remains identical; three
old INCONCLUSIVE rows recover split bursts (GasFlare pass-log, post-opt run1
Plasma, solver p3-baseline default). Original evidence/verdict tables untouched.
25,838 intra-frame gaps: median **0.486208**, p95 **1.170375**, p99 **2.367667**,
max **8.571334 ms**. 12,467 inter-frame gaps: min **12.915791**, p01 **18.794166**,
median **24.031750**, p95 **25.832625 ms**. Floor midpoint 10.75 ms gives observed
margins **2.178666 / 2.165791 ms**; cached replay matches the trial 12 ms floor.
Future split/merge ambiguity stays INCONCLUSIVE, never a relaxed alignment gate.

Original pilot run1: p95 **3.583163 ms**, alignment **2.564792 ms**, 600 clusters/
native writes, trace ~108 MiB, exports ~50.8 MiB. Original run2 now replays at
**3.365292 ms**, alignment **2.711333 ms**, 600 clusters/writes, three old-gap
disagreements. Original run3 reached the 70 s ceiling after ~75 frames then no
submissions; its JS marks were not recoverable, **INCONCLUSIVE**. No claimed
visibility cause. Add progressive marks, visibility/focus telemetry, 2 s wait
bounds and 62 s page-evaluation deadline; partial attempts close the owned page.
A first corrected pilot completed 600 visible/focused marks then hit a Playwright
binding-cleanup API mismatch; preserved as a harness failure, no budget verdict.
Mechanical binding fix precedes fresh validation. A subsequent corrected
invocation retained two valid runs (p95 3.361003 / 3.530919 ms); run3 lost its
attached GPU target after 1.393218 s (TOC “Target app exited”) and an uncovered
phase hung. Preserve that failure; no implied quality improvement.

Mechanical hardening before any sweep: **90 s outer attempt deadline**, explicit
phase-progress files, AbortController, exact PID+command owned cleanup, partial
INCONCLUSIVE rows and next-attempt continuation. Five minutes without a completed
attempt saves partial results and exits nonzero. Attached GPU PID exits detected
during startup/measurement; async exports have 15 s timeout. Trace parsing runs
in a short-lived Bun worker (60 s bound), preventing ~2 GiB parsed-XML RSS remaining
in the Chrome-owning parent. Self-check simulates a never-resolving phase and
asserts cleanup. Parent RSS logged before each browser launch. Memory pressure
as a cause of earlier GPU exits is unproved. Visible unoccluded headed Chrome
required; no system focus takeover or foreign process signals.

Before matrix data, ADR 0105 additionally registers **GPU-process-exit retries:
two extra attempts maximum per run slot**, each preserved, 30 s wait. Never
retry/discard clean FAIL; R=3 distinct clean slots required, otherwise
**INCOMPLETE** (observed failures still visible). One contention retry unchanged.
Fresh temporary Playwright browser profile per attempt, close context/browser,
`Bun.gc(true)`; log RSS and ordinary Chrome stderr. Six Karman-only slots diagnose
exit position/rate, not quality tuning. No matching Chrome crash/hang diagnostic
report at pilot times; earlier user-Chrome disk-write advisory unrelated.

### Final Karman-only feasibility evidence

Final harness **`5b2b6c7`**, six diagnostic slots (not a matrix), explicit
`GPU_CAPTURE_CASES='Karman@1440x900:own:2'`, seed 5, N600/W200, native backing
2880×1800. The first three slots satisfy the registered R3 pilot; all six stay
visible. **Six clean FAIL, zero GPU target exits, zero retries, zero incomplete
attempts**. Each has 600 clusters, 600 native-write frames, zero strays, zero
foreign overlap; own tier correctly has 0 requested/delivered bitmap transfers.
All visibility telemetry remained visible/focused. Old 6 ms cluster disagreements
zero in this final sequence; original split pilot remains retained separately.

| Slot | Median ms | p95 ms | Max ms | Alignment ms | Recording s (TOC) | Trace MiB | Export XML MiB |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 2.255665 | 3.126041 | 4.793500 | 0.278917 | 18.749825 | 112.992 | 50.913 |
| 2 | 2.248084 | 3.168251 | 4.751127 | 0.300500 | 18.495741 | 108.641 | 50.826 |
| 3 | 2.256706 | 3.402249 | 4.859001 | 0.266833 | 18.510272 | 108.734 | 50.663 |
| 4 | 2.251252 | 3.151416 | 4.798876 | 0.241500 | 18.525502 | 108.621 | 50.791 |
| 5 | 2.271123 | 3.140417 | 4.700875 | 0.296917 | 18.514655 | 108.922 | 50.817 |
| 6 | 2.244415 | 3.117415 | 4.841292 | 0.329417 | 18.553634 | 108.668 | 50.797 |

Cross-slot ranges: median **0.026708 ms**, p95 **0.284834 ms**, max **0.158126 ms**.
Longer captures do not erase environmental variation or make Karman fit 2 ms.
Parent launch RSS MiB: **124.00 / 172.34 / 176.98 / 177.78 / 177.88 / 178.765**:
plateau after initial warm-up, not the previous 40–50 MiB/attempt growth. No
re-exec guard needed on this evidence; future memory growth stays observable.
Chrome stderr contains ordinary updater/GCM diagnostics, no GPU crash/watchdog
reason in the successful sequence. No matching crash report explains prior exits;
position correlation disappeared after cleanup/GC/logging changes, not proof of
which change caused it. Zero of six cannot establish a low long-run failure rate
(one-sided 95% binomial upper bound ~39.3%). Infrastructure retries remain bounded.

Measured spans **16.753–16.785 s** at ~120 Hz; native recording **18.496–18.750 s**;
recorder wall including Instruments finalisation **34.271–41.684 s**. Total driver
**333.770 s / six =55.628 s per slot** including exports/browser setup. Estimated
historical 43-scene × R3 matrix **~119.6 min**, default 30-scene × R3 **~83.4 min**,
no retries; 43×3 native traces roughly **14 GiB**, XML exported one-at-a-time in
short-lived workers, not held by the parent. Other workloads, 60 Hz pacing and
retries add time; allow ~2–2.5 h, not a promise. No matrix run in this task.

Evidence: `/tmp/stable-protocol-six/{capture.json,pilot.log,summary.json}`, six
TOCs, frame details/progress/analysis JSON, raw traces and exact owned process
census. Earlier failed pilots stay `/tmp/stable-protocol-{pilot,fresh,fresh2,final}/`;
replay/variance evidence `/tmp/stable-protocol-replay-all/` and
`/tmp/stable-protocol-variance.{mjs,json}`. Ephemeral raw data, not archived binaries.
All final owned Chrome/xctrace/Bun/Vite/parser descendants absent by exact PID+
command census; port5198 listener gone, GPU lock released after verification.
User Chrome4386/GPU4411 alive, untouched. Worktree and ignored dependency symlink
retained: not remotely preserved. No tracker writes, runtime changes, installs,
push, merge or foreign process signals.

Checks: 52 Node files / **864 tests**; **471 checked files, zero errors/warnings**;
prepack publint/public declarations pass (existing `import.meta.env` advisory),
self-check including simulated never-resolving deadline cleanup, historical
`--replay`, `git diff --check` pass.

Additional provenance SHA256s:

- run1 client census: `a32f9fb133603fdff442b5655eb93b826b8a7b304466e22dd77b7e3d4dbcf93e`.
- run2 client census: `574b39b808a2e32eaccc780b419e511f1d707604f2206077136857eb15945e03`.
- `/tmp/post-opt-matrix/check.log`: `eeb7a1149cc141585c9950716e87e9d389b213269dd99257418d6c001d264e1b`.
- `/tmp/post-opt-matrix/prepack.log`: `cde34c9d98421d34ca7c3adef1459abec579faf9cc16da17977618c135b31bf1`.

## Stable protocol full matrix (ADR 0105) — 2026-10-06

**Post-matrix bounds note — 2026-10-06:** harness exports now allow 90 s
(previously 15 s); analysis worker 300 s (previously 60 s); default attempt
610 s (previously 130 s), reserving 180 s finalisation plus analysis;
default watchdog 670 s (previously 300 s). See ADR 0105's dated amendment.
Karman shared r2 spent approximately 109 s in recorder finalisation before
its attempt deadline, after 600 marks; recorder completion time is unknown.
SvgPathFluid own 800×500 r1 offline replay completed exports/analysis in
66.858676 s, diagnostic p95 1.285122 ms, verdict **INCONCLUSIVE** because the
recorded error/failed transfer gate remains. **DIAGNOSTIC only; all live matrix
tables, verdicts and measurement gates below remain unchanged.**

### WIP: registered capture started

Measurement checkout **`fbec39a59fd39c3bdae40bdb7add2103d7104a5e`**, branch
`lane-stable-matrix`; unchanged script SHA256
`5984c5e9125ce48a151fe1191e88fef56f757f607cf024c7966b27c883b947c4`.
The exact 43-case `GPU_CAPTURE_CASES` above is used verbatim, default **N=600,
R=3, warm-up 200, seed 5**, native DPR 2, no protocol overrides. Output remains
`/tmp/stable-matrix/`, not Git. Harness self-check passed before capture.

GPU lock acquired before launch. Full pre-run process census retained in
`/tmp/stable-matrix/clients-before.txt`; user Chrome browser **4386**, GPU **4411**,
WindowServer **397**, ghostty **14036** remain foreign and untouched. No foreign
process signalled. At launch `/tmp` had **392 GiB** available. Script handles its
own bounded GPU-exit/contention retries; no selected/manual repeat planned.
No built-in capture resume exists: should the driver abort, preserve the partial
capture and run only missing cases under the same protocol, recording the split.
No runtime, preset, script, tracker, install, push or merge changes.

Capture in progress; no full-matrix verdict or completeness claim yet.

### WIP checkpoint: 12:16 PDT

**45 preserved attempts: run 1 all 43 scenes, run 2 first two scenes**;
**29 PASS / 15 FAIL / 1 INCONCLUSIVE / 0 CONTENDED**, zero GPU-process exits,
zero retries so far. These are attempt counts, not final scene verdicts.
SvgPathFluid own 800×500 run1 completed all **600 JS marks**, then its analysis
worker failed in `trace export`: `metal-gpu-intervals` export exited code 1,
`killed: true`, empty stdout/stderr. The unchanged export call has a **15 s bound**;
the error is consistent with its child timeout, not evidence of a deterministic
parser defect or missing GPU execution. The raw trace and worker input remain;
no analysis output exists. This is **INCONCLUSIVE**, not covered by the registered
GPU-exit/contention retries. No manual repeat, script edit or successful-result
replacement; the scene may finish INCOMPLETE even if runs 2–3 are clean.

Required checks passed: **52 Node files / 864 tests**, **471 checked files,
zero errors/warnings**, `git diff --check`. Launch Vite reported missing generated
`.svelte-kit/tsconfig.json`/dependency-scan warnings; `bun run check` generated the
config successfully. Foreign Chrome-for-Testing GPU **48074** (browser **48063**)
also appeared in the pre-run census; untouched, alongside the user Chrome.

### WIP checkpoint: 13:15 PDT

Run 2 finished all **43 scenes: 29 PASS / 13 FAIL / 1 INCONCLUSIVE /
0 CONTENDED**, zero GPU-process exits and zero retries. Karman shared 1440×900
run2 completed **600 marks**, then hit `Attempt timeout in recorder finalisation`;
retained as INCONCLUSIVE without a manual repeat. Maximum run2 foreign overlap
**2.020%**, below the fixed 5% gate. Run3 has completed **26/43** slots at this
checkpoint. No full-matrix verdict yet; both timeout attempts remain visible.

### Final outcome and provenance

**26 PASS / 14 FAIL / 3 INCOMPLETE** across all 43 requested scenes. All three
ordered traversals finished; no abort/resume, manual repeat or selected attempt.
**130 preserved attempts: 87 PASS / 39 FAIL / 3 INCONCLUSIVE / 1 CONTENDED**.
**126/129 run slots clean**; one registered contention retry supplied a clean slot.
Zero GPU-process exits or GPU-exit retries. Run1 28 PASS / 14 FAIL / 1 INCONCLUSIVE;
run2 29 PASS / 13 FAIL / 1 INCONCLUSIVE; run3 30 PASS / 12 FAIL / 1 INCONCLUSIVE /
1 CONTENDED (44 attempts). Every complete scene has three distinct clean slots.
Karman shared remains INCOMPLETE despite two observed clean FAILs; those failures
are retained separately, never treated as a pass. The GPU goal remains open.

All clean attempts: 600 aligned attributed clusters/native-write frames, zero
strays, complete execution coverage. Shared/model clean attempts deliver 600/600
transfers. Preset/InkPaper seed5; other model seeds not applicable. Verdicts use
unrounded per-run p95, index569, strict <2ms; no frame pooling or p95 averaging.

LiquidDropZone run3 is attribution-INCONCLUSIVE: alignment **7.737208 ms** exceeds
the unchanged <4ms gate; 600 marks/bursts and 600/600 transfers do not waive it.
Enamel64 run3 attempt1 is **CONTENDED**, foreign overlap **6.391%**, ghostty14036
busy **435.988ms / 2.59% of measured span**. Its median/p95/max stay visible below.
The script waited30s and took its one permitted contention retry; attempt2 PASS.
No heavy MLX/Python client observed before launch; foreign clients were never
signalled. WindowServer remains reported, excluded only from the contention gate.

Post-completion diagnostic only: one unchanged `--replay` on a separate retained
SvgPathFluid run1 row again timed out at the fixed15s `metal-gpu-intervals` export.
GPU PID/backing metadata restored only in that diagnostic row from its retained
worker input; live capture untouched. A raw export with the same xpath, explicit
Xcode prefix and no script timeout succeeded: **24.258628s**, **41,821,177 bytes**,
exit0. Trace size **100.815110MiB** (~101MiB; not the preliminary ~108MiB estimate).
No diagnostic budget verdict produced or folded into certification. Export and
recorder-finalisation bounds are follow-up harness items, not changed in this lane.

### Every scene, run and clean cross-run spread

All values ms. Run cells: attempt median / p95 / max (verdict); every attempt
retained. Spread cells: clean min–max (range), independently for median/p95/max.
`—` is unavailable, never zero. Clean slots counts distinct run slots.

| Scene | Tier | CSS | Run1 | Run2 | Run3 | Clean slots | Median min–max (range) | p95 min–max (range) | Max min–max (range) | Verdict | Old60 verdict |
|---|---|---|---|---|---|---:|---|---|---|---|---|
| (default) | own | 1440×900 | a1: 1.509668 / 1.994914 / 3.665666 (PASS) | a1: 1.527126 / 2.033371 / 3.880087 (FAIL) | a1: 1.490164 / 1.998665 / 2.261667 (PASS) | 3/3 | 1.490164–1.527126 (0.036962) | 1.994914–2.033371 (0.038457) | 2.261667–3.880087 (1.618420) | FAIL | FAIL |
| (default) | own | 800×500 | a1: 1.264461 / 1.652747 / 3.223163 (PASS) | a1: 1.268500 / 1.655203 / 3.082331 (PASS) | a1: 1.269873 / 1.650460 / 3.164629 (PASS) | 3/3 | 1.264461–1.269873 (0.005412) | 1.650460–1.655203 (0.004743) | 3.082331–3.223163 (0.140832) | PASS | FAIL |
| LavaLamp | own | 1440×900 | a1: 1.408919 / 1.761416 / 3.792916 (PASS) | a1: 1.406626 / 1.762210 / 3.463878 (PASS) | a1: 1.402084 / 1.766460 / 3.823251 (PASS) | 3/3 | 1.402084–1.408919 (0.006835) | 1.761416–1.766460 (0.005044) | 3.463878–3.823251 (0.359373) | PASS | FAIL |
| LavaLamp | own | 800×500 | a1: 0.943376 / 1.144666 / 2.780958 (PASS) | a1: 0.919378 / 1.100958 / 2.764250 (PASS) | a1: 0.926794 / 1.103503 / 2.762959 (PASS) | 3/3 | 0.919378–0.943376 (0.023998) | 1.100958–1.144666 (0.043708) | 2.762959–2.780958 (0.017999) | PASS | PASS |
| Plasma | own | 1440×900 | a1: 1.521626 / 2.024502 / 3.376542 (FAIL) | a1: 1.518753 / 2.053790 / 3.892625 (FAIL) | a1: 1.515213 / 2.018584 / 3.367752 (FAIL) | 3/3 | 1.515213–1.521626 (0.006413) | 2.018584–2.053790 (0.035206) | 3.367752–3.892625 (0.524873) | FAIL | FAIL |
| Plasma | own | 800×500 | a1: 1.244043 / 1.619504 / 3.205081 (PASS) | a1: 1.257709 / 1.637038 / 3.283161 (PASS) | a1: 1.265754 / 1.660879 / 3.130793 (PASS) | 3/3 | 1.244043–1.265754 (0.021711) | 1.619504–1.660879 (0.041375) | 3.130793–3.283161 (0.152368) | PASS | PASS |
| InkInWater | own | 1440×900 | a1: 1.184666 / 1.494419 / 3.154916 (PASS) | a1: 1.192502 / 1.497416 / 2.801292 (PASS) | a1: 1.216249 / 1.549042 / 3.366041 (PASS) | 3/3 | 1.184666–1.216249 (0.031583) | 1.494419–1.549042 (0.054623) | 2.801292–3.366041 (0.564749) | PASS | FAIL |
| InkInWater | own | 800×500 | a1: 0.940291 / 1.149667 / 2.605917 (PASS) | a1: 0.947749 / 1.130128 / 2.628667 (PASS) | a1: 0.964918 / 1.152749 / 1.558919 (PASS) | 3/3 | 0.940291–0.964918 (0.024627) | 1.130128–1.152749 (0.022621) | 1.558919–2.628667 (1.069748) | PASS | PASS |
| FrozenSwirl | own | 1440×900 | a1: 1.376834 / 1.735873 / 3.450250 (PASS) | a1: 1.371998 / 1.724459 / 3.390751 (PASS) | a1: 1.378541 / 1.742001 / 3.647084 (PASS) | 3/3 | 1.371998–1.378541 (0.006543) | 1.724459–1.742001 (0.017542) | 3.390751–3.647084 (0.256333) | PASS | FAIL |
| FrozenSwirl | own | 800×500 | a1: 1.112795 / 1.327832 / 2.921375 (PASS) | a1: 1.116667 / 1.329917 / 2.778250 (PASS) | a1: 1.097539 / 1.309250 / 2.705040 (PASS) | 3/3 | 1.097539–1.116667 (0.019128) | 1.309250–1.329917 (0.020667) | 2.705040–2.921375 (0.216335) | PASS | PASS |
| Aurora | own | 1440×900 | a1: 1.518041 / 2.031165 / 3.637081 (FAIL) | a1: 1.521001 / 2.131914 / 3.870956 (FAIL) | a1: 1.500584 / 2.010956 / 3.672205 (FAIL) | 3/3 | 1.500584–1.521001 (0.020417) | 2.010956–2.131914 (0.120958) | 3.637081–3.870956 (0.233875) | FAIL | FAIL |
| Aurora | own | 800×500 | a1: 1.270162 / 1.650042 / 3.312588 (PASS) | a1: 1.271543 / 1.667960 / 3.014419 (PASS) | a1: 1.260793 / 1.641083 / 3.005502 (PASS) | 3/3 | 1.260793–1.271543 (0.010750) | 1.641083–1.667960 (0.026877) | 3.005502–3.312588 (0.307086) | PASS | PASS* |
| CircularFluid | own | 1440×900 | a1: 1.361833 / 1.725627 / 3.077457 (PASS) | a1: 1.404086 / 1.768710 / 3.465502 (PASS) | a1: 1.400001 / 1.782666 / 3.523334 (PASS) | 3/3 | 1.361833–1.404086 (0.042253) | 1.725627–1.782666 (0.057039) | 3.077457–3.523334 (0.445877) | PASS | FAIL |
| CircularFluid | own | 800×500 | a1: 1.087960 / 1.295205 / 2.825251 (PASS) | a1: 1.088791 / 1.307666 / 2.602583 (PASS) | a1: 1.107918 / 1.346044 / 2.830538 (PASS) | 3/3 | 1.087960–1.107918 (0.019958) | 1.295205–1.346044 (0.050839) | 2.602583–2.830538 (0.227955) | PASS | PASS |
| FrameFluid | own | 1440×900 | a1: 1.498502 / 1.923042 / 3.608585 (PASS) | a1: 1.529504 / 1.980335 / 3.621667 (PASS) | a1: 1.526293 / 1.956292 / 3.630709 (PASS) | 3/3 | 1.498502–1.529504 (0.031002) | 1.923042–1.980335 (0.057293) | 3.608585–3.630709 (0.022124) | PASS | FAIL |
| FrameFluid | own | 800×500 | a1: 1.154002 / 1.403334 / 2.929958 (PASS) | a1: 1.129083 / 1.396789 / 2.940253 (PASS) | a1: 1.181711 / 1.439247 / 2.881877 (PASS) | 3/3 | 1.129083–1.181711 (0.052628) | 1.396789–1.439247 (0.042458) | 2.881877–2.940253 (0.058376) | PASS | PASS |
| AnnularFluid | own | 1440×900 | a1: 1.361878 / 1.731999 / 3.437753 (PASS) | a1: 1.361666 / 1.746375 / 3.425208 (PASS) | a1: 1.371541 / 1.785127 / 3.439874 (PASS) | 3/3 | 1.361666–1.371541 (0.009875) | 1.731999–1.785127 (0.053128) | 3.425208–3.439874 (0.014666) | PASS | FAIL |
| AnnularFluid | own | 800×500 | a1: 1.055585 / 1.275585 / 1.651669 (PASS) | a1: 1.111123 / 1.329542 / 2.720750 (PASS) | a1: 1.075543 / 1.279166 / 2.703416 (PASS) | 3/3 | 1.055585–1.111123 (0.055538) | 1.275585–1.329542 (0.053957) | 1.651669–2.720750 (1.069081) | PASS | PASS |
| SvgPathFluid | own | 1440×900 | a1: 1.374877 / 1.749665 / 3.432667 (PASS) | a1: 1.402791 / 1.805959 / 3.448459 (PASS) | a1: 1.383544 / 1.761002 / 3.470792 (PASS) | 3/3 | 1.374877–1.402791 (0.027914) | 1.749665–1.805959 (0.056294) | 3.432667–3.470792 (0.038125) | PASS | PASS |
| SvgPathFluid | own | 800×500 | a1: — / — / — (INCONCLUSIVE) | a1: 1.084333 / 1.315998 / 2.799123 (PASS) | a1: 1.084836 / 1.295210 / 2.805836 (PASS) | 2/3 | 1.084333–1.084836 (0.000503) | 1.295210–1.315998 (0.020788) | 2.799123–2.805836 (0.006713) | INCOMPLETE | PASS |
| Toroidal | own | 1440×900 | a1: 1.658622 / 2.228372 / 3.929544 (FAIL) | a1: 1.690913 / 2.258581 / 3.931582 (FAIL) | a1: 1.646790 / 2.213289 / 3.905414 (FAIL) | 3/3 | 1.646790–1.690913 (0.044123) | 2.213289–2.258581 (0.045292) | 3.905414–3.931582 (0.026168) | FAIL | FAIL |
| Toroidal | own | 800×500 | a1: 1.367412 / 1.782086 / 3.451540 (PASS) | a1: 1.395044 / 1.843293 / 3.455497 (PASS) | a1: 1.385663 / 1.795078 / 3.458335 (PASS) | 3/3 | 1.367412–1.395044 (0.027632) | 1.782086–1.843293 (0.061207) | 3.451540–3.458335 (0.006795) | PASS | FAIL |
| GasFlare | own | 1440×900 | a1: 1.854288 / 2.474127 / 4.127624 (FAIL) | a1: 1.881872 / 2.480417 / 4.130044 (FAIL) | a1: 1.900330 / 2.474962 / 4.117706 (FAIL) | 3/3 | 1.854288–1.900330 (0.046042) | 2.474127–2.480417 (0.006290) | 4.117706–4.130044 (0.012338) | FAIL | FAIL |
| GasFlare | own | 800×500 | a1: 1.487000 / 1.864666 / 3.521166 (PASS) | a1: 1.519082 / 1.903960 / 3.576997 (PASS) | a1: 1.511872 / 1.927873 / 3.547162 (PASS) | 3/3 | 1.487000–1.519082 (0.032082) | 1.864666–1.927873 (0.063207) | 3.521166–3.576997 (0.055831) | PASS | FAIL |
| Venturi | own | 1440×900 | a1: 1.253581 / 1.658753 / 3.340623 (PASS) | a1: 1.287167 / 1.667873 / 1.716376 (PASS) | a1: 1.270962 / 1.683039 / 3.368877 (PASS) | 3/3 | 1.253581–1.287167 (0.033586) | 1.658753–1.683039 (0.024286) | 1.716376–3.368877 (1.652501) | PASS | FAIL |
| Venturi | own | 800×500 | a1: 0.930125 / 1.147291 / 1.846250 (PASS) | a1: 0.999334 / 1.187167 / 2.089042 (PASS) | a1: 0.950791 / 1.174205 / 1.873498 (PASS) | 3/3 | 0.930125–0.999334 (0.069209) | 1.147291–1.187167 (0.039876) | 1.846250–2.089042 (0.242792) | PASS | PASS* |
| Karman | own | 1440×900 | a1: 2.234002 / 3.133373 / 4.677083 (FAIL) | a1: 2.295416 / 3.087875 / 3.457081 (FAIL) | a1: 2.237961 / 3.136128 / 4.649416 (FAIL) | 3/3 | 2.234002–2.295416 (0.061414) | 3.087875–3.136128 (0.048253) | 3.457081–4.677083 (1.220002) | FAIL | FAIL |
| Karman | own | 800×500 | a1: 2.080499 / 2.893666 / 4.548834 (FAIL) | a1: 2.149041 / 2.882125 / 3.335209 (FAIL) | a1: 2.125957 / 2.932292 / 4.500209 (FAIL) | 3/3 | 2.080499–2.149041 (0.068542) | 2.882125–2.932292 (0.050167) | 3.335209–4.548834 (1.213625) | FAIL | FAIL |
| TeslaValve | own | 1440×900 | a1: 1.893539 / 2.667832 / 4.445165 (FAIL) | a1: 1.843917 / 2.376378 / 2.779748 (FAIL) | a1: 1.902461 / 2.763250 / 4.660959 (FAIL) | 3/3 | 1.843917–1.902461 (0.058544) | 2.376378–2.763250 (0.386872) | 2.779748–4.660959 (1.881211) | FAIL | FAIL |
| TeslaValve | own | 800×500 | a1: 1.712084 / 2.442294 / 3.281252 (FAIL) | a1: 1.726707 / 2.278417 / 2.917332 (FAIL) | a1: 1.729374 / 2.495208 / 3.563212 (FAIL) | 3/3 | 1.712084–1.729374 (0.017290) | 2.278417–2.495208 (0.216791) | 2.917332–3.563212 (0.645880) | FAIL | FAIL |
| Karman | shared | 1440×900 | a1: 2.333124 / 3.430248 / 4.698791 (FAIL) | a1: — / — / — (INCONCLUSIVE) | a1: 2.345292 / 3.527541 / 5.014415 (FAIL) | 2/3 | 2.333124–2.345292 (0.012168) | 3.430248–3.527541 (0.097293) | 4.698791–5.014415 (0.315624) | INCOMPLETE | FAIL |
| GasFlare | shared | 1440×900 | a1: 1.937042 / 2.601876 / 4.178834 (FAIL) | a1: 1.920251 / 2.481460 / 3.131835 (FAIL) | a1: 2.174127 / 2.520289 / 3.162127 (FAIL) | 3/3 | 1.920251–2.174127 (0.253876) | 2.481460–2.601876 (0.120416) | 3.131835–4.178834 (1.046999) | FAIL | FAIL |
| LavaLamp | shared | 1440×900 | a1: 1.468169 / 2.264750 / 3.617334 (FAIL) | a1: 1.512292 / 1.910791 / 2.606706 (PASS) | a1: 1.517791 / 1.934168 / 2.566003 (PASS) | 3/3 | 1.468169–1.517791 (0.049622) | 1.910791–2.264750 (0.353959) | 2.566003–3.617334 (1.051331) | FAIL | FAIL |
| (default) | shared | 1440×900 | a1: 1.589462 / 2.271419 / 3.803334 (FAIL) | a1: 1.506368 / 2.074708 / 2.658376 (FAIL) | a1: 1.741000 / 1.986877 / 2.597830 (PASS) | 3/3 | 1.506368–1.741000 (0.234632) | 1.986877–2.271419 (0.284542) | 2.597830–3.803334 (1.205504) | FAIL | FAIL |
| Karman | own | 480.25×300.5 | a1: 2.030291 / 2.739333 / 4.412875 (FAIL) | a1: 1.995081 / 2.733749 / 3.609086 (FAIL) | a1: 2.164127 / 2.701751 / 3.476208 (FAIL) | 3/3 | 1.995081–2.164127 (0.169046) | 2.701751–2.739333 (0.037582) | 3.476208–4.412875 (0.936667) | FAIL | FAIL |
| model-button | shared | 232×68 | a1: 0.676584 / 0.706876 / 1.171789 (PASS) | a1: 0.670292 / 0.689667 / 0.784958 (PASS) | a1: 0.667456 / 0.683043 / 0.906459 (PASS) | 3/3 | 0.667456–0.676584 (0.009128) | 0.683043–0.706876 (0.023833) | 0.784958–1.171789 (0.386831) | PASS | PASS |
| model-wide-button | shared | 492×76 | a1: 0.716333 / 0.740875 / 0.895374 (PASS) | a1: 0.725416 / 0.748417 / 1.173835 (PASS) | a1: 0.728708 / 0.751584 / 0.871125 (PASS) | 3/3 | 0.716333–0.728708 (0.012375) | 0.740875–0.751584 (0.010709) | 0.871125–1.173835 (0.302710) | PASS | PASS |
| model-segmented | shared | 372×68 | a1: 0.773417 / 0.793499 / 0.833000 (PASS) | a1: 0.764875 / 0.774333 / 0.899876 (PASS) | a1: 0.770083 / 0.802626 / 1.268748 (PASS) | 3/3 | 0.764875–0.773417 (0.008542) | 0.774333–0.802626 (0.028293) | 0.833000–1.268748 (0.435748) | PASS | PASS |
| model-dropzone | shared | 492×212 | a1: 1.049166 / 1.325125 / 1.514375 (PASS) | a1: 1.071542 / 1.311167 / 1.752708 (PASS) | a1: — / — / — (INCONCLUSIVE) | 2/3 | 1.049166–1.071542 (0.022376) | 1.311167–1.325125 (0.013958) | 1.514375–1.752708 (0.238333) | INCOMPLETE | PASS* |
| model-caustics | shared | 720×400 | a1: 1.008374 / 1.026251 / 2.167208 (PASS) | a1: 0.997000 / 1.019875 / 1.222334 (PASS) | a1: 1.007043 / 1.024458 / 1.209958 (PASS) | 3/3 | 0.997000–1.008374 (0.011374) | 1.019875–1.026251 (0.006376) | 1.209958–2.167208 (0.957250) | PASS | PASS |
| model-enamel96 | shared | 1×1 | a1: 0.437916 / 0.475168 / 1.502497 (PASS) | a1: 0.427748 / 0.466622 / 1.450334 (PASS) | a1: 0.453077 / 0.506623 / 1.313126 (PASS) | 3/3 | 0.427748–0.453077 (0.025329) | 0.466622–0.506623 (0.040001) | 1.313126–1.502497 (0.189371) | PASS | PASS |
| model-enamel64 | shared | 1×1 | a1: 0.422042 / 0.470624 / 0.870378 (PASS) | a1: 0.440666 / 0.488041 / 1.139834 (PASS) | a1: 0.452789 / 0.526830 / 1.441914 (CONTENDED); a2: 0.433792 / 0.488502 / 1.375998 (PASS) | 3/3 | 0.422042–0.440666 (0.018624) | 0.470624–0.488502 (0.017878) | 0.870378–1.375998 (0.505620) | PASS | PASS |
| model-inkpaper | shared | 800×500 | a1: 1.589584 / 2.152709 / 3.896834 (FAIL) | a1: 1.568959 / 2.153041 / 2.284831 (FAIL) | a1: 1.584419 / 2.165541 / 2.456377 (FAIL) | 3/3 | 1.568959–1.589584 (0.020625) | 2.152709–2.165541 (0.012832) | 2.284831–3.896834 (1.612003) | FAIL | FAIL |

### Residual FAILs, descending worst-run p95

| Scene | Tier | CSS | p95 run1 | p95 run2 | p95 run3 | Worst p95 | Gap above2ms |
|---|---|---|---:|---:|---:|---:|---:|
| Karman | own | 1440×900 | 3.133373 | 3.087875 | 3.136128 | 3.136128 | 1.136128 |
| Karman | own | 800×500 | 2.893666 | 2.882125 | 2.932292 | 2.932292 | 0.932292 |
| TeslaValve | own | 1440×900 | 2.667832 | 2.376378 | 2.763250 | 2.763250 | 0.763250 |
| Karman | own | 480.25×300.5 | 2.739333 | 2.733749 | 2.701751 | 2.739333 | 0.739333 |
| GasFlare | shared | 1440×900 | 2.601876 | 2.481460 | 2.520289 | 2.601876 | 0.601876 |
| TeslaValve | own | 800×500 | 2.442294 | 2.278417 | 2.495208 | 2.495208 | 0.495208 |
| GasFlare | own | 1440×900 | 2.474127 | 2.480417 | 2.474962 | 2.480417 | 0.480417 |
| (default) | shared | 1440×900 | 2.271419 | 2.074708 | 1.986877 | 2.271419 | 0.271419 |
| LavaLamp | shared | 1440×900 | 2.264750 | 1.910791 | 1.934168 | 2.264750 | 0.264750 |
| Toroidal | own | 1440×900 | 2.228372 | 2.258581 | 2.213289 | 2.258581 | 0.258581 |
| model-inkpaper | shared | 800×500 | 2.152709 | 2.153041 | 2.165541 | 2.165541 | 0.165541 |
| Aurora | own | 1440×900 | 2.031165 | 2.131914 | 2.010956 | 2.131914 | 0.131914 |
| Plasma | own | 1440×900 | 2.024502 | 2.053790 | 2.018584 | 2.053790 | 0.053790 |
| (default) | own | 1440×900 | 1.994914 | 2.033371 | 1.998665 | 2.033371 | 0.033371 |

### Comparison with old60-frame post-optimisation verdicts

Historical table remains unchanged: **18 PASS (including three PASS*) /25 FAIL**.
Comparison uses all-repeat scene verdicts, not the earlier selected-row ADR0101
table. Different sampling/repeat accounting, no causal speed-up/regression claim.

| Old60 verdict | Stable PASS | Stable FAIL | Stable INCOMPLETE |
|---|---:|---:|---:|
| PASS | 14 | 0 | 1 |
| PASS* | 2 | 0 | 1 |
| FAIL | 10 | 14 | 1 |

### Every attempt: script-provided export SHA256 provenance

`capture.json` records protocol, checkout SHA, commands, adapter/UA/config, marks,
interval-union statistics, transfers, contention and all retries. Hashes below
are Metal GPU intervals / command-buffer submissions / IOSurface accesses, exactly
as supplied by the script. Missing hashes remain unavailable after timeout; none
invented. Raw traces/XML/frames stay in `/tmp/stable-matrix/`, not Git or archived.

| Trace basename | Verdict | GPU PID | Alignment ms | Foreign overlap% | GPU / submissions / IOSurface SHA256 |
|---|---|---:|---:|---:|---|
| `default-1440x900-own-dpr2-seed5-r1-a1.trace` | PASS | 40275 | 0.160917 | 0.020000 | `c85f5c8669560c08c0ae690363e44b43a54bcac4daf736be21506ebac77fbaea` / `7badd3c43fc0515fb6f8ccb8a694584cfe120ac595aa3b284c2ea505f6a78296` / `7314f0fcf96edb3818f0cbf3a93fb3d16323a336a0d29c2048da04ea7fe3e192` |
| `default-800x500-own-dpr2-seed5-r1-a1.trace` | PASS | 41721 | 0.277875 | 0.000000 | `50207005f678ff7916be8a76279f673a179a8a1b4894bdc9099af768fc958b85` / `46fb3738f12c38a7590f3c2ef504a655b64d8da6e5cb50d466d0b3349c2a9d1e` / `a24a82fe79f69066385f28ad9b002f79a271b0d7be49084be127b12fe90fe544` |
| `LavaLamp-1440x900-own-dpr2-seed5-r1-a1.trace` | PASS | 42382 | 0.608125 | 0.000000 | `1aea5c19571f770fc853fc374c9cc704d52555ae63e9c8fce5a0b363a00d602f` / `db01713fc44fae79eff09cc298c53a3facb0fd5de4ba976d2e0370785603d543` / `1977cb6db566ba644a75d60e7ca0aa024d770080f6031bfd7d24e70d51b78999` |
| `LavaLamp-800x500-own-dpr2-seed5-r1-a1.trace` | PASS | 43472 | 1.000000 | 0.000000 | `30ea03626c764d37d6352d62d5146913d02c3f8cfb48c81821a422401be1c9c0` / `3bb05609b085202fae0756728d48ab94c18e1a72f6203007a62459494f48bec4` / `4929f90b76bb8de08fa75b19753acdcef0871dcce4d5a15cda49da88d516d06e` |
| `Plasma-1440x900-own-dpr2-seed5-r1-a1.trace` | FAIL | 43960 | 1.344166 | 0.084000 | `c8f375845f1318a2700276c227703b97f48b142496d71554088a928cc4da15cb` / `6baf02aed61d59708de9431f6031ce436b5b2dcda0905b16ae6835398300c964` / `d6341fe9e2352a425014199041364263f38860ca8eafc2bfb7cdb56222fc366c` |
| `Plasma-800x500-own-dpr2-seed5-r1-a1.trace` | PASS | 46043 | 0.240250 | 0.000000 | `870ab486b40b912c17b3c86938e75881742b80ed1e507150feed2ce7952242d3` / `1468fd0d12bb0c1d13f6c153b6a8a66817eccc6efc0d59508541b63c076e4fe4` / `a8fe3a7cb437c4d61ae74de39ca3931b56c39f09117d3b763b2f7909e6483ede` |
| `InkInWater-1440x900-own-dpr2-seed5-r1-a1.trace` | PASS | 52934 | 0.281916 | 0.136000 | `3abf2146de17cdd1703f06a6764f1aee4fcf944921f32dab38e1ad6f52af5f1c` / `876caa53d317ebde85f6ae727b88f90b0c648f540682e1fed64ee9a5160a877a` / `da503d121a9244b29b6dd8b7d0f75b9f521e868f70fe3580e74bfe706b7ef2ed` |
| `InkInWater-800x500-own-dpr2-seed5-r1-a1.trace` | PASS | 56260 | 0.202875 | 0.000000 | `e9cca9b01ee35380391bd42dd0eac0595b5031e15c56b65d0415f3c36b26fbf6` / `de7bb2276883f9b99fedddcb7a1b3ace2731af60927dc67fae0406cf944646d7` / `7aa4812dcfea7317cb4a827c37261581fcd4d7e596b982861d89c8e81b6ef3ff` |
| `FrozenSwirl-1440x900-own-dpr2-seed5-r1-a1.trace` | PASS | 57523 | 0.207375 | 0.109000 | `3efe4a2c0dbfea7c0ab72d5854ef69e56b63333ba591e7732353c039e4e2ca66` / `31bb318ab3cf998312d1d02b1a39f8e80a325050caefde2f48a513bf0a49b7e6` / `a8e7f4c5df5ffd5855485b976d4a1797129133263266e24a27721c0a67a69d31` |
| `FrozenSwirl-800x500-own-dpr2-seed5-r1-a1.trace` | PASS | 58989 | 0.211041 | 0.011000 | `3dee3139102aad94a8cca45acacf9ef5bccb536f3f17f048e0d8ff3b14e56e24` / `279faea96a0459d65b86ca676b1f3827df29583bc7d327ea1124a7b87edb9e90` / `07660c14e92d53e5757abab4560a09772d709152213f438d1d156b2bb8e4e1dc` |
| `Aurora-1440x900-own-dpr2-seed5-r1-a1.trace` | FAIL | 60273 | 0.317917 | 0.000000 | `0eabf961d9af1307d66299d800468972b23e739588b9e4634d2052c62940c99e` / `220c21e8b004384f25c8a86d6c3a8ea0ac16502e74d20cdaea6a32962a3fe998` / `5e251511d70185d3d8af558065e96a457fe61d6acfefe5f0cd5b85c6c6a64379` |
| `Aurora-800x500-own-dpr2-seed5-r1-a1.trace` | PASS | 64069 | 0.231625 | 0.012000 | `5537410e0de0700d6158200a413a7f62c7500180515381852a4df724767c89b9` / `8d10f6c3f7b90d86666aa8ba9cc4b98b047ce86d56e141dd7952e25fe28a5dc0` / `aa747d97d960c0c78a71902b8e72ca828fd5156536e218a8c14b4e93fc148f62` |
| `CircularFluid-1440x900-own-dpr2-seed5-r1-a1.trace` | PASS | 65363 | 0.291000 | 0.000000 | `68d35deafe2ed4e8956d852cc0d54bc3f0bf36928305e6e6553d71e5d1a474a2` / `1a6ada6c4e434c343848aa2fd121068bb138fdf226fad45c1eab9f07331014a1` / `a75f465df491391d96d3f61764c726bcf1d6423598500ae6d8973097fedf69c9` |
| `CircularFluid-800x500-own-dpr2-seed5-r1-a1.trace` | PASS | 66201 | 0.251542 | 0.000000 | `5cba8139852e1cc4c9999088fd11b5d9d8862ed36cf62a0135101fbfb296eaf0` / `f8ae5a16359d6db81594fc14f17a6d0f27803c8031d27fac515e02170dfb9cc7` / `45f1a7826ad8c79e118e100e2fd0186f66ec6a9b483e9906fa1a2bb9c3c99db5` |
| `FrameFluid-1440x900-own-dpr2-seed5-r1-a1.trace` | PASS | 77698 | 0.365125 | 0.000000 | `90d032405847b4c950d188bb29cfcb24bbc6e7aabf9050f3ae717d39011fcd49` / `bad1c206b704fcbae3fc63eb3c59bd5de7637ed197a21a5879b7eb3fd6327722` / `a16e6a1a542d8dd0792aae5565c37597bc61cb90482e0546b060d61b821f0a38` |
| `FrameFluid-800x500-own-dpr2-seed5-r1-a1.trace` | PASS | 83393 | 0.331042 | 0.000000 | `95d2b933698a91c88858dd522b8117763cd00cb9397d00da61a7f1b114d10a3a` / `73ff4073ddfb72650e172c1e93f6b2c32427019586b41855cfc6af9715cef76f` / `c0524ad0f2f8eb6ee968889f28370818dcfccdca19494b16f5375c2696f23399` |
| `AnnularFluid-1440x900-own-dpr2-seed5-r1-a1.trace` | PASS | 84697 | 0.266916 | 0.000000 | `0c2562b101768e2cc16ba841f1e467c35b9f29ee4ae456f0cf2efea821341b4d` / `5b65f059c3b5eb5ce06c94813f31d1eab0e6d055f8b7c35b9f34bf035e53e71b` / `438769889c138309b8ed71cd74278c4f32c66f9e61cbbde5eccf27330333821d` |
| `AnnularFluid-800x500-own-dpr2-seed5-r1-a1.trace` | PASS | 86107 | 0.277541 | 0.000000 | `7bee0867a1452ddef53a225cae2cc38c4e94126d64fbbe8baf17dd00807a7314` / `d8f7361a7d10825bbed90e5ad39a50b6cd84751dcce756fd01ee5aaed177f331` / `724fdf62e267436d14969495f8bda14f9e7c543c66d2bd6e9e7d3b886c6ccf24` |
| `SvgPathFluid-1440x900-own-dpr2-seed5-r1-a1.trace` | PASS | 87110 | 0.233250 | 0.000000 | `ed4c967ca2abdf75f858db38a402b77d223aaba7818fc3ce60b291910e27ea9f` / `bac413cada0b77395d98327b2fda139d5c5a9624ecaa182d34342c488db298a2` / `43191c5e2f4db574ffe9d5e527454c7476ff29fca037541147041e28e69f898f` |
| `SvgPathFluid-800x500-own-dpr2-seed5-r1-a1.trace` | INCONCLUSIVE | — | — | 0.000000 | — / — / — |
| `Toroidal-1440x900-own-dpr2-seed5-r1-a1.trace` | FAIL | 99658 | 0.314209 | 0.000000 | `0b870d32c8e0d6796774f6fe27f128d7061fbb8fda88d20cedf5a30a58c686f2` / `dadeabc7ad94858def740f2d0385c7bf712e5745cd5e7e2004697c30eea589a3` / `285fc51c7cc7c883e8a96c4da3dfdbd2ea825ef2ac8658046374ce28e936d2ee` |
| `Toroidal-800x500-own-dpr2-seed5-r1-a1.trace` | PASS | 5237 | 0.277500 | 0.000000 | `f8bf128bdc972f028f179af74f135b7e95424075c058ee6b0faccced15dd4df8` / `d5ea5b878c72b69bbcaaeaa35efbebbd26221ec767b1cac06548e7cddf9b7736` / `37b28aa84cd6158ade186cc40f00ff8fadfdc9377eff81c083b4f9a461160f8d` |
| `GasFlare-1440x900-own-dpr2-seed5-r1-a1.trace` | FAIL | 11570 | 0.294375 | 0.000000 | `1f6c43e11c87e463e5f0ae09bf46993c7972a3bfeb8e382dfafa59948b0fde62` / `8c5390bdc18c5cb46bb6cdd8e54499c71e204f52b76564a4b2000436ccf91166` / `65e3cb78099c30b31e3ae47a1809874ae19872aff5b72e178737a0d005ef19b5` |
| `GasFlare-800x500-own-dpr2-seed5-r1-a1.trace` | PASS | 12749 | 0.301208 | 0.000000 | `f8bda42d6f5ee7571f75724fdc2e8b2febdedd6df70666f15bcd5dea4ff1b5b2` / `5babde02311297eb331991e8a3800cc206105797c308af5606e203ee64a2166a` / `43c8216c2782e3d7af7753739dd86d9797a38118a54e257a881ba6e877d4bcd2` |
| `Venturi-1440x900-own-dpr2-seed5-r1-a1.trace` | PASS | 13791 | 0.331417 | 0.000000 | `61c9b88e02f5cc9f1ca0a3cbce09bf4208094f48af2663b22c626bea6c0bccf8` / `61ab7c5f6f7688f14c810f4e43c78f64511f565b909b665e0d459d32bdd65548` / `72cc0ebf7d41152efcb2c81086c24f5bb0d85ade8fe12ddb36d41ffa1a0dc389` |
| `Venturi-800x500-own-dpr2-seed5-r1-a1.trace` | PASS | 15719 | 0.275417 | 0.000000 | `ed809550333a8840a2b0caf48e4760d52fb6031c3c1ad8bf15eb83cb50e7b653` / `8a8dc424b54c67c0fb9b90696d28cdf382320553e256d5e78b61717e5a5c660e` / `a8aa16bb306571be847d3a0a8a20b3acfacfcfcd0072ec5f4dca937b6369cbe8` |
| `Karman-1440x900-own-dpr2-seed5-r1-a1.trace` | FAIL | 17677 | 0.302417 | 0.183000 | `f980be5a2691cbfd6eb968c4ab3f6ef01453d8b6e326f46ec6046a65d8bfe1e1` / `f1f4e7cdd9c527629a1df61d9dab0c9e604f6d851321f93613df5e33de3911f0` / `0b2902a699f1e5718fb1c41326e43e51f0fc98cebe6d54b599331c4d1a2831e0` |
| `Karman-800x500-own-dpr2-seed5-r1-a1.trace` | FAIL | 19284 | 0.331041 | 0.000000 | `d0d219c0e28208f5114d0b70ea3e26fa501406f0812d7fd0db08e88b1049e30c` / `34d94ae577eb36da7f295c0b97b3004c5469b5624aae7a2d3e4070e57f82e208` / `f925f4e4aff17c1c93cb841c34c996f37afaff8b8b32931b2b9e3701a6426b5c` |
| `TeslaValve-1440x900-own-dpr2-seed5-r1-a1.trace` | FAIL | 21183 | 0.276167 | 0.016000 | `41dd4d6ce31c8b641baa042e9bfdd23dee78b1c1022700d38e10f6ebf1fb6c57` / `8de5d2fb95027b0105edc629a167978732f005d7ce097bdaacbd48764a124637` / `7981492981414c2abe6c7ec891ad0e3a43b09ce4a5df60fc2210eeb36c67c75c` |
| `TeslaValve-800x500-own-dpr2-seed5-r1-a1.trace` | FAIL | 22036 | 0.237000 | 0.000000 | `df6c1b7b677e6a2f9b144779222d30859f6e5e44975c868427917818a91e91a3` / `cd6205f484a46e4dbad23474606ef36cda1e39a2990cd021af8a9a5f5823a548` / `bc97a228f01b6f80890f5e430c360a558b636bfd8c49b88544abb4aee8c2c925` |
| `Karman-1440x900-shared-dpr2-seed5-r1-a1.trace` | FAIL | 22911 | 0.169750 | 0.003000 | `3ca958797a195f62ca124410db378e9cb47d67a850ea051dd84afc62def2dff3` / `2412bb4e4586481317c1ef020ff4f50c337a69ddf3246ca41b3ab067e8c3e80b` / `8c0ca7dace6623782c0d22f4ec1703ea2dbb7d841697bd9964f136c0bfb33648` |
| `GasFlare-1440x900-shared-dpr2-seed5-r1-a1.trace` | FAIL | 23967 | 0.203041 | 0.000000 | `3f2745348b6a51881b9201ef6681c52b639230c3df84edde7e654c1f1be5c2a1` / `a471d22ae5ca43ba402590b43f326f33ce159a589e2a27cf29fb25c18e0bb3bf` / `b062abbe1357863d3eaf3d3e897c715eaa151a1a4ce9106f9b7000d3adbcd5f2` |
| `LavaLamp-1440x900-shared-dpr2-seed5-r1-a1.trace` | FAIL | 24974 | 0.275875 | 0.000000 | `339704ef3ee17271d6552f699e92945d69842d669519db65372593b7d7a28f3e` / `0d6be0d3042235a33cc31adfbfea550b4e66d378f9940e27b77c79bbe92529c0` / `e17c69b25e583ccd0ab0166b4c175b3f44f498e1b653c0902fd5da358d7345b9` |
| `default-1440x900-shared-dpr2-seed5-r1-a1.trace` | FAIL | 25673 | 0.255166 | 0.008000 | `e9825a187028b01d568a8d56776f67f658a172cdc2745366ce66e3dc8630910d` / `a42e6b7ac6ca6a71f0eaa60b541d97537279b928665c09b7310ab55a513a3191` / `2aef882d344fce37a8280b95538e37b2b4edca7d0224d8e444d26e8d8e3abe50` |
| `Karman-480.25x300.5-own-dpr2-seed5-r1-a1.trace` | FAIL | 26524 | 1.353250 | 0.006000 | `c1b4a8ce26681189b949888bb5fcdff7c3003bc0b94662120d70da23ae283eb4` / `1a9158aa5957998ff9547cdf395e2315f4f9db1bc3b80b83cf3bb4b440c907bb` / `52e719cfa622b747aa14bf4aae15fc35d8778887ecd92db171e09ff8b74a5696` |
| `modelbutton-232x68-shared-dpr2-r1-a1.trace` | PASS | 27302 | 1.423041 | 0.145000 | `a117bd496414df021d37ff431492f6fefde76aac86928c6a677ef8ab405491a1` / `18e71305cea55b84a54be195708ae8e00052b739176a348de7e3ab08427e8090` / `281b4ec857e42c6f7076775436a2018a47f23980e75fc7168eb70620857091f0` |
| `modelwidebutton-492x76-shared-dpr2-r1-a1.trace` | PASS | 31133 | 0.211041 | 0.000000 | `540171636b6e482a350edc9517d06d13681aaa17a6a3828e03c221d5f1dc940d` / `4c302cbf4a9d52581baad8d000b382c940c0d80c3659ea661da7e9dc5480b92d` / `1b8f8e2a8963d30699a9756637d3139ef0901432748a225adfd21606fc1e17bc` |
| `modelsegmented-372x68-shared-dpr2-r1-a1.trace` | PASS | 31880 | 0.274916 | 0.000000 | `977339a4f20cf15d25114668c109978b9f3fa40cb3ca6470c3213981fb1c8e57` / `9dde92a89a009aed9b094ef326a4d392c1106b7232f3a3fa0291331deaf592f2` / `0778f927b3481c1fcfe1c5f266d193e62f6b0229323ca8a3796aa5e99af30227` |
| `modeldropzone-492x212-shared-dpr2-r1-a1.trace` | PASS | 32419 | 0.283417 | 0.000000 | `7a8e4cb56a41926d96acb83183be56836d8a04894a373e9066a15f62b6847d3e` / `13a6c73cabd03db39a58190ed3c55370f8c7469822e1ba4cf2b7bb55d7c98dff` / `bb31aa7d3fc4702ea57f435ac3018d69a592573111d0fba3da5ebf954c1c9ab3` |
| `modelcaustics-720x400-shared-dpr2-r1-a1.trace` | PASS | 32846 | 2.266041 | 0.170000 | `94cb2fc8575a058509a8adce640a29367c7e20833394f5dde9239c946c490ec7` / `e75ab3468140cde6acc11b371f64a3898cf9947605ea65ad2a586b734ff67542` / `43143a17d40b8c02168a8c655a18927d060c238c442bb48eb99c6cf836f089e1` |
| `modelenamel96-1x1-shared-dpr2-r1-a1.trace` | PASS | 33500 | 1.770667 | 0.000000 | `65fcbd2d9c99ff0cf7748ea0623e70888fd5fdbc49194c509b9f16c493c5d58c` / `32cfdc1d1834632d6023bfc2a03d173f12dd6dd5a244429752b8ac65250905d8` / `05f8327ad60586e51449c8abe152a462c55cfd33042f1c66ee1df4e8cc02d568` |
| `modelenamel64-1x1-shared-dpr2-r1-a1.trace` | PASS | 34399 | 0.281083 | 0.000000 | `1161ee742afa9d5802042d482a354fdb2da149660504948659da1b3dd4e532bc` / `1865ad7a414d66b379dfc822cf799a1c736ea796257986d3e4626bc9946bc546` / `6d92b2a3ff42c8e9ff1dc60192faba9b245ed94143fc063cc5457fb705932605` |
| `modelinkpaper-800x500-shared-dpr2-r1-a1.trace` | FAIL | 39735 | 0.475583 | 0.000000 | `5c558d8e4c65b000ffe7b91571f36a701a10664b15e58d8b2d61df394e3f9675` / `758f6555077449661de017ac3ad4fd878a5aea943fff225c5f25ecf2a283c7a0` / `96900ac160854124e297781fc8a7e98af8f8a440e19308badf881b30d424a366` |
| `default-1440x900-own-dpr2-seed5-r2-a1.trace` | FAIL | 43578 | 0.254875 | 0.000000 | `b63966cc43d9fc30080477d0a5da750122ad323db28a3f35ea6494bc5b34e39b` / `2e3014482e511fbbc5ad3123e18ec27cec0ee78ffec58ee781d59b9682070dc7` / `4dd71df67d06e144d910ddbaacebcfd9e057bad9c1a02be124ce12f796eb461b` |
| `default-800x500-own-dpr2-seed5-r2-a1.trace` | PASS | 44293 | 0.327000 | 0.002000 | `9f8e21bfa99f314316f2ad7a6d443170cc064017074a09d527c2f86bbfad2a7c` / `f7ba069979f2a480f0b9f22eee2f33d08662d7958d9574dc7ab6a36bd6ef5af4` / `2bcd3946ac766013e047afe5e900bca8d2ba67c71f66a27160d8166d81d6353e` |
| `LavaLamp-1440x900-own-dpr2-seed5-r2-a1.trace` | PASS | 45191 | 0.280458 | 0.006000 | `50ff1f75a72db751dcbf526a90ea947061ab4d74998bdf9250c211c6e34f478e` / `18884a19c0d8d5c2f77c577c8586be34a46266a51c8e4535c9b96472fc4d2fb8` / `c471f5485e3730a920899a5e29186bf67f59f2c8442ba09633a9aa7154dea0bc` |
| `LavaLamp-800x500-own-dpr2-seed5-r2-a1.trace` | PASS | 46186 | 1.177292 | 0.000000 | `7df47393d607fbdd2119d1214986e27edc9e046d9bd78e5d0049a241f13b4ab4` / `e5afb9f72088ff65e32a3082b7ff062faf2e88574e4b63101d8366ad48ca7adc` / `8413c75db71acbe4b3f71d6188a361d76963afbe9843cb3521fa229888b02d1c` |
| `Plasma-1440x900-own-dpr2-seed5-r2-a1.trace` | FAIL | 46995 | 0.262791 | 0.004000 | `11941db3656af187fc9e1762cb1042c42e20f2543c07fcdd1d5ff992b8895bf7` / `a5228d4897b0848d729d3617d2922d9f99d4e2bded7efb073c9068d593c22fab` / `10d8be7d45d1767fe3b37b35090d03bc2bbd521ca5780b06fa74e3a17133a2e1` |
| `Plasma-800x500-own-dpr2-seed5-r2-a1.trace` | PASS | 47949 | 0.213209 | 0.000000 | `f8888a948d6c317a41cdb395d3e66311646f64ba98e7964d782a31e35a9c6c9f` / `a2dbe49174b12c789f4ee1f22892928a77b585e4f6716dab39d9389641c9d6f5` / `fec0e2cd5b97d86a7e947f447417c17f826032c86f7095dd1a731c1dde3a2e8a` |
| `InkInWater-1440x900-own-dpr2-seed5-r2-a1.trace` | PASS | 48642 | 0.847250 | 0.004000 | `16f884fcc1550ce17233dae04b44a6cd4065ed0c4f56b2ca24c957d31dca07c9` / `7d3fbe345a61ed9b01f433826ca24687f408a961b9db21d205a86dcbb5f2177a` / `df6cbe8c7c07487629ab0d3117d5dfc76b0093d517c2bd934945efee75b6231e` |
| `InkInWater-800x500-own-dpr2-seed5-r2-a1.trace` | PASS | 49370 | 0.262167 | 0.000000 | `9eac7814c0faa291786c2044cd10b5e0390b649c39f019038c0ba4067fafa8b3` / `90727d51486b3b3bc801a77bd80d3f802a646afee0ac922bc3f717c7758e4834` / `40551db91b61fd25055a32a7b13f09188e77d5b9e51136fe14c79fbae613979f` |
| `FrozenSwirl-1440x900-own-dpr2-seed5-r2-a1.trace` | PASS | 50005 | 0.209834 | 0.000000 | `ce1e0a3051a5aa7ac8f2b7b4f2d7d2fcd83980dcf54ecf5851579f577359ec2b` / `7b9e6fb706a90ab5b22a203e8b593282f7e4ff38bc87f1f128efa7adf0dcbfcc` / `42535646a9c66089fa5a7daaa7762cd44df27029abca97ce89989b8b05ba18fd` |
| `FrozenSwirl-800x500-own-dpr2-seed5-r2-a1.trace` | PASS | 50626 | 0.275208 | 0.000000 | `7f83dd0c50f83797a7e903d26b3885ea99f93498e3afe8e4b82f59a64a49dccc` / `5d0671835d50d6a6c591c0b1710965a72323814a98e14a3e25e2e39c7cedf209` / `e8141df3776793d860da13533d5200d26989c277c584ceadd79a0bf2820b7294` |
| `Aurora-1440x900-own-dpr2-seed5-r2-a1.trace` | FAIL | 51101 | 0.357000 | 0.000000 | `609b7714a1c83e248c41dc861ea32688ee219d8a96e2eb076f194c3c9bbf78c9` / `77fc9642c61703badf41ebacb884d0fe5ea9cf0df07b68cd8dd78ca305492210` / `2325459de50fb4fdfbf92b4b5176f12d4dd6fa67e7262c066e941cbaa268bb45` |
| `Aurora-800x500-own-dpr2-seed5-r2-a1.trace` | PASS | 51674 | 0.326875 | 0.000000 | `3feec994e0b2a8add79906ebc3316b72168abfcf455e209eed02fb07b4257272` / `51c1c1bd115f93b8938628f4140a3265460eff34af935bf281e48684a5b7ccdb` / `0bc45de82375cf49ca9fbec643864dc7e8f4adcf850baab8d54b1418357f4e73` |
| `CircularFluid-1440x900-own-dpr2-seed5-r2-a1.trace` | PASS | 52241 | 0.733667 | 0.000000 | `4ffd42fb33cd761353e06656b24da5a48a01f4864811e1ce8de2e83ec441a2e0` / `f59d015c266735cd2e2d8294f34291f3a0f102b05ec1dee8e012fcefb028b75c` / `ca40a43ecdbb1fb34981c84953fcdb208b41f0b4f96470683b452b5746a13628` |
| `CircularFluid-800x500-own-dpr2-seed5-r2-a1.trace` | PASS | 53098 | 1.199625 | 0.000000 | `a765ab63c05a591594ac0f655d940f9e16dcb242520007fb0c578eaeb06633a0` / `c9bdfa7a2bd3d68fc94996f39ec24eafa2324709486f31322aa7cf1f48c2ec4f` / `d2c51761cffe593e8aee674a8747f70cfc95dbfcb7d05b532b0fb47e0eb92589` |
| `FrameFluid-1440x900-own-dpr2-seed5-r2-a1.trace` | PASS | 53844 | 0.334209 | 0.000000 | `ca38386adb70fe4fe698bf3680bb54964e0d05418f2a7af36a250acb526ba85c` / `f3435cad971682df1015bbfc71fb8677c427bcee656325d918a1eb8fe5a22c20` / `a7b4048b231460004f08a7e7a95506086652500605d1283e1706018d14f15993` |
| `FrameFluid-800x500-own-dpr2-seed5-r2-a1.trace` | PASS | 54581 | 0.349375 | 0.000000 | `dd6430dd7823cf8ae933c2e00604a68d7ee618c5af4888f3585fb35e407e3a95` / `666f30ae8dceb9ce2203065ffb8a318a98a0f85c4d3a7cf1d08a35bb6414c399` / `fc35cfb1d1f9f70e9207da9d967fce52ae4c215ea644e84f39034a2b66034060` |
| `AnnularFluid-1440x900-own-dpr2-seed5-r2-a1.trace` | PASS | 55384 | 0.257292 | 0.008000 | `43513230e4351d2df5065cabd75484698570c51b1ed6eac97c9d60960c09a430` / `86a359bc968dc3a3f028f4c09fbfa3bdecd0331b1248480e7edbea46b4c8c5b3` / `85eb40538c4015a5f72eef20e5fbacbd22394ef17c91e6f52ea2965823f7bab8` |
| `AnnularFluid-800x500-own-dpr2-seed5-r2-a1.trace` | PASS | 56250 | 0.241125 | 0.000000 | `40f0cac1f36eeb355f49c2126a226a9ccee04c8c810f7e25f081568bda09758b` / `4047f8a1e6a003d634e2400006cda8186900d83bbb78869023a4d0d5dfa1227b` / `4d64032c6f7ec82d314f7823b0479ce4d08e6878c30e9832248c8658d4441094` |
| `SvgPathFluid-1440x900-own-dpr2-seed5-r2-a1.trace` | PASS | 57186 | 0.465833 | 0.000000 | `a5be1c2b1c05f987094b3170f4ba2b3859e5b268afb145add42b84aa3fb3ab7d` / `ade1a159dd15f3f1c262f7f5441b328418a1e9b152cf90a49141b97d35a9810b` / `70c2ee5b96fa54919dcc889e841c3899833f0e1bfebbb24a83dc0de5daf874ac` |
| `SvgPathFluid-800x500-own-dpr2-seed5-r2-a1.trace` | PASS | 57850 | 0.340708 | 0.000000 | `535d6f169b0d1d3caf7d7abc417a685aa5c9c347114a201fe982a9b687157631` / `d8447bade7eb1c98ae376c8b7d19b77f4890448d37a10926e5a25cc3f0534e99` / `ad4ca1ca0fee3ac41e6b9dae32fa8ed503ad0027d0cda34308d4bcd2ad387832` |
| `Toroidal-1440x900-own-dpr2-seed5-r2-a1.trace` | FAIL | 58919 | 0.368917 | 0.000000 | `b463e91d94908cd281edc26a25f793dcb03562696a3e5bd619d42466af1534d0` / `5e4a68008835910af9cad662bc3f67daf94ac938becefd9174969b81427d9e53` / `610586ad3d734ab0bfc031ed685b5f039371c30d5440158396a0d07f3774c25c` |
| `Toroidal-800x500-own-dpr2-seed5-r2-a1.trace` | PASS | 59591 | 0.260542 | 0.028000 | `d6cdb989e3ff2045e9bd1b293c6f5489ea465474bf5ffe3596ad7f6bd8114695` / `8fb89e56fd49f493ff0dde5347f090675d1e880be9f649500718847295166887` / `465b740e894702e74a7dd18aafd70ca667d0a358250698800045ce9fd7f61229` |
| `GasFlare-1440x900-own-dpr2-seed5-r2-a1.trace` | FAIL | 60174 | 0.303792 | 0.000000 | `5c776d15f77abf920087f82579b14d9771323ebecbb05beb44020adadd91fcbe` / `9d20c9a8b874cb63e8085d0166cfc3a63097a47f7d8659861cff1f34dbe0a781` / `2ced2471f984244ad67791d969687988e826e2ccc68c125b530b826a5ed978c9` |
| `GasFlare-800x500-own-dpr2-seed5-r2-a1.trace` | PASS | 61434 | 0.326250 | 0.000000 | `a19bbcd0cb94d69359a41e47d945552ac0215d95d28437a5b2d950b1a88a2da5` / `2a31a1f60adac2b4654cb0b0a9206f4f34a6944054f20d0ab70e67bc3297b664` / `17c6eb730cf139f48ef4374599bb57924b709a0d548a421ecafe8ffd36dfab26` |
| `Venturi-1440x900-own-dpr2-seed5-r2-a1.trace` | PASS | 61815 | 0.272792 | 0.201000 | `9b9af54ff00dada8246f9a49c73b30e067c4e1e3586cf19ac4ef5cfbb1e35895` / `82cdd0356ba648697e09878b36f2e88e6b41d16004ab58771683e3e227dd980d` / `1daaff0b3f51cdf33b4042ad48ce78c535d65b7ca8fd250ca23d80ca9fb75e8e` |
| `Venturi-800x500-own-dpr2-seed5-r2-a1.trace` | PASS | 62149 | 0.342792 | 2.020000 | `0b20c68052000b87d78f91940e0b72cd9650d8453ed53c5ca2a0281752d824d0` / `74aee89c3544bbc1d63c6768919caf027e7854bd327753f420c728f9a5576099` / `4edf4523ab5820cfbc3510a4ce76773d9d315fb0851b24cb5f5319ac1cf009c6` |
| `Karman-1440x900-own-dpr2-seed5-r2-a1.trace` | FAIL | 62953 | 0.342416 | 0.592000 | `ce033ec938311326a76a6ac6d64365fba233d92c8f599ba9d01b4767272293ae` / `2d0e9929e70f9ffcff8f8548c27728c17597a2868706ff4276ed17ee14d6c8df` / `5b53d93f9a71281874ba59e10be6be2b22819eb80a544d97d8c2c50e28861f02` |
| `Karman-800x500-own-dpr2-seed5-r2-a1.trace` | FAIL | 68200 | 0.263541 | 0.991000 | `53a1dffc2cbe19dd4ec8afadb4d197e6ba507618c2a6c29f8875779117c63787` / `2aa9340a5343ed5f03a58bbd55b0b0b53d25cfc6153fcb1d4a440a00f212149d` / `ba9bccfcd2b4b08554c0dd7db9efa06b5aa8a0b4fcda06b1304781e9b8987342` |
| `TeslaValve-1440x900-own-dpr2-seed5-r2-a1.trace` | FAIL | 76309 | 0.364916 | 0.035000 | `db0ba6bc0f4ec0494baf6414974c5bb257e7994cd15a386c994ced5faaf2c8a8` / `32c4659cf4c61189d5c4a92e98d141c5790852ed5b6d8f092161b7769432082f` / `08657b11f4d362aa150556015a9d42c263c7cfaac9a71ecf59693cf6f005a27c` |
| `TeslaValve-800x500-own-dpr2-seed5-r2-a1.trace` | FAIL | 77597 | 0.279625 | 1.207000 | `6a7c51736e5e9042fc7324d4144014ceca72eab55a3cd47b2eba96959cacb5fb` / `57acccb91017ba839be8bbbb4b5d64bb955ea93740518ddf6d869258c543a801` / `db5b4e650e545c0b1b460a122f699d7a1685dd7a4bcd57cb469022f16058b611` |
| `Karman-1440x900-shared-dpr2-seed5-r2-a1.trace` | INCONCLUSIVE | — | — | 0.000000 | — / — / — |
| `GasFlare-1440x900-shared-dpr2-seed5-r2-a1.trace` | FAIL | 96195 | 0.228166 | 0.215000 | `44e919897ba6a9a8fa1fa5ac8c1b2a15521669f329b5539dffa6feb333fed000` / `c3645b9379053be603cdf95ce50da6e34c659f9ddab276d1dc3a23c49ba309fa` / `762b204de470934099833f6f84c80d44d7c9da18c5c31cc95a6089b78daeb1ad` |
| `LavaLamp-1440x900-shared-dpr2-seed5-r2-a1.trace` | PASS | 97671 | 0.266292 | 0.572000 | `d5e78fd66a19695d2bf44fec61863edd1887bac569ebcb93e6c5a7815ac4a94c` / `81a5be283ad1eafd3d256d0d3bb112faed7a8ee2ee159d4b295f3c659c74fb96` / `8796812f283c106b85bfdac7f1a24421cb73ede90de8c04d1fcb98353a54eeec` |
| `default-1440x900-shared-dpr2-seed5-r2-a1.trace` | FAIL | 3247 | 0.319417 | 1.092000 | `d263dc641e339625f01cca31a6db88959069e025274e2066e4bf24f5fecf4970` / `daaafe497e41aeeb2037a5bf9db7e7fc89407e0c16e4c19a0f20224fa3a5db88` / `9f7ee5de4eb1d703549d7df2a814fe65538591e9ec41d8f5346ca90f4b6401bc` |
| `Karman-480.25x300.5-own-dpr2-seed5-r2-a1.trace` | FAIL | 5007 | 0.283291 | 0.976000 | `8b7753ff3348f8370000ab88ae3576d2ee525f5e87bbe4437d539df39c758052` / `37283d0e0480875fed92e87a4e3c13a11bbcc30fd128028447c3e406be2dc2f2` / `5d6b62f8f250a3ce233d29bd38b8776170b3ea73ee0796aef2899b1ce6738e55` |
| `modelbutton-232x68-shared-dpr2-r2-a1.trace` | PASS | 9991 | 0.232042 | 0.191000 | `890560d274ccb5700627eacc8d67ebc799d90ef37f8c36971d884aab10a263fe` / `404568cd81d015f039a19304ecc3eba730ec3b1bcff12bb23198b3fb693f0902` / `6cd5ab6cfda8e8c5986f49a3af30042413530b72ae0b207002b45f62315f0f0c` |
| `modelwidebutton-492x76-shared-dpr2-r2-a1.trace` | PASS | 10895 | 0.196666 | 0.493000 | `e7e50447556fe0eec40a36000282f377bd90d7d92d072d86467cf64d9af0a6ab` / `90f233a88d7805cc20fdd3352e6fba0705a34035c59a5ef29696c00fc7626fb7` / `f78ab150e1cdad08100e3c778aa345ef537d0a69b04b6cc1b1488494f708aeab` |
| `modelsegmented-372x68-shared-dpr2-r2-a1.trace` | PASS | 11758 | 1.097833 | 0.594000 | `6fb28ecebd10c10489db1690992c767c3c02626ae8a5ef29589c7cd17e8ee67d` / `5d10b5febc8baa17dab6af1115145b894b74c56fe1f1faf5365b7c03af9a8d0c` / `47edb1b7b1d414c811011bb85cb0470c4f5185213ed8f5b63c5370f7e9617ec1` |
| `modeldropzone-492x212-shared-dpr2-r2-a1.trace` | PASS | 12776 | 0.935208 | 0.204000 | `e4e9d6d9a3405d6769bdec4a21ca0a7f364f6a5539eaccbfc1756fcd6b5c6c25` / `a40806f0ec3947ba56c894db9010e6a617cb0649c2536603c9cc019992613029` / `8a99d7f193241f12fa52a72789ba9f93b497fbe2a7fc4439dccad1c7ff0bed37` |
| `modelcaustics-720x400-shared-dpr2-r2-a1.trace` | PASS | 13586 | 0.216833 | 0.186000 | `437fc7301fd20f1a4883b50ba7a0536ae336c65e79bc36298364c79883851a92` / `107b81ce656dd943c550f6836560596b47ec4f8b831059fdd62c47889e467bfd` / `aa416c07dd4d31def013a3a7d3f77b9226503690b856cf1e4460c8d840228ad0` |
| `modelenamel96-1x1-shared-dpr2-r2-a1.trace` | PASS | 14368 | 1.185416 | 1.755000 | `e68e85aa23bb81a75f10bbd1a4d67fca4b341918e9b5aa0e10379dcea4551d92` / `f957485afcfdc38a2e2ebfa308290db2e291c2ef63d3d937a483beae37c8e6ea` / `f95e8005269a927ee38e7492230dabb6afb12b63d0f1b90b350968d7c7e8a349` |
| `modelenamel64-1x1-shared-dpr2-r2-a1.trace` | PASS | 15284 | 0.220917 | 0.675000 | `b8a45738d48b44f71a4b18be59a6fa14487f2b7851b597ec803e375ab20229b6` / `5e6a3f32e0d226a49de51ca23b71f2b7ceaac8edf91d2fbb96e838c1c9e9846d` / `4cfc9409b39d79d6b201700146ada5a7f0b84253e8f85bc158c5aa7165e9841b` |
| `modelinkpaper-800x500-shared-dpr2-r2-a1.trace` | FAIL | 15945 | 0.268583 | 0.163000 | `c628d38e9a27fef0885431b5dc74ed1daa27e2271a9c361706c4c694f5e471ea` / `d3d24593471be555f822073723db55d6f7d34f0254b3a5c41fc9a75010937712` / `0298ebb657ba26fcb21c3ef575205d98cd9e098921280d0290fd4b1946c413af` |
| `default-1440x900-own-dpr2-seed5-r3-a1.trace` | PASS | 16539 | 0.504625 | 0.216000 | `ce6385270d5ab14886ba575644c7dc8cf4e347211d26c00b24babbba5ba57dd3` / `ac98200b0595afd14b6d49a894a7c39943f0382e0c3d13e2dd469193e92fe462` / `1acbd61077b10ddd67d6aaeba7d31fa7e56cec05909a0da0c1e6012c8430d6d6` |
| `default-800x500-own-dpr2-seed5-r3-a1.trace` | PASS | 17656 | 0.216458 | 0.000000 | `9e2722f6d0316f32afffcc5806b8e942fe0462a9ebb32668f2c57d09117c0cd4` / `74b50794eececee0e36f8478bd528819a7965181a4ed8ff1dab18484ba9aba50` / `6ed958dfa374eae1deb1f1975aeffc5fccaba4a87020041ec292902a168ac98c` |
| `LavaLamp-1440x900-own-dpr2-seed5-r3-a1.trace` | PASS | 18324 | 0.251666 | 0.000000 | `2ae0dc74b6aa3e226c348d1e38ed55d87fc8742ee0863b04100ba7e09817d993` / `af28b7a826f444494966b5566cd3df0acf8bb3c94f39464ac0bb214928610e17` / `373011a9984f15f64f6f581203b48890de2dd9d540f2839637522bb70bf75cdf` |
| `LavaLamp-800x500-own-dpr2-seed5-r3-a1.trace` | PASS | 19036 | 0.338834 | 0.000000 | `c756f2a7307c15f43b451b467e3825b941a06c4cc638312c3125414ce76537f4` / `b3856087156a202a555638e42ee494e74cf50758588d4c1ed678589217518d7f` / `b442fb2bd2098abbf6bc5b2aa3659a83891d44993c656e8ffa83b95208794386` |
| `Plasma-1440x900-own-dpr2-seed5-r3-a1.trace` | FAIL | 19791 | 0.385042 | 0.000000 | `0e1d299cc985f720e6653ab2eb28b6f2e8f8edbfe716bc15f2c6469de04670e0` / `d32130d5f494e1f598a72e886f4bad7e2a78acbc42d2ad44e95bce02d6823855` / `1736f35c5132dfca0192c723accde6f0c59237e5a8f99dca24abd7f8c58f8d04` |
| `Plasma-800x500-own-dpr2-seed5-r3-a1.trace` | PASS | 20395 | 0.351000 | 0.086000 | `9ac00130e2b5b7702397c95d65dc8cedc4eec3cc67ef814bbaa4c1ecb7bdce7d` / `f27e548f120799a94459b6b376e5eb79f3b2f92985823b2ac5d4c1710ccfdf0d` / `d344113752c10e96484ae7bad3fa45f2e9ee0634a774bd2c2d11a7189dd87020` |
| `InkInWater-1440x900-own-dpr2-seed5-r3-a1.trace` | PASS | 20953 | 0.271625 | 0.000000 | `5a8f08f1ab98cf9037f5f5ddc273cd15712b43a183dc8712a45911bf65486215` / `caed53d76dc4fad83a4595846c0f3d4689aceaab2098cdbd652826f51765343b` / `bc37248e68d18955ef26960787fc4f0199206c3ae101a709db14dd09e887fd3b` |
| `InkInWater-800x500-own-dpr2-seed5-r3-a1.trace` | PASS | 22212 | 0.362416 | 0.000000 | `9ce9b4a44bf2e32199cf063d92780795316480a71ca0cf495c7c11f41617bbc1` / `4859725efd895c1ee67e56c7929f3103939185cf38f4c9f4b3616fae7e8f1bea` / `69eff259f972a52574f50dba2a9eb2f2a8df68834b5fcd1fe9ff1faa665281d3` |
| `FrozenSwirl-1440x900-own-dpr2-seed5-r3-a1.trace` | PASS | 23190 | 0.259917 | 0.000000 | `bbfb37f39ec4533aa6cfb910a944a670793841f174d23d4a6c29b9bc9960f335` / `3ca60085c487c3fe56842ad8de75bbf08bde16f742b87bff77da7f01020e8932` / `27e6134c823b4d9feadf045b72687c8296bbb2e5fa26c6c9923981e148b6a3f5` |
| `FrozenSwirl-800x500-own-dpr2-seed5-r3-a1.trace` | PASS | 23790 | 0.210708 | 0.000000 | `78a330e494f8d8afbe60822f26d157eb30cba5f346e25d7f745dad4413de6b65` / `c4eb0de79a1a1a170fdce792472f242f9eacb9552714aa59ad68716a06b4df48` / `16d83fb15f07b2c2ceee92b11e6ffead052a1cd350a897369216b9054b33e07b` |
| `Aurora-1440x900-own-dpr2-seed5-r3-a1.trace` | FAIL | 24677 | 0.222250 | 0.000000 | `c8222f90463089245fc09b53ae2a066007705e1aaa30a920deab2130154192b9` / `3c344134ff94d3296cce2d903b3838345d66503381f222a9b156bc80c3f23b5b` / `b4d975d9ebd35f46fcb592e3a8fa48ede1516dc81a3db018061f044b33b70872` |
| `Aurora-800x500-own-dpr2-seed5-r3-a1.trace` | PASS | 28929 | 0.226500 | 0.000000 | `96761c62591e6cfa65344e468510fb3a226b4b3bed17d3eeea661dfdaac5cea9` / `a9087c49cf0e1a287c83acbae958aecb4a04f86db7b410393d98cfafe232793b` / `4a6ac806555661f2d3c2c48023703a2c884c881bf8e80ac123da536c9976e3fc` |
| `CircularFluid-1440x900-own-dpr2-seed5-r3-a1.trace` | PASS | 30009 | 0.346000 | 0.001000 | `4102b3e4f521bac4954c01036149ff3e268e455b4cfa6436b7d057c30a985957` / `5303f9c9c719c33cf3a13eb14558e31da473b19fad503105815ac9cd42f714b0` / `4fa10213c144712fc08c8aa1205c5ced72897780972b58583eef297e11f2a1a5` |
| `CircularFluid-800x500-own-dpr2-seed5-r3-a1.trace` | PASS | 30684 | 0.314167 | 0.000000 | `d877890d7bd1fd786c859ebb9b808d52c61d0abcc9014016cd248cc131b182a4` / `767ee75e9afca7990135f906ea07ccc469efb6055b03ad704530226a040db24c` / `aa015d5ac497d197b731dfaad587e6b54ad0d35b99e914aeb426e002330e01f1` |
| `FrameFluid-1440x900-own-dpr2-seed5-r3-a1.trace` | PASS | 31774 | 0.280166 | 0.000000 | `55a748e0486489e8f02ceb284b9728382e8cbcd7647e48331c09b19e801896c0` / `47ca7804281c644c75249b308762a82feee1336e5f190609d753a1f2b3e055a1` / `d84f548b3f7029748bc113b06e72f0f4587bd9ad2cdf57d56da98089e3d476d6` |
| `FrameFluid-800x500-own-dpr2-seed5-r3-a1.trace` | PASS | 32796 | 0.296042 | 0.000000 | `4e54184ab31f64ae24c1070b0a0628fc2a7d37873aeedc11d0a83107802e1889` / `41e979155252fe2080ff3d58172fc849a644804dcdf1e0c66eb3130fc20d2777` / `e00ba90984bd2be456f23c0d0c3f1552ee4eb24110831e0b441fab8c61c10902` |
| `AnnularFluid-1440x900-own-dpr2-seed5-r3-a1.trace` | PASS | 37023 | 0.347791 | 0.000000 | `d3ae7ebd404901ecfb36b640b60e3a6f8b1d9ecf45f2058201138d475c12b76b` / `70981c17ea3c30d6c83ba4f0b75edd1728d26be4a4d733b593f0327a535b4834` / `b26d7a675024693f050b4b6c06281493fcac1e819f0077c668db0dd7785ce215` |
| `AnnularFluid-800x500-own-dpr2-seed5-r3-a1.trace` | PASS | 41636 | 0.224750 | 0.000000 | `9358c48704be4b81e12a2beb2d2acb43dab6188c027b66a09b88bbf7d85fe420` / `3ee8210fc8dcd06309332fd83b0db3e970bc8661a953268e4764a906012b5027` / `95704ff1b7738bed7c2fcdbfaa3648c463e30e6a9ece76c630ed36ae9bf3d7d2` |
| `SvgPathFluid-1440x900-own-dpr2-seed5-r3-a1.trace` | PASS | 42416 | 0.348208 | 0.000000 | `3b633f2510331cf04f35d50a2c110da72c72c60f7b9a8bf6d0b939bc9f5f41db` / `4105a8dea981e3da12ecc1541b3b3eff18a1bd8e436369523d4890036757f2a1` / `5edebb6a81866ded3b03dbad5312c957e2471902986c27cac952110dbede49d3` |
| `SvgPathFluid-800x500-own-dpr2-seed5-r3-a1.trace` | PASS | 43088 | 0.312083 | 0.000000 | `a581fd5e0df5db524d7c7032ffd45365659edfdc7a0f486e8ca666c7854d14f6` / `d131817e2ee863f0c3b13e29e7a7c91e86475b5bfb2d3ec16a423010c5b496e3` / `5314fea13cb1ce3b71c457827bd0806a285bedf148fcc05807ac684733f123e9` |
| `Toroidal-1440x900-own-dpr2-seed5-r3-a1.trace` | FAIL | 43650 | 0.248417 | 0.000000 | `280ca956158fce523f1385e6edbe512acc6e858b61447c0e67c6d6bde1beeb3b` / `9f3aef894742106f6a712dea1f5c674e5aebdbeb85dcc54905c795b4f3f7b4a1` / `f73a4ef5d284e86dd2363d337d5156ec813c3f23728110f8ab8bc569208535b7` |
| `Toroidal-800x500-own-dpr2-seed5-r3-a1.trace` | PASS | 44521 | 0.217708 | 0.000000 | `ee02b29b57e463d990f2c2a64b260f17f63e5fd4a91f0b3aa38d29891f75f745` / `94172476425a993a53fccb3c73eeff4df2973605bd1189fc1225a7e6e7615eaa` / `3fe42db27ef407718328b6520a28db1898876327959e74b20ffd087de837fec4` |
| `GasFlare-1440x900-own-dpr2-seed5-r3-a1.trace` | FAIL | 44881 | 0.316334 | 0.000000 | `012105c8e8f0149cc756643125e11d4e6daa24a8a3cc72b795c83d0c6b57baef` / `3798e9ec721c1f9ab97eaeee535fbda6d254698d7b5a83cb57fd9d29c25eb8b7` / `5a37ed8cfc049d1577b719175faca4ab7930f6a209c907402a324efc3c4e2da7` |
| `GasFlare-800x500-own-dpr2-seed5-r3-a1.trace` | PASS | 45236 | 0.310959 | 0.000000 | `01329a92c9ee5ac0e8d73f9a9bdb3c42dd1bc785f671712866d2a1e412b71a59` / `00746a84cfbcd451c0e0270b6258e9469c61591205336cad46fbbcf75e117a70` / `fe6346389ec4e28bda95fc2a6b37125148e52e0b852303ce6653a053f2e5c6e3` |
| `Venturi-1440x900-own-dpr2-seed5-r3-a1.trace` | PASS | 45644 | 0.234709 | 0.000000 | `a0a5fa67a71366a168286601f37b3d142940d9585aab925496cae4a18cd2ad8f` / `cb9f4bf95a87646d2846a52e2a3e4e439388666be2bed654e59a8f6ba87e6370` / `3718fb4ac6a93b1b0c46dac984a7a9f35326086bc489b85e4a20c07359b139c0` |
| `Venturi-800x500-own-dpr2-seed5-r3-a1.trace` | PASS | 45999 | 0.216208 | 0.000000 | `bb57afcb82578a6cdf733b2bd50bd202a286e1a8b6e24a46a995da5a8ede4b11` / `7bbcf17c1f87214e66d7df719694ec01383f2ca47343553f3d92b7f889dfe542` / `ae7c3f6679d1af5941ec082cb9206713ec266fd7887d070edc397015fe1c38ed` |
| `Karman-1440x900-own-dpr2-seed5-r3-a1.trace` | FAIL | 46376 | 0.406709 | 0.000000 | `e42c0068d87bb2a23cccb91a6d4645de8aa6b6a58150b3f7a52127ca890e5f69` / `c1e7840e0a768bd43d92addefe2c62c3c4601c12ec11d773fb7ce0b5216b8eb6` / `115f85449e14343ce3af9dade5e9ac05f20ea86929e6b06a1926956f536cd318` |
| `Karman-800x500-own-dpr2-seed5-r3-a1.trace` | FAIL | 47035 | 0.282959 | 0.000000 | `a7c043bf067cd7f98743d610bb461a3bc45cc2f5f061443ba1522684949947d4` / `328032d109a3177685223b22906dac5ae970d4e07b7c93b4c26e90c7a26d0ddd` / `b7afb3dca9de660e291558877af796264e231e7e00e9ab20f1a1285a660012d8` |
| `TeslaValve-1440x900-own-dpr2-seed5-r3-a1.trace` | FAIL | 47663 | 0.280250 | 0.000000 | `f0493d3d6135f02f11adc9548cf4dc4e33931d862efd7bdd3e689251b1b0376b` / `0e940f2dfe82943acf8535f977f0542af0ed40c01cc8eaed665d7cc50d368fb2` / `0843a6859647ea606cdf656617a038b1640823baba6023407dc2c023e3c1b06b` |
| `TeslaValve-800x500-own-dpr2-seed5-r3-a1.trace` | FAIL | 48445 | 0.302000 | 0.000000 | `8519d330cb2b0a5fc471ea9250e110f8ee2ce10f36a15d8f5d0d0a173f29f5e6` / `c877262500e8e2d6c31c065f03296895b42dc4012e0cebefda62f80de7e66e63` / `2e3c46824921ae27c36a9ed085d3db8d2d1f38511702d00d97be35358720eede` |
| `Karman-1440x900-shared-dpr2-seed5-r3-a1.trace` | FAIL | 49038 | 0.226583 | 0.000000 | `7df9e91af1c5a82216c9419907c8cf937f99bc4e15891b4853137b2c456733cd` / `f69af8ca5648552ea9546e11ad460e8dc10f822836f24c6e906c006e0bcaf67b` / `98d19be8110aaab725f35e408addee3c1694d593d59b78b86270d7d6fe64c015` |
| `GasFlare-1440x900-shared-dpr2-seed5-r3-a1.trace` | FAIL | 49682 | 0.144542 | 0.379000 | `03e1b7c19b8348362b47a072e2ec70cbc368963d92607cedc73a0b1aff73fe69` / `3a06009404733184f53f64354e6609deccffa3473e2c72e674b30e29818ae854` / `ade9e52749aafabba597adc1c8a28e113e51ef93bb6524b55e8f0863ba4b7db1` |
| `LavaLamp-1440x900-shared-dpr2-seed5-r3-a1.trace` | PASS | 50343 | 0.221209 | 1.260000 | `719549612a09544fab2df97f6efb93ae50711d0fe1abe4784ba6336e18b237e0` / `223d1be08bf0f3e10819fe0f4f5beba404e8198680277dae48047c5680b09625` / `d8af26ebd5fdec143aecb7974ba76d2b0f945c5df0457f72be4d4620537211ab` |
| `default-1440x900-shared-dpr2-seed5-r3-a1.trace` | PASS | 58331 | 0.300042 | 0.227000 | `5b2a55fedd1c4c8f89e6f9fdfef0d4ad91af47634b12bde86a0443ee988178ff` / `6792b06b3f0101e6803bcee444e8e23d9c6c5f9cac3b5a17ea0994a0135974c2` / `2369157cd460f40a98266281df912b0a178d62b52fb322a472bd55aa680484d4` |
| `Karman-480.25x300.5-own-dpr2-seed5-r3-a1.trace` | FAIL | 59200 | 0.298583 | 1.098000 | `1cb392a68999f42d542ccd24688a184d8e063b6487d23cb4c9f1a3283e9280ce` / `e5c6f9f0e9a9dcb6bd53e0fd14cad980fd8f007da592ea55f25db43e12548b6e` / `554c903f84be9de9f91a9c494401b624109779286121593041a4527185f7e7fb` |
| `modelbutton-232x68-shared-dpr2-r3-a1.trace` | PASS | 60118 | 0.243209 | 0.285000 | `64f1270c32dee9cea9a110169c82a9bcfe6b0ee0b34de5ca0985714587a13964` / `9aefe051d20e3bcefaffbcfbdb21b5970ae9b676664660d34156ef8ed49b5a76` / `b6af386f5fc96226745723fec59bf9279bf1b6708cabe5eeddcd2fa6266e60db` |
| `modelwidebutton-492x76-shared-dpr2-r3-a1.trace` | PASS | 61097 | 0.304334 | 0.501000 | `cda84f15f5332d3b95cb38861524c3120936a3237ceacaecdf3aef4a3693669e` / `bf79775a2426b777cbd0547af902a981471164084eaaf56b0dc54576a36a8f5f` / `e57701dd119d6f8669109679dae74f761d1ec49a7a45917d900b753fba01912f` |
| `modelsegmented-372x68-shared-dpr2-r3-a1.trace` | PASS | 62188 | 0.187375 | 1.899000 | `4d2269867e1b54bbbc95dd34615cbbb3a1e2ae24186e86ac5aec40081d7244db` / `413e48402b11025ffa286d5bfdf506a4066a6e5101830cb439af9b652781c6a5` / `23f3702e875a2d736c92e8bc0e1f3893f952a65b896e9ab08cf0aa3092bafa68` |
| `modeldropzone-492x212-shared-dpr2-r3-a1.trace` | INCONCLUSIVE | 63078 | 7.737208 | 0.000000 | `7c29701892dcd3718554905a3c0709ac326dfe4c68fe00ffa269391f6f0010a3` / `b096b41d5dc94c39e7c25357649602742c4ad646bdf720e6fa5715cec0807e7f` / `f68b4b25fff47d48fc07580d429c2a35aa3e215bb63e0d74d57b67273459625a` |
| `modelcaustics-720x400-shared-dpr2-r3-a1.trace` | PASS | 63713 | 0.275042 | 0.226000 | `d241fb7544d7f70981f3fc3d489e260e7dd908da0fd68089a0146982154cdce3` / `fcabe7dcc944865b79d097c38dd44c19616bad5fa63794228ad4cbedde4ea8e8` / `34253be85adb3d02de23372dedbb9c74ecab8fb02419f7d12d4bbfb5b8ed5c80` |
| `modelenamel96-1x1-shared-dpr2-r3-a1.trace` | PASS | 64471 | 0.849250 | 3.318000 | `1469a3c65e69df4e3f4ecbc22065b5a74db4fbc16ffe81666dd83e7ec3e16582` / `327cb99b5b51340cdf4a91b32ea63ade3002798d39b7c4f09bc243a29d660aa6` / `036d33be7d94c09b20cc743396052194eae62fec69f7e78acd33fa87d712df59` |
| `modelenamel64-1x1-shared-dpr2-r3-a1.trace` | CONTENDED | 65207 | 0.332000 | 6.391000 | `c96afdc21daeea538e8c7dcd9422e2305de10e8158c4aab280dbb62ba3721852` / `fd24efb4828fdd4bc1b4df3e7730b324d6a4914f35fa0c1e5a0f79533c1f8625` / `8df1b7175087cbc273a12e9cd56d1f10005b4e404a2c6c3b98dbaec004c4a9ee` |
| `modelenamel64-1x1-shared-dpr2-r3-a2.trace` | PASS | 70626 | 0.224583 | 0.983000 | `3e0c0afa46fe34eb95408e988446786fe094120fc446bbe06bf07a32ed2b5738` / `2c630f8f340837fe632f605c62d277b9e1c843f6727c295ea5dd51f3e3e33ff2` / `58d3a3fb1ce48204798863db4b86ca15d34dbc4a0271fe96a03df61eb00f7bc8` |
| `modelinkpaper-800x500-shared-dpr2-r3-a1.trace` | FAIL | 72043 | 0.245333 | 1.447000 | `44b13e2e341e1ac0e8d8b5d5f32880c7878003dbbe1fd631efa0f59bfe978ba0` / `fd16fc0e39325e039f568758ea8e8163a7e9b9fccd3b93614b9fda5175e349db` / `f297f6170c8d3fa878229cdb87fa75c4bd521ef97b308fc5bdd060e394bbb847` |

Additional file SHA256s:

- `capture.json`: `4c75a79f32286f05b1540ff8dfeebb53eb69df8e6fd2b0e5fd78649efe86bbec`.
- `capture.log`: `bd00a56431286a6afb765792e2be77f2a82a3b303d8533ddfe34682c49209fa9`.
- `clients-before.txt`: `ed2a39a52dd154bd94460f65234bd6811227704e816fa2a35a791ec472e1e134`.
- `clients-after.txt`: `96878f1246c9c16ece19012e213bab79581d1e915939107a3947a1437b4d6648`.
- `diagnostic-replay.log`: `792acae6892c05fe8499c7488798a474d040696e3caa413acca3c654491ce567`.
- `diagnostic-svg-gpu.xml`: `9fea80786e16e8d57502bb182cd325b127a514d99d0bb4e582f0f7d154010d0c`.
- `diagnostic-svg-export-summary.json`: `9eddfd5442762613f23523278a281341f13972f434e805c89d53d83b46495b8d`.

### Checks and cleanup

**864 tests /52 files passed;471 checked files,0 errors/warnings**.
Harness self-check and `git diff --check` pass. No public/package/runtime change.
Driver **40255**, launch shell **40253**, raw export **74707**, all128 recorded
capture GPU PIDs absent in final exact-PID census; no worktree Vite/Chrome/parser
resource remains, no port5198 listener. Script closed its owned Chrome contexts/
temporary profiles and descendants; no user profile touched. GPU lock owner
`stable-matrix39789` verified before removal; **lock gone**. User Chrome4386/GPU4411
and foreign Chrome-for-Testing48063/GPU48074 still alive, untouched. Full before/
after census retained. Worktree and ignored dependency symlink retained because
work is not preserved remotely; no blanket cleanup, install, tracker writes,
push or merge. Traces intentionally remain ephemeral in `/tmp`.

## Per-preset quality sweep

Owner-authorized measurement-only lane, based on local **`0796515`**. Preset
registry defaults and production/runtime code remain unchanged; quality adoption
and its ADR await the owner's visual decision. Harness override implementation
**`2818c74`** records the requested override in the capture JSON, every result,
and JSON/trace filenames. Only `pressureIterations`, `simResolution` and
`dyeResolution` accept validated integer overrides; seed/input remain fixed.

Screening: N600/R1/W200/seed5, Karman own1440×900, TeslaValve own1440×900,
GasFlare shared1440×900, native DPR2. Pressure ladders are tried mildest first
(Karman30/26/24, TeslaValve26/24, GasFlare22/20); stop on a clean p95≤1.85ms.
If pressure alone cannot clear the margin, reduce dye (Karman768,
TeslaValve/GasFlare512), retry baseline pressure then its approved ladder in
mildest-first order. This second phase tests whether the dye cut can avoid or
minimize the pressure cut. Initial scope excludes simResolution changes.

Scope extension from the lead after the owner selected **“Screen sim 160/128”**:
Karman/TeslaValve only, try sim160 then128 at original pressure/dye. If neither
clears ≤1.85ms, combine sim128 with the approved pressure ladder, then the
reduced-dye ladder, mildest pressure first; ceiling sim128/pressure24/reduced dye.
GasFlare keeps its original sim160. No other config settings change. Any candidate
meeting screening margin must still pass every failing size/tier R3. A clean
certification FAIL is retained; a deeper approved setting is a new candidate,
not a retry of that failure. GPU lock remains held through this second round.
Screening is not certification. Any candidate reaching the screening margin
gets the complete ADR0105 N600/R3/W200/seed5 protocol across the failing
size/tier set, including Karman shared1440×900. Every clean run must have
p95 strictly <2ms; no favorable retry or averaging.

WIP evidence: `/tmp/quality-sweep/summary.json`, capture directories under
`/tmp/quality-sweep/{screen,certify}/`. First Karman pressure30 screening:
median **2.131206**, p95 **2.956169**, max **3.251914ms**, clean **FAIL**.
Remaining measurement in progress; no candidate certified yet.

GPU lock held by the exact `quality-sweep` owner PID recorded in
`/tmp/quality-sweep/owner-pid`; full pre-run census
`/tmp/quality-sweep/clients-before.txt`. Ordinary installed Chrome, fresh temporary
profile per attempt, no unsafe GPU flags, explicit Xcode environment on every
xcrun invocation. Foreign user/Chrome-for-Testing processes untouched.

Initial checks: harness self-check, **864 Node tests /52 files**, Svelte check,
prepack passed. Logs `/tmp/quality-sweep/{test,check,prepack}.log`.
Clips and final cleanup proof pending. No tracker writes, installs, push or merge.

### Post-screen eligibility amendment

After seeing the screening data, the lead relaxed **only the screening margin**
from ≤1.85ms to **<2ms** for certification eligibility. This is post hoc, not a
pre-registered threshold. ADR0105's actual acceptance remains unchanged: N600,
R3, W200, seed5, every clean run strictly <2ms; failures/missing slots retained.
Certify TeslaValve sim128/pressure26/dye512 (screen1.896289ms) and Karman
sim128/pressure24/dye768 (screen1.970748ms), covering every listed failing
size/tier including Karman shared1440×900. Marginal screens are not certification.

Lead-directed measurement-only extension for GasFlare: sim128, original
pressure24/dye768 first; pressure22/20 next; then dye512 with pressure24/22/20,
mildest-first. First clean screen <2ms is eligible for own/shared1440×900 R3.
No settings below those floors, no default adoption. Existing screens preserved.
Original pressure/dye sweep: Karman deepest2.293043, TeslaValve deepest2.185167,
GasFlare deepest2.179544ms; all FAIL. Grid Karman deepest1.970748 and TeslaValve
pressure26/dye5121.896289 PASS below2ms without the original margin. Capture
artifacts `/tmp/quality-sweep/{screen,grid-screen,certify,gas-grid-screen}/`.

One grid Karman sim128/pressure30/dye768 attempt hit610s recorder-finalisation
timeout after600 marks. Original GasFlare pressure22/20 and pressure22/dye512,
Karman sim160/128 screens fail the unchanged4ms alignment gate. INCONCLUSIVE,
never counted as zero-cost frames or quality FAIL. No manual retries.

### WIP certification checkpoint — 15:47 PDT

TeslaValve sim128/pressure26/dye512 completes all6 clean slots: own1440×900
p95 **1.879877/1.909086/1.896793ms**; own800×500
**1.618707/1.625502/1.631419ms**. **Certified PASS** for both required scenes.

Karman sim128/pressure24/dye768 still completing its12 slots. Shared1440×900
r1/r2 **2.038624/2.037455ms clean FAIL**, therefore this setting cannot certify
all required scenes. Own1440×900 r1/r2 **1.964292/1.944457ms**, r3 attribution
INCONCLUSIVE; own800×500 **1.754832/1.746250/1.783919ms**. Fractional own r1/r2
**1.691749/1.689500ms**. Remaining attempts and GasFlare grid extension pending.
All reported failures remain; no retries of clean FAIL or alignment failure.

Initial clip runner stalled after saving three valid native Karman WebMs. Its
exact owned descendants were stopped; runner PID9425 ignored SIGTERM and required
SIGKILL after identity verification. Foreign processes untouched. First clip
files retained, rerun reuses matching settings; bounded90s clip watchdog added
only to the temporary machine-local recorder. Final synchronized index pending.
Ownership evidence `/tmp/quality-sweep/stalled-clip-owned.json`.

### Every attempt and final screening outcome

All values ms; N600/W200/seed5/native DPR2, one run per screening level.
Each row is its sole attempt; no manual retries, pooling or favorable selection.
**No approved level cleared the original ≤1.85ms screening margin.** Eligibility
was relaxed post hoc to<2ms as documented above. TeslaValve certified; Karman
fails shared certification; GasFlare fails every added grid screen. Single-run
PASS below2ms is not R3 certification. The original stable-matrix results remain
baseline evidence, not fresh paired before measurements.

| Phase | Preset | Requested override | Scene | Slot | Median / p95 / max ms | Verdict |
|---|---|---|---|---|---|---|
| screen | Karman | pressureIterations=30 | own 1440×900 | r1/a1 | 2.131206 / 2.956169 / 3.251914 | FAIL |
| screen | Karman | pressureIterations=26 | own 1440×900 | r1/a1 | 2.032207 / 2.802875 / 3.109128 | FAIL |
| screen | Karman | pressureIterations=24 | own 1440×900 | r1/a1 | 1.973127 / 2.720498 / 3.048752 | FAIL |
| screen | Karman | pressureIterations=34, dyeResolution=768 | own 1440×900 | r1/a1 | 1.918669 / 2.639669 / 2.910379 | FAIL |
| screen | Karman | pressureIterations=30, dyeResolution=768 | own 1440×900 | r1/a1 | 1.782083 / 2.491501 / 2.841875 | FAIL |
| screen | Karman | pressureIterations=26, dyeResolution=768 | own 1440×900 | r1/a1 | 1.695376 / 2.346957 / 2.714624 | FAIL |
| screen | Karman | pressureIterations=24, dyeResolution=768 | own 1440×900 | r1/a1 | 1.695418 / 2.293043 / 2.628916 | FAIL |
| screen | TeslaValve | pressureIterations=26 | own 1440×900 | r1/a1 | 1.789958 / 2.444002 / 2.689334 | FAIL |
| screen | TeslaValve | pressureIterations=24 | own 1440×900 | r1/a1 | 1.695792 / 2.266000 / 2.634752 | FAIL |
| screen | TeslaValve | pressureIterations=30, dyeResolution=512 | own 1440×900 | r1/a1 | 1.767168 / 2.458538 / 2.632916 | FAIL |
| screen | TeslaValve | pressureIterations=26, dyeResolution=512 | own 1440×900 | r1/a1 | 1.650542 / 2.267709 / 2.450708 | FAIL |
| screen | TeslaValve | pressureIterations=24, dyeResolution=512 | own 1440×900 | r1/a1 | 1.602625 / 2.185167 / 2.420666 | FAIL |
| screen | GasFlare | pressureIterations=22 | shared 1440×900 | r1/a1 | — / — / — | INCONCLUSIVE |
| screen | GasFlare | pressureIterations=20 | shared 1440×900 | r1/a1 | — / — / — | INCONCLUSIVE |
| screen | GasFlare | pressureIterations=24, dyeResolution=512 | shared 1440×900 | r1/a1 | 1.730749 / 2.242876 / 2.440667 | FAIL |
| screen | GasFlare | pressureIterations=22, dyeResolution=512 | shared 1440×900 | r1/a1 | — / — / — | INCONCLUSIVE |
| screen | GasFlare | pressureIterations=20, dyeResolution=512 | shared 1440×900 | r1/a1 | 1.829129 / 2.179544 / 2.867708 | FAIL |
| grid-screen | Karman | simResolution=160 | own 1440×900 | r1/a1 | — / — / — | INCONCLUSIVE |
| grid-screen | Karman | simResolution=128 | own 1440×900 | r1/a1 | — / — / — | INCONCLUSIVE |
| grid-screen | Karman | simResolution=128, pressureIterations=30 | own 1440×900 | r1/a1 | 2.217875 / 2.561458 / 3.106499 | FAIL |
| grid-screen | Karman | simResolution=128, pressureIterations=26 | own 1440×900 | r1/a1 | 2.129210 / 2.453041 / 3.185457 | FAIL |
| grid-screen | Karman | simResolution=128, pressureIterations=24 | own 1440×900 | r1/a1 | 2.356958 / 2.535372 / 3.169419 | FAIL |
| grid-screen | Karman | simResolution=128, pressureIterations=34, dyeResolution=768 | own 1440×900 | r1/a1 | 1.963250 / 2.243209 / 2.679708 | FAIL |
| grid-screen | Karman | simResolution=128, pressureIterations=30, dyeResolution=768 | own 1440×900 | r1/a1 | — / — / — | INCONCLUSIVE |
| grid-screen | Karman | simResolution=128, pressureIterations=26, dyeResolution=768 | own 1440×900 | r1/a1 | 1.858545 / 2.042252 / 2.441793 | FAIL |
| grid-screen | Karman | simResolution=128, pressureIterations=24, dyeResolution=768 | own 1440×900 | r1/a1 | 1.669667 / 1.970748 / 2.271629 | PASS (no screening margin) |
| grid-screen | TeslaValve | simResolution=160 | own 1440×900 | r1/a1 | 2.207834 / 2.472797 / 2.746291 | FAIL |
| grid-screen | TeslaValve | simResolution=128 | own 1440×900 | r1/a1 | 2.069250 / 2.320209 / 2.547708 | FAIL |
| grid-screen | TeslaValve | simResolution=128, pressureIterations=26 | own 1440×900 | r1/a1 | 1.958043 / 2.227000 / 2.471291 | FAIL |
| grid-screen | TeslaValve | simResolution=128, pressureIterations=24 | own 1440×900 | r1/a1 | 1.890666 / 2.144292 / 2.444961 | FAIL |
| grid-screen | TeslaValve | simResolution=128, pressureIterations=30, dyeResolution=512 | own 1440×900 | r1/a1 | 1.977627 / 2.172665 / 2.425208 | FAIL |
| grid-screen | TeslaValve | simResolution=128, pressureIterations=26, dyeResolution=512 | own 1440×900 | r1/a1 | 1.574544 / 1.896289 / 2.265875 | PASS (no screening margin) |
| grid-screen | TeslaValve | simResolution=128, pressureIterations=24, dyeResolution=512 | own 1440×900 | r1/a1 | 1.772668 / 1.998832 / 2.231372 | PASS (no screening margin) |
| certify | TeslaValve | simResolution=128, pressureIterations=26, dyeResolution=512 | own 1440×900 | r1/a1 | 1.423622 / 1.879877 / 2.280628 | PASS (no screening margin) |
| certify | TeslaValve | simResolution=128, pressureIterations=26, dyeResolution=512 | own 800×500 | r1/a1 | 1.231165 / 1.618707 / 2.042748 | PASS |
| certify | TeslaValve | simResolution=128, pressureIterations=26, dyeResolution=512 | own 1440×900 | r2/a1 | 1.411122 / 1.909086 / 2.355296 | PASS (no screening margin) |
| certify | TeslaValve | simResolution=128, pressureIterations=26, dyeResolution=512 | own 800×500 | r2/a1 | 1.234206 / 1.625502 / 2.338000 | PASS |
| certify | TeslaValve | simResolution=128, pressureIterations=26, dyeResolution=512 | own 1440×900 | r3/a1 | 1.439042 / 1.896793 / 2.457084 | PASS (no screening margin) |
| certify | TeslaValve | simResolution=128, pressureIterations=26, dyeResolution=512 | own 800×500 | r3/a1 | 1.225376 / 1.631419 / 2.068416 | PASS |
| certify | Karman | simResolution=128, pressureIterations=24, dyeResolution=768 | own 1440×900 | r1/a1 | 1.481749 / 1.964292 / 2.255502 | PASS (no screening margin) |
| certify | Karman | simResolution=128, pressureIterations=24, dyeResolution=768 | own 800×500 | r1/a1 | 1.332790 / 1.754832 / 1.946955 | PASS |
| certify | Karman | simResolution=128, pressureIterations=24, dyeResolution=768 | own 480.25×300.5 | r1/a1 | 1.291498 / 1.691749 / 2.101294 | PASS |
| certify | Karman | simResolution=128, pressureIterations=24, dyeResolution=768 | shared 1440×900 | r1/a1 | 1.606586 / 2.038624 / 2.135295 | FAIL |
| certify | Karman | simResolution=128, pressureIterations=24, dyeResolution=768 | own 1440×900 | r2/a1 | 1.464375 / 1.944457 / 2.294249 | PASS (no screening margin) |
| certify | Karman | simResolution=128, pressureIterations=24, dyeResolution=768 | own 800×500 | r2/a1 | 1.324958 / 1.746250 / 1.943832 | PASS |
| certify | Karman | simResolution=128, pressureIterations=24, dyeResolution=768 | own 480.25×300.5 | r2/a1 | 1.289126 / 1.689500 / 1.862042 | PASS |
| certify | Karman | simResolution=128, pressureIterations=24, dyeResolution=768 | shared 1440×900 | r2/a1 | 1.591666 / 2.037455 / 2.145209 | FAIL |
| certify | Karman | simResolution=128, pressureIterations=24, dyeResolution=768 | own 1440×900 | r3/a1 | — / — / — | INCONCLUSIVE |
| certify | Karman | simResolution=128, pressureIterations=24, dyeResolution=768 | own 800×500 | r3/a1 | 1.382749 / 1.783919 / 3.354792 | PASS |
| certify | Karman | simResolution=128, pressureIterations=24, dyeResolution=768 | own 480.25×300.5 | r3/a1 | 1.359875 / 1.732833 / 3.281084 | PASS |
| certify | Karman | simResolution=128, pressureIterations=24, dyeResolution=768 | shared 1440×900 | r3/a1 | 1.594125 / 2.076042 / 3.762540 | FAIL |
| gas-grid-screen | GasFlare | simResolution=128 | shared 1440×900 | r1/a1 | 1.916998 / 2.529583 / 4.187584 | FAIL |
| gas-grid-screen | GasFlare | simResolution=128, pressureIterations=22 | shared 1440×900 | r1/a1 | 1.906793 / 2.494668 / 4.604792 | FAIL |
| gas-grid-screen | GasFlare | simResolution=128, pressureIterations=20 | shared 1440×900 | r1/a1 | 1.870794 / 2.453458 / 4.110542 | FAIL |
| gas-grid-screen | GasFlare | simResolution=128, pressureIterations=24, dyeResolution=512 | shared 1440×900 | r1/a1 | 1.749584 / 2.478122 / 3.977418 | FAIL |
| gas-grid-screen | GasFlare | simResolution=128, pressureIterations=22, dyeResolution=512 | shared 1440×900 | r1/a1 | 1.716667 / 2.397292 / 3.927874 | FAIL |
| gas-grid-screen | GasFlare | simResolution=128, pressureIterations=20, dyeResolution=512 | shared 1440×900 | r1/a1 | 1.683542 / 2.232379 / 3.890004 | FAIL |

### Interpretation and next-milder options

- **Karman:** original sim192/pressure34/dye1024. Pressure30→26→24 p95
  **2.956169→2.802875→2.720498**; successive reductions **0.153294/0.082377ms**.
  Dye768 pressure34→30→26→24 p95 **2.639669/2.491501/2.346957/2.293043**;
  successive reductions **0.148168/0.144544/0.053914ms**. At pressure24, dye cut
  reduces observed p95 **0.427455ms**. sim160 and128 alone are INCONCLUSIVE.
  Deepest grid cut **sim128/pressure24/dye768 p95 1.970748ms**, single-run PASS
  but misses1.85 margin by **0.120748ms**. Next milder **sim128/pressure26/dye768
  2.042252ms FAIL**, observed difference **0.071504ms**. Certification shared r1/r2/r3 **2.038624/2.037455/2.076042 FAIL**; own1440 r3
  alignment40.818459ms INCONCLUSIVE. Overall not certified. Own800 and fractional
  scenes alone certified PASS; complete run table below.
- **TeslaValve:** original sim192/pressure30/dye768. Pressure26→24 p95
  **2.444002→2.266000**, observed reduction **0.178002ms**. Dye512 pressure30→26→24
  **2.458538/2.267709/2.185167**, reductions **0.190829/0.082542ms**. At pressure24,
  dye cut reduces observed p95 **0.080833ms**. sim160→128 alone
  **2.472797→2.320209**, reduction **0.152588ms**. Deepest grid cut
  **sim128/pressure24/dye512 1.998832ms**, single-run PASS by only **0.001168ms**;
  misses screening margin **0.148832ms**. Next milder **sim128/pressure26/dye512
  1.896289ms**, also PASS without screening margin (**0.046289ms** short), actually
  **0.102543ms faster** than pressure24 in these separate screens. Certify the
  milder pressure26 level: own1440 p95 **1.879877/1.909086/1.896793**, own800
  **1.618707/1.625502/1.631419ms**, all six clean PASS. Certified setting
  **sim128/pressure26/dye512**. Its actual next-milder option
  **sim128/pressure30/dye512 2.172665ms FAIL**. Nonmonotonic separate-screen
  variability prevents asserting a causal quality-cost slope.
- **GasFlare:** original sim160/pressure24/dye768. Pressure22/20 alone and
  pressure22/dye512 are attribution-INCONCLUSIVE, not inferred FAIL or PASS.
  Dye512 pressure24 **2.242876**, pressure20 **2.179544ms FAIL**, observed difference
  **0.063332ms**; deepest approved cut misses2ms by **0.179544ms**. Next milder
  pressure22/dye512 has no valid p95 (**34.418834ms** alignment).
  Added sim128: original dye768 pressure24/22/20 p95
  **2.529583/2.494668/2.453458** (reductions0.034915/0.041210ms);
  dye512 pressure24/22/20 **2.478122/2.397292/2.232379ms**
  (reductions0.080830/0.164913ms). All FAIL; no certification eligible.
  Final deepest visual option **sim128/pressure20/dye512 2.232379ms FAIL**,
  next milder **sim128/pressure22/dye512 2.397292ms FAIL**. The original sim160
  deepest screen2.179544ms was faster; no claimed benefit from the grid cut.

These deltas compare one independent screen each, not paired causal estimates.
No further grid, pressure, dye, shader or default edits. Adoption and ADR deferred.

### Attribution and capture paths

All clean rows retain600 aligned clusters/native writes, zero strays, complete
execution coverage; shared clean rows600:600 transfers. INCONCLUSIVE rows retain
600 JS marks but fail alignment or recorder completion. No threshold relaxation.
Karman sim128/pressure30/dye768 hit the **610s attempt deadline in recorder
finalisation** after600 marks; retained unchanged. GasFlare pressure22/20 alignment
**10.463459/11.838209ms**; pressure22/dye512 **34.418834ms**. Karman sim160/128
alignment **32.972916/10.687709ms**. No missing p95 treated as zero.

Paths below are relative to **/tmp/quality-sweep/**. Each JSON records requested
and applied config, checkout SHA, Chrome UA/ANGLE M1 Max adapter, protocol, marks,
commands, interval statistics, transfers, contention, export hashes, trace path.
Files/trace names encode overrides; raw traces/frame arrays remain ephemeral.

| Capture JSON | Slot | GPU PID | Alignment ms | Clusters/writes/strays | Transfers | Foreign overlap% | Gate |
|---|---|---:|---:|---|---|---:|---|
| screen/Karman-pressureIterations30/capture-override-pressureIterations30.json | own 1440×900; r1/a1 | 46912 | 0.388167 | 600/600/0 | 0:0 | 0.000000 | clean |
| screen/Karman-pressureIterations26/capture-override-pressureIterations26.json | own 1440×900; r1/a1 | 47690 | 1.376542 | 600/600/0 | 0:0 | 0.000000 | clean |
| screen/Karman-pressureIterations24/capture-override-pressureIterations24.json | own 1440×900; r1/a1 | 48664 | 0.281334 | 600/600/0 | 0:0 | 0.000000 | clean |
| screen/Karman-pressureIterations34-dyeResolution768/capture-override-dyeResolution768-pressureIterations34.json | own 1440×900; r1/a1 | 63967 | 0.252500 | 600/600/0 | 0:0 | 0.000000 | clean |
| screen/Karman-pressureIterations30-dyeResolution768/capture-override-dyeResolution768-pressureIterations30.json | own 1440×900; r1/a1 | 65644 | 0.205250 | 600/600/0 | 0:0 | 0.000000 | clean |
| screen/Karman-pressureIterations26-dyeResolution768/capture-override-dyeResolution768-pressureIterations26.json | own 1440×900; r1/a1 | 66803 | 0.342500 | 600/600/0 | 0:0 | 0.000000 | clean |
| screen/Karman-pressureIterations24-dyeResolution768/capture-override-dyeResolution768-pressureIterations24.json | own 1440×900; r1/a1 | 74594 | 0.385917 | 600/600/0 | 0:0 | 0.000000 | clean |
| screen/TeslaValve-pressureIterations26/capture-override-pressureIterations26.json | own 1440×900; r1/a1 | 76109 | 0.292792 | 600/600/0 | 0:0 | 0.000000 | clean |
| screen/TeslaValve-pressureIterations24/capture-override-pressureIterations24.json | own 1440×900; r1/a1 | 76938 | 0.258958 | 600/600/0 | 0:0 | 0.001000 | clean |
| screen/TeslaValve-pressureIterations30-dyeResolution512/capture-override-dyeResolution512-pressureIterations30.json | own 1440×900; r1/a1 | 81278 | 0.274917 | 600/600/0 | 0:0 | 0.000000 | clean |
| screen/TeslaValve-pressureIterations26-dyeResolution512/capture-override-dyeResolution512-pressureIterations26.json | own 1440×900; r1/a1 | 82637 | 0.233167 | 600/600/0 | 0:0 | 0.000000 | clean |
| screen/TeslaValve-pressureIterations24-dyeResolution512/capture-override-dyeResolution512-pressureIterations24.json | own 1440×900; r1/a1 | 90631 | 0.297250 | 600/600/0 | 0:0 | 0.000000 | clean |
| screen/GasFlare-pressureIterations22/capture-override-pressureIterations22.json | shared 1440×900; r1/a1 | 92591 | 10.463459 | 0/0/— | 600:600 | 0.000000 | <4ms alignment gate failed |
| screen/GasFlare-pressureIterations20/capture-override-pressureIterations20.json | shared 1440×900; r1/a1 | 93882 | 11.838209 | 0/0/— | 600:600 | 0.000000 | <4ms alignment gate failed |
| screen/GasFlare-pressureIterations24-dyeResolution512/capture-override-dyeResolution512-pressureIterations24.json | shared 1440×900; r1/a1 | 1305 | 0.221584 | 600/600/0 | 600:600 | 0.396000 | clean |
| screen/GasFlare-pressureIterations22-dyeResolution512/capture-override-dyeResolution512-pressureIterations22.json | shared 1440×900; r1/a1 | 8948 | 34.418834 | 0/0/— | 600:600 | 0.000000 | <4ms alignment gate failed |
| screen/GasFlare-pressureIterations20-dyeResolution512/capture-override-dyeResolution512-pressureIterations20.json | shared 1440×900; r1/a1 | 12828 | 0.195750 | 600/600/0 | 600:600 | 1.376000 | clean |
| grid-screen/Karman-simResolution160/capture-override-simResolution160.json | own 1440×900; r1/a1 | 18046 | 32.972916 | 0/0/— | 0:0 | 0.000000 | <4ms alignment gate failed |
| grid-screen/Karman-simResolution128/capture-override-simResolution128.json | own 1440×900; r1/a1 | 19621 | 10.687709 | 0/0/— | 0:0 | 0.000000 | <4ms alignment gate failed |
| grid-screen/Karman-simResolution128-pressureIterations30/capture-override-pressureIterations30-simResolution128.json | own 1440×900; r1/a1 | 22281 | 0.221042 | 600/600/0 | 0:0 | 0.746000 | clean |
| grid-screen/Karman-simResolution128-pressureIterations26/capture-override-pressureIterations26-simResolution128.json | own 1440×900; r1/a1 | 24640 | 0.411667 | 600/600/0 | 0:0 | 0.944000 | clean |
| grid-screen/Karman-simResolution128-pressureIterations24/capture-override-pressureIterations24-simResolution128.json | own 1440×900; r1/a1 | 30774 | 0.340958 | 600/600/0 | 0:0 | 4.040000 | clean |
| grid-screen/Karman-simResolution128-pressureIterations34-dyeResolution768/capture-override-dyeResolution768-pressureIterations34-simResolution128.json | own 1440×900; r1/a1 | 32134 | 0.304459 | 600/600/0 | 0:0 | 2.669000 | clean |
| grid-screen/Karman-simResolution128-pressureIterations30-dyeResolution768/capture-override-dyeResolution768-pressureIterations30-simResolution128.json | own 1440×900; r1/a1 | — | — | 0/0/— | —:— | 0.000000 | Attempt timeout in recorder finalisation |
| grid-screen/Karman-simResolution128-pressureIterations26-dyeResolution768/capture-override-dyeResolution768-pressureIterations26-simResolution128.json | own 1440×900; r1/a1 | 59414 | 0.250208 | 600/600/0 | 0:0 | 2.245000 | clean |
| grid-screen/Karman-simResolution128-pressureIterations24-dyeResolution768/capture-override-dyeResolution768-pressureIterations24-simResolution128.json | own 1440×900; r1/a1 | 69365 | 0.282000 | 600/600/0 | 0:0 | 1.795000 | clean |
| grid-screen/TeslaValve-simResolution160/capture-override-simResolution160.json | own 1440×900; r1/a1 | 72788 | 0.340583 | 600/600/0 | 0:0 | 2.169000 | clean |
| grid-screen/TeslaValve-simResolution128/capture-override-simResolution128.json | own 1440×900; r1/a1 | 75883 | 0.376666 | 600/600/0 | 0:0 | 1.890000 | clean |
| grid-screen/TeslaValve-simResolution128-pressureIterations26/capture-override-pressureIterations26-simResolution128.json | own 1440×900; r1/a1 | 78698 | 0.377750 | 600/600/0 | 0:0 | 1.872000 | clean |
| grid-screen/TeslaValve-simResolution128-pressureIterations24/capture-override-pressureIterations24-simResolution128.json | own 1440×900; r1/a1 | 81664 | 0.269375 | 600/600/0 | 0:0 | 2.028000 | clean |
| grid-screen/TeslaValve-simResolution128-pressureIterations30-dyeResolution512/capture-override-dyeResolution512-pressureIterations30-simResolution128.json | own 1440×900; r1/a1 | 84873 | 0.269083 | 600/600/0 | 0:0 | 1.660000 | clean |
| grid-screen/TeslaValve-simResolution128-pressureIterations26-dyeResolution512/capture-override-dyeResolution512-pressureIterations26-simResolution128.json | own 1440×900; r1/a1 | 4175 | 0.238167 | 600/600/0 | 0:0 | 1.199000 | clean |
| grid-screen/TeslaValve-simResolution128-pressureIterations24-dyeResolution512/capture-override-dyeResolution512-pressureIterations24-simResolution128.json | own 1440×900; r1/a1 | 6856 | 0.349708 | 600/600/0 | 0:0 | 1.755000 | clean |
| certify/TeslaValve-simResolution128-pressureIterations26-dyeResolution512/capture-override-dyeResolution512-pressureIterations26-simResolution128.json | own 1440×900; r1/a1 | 61199 | 0.280167 | 600/600/0 | 0:0 | 0.361000 | clean |
| certify/TeslaValve-simResolution128-pressureIterations26-dyeResolution512/capture-override-dyeResolution512-pressureIterations26-simResolution128.json | own 800×500; r1/a1 | 64042 | 0.339125 | 600/600/0 | 0:0 | 0.276000 | clean |
| certify/TeslaValve-simResolution128-pressureIterations26-dyeResolution512/capture-override-dyeResolution512-pressureIterations26-simResolution128.json | own 1440×900; r2/a1 | 69306 | 0.382125 | 600/600/0 | 0:0 | 0.216000 | clean |
| certify/TeslaValve-simResolution128-pressureIterations26-dyeResolution512/capture-override-dyeResolution512-pressureIterations26-simResolution128.json | own 800×500; r2/a1 | 71948 | 0.231542 | 600/600/0 | 0:0 | 0.573000 | clean |
| certify/TeslaValve-simResolution128-pressureIterations26-dyeResolution512/capture-override-dyeResolution512-pressureIterations26-simResolution128.json | own 1440×900; r3/a1 | 74896 | 0.244541 | 600/600/0 | 0:0 | 0.692000 | clean |
| certify/TeslaValve-simResolution128-pressureIterations26-dyeResolution512/capture-override-dyeResolution512-pressureIterations26-simResolution128.json | own 800×500; r3/a1 | 81468 | 0.311250 | 600/600/0 | 0:0 | 0.171000 | clean |
| certify/Karman-simResolution128-pressureIterations24-dyeResolution768/capture-override-dyeResolution768-pressureIterations24-simResolution128.json | own 1440×900; r1/a1 | 88058 | 0.426542 | 600/600/0 | 0:0 | 0.307000 | clean |
| certify/Karman-simResolution128-pressureIterations24-dyeResolution768/capture-override-dyeResolution768-pressureIterations24-simResolution128.json | own 800×500; r1/a1 | 90254 | 0.333667 | 600/600/0 | 0:0 | 0.284000 | clean |
| certify/Karman-simResolution128-pressureIterations24-dyeResolution768/capture-override-dyeResolution768-pressureIterations24-simResolution128.json | own 480.25×300.5; r1/a1 | 92263 | 0.288125 | 600/600/0 | 0:0 | 0.161000 | clean |
| certify/Karman-simResolution128-pressureIterations24-dyeResolution768/capture-override-dyeResolution768-pressureIterations24-simResolution128.json | shared 1440×900; r1/a1 | 94182 | 0.863542 | 600/600/0 | 600:600 | 0.000000 | clean |
| certify/Karman-simResolution128-pressureIterations24-dyeResolution768/capture-override-dyeResolution768-pressureIterations24-simResolution128.json | own 1440×900; r2/a1 | 95817 | 0.358792 | 600/600/0 | 0:0 | 0.000000 | clean |
| certify/Karman-simResolution128-pressureIterations24-dyeResolution768/capture-override-dyeResolution768-pressureIterations24-simResolution128.json | own 800×500; r2/a1 | 97632 | 0.446083 | 600/600/0 | 0:0 | 0.000000 | clean |
| certify/Karman-simResolution128-pressureIterations24-dyeResolution768/capture-override-dyeResolution768-pressureIterations24-simResolution128.json | own 480.25×300.5; r2/a1 | 99771 | 0.383208 | 600/600/0 | 0:0 | 0.000000 | clean |
| certify/Karman-simResolution128-pressureIterations24-dyeResolution768/capture-override-dyeResolution768-pressureIterations24-simResolution128.json | shared 1440×900; r2/a1 | 1972 | 0.191000 | 600/600/0 | 600:600 | 0.000000 | clean |
| certify/Karman-simResolution128-pressureIterations24-dyeResolution768/capture-override-dyeResolution768-pressureIterations24-simResolution128.json | own 1440×900; r3/a1 | 3588 | 40.818459 | 0/0/— | 0:0 | 0.000000 | <4ms alignment gate failed |
| certify/Karman-simResolution128-pressureIterations24-dyeResolution768/capture-override-dyeResolution768-pressureIterations24-simResolution128.json | own 800×500; r3/a1 | 5323 | 0.308083 | 600/600/0 | 0:0 | 0.000000 | clean |
| certify/Karman-simResolution128-pressureIterations24-dyeResolution768/capture-override-dyeResolution768-pressureIterations24-simResolution128.json | own 480.25×300.5; r3/a1 | 6773 | 0.282834 | 600/600/0 | 0:0 | 0.000000 | clean |
| certify/Karman-simResolution128-pressureIterations24-dyeResolution768/capture-override-dyeResolution768-pressureIterations24-simResolution128.json | shared 1440×900; r3/a1 | 8518 | 1.268541 | 600/600/0 | 600:600 | 0.000000 | clean |
| gas-grid-screen/GasFlare-simResolution128/capture-override-simResolution128.json | shared 1440×900; r1/a1 | 10382 | 0.270875 | 600/600/0 | 600:600 | 0.010000 | clean |
| gas-grid-screen/GasFlare-simResolution128-pressureIterations22/capture-override-pressureIterations22-simResolution128.json | shared 1440×900; r1/a1 | 11991 | 0.217709 | 600/600/0 | 600:600 | 0.177000 | clean |
| gas-grid-screen/GasFlare-simResolution128-pressureIterations20/capture-override-pressureIterations20-simResolution128.json | shared 1440×900; r1/a1 | 13577 | 0.237916 | 600/600/0 | 600:600 | 0.000000 | clean |
| gas-grid-screen/GasFlare-simResolution128-pressureIterations24-dyeResolution512/capture-override-dyeResolution512-pressureIterations24-simResolution128.json | shared 1440×900; r1/a1 | 15214 | 0.157417 | 600/600/0 | 600:600 | 0.000000 | clean |
| gas-grid-screen/GasFlare-simResolution128-pressureIterations22-dyeResolution512/capture-override-dyeResolution512-pressureIterations22-simResolution128.json | shared 1440×900; r1/a1 | 17076 | 0.242917 | 600/600/0 | 600:600 | 0.012000 | clean |
| gas-grid-screen/GasFlare-simResolution128-pressureIterations20-dyeResolution512/capture-override-dyeResolution512-pressureIterations20-simResolution128.json | shared 1440×900; r1/a1 | 18828 | 0.143834 | 600/600/0 | 600:600 | 0.000000 | clean |

### Certification cross-run spreads

All ms; clean attempts only, independently per scene. Never pool or average p95.
**57 total attempts:17 PASS/33 FAIL/7 INCONCLUSIVE,0 CONTENDED,0 retries.**
39 screening attempts,18 certification slots. Screen PASS counts are not certified
scenes. TeslaValve2/2 required scenes PASS; Karman2 PASS/1 FAIL/1 INCOMPLETE;
GasFlare no eligible certification.

| Preset | Scene | Clean slots | Median min–max (range) | p95 min–max (range) | Max min–max (range) | Verdict |
|---|---|---|---|---|---|---|
| TeslaValve | own 1440×900 | 3/3 | 1.411122–1.439042 (0.027920) | 1.879877–1.909086 (0.029209) | 2.280628–2.457084 (0.176456) | PASS |
| TeslaValve | own 800×500 | 3/3 | 1.225376–1.234206 (0.008830) | 1.618707–1.631419 (0.012712) | 2.042748–2.338000 (0.295252) | PASS |
| Karman | own 1440×900 | 2/3 | 1.464375–1.481749 (0.017374) | 1.944457–1.964292 (0.019835) | 2.255502–2.294249 (0.038747) | INCOMPLETE |
| Karman | own 800×500 | 3/3 | 1.324958–1.382749 (0.057791) | 1.746250–1.783919 (0.037669) | 1.943832–3.354792 (1.410960) | PASS |
| Karman | own 480.25×300.5 | 3/3 | 1.289126–1.359875 (0.070749) | 1.689500–1.732833 (0.043333) | 1.862042–3.281084 (1.419042) | PASS |
| Karman | shared 1440×900 | 3/3 | 1.591666–1.606586 (0.014920) | 2.037455–2.076042 (0.038587) | 2.135295–3.762540 (1.627245) | FAIL |

### Synchronized native clips

Index: **`/tmp/quality-sweep/clips/index.html`**. Each preset has baseline,
certified-or-deepest tested level, and next-milder option. Labels explicitly
mark Karman/GasFlare uncertified. TeslaValve is certified for the tested scene
set, not adopted as a default or visually approved. Owner decision pending.

Ordinary installed Chrome, native **1440×900 CSS/DPR2,2880×1800 pixels**, own-tier
visual rendering, seed5, pointer disabled, identical seeded preset initial/flow
inputs, fixed dt1/60, same200-frame warm-up. Every final video has exactly
**600 frames/60fps/10.000000s**. Frame0 is simulation frame201, frame599 is800.
Frame-exact PNG sampling plus local ffmpeg VP9 encoding avoids MediaRecorder's
observed dropped/coalesced frames; the first recordings had582–600 frames and
are overwritten. Recording wall time is slower than real time; playback preserves
simulation time. No GPU timing measured during recording. Lock retained throughout
browser recording and final index playback verification. No production code added.

| Preset | Role | Absolute clip path |
|---|---|---|
| Karman | Before: registry default | `/tmp/quality-sweep/clips/Karman-before.webm` |
| Karman | Deepest tested, NOT certified | `/tmp/quality-sweep/clips/Karman-uncertified-simResolution128-pressureIterations24-dyeResolution768.webm` |
| Karman | Next milder, screen FAIL2.042252ms | `/tmp/quality-sweep/clips/Karman-next-milder-simResolution128-pressureIterations26-dyeResolution768.webm` |
| TeslaValve | Before: registry default | `/tmp/quality-sweep/clips/TeslaValve-before.webm` |
| TeslaValve | Certified tested scene set | `/tmp/quality-sweep/clips/TeslaValve-simResolution128-pressureIterations26-dyeResolution512.webm` |
| TeslaValve | Next milder, screen FAIL2.172665ms | `/tmp/quality-sweep/clips/TeslaValve-next-milder-simResolution128-pressureIterations30-dyeResolution512.webm` |
| GasFlare | Before: registry default | `/tmp/quality-sweep/clips/GasFlare-before.webm` |
| GasFlare | Deepest tested, screen FAIL2.232379ms | `/tmp/quality-sweep/clips/GasFlare-uncertified-simResolution128-pressureIterations20-dyeResolution512.webm` |
| GasFlare | Next milder, screen FAIL2.397292ms | `/tmp/quality-sweep/clips/GasFlare-next-milder-simResolution128-pressureIterations22-dyeResolution512.webm` |

`manifest.json` records config/adapter/native dimensions/frame count/ffprobe.
Index play/pause/restart synchronizes each trio, corrects >50ms drift; ordinary
Chrome playback check verifies9 videos,2880×1800,10s duration, play/pause/restart,
<100ms observed synchronization. Evidence `/tmp/quality-sweep/index-check.json`.
Clips are visual evidence, not calibrated physics or a no-degradation verdict.
PNG sequences deleted after verified600-frame encodes; nine final WebMs retained.

### Final verification and cleanup

`bun run test && bun run check` passed: **52 files/864 tests**, **471 checked
files/0 errors/0 warnings**. `bun run prepack` passed publint/public-neutral
strict consumer checks; existing import.meta.env packaging advisory unchanged.
Harness self-check, `git diff --check` passed. Final logs
`/tmp/quality-sweep/{test-final,check-final,prepack-final}.log`.
Registry/production runtime unchanged; historical benchmark sections unchanged.

GPU lock was acquired by driver PID46866 (`quality-sweep` owner), retained across
all captures/recordings/playback, released only after verifying that same owner.
`/tmp/quality-sweep/cleanup-proof.json`: **1,998 recorded owned PID+command
identities,0 still alive; lock absent**. Ports5198/5199 no listeners.
`profiles-cleanup.json`: **74 exact owned temporary profile paths,all already
absent**. Foreign user Chrome4386/GPU4411 and Chrome-for-Testing48063/GPU48074
still alive, untouched. Original stalled clip cleanup is documented above; exact
SIGTERM then SIGKILL only for verified owned runner9425. All Vite/Chrome/xctrace,
notifyutil, parser, ffmpeg, driver and ownership monitor lifecycles ended.
Ignored node_modules dependency symlink removed, never staged. Worktree retained
because commits are not remotely preserved. Raw traces/logs/clips remain ephemeral
under `/tmp/quality-sweep/`; no report files in Git beyond this requested section.

Skipped: preset adoption/ADR (owner decides); deeper unapproved settings;
GasFlare certification (no clean screen<2ms); retrying alignment/timeouts or clean
FAIL (protocol forbids favorable replacement); release/full-browser suite
(test-only harness, direct hardware captures/clip checks supplied). No installs,
tracker writes, push, merge, foreign signals or unsafe GPU flags.
