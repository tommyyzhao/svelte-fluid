# ADR 0026: FluidBackground component with DOM exclusion zones

**Status:** Accepted
**Date:** 2026-04-21

## Context

Users want a full-viewport fluid canvas as a page background, where the fluid
physically cannot enter regions occupied by DOM elements (cards, sidebars, etc.).
A naive overlay approach (fluid behind, content on top) would let the fluid
visually collide with opaque UI elements. The simulation must respect the
geometry of arbitrary DOM elements at runtime, including during scroll and
resize.

## Decision

### Approach: evenodd SVG path mask via existing `svgPath` container shape

Rather than modifying the engine, reuse the `containerShape: 'svgPath'` pipeline
(ADR-0024) with a dynamically generated path:

1. **Outer rect** covers the full viewport: `M0,0 H{vw} V{vh} H0 Z`
2. **Inner rounded-rect holes** are generated for each excluded DOM element,
   measured via `getBoundingClientRect()`
3. **`fillRule: 'evenodd'`** makes the inner rects subtract from the outer rect
4. The path is passed as `containerShape` — the engine rasterizes it to a mask
   texture and applies it during physics (velocity + dye zeroing) per step

This requires **zero engine changes**. The coordinate mapping works because:
- The `viewBox` is set to `[0, 0, innerWidth, innerHeight]`, matching viewport
  CSS pixels
- `getBoundingClientRect()` returns viewport-relative CSS pixel coordinates
- The engine maps viewBox → mask canvas with uniform scaling; when viewBox aspect
  matches canvas aspect, the mapping is 1:1 with no margins
- The mask shader's Y-flip (`1.0 - vUv.y`) corrects for the DOM top-to-bottom
  vs. GL bottom-to-top coordinate difference

### Component: `<FluidBackground>`

A new library component (`src/lib/FluidBackground.svelte`) encapsulates:

- A `position: fixed` full-viewport `<Fluid>` canvas at `z-index: 0`
- A `position: relative; z-index: 1; pointer-events: none` content slot
- Automatic exclusion zone tracking via a CSS `exclude` selector prop
- Throttled mask rebuilds on scroll, resize, and DOM mutation

**API:**
```svelte
<FluidBackground exclude=".card" splatOnHover curl={50}>
  <div class="card" style="pointer-events: auto;">...</div>
</FluidBackground>
```

**Props:** `exclude` (CSS selector), `excludeRadius` (border-radius, default 16),
`excludePad` (gutter in px, default 4), plus all `FluidConfig` props with
background-optimized defaults (`simResolution: 64`, `dyeResolution: 512`,
`initialSplatCount: 0`, etc.).

### Mask update strategy

- **Scroll + resize:** `window` event listeners trigger mask rebuild
- **DOM changes:** `MutationObserver` on the content container (`childList: true,
  subtree: true`) detects element additions/removals
- **Throttling:** setTimeout with 80 ms minimum interval; at most 12.5 rebuilds/sec
- **Skip unchanged:** string comparison of generated SVG path (`prevD === d`)
  prevents unnecessary `initMaskTexture()` calls

### Pointer events

The content layer has `pointer-events: none`. Excluded elements must set
`pointer-events: auto` to remain interactive. This allows:
- Cursor over fluid gaps → canvas receives events → `splatOnHover` works
- Cursor over excluded elements → elements intercept events → no splats
- Touch scrolling → canvas has `touch-action: pan-y` override

## Performance

| Operation | Cost | Notes |
|-----------|------|-------|
| Mask rasterization | ~1 ms | Canvas2D Path2D + getImageData at 512px |
| GPU texture upload | ~0.5 ms | Single-channel R8 texture |
| Per-frame mask application | ~0 extra | Same as any other container shape |
| Total per rebuild | ~1.5 ms | Throttled to max 12.5/sec |

Background-optimized defaults reduce GPU load vs. a standard `<Fluid>`:
- `simResolution: 64` (vs. 128) — 4x less physics computation
- `dyeResolution: 512` (vs. 1024) — 4x less dye texture work
- `pressureIterations: 6` (vs. 20) — 3.3x less Jacobi solver work
- `bloomIterations: 4` (vs. 8) — half the bloom mip-chain
- Single WebGL context for the entire page (vs. N contexts for N instances)

## Alternatives considered

1. **Multiple analytical shapes (new engine feature):** Would require a new
   multi-rect container shape type, SDF union in GLSL, and TypeScript mirror.
   More engine complexity for marginal perf gain — the svgPath mask is already
   fast enough.

2. **CSS clip-path on the canvas:** Only clips the rendered output; does not
   enforce physics boundaries. Fluid would still flow through card regions and
   appear clipped, rather than pooling around them.

3. **Multiple small Fluid instances in the gaps:** Impractical — dynamic number
   of irregular-shaped canvases, each requiring its own WebGL context.

## Consequences

- New library export: `FluidBackground` + `FluidBackgroundProps`
- No engine changes required
- Consumers must set `pointer-events: auto` on interactive excluded elements
- Mask rebuild cost is proportional to the number of excluded elements (one
  `getBoundingClientRect` + one `rrPath` per element)
- `maskResolution: 512` means card edges are soft at ~2 CSS px on a 1920px
  viewport; sufficient for rounded-corner cards with `backdrop-filter: blur`
