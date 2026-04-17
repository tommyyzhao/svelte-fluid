# ADR 0024: SVG path container shapes via mask texture

**Status:** Accepted
**Date:** 2026-04-17

## Context

The engine supports four analytical container shapes (circle, frame, roundedRect,
annulus) via inline SDF computation per-fragment (ADR-0018). Users want to confine
fluid to arbitrary shapes — letters, logos, organic outlines — described by SVG
path `d` strings.

Arbitrary SVG paths cannot be expressed as closed-form SDFs. The per-fragment
cost of evaluating distance to every Bezier segment in the path is prohibitive.
A different approach is needed.

## Decision

Add a `{ type: 'svgPath' }` variant to `ContainerShape` that uses a **mask
texture** rasterized from the SVG path via Canvas 2D `Path2D`:

1. **Rasterization:** At construction or shape change, create an `OffscreenCanvas`
   at fixed 512x512 resolution (configurable via `maskResolution`). Map the SVG
   path's `viewBox` to the canvas coordinate space, applying a Y-flip so the
   mask matches the engine's bottom-to-top UV convention. Apply aspect ratio
   correction so the mask stretches correctly on non-square canvases.
   Call `ctx.fill(new Path2D(d), fillRule)` to rasterize.

2. **GPU texture:** Upload the rasterized mask as a single-channel texture
   (`LUMINANCE` on WebGL1, `R8` on WebGL2) with `LINEAR` filtering. Bilinear
   interpolation provides free sub-pixel anti-aliasing at mask edges.

3. **Mask application:** A separate `applyMaskTextureProgram` (not a branch in
   the existing `applyMaskProgram`) samples `uMaskTexture` and multiplies. This
   avoids adding a sampler uniform to the analytical shader (which would require
   binding a dummy texture for circle/frame/etc). The engine picks which program
   to use in `applyMask()` based on shape type.

4. **Display shader:** A new `CONTAINER_MASK_TEXTURE` keyword gates the
   texture-sampling path in the display shader, separate from the existing
   `CONTAINER_MASK` keyword used for analytical shapes.

5. **CPU-side sampling:** A copy of the mask data (`Uint8Array`) is retained for
   rejection sampling during random splat spawning. `containerMask()` accepts an
   optional `maskCtx` parameter carrying this data. Existing shapes ignore it.

6. **Bucket classification:** Shape changes are a new operation category — not
   Bucket A (hot scalar), not Bucket B (keyword only), not Bucket C (sim FBO
   rebuild). The operation is: re-rasterize mask texture + toggle display keyword.
   Documented in CLAUDE.md as an extension to the bucket system rather than
   shoehorned into an existing bucket.

### Type definition

```ts
{ type: 'svgPath'; d: string;
  viewBox?: [number, number, number, number];
  fillRule?: 'nonzero' | 'evenodd';
  maskResolution?: number }
```

- `d`: SVG path data string (all commands supported natively by `Path2D`).
- `viewBox`: Maps path coordinates to UV space. Default `[0, 0, 100, 100]` so
  paths authored in a 100x100 coordinate space work without configuration.
- `fillRule`: Canvas 2D fill rule. Default `'nonzero'`. Use `'evenodd'` for
  font outlines with counters.
- `maskResolution`: Override the 512x512 default when needed.

### Aspect ratio handling

The mask texture is always rasterized square (512x512). The `viewBox` mapping
stretches the path to fill the square. On a non-square canvas, the UV sampling
coordinates are not aspect-corrected — the mask occupies the full [0,1]x[0,1]
UV range, matching the canvas's UV space. This means a circular SVG path on a
wide canvas will render as an ellipse (matching how `roundedRect` and `frame`
work in UV space). Users who want aspect-correct circles should use the
analytical `circle` shape or adjust their SVG path coordinates.

### Y-axis convention

Canvas 2D is Y-down; the fluid engine is Y-up. During rasterization, the canvas
context is flipped via `ctx.translate(0, height); ctx.scale(1, -1)` before
drawing the path. This ensures the rasterized mask aligns with the engine's UV
space without needing a flip in the GLSL sampler.

## Consequences

**Positive:**
- Arbitrary shapes: letters, logos, organic outlines, multiple disjoint regions
  (handled naturally by Canvas 2D fill).
- Single texture sample per fragment — faster than evaluating complex analytical
  SDFs, invariant regardless of path complexity.
- Zero new runtime dependencies. `Path2D` and `OffscreenCanvas` are available in
  all browsers that support WebGL (Safari 16.4+, Chrome 69+, Firefox 105+).
- Existing analytical shapes are untouched — no performance regression.
- The mask texture approach was the original ADR-0018 design before being
  simplified to inline SDF. The infrastructure patterns are well-understood.

**Negative:**
- Resolution-dependent edge quality (unlike analytical SDFs). Mitigated by
  `LINEAR` filtering and 512x512 default resolution.
- Extra GPU memory: 256KB for the mask texture + 256KB CPU copy = 512KB total.
- Re-rasterization on shape change costs ~2-5ms (Canvas 2D fill + texture
  upload). Acceptable for interactive use; not suitable for per-frame animation.
- `OffscreenCanvas` fallback needed for older browsers: create a hidden `<canvas>`
  element off-DOM.

**Rejected alternatives:**
- *GPU SDF generation via Jump Flood Algorithm:* Higher quality edges but
  significant implementation complexity (seed encoding, 9+ ping-pong passes,
  half-float FBOs). Overkill for v1 where binary mask + linear filtering is
  sufficient. Can be added later as an opt-in upgrade.
- *SVG path parsing + analytical distance:* Requires a path parsing library,
  Bezier distance computation per fragment, scales poorly with path complexity.
- *Adding sampler to existing applyMaskShader:* Would require binding a dummy
  texture for analytical shapes. Separate program is cleaner.
- *Modified pressure/divergence shaders (Neumann boundary):* More accurate
  boundary physics but requires modifying 3 additional shaders. The existing
  mask-penalisation approach (ADR-0018) works well enough at sim resolution 128.
  Can be added later for quality-sensitive applications.
