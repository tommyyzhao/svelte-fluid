# ADR 0027: FluidReveal — fluid as opacity mask

**Status:** Accepted
**Date:** 2026-04-22

## Context

Users want an interactive "scratch-to-reveal" or "fog-of-war" effect where a
fluid simulation acts as an opacity mask over content. Moving the cursor injects
dye, and the dye intensity controls transparency — revealing the content below.
Inspired by the Ascend-Fluid project's display shader inversion technique.

## Decision

### Approach: REVEAL keyword in the display shader

Add a `REVEAL` compile-time keyword to the existing display Material system.
When active, the shader replaces the standard color output with a premultiplied
alpha cover-color output:

```glsl
#ifdef REVEAL
    float revealAmount = clamp(pow(clamp(a * uRevealSensitivity, 0.0, 1.0), uRevealCurve), 0.0, 1.0);
    float coverAlpha = (1.0 - revealAmount) * cmask;
    gl_FragColor = vec4(uRevealCoverColor * coverAlpha, coverAlpha);
#else
    gl_FragColor = vec4(c, a);
#endif
```

Where `a = max(c.r, max(c.g, c.b))` is the dye intensity (computed by the
existing pipeline, including SHADING/BLOOM/SUNRAYS if enabled).

### Alpha compositing

The WebGL context uses `premultipliedAlpha: true` (browser default). The REVEAL
shader outputs premultiplied values: `vec4(cover * coverAlpha, coverAlpha)`.
The browser compositor then blends: `result = canvas + (1 - alpha) * page`.

- `coverAlpha = 1` (no dye): opaque cover color hides content
- `coverAlpha = 0` (lots of dye): fully transparent, content shows through

### render() path

REVEAL gets its own path in `render()`, before the existing transparent/opaque
branches:

```typescript
if (this.config.REVEAL) {
    gl.disable(gl.BLEND);
    this.drawDisplay(target);
    return;
}
```

No backColor fill, no checkerboard, no blending. The full-screen quad from
`drawDisplay` writes every pixel. Glass is incompatible and skipped.

### CONTAINER_MASK interaction

When both REVEAL and CONTAINER_MASK are active, `cmask` controls the cover
boundary:

- Inside shape, dye present: transparent (revealed)
- Inside shape, no dye: opaque cover color
- Outside shape: `cmask = 0` → fully transparent (page shows through)

This makes the container shape define the reveal zone, not cover the entire
canvas outside it. The `cmask` variable is hoisted before the `#ifdef
CONTAINER_MASK` block so it's accessible in the REVEAL block.

### Bucket assignments

- `reveal` → **Bucket B** (keyword recompile)
- `revealCoverColor`, `revealSensitivity`, `revealCurve` → **Bucket A** (hot uniforms, picked up next frame)

### FluidReveal component

A new `<FluidReveal>` Svelte component wraps `<Fluid>` (same pattern as
`FluidBackground`). It adds:

- CSS layering: content at z-index 0, canvas at z-index 1
- Convenience props: `coverColor`, `sensitivity`, `curve`, `fadeBack`, `fadeSpeed`
- Auto-reveal: component-level Lissajous animation using `handle.splat()` calls
- Canvas CSS background automatically set to `transparent` when `reveal` or `transparent` is active (Fluid.svelte inline style override)

Auto-reveal is **not** engine-level. It's a component-level RAF loop that calls
the existing `splat()` API, keeping the engine framework-agnostic.

### Glass incompatibility

Glass post-processing and reveal are incompatible. Glass applies refraction to
the scene FBO, but in reveal mode the scene is a cover-color mask, not a fluid
visualization. When `REVEAL` is true, glass is skipped in the render path.

## Alternatives considered

1. **CSS mix-blend-mode**: Would require the canvas to render dye normally and
   use CSS blending to create transparency. Browser support for complex blend
   modes with WebGL canvases is inconsistent.

2. **Separate mask FBO**: Render dye to a mask texture, then composite in a
   second pass. Adds GPU cost and complexity. The single-pass shader approach
   is simpler and sufficient.

3. **Reuse `transparent` prop**: REVEAL has fundamentally different render path
   requirements (no checkerboard, no backColor, premultiplied cover output).
   Overloading `transparent` would create confusing interactions.
