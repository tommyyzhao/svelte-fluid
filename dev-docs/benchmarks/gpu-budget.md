# GPU budget (per-instance frame time)

Measurement of the 1.0 bar "< 2 ms GPU per instance per frame at native DPR".
Harness: `src/lib/engine/__benches__/gpu-budget.browser.test.ts`. Not a gate; it
asserts only that numbers are finite.

## Run

```sh
SVELTE_FLUID_GPU_BENCH=1 VITEST_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  bun run test:browser src/lib/engine/__benches__/gpu-budget.browser.test.ts
# JSON: /tmp/svelte-fluid-gpu-budget.json (override: SVELTE_FLUID_GPU_BENCH_OUT=/path)
```

~1 min; excluded from the default browser run unless `SVELTE_FLUID_GPU_BENCH` is set
(`vitest.config.ts`). Needs hardware Chrome: bundled headless Chromium has no
timer-query/GPU.

## Method

- `FluidEngine` (`autoStart:false`), 800x500 CSS canvas at DPR 1/2/3 (physical
  800x500, 1600x1000, 2400x1500). Config = preset config, with the same
  canvas-derived adjustments as `Fluid.svelte` (dye/bloom/sunrays resolution caps,
  `cssQualityPolicy`). `(default)` = empty config.
- One sample = one live-loop frame (`update()`: simulate + render, fixed 60 Hz dt)
  wrapped in an `EXT_disjoint_timer_query_webgl2` TIME_ELAPSED query, `gl.finish()`
  after each. 40 warm-up, 90 measured; disjoint samples dropped. Falls back to
  `gl.finish()` CPU wall time (labelled `cpu-wall`) when the extension is absent.
- Per-pass medians come from the existing `EngineProfiler` groups on a separate
  `instrument: true` engine (its per-group queries cannot nest in the outer one).
- Pointer input and initial splats follow preset config; no synthetic input.

## Result (this machine)

- Adapter: ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max)
- Timing source: gpu (disjoint timer query)
- Date: 2026-10-02, commit ac676b0 + harness. Cells are median / p95 ms.

| Preset | DPR 1 | DPR 2 | DPR 3 | Dominant pass @ DPR 2 (median ms) |
|---|---|---|---|---|
| (default) | 1.74 / 1.82 | 1.82 / 3.43 | 2.05 / 3.21 | solver 0.68 |
| LavaLamp | 1.15 / 1.90 | 1.38 / 3.47 | 1.69 / 1.75 | solver 0.73 |
| Plasma | 1.72 / 3.55 | 2.07 / 4.97 | 2.22 / 2.37 | solver 0.68 |
| InkInWater | 1.29 / 1.74 | 1.46 / 1.87 | 1.46 / 2.20 | solver 0.64 |
| FrozenSwirl | 1.45 / 2.77 | 1.59 / 1.70 | 1.49 / 2.57 | solver 0.68 |
| Aurora | 1.69 / 3.91 | 2.06 / 2.39 | 1.71 / 4.07 | solver 0.69 |
| CircularFluid | 1.44 / 3.44 | 1.59 / 1.66 | 1.57 / 3.29 | solver 0.63 |
| FrameFluid | 1.49 / 1.57 | 1.72 / 2.00 | 1.77 / 3.08 | solver 0.68 |
| AnnularFluid | 1.41 / 1.48 | 1.57 / 3.05 | 1.52 / 2.73 | solver 0.63 |
| SvgPathFluid | 1.40 / 1.45 | 1.53 / 1.57 | 1.59 / 2.70 | solver 0.68 |
| Toroidal | 1.87 / 3.95 | 2.20 / 2.27 | 1.90 / 5.83 | solver 0.66 |
| GasFlare | 1.98 / 2.12 | 2.17 / 2.29 | 1.74 / 4.61 | solver 0.99 |
| Venturi | 1.17 / 2.71 | 1.36 / 1.47 | 1.30 / 4.00 | solver 0.93 |
| Karman | 3.93 / 10.29 | 10.50 / 11.13 | 3.70 / 6.48 | solver 3.55 |
| TeslaValve | 2.33 / 4.50 | 1.93 / 4.09 | 1.80 / 4.12 | solver 1.46 |

## Verdict vs 2 ms

Does every preset fit < 2 ms (median) at DPR 2 and 3? **No.**

- DPR 2 over: Karman 10.5 ms; Toroidal 2.20, GasFlare 2.17, Plasma 2.07, Aurora 2.06
  (marginal). TeslaValve 1.93 and the default 1.82 are at the line.
- DPR 3 over: Karman 3.7 ms; Plasma 2.22, default 2.05 (marginal).
- p95 exceeds 2 ms for most presets at DPR 2 and 3 (spikes of 3-6 ms), so a
  p95-based budget fails widely on this machine.
- Median cost is nearly flat from DPR 1 to DPR 3 (1.2-2.3 ms): dye, bloom and sunrays
  resolutions are capped independent of canvas size, so only display/glass scale
  with pixels. Native DPR is cheap against the fixed solver/bloom cost; the budget
  misses come from the preset workload, not from DPR.

## Dominant pass

Solver dominates in every preset (EngineProfiler groups, median at DPR 2): most
0.6-0.7 ms, Venturi 0.9, GasFlare 1.0, TeslaValve 1.5, Karman 3.6 (5.2 at DPR 3).
Bloom is second at a fixed ~0.57 ms when enabled; sunrays ~0.2 ms (Plasma, Aurora,
Toroidal, default); display 0.07-0.25 ms even at DPR 3; glass 0.14-0.24 ms (LavaLamp).

## Caveats

- Karman is anomalous and noisy. Whole-frame median was 10.5 ms at DPR 2 but 3.7 ms
  at DPR 3 in the same run (8.7 / 10.8 in an earlier run), and the profiler's passes
  sum to only ~3.8 ms. Treat it as "needs investigation" (obstruction-heavy
  solver path, or time outside the profiled groups / GPU power-state effects), not as
  a precise figure.
- Other rows vary by roughly +/-0.2 ms between runs; rows within 0.2 ms of 2 ms are
  not reliably over or under.
- One laptop GPU (M1 Max); lower-end integrated GPUs will be slower.
- No synthetic pointer input beyond preset config.
- \`maxPixelRatio\` default: DPR barely moves the median here, so the budget does not
  gate the cap; presets above fail at DPR 1-2 as well. Decision left to the owner.
