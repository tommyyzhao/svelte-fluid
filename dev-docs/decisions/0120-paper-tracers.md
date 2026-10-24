# 0120 — Route-local passive paper dye tracers

**Status:** Experimental — opt-in route visualisation; not a concentration measurement.

## Context

The unlisted Tesla-valve MAC experiment's bounded MacCormack scalar broadens near-grid-width filaments. Nguyen, Abouezzi & Ristroph (2021), Nature Communications 12:2884, Figs. 3–4, motivate a thin streakline visualisation, not a change to the planar flow or a claim to reproduce its missing depthwise physics.

## Decision

Opt in with route-only `MacOptions.dye: 'tracers'`; absent/`'grid'` retains the original path. Three new variants copy their siblings, including forcing, timestep, viscosity, disturbance and preroll. The Eulerian dye continues advancing for concentration/mixing metrics. No changes to `src/lib`.

Store `(x, y, mass, signed species)` in two 512×512 RGBA32F textures: 262,144 slots, 2,048 emitted particles per simulation second, alternating species, deterministic finite-width aperture samples. Mass is incoming normal speed × aperture width / species emission rate. Injection times are distributed within each step. Recycle a deterministic ring after 128 simulation seconds; this can delete recirculating inventory. Outlet crossings retire particles. This bounded visual inventory is explicitly not a concentration measurement.

Advect against the same projected MAC faces using stagger-aware bilinear interpolation and midpoint RK2. Estimate substeps at 0.225 velocity cells of travel; reject travel over 0.45 cells, capped at 32 substeps. Exact mask-cell segment traversal checks midpoint and accepted segment. Rejected wall steps retain mass at the last wet position; near-wall sticking remains a limitation, not slip or fabricated transport.

Clear RGBA16F optical depth every render. Draw instanced quads with a fixed, truncated 3σ Gaussian (σ=0.25 velocity cells); normalise at actual pixel centres. Add absorption coefficients × mass kernel, then composite once with `exp(-depth-carrierDepth)` and the existing plate. A segment check from particle centre to splat pixel prevents kernel transfer across thin solids. No persistent trails, blur, stochastic stirring, connected ribbons or fake folds.

Probe actual RGBA16F additive blending with two quarter-depth draws and readback. Do not request/require `EXT_float_blend`. Unsupported allocation/compilation/blending disposes tracer resources and shows the unchanged Eulerian dye, with a visible fallback caption. Engine disposal explicitly frees all tracer resources. Checkpoints include optional tracer state/clock; default checkpoint representation remains unchanged.

Keep `PaperFlow.svelte`'s existing reduced-motion still-frame lifecycle. No independent animation clock.

## Verification

Hardware Chrome, no unsafe GPU flags, exclusive `/tmp/svelte-fluid-gpu.lock`:

- Default versus explicit grid: faces, pressure, dye and rendered pixels byte-identical. Enabled tracers leave faces/pressure/dye byte-identical too. Seeded no-op `onBeforeProject` regression retained.
- Uniform translation, 100×0.1 steps: carried mass unchanged bitwise; max position error 0.0000763 cells; rendered σ drift 0.0000288 cells. Dense half-float splat integral is 2.65% below carried mass (declared 3.5% tolerance); raster mass drift 0.072%. This error is disclosed, not called concentration conservation.
- Smooth rotation then reversal, 400 steps: max return error 0.0000141 cells (limit 0.002).
- One-mask-texel obstacle: no particle tunnelling, no splat leakage into or beyond the separating wall.
- Extensional stretching: 81.20% support coverage, eight ~0.347-cell gaps; fixed kernel, no gap-hiding blur.
- Beer–Lambert overlap: order-independent transmission within 0.001 half-float tolerance.
- Reduced motion: still at step 3328, unchanged pixels/step after 1 s; Restart repeats identical pixels; no browser page errors.

## Same-flow measurements

Start from preserved developed-flow checkpoints, reset scalar/tracer inventories together, advance both on the **same engine**, capture both presentations without advancing velocity between them. Sample the strongest species lobe at island-centred units 1, 6, 11; five dye-grid columns averaged, interpolated half-height. Values are blue/green FWHM in physical cm. Reverse breakup has several strands: strongest-lobe width is not the whole dyed envelope.

| Flow | Unit | Grid cm | Tracers cm |
| --- | --- | --- | --- |
| Forward Re 200 | 1 | .0413/.0359 | .0266/.0234 |
| Forward Re 200 | 6 | .0775/.0817 | .0225/.0230 |
| Forward Re 200 | 11 | .0922/.1003 | .0230/.0207 |
| Reverse Re 200 | 1 | .0451/.0427 | .0227/.0222 |
| Reverse Re 200 | 6 | .0778/.0823 | .0221/.0224 |
| Reverse Re 200 | 11 | .1095/.0737 | .0228/.0190 |
| Reverse Re 400 | 1 | .0467/.0432 | .0235/.0226 |
| Reverse Re 400 | 6 | .1311/.1556 | .0207/.0195 |
| Reverse Re 400 | 11 | .0703/.1957 | .0212/.0234 |

Photo comparison is provisional: the inlet calibration is .0420 cm (2 px / 36 px mouth × .755622 cm). A hue-opponent profile of registered Fig. 3a yields .0330/.0342, .0459/.0881, .0512/.0409 cm at units 1/6/11; threshold/registration uncertainty is substantial (at least ±1 photo pixel, .0231 cm). Fig. 3b unit 1 gives .0510/.0388 cm; Fig. 4c unit 1 blue .0375 cm, green extraction fails. Reverse downstream mixed/multiple strands have no defensible single-filament photo width. Do not use these proxies as concentration validation or optimise the kernel to them.

Full-frame EXT_disjoint_timer_query_webgl2 median, four solver steps plus render, 3240×378 canvas, 30 retained samples, identical replayed flow/scalar trajectory:

| Flow | Grid GPU ms | Tracer GPU ms | Live particles | Mean/max substeps | Quad-overdraw bound / full target |
| --- | --- | --- | --- | --- | --- |
| Forward Re 200 | 16.49 | 19.21 | 92,314 | 1.84/3 | 1.25 |
| Reverse Re 200 | 16.45 | 17.74 | 103,874 | 1.84/3 | 1.40 |
| Reverse Re 400 | 12.66 | 18.37 | 86,198 | 1.33/2 | 1.16 |

Extra textures: 20,381,800 bytes at width 1080/dyeScale 3 (including 8-byte blend probe; excludes driver overhead). Quad raster bounds: 1.87M / 2.10M / 1.75M fragments respectively, before solid clipping. All 262,144 instances submitted; dead instances are offscreen. Ring did not overwrite in these captures. `uptime` is recorded with every timing; loads were roughly 36–43 (one-minute), 78–84 (five-minute), so no fps acceptance claim. Timer samples are GPU elapsed time, not uncontended throughput guarantees.

Local evidence: `.svelte-kit/paper-tracers/` contains six PNGs, full profiles, particle budgets, GPU distributions, photo-width script/results, analytic test outputs and logs. These ignored artifacts are not repository assets.

### Visible sampling ceiling / regional coverage

Forward Re 200 units 10–11 show a dashed blue appearance; the fixed particle/kernel sampling does not justify a continuous material-sheet claim. At σ=.25, optical support >1e-6 occupies **51.57%** of the grid dye-bearing area (grid blue+green >.05), **13.60%** of wet area. Every axial column still contains blue above 10% of its median column peak: **100% axial coverage**, zero whole-column gaps. Thus the visible intensity modulation is not a whole-column loss of mathematical Gaussian support. Do not misreport the synthetic stretch metric (81.20%) as this regional measurement.

Re 400 mixed region, **left-to-right units 1–7**: salt-and-pepper speckle, unlike dense dark photographic dye. Fixed-kernel support covers **89.02%** of grid-bearing area, **73.51%** of wet area. Blue axial coverage **99.95%**, one gap, maximum **.00926 cm**. Flow-order units 1–7 are a different region: support **75.47%** of grid-bearing area, **36.14%** of wet area; blue axial coverage **99.61%**, six gaps, maximum **.02778 cm**. Area support is not intensity uniformity or physical mixing; speckle remains despite high nonzero-support coverage. No blur or particle-count change used.

## Ceiling / recommendation

Keep opt-in. Tracers remove scalar-remapping broadening but reveal finite sampling in stretched Re 400 flow; no coverage claim there. They do not fix 2D laminar Re 200, patent/photo geometry disagreement, pressure-projection error, or absent 3D folding. Retain grid diagnostics and the honest variant descriptions. Do not make this the default without reviewing sampling gaps, wall sticking, ring deletion and mobile GPU cost.

### Construct-only tracer budgets and single-source constants (2026-10-23)

`MacOptions.tracers` accepts `capacity=262144`, `rate=2048`, `sigma=.25`; `filament` accepts `widthCm=(.755622*2)/36`, `spacingCm=(.755622*11)/36`. These defaults and every existing variant remain unchanged. `TRACERS` is the single TS source for texture width512, travel bounds.45/.225 and32 substeps as well as default budget/kernel values. Update/splat GLSL is generated at program construction from resolved constants, retaining compile-time literal loop bounds. The source mass formula divides by the actual rate, not a duplicated2048. Capacity threads through allocation, ring indices, draw count, checkpoint validation and budget reporting. Sigma remains a uniform; the existing ±4-pixel normalization ceiling requires `0 < sigma*dyeScale <= 4/3`.

Capacity must be an integer multiple of512 in[512,1048576]; rate finite/positive, sigma finite/positive, filament width positive and spacing non-negative. Pure validation precedes allocations. Canonical MAC checkpoint options preserve legacy-default compatibility. Options remain construct-only, route-only; no adaptive sampling, variant change or concentration claim.

Hardware alternate-budget gate (`capacity=131072,rate=1024,sigma=.3`): translation drift.000076294cells (<.001), rendered sigma drift0;400-step rotation/reversal return error.000014030cells (<.002); carried mass31.9999993, splat integral30.9825137, error3.17964% (<3.5%). Zero particle/splat leakage through a one-mask-texel wall. Injection mass equals incoming speed×width×2/actual rate. Tracers enabled at both budgets leave MAC velocity, pressure and grid dye byte-identical; default state hashes also match the frozen pre-options engine. Default-budget translation/reversal/mass/wall regressions remain passing.
