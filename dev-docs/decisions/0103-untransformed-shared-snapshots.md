# ADR 0103: Preserve the shared snapshot's sRGB tag

**Status:** Accepted
**Date:** 2026-10-06

## Context

The shared host safely snapshots with `createImageBitmap`; `transferToImageBitmap`
remains excluded by ADR 0088's context-loss crash. ADR 0093 used
`colorSpaceConversion: 'none'`, assuming default conversion caused another pass.
That premise does not hold on installed Chrome **154.0.8037.98**, ANGLE Metal,
Apple M1 Max.

In that exact Chromium tag, `image_bitmap.cc` maps `none` to
`reinterpret_as_srgb`. `StaticBitmapImageTransform::Apply` sets
`needs_strip_color_space` even for an already-sRGB image, preventing its no-op
return and invoking `ApplyWithBlit`. Default options preserve the snapshot's
sRGB, premultiplied-alpha representation. Explicit `premultiplyAlpha: 'none'`
would instead use software readback; it is not a cheaper valid transport.

## Decision

Call `createImageBitmap(surface)` without options. Keep the safe synchronous
snapshot-at-call, asynchronous delivery, sequence invalidation, stale bitmap
closure, reference ownership and loss/recovery paths unchanged. No transfer
skipping, resolution reduction, output shader change or browser detection.

The host creates a default-sRGB, premultiplied WebGL2 context; ADR 0081 output
is sRGB-encoded and premultiplied in every tone map. The bitmap is not a blob
or external image decoded through a monitor profile. The operation preserves
its existing tag rather than inferring a display/OS profile. Hardware tests
compare the visible canvas against the old explicit-`none` snapshot, including
sRGB and display-p3 destination composites, white/dark backgrounds, saturated
colours, transparent edges, and `none`/`neutral`/`agx` with transparent/reveal/
distortion output. A browser regression must fail those tests; the native
performance observation is specific to the Chrome version above, not a
cross-browser speed guarantee.

## Native proof and limits

Seed 5, unchanged `scripts/gpu-capture.mjs`, actual native DPR 2; 200 warm-up,
60 measured fixed-dt frames, three-RAF pacing, complete requested/delivered
transfers, native Metal interval-union attribution and the existing contention
gate. Own/shared captures interleave twice per full-size preset; InkPaper and
two passing interface controls repeat twice. All attempts remain in
`/tmp/opt-shared/{baseline,candidate}/capture.json`; traces are not committed.

Karman shared attempt 1: **41 encoders in 59/60 baseline frames versus 40 in
59/60 candidate frames** (one additional browser-work burst in each capture).
Frame 5 baseline command buffers `0xa59dd436`, `0xa59dd448`, `0xa59dd459`
contain 16+16+7 ANGLE encoders; two separate raster buffers `0xa59dd43b` and
`0xa59dd463` read/write native **2880×1800** IOSurfaces **229→238→254**.
Candidate buffers `0xaeac22a1`, `0xaeac22b3`, `0xaeac22c4` contain 16+16+7,
with one raster buffer `0xaeac22a6`, surfaces **94→637**. The second full-size
copy is gone; the necessary snapshot copy remains. Native labels are generic:
this proves a copy removal, not a per-shader time ranking.

Before/after native median/p95/max and every clean repeat are recorded in
[the benchmark finding](../benchmarks/gpu-budget.md#shared-snapshot-investigation--2026-10-06).
Run variability is substantial, including unchanged own controls. Paired
percentile differences are not isolated snapshot timings. This change does
**not** establish p95 <2 ms for the failing scenes or close ADR 0101's goal.

## Consequences

- One redundant native-size raster copy removed, no changed fluid workload.
- Visible parity, premultiplication, 24 mixed-size snapshots, stale completion,
  isolation, context-loss restore and mount/lazy churn retain hardware coverage.
- Same-seed PNGs and manifests stay in `/tmp/opt-shared/visual/`, not Git.
- No cache, backing-store pool, new lifecycle state or transport fallback added.
