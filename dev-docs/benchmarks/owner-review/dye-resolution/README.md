# Half dye resolution — owner review packet

Owner appearance approval **pending**. Evidence only; no library/default change,
no automatic E2 verdict. ADR 0107 Amendment 1 documents the judge's blur blind
spot: it cannot certify resolution/filtering/post-processing changes.

**Is half dye resolution acceptable as a default, per preset?**

## Comparison

Six TRAIN presets: Plasma, LavaLamp, Aurora, InkInWater, CircularFluid, Karman.
Each JPEG has **left: default dyeResolution 1024**, **right: dyeResolution 512**.
Within each side, columns show **2 / 5 / 10 / 20 seconds** after engine construction.
Top row: complete frames reduced to 400×250. Bottom row: **400×400 native-pixel
(1:1) crops**, identical source coordinates on both sides; white rectangles mark
those coordinates in the whole frames. Open the JPEG at 100% to inspect detail.
Crops are selected from reference gradients only, separately at each wall time.
JPEG quality 90%; these are appearance evidence, not pixel-parity measurements.

Both variants freshly captured from local main **0456ebd**, using existing E2
capture machinery: FluidEngine's normal production RAF, registry defaults plus
Fluid CSS-quality policy, **1440×900 CSS**, **DPR 2**, **2880×1800 backing**, seed
**5**, pointer input inactive, black page background. Only dyeResolution differs.
Same wall-time targets, not lockstep simulation: normal scheduling and chaotic
flow can change arrangements. The after-draw observer copies frames before
compositor clearing and reads curl; this briefly perturbs RAF equally in both
variants. Each timestamp must be within ±250 ms. Actual times, configurations,
renderer, source SHA and crop coordinates are retained in `manifest.json`.
Stills cannot certify motion quality or frame cadence.

Hardware installed headless Google Chrome, ordinary validation; no SwiftShader,
unsafe WebGPU flags, xctrace or energy capture. Renderer recorded in manifest.
No held-out presets or 1024×640 scenes captured.

## Why review this

The **R1, noisy**, TRAIN-only public-config cost ladder in
[`dev-docs/benchmarks/gpu-budget.md`](../../gpu-budget.md), section
“Diagnostic-only public-config ablation ladder”, **eval-branch commit ab59631**,
reported Plasma **1.83→1.22 ms/frame** and Karman **2.43→1.83 ms/frame**:
approximately **0.6 ms/frame saved** by 1024→512 dye resolution. These are
whole-workload observations, not isolated pass timings or significant/additive
stage shares. Null rungs and drift exposed substantial noise. No performance
remeasurement, universal saving, or unchanged-quality claim follows this packet.
The referenced section lives on the eval branch until that evidence is merged.

## Reproduce

```sh
bun install
bun scripts/capture-dye-review.mjs
# Recompose existing owned captures without GPU capture:
bun scripts/capture-dye-review.mjs --compose-only
```

The script imports `withCapture` from `scripts/quality-eval.mjs`, requests only
these six scenes and bypasses judging rather than falsely asserting
`--spatial-safe`. E2 acquires `/tmp/svelte-fluid-gpu.lock` atomically with lane
`dye-review`, owner metadata and acquired-at timestamp; occupied-lock polling
75 seconds, one ≤12-minute lease for both variants, ≥3-minute pause between
leases. Vite uses port
5232 (override `QUALITY_EVAL_PORT`, 5230–5239). It closes its own browsers/server
and releases only its own lock. PNGs/readbacks use the dedicated labels
`/tmp/quality-eval/owner-dye-{1024,512}/`; remove only those directories after
checking the generated packet. Offline JPEG compositing uses installed Chrome's
2D canvas with GPU disabled, no new dependency.

Record acceptance/rejection **per preset** separately. Check softened filaments,
loss of fine vortices, gradients/banding, bloom/glass detail, obstacle wakes and
container-edge dye. Arrangement differences alone do not establish degradation.
