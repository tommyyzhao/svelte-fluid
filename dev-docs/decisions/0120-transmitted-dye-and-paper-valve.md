# ADR 0120: Transmitted dye and the paper Tesla-valve study

**Status:** Accepted (optics); experimental (paper-flow reproduction)
**Date:** 2026-10-21

## Context

Nguyen et al., Nature Communications 12, 2884 (2021), DOI
[10.1038/s41467-021-23009-y](https://www.nature.com/articles/s41467-021-23009-y),
photograph adjacent blue/green dye filaments in a backlit, water-filled Tesla
channel. Additive RGB emission cannot reproduce their dark overlapping dyes.
The experiment uses steady reservoir pressure, not pulsed inlet momentum.

## Decision

Opt-in `flow.visualization.absorption` interprets dye RGB as three nonnegative
species concentrations, not display colours. Three RGB extinction vectors give
optical depth `tau = c.r * epsilon[0] + c.g * epsilon[1] + c.b * epsilon[2]`.
Transmitted linear radiance is `backlight * exp(-tau)`; encode to sRGB exactly
once. Backlight defaults to linear white. No tone curve, bloom, sunrays, thickness
shading, or speculative fluorescence. Emission and absorption together throw
before GPU changes; reveal/distortion retain precedence. Presence selects a
Bucket-B display keyword and the concentration transport resource transition;
coefficients/backlight are Bucket-A uniforms.

Reuse ADR 0117's bounded, boundary-aware RGB MacCormack transport and float dye
when supported; retain the first-order thickness path. The existing optional
transport scratch is shared sequentially, not duplicated. No absorption config
means the old dye/display arithmetic and allocations remain unchanged.

The experimental paper route uses 2D incompressible Navier–Stokes, no-slip walls,
steady uniform pressure-gradient acceleration, open ends, fixed-composition dye
needles, and zero artificial confinement/dissipation/wall friction. The cell is
not Hele-Shaw: depth/width is about 2.1; depth drag time `d²/(12 nu)` is about
34 s versus a width-advection time about 0.4 s. Do not add depth drag.

Engine velocity is sim cells/s. The Jacobi diffusion stencil has
`alpha = nu_cells * dt`, hence `nu_cells = viscosity * max(W,H) * min(W,H)/128`.
Measure outlet flux `Q` in cells²/s, mean wetted width from the geometry, and
`Re_width = (Q / meanWidth) * meanWidth / nu_cells = Q / nu_cells`.
The paper instead uses hydraulic diameter 0.8 cm versus mean width 0.9 cm:
`Re_paper ≈ Re_width * 0.8/0.9`. Never infer Re from forcing alone.

Keep all existing variants/defaults unchanged. Transmitted paper variants use
an opaque white canvas multiplied over a white SVG with thin grey walls and
pale islands; no glass. Carrier tint fills naturally from the inlet.

## Experimental disposition

The optical feature passes hardware transmittance/transport/lifecycle tests.
The paper reproduction is **not accepted**. Equal pressure-only drive on the
legacy collocated solver gives inlet/outlet flux disagreement of roughly
7–20 times; quadrupling and 16-fold pressure iterations do not resolve it.
A measurement-only highp/R32F zero-gauge open-pressure control improves some
cases, but pressure doubling changes low-drive outlet flux by about 43% and
other cases remain nonconservative. It is not promoted into the engine/API.
The collocated divergence, gradient and nearest-neighbour pressure stencil are
not a compatible face-flux projection near walls; a conservative solver needs
separate design and verification before Reynolds/diodicity claims.

At grids 512 and 768 the registered onset metric is unit 3, but outlet-flux
Re proxies differ by more than 2× and are invalid because flux is not conserved.
No forward/reverse designation or Re 50/200/400 calibration is claimed. Route
IDs retain the requested names for experiments; visible labels say signed drive.
Two-substep GPU frame medians are 18.59 ms (512) and 29.46 ms (768), measured on
hardware Chrome/Apple M1 Max at 1920×640. The 512 real-page scroll run presents
50.26 fps with playback factor 0.887; 768 exceeds the 20 ms budget. These are
performance observations, not a validated quality frontier.

## Consequences

- Overlapping dyes darken through absorption, not an artistic blend.
- Three RGB coefficients per species approximate spectra; they are not measured
  dye absorption spectra. Image appearance is a visual reproduction.
- 2D turbulence has different energy transfer and instabilities from 3D water;
  this is not quantitative agreement with the experiment.
- Resolution and pressure convergence can cost more than a real-time frame
  budget. Report failed acceptance and the measured frontier, never silently
  lower the grid or manufacture a Reynolds-number label.
- Molecular dye diffusion (water Schmidt number around 1000) is neglected;
  numerical diffusion still sets the smallest visible filament scale.
