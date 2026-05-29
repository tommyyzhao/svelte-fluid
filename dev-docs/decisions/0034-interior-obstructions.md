# ADR 0034: Interior obstructions the fluid flows around

**Status:** Accepted
**Date:** 2026-05-28

## Context

`containerShape` (ADR-0018, ADR-0021, ADR-0024) confines the fluid to a
*contained* region — fluid lives inside the shape and is zeroed everywhere
outside. Users want the dual capability: drop arbitrary *obstacles* into the
domain that the fluid flows around — pillars in a current, letters the dye
weaves between, walls forming a maze. This is the inverse of a container: the
filled region marks where fluid is **blocked**, not where it is contained.

Two requirements shaped the design:

1. **Orthogonality to `containerShape`.** Obstructions must compose with any
   container (circle, frame, annulus, svgPath) *and* with no container at all
   (a full-rectangle maze). They are not a new container variant; they are a
   second, independent mask.
2. **Arbitrary geometry.** Like `svgPath` containers, obstacle shapes cannot be
   expressed as closed-form SDFs. Letters, logos, and organic walls must be
   describable by an SVG path `d` string or rasterized text — reusing the
   ADR-0024 mask-texture rasterizer rather than inventing a new path.

The physics question is the same one ADR-0018 already answered for containers:
how do we make the fluid respect an interior boundary without modifying the
divergence / pressure / gradient-subtract shaders?

## Decision

Add an `obstructions?: ReadonlyArray<Obstruction>` field to `FluidConfig`.
Each `Obstruction` reuses the `svgPath`/`text` descriptor from the `svgPath`
container variant (`d` / `text` / `font` / `viewBox` / `fillRule`) plus a
per-obstruction `offset` and `scale` in UV space.

### Combined-mask architecture (one R8 texture, union of all obstructions)

All obstructions rasterize into **one** combined single-channel mask texture
(`R8` on WebGL2, `LUMINANCE` on WebGL1), drawn into a single `OffscreenCanvas`
so their filled regions *union* — overlapping fills simply accumulate as white.
`initObstructionMaskTexture()` reuses the `initMaskTexture` rasterizer: the same
aspect-corrected `maskW`/`maskH` dimensions from a fixed base resolution of 512
(`Obstruction` has no `maskResolution` field), the same Y-flip convention, and
the same `Path2D` / `fillText` fit transform. Each obstruction is wrapped in
`save()`/`restore()` and applies its own `offset` (UV translate) and `scale`
(multiplier on the fit scale) before its fill.

Each obstruction also has a `fit` mode (path mode only). The default `'contain'`
uniform-fits + centers the `viewBox` — shape-accurate, but in a non-square
canvas it letterboxes into the narrower axis, leaving open margins. `'fill'`
stretches each axis independently to span the whole canvas at any aspect. This
is essential for canvas-spanning obstacles — a maze or a nozzle channel must
confine the fluid edge-to-edge, and the preset's injection UVs must line up
regardless of the consumer's card shape; without `'fill'` the obstacle sits in a
centered square and fluid escapes (and injects into) the open margins. Discrete
obstacles placed via `offset`/`scale` keep the default `'contain'`.

The mask is applied **post-hoc**, orthogonally to the container mask. The
allowed-fluid factor at every texel is:

```
allowed = container × (1 − obstruction)
```

This holds in all three consuming passes:

- **`applyMaskShader`** (velocity + dye masking). The container branch produces
  `cmask` as before; the new `uHasObstruction` float gates an unconditional
  `uObstructionMask` sampler that subtracts the obstruction. When obstructions
  exist but there is no container, the engine sets `uShapeType = -1` (no matching
  branch) so the container mask stays `1.0` and *only* the obstruction subtracts.
- **Display shader.** Gated by a new `OBSTRUCTION_MASK` `#define` keyword,
  matching the existing `CONTAINER_MASK` pattern — the display shader carries
  **no** `uHasObstruction` float; the `uObstructionMask` sampler lives entirely
  inside `#ifdef OBSTRUCTION_MASK`. Interior obstructions are cut out of the
  visible region too, so the rendered hole matches the physics hole.
- **Glass shader.** The `uHasObstruction` float + `uObstructionMask` sampler cut
  obstructions out as clean holes in the glass vessel.

### Bucket-C-like rebuild + keyword recompile

Runtime updates mirror `stickyMask` exactly. `setConfig()` diffs via
`obstructionsEqual()` (which treats `null` / `undefined` / `[]` as the same
"no obstructions" state, so toggling between them never forces a needless
rebuild). On change it calls `initObstructionMaskTexture()` (rebuild the combined
texture) and includes the change in the `updateKeywords()` trigger so the
display shader toggles `OBSTRUCTION_MASK`. `DEFAULTS.OBSTRUCTIONS = null`;
`resolveConfig` sets `out.OBSTRUCTIONS = input.obstructions ?? null`.

Splat spawning rejects candidates inside obstructions: both the auto-splat
spawner *and* `multipleSplats` (initial random splats) run their rejection loop
when `(containerShape || OBSTRUCTIONS)` and reject any candidate where
`obstructionMask(x, y, octx) >= 0.5`, keeping the existing 10-attempt cap with
continue-on-exhaustion. This stops initial splats landing inside maze walls even
when there is no analytical container.

### Type definition

```ts
export interface Obstruction {
  d?: string;                                          // path mode (precedence)
  text?: string;                                       // text mode
  font?: string;                                       // default 'bold 72px sans-serif'
  viewBox?: [number, number, number, number];          // default [0,0,100,100]
  fillRule?: 'nonzero' | 'evenodd';                    // default 'nonzero'
  offset?: { x: number; y: number };                  // UV translate after fit, default {0,0}
  scale?: number;                                       // multiplier on fit scale, default 1
}
```

## Physics-approximation caveat

Obstructions reuse the **post-hoc mask-penalisation** approach of ADR-0018 — and
inherit its approximation properties. The obstruction texel is multiplied into
the velocity field after every pass that writes velocity; zeroed velocity inside
the obstacle produces zero divergence there, which drives the pressure solver to
route flow *around* the obstacle. Two emergent behaviours fall out for free:
flow-around (streamlines bend past the obstacle) and venturi acceleration (flow
speeds up through gaps between obstacles), with no changes to the divergence,
pressure, or gradient-subtract shaders.

This is a **free-slip** boundary, not no-slip: the wall stops normal flow but
applies no tangential drag, so fluid slides along the obstacle edge without a
boundary layer. The boundary is **~1 texel wide** at sim resolution (128 by
default), so the smallest reliably-resolved obstacle is roughly
**`minimum feature size ≈ 2 / simResolution`** in UV units (~0.016 at the
default 128). Walls thinner than that may leak. Raise `simResolution` for
finer mazes.

True **no-penetration enforced inside the divergence shader** (an immersed-
boundary / Neumann formulation that reflects wall-adjacent velocity) is
explicit future work, exactly as ADR-0018 and ADR-0024 left it for containers.
Post-hoc masking is sufficient for the v1 visual goal.

### Obstructions are physical under an open boundary

Container masking is suppressed when `openBoundary` is true — a container then
acts as a visual-only crop (the divergence solver skips no-penetration at the
canvas edges, and the container is not enforced as a wall). **Obstructions are
the exception: their mask pass runs regardless of `openBoundary`.** A solid
obstacle should block flow whether or not the canvas edges are open, and the
throughflow presets (rocket nozzle, venturi, river delta, flow past a body)
specifically want `openBoundary: true` — fluid enters one side, flows around
the obstacles, and vents off the far edge instead of recirculating and
saturating a sealed box. Concretely: `shouldMaskPhysics()` returns true whenever
obstructions exist (or when a container shape is active and the boundary is
closed), and `applyMask()` drops the container term under `openBoundary`
(`uShapeType = -1`) while always applying the obstruction term.

## Texture-unit map

Obstruction sampling slots into free units in each consuming pass — verified no
collisions:

| Pass | unit 0 | unit 1 | unit 2 | unit 6 | obstruction unit |
| --- | --- | --- | --- | --- | --- |
| `applyMask` | target FBO | svgPath container mask | **obstruction** | — | **2** |
| `glass` | sceneFBO | svgPath container mask | **obstruction** | — | **2** |
| `display` | dye/various | … | … | distortion velocity sampler | **6** (guarded by `!DISTORTION`) |

The display unit (6) is shared with distortion's velocity sampler, so
**obstruction presets must never enable `distortion`** — the two are mutually
exclusive by construction. Because the display sampler lives entirely inside
`#ifdef OBSTRUCTION_MASK`, binding `uObstructionMask` only when the texture
exists, setting a non-existent uniform is a harmless WebGL no-op when the keyword
is off.

## Consequences

**Positive:**
- Arbitrary obstacles (paths, text, multiple disjoint regions) that the fluid
  flows around, fully orthogonal to `containerShape`. A maze needs no container.
- One combined texture regardless of obstruction count — constant per-fragment
  cost (one extra sample in each consuming pass), invariant in obstacle count.
- Zero physics-shader changes; reuses the ADR-0024 rasterizer and the ADR-0018
  post-hoc masking pipeline. No new runtime dependencies.
- `obstructions: undefined` (the default) incurs zero overhead — all obstruction
  paths are guarded by `hasMaskWork()` / `uHasObstruction` checks.

**Negative:**
- Inherits ADR-0018's boundary approximation: free-slip, ~1-texel boundary,
  minimum feature size ≈ `2 / simResolution`. Fine walls require higher
  `simResolution`.
- Re-rasterization on `obstructions` change costs a Canvas 2D fill per obstacle
  plus one texture upload (~few ms). Fine for interactive edits; not per-frame.
- Mutually exclusive with `distortion` (shared display texture unit 6).
- Fixed 512 base resolution (no `maskResolution`); very intricate obstacle
  outlines are limited by that rasterization resolution.

## Rejected alternatives

- **One texture per obstruction.** N samplers + N samples per fragment, an
  unbounded uniform/texture-unit budget, and a per-obstruction bind loop in every
  pass. The union-into-one-texture approach is constant-cost and matches how
  Canvas 2D already composites overlapping fills. Rejected.
- **Modifying the solver for v1** (no-penetration in the divergence shader). More
  accurate boundaries but requires touching three physics shaders and is fragile
  at the 20-iteration Jacobi boundary — the same trade ADR-0018 and ADR-0024
  deferred. The post-hoc result is visually sufficient. Deferred as future work.
- **Stencil buffer.** Clips rasterization only; the velocity FBO is still solved
  on the full domain, so the fluid does not actually flow around the obstacle —
  it is computed through it and merely hidden. This is the visual-only masking
  ADR-0018 explicitly prohibits. Rejected.
