# ADR 0022: applyMask performance analysis and optimization paths

**Status:** Accepted
**Date:** 2026-04-13

## Context

Every frame, the engine calls `applyMask()` 4 times when a container shape is active:

1. After vorticity confinement (velocity)
2. After gradient subtraction (velocity)
3. After velocity advection (velocity)
4. After dye advection (dye)

Each call binds the `applyMaskProgram`, sets uniforms, attaches a read FBO,
blits to a write FBO, and swaps. At `simResolution: 128` (default), each blit
is 128x128 pixels — negligible. At 256 or 512, the texture sizes quadruple or
16x, and the 4 blits per frame become measurable.

## Current cost model

Per `applyMask` call:
- 1 program bind (if different from current)
- 6-10 uniform uploads (shape-dependent)
- 1 `gl.drawArrays(TRIANGLE_FAN, 0, 4)` full-screen quad
- 1 FBO swap

Per frame: 4 calls = 4 full-screen quad draws + 4 FBO swaps.

At `simResolution: 512`, the velocity FBO is 512x512 and the dye FBO is up to
2048x2048 (or 1024x1024 if linear filtering is unsupported). The 3 velocity
mask blits are ~786K fragments each; the 1 dye mask blit is ~4M fragments.

## Profiling approach

To measure actual GPU cost, add the following in a development build:

```typescript
// In step(), around the applyMask calls:
performance.mark('applyMask-start');
this.applyMask(this.velocity);
gl.finish(); // Force GPU sync for accurate timing
performance.mark('applyMask-end');
performance.measure('applyMask-velocity', 'applyMask-start', 'applyMask-end');
```

Note: `gl.finish()` forces a GPU pipeline flush and should only be used during
profiling — it stalls the CPU and defeats pipelining. For production profiling,
use Chrome DevTools GPU timeline or `EXT_disjoint_timer_query_webgl2`.

## Optimization paths (ordered by effort/impact)

### 1. Merge 3 velocity masks into 1 (medium effort, ~3x reduction)

Instead of masking velocity after vorticity, gradient-subtract, and advection
separately, mask once after the final velocity advection. The intermediate
masked values only affect subsequent physics passes within the same frame —
for most simulations, masking once at the end is visually indistinguishable.

**Trade-off:** Fluid may briefly "leak" into the masked region during
intermediate physics steps within a single frame. For most use cases this
is imperceptible.

### 2. Pre-baked mask texture (low effort, lower per-fragment cost)

Compute the SDF mask into a texture once when the container shape changes,
then sample it during `applyMask` instead of recomputing the SDF per-fragment.
This replaces ~10 ALU ops per fragment with a single texture fetch.

**Trade-off:** Requires an extra FBO allocation and a re-bake whenever the
shape config changes. The texture resolution should match the sim resolution.

### 3. Stencil-based masking (medium effort, best GPU utilization)

Instead of a full-screen quad multiply, use the stencil buffer:
- Render the SDF boundary into the stencil buffer once per frame
- Set stencil test to discard fragments outside the shape
- Physics passes automatically skip masked regions

**Trade-off:** Stencil setup has a fixed cost. Only beneficial when the masked
area is a significant fraction of the canvas (e.g., thin annuli, small circles).

### 4. Skip mask when shape covers full canvas (trivial)

If the container shape is a full-canvas rect (outerHalfW >= 0.5, outerHalfH >= 0.5,
no inner cutout), skip `applyMask` entirely. Already partially handled by the
`if (this.config.CONTAINER_SHAPE)` guard, but could be extended for near-full shapes.

## Decision

For now, the 4x blit approach is retained at default resolutions (128).
Optimization #1 (merge velocity masks) is the recommended first step if
profiling reveals a bottleneck at higher resolutions. The rejection sampling
added for splat spawning (Work Item 2) already reduces wasted computation
elsewhere.

## Consequences

- Users running `simResolution: 256+` with container shapes should be aware
  of the 4x mask overhead. The playground's simResolution slider exposes this.
- Future optimization work has a clear roadmap: merge first, then pre-bake
  if needed.
