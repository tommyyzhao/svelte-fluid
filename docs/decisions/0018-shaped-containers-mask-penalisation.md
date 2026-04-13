# ADR 0018: Shaped fluid containers via mask penalisation

**Status:** Accepted (amended 2026-04-10, 2026-04-12)
**Date:** 2026-04-10

## Context

The simulation runs on a rectangular staggered grid. Boundary conditions exist
only for the four rectangle edges (texture `CLAMP_TO_EDGE` + explicit
no-penetration mirroring in `divergenceShader`). There is no mechanism to
confine the fluid to a non-rectangular shape.

"Container shape" means the fluid dynamics physically respect the boundary —
velocity has zero normal component at the wall, dye cannot escape — not just
visual alpha-masking of the rendered output (which would leave the underlying
physics untouched).

## Decision

Use **mask penalisation** (Brinkman approach) with **inline SDF computation**:

1. After every pass that writes the velocity field (vorticity confinement,
   gradient subtraction, velocity advection), blit the velocity DoubleFBO
   through `applyMaskShader`, which multiplies each texel by a circle SDF
   computed per-fragment from uniforms. Outside-domain cells are zeroed; zero
   velocity produces zero divergence, which drives the pressure solver to zero
   outside the domain. No changes to the divergence, pressure, or
   gradient-subtract shaders are needed.
2. After dye advection, blit the dye DoubleFBO through the same mask shader.
   Prevents colour seeping outside the container boundary.
3. The display shader computes the shape SDF analytically per-fragment to set
   final alpha to zero outside the domain, gated by a `CONTAINER_MASK` keyword
   (same mechanism as `SHADING`/`BLOOM`/`SUNRAYS`).

The mask shader (`applyMaskShader`) receives the shape parameters as uniforms
(`uCx`, `uCy`, `uRadius`, `uAspect`) and evaluates the SDF inline — no
separate mask texture or FBO is needed.

Shape is expressed as a new `ContainerShape` discriminated union in `types.ts`:

```ts
export type ContainerShape =
  | { type: 'circle'; cx: number; cy: number; radius: number }
  | { type: 'frame'; cx: number; cy: number; halfW: number; halfH: number };
```

All coordinates follow the existing convention: `cx`/`cy` ∈ [0, 1]
(left→right, bottom→top). `radius` is normalised by canvas height.
Additional variants (`ellipse`, `rounded-rect`, arbitrary SDF) can be added
later by extending the union and adding SDF branches in `applyMaskShader` —
no other code path needs changing.

New config fields:

| camelCase | SCREAMING_CASE | Type | Default | Bucket |
| --- | --- | --- | --- | --- |
| `containerShape` | `CONTAINER_SHAPE` | `ContainerShape \| null` | `null` | B |

`containerShape` is a **Bucket B** field — changing or clearing the shape
toggles the `CONTAINER_MASK` keyword, triggering `updateKeywords()` to
recompile the display material (~1–2 ms, same as toggling `bloom`). No FBO
rebuild is needed because the mask is computed inline from uniforms.

## Amendment (2026-04-10): inline SDF replaces mask FBOs

The original design allocated separate mask FBOs (`maskSimFBO` at sim
resolution, `maskDyeFBO` at dye resolution) pre-rendered by a
`maskGenerationShader`. This was replaced with inline SDF computation in
`applyMaskShader` for the following reasons:

1. **Single-channel FBO format issues.** `formatR` (`R16F`) falls back to
   `RG16F` or `RGBA16F` on some WebGL implementations. The fallback path
   worked but added untested complexity.
2. **Simpler architecture.** No mask FBOs to allocate, regenerate on shape
   changes, or dispose. No `initMaskFBOs()` method. The SDF is trivially
   cheap to compute per-fragment (one `length` + one `smoothstep`).
3. **Fewer GPU resources.** Two fewer FBOs when a shape is active.
4. **Hot-update simplification.** Shape changes no longer span Bucket C
   (FBO rebuild). Only Bucket B (keyword recompile) is needed.

The per-fragment SDF cost (4 extra evaluations per frame — 3 velocity + 1 dye)
is negligible compared to the texture lookup it replaced.

## Amendment (2026-04-12): Frame shape type added

The `ContainerShape` union was extended with a `frame` variant:

```ts
export type ContainerShape =
  | { type: 'circle'; cx: number; cy: number; radius: number }
  | { type: 'frame'; cx: number; cy: number; halfW: number; halfH: number };
```

**Frame** is the inverse of a typical container: fluid flows everywhere *except* inside a rectangular cutout (a "picture frame"). The SDF uses Chebyshev box distance in UV space — no aspect correction because the rectangle is defined in UV coordinates. The mask is 0 inside the inner rectangle and 1 outside, with the same ±0.005 smoothstep feather as circle.

The `applyMaskShader` was refactored to support both shapes via a `uniform int uShapeType` (0=circle, 1=frame). The display shader's `CONTAINER_MASK` block uses the same branching. All uniforms for both shapes are declared; the engine sets only the relevant ones per shape type.

A `containerShapeEqual` function was extracted from `FluidEngine.ts` to a new `container-shapes.ts` module alongside pure TypeScript SDF mirror functions used for testing. 33 vitest unit tests cover both shapes' SDF math, equality comparisons, and edge cases.

`FrameFluid` preset added: 8 jets in clockwise circulation around the frame border.

## Consequences

**Positive:**
- No changes to the divergence, pressure, or gradient-subtract shaders.
  The mask-zeroed velocity field naturally satisfies the no-penetration
  condition without explicit wall reflection logic.
- Adding future shapes requires only extending `applyMaskShader` and the
  display shader's `CONTAINER_MASK` block. All physics passes are unaware of
  the specific shape. (Validated by the frame shape addition in the 2026-04-12
  amendment — no physics shaders were modified.)
- Cost at steady state: 4 extra blit passes per frame (3 velocity + 1 dye),
  each trivially cheap. No branching in the physics shaders, no extra
  uniforms in the hot path.
- `containerShape: null` (the default) incurs zero overhead — all mask paths
  are guarded by `if (this.config.CONTAINER_SHAPE)` checks.

**Negative:**
- Boundary accuracy: the mask is one texel wide at sim resolution (128 px by
  default). Fluid within one texel of the wall may bleed slightly. This is
  below perceptual threshold for all normal use cases.
- The `applyMask` blit changes the active GL program. Any physics pass
  immediately following a mask call that implicitly reuses a prior program
  must explicitly re-bind it. See the "GL program rebind" learning in
  `docs/learnings/presets.md`.

**Rejected alternatives:**

- *Stencil buffer:* Restricts rasterisation only — the velocity FBO is computed
  on the full rectangle regardless. The pressure solve and advection passes
  do not respect the stencil. The fluid physics are unchanged; only the display
  is clipped. This is the "naive alpha-masking" the requirement explicitly
  prohibits.
- *Per-shader SDF boundary enforcement (immersed boundary method):* Accurate,
  but requires modifying `divergenceShader`, `pressureShader`, and
  `gradientSubtractShader` to sample boundary-reflected velocity at wall-adjacent
  cells. Each shader must know the shape formula. Significantly more code,
  more fragile at the 20-iteration Jacobi boundary, and harder to generalise
  to arbitrary shapes. The accuracy gain is invisible at sim resolution 128.
- *Separate mask FBO (original design):* Cleaner abstraction boundary but
  introduced FBO format compatibility risks, extra GPU memory, and a more
  complex hot-update path (Bucket B + C). Replaced by inline SDF.

## Amendment (2026-04-12): Frame shape type added

The `ContainerShape` union was extended with a `frame` variant:

```ts
export type ContainerShape =
  | { type: 'circle'; cx: number; cy: number; radius: number }
  | { type: 'frame'; cx: number; cy: number; halfW: number; halfH: number };
```

**Frame** is the inverse of a typical container: fluid flows everywhere *except*
inside a rectangular cutout (a "picture frame"). The SDF uses Chebyshev box
distance in UV space — no aspect correction because the rectangle is defined in
UV coordinates. The mask is 0 inside the inner rectangle and 1 outside, with the
same ±0.005 smoothstep feather as circle.

The `applyMaskShader` was refactored to support both shapes via a
`uniform int uShapeType` (0=circle, 1=frame). The display shader's
`CONTAINER_MASK` block uses the same branching. All uniforms for both shapes are
declared; the engine sets only the relevant ones per shape type.

A `containerShapeEqual` function was extracted from `FluidEngine.ts` to a new
`container-shapes.ts` module alongside pure TypeScript SDF mirror functions used
for testing. 33 vitest unit tests cover both shapes' SDF math, equality
comparisons, and edge cases. This validates the original ADR's claim that "adding
future shapes requires only extending `applyMaskShader` and the display shader's
`CONTAINER_MASK` block."

`FrameFluid` preset added: 8 jets in clockwise circulation around the frame
border.
