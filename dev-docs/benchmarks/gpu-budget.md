# GPU budget (per-instance frame time)

Measurement of the 1.0 bar "< 2 ms GPU per instance per frame at native DPR".
Harness: `src/lib/engine/__benches__/gpu-budget.browser.test.ts`. Not a gate; it
asserts only that numbers are finite. Decision record: ADR-0089.

## Run

```sh
SVELTE_FLUID_GPU_BENCH=1 VITEST_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  bun run test:browser src/lib/engine/__benches__/gpu-budget.browser.test.ts
# JSON: /tmp/svelte-fluid-gpu-budget.json (override: SVELTE_FLUID_GPU_BENCH_OUT=/path)
# Subset: SVELTE_FLUID_GPU_BENCH_PRESETS='Karman,(default)'
# CSS size: SVELTE_FLUID_GPU_BENCH_CSS=1440x900 (default 800x500)
```

About 1 min at 800x500 and 2 min at 1440x900. It is excluded from the default
browser run unless `SVELTE_FLUID_GPU_BENCH` is set (`vitest.config.ts`). It
needs hardware Chrome.

Same-seed DPR 3 screenshots of every preset, for visual-equivalence review of
display changes:

```sh
SVELTE_FLUID_GPU_BENCH=1 SVELTE_FLUID_SHOTS_DIR=/tmp/dpr/after VITEST_CHROME_PATH=... \
  bun run test:browser src/lib/engine/__benches__/dpr-shots.browser.test.ts
```

## Method

- `FluidEngine` (`autoStart:false`) on a CSS canvas at DPR 1/2/3. The config is
  the preset config plus the same canvas-derived adjustments `Fluid.svelte`
  makes (dye/bloom/sunrays resolution caps, `cssQualityPolicy`). `(default)`
  is an empty config. Pointer input is off and there is no synthetic input.
- **Frame (the budget number).** 200 warm-up frames, then 12 batches of 20
  live-loop frames (`update()`: simulate and render at a fixed 60 Hz dt), each
  batch bracketed by a 1-px `readPixels` of the default framebuffer, which
  drains the queue. Cells are the median per-frame time and the worst batch.
  CPU submit is about 0.02 ms per frame, so the loop is GPU-bound and this is
  an upper bound on GPU time per frame.
- **Passes.** Each of `simulateFrame`, `applyBloom`, `applySunrays`,
  `drawDisplay` and `drawGlass` is replayed alone 60 times back to back with
  the arguments captured during warm-up, with a `gl.flush()` after each
  replay. Without the flush, Apple's tiler culls the overwritten opaque draws
  and display reads 0. Passes overlap a little inside a real frame, so their
  sum can exceed the frame by up to about 0.4 ms.
- **Old timer query.** Per-frame `EXT_disjoint_timer_query_webgl2`, back to
  back. Recorded only to document the artefact below. Do not budget against
  it.

### Why the timer query was wrong ("the gap")

On ANGLE's Metal backend a TIME_ELAPSED query is charged the full GPU span of
every `MTLCommandBuffer` created while it is active. Partial and overlapping
command buffers are counted in full. At large canvases the canvas-sized
render passes change how ANGLE splits command buffers, and the query
over-reads by 2-100×:
a composite-only Venturi frame took 0.08 ms of wall time and read 13.8 ms on
the query. That was the whole "unprofiled gap" (GasFlare: groups summed to
about 2.5 ms of a 6 ms query). Implicit resolves (there is no MSAA), present,
and extra clears or blits were ruled out. Synced throughput, fence-synced
throughput and the sum of the replayed passes all agree. ADR-0089 has the
evidence table.

An earlier fix, from per-frame `gl.finish()` to back-to-back queries, removed
the idle-downclock bias at 800x500 but not this one.

## Result (this machine)

- Adapter: ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max)
- Method: synced throughput. Date: 2026-10-02. Cells are median / worst batch
  in ms.

### Full viewport (1440x900 CSS; DPR 3 = 4320x2700)

| Preset | DPR 1 | DPR 2 | DPR 3 | Passes @ DPR 3 | Old timer query @ DPR 3 |
|---|---|---|---|---|---|
| (default) | 1.45 / 1.47 | 1.46 / 1.48 | 1.50 / 1.50 | solver 0.61, bloom 0.57, sunrays 0.17, display 0.57 | 2.08 |
| LavaLamp | 0.76 / 0.80 | 0.82 / 0.85 | 1.67 / 1.90 | solver 0.61, display 0.37, glass 0.65 | 5.94 |
| Plasma | 1.45 / 1.50 | 1.47 / 1.65 | 1.52 / 1.54 | solver 0.62, bloom 0.57, sunrays 0.16, display 0.48 | 1.91 |
| InkInWater | 1.29 / 1.35 | 1.30 / 1.32 | 1.34 / 1.36 | solver 0.62, bloom 0.57, display 0.45 | 1.85 |
| FrozenSwirl | 1.28 / 1.29 | 1.31 / 1.43 | 1.35 / 1.39 | solver 0.61, bloom 0.57, display 0.58 | 1.91 |
| Aurora | 1.44 / 1.46 | 1.46 / 1.48 | 1.52 / 1.58 | solver 0.61, bloom 0.57, sunrays 0.16, display 0.44 | 1.82 |
| CircularFluid | 1.28 / 1.30 | 1.31 / 1.40 | 1.36 / 1.40 | solver 0.61, bloom 0.57, display 0.49 | 1.89 |
| FrameFluid | 1.29 / 1.33 | 1.32 / 1.35 | 1.40 / 1.45 | solver 0.62, bloom 0.57, display 0.80 | 2.32 |
| AnnularFluid | 1.28 / 1.30 | 1.32 / 1.38 | 1.35 / 1.40 | solver 0.62, bloom 0.57, display 0.64 | 2.00 |
| SvgPathFluid | 1.28 / 1.30 | 1.30 / 1.31 | 1.36 / 1.40 | solver 0.62, bloom 0.57, display 0.54 | 1.97 |
| Toroidal | 1.45 / 1.48 | 1.48 / 1.48 | 1.52 / 1.55 | solver 0.61, bloom 0.58, sunrays 0.15, display 0.65 | 2.38 |
| GasFlare | 1.54 / 1.56 | 1.60 / 1.61 | 1.76 / 1.85 | solver 1.02, bloom 0.42, display 0.93 | 5.71 |
| Venturi | 1.05 / 1.06 | 1.07 / 1.08 | 1.19 / 1.21 | solver 0.96, display 0.79 | 3.98 |
| Karman | 1.60 / 1.65 | 1.64 / 1.66 | 1.66 / 1.68 | solver 1.51, display 0.25 | 2.21 |
| TeslaValve | 1.55 / 1.69 | 1.56 / 1.59 | 1.58 / 1.59 | solver 1.44, display 0.30 | 1.74 |

### Component (800x500 CSS)

| Preset | DPR 1 | DPR 2 | DPR 3 |
|---|---|---|---|
| (default) | 1.45 / 1.49 | 1.45 / 1.48 | 1.47 / 1.49 |
| LavaLamp | 0.76 / 0.78 | 0.77 / 0.82 | 0.79 / 0.81 |
| Plasma | 1.45 / 1.49 | 1.46 / 1.48 | 1.48 / 1.50 |
| InkInWater | 1.29 / 1.30 | 1.30 / 1.31 | 1.30 / 1.32 |
| FrozenSwirl | 1.29 / 1.30 | 1.30 / 1.31 | 1.31 / 1.34 |
| Aurora | 1.45 / 1.50 | 1.47 / 1.52 | 1.46 / 1.48 |
| CircularFluid | 1.28 / 1.30 | 1.30 / 1.31 | 1.31 / 1.32 |
| FrameFluid | 1.29 / 1.33 | 1.30 / 1.32 | 1.33 / 1.36 |
| AnnularFluid | 1.30 / 1.32 | 1.30 / 1.33 | 1.32 / 1.33 |
| SvgPathFluid | 1.29 / 1.31 | 1.30 / 1.31 | 1.30 / 1.32 |
| Toroidal | 1.45 / 1.48 | 1.47 / 1.49 | 1.47 / 1.48 |
| GasFlare | 1.55 / 1.58 | 1.56 / 1.57 | 1.57 / 1.61 |
| Venturi | 1.04 / 1.08 | 1.05 / 1.07 | 1.06 / 1.08 |
| Karman | 1.58 / 1.64 | 1.62 / 1.64 | 1.62 / 1.64 |
| TeslaValve | 1.54 / 1.62 | 1.56 / 1.60 | 1.58 / 1.74 |

Native DPR is now the default, so these numbers are what users pay. The
invalidate-before-overwrite and clear-fold candidate for display and glass
was pixel-identical and within 0.07 ms of baseline on every preset, so it was
not landed (ADR-0089). The default change itself costs nothing on DPR 1 and 2
screens.

## Verdict vs 2 ms

Every preset is under 2 ms median at DPR 1, 2 and 3, at both 800x500 and a
full 1440x900 viewport. The worst median is GasFlare at 1.76 ms (DPR 3,
1440x900). The worst single batch is LavaLamp at 1.90 ms (DPR 3, 1440x900).
The solver is flat across DPR. Canvas-sized work (display, glass) grows about
2.25× from DPR 2 to DPR 3 and peaks at about 1 ms (LavaLamp display plus
glass, GasFlare display).

## `maxPixelRatio` default: native (`null`)

Changed from 2 to `null` because the budget holds at DPR 3 full-viewport for
every preset. Opt back in with `maxPixelRatio={2}`. This is reasonable for
full-bleed backgrounds on low-end integrated GPUs, which will be slower than
this M1 Max.

## Dominant pass

The solver dominates every preset: 0.6 ms for most, 1.0 for Venturi and
GasFlare, 1.4-1.5 for TeslaValve and Karman. The 307x192 solver is bound by
pass count (about 40 µs per pass). Bloom costs a fixed 0.4-0.6 ms when
enabled and sunrays about 0.16 ms. Display costs 0.25-0.9 ms and glass
0.65 ms at 1440x900 DPR 3.

## Caveats

- Karman: `substeps: 2` / `maxTimeStep: 1/120` was retuned to one 1/60 s step
  (77 to 39 passes/frame); `registry.test.ts` guards it.
- One laptop GPU (M1 Max). Lower-end integrated GPUs will be slower.
- `EngineProfiler` group GPU times (`instrument: true`) carry the same ANGLE
  Metal timer-query bias at large canvases.
