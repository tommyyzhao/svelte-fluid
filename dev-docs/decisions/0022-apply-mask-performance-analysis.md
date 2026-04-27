# ADR 0022: applyMask performance analysis and optimization paths

**Status:** Accepted (Optimization #1 implemented)
**Date:** 2026-04-13
**Updated:** 2026-04-15

## Context

When a container shape is active, the engine calls `applyMask()` **2 times**
per frame:

1. After velocity advection (velocity)
2. After dye advection (dye)

Previously (before the velocity mask merge), `applyMask` was called 4 times —
also after vorticity confinement and gradient subtraction. Those two calls were
removed because the intermediate leakage within a single frame is imperceptible
and the final velocity mask after advection zeros out any escaped values before
they persist to the next frame.

## Current cost model

Per `applyMask` call:
- 1 program bind (if different from current)
- 6-10 uniform uploads (shape-dependent)
- 1 `gl.drawArrays(TRIANGLE_FAN, 0, 4)` full-screen quad
- 1 FBO swap

Per frame: 2 calls = 2 full-screen quad draws + 2 FBO swaps.

At `simResolution: 512`, the velocity FBO is 512x512 and the dye FBO is up to
2048x2048 (or 1024x1024 if linear filtering is unsupported). The 1 velocity
mask blit is ~262K fragments; the 1 dye mask blit is ~4M fragments.

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

### 1. ~~Merge 3 velocity masks into 1~~ — IMPLEMENTED

The post-vorticity and post-gradient-subtract velocity mask calls were removed.
Only the post-advection velocity mask remains (plus the dye mask). The
intermediate leakage into the masked region during physics steps within a single
frame is imperceptible — the final mask zeros everything before the next frame.

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

Optimization #1 (merge velocity masks) has been implemented, reducing the
per-frame mask overhead from 4 blits to 2. Pre-baking (#2) was evaluated
and rejected — after adaptive resolution capping reduces dye textures to
canvas pixel size, the per-fragment SDF cost is negligible.

## Consequences

- The 2x blit approach is minimal overhead at default resolutions (128).
- Users running `simResolution: 256+` with container shapes pay 2 extra
  full-screen blits per frame. The playground's simResolution slider
  exposes this.
- Stencil-based masking (#3) remains available as a future optimization
  if large masked areas become a bottleneck.
