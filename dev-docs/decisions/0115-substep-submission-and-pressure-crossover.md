# ADR 0115: Measured substep submission and pressure-pair crossover

**Status:** Accepted
**Date:** 2026-10-20

## Context

The thermal Tesla test route saturates the M1 Max GPU despite faster conduction. Whole-frame throughput alone does not establish compositor headroom; the actual page must be measured during scrolling. Existing pressure pairing uses a conservative 150,000-texel crossover from older scenes.

## Decision

Reject inter-substep `gl.flush()`: actual-page flame presentation was 15.53fps versus 15.96fps without it; no measured improvement. Retain original submission scheduling.

Raise the pressure-pair crossover from 150,000 to 330,672 texels. Measurement is M1 Max only; the 40% margin at 330k is more conservative for unmeasured fragment-bound GPUs than the 10% margin at 591k. Hardware four-solve medians (160 pressure iterations, actual velocity-target float readback) on M1 Max:196,608texels single 25.60ms/paired 13.25ms; 330,672 25.35/15.20; 591,408 25.20/22.60; 995,328 25.20/33.35. Paired retains two Jacobi updates per pass but omits the intermediate half-float store; rounding may differ.

Registry impact is exactly `150000 < minGrid * maxGrid <= 330672`, including portrait transposes. With native preset resolutions:128-cell presets (LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora, CircularFluid, FrameFluid, AnnularFluid, SvgPathFluid, Toroidal, TeslaValve) are newly paired only when long-grid size 1172–2583; 160-cell GasFlare/Venturi when 938–2066; 192-cell Karman when 782–1722. No registry preset changes at 1440×900,960×320,1920×640 or 1920×1080. At 1920×320 and 2560×320, GasFlare/Venturi/Karman remain newly paired: their 153,600–294,912texel grids are inside 330,672, so these rows do not drop out. Other presets at those canvases do not change. Any caller-overridden simulation resolution follows the same exact texel predicate. DPR does not change these aspect-derived grids.

Adopt paired no-slip viscosity: inline two existing Jacobi updates per draw, keeping iteration count, stencil, RHS and boundary rules. Apply only through 330,672 simulation texels; free-slip stays on its legacy shader. Half-float velocity pairing removes one intermediate store, so rounding can change. Four-step flame frames measured 23.1ms versus 26.9ms; the registered gate passes (fade50 .195, fade5 .645). No registry preset config sets no-slip, so no preset's viscosity changes.

Reject paired R32F conduction after whole-frame A/B:13.4ms paired versus 12.2ms equal-update single. Its wider dependent stencil outweighed saved passes; retain single conduction and no extra program.

The flame test route uses dye 512,11 proven diffusion iterations,2substeps,maxTimeStep 1/240 and pulse clock cap 1/120. This preserves per-simulated-second dt while intentionally running at half real-time on a 60Hz page, not slowing main-page presentation. At 120Hz,2substeps give dt 1/240 rather than the previous 4substeps'1/480. The physical gate and 120Hz pulse-cadence gate both pass; recorded screenshots retain incandescent inlet, coloured shoulders and dark tail.

## Rejected: multigrid pressure

The real flame's pure-Neumann pressure RHS is incompatible: one 48,116-cell fluid component touches both open edges; mean divergence +0.19544129 (maximum 205.625). Legacy residual infinity/L2 after 160 iterations was 49.97656/0.590407; any pure-Neumann solution has a mean-residual floor of at least 0.19544. An experimental open-face zero-pressure Dirichlet condition removed that incompatibility but changed the boundary physics; it was not adopted.

On a separate one-second real-flame RHS (initial infinity/L2 138.125/1.601175), R32F Jacobi under the experimental Dirichlet condition gave L2 residuals 0.147551, 0.126779, 0.116648, 0.109528 and 0.077792 after 160, 320, 640, 1,280 and 10,000 iterations. Thus the cheap Jacobi fallback was not converged at 160 either.

Six connected geometric levels (768×256 through 24×8) were tested with fluid-child restriction and coarse-face connectivity. Binary rediscretization diverged; damped correction stabilized it but gave asymptotic factors around 0.975. Galerkin face-conductance sums, constant prolongation with 1.7 over-correction and 400 coarse smoothing passes improved the factor to about 0.80 with damped Jacobi (omega 0.8), 0.79 with red-black Gauss–Seidel. The coarse 400-pass residual reduction was only 0.0181 / 0.00807 in L2, not the required 1e-3.

A final exact dense Float64 coarse inverse, uploaded as R32F and applied in one pass, still missed the adoption factor: V(1,1) damped Jacobi was about 0.90 asymptotically; red-black about 0.81. On the real RHS, red-black L2 after 0/1/2/3/4/8/16 cycles was 1.601175/0.787596/0.298283/0.201343/0.139098/0.053565/0.009596. The target was at most 0.3 per cycle; the bounded-attempt stop rule was over 0.5. Stop taken: all multigrid shaders, resources, API and boundary changes reverted; existing Jacobi route and pacing retained. No converged-physics fade or performance claim is justified.

Likely remaining limitation: piecewise-constant aggregation/prolongation represents the valve's long narrow-channel low-energy modes poorly. A later test can explicitly form the two-grid error-propagation matrix with an exact coarse solve and inspect its spectral radius / dominant eigenmode before another GPU implementation.

## Consequences

No additional GL resources or public configuration. No timestep, solver iteration or resolution change is implied by submission scheduling. Performance evidence must distinguish main-thread rAF from compositor presentation.
