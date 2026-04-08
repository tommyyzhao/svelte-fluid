# ADR 0009: Pointer coordinates via `getBoundingClientRect`

**Status:** Accepted
**Date:** 2026-04-06

## Context

The original `script.js` reads pointer coordinates two different ways:

- Mouse handlers (lines 1465–1477) use `e.offsetX` / `e.offsetY`.
- Touch handlers (lines 1491–1504) use `touches[i].pageX` / `pageY`.

Both work fine for the original because the canvas is a fullscreen
fixed-position element, so all four coordinate spaces (offset, page,
client, screen) coincide.

In a library where the canvas can live anywhere — inside scrolled
containers, with CSS transforms, beside other content — both choices
break:

- `offsetX` is well-defined only when the canvas itself is the event
  target. Once `pointer-events: none` overlays or transformed parents
  enter the picture, it lies.
- `pageX` measures from the document origin. Inside a scrolled
  container that's not the document, it lands somewhere else than
  the user actually tapped.

The previous Svelte 3 port (`./svelte-webgl-fluid-simulation/`)
inherited the `pageX` bug verbatim from the original.

## Decision

Both mouse and touch handlers in `FluidEngine` go through a single
helper:

```ts
private getCanvasOffset(clientX: number, clientY: number) {
  const rect = this.canvas.getBoundingClientRect();
  return {
    x: scaleByPixelRatio(clientX - rect.left),
    y: scaleByPixelRatio(clientY - rect.top)
  };
}
```

`clientX` / `clientY` are viewport-relative; subtracting the canvas's
viewport-relative bounding rect gives canvas-local coordinates that
work regardless of scroll position, parent transforms, or DOM nesting.

## Consequences

**Positive:**
- Works correctly for any canvas placement: in a scrolled `<main>`,
  inside a `display: grid` cell, with `transform: scale(0.8)`,
  inside a flexbox card, anywhere.
- Mouse and touch share the same code path — fewer bugs.
- DPR scaling is applied at the same place for both input types.

**Negative:**
- One extra function call per pointer event (negligible).
- `getBoundingClientRect()` triggers layout if the DOM is dirty.
  Mitigated by only calling it inside event handlers, which fire
  after layout has already happened.

**Rejected alternatives:**
- *Match the original (`offsetX` for mouse, `pageX` for touch):*
  Inherits the broken-in-scrolled-container bug from the upstream
  Svelte 3 port. No.
- *Use Pointer Events API instead of Mouse + Touch:* Cleaner in
  modern browsers but the original splits into two pointer arrays
  (`pointers[0]` is the mouse, `pointers[1..]` are touches). The
  port follows the same convention to keep the diff against the
  original small.
