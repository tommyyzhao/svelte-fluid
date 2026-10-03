# Strict per-frame GPU budget follow-up — 2026-10-02

## Outcome

**Release blocker remains: GPU compliance is UNCERTIFIED.** Native-DPR shared
wall throughput exceeds 2 ms; this does not prove GPU execution alone exceeds
2 ms. The budget goal itself is not met until proved. Independent attribution
is blocked; see [measurement blocker and resume protocol](gpu-measurement-blocker.md).
No total/n or 30-frame cycle average is used to claim compliance.
Staging reduces the settle snapshot frame's workload without changing its exact
issue-time max result. It does not establish robust headroom or current-field
quietness. Production bitmap transport is unchanged.

## Environment and revisions

- macOS 27 / Apple M1 Max, ANGLE Metal; hardware Google Chrome
  **154.0.8037.95**. Ordinary browser validation; no unsafe flags. Exclusive GPU.
- Requested baseline `b278b11`; imported docs-only `2e6721f` before implementation.
- Initial stage/option/mixed matrix: `01fe3ae` (cleanup at `4f82883` was being
  prepared; shader/workload unchanged). Bounded repeat and solver/copy isolation:
  `e825b8f`. Raw files identify the exact run; no unmeasured performance SHA claim.
- Initial matrices: `/tmp/strict-budget-own-01fe3ae.json`,
  `/tmp/strict-budget-shared-01fe3ae.json`.
- Final runtime/test candidate `f15525d`; independent workload measurements above
  predate reviewer fixes that defer fence polling and isolate sibling GL errors.
  No final-SHA performance rerun is claimed; reduction/render workloads unchanged.
- Repeat: `/tmp/strict-budget-own-repeat-e825b8f.json`.
- Shared split: `/tmp/strict-budget-shared-split-e825b8f.json`.
- Stability: `/tmp/strict-budget-bitmap-transfer.json`,
  `/tmp/strict-budget-bitmap-snapshot.json`.

## Method and limits

1440×900 CSS, native DPR 1/2/3; GasFlare, LavaLamp, Karman production configs,
component CSS policy. Instance canvas resides in DOM. Fixed 60 Hz simulation dt.
Warm 200 frames, paired ordinary/stage 20-frame busy throughput batches, 12
repeats, seeded randomized order of presets/stages/pairs. Every submitted
`presented()` job is collected and awaited, then a 1-pixel readback drains GPU
before timing ends. GPU is drained before timing begins. No ANGLE timer queries.
Awaiting jobs does **not** establish delivery of all 20 frames: `gl-host.ts`
stale-sequence snapshots are dropped before `transferFromImageBitmap`. This is
conservative submitted-work batch evidence, not full individually presented-frame
certification.

Each stage is replayed separately on an otherwise ordinary frame: both first
snapshot draws; each individual velocity/dye tail draw; PBO reads/fence/flush.
Tail replay uses previously populated immutable reduced fields. Busy replay
retires only sync/probe bookkeeping between samples, not queued GL commands;
production still permits one probe in flight. `full-chain` is an all-stages
same-frame diagnostic, **not** a faithful baseline timing: split functions add
validation/host entry work and can change submission boundaries. Original
baseline evidence remains in `gpu-budget.md`; do not subtract these numbers as
an exact before/after GPU delta.

Reported wall-time throughput is a conservative upper bound on submitted GPU
work, including CPU submission and surviving bitmap delivery, not a literal
single-frame GPU timer. A value above 2 ms cannot prove GPU-only failure.
Median/worst means median and worst **batch per-frame throughput**, not worst
individual latency.
Thus passing batches cannot prove every individual frame <2 ms. Startup chain/PBO
allocation is excluded from steady-state tables; no startup-spike exemption is
claimed. Strict bar not certified. The later completed-fence poll and `getBufferSubData`
frame is **not isolated by this stage harness**; its CPU/driver cost is additional
unmeasured per-frame work. Reordering polling before advance at the final runtime
SHA avoids same-frame issue+poll but does not establish that omitted frame's
budget. No claim of exhaustive stage coverage.

## Own-tier independent stages

Initial `01fe3ae`, ms **median / worst batch**. Tail column is maximum median and
maximum worst among separately measured individual tail stages (not their sum).

| Preset | DPR | Ordinary | Both snapshots | Tail maximum | Readback issue |
|---|---:|---:|---:|---:|---:|
| GasFlare | 1 | 1.575 / 1.640 | 1.605 / 1.700 | 1.645 / 1.900 | 1.565 / **2.635** |
| GasFlare | 2 | 1.625 / 1.855 | 1.630 / 1.675 | 1.765 / 1.945 | 1.570 / 1.585 |
| GasFlare | 3 | 1.670 / 1.690 | 1.700 / 1.745 | 1.715 / 1.850 | 1.635 / 1.730 |
| LavaLamp | 1 | 0.755 / 0.790 | 0.835 / 0.875 | 0.800 / 0.855 | 0.765 / 0.820 |
| LavaLamp | 2 | 1.070 / 1.115 | 1.055 / 1.100 | 1.040 / 1.120 | 1.080 / 1.130 |
| LavaLamp | 3 | 1.820 / 1.935 | 1.910 / 1.975 | 1.885 / 1.950 | 1.835 / 1.945 |
| Karman | 1 | 1.550 / 1.565 | 1.630 / 1.665 | 1.675 / 1.945 | 1.595 / 1.620 |
| Karman | 2 | 1.660 / 1.700 | 1.745 / 1.810 | 1.705 / 1.830 | 1.665 / 1.705 |
| Karman | 3 | 1.640 / 1.665 | 1.765 / 1.810 | 1.730 / 1.805 | 1.690 / 1.720 |

Snapshot paired median overhead 0.040–0.100 ms, rather than the prior complete
probe's roughly 0.3 ms. Tail/readback independently fit typical throughput;
one isolated GasFlare DPR1 readback batch exceeded 2 ms. LavaLamp DPR3 has almost
no initial worst-batch headroom. Negative overheads elsewhere are drift/noise,
not claimed optimizations.

Bounded second run `e825b8f`, same 12-repeat protocol; no iterative tuning:

| Preset | DPR | Ordinary | Both snapshots | Readback issue |
|---|---:|---:|---:|---:|
| GasFlare | 1 | 1.560 / 1.605 | 1.585 / 1.600 | 1.540 / 1.555 |
| GasFlare | 2 | 1.535 / 1.540 | 1.625 / 1.635 | 1.555 / 1.575 |
| GasFlare | 3 | 1.610 / 1.625 | 1.680 / 1.705 | 1.620 / 1.630 |
| LavaLamp | 1 | 0.745 / 0.755 | 0.800 / 0.820 | 0.760 / 0.765 |
| LavaLamp | 2 | 0.920 / 0.930 | 0.990 / 1.025 | 0.910 / 0.940 |
| LavaLamp | 3 | 1.760 / 1.840 | 1.810 / 1.900 | 1.730 / 1.835 |
| Karman | 1 | 1.565 / 1.570 | 1.635 / 1.655 | 1.590 / 1.600 |
| Karman | 2 | 1.585 / 1.600 | 1.655 / 1.690 | 1.610 / 1.650 |
| Karman | 3 | 1.635 / 1.645 | 1.700 / 1.720 | 1.645 / 1.660 |

GasFlare DPR1 outlier was not reproduced; retain it as negative evidence, not
silently discard it. Second-run snapshot paired overhead 0.055–0.110 ms.

## Shared tier — wall throughput above 2 ms; GPU UNCERTIFIED

Initial matrix, ms median / worst batch; all bitmap jobs awaited and final GPU
drain included. These are submitted single-instance batch workloads, not proof
of all 20 individual bitmap deliveries or GPU-only execution time.

| Preset | DPR | Ordinary | Both snapshots | Readback issue |
|---|---:|---:|---:|---:|
| GasFlare | 1 | 2.065 / 2.180 | 2.155 / 2.245 | 2.185 / 2.260 |
| GasFlare | 2 | 2.345 / 2.380 | 2.485 / 2.560 | 2.450 / 2.530 |
| GasFlare | 3 | 3.225 / 3.280 | 3.225 / 3.280 | 3.190 / 3.270 |
| LavaLamp | 1 | 1.330 / 1.530 | 1.410 / 1.505 | 1.460 / 1.500 |
| LavaLamp | 2 | 1.840 / 1.890 | 1.865 / 2.045 | 1.955 / 2.090 |
| LavaLamp | 3 | 3.010 / 3.120 | 2.970 / 3.040 | 3.020 / 3.320 |
| Karman | 1 | 2.090 / 2.125 | 2.190 / 2.240 | 2.200 / 2.230 |
| Karman | 2 | 2.480 / 2.675 | 2.560 / 2.725 | 2.625 / 2.840 |
| Karman | 3 | 3.000 / 3.025 | 3.080 / 3.250 | 3.115 / 3.300 |

Mixed 9/16/24 instances remain resident on the shared host. Sizes cycle
320×200, 800×500, 1440×900 CSS; presets cycle GasFlare/LavaLamp/Karman. DPR1/2/3
respectively gives largest native canvases 1440×900 / 2880×1800 / 4320×2700.
Six randomized repeats of ten **individual instance** frames, not page total/n.
This measures resident-instance cost, not compositor frame scheduling fairness.
The initial mixed run incorrectly limited dye/post field resolutions against CSS
rather than native size on small DPR2/3 instances; the largest 1440×900 instances
and all viewport matrices are unaffected. Thus the maxima below remain real
large-instance wall-throughput exceedances, not GPU-only failure evidence;
this is **not** a certified production-config
small-instance matrix. Harness corrected afterward; no corrected mixed rerun
claimed. Do not infer small-instance budget compliance from those rows.

| Instances | DPR | Largest per-instance median | Worst individual-instance batch |
|---:|---:|---:|---:|
| 9 | 1 | 2.190 | 2.210 |
| 9 | 2 | 2.510 | 2.540 |
| 9 | 3 | 2.930 | 2.960 |
| 16 | 1 | 2.170 | 2.220 |
| 16 | 2 | 2.500 | 2.540 |
| 16 | 3 | 2.940 | 2.990 |
| 24 | 1 | 2.190 | 2.310 |
| 24 | 2 | 2.490 | 2.620 |
| 24 | 3 | 2.960 | 2.990 |

## Shared solver/copy split — bounded diagnostic

`e825b8f`, paired randomized ordinary frames versus test-only omission of
`present()` or `simulateFrame()`. Ms median / worst; **not** an approved output
change. Marginal deltas are indicative, not additive GPU pass timers: clocks,
CPU delivery and driver overlap can change when work is removed.

| Preset | DPR | Ordinary | No bitmap present | No solver | Paired copy delta | Paired solver delta |
|---|---:|---:|---:|---:|---:|---:|
| GasFlare | 1 | 2.035 / 2.065 | 1.585 / 1.620 | 0.970 / 1.065 | 0.445 | 1.065 |
| GasFlare | 2 | 2.445 / 2.495 | 1.605 / 1.650 | 1.400 / 1.515 | 0.835 | 1.025 |
| GasFlare | 3 | 3.175 / 3.265 | 1.760 / 1.805 | 2.205 / 2.240 | 1.360 | 0.995 |
| LavaLamp | 1 | 1.315 / 1.460 | 0.770 / 0.785 | 0.600 / 0.705 | 0.510 | 0.715 |
| LavaLamp | 2 | 1.830 / 1.895 | 0.855 / 0.860 | 1.150 / 1.205 | 1.005 | 0.645 |
| LavaLamp | 3 | 2.640 / 3.050 | 1.820 / 1.905 | 2.360 / 2.370 | 1.015 | 0.595 |
| Karman | 1 | 2.100 / 2.160 | 1.620 / 1.680 | 0.515 / 0.670 | 0.470 | 1.560 |
| Karman | 2 | 2.305 / 2.365 | 1.645 / 1.665 | 0.930 / 1.015 | 0.695 | 1.355 |
| Karman | 3 | 2.925 / 3.085 | 1.760 / 1.805 | 1.940 / 2.075 | 1.055 | 0.990 |

Native sizes 1440×900 / 2880×1800 / 4320×2700. Removing bitmap presentation
puts these wall-throughput workloads below 2 ms; the paired transport wall-time
delta is roughly 0.445–1.360 ms depending on native size/preset, not GPU
attribution. Karman solver remains a material part of cost. No unsafe transfer,
downsampling or lowered solver quality is justified by this diagnostic.
Future same-output transport work must solve stability as well as actual cost.

## Bounded premultiply A/B — negative

Test-only interception of `createImageBitmap` adds
`premultiplyAlpha: 'premultiply'` against production's default, retaining
`colorSpaceConversion: 'none'`. Transparent, circular glass, reveal output
251×157 RGBA parity: **zero differing channels, max difference 0**. Native
canvas pixels compared after bitmap delivery, not screenshots hiding alpha.

Same matrix's paired randomized 12-repeat ordinary frames, median / worst:

| Preset | DPR | Default | Explicit premultiply |
|---|---:|---:|---:|
| GasFlare | 1 | 1.985 / 2.020 | 1.995 / 2.040 |
| GasFlare | 2 | 2.400 / 2.510 | 2.395 / 2.545 |
| GasFlare | 3 | 3.140 / 3.165 | 3.145 / 3.200 |
| LavaLamp | 1 | 1.385 / 1.480 | 1.380 / 1.475 |
| LavaLamp | 2 | 1.835 / 1.945 | 1.865 / 1.920 |
| LavaLamp | 3 | 2.995 / 3.080 | 3.020 / 3.115 |
| Karman | 1 | 2.180 / 2.250 | 2.170 / 2.355 |
| Karman | 2 | 2.385 / 2.480 | 2.375 / 2.435 |
| Karman | 3 | 2.975 / 3.050 | 2.985 / 3.100 |

Median deltas −0.010..+0.030 ms: no consistent performance win, no new headroom.
No production choice shipped; ADR0093 unchanged. No claim that other untested
transport strategies are impossible.

## Transfer stability — unsafe path rejected again

Standalone `scripts/bitmap-loss-diagnostic.mjs` drives existing ADR0088 artifact.
Fresh browser process per isolated run, bitmap still displayed during forced
loss/restore, explicit release, three mount-churn rounds; mixed24 follow-up only
if initial run survives. Ordinary hardware Chrome, no unsafe flags.

`transferToImageBitmap()` **crashed renderer on run 1**. Stopped immediately as
required; did **not** continue to 30 or attempt mixed24 transfer. Previous ADR0088
2/10 crashes are reconfirmed, not overridden by hypothetical throughput wins.
Production safe snapshot path retained unchanged.

`createImageBitmap()` safe control: **30/30 isolated runs passed**, each including
three single-target and three mixed24 churn rounds, loss/restore while bitmaps
remain displayed, release/remount. Zero renderer crashes/page errors. Initial
churn harness tried restoring in the loss event's same task and timed out with
`INVALID_OPERATION: restoreContext: context restoration not allowed`; corrected
by a task yield before restore, then all 30 passed. This was diagnostic scheduling
error, not suppressed production evidence. Stability is environment evidence,
not a universal browser guarantee.

## Snapshot correctness and lifecycle

- Unchanged 8×8 max shader, all source texels retained; no statistical sampling.
- Both velocity/dye first-level fields frozen same epoch, no changing ping-pong
  source kept. Later reductions read only immutable chain fields.
- Hardware own/shared odd-size test compares accepted staged maxima against full
  **issue-time** reads while advancing fields between stages. Half-float precision
  bound retained. Every later stage asserts ≤1 draw.
- Splat/config/resize/pause/loss/dispose cancel before and after fencing; failure
  paths for allocation, readPixels, sync polling, buffer read fail closed, unbind
  PBO, never fabricate quietness. WebGL1/missing float support never settles.
- Existing three quiet checks / 30-frame starts retained. Usual three velocity
  levels and four dye levels add five tail-draw frames plus one readback-issue
  frame before polling (~100 ms at 60 Hz). Staged delayed snapshot is **not** a
  mathematical proof about current fields. ADR0099 explains the latency contract.
- Visible solver/render output unchanged; GPU maxima parity is the appropriate
  before/after check. No production visible-render change requiring screenshot
  substitution for numerical parity.

## Final verification

`f15525d` runtime/test candidate: `bun run test && bun run check`, then hardware
`VITEST_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
bun run verify:release` passed: **867 Node tests, 268 browser tests, zero check
errors/warnings, production build, package/publint and strict public declarations**.
The later `19e8b35` change only corrects the opt-in benchmark's native field-size
limit and evidence caveat; Node/check/prepack passed again. No production runtime
change after the full hardware verification. Read-only review found no remaining
concrete runtime defect after polling-order/error-attribution fixes.

No push, merge, publish, preset tuning, DPR cap, selector or dependency change.
The strict 2 ms GPU bar is **still blocked**, independently of passing tests.
