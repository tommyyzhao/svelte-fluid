# ADR-0037: Lightweight CFD Stability Controls

## Status

Accepted

## Context

The flow-scene API made obstruction demos more physically legible, but the
solver still had two fidelity gaps that showed up in Venturi-like scenes:

- Velocity was projected before velocity advection. Semi-Lagrangian advection
  then produced the final displayed velocity for the frame, so the visible
  field could carry fresh divergence until the next frame.
- The live solver exposed no cheap way to trade GPU work for stability in fast,
  narrow passages. Presets had to lean on dissipation and pressure iterations,
  which does not model diffusion or wall shear.

The goal remains browser-GPU, real-time, qualitative incompressible flow. This
is not a validated compressible or high-Reynolds CFD solver.

## Decision

Add these hot scalar `FluidConfig` fields:

- `maxTimeStep` and `substeps` to split a rendered frame into smaller solver
  steps.
- `viscosity` and `viscosityIterations` for an optional implicit velocity
  diffusion solve.
- `wallFriction` and `wallFrictionWidth` for optional damping in cells adjacent
  to interior obstruction masks.

Refactor the live solver order so velocity advection happens before projection:

1. Apply sources, body forces, outlets, and vorticity confinement.
2. Advect velocity.
3. Apply optional viscosity and obstruction-adjacent wall friction.
4. Project velocity with divergence, pressure Jacobi, and gradient subtraction.
5. Advect dye and scalar fields with the divergence-clean velocity.

Add `FlowForce` kind `pressureGradient` as a semantic alias for the same
velocity-space body force implementation used by gravity. Presets can now name
the forcing honestly without adding a new shader branch.

Build one binary solver solid mask from the physical container exterior plus
all interior obstructions. Display shaders can still use smooth antialiased
masks, but divergence, pressure, gradient subtraction, viscosity, and wall
friction now agree on the same solid-cell classification.

## Consequences

- Flow demos can spend more GPU passes only where needed; defaults preserve the
  prior one-step behavior.
- Venturi can be driven by a named pressure-gradient body force and tuned with
  small substeps, mild viscosity, and wall friction instead of prescribed inlet
  velocity.
- Wall friction is a practical near-mask damping approximation, not a full
  no-slip finite-volume boundary condition.
- SVG-path container scenes such as TeslaValve no longer rely on post-projection
  clipping alone; their walls participate in the pressure solve.
- Viscosity is dimensionless in the public API. It is scaled internally by
  timestep and simulation resolution so small values are useful at browser-grid
  sizes.
- Reveal, distortion, sticky, and legacy splat behavior keep their existing
  shader branches; the new passes only run when their config values are nonzero.
- Opaque-background rendering composites the authored background color inside
  the display shader, removing a separate full-screen background pass while
  preserving the same premultiplied blend equation.
