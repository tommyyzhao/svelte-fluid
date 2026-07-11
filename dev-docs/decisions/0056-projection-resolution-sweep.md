# ADR-0056: Projection resolution sweep keeps the pressure ladder gated

## Status

Accepted (2026-07-11)

## Context

The solver uses 20 Jacobi iterations by default and switches from two exact
iterations per draw to single-iteration draws above 150,000 simulation texels.
Before changing iteration counts or introducing a more complicated pressure
solver, Epic 0002 requires deterministic evidence across the supported
production-resolution range.

## Measurement

The browser regression scene uses a 4:1 closed rounded-rectangle domain, fixed
splats, `curl: 0`, 18 steps at 1/120 s, and requested resolutions
64/96/128/192/256. The aspect ratio makes 192 resolve to 768×192 (147,456
texels, paired) and 256 resolve to 1024×256 (262,144 texels, single), exercising
both sides of the production gate without an engine test override.

Liveness and non-finite checks run before reduction. Post-projection velocity is
then reduced to divergence RMS/max using the shader's closed-solid ghost rule,
field energy, grid-scale energy fraction, peak velocity, and fluid-cell normal
velocity adjacent to solid faces. The latter is a collocated no-through-flow
proxy; the solver does not store staggered face velocities.

Measured on Chromium/ANGLE Metal:

| Requested | Grid | Regime | Div RMS | Div max | Energy | Grid-scale | Peak | Solid flux mean | Solid flux max |
|---:|---:|:---:|---:|---:|---:|---:|---:|---:|---:|
| 64 | 256×64 | paired | 0.512 | 6.203 | 19.468 | 0.0494 | 130.757 | 0.2791 | 2.0469 |
| 96 | 384×96 | paired | 0.913 | 23.684 | 21.700 | 0.0262 | 168.706 | 0.8074 | 10.5781 |
| 128 | 512×128 | paired | 0.643 | 3.982 | 23.519 | 0.0191 | 193.222 | 0.1436 | 1.2695 |
| 192 | 768×192 | paired | 0.680 | 3.910 | 26.329 | 0.0095 | 226.430 | 0.0287 | 0.2306 |
| 256 | 1024×256 | single | 0.754 | 4.703 | 29.021 | 0.0034 | 257.457 | 0.0133 | 0.1198 |

The checked-in bands surround these observations with cross-renderer headroom,
but retain lower bounds so a dead or blank field cannot pass.

## Decision

Keep the existing 20-iteration projection and adaptive paired/single threshold.
The sweep does not show monotonic, shipping-relevant pressure under-convergence:
256 RMS is about 1.47× the 64 result but remains below the 96 result, divergence
max does not jump at the paired-to-single transition, and boundary-flux and
grid-scale proxies improve substantially at the two highest resolutions.

The 96 grid has a localized divergence/solid-flux spike that disappears again
at 128. That is more consistent with binary curved-boundary raster alignment
than pressure convergence and belongs to FID-005's boundary-defect reproduction.

## Consequences

- FID-008's cheap pressure-convergence ladder remains gated; this evidence does
  not activate it.
- Later pressure or aperture changes must keep this sweep green across both
  pressure regimes.
- FID-005 should include the 96-class boundary alignment as one input, without
  assuming fractional apertures are warranted before its defect gate is met.
- No runtime, public API, preset, or benchmark-route behavior changes.
