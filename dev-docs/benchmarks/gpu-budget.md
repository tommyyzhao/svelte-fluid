# GPU budget (per-instance frame time)

Measurement of the 1.0 bar "< 2 ms GPU per instance per frame at native DPR".
Harness: `src/lib/engine/__benches__/gpu-budget.browser.test.ts`. Not a gate; it
asserts only that numbers are finite.

## Run

```sh
SVELTE_FLUID_GPU_BENCH=1 VITEST_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  bun run test:browser src/lib/engine/__benches__/gpu-budget.browser.test.ts
# JSON: /tmp/svelte-fluid-gpu-budget.json (override: SVELTE_FLUID_GPU_BENCH_OUT=/path)
# Subset: SVELTE_FLUID_GPU_BENCH_PRESETS='Karman,(default)'
# CSS size: SVELTE_FLUID_GPU_BENCH_CSS=1440x900 (default 800x500)
```

~1 min (800x500), ~3 min (1440x900); excluded from the default browser run unless `SVELTE_FLUID_GPU_BENCH` is set
(`vitest.config.ts`). Needs hardware Chrome: bundled headless Chromium has no
timer-query/GPU.

## Method

- `FluidEngine` (`autoStart:false`), 800x500 CSS canvas at DPR 1/2/3 (physical
  800x500, 1600x1000, 2400x1500). Config = preset config, with the same
  canvas-derived adjustments as `Fluid.svelte` (dye/bloom/sunrays resolution caps,
  `cssQualityPolicy`). `(default)` = empty config.
- One sample = one live-loop frame (`update()`: simulate + render, fixed 60 Hz dt)
  wrapped in an `EXT_disjoint_timer_query_webgl2` TIME_ELAPSED query.
- **Steady (the budget number).** 200 fed warm-up frames, then 120 frames issued
  back to back, one query each, with no `gl.finish()` between them; results are
  read asynchronously after the batch and the batch is dropped if the disjoint flag
  is set. This is what a live page at 60 Hz costs. Fallback without the extension:
  batch CPU wall time / frames (`cpu-wall`).
- **Cold (reported, not budgeted).** 15 isolated frames, each after an idle gap and
  followed by `gl.finish()`: what a sparse or dirty-while-paused frame costs on a
  GPU that has dropped clocks.
- Per-pass medians come from the existing `EngineProfiler` groups on a separate
  `instrument: true` engine (its per-group queries cannot nest in the outer one).
- Pointer input and initial splats follow preset config; no synthetic input.

### Why the old method was wrong

Before 2026-10-02 every sample was one frame followed by `gl.finish()`, with a
40-frame warm-up that also finished each frame. The GPU idled between samples,
dropped clocks, and the longer the frame the more of it ran slow. Medians read
0.2-0.6 ms high and p95 3-11 ms; the same Karman config read 2.7 ms in one run
and 10.5 ms in another. Steady medians now agree within 0.16 ms across two full
runs, and p95 sits within ~0.5 ms of the median.

## Result (this machine)

- Adapter: ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max)
- Timing source: gpu (disjoint timer query), steady method
- Date: 2026-10-02, commit afd0336 + harness fix. Cells are median / p95 ms.
  Second full run: every median within 0.16 ms.

| Preset | DPR 1 | DPR 2 | DPR 3 | Cold median @ DPR 2 | Solver @ DPR 2 |
|---|---|---|---|---|---|
| (default) | 1.45 / 1.74 | 1.46 / 1.76 | 1.53 / 1.82 | 1.68 | 0.69 |
| LavaLamp | 0.74 / 1.03 | 0.78 / 1.06 | 0.92 / 1.19 | 0.92 | 0.66 |
| Plasma | 1.40 / 1.74 | 1.59 / 2.00 | 1.62 / 1.93 | 1.67 | 0.70 |
| InkInWater | 1.18 / 1.48 | 1.31 / 1.59 | 1.34 / 1.60 | 1.32 | 0.67 |
| FrozenSwirl | 1.27 / 1.55 | 1.34 / 1.61 | 1.40 / 1.69 | 1.48 | 0.62 |
| Aurora | 1.45 / 1.72 | 1.55 / 1.83 | 1.53 / 1.81 | 1.62 | 0.70 |
| CircularFluid | 1.29 / 1.55 | 1.27 / 1.60 | 1.43 / 1.77 | 1.40 | 0.62 |
| FrameFluid | 1.28 / 1.63 | 1.31 / 1.59 | 1.45 / 1.84 | 1.53 | 0.65 |
| AnnularFluid | 1.20 / 1.54 | 1.30 / 1.62 | 1.41 / 1.68 | 1.34 | 0.68 |
| SvgPathFluid | 1.27 / 1.50 | 1.34 / 1.60 | 1.39 / 1.69 | 1.36 | 0.68 |
| Toroidal | 1.33 / 1.65 | 1.57 / 1.89 | 1.56 / 2.13 | 1.70 | 0.70 |
| GasFlare | 1.40 / 1.71 | 1.49 / 1.94 | 1.67 / 2.20 | 1.48 | 1.01 |
| Venturi | 0.95 / 1.23 | 1.07 / 1.39 | 1.15 / 1.43 | 1.13 | 0.95 |
| Karman | 1.55 / 1.95 | 1.64 / 2.00 | 1.67 / 2.07 | 2.01 | 1.63 |
| TeslaValve | 1.47 / 1.98 | 1.51 / 1.92 | 1.55 / 2.00 | 2.02 | 1.48 |

### Full viewport (1440x900 CSS, `SVELTE_FLUID_GPU_BENCH_CSS=1440x900`)

DPR 1 and 2 stay under 2 ms median for every preset (worst GasFlare 1.75-1.79,
Karman 1.69-1.75). DPR 3 (4320x2700, 11.7 Mpx) does not; two runs:

| Preset @ DPR 3 | Median / p95 | Main growth |
|---|---|---|
| LavaLamp | 4.48-6.34 / 5.5-9.5 | glass + display 1.9 ms each, solver 2.2 |
| GasFlare | 5.77-6.64 / 7.8-8.6 | display 0.6, solver 1.4 |
| FrameFluid | 2.12-3.72 / 3.0-5.1 | display 0.5 |
| Venturi | 1.97-4.36 / 3.4-5.1 | display 0.5 |
| Toroidal | 2.05-2.38 / 2.5-3.6 | display 0.5 |
| Karman | 2.12-2.36 / 3.6-4.9 | display 0.3 |

The solver stays flat; the growth is canvas-sized work (display, glass,
swap-chain resolve). It is superlinear in pixels at this size and the profiler
groups account for only part of the whole-frame number (e.g. GasFlare groups sum
~2.5 ms against a 6 ms frame), so run-to-run spread is large. Unattributed
canvas-size cost is the next thing to investigate before native DPR.

## Verdict vs 2 ms

At the reference 800x500 canvas, **every preset is under 2 ms median at DPR 1, 2
and 3** (worst: GasFlare 1.67 at DPR 3, Karman 1.67, Plasma/Toroidal 1.62). The
earlier "just over budget" readings (Toroidal, GasFlare, Plasma, Aurora at
2.06-2.20) were the idle-downclock artifact, so no solver change was made:
red-black/SOR pressure and pass fusion are not needed for the bar and would
need their own ADR and residual-equivalence evidence. p95 touches 2.0-2.2 for
the obstacle presets at DPR 2-3.

Cold isolated frames cost 0.1-0.4 ms more than steady (Karman/TeslaValve ~2.0).
This matters only for sparse frames, which the budget does not govern.

## Dominant pass

Solver dominates in every preset (EngineProfiler groups, median at DPR 2): most
0.6-0.7 ms, Venturi 0.95, GasFlare 1.0, TeslaValve 1.5, Karman 1.6. The 307x192
solver is pass-count bound (~40 us/pass). Bloom is second at a fixed ~0.57 ms
when enabled; sunrays ~0.2 ms (Plasma, Aurora, Toroidal, default); display
0.07-0.25 ms at 800x500 DPR 3, 0.3-0.6 ms at 1440x900 DPR 3; glass 0.14-0.24 ms
at 800x500 (LavaLamp), 1.9 ms at 1440x900 DPR 3.

## `maxPixelRatio` default: stays 2

Native DPR is cheap at component sizes (800x500 DPR 3 is under budget for every
preset), but a full-viewport background on a DPR 3 display costs 2-6.6 ms on this
M1 Max. Lower-end integrated GPUs will be slower. The fixed solver/bloom cost does
not scale with DPR; the display/glass cost does, and at 11.7 Mpx it dominates. A
default of `null` would push the most common full-bleed use over budget on phones
and DPR-3 laptops, so the default stays 2. Opt in to native DPR with
`maxPixelRatio={null}` on component-sized canvases. Revisit when the display and
glass passes render at a capped resolution and upscale.

## Caveats

- Karman: `substeps: 2` / `maxTimeStep: 1/120` was retuned to one 1/60 s step
  (77 to 39 passes/frame); `registry.test.ts` guards it. Outlet `clearDye` is
  squared, `wallFriction` 0.16 to 1-(0.84)^2, pressure gradient 64 to 40 to keep
  the ~140 inlet speed. Same-seed screenshots at 8 s / 16 s kept the shed vortices.
- One laptop GPU (M1 Max); lower-end integrated GPUs will be slower.
- No synthetic pointer input beyond preset config.
