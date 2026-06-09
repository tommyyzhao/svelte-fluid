# ADR-0036: Believable Flow Scene API

## Status

Accepted

## Context

The original API controlled motion primarily through one-shot splats and
automatic random splat bursts. That is useful for generative fluid art, but it
does not give physically legible scenes enough structure: a venturi needs a
persistent inlet and outlet, ink needs an advected scalar plus density-like
forcing, and a gas flare needs a hot jet, outlet drains, and scalar-coupled
buoyancy to read as a rising plume.

Existing modes (`FluidReveal`, `FluidDistortion`, sticky, obstructions, glass,
and legacy presets) must continue to behave the same when `flow` is omitted.

## Decision

Add `FluidConfig.flow` as an additive scene API with:

- `mode: 'live' | 'prescribed' | 'hybrid'`
- persistent `sources` (`point`, `line`, `rect`)
- `outlets` for edge sponge/drain zones
- named `scalarFields` packed into one RGBA scalar FBO
- `forces` for gravity and scalar-coupled buoyancy
- uploaded prescribed grids for advanced velocity/scalar fields
- field visualization by speed, pressure, temperature, or scalar

The live path remains the existing WebGL incompressible solver. Obstruction
walls are now included in divergence, pressure, and gradient-subtract shaders
so projection treats solid neighbors as walls instead of only zeroing the
result afterward.

`flow.boundary` is authoritative per edge; legacy `openBoundary` is only the
fallback for edges not specified in `flow.boundary`. `mode: 'prescribed'`
keeps velocity purely prescribed and ignores source velocity and forces, while
`mode: 'hybrid'` adds the prescribed field before projection.

Reveal and distortion remain authoritative display modes. If either is enabled,
flow visualization is ignored, while sources/forces/scalars may still feed the
underlying simulation.

## Consequences

- Believable presets can use stable inlets/outlets instead of wrapper timers.
- GasFlare is deliberately framed as an incompressible jet/plume with scalar
  buoyancy, not a rocket or combustion CFD solve. Choking, shocks, Mach
  numbers, chemical heat release, soot, radiation, and multiphase liquid
  interfaces remain future solver-track work.
- `FlowOutlet` should be presented as a practical drain/sponge. Pressure-open
  behavior comes from `flow.boundary`; a convincing exit usually uses both an
  open edge segment/topology and an outlet drain. Uploaded prescribed grids are
  immutable by convention or carry a bumped `version` when values change.
- Flow sources and outlets use fixed-size batched shader paths where possible,
  so several analytic line/rect/point emitters or outlet gates can update the
  same FBO in one ping-pong pass without changing the additive source math or
  multiplicative sponge math.
- WebGL1 texture-unit pressure stays bounded by reusing units per pass and
  binding flow display inputs only when flow visualization is active.
- `presetSplats`, `autoSplat*`, and `handle.splat()` stay supported as simple
visual controls.
