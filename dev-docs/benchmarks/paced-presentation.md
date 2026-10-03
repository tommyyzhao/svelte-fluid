# Individually paced bitmap delivery — 2026-10-02

Measured production SHA: `3788960257b3c7e12c5576f15b829afd080a4502`.
Run from the repository: `bun scripts/paced-presentation.mjs`.
Raw individual samples, probe labels, counts and environment: `/tmp/paced-presentation.json`
(override with `PACED_BENCH_OUT`; output is rewritten after each completed case).

Native installed Chrome 154.0.0.0, headed/foreground, ANGLE Metal Renderer:
Apple M1 Max. No unsafe flags or ANGLE timer queries. Context DPR 1/2/3;
one visible 1440×900 CSS canvas (backing 1440×900, 2880×1800, 4320×2700).
Nine shared-tier resident instances: measured canvas plus eight hidden, paused
320×200 CSS default instances. These are resident-resource evidence, not nine
concurrently animating full-size canvases.

Each case warms 200 busy frames, awaits **all** snapshot jobs and presentation
promises, then drains the shared GL context. Warm-up deliberately delivers one
bitmap and drops 199 stale snapshots. Measurement then runs 60 individually
paced frames: wait RAF outside the span; start clock; perform exactly one
1/60-second simulation/render update; await that frame's `presented()` promise;
synchronously read one GL pixel; stop clock. Every measured frame asserts one
new snapshot request and one actual `transferFromImageBitmap` delivery. Test-only
wrappers count transfers/snapshot completion and label real probe stages. Private
`autoStart`/`deterministicMode` gates allow production `trackSettle`; `startRaf`
is suppressed and `calcDeltaTime` fixed, preventing a competing subscription.
No production config driver is removed, no settle stage is forced.

## Wall completion results

Milliseconds; 60 samples per row. Median is sorted index 30; p95 nearest-rank
index 56; max index 59. Every row: **60 requested, 60 completed, 60 delivered,
zero measured stale jobs**. Total: **840** individually delivered frames.
No row, nor any individual sample, was below 2 ms.

| Preset | DPR | Run | Median | p95 | Max |
| --- | --- | --- | --- | --- | --- |
| Karman | 1 | 1 | 5.30 | 7.80 | 8.20 |
| GasFlare | 1 | 1 | 5.50 | 8.70 | 8.90 |
| LavaLamp | 1 | 1 | 6.10 | 7.40 | 9.20 |
| default | 1 | 1 | 6.60 | 7.80 | 9.20 |
| Karman | 2 | 1 | 6.50 | 9.50 | 22.50 |
| GasFlare | 2 | 1 | 5.60 | 7.50 | 22.00 |
| LavaLamp | 2 | 1 | 5.30 | 7.30 | 20.20 |
| default | 2 | 1 | 5.30 | 7.30 | 20.80 |
| Karman | 3 | 1 | 5.10 | 8.00 | 38.30 |
| Karman | 3 | 2 | 5.60 | 8.40 | 37.20 |
| Karman | 3 | 3 | 6.50 | 8.90 | 37.50 |
| GasFlare | 3 | 1 | 5.90 | 7.60 | 39.80 |
| LavaLamp | 3 | 1 | 5.90 | 8.70 | 40.80 |
| default | 3 | 1 | 6.40 | 7.90 | 39.30 |

Default at each DPR naturally records two snapshots, two of each velocity-1/2,
dye-1/2/3 and readback stage, plus three accepted polls (first poll consumes the
warm-up carryover probe). Individual stage-frame wall envelopes, not isolated
GPU-stage durations:

| Actual default stage | Count per DPR | DPR1 min–max | DPR2 min–max | DPR3 min–max |
| --- | --- | --- | --- | --- |
| accepted poll | 3 | 3.40–6.50 | 3.80–6.10 | 4.80–6.30 |
| snapshot | 2 | 4.00–6.50 | 3.80–6.60 | 4.20–6.30 |
| velocity-1 | 2 | 4.60–6.60 | 3.20–6.10 | 5.90–6.00 |
| velocity-2 | 2 | 3.20–6.80 | 3.50–7.00 | 6.70–6.90 |
| dye-1 | 2 | 3.60–6.40 | 4.80–6.50 | 6.50–6.60 |
| dye-2 | 2 | 3.50–7.00 | 5.00–7.30 | 5.90–7.00 |
| dye-3 | 2 | 4.90–6.60 | 5.00–6.60 | 6.40–7.00 |
| readback | 2 | 3.40–7.00 | 4.90–6.90 | 6.20–7.80 |

Karman, GasFlare and LavaLamp record no settle stages: their production drivers
remain eligible for continuous activity. In particular LavaLamp's FLOW prevents
settling; removing auto-splats alone would not make its production scene eligible.

## Exact scope and blocker

This is a conservative **wall upper bound for the observed originating-context
work and bitmap delivery call**, including CPU submission, asynchronous snapshot
completion, scheduling, actual bitmaprenderer transfer API return and a subsequent
originating shared GL readPixels drain. It is **bitmap delivery, not display
scanout**. The GL read cannot establish completion of downstream compositor GPU
work or asynchronous browser raster/copy work queued by bitmaprenderer transfer.
It therefore does **not** provide a complete upper bound for all browser-copy GPU
cost, certify a strict GPU budget, or establish GPU failure when wall time exceeds
2 ms. Native trace attribution/completion evidence remains an environment/tooling
blocker for that certification. Large wall maxima are not GPU-only measurements.

Discarded exploratory matrices included an initially suppressed deterministic
settle gate and two accidentally overlapping runs. Only the final isolated matrix
above is evidence. Hardware browser and dev server closed after completion;
script has a 28-minute deadline. No production edits, API additions or config changes.

Checks: `bun run test` (53 files, 867 tests); `bun run check` (0 errors/warnings);
`bun run prepack` (publint and public declarations pass; existing package warning
about test `import.meta.env` remains). No full release verification requested.
