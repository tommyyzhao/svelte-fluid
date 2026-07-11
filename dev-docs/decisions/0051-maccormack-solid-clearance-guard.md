# ADR 0051: Guard MacCormack traces with solid clearance

## Status

Accepted

## Context

ADR-0046 added a first-order fallback for MacCormack velocity advection near
solids and open edges. The solid check only evaluated the destination fragment,
while the correction reads the forward departure stencil and the symmetric
reverse stencil. A fluid destination could therefore apply a correction built
from samples across an obstruction. The fixed two-cell open-edge band had the
same defect for traces longer than one cell.

The shared semi-Lagrangian shader is the compatibility baseline and must remain
byte-identical. MacCormack is opt-in, velocity-only, and available on both
WebGL1 and WebGL2 when half-float linear filtering exists.

## Decision

Bake a simulation-resolution, unsigned-byte clearance field for MacCormack
instances whenever the combined binary solid mask is rebuilt. Default
semi-Lagrangian instances do not allocate it. Each fluid cell stores its
Chebyshev distance in cells to the nearest solid, capped at 255; solid cells
store zero. An exact two-pass, unit-weight eight-neighbor distance transform
produces the field on the CPU. It is uploaded as `R8` on WebGL2 or `LUMINANCE`
on WebGL1 and owned by the engine instance like the existing solid-neighbor
texture.

For a destination velocity `phiN`, the correction shader computes:

```
traceRadius = ceil(max(abs(dt * phiN.x), abs(dt * phiN.y))) + 1
```

Both forward and reverse departure segments lie inside this Chebyshev radius.
The extra cell contains every texel used by both bilinear stencils, including
the limiter neighbor whose interpolation weight can be zero at an exact texel
center. The correction is therefore valid only when sampled solid clearance is
strictly greater than `traceRadius`; otherwise it falls back to the pass-A
semi-Lagrangian value. Enabled open edges use the same dynamic radius instead
of a fixed two-cell band.

The clearance sampler uses texture unit 4, which is free in the correction pass.
The shader performs no clearance fetch when no physical mask exists. The shared
semi-Lagrangian shader and its default output remain unchanged.

## Consequences

- A single nearest-neighbor R8 fetch proves both traces and both stencils are
  clear for the solver's represented binary solid grid. There is no extra GPU
  pass and no variable fragment-shader loop.
- The test is intentionally conservative: MacCormack falls back anywhere the
  velocity could reach the one-cell solid halo, even when the exact trace would
  miss the obstacle. This trades localized numerical diffusion for boundary
  correctness.
- Walls thinner than the binary simulation-grid representation are not covered.
  They are also invisible to pressure projection and remain a separate boundary
  discretization concern.
- The additional resource costs one byte per simulation cell in the nominal
  texture format and is rebuilt only with solid-mask or simulation-resolution
  changes.

## Rejected alternatives

- Checking only departure endpoints, midpoints, or the two stencil endpoints:
  these can miss a thin wall between two fluid samples.
- Walking the departure segment in GLSL: WebGL1 requires a fixed loop bound and
  the worst case adds many dependent mask fetches.
- Reusing the RGBA solid-neighbor texture: it contains only four axial neighbor
  bits, so it cannot prove diagonal limiter cells or longer traces are clear.

## Verification

- Node tests verify exact Chebyshev distances, thin-wall halos, UV orientation,
  R8 saturation, trace-radius boundaries, and dynamic open-edge reach.
- A browser regression compares cross-wall normal flux and right-side kinetic
  energy for MacCormack and semi-Lagrangian advection, with a no-wall liveness
  control.
- Existing dipole-retention and 600-step non-finite soak tests remain required.
