# ADR 0102: reject solver/display candidates that fail parity or native timing

**Status:** Accepted (negative experiment; no runtime optimisation retained)
**Date:** 2026-10-06

## Context

ADR 0101 requires p95 GPU execution <2 ms per instance/frame at native DPR.
Owner-approved candidates: paired viscosity, post-advection dye/scalar outlets,
R16F sunrays mask, capability-gated packed bloom. No iteration, resolution,
preset, idle, pressure-zero, undefined-config or WebGL1 semantics may change.
Baseline `76bdaa2`; unchanged `scripts/gpu-capture.mjs --seed 5` protocol.

Verified baseline sites: viscosity `FluidEngine.ts:4528–4558` / `shaders.ts:1792–1837`;
outlets `4080–4137`, `4682`, `4723` / `1291–1328`; bloom `2459–2482`;
sunrays `5105–5115` / `1143–1189`. These line numbers refer to `76bdaa2`.

## Decision

**Drop every candidate. Final production engine/shaders equal `76bdaa2`.**

| Candidate | Result | Reason |
|---|---|---|
| Pair viscosity, preserve 8/10 iterations and odd remainder | DROP | Isolated odd-grid/solid/final-mask tests passed; seeded Karman early-step local fp16 parity failed, long-run fields diverged. Explicit intermediate fp16 rounding did not rescue it. |
| Fuse first post-advection outlet batch, standalone ordered tail/WebGL1 | DROP | Karman dye and GasFlare scalar/buoyancy 200-step parity failed; 9-outlet local gate failed. Explicit fp16 rounding worsened Karman. |
| Dye-sized R16F sunrays mask, identical filtering/kernel | DROP | Exact own/shared field/display parity passed, but Toroidal median paired p95 regression +0.179127 ms exceeds the frozen +0.10 ms ceiling. |
| R11F_G11F_B10F bloom, unchanged box/Karis/encoded add | DROP | Native saturated-blue/HDR image differences 16/15 LSB exceed the frozen 1-LSB appearance gate. No native performance capture warranted. |

No kept-candidate visual approval or target success claimed. Passing a test or an
individual later capture cannot erase a clean failure. No quality reduction.

## Parity evidence

Ordinary installed Chrome, GPU lock held for every hardware run. Candidate tests
used actual current single/unfused fp16 output, not an ideal float reference.

- Viscosity: own/shared, 1/2/7/8/10 iterations, odd grid, solid substitution,
  clamp-to-edge, final mask. Local bound `0.015625 + 4/1024 * max(abs(a),abs(b))`:
  fp16 has ten fraction bits; four relative ULPs allow accumulated pairs, absolute
  allowance covers cancellation. Ten isolated checks passed. At 200 steps,
  unquantized Karman/Tesla normalized worst errors 458.36/192.56; quantized
  432.71/196.83. Quantized Karman **first step** normalized worst 10.5597,
  max absolute 0.375, relative RMS 0.000662595, energy ratio 1.00018115.
  This fails the early local gate; no statistical/shedding-equivalence acceptance
  claimed. Trial `8dc877e`; no native performance capture after parity rejection.
- Outlets: own/shared, 1/4/9 entries, overlapping edge gates, masks, thickness
  ceiling, ordered standalone later batches. Ten-step bound `step*2/1024` relative
  plus `step*2^-24` absolute: two fp16 ULPs per removed store, subnormal allowance.
  Nine-entry normalized worst 1.011858 (without quantization), 1.113043 (with).
  At 200 steps Karman dye bound `4/1024` relative + `2^-22` absolute exceeded by
  factors 2.5846 / 17.7266. GasFlare velocity diverged after changed scalar feedback;
  exact velocity bound `2^-24` failed. Image bound was 2 LSB; field failures already
  reject these cases, so no passing image claim. Trials `33ced53`, `b24970d`.
- Sunrays: own/shared, odd dye 105×65, display 640×400, identical complete fp16
  ray fields and byte images, **zero tolerance**, 2/2 passed. Dye resize/toggle
  ownership checked. Extra source-size R16F storage is `2*dyeWidth*dyeHeight`:
  full-size 1638×1024 costs **3,354,624 bytes**, not a persistent-memory saving.
  Transactional candidates, dye/aspect/toggle/loss/dispose ownership and a 64 MiB
  extra-mask preflight were trial-only, removed. Trial `8691527`.
- Packed bloom: native DPR2 presentation 2880×1800, saturated blue `{0,0,10}`:
  max **16 LSB**, mean **1.800399**; HDR `{12,3,8}` max **15 LSB**, mean **3.003788**.
  Fixed appearance ceiling 1 LSB, not expanded to hide the five-bit blue mantissa
  (fp16 has ten). Trial `b9aecfb`. A small browser regression test reproduces this
  rejection using test-only packed targets; production stays RGBA16F.

## Native measurement and frozen gate

M1 Max / ordinary headed Chrome / native DPR2, 200 warm-up + 60 fixed-dt paced
frames; Metal interval-union attribution, p95 sorted index56, median index30,
max index59. Same-burst ANGLE/Chrome charged; no per-shader-share or scanout proof.
The unchanged capture script supplies hashes, raw frames, transfers and client
metadata. All original baseline and unpaired sunrays-matrix rows have **0 ms / 0%
foreign execution overlap**; WindowServer397 ~3.72–4.59% busy span is not the
foreign gate. Two baseline unattributed spans 0.060/0.032 ms do not intersect the
instance. Tail variability remains despite zero foreign overlap.

Frozen before alternating data: only sunrays-enabled rows count; at least three
paired alternating baseline/candidate runs per affected row, seed5. Keep only if
one failing row's median paired p95 delta ≤−0.05 ms and no affected row's median
is >+0.10 ms. Controls do not support an optimisation claim.

Three invocations per variant, four sunrays rows plus two controls. Plasma improves
median paired p95 **−0.663540 ms**, but Toroidal regresses **+0.179127 ms**; DROP.
Default has only one valid matched pair, Aurora two because attribution failures
are preserved. Those rows cannot certify improvement. No additional replacements
were taken after the complete three-pair Toroidal result already rejected shipment.
All affected candidate scenes remain FAIL under all-clean-repeats, including the
unpaired matrix. No row is certified by selecting its later PASS.

Full median/p95/max matrix and every paired row appear in the dated
[benchmark section](../benchmarks/gpu-budget.md#solverdisplay-negative-optimisation-lane--2026-10-06).
Raw evidence: `/tmp/opt-solver/before/capture.json`,
`/tmp/opt-solver/sunrays-after/capture.json`,
`/tmp/opt-solver/sunrays-pairs/p{1,2,3}-{baseline,candidate}/capture.json`.

## Consequences

No runtime gain retained; owner GPU goal remains open. Experiments are WIP history,
not commits to ship independently. Integrate only the final net diff (negative
ADR/benchmark plus the runnable packed-format rejection test), not a trial commit.
Kept-candidate visual manifest `/tmp/opt-solver/visual/manifest.json` lists no images
because no candidate survived. No image or trace committed.

## Final checks and cleanup

- `bun run test`: 863/863, 52 files. `bun run check`: zero errors/warnings.
- Ordinary installed Chrome focused final suite: 5/5, display plus test-only
  packed-format rejection. Earlier experimental parity failures are negative
  evidence above, not hidden by this passing final suite.
- `bun run prepack`, capture `--self-check`, `git diff --check`: pass.
  Existing package warning about `import.meta.env` in bench code remains.
- Final runtime diff against `76bdaa2`: empty for `FluidEngine.ts`/`shaders.ts`.
- Every owned browser/context, xctrace/notifyutil and Bun/Vite process closed
  through exact handles/PIDs. Final process inventory has no owned capture,
  test browser, xctrace or Vite process; GPU lock released. User Chrome untouched.
- Worktree/ignored `node_modules` symlink retained (not remotely preserved).
  No installs, tracker writes, `.beads`/`memory` staging, push or merge.
