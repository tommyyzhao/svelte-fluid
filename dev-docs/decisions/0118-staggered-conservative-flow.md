# ADR 0118: Conservative staggered-flow preflight

**Status:** Experimental — not adopted
**Date:** 2026-10-21

## Context

ADR 0115 rejected multigrid and measured an incompatible pure-Neumann pressure RHS in the collocated valve. More Jacobi iterations cannot repair the mismatch between that divergence, pressure stencil and gradient. Existing scenes, including `flame-jet`, likely share this conservation defect. This experiment does not change those scenes.

The Nguyen, Abouezzi & Ristroph (2021), Nature Communications 12:2884 dye experiment requires measured mass conservation before Reynolds numbers, diodicity or mixing can be calibrated. This remains a two-dimensional Navier–Stokes model, not a three-dimensional reproduction.

## Decision

First measure an internal, opt-in hardware preflight before exposing a public `flow.grid` option. Stop at the first failed acceptance gate; do not replace Jacobi without the owner's decision. Existing engine paths and Tesla variants remain unchanged during preflight.

Velocity components occupy their own MAC faces. R stores the right face and G the top face of each cell. An extra column stores left canvas faces; an extra row stores bottom canvas faces. Binary open faces connect two fluid cells, or a fluid cell to a declared open canvas edge. Every solid face is exactly zero. Compact face divergence and pressure gradient compose the identical five-point Laplacian. Pressure is R32F, warm-started. Paired Jacobi evaluates two identical sweeps without an intermediate store.

Open pressure is zero at the physical canvas face. The exterior cell-centre ghost is therefore `p_ghost = -p_interior`; the half-cell gradient carries a factor of two. This is face Dirichlet pressure, not Neumann extrapolation. Body force with equal end pressure is the fixed-pressure-drop equivalent.

The test-only Float64 conjugate-gradient reference uses the same discrete faces, RHS and diagonal. It must reach relative residual 1e-10; it is not an engine solver or fallback. Fixed-RHS pressure convergence, geometry shortest-path length, asymptotic Jacobi factor, exact face-flux telescoping, and a physical-step warm start distinguish projection algebra from long-channel convergence.

## Evidence

Hardware: Chrome 155, ANGLE Metal, Apple M1 Max. Real SVG valve, N384 = 1152×384, existing 2048-wide shape mask, dt=1/120, viscosity=.005, drive=120 cells/s² (the previous force160 convention scales by384/512). The implicit stencil is `(I - alpha Δ)u = rhs`; `alpha=viscosityAlpha(viscosity,dt,W,H)`, so ν=alpha/dt=.005×1152×384/128=17.28 cells²/s. Pressure texture stores the per-step projection impulse **q=dt·p/ρ**, units cells²/s, not physical pressure. The force-potential impulse scale is f·dt·L=1152.

CPU algebra tests establish symmetry, positive energy, `D G = -A`, exact wall-face zeros and slab telescoping. Hardware operator tests compare CPU/GPU divergence, paired/single Jacobi and CG-seeded projection. Every measured real-valve slab satisfied `Q(right)-Q(left)=Σ D u` exactly in Float64 reductions of the same Float32 face data (reported error 0). Thus differing fluxes are accumulated residual divergence, not an interpolated-flux measurement bug.

### Cold/warm fixed RHS, not accepted steady flow

BFS shortest inlet-to-outlet fluid-cell path is1152 cells: the straight corridor is connected; it is not the much longer recess zigzag. The original estimate `rho=1-π²/(2N_path²)` is .9999962815. Test-only inverse iteration of homogeneous A measured λ1=5.030653165e-6 versus `(π/N_path)²=7.436948725e-6`; six outer steps, Rayleigh relative change1.53e-9,35140 total CG iterations, relative eigen-residual1.61e-5. Fixed warm-RHS pressure-error contraction measured rho≈.99999838 per Jacobi sweep at640–2560 sweeps. The inverse iteration and rank-one correction remain diagnostic-only.

Initial CG bootstrap took3515 iterations, true relative residual9.88e-11. Nevertheless,320-sweep Navier–Stokes evolution rang badly: flux spread11.82% at1s;87.54% at2s; sign reversals;176.59% at10s. A following exact-RHS CG solve took6126 iterations including true-residual refinement, residual3.28e-12. Max|q|321284 is about279 times the force-potential impulse scale. The GPU pressure maximum relative error after20 sweeps seeded from CG was7.46e-7; face-flux spread2.44e-5. Absolute float cancellation on this runaway field still left max|D u|/U=.003154. This is **not** a statistically steady warm-start test and cannot support acceptance.

On one further physical step from that projected but unphysical state, fixed-RHS normalized divergence decreased monotonically:

| Jacobi sweeps | cold max|D u|/U | previous-exact-q seed max|D u|/U |
| --- | --- | --- |
|20|1.1231|.19906|
|40|.53224|.10567|
|80|.23980|.058885|
|160|.11176|.033512|
|320|.066295|.017519|
|640|.035283|.013114|
|1280|.018196|.009850|
|2560|.013934|.006749|

The target1e-3 is missed within this budget; importantly, the RHS changes181% between those steps, so this is not evidence that a **steady** warm start is mathematically hopeless.

### Stokes and eigenmode diagnostics

Turning advection off exonerates a simple warm-start integrator explanation. With the same force, viscosity and320 Jacobi sweeps, transient Stokes flow stays positive and increases monotonically: five-section spread1.353% at1s,.2263% at2s,.01393% at10s; max|D u|/U at10s=1.212e-6. It has not reached steady state (mean speed still grows), and no Poiseuille gate has been measured. Lowest-eigenmode energy correction gives similar Stokes results (.01354% spread at10s). Under Navier–Stokes it does **not** cure the instability: spread43.61% at2s,180.34% at6s,96.63% at10s; normalized divergence.02213 at10s. A single lowest-pressure-mode explanation is therefore not confirmed. Advection/boundary interaction requires isolation before any solver replacement.

### Advection isolation and force equivalence

An exact CPU projection of one force impulse agrees with a no-force reservoir-head projection: relative maximum face-velocity difference4.04e-8; q_head=f·dt·L=1152; respective CG counts3506/3203. This rules out the force/potential sign or an extra force application in this one-step operator test. The GPU tentative path adds force once and projection subtracts gradient once.

Five-second N384 probes retain320 Jacobi sweeps and the exact CG bootstrap. A diagnostic wall guard samples traces every half-cell (32-sample ceiling, longer traces return zero), returns zero for a trace entering solid, and falls back to first-order at invalid reverse traces. It is an isolation control, not an accepted boundary discretization.

| Transport | max|q| at5s | max|u|dt at5s | max|D u|/U at5s | five-section spread at5s |
| --- | --- | --- | --- | --- |
| no advection (Stokes) |148.76|6.005|3.349e-6|.08329%|
| semi-Lagrangian |7422.04|27.962|.02167|44.84%|
| bounded MacCormack |1843.80|7.828|.03439|142.17%|
| semi-Lagrangian + wall trace guard |4572.45|15.584|.02699|42.39%|
| MacCormack + wall trace guard |1685.08|4.956|.01148|113.91%|

MacCormack pressure is bounded but violently oscillatory in this five-second window: max|q|196.22 at1s,9880.07 at2s,45650.35 at3s,9609.62 at4s,1843.80 at5s. Stokes pressure stays124–149 over.5–5s. Semi-Lagrangian pressure grows135 at.5s to8181 at4s. These short windows do not establish boundedness for all time.

Every closed face remains exactly zero in all probes. Sampling extrapolates the nearest face on the same physical component lattice at an open edge; it never wraps to the opposite end. Unprotected bilinear stencils may include solid zero faces and unprotected traces can cross solids. However wall-guard and unguarded evolution are identical through1s, when flux spread is already9.78% (SL) /11.82% (MacCormack). The guard limits later peaks, but does not cure the instability. Removing the MacCormack correction does not cure it either. CFL exceeds1 by.5s for SL/MacCormack and reaches66 in the failing MacCormack run; this is recorded rather than assuming semi-Lagrangian stability proves coupled projection stability.

The first stop was superseded by an explicitly requested lower-force probe: the legacy force25/160 values came from nonconservative collocated flow and do not define the paper regime. No deflation, multigrid, alternative production solver, API or paper calibration is adopted.

### Lower-force, low-CFL probe

Measured wetted mean width is fluid area / BFS path=93.32465278 cells. The straight-channel estimate `f=12ν²Re_w/wbar³` gives forces.2204193/.8816771/1.7633542 cells/s² for nominal width-based Re50/200/400. These are initial estimates, **not measured valve Reynolds numbers**.

Atf=.8816771,30s, both directions and160/320 paired Jacobi sweeps are numerically stable. Measured outlet/inlet flux gives **Re_D≈24.515 rightward /24.100 leftward**, not200. Max|q| stays.95–1.55, CFL≤.128; max|D u|/U at30s=.65–1.21e-6; simultaneous five-section spread.00365–.01204%. Flux grows4.4–4.7% from25s to30s, so statistical steadiness is not yet established. Lower-CFL projection is viable; high-force instability does not prove Jacobi unusable in the target regime. Raw `low-force-n384.json`, opt-in `staggered-low-force`.

Raw measurements are machine-local `.svelte-kit/staggered/gate1-n384.json`, `diagnostic-n384.json` and `advection-n384.json`, reproduced by `SVELTE_FLUID_SHOTS_EXTRA=staggered-gate1` / `staggered-diagnostic` / `staggered-advection` with the hardware browser test. They are observation runs, not passing acceptance assertions.

### Plane Poiseuille gate

Analytic `u(y)=f y(w-y)/(2ν)` at cell-centre transverse positions, Q=f w³/(12ν). Initial analytic velocity is evolved10s through the identical face transport, implicit viscosity and projection; it tests equilibration of the discrete stencil rather than an arbitrary cold-start duration. At64×16,ν=.04,f=1: profile L∞/Umax=.185445%, Q error=.237164%, Q=8553.5713 versus8533.3333. At doubled128×32,ν=.16,f=2: profile error=.075085%, Q error=.069146%, Q=34156.9352 versus34133.3333. Divergence is exactly zero in both. **Gate2 passes** its2% bounds and decreasing-resolution-error requirement. Raw `poiseuille-n16.json` / `poiseuille-n32.json`, opt-in `staggered-poiseuille`.

### Target-regime valve spin-up: stop

Next probe usesf=±7 cells/s²,dt=1/240,320 paired-Jacobi sweeps; steady criterion is10 consecutive one-second flux changes<.1% after30s, maximum120 simulated seconds per direction. **Leftward passes this local preflight at51s:** five exact signed fluxes−3060.3111,−3060.2999,−3060.2858,−3060.2728,−3060.2672 cells²/s; measured Re_D157.42; spread.001434%; max|D u|/U1.481e-6; max|q|11.9851; CFL.44520; final growth.03016%/s.

**Rightward fails:** no statistically steady state by120s. At10s, measured central-section Re_D112.43,CFL.4507,spread.2037%. Subsequent oscillations include negative throughflow; maximum sampled CFL113.65 and max|q|83421.45. At120s the five signed fluxes1112.0252,678.3406,−153.1415,−1335.2324,−2099.2755 disagree by152.97%; max|D u|/U.002435,CFL1.0644. At30s instantaneous CFL.5613 accompanies177.43% spread and normalized divergence.003496, but earlier excursions exceeded1: that sample does **not** establish failure under a globally CFL<1 trajectory.

Raw `valve-steady-n384.json`, opt-in `staggered-valve-steady`. The latest target-regime attempt fails stable/conservative rightward flow. No calibrated Re200, reverse-direction identification or Di can be inferred from it. **Stop taken pending a decision.** Original force25/160 gate magnitudes were superseded by explicitly requested measured-Re50/200/400 calibration; old collocated fluxes did not define the physical regime.

### Bounded pressure/CFL falsification

Three requested rightwardf7 arms start from identical CG-bootstrapped state. First imbalance means first one-second observation after1s with spread>1%; it is sample-resolved, not an exact onset time.

| Arm | pressure | timestep | first spread>1% | sampled max D/U | sampled max|q| | max CFL |
| --- | --- | --- | --- | --- | --- | --- |
| A |2560 sweeps|1/240|16.004s|.003388|5353.91|7.859|
| B |320 sweeps|adaptive, q rescaled by dt ratio|18.000s|.001072|363.80|.494081 (every step)|
| C |320 + exact lowest-mode energy correction|1/240|16.004s|.023856|4626.54|7.797|

All three fail conservative/bounded target evolution. B takes19795 steps versus7200 nominal fixed steps (2.75×), yet stays globally belowCFL.5 and still develops large residual/momentum oscillations. More sweeps delay imbalance; rank1 does not fix it. This does not distinguish residual-driven advection feedback from the advection discretization itself. The requested SL replacement was superseded by the energy/residual experiment; its exact owned test PID was interrupted only after A/B/C outputs were preserved.

At B's first imbalance, four successive slab flux differences are−297.8286,+268.8942,+207.2957,−46.6922, each **exactly** its summed divergence, telescope error0. Max local D/U=.00067995; flux spread3.659%. Small local error accumulates across the long valve: the1% flux criterion is stricter than local1e-3. No mismatched instants or interpolated face measurements explain it.

The floating-time loop initially submitted a spurious~1e-12s final fixed-dt step with unscaled old q. Final30s A/C rows from this run are invalid and excluded from conclusions; observations through29s and all earlier onset/maximum evidence remain valid. The loop now stops within1e-9s of the endpoint. Raw `three-arm-n384.json`; opt-in `staggered-three-arm`.

### Residual-controlled energy probe: budget stop

Requested adaptive-CFL arm with pressure checked every64 sweeps at max|D u|/U≤1e-5 hits **20000 sweeps on its first step** after the common CG bootstrap. It stops immediately, not after hours: U=.039087 cells/s, CFL.000742, actual GPU-projected D/U5.776e-5, five-section spread.10121%,max|q|3.3797. Startup's tinyU makes this relative criterion much tighter than at target speed. This is not an energy diagnosis of the later unsteady regime.

MAC dual-volume energy (half weights at open normal faces) is audited with exact midpoint body-force work, the matching no-slip viscosity stencil, kinetic-energy flux at both open faces, and zero reservoir-pressure work. First-stepΔE=91.10368, body work106.74368, viscous loss1.21942, net outward kinetic flux−.000004446, projectionΔE−14.34154. Transport/splitting remainder is−.07905 (dissipative), full continuum-budget remainder−14.42058 includes projection loss. These terms do not demonstrate energy growth without a source, nor a closed continuum energy budget. A near-steady/target initial condition or scalable converged reference is needed to answer the original instability question. Raw `residual-energy-n384.json`; opt-in `staggered-residual-energy`.

**Stop taken at the approved sweep budget; no solver replacement.** Gate1 is demonstrated only in the low-force regime and the steady leftwardRe157 case; gate3 is **not passed in both directions**. Gates4–5 remain unattempted. No mixing, diodicity, resolution-independence or performance claim follows from these preflights. Node suite1050/1050; svelte-check0 errors/warnings; full default hardware regression374 passed/7 skipped (42 passed files/3 skipped), with measurement-only cases excluded unless explicitly opted in.

## Scope decision and next-solver estimate

The MAC operators are verified; the current fixed-sweep Jacobi path is not sufficient for conservative target-regime rightward evolution within a useful budget. A scalable pressure solver is required before further acceptance work. Multigrid-preconditioned CG on this compatible staggered operator is a standard candidate, **not implemented or accepted here**. ADR 0115's failed aggregation/prolongation remains a warning: a coarse space must resolve the valve connectivity and low-energy channel modes; adding a hierarchy is not itself evidence of convergence.

Planning estimate only: six levels1152×384 down to36×12, one V(2,2) preconditioner costs roughly34–40 smoothing/restriction/prolongation draws (4 smoothers + restriction + prolongation per noncoarsest level, plus coarse solve). PCG adds operator/vector updates and reductions: about45–60 draws per iteration, with packed dot products and GPU-side scalars; two serial dot reductions across a6–7-level reduction chain can raise that to55–70. If5–10 iterations suffice, budget roughly225–700 total draws per step, approximately50–150 finest-grid-equivalent stencil draws because coarse levels shrink geometrically. Actual iteration count, coarse-grid robustness, GPU ms, and the50fps frontier are unmeasured. No promise that this beats160 paired-Jacobi draws until hardware evidence exists.

Direction and energy conclusions have limits. Rightward is the **candidate reverse direction** from its stronger separation/unstable response; a lower statistically steady flux at equal force has **not** been measured rightward, so the paper's operational reverse-direction definition and Di remain unverified. The one-step energy audit finds no source-free growth **in that step only**; it cannot exonerate advection during the later runaway, because the tight-residual run stopped before reaching it. Likewise the measured lowest eigenvalue supports slow channel error, but no spectrum throughk30 was computed. The evidence supports a pressure-convergence blocker, not a proven exclusive cause of every instability.

## Runaway diagnosis (2026-10-22)

Measurement-only diagnosis; status remains **Experimental — not adopted**. Requested arms are J (320 paired Jacobi sweeps), E (Float64 direct projection), E+R (exact projection plus reservoirs), J+R (Jacobi plus reservoirs), all rightward f=7 at N384 and fixed dt=1/240 for30 simulated seconds. Transport remains the recorded bounded MacCormack scheme,20 implicit-viscosity sweeps, no wall trace guard. Stability means every one-second sample from2–30s has five-section spread≤1% and no negative signed section flux.

**Original exactness criterion:** E counts as exact only if post-projection max|D u|/U≤1e-6 throughout.

**Lead amendment A-1 (2026-10-22, declared before E data):** At every one-second E sample, use the same tentative field for the direct Float64 solve and Float64 CPU face subtraction, round the projected faces to Float32, then compute D/U in Float64. This is the measured Float32 floor. The amended sample criterion is GPU-path D/U≤max(1e-6,2×floor). Report E/J D/U at matching times; a≥100× divergence gap is decisive for the P/B/A verdict. If GPU subtraction misses the bound while CPU subtraction meets it, E and E+R may use Float64 CPU subtraction followed by Float32 face upload, explicitly labelled. The first step is also checked so an avoidable Float32-q subtraction error does not contaminate evolution before the first sample. One-second sampling does not prove a bound at unsampled instants.

**Lead amendment A-2 (2026-10-22, added AFTER seeing E's partial data at16s):** The pre-registered spread/no-reversal verdict is unchanged. Separately report each arm's maximum CFL, max|q|, total kinetic-energy growth and whether max|u| exceeds10× bulk speed `U=|Q|/wbar`. The provisional post-data reading treated conserved-but-growing E as a separate pressure/advection outcome. Independent review below rejects that causal reading: E reproduces the same runaway, and exact continuity cannot be its stability discriminator. This is a post-data boundedness diagnosis, not a redefinition of the original acceptance rule. For rising-energy samples, report both the full instantaneous budget remainder `ΔE−bodyWork+viscousLoss+netOutwardKE` and the transport/splitting remainder with projection and sponge changes separated, relative to body work. Positive remainder suggests unaccounted transport/splitting injection; it is not a closed-budget proof of a particular advection defect.

**Lead amendment A-3 (2026-10-22, before any J+R′ data):** Original J+R is stable at approximately10% lower equal-time valve Re, peaking at116.706 (22s), while J first exceeds1% spread at14s, mean-section Re141.257. Matching startup Re at5/10s would not test this failure regime. A measurement-only J+R′ repeat therefore first uses `f''=f'×(157/116.7)` (approximately1.345×), up to60s. The stronger gate is mean valve Re_D≥141.3 for at least10 consecutive one-second samples, with spread≤1% and no reversals throughout that sustained window. One secant correction on log f is allowed, at most two repeat runs. Original5/10s matching is information only. Stable through the sustained window supports B and Jacobi sufficiency **with reservoirs**; failure means B is not sufficient; failure to reach the gate in two runs is **untested at failure Re**. E+R's peak Re is likewise compared with141.3. No additional transport or timestep arms are authorized here.

The bench-only direct reference uses geometric nested-dissection ordering and sparse Float64 LDLᵀ, factoring the identical SPD face-Dirichlet matrix once per arm. A masked small-grid node test compares against CG; each full-grid factor is also checked on its physical fixed RHS against `referencePressure` before evolution. Raw output is `.svelte-kit/staggered/diagnose-n384.json`; opt-in `SVELTE_FLUID_SHOTS_EXTRA=staggered-diagnose`. `SVELTE_FLUID_SHOTS_DYE=J|E|E+R|J+R` selects one arm per browser invocation, with GPU lock release between invocations. Per-arm wall time includes initialization, factorization and validation, not browser startup.

All four arms preserve the original CG bootstrap valve faces. Reservoir initial normal velocity extends each mouth profile unchanged along its plenum; transverse velocity is zero outside the valve. Each plenum is374 cells long and384 cells high, so the reservoir domain is1900×384 with unchanged valve resolution. The two R arms use the same direct first-tentative-RHS q seed, then their named solver; neither changes the embedded initial valve faces. Uniform force is `f'=7×1152/1900=4.2442105263`, preserving potential8064 cells²/s². In each outer94-cell sponge, before projection, `v←v exp[-10 dt(1-d/94)²]` for distance `d<94` from an outer edge; u is unchanged. This adds no normal boundary impulse or net boundary flux; pressure projection subsequently restores continuity. The five measured sections remain at the original valve coordinates0,288,576,864,1152 (translated374 cells for R), not across the plenums.

Energy-budget rows are **instantaneous per-step samples** (the final dt step at each integer second), not one-second integrals. They reuse MAC dual-volume energy, midpoint force work, matching viscosity loss, kinetic open-edge flux, zero open-pressure work, projection energy change and transport/splitting remainder. Sponge energy loss is separate. E/E+R/J+R additionally read only the packed boundary columns each step and integrate each edge's inflow/outflow kinetic-energy flux by right-endpoint dt quadrature; both1s interval and cumulative integrals are retained. Right-edge inflow is labelled backflow for the prescribed rightward drive; left-edge inflow is ordinary inlet energy, not itself evidence of instability. J retains the original sample-only boundary logging unless its integrated backflow becomes decisive.

Velocity and scratch textures are **RG32F**, q and divergence are **R32F**. The subtraction shader declares `highp float` and `highp sampler2D`; q is rounded to Float32 before neighboring values are differenced. Readback's RGBA/FLOAT expansion is not a half-float storage path. There is no RGBA16F intermediate in this harness. A scalable GPU pressure solver alone would inherit this separately measured Float32-q subtraction limitation; the CPU-subtract arm is a diagnosis, not a production solver proposal.

### Measured arms

All maxima below are **one-second sampled**, not every-step bounds. Spread is a percentage. E+R is partial, not a30s pass. Boundary KE rates/integrals are density-normalized discrete MAC quantities; J has no per-step integral.

| Arm | simulated window | first spread>1% | max spread | max D/U | max\|q\| | sampled max CFL (lower bound) | right-backflow KE integral | wall s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| J |30s|14s|187.1625%|.0589685|46284.68|47.1852|not measured|100.438|
| E |30s|none; eval saturated|.00003228%|2.92408e-6|1967.658|7.55603|1.32480e8|549.990|
| E+R |27s, partial|none observed; not a completed field|.000004507%|3.25154e-7|10.53961|.275932|41218.6 through27s|1452.014 to last flush|
| J+R |30s|none|.198232%|1.10384e-5|10.54059|.275947|259972.8|341.001|
| J+R′ guess1 |60s|none|.234638%|1.15574e-5|14.78207|.325587|1.10232e7|560.620|
| J+R′ correction |60s|none|.261978%|1.36283e-5|17.98602|.361207|1.45754e7|576.657|

J reproduces the original fields:10s spread.2036537%,30s177.43423%,30s D/U.003496272. Its first sampled imbalance is14s;16–18s in the earlier record referred to the altered three-arm controls, not this exact320-sweep fixed-dt reproduction. Negative section flux occurs at18–30s. **Evaluation defect:** E's exact projection enforces nearly identical section fluxes by construction; the registered spread/no-reversal rule is saturated and cannot decide whether E runs away. Its formal pass is not a dynamical stability result. Likewise A-1 `exactQualified` is vacuous after CPU fallback because the reported normalized divergence equals the CPU-round floor used on its right-hand side. Direct true residual is the independent pressure-accuracy evidence. The minimum J/E D/U separation over14–30s is45.3937×, below100×, but even a larger divergence gap would not exonerate the energetic burst shared by both arms. E+R terminated before its completion summary: original `stable`/`firstSpread` fields were never computed; later offline annotations explicitly say observed-window-only.

| Arm | peak total KE | final total KE | peak KE / KE at10s | max\|u\|/U | A-2 boundedness reading |
| --- | --- | --- | --- | --- | --- |
| J |1.41653e11|8.11453e7|2460.21|30.0528|large runaway excursion|
| E |1.04526e10|6.94798e7|181.658|24.8227|continuity retained, large energetic excursion|
| E+R, partial |9.31406e7|9.28744e7|1.77507|2.72953|bounded in observed lower-Re window|
| J+R |9.31388e7|9.23974e7|1.77504|2.73130|bounded at lower Re|
| J+R′ guess1 |1.34556e8|1.21314e8|1.50421|2.71717|bounded, failure-Re gate missed|
| J+R′ correction |1.65281e8|1.46692e8|1.37219|2.74664|bounded through sustained failure Re|

Initial KE is30.57527 for J/E,51.09072 for the embedded R fields. These near-zero bootstrap energies make peak/initial ratios dominated by ordinary startup; peak/10s above additionally describes the later excursion. Valve-face max difference against the original common bootstrap is**0 in every arm**, including both matched repeats.

### Direct accuracy and Float32 floor

| Domain | active cells | L nonzeros | factor time | factor typed arrays | additional typed workspace | mean solve | fixed-RHS true residual | pressure difference versus CG |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| valve E |107510|3141667|232.4ms|39.420MB|9.472MB|16.471ms|3.509e-13|1.729e-11 relative L2|
| reservoir E+R |394742|15219807|1962.2ms|188.954MB|31.285MB|78.659ms|2.993e-12|7.465e-12 relative L2|

Memory is explicit typed-array storage, **not measured peak browser RSS**; temporary JS ordering/CSC arrays and GC lifetime are unmeasured. E's sampled direct true relative residual is≤2.875e-13; E+R's≤7.454e-13. Matrices have no null-space correction. E+R's direct solve is too slow for the requested30s within one25min lock; it was stopped, not extrapolated.

GPU subtraction with exact uploaded q at the first E step gives D/U2.13220e-5 versus CPU-subtract-and-round floor3.81602e-7 (55.88×). A-1 fallback therefore selects Float64 CPU subtraction followed by Float32 face upload immediately. The same occurs in E+R (first-step GPU4.46304e-5, floor3.06563e-7). Probes continue on the **same tentative CPU-evolution field**: GPU subtraction/readback precedes the separate CPU projection upload, so the probe never drives evolution after fallback. At E10s GPU D/U3.25840e-7 equals the floor3.25840e-7; at20s GPU5.11714e-6 versus floor2.92408e-6. Equality at some maxima is not array aliasing: at1s GPU2.94859e-7 versus floor2.65373e-7,17s4.17728e-6 versus1.67091e-6,19s1.16506e-5 versus2.13040e-6. Values are from fresh GPU readback before CPU upload. The first-step floor is dominated by tiny bulk U and cancellation; later velocity-rounding hotspots can dominate both paths. These measurements do not isolate q rounding from shader arithmetic beyond the known R32F/highp pathway. Independent review emphasizes GPU/floor ratios**2.50×,3.6875×,5.46875× at17–19s**: being near the floor at calm samples does not hold through the burst. After fallback the CPU-path qualification is self-comparison, not an independent GPU accuracy pass. A post-review every-solve assertion now computes the true relative residual and throws unless≤1e-8 (including NaN); the original SPD pivot guard remains. Bun CPU-only110592-cell surrogate timing gives.902ms per residual loop versus12.206ms full solve including the assertion. Browser overhead is unmeasured; the reported original browser solve timings predate this safety check.

### Energy and backflow timing

E conserves section flux yet accelerates strongly around14–18s. The instantaneous transport/splitting remainder is negative at10–16s:−428.9 (−.584% of body work) at10s,−1720.6 (−1.872%) at14s,−52266.3 (−37.96%) at16s. At17s, while KE rises by2.93159e7 in that sampled dt step, transport/splitting remainder is**+3.98157e6 =17.403×body work**. The full budget remainder remains**−4.84333e6 =−21.170×body work**, because projection removes8.82491e6; positive tentative transport remainder is not a positive full-budget residual. At18s transport remainder remains+4.50813e6 (8.385×work) while total KE is already falling. Net outward KE sign is used throughout; `+netOutwardKE` equals subtraction of net boundary influx. This is an instantaneous splitting audit, not a time-integrated, closed-budget proof that advection alone creates the excursion.

E first exceeds10%/s sampled total-KE growth at1s (startup), and every1–18s interval remains above10%; thus that threshold has no separate late-onset crossing. Right-edge backflow first exceeds1% of same-second ordinary left-edge influx at**19s** (2.6036%), after sampled peak KE at18s; cumulative backflow/ordinary influx at30s is**.0312094%**. Substantial right-edge backflow is therefore late by this metric, not demonstrated as the trigger. Ordinary left-edge kinetic influx can still supply growth; absence of early right backflow does not exonerate open-boundary energy handling.

Single final-step edge samples are **excluded from backflow conclusions**; only every-step1s/cumulative integrals count. For E, maximum finite `integral/(instantaneousRate×1s)` over sample rows is70.568× left inflow (18s),197496.4× left outflow (21s, tiny denominator),220.036× right inflow (26s),16.973× right outflow (19s). Instantaneous zero still accompanies nonzero interval energy: left outflow23s=.001626; right inflow22s=4193.95 and24s=16164.74. A suggested370× at18s was not reproduced with this definition and is not used.

R-arm edge metrics are at the **outer plenum faces**, not the original valve mouths; they are not geometrically comparable with E's boundary measurements. A residual outer-edge effect remains: J+R right-inflow1s energy rises from4.81e-6 at17s to2.701 at20s,4701.8 at25s,106331 at30s; E+R matches through27s (4.80e-6,2.698,4692.8,23052 at27s). Growth is rapid and nonuniform (roughly doubling per second late), not proof the reservoir boundary has become harmless forever. Matched J+R′ correction peaks near30s (979028), then falls266819 at40s and25555 at60s. No longer-time bound is established.

### Reynolds and plenum confounds; matched repeat

| Arm | mean valve Q at5s | Re_D at5s | mean Q at10s | Re_D at10s | peak observed Re_D |
| --- | --- | --- | --- | --- | --- |
| J |1442.552|74.2054|2185.888|112.4428|unphysical after imbalance|
| E |1442.393|74.1972|2185.151|112.4049|813.732 during excursion|
| J+R |1292.201|66.4712|1956.578|100.6470|116.706 at22s|
| E+R |1292.206|66.4715|1956.646|100.6505|116.704 through27s|

Original J+R is **stable at approximately10% lower Re; not like-for-like**. At30s meanQ2241.873,Re115.323; its final five one-second flux changes are.175–.192%, decreasing, so it fails the requested<.1%/s statistical-steady criterion. Neither original R arm reaches J's first-imbalance meanRe141.257 (14s). Original J/J+R q-mouth means and signed sponge impulse were not logged and cannot be reconstructed from max|q|; no invented head comparison is made. J's physical open-face q is0 at both ends, so its total applied valve impulse is7×1152/240=33.6.

A-3 guess1 usesf5.70986335, reaches peakRe138.4365, misses141.3 throughout60s. The gate metric `S=max_t min(Re[t:t+10s])`, using11 integer samples for a literal10s span, is115.752583 for originalf'=4.24421053 (18–28s),136.365092 for guess1 (13–23s). Log-secant targetS150 gives finalf**6.7848755696**, multiplier**1.5986189958** onf'. Only these two matched repeats were run. Correction obtains**S148.741806 (11–21s)**, peakRe152.4504, andRe≥141.3 continuously at every sample9–60s (52 samples,51s elapsed). No sign reversal; spread≤.261978% at all samples,≤.256447% from2s onward. At60s meanQ2838.3912,Re146.0078; final five flux changes<.015%/s.

J+R′ reached a steady laminar state at Re≈146 (last-20 s flux SD 0.40%, monotone, no oscillation), so it does not exercise the paper's unsteady reverse regime.

The last20 one-second flux samples41–60s have mean2828.3165, population SD11.1930 (.39575%), range2800.8122–2838.3912. They increase monotonically, with no interior extrema; **no resolved oscillation or dominant frequency** is established. A finite-window Fourier peak of this drift would not establish periodic motion. No spatial/turbulence classification beyond this local laminar reading was measured.

Sponge x-momentum removal is identically0 by construction and measurement. Guess1's19→34s decay accompanies mouthΔq12.89021→10.65708 and total valve impulse40.29755→38.06442, not a direct streamwise sponge drain. Signed sponge y impulse/body x input rises+.4777%→+1.6589%; these cross-component ratios report scale, not streamwise drag. During correction, total domain impulse is53.7135983; head partition is:

| time | mean q_L−q_R | valve impulse f dt W_valve+q_L−q_R | remaining plenum impulse | signed sponge y/body x impulse |
| --- | --- | --- | --- | --- |
|5s|15.92542|48.49282|5.22078|+.01636%|
|10s|15.34087|47.90827|5.80533|+.10224%|
|19s|14.92841|47.49582|6.21778|+4.21871%|
|30s|12.72949|45.29690|8.41670|+2.54608%|
|34s|12.25768|44.82508|8.88852|−1.93312%|
|60s|14.10234|46.66974|7.04385|−.69465%|

Mouth q means are at the first/last fluid **cell centres**, not reconstructed physical interface-face values; the resulting head partition has this half-cell convention. The increasing plenum share during the decaying-flux interval is observed; separating viscous head loss, inertia and geometry resistance was not attempted. Correction's valve impulse exceeds J's33.6, so equal valve head is not imposed despite the Reynolds gate.

### Run accounting and remaining limits

Hardware command per arm: `VITEST_BROWSER=1 VITEST_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" SVELTE_FLUID_SHOTS_EXTRA=staggered-diagnose SVELTE_FLUID_SHOTS_DYE=<arm> bunx vitest run --project browser src/lib/engine/__benches__/staggered.browser.test.ts -t 'diagnostic: pressure, boundary and transport runaway isolation'`. Correction additionally sets `SVELTE_FLUID_MAC_BUDGET=1.598618995802606` as its bench-only force multiplier. No unsafe GPU flags were added.

Owned GPU lock intervals (UTC2026-10-22): J16:10:13–16:11:57; E16:13:47–16:23:01; J+R16:23:21–16:29:05; E+R16:29:30–16:54:23; failed timestamp-parse startup16:56:49–16:56:54; guess1 successful16:57:36–17:07:00; correction17:07:45–17:17:26; default hardware17:17:44–17:17:48; post-review J-hotspot17:38:58–17:40:11 (69.272s arm wall). Every interval is<25min. E+R's synchronous browser loop blocked the vitest1450s timeout; the owned runner received SIGTERM before the25min deadline. Last incremental JSON contains27s, no checkpoint; no continuation or rerun at the confoundedf' was taken by lead decision. Later bench loops check a wall-clock deadline derived from lock acquisition+24min each step and flush partial results before returning. Timestamp parsing trims the newline; the first failed prime invocation ran no simulation. Final harness guards require exactly one valid arm per invocation (preventing four arms under one lock), and an expired deadline before bootstrap/factor initialization flushes partial JSON with `deadline before init` then returns. These guards and the11-sample/10-elapsed-second gate-summary correction were checked with the node suite/typecheck after hardware runs; no measured trajectory changed. Exact recorded runner/browser PIDs for both successful repeats exited; no shared processes were terminated, no preview server touched. E+R's vanished browser-tree PIDs/profile had not been captured beforehand; post-stop inspection found no Playwright-profile survivors, but PID-complete historical ownership cannot be reconstructed.

Default hardware staggered case passes1/1 with9 opt-in cases skipped. Node suite1051/1051, svelte-check0 errors/0 warnings. No production code changes, commit, stage, push, dependency or preset changes in this lane. `diff -rq src/ <live-preview>/src/` finds only staggered-specific files/shader differences plus the pre-existing staggered gate1 screenshot (the lane-owned timestamp-startup failure screenshot was removed); **no non-staggered source-file difference** was found. No synchronization performed.

The original four-arm30s done-condition is **not fully met**: E+R stops at27s by lock budget, remains lower-Re, and is not a passing30s arm. A matched exact-reservoir E+R′ is skipped by lead decision because the matched Jacobi reservoir arm remains stable. Rightward's operational identification as reverse flow, steady equal-valve-head leftward/rightward comparison, diodicity and the paper's unsteady regime remain unmeasured. Bulk-Re matching does not impose identical head, velocity profile or energy topology.

### Independent review correction and boundary-hotspot repeat

The independent review overturns the pressure-cause interpretation: **E reproduces J's runaway despite converged pressure**. Before the burst, the two trajectories match closely:

| time | J meanQ / sampled CFL / maxu/U | E meanQ / sampled CFL / maxu/U |
| --- | --- | --- |
|2s|698.237 / .07739 / 2.4799|698.166 / .07729 / 2.4794|
|14s|2746.035 /1.1311 /9.1424|2734.515 /1.1114 /9.1031|
|16s|4303.743 /3.2414 /15.8429|4104.032 /2.9569 /16.1376|

Every reservoir arm keeps sampled maxu/U≤2.75, including the correction with peak bulkQ2963.64, above the original open-edge pre-burst bulkQ2746.0. This discriminates a growing local hotspot from ordinary bulk-Re growth.

One approved measurement-only J repeat runs0–18s, unchanged physics, stored separately as `J-hotspot`; all sampled central fluxes and max speeds match original J **exactly**. Zones cover the left/right2wbar=186.6493 columns, with the remaining interior; maximum is the absolute MAC face component, the same definition used for CFL, not an interpolated vector magnitude. Face coordinates are bottom-up.

| time | max location (component,x,y) | left maxu/U | right maxu/U | interior maxu/U | sampled CFL |
| --- | --- | --- | --- | --- | --- |
|2s|u,0,173.5|2.47994|2.27522|2.39214|.07739|
|10s|u,0,173.5|4.61269|2.60531|2.66602|.45066|
|14s|u,0,172.5|9.14244|2.57881|3.30715|1.13109|
|16s|u,0,172.5|15.84287|2.22611|7.34815|3.24137|
|17s|u,1,169.5|23.72166|1.07177|12.95547|18.16029|
|18s|u,1,169.5|9.29397|2.32594|3.22059|47.18522|

The maximum is already at the **left open inlet face** from2s through16s, then moves one cell inward. At14s this face is271.46 cells/s,16s777.93,18s11324.45 one cell inside. Relative ratios decline after the burst because bulk flux also explodes; this is not recovery evidence. The inlet-local hotspot precedes and spreads into the interior. Sampled CFL first exceeds1 at14s, an amplification opportunity rather than proof that CFL alone initiates it; growth is visible earlier below1. Additional advection/timestep isolation is out of scope.

Low-severity review limits: the direct RHS is the **Float32 GPU-computed divergence**, not an exact Float64 divergence of tentative faces; the true residual is against that supplied RHS. `firstSpreadAbove1Percent` includes1s although the stability window begins2s (J's14s onset unaffected). Every R bootstrap still uses the common originalf=7 valve state, then evolves with its scaled/matched force; bootstrap itself is not an R-domain force-equilibrated state. A hypothetical disconnected singular pocket is outside the SPD geometry assumption; nonpositive/nonfinite pivots throw, and the added every-solve true-residual≤1e-8 assertion rejects silent inaccurate/NaN solutions. No singular-pocket robustness claim is made.

**Corrected verdict: B — open-edge-associated runaway, a growing left-inlet velocity hotspot; specific energy/backflow mechanism unproven. Pressure non-convergence is NOT the runaway cause: E reproduces the burst. It changes how the burst appears, as flux imbalance in J.** Moving the open edges into reservoirs suppresses the hotspot in all measured R arms, including320-sweep Jacobi at sustainedRe≥141.3; no new solver is required for that measured reservoir case. CFL>1 from14s can amplify the burst. The exact-arm spread criterion and fallback qualification were evaluation defects, not evidence for a pressure-cause verdict. Residual outer-plenum backflow remains, longer-time behavior is untested, and the paper's unsteady reverse regime is not exercised. No production solver, boundary, advection or timestep fix is adopted.

## Consequences

The prototype and diagnostic sources are retained in the repository for reproducibility; they are not a public solver option. No public API or preset behavior changes until preflight succeeds. API validation, simulation-group lifecycle transitions, canonical documentation and a changeset accompany any eventual public `flow.grid` implementation, not an unusable placeholder.
