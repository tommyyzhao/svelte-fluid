# ADR-0083: Pointer Events input, capture, and deliberate touch-action

## Status

Accepted (2026-10-02)

## Context

The engine listened to `mouse*` and `touch*` events. Pen worked only through
compatibility mouse events, a drag that left the canvas stopped splatting, and
`Fluid.svelte` set `touch-action: none` on every canvas, so a decorative or
`pointerInput={false}` canvas still blocked page scrolling on touch.
`FluidBackground` patched this with `pan-y !important`.

## Decision

- **Events.** `pointerdown`/`pointermove` on the target (canvas or window),
  `pointerup`/`pointercancel` on `window`, `pointerleave` on the canvas.
- **Slots.** Mouse and pen share slot 0 (hover, glass light). Each touch
  `pointerId` takes the lowest free slot 1..10 (`PointerSlots`); further touches
  are ignored. Slots are released on up/cancel.
- **Capture.** On `pointerdown` with a canvas target the engine calls
  `setPointerCapture`, so a drag that leaves the canvas keeps splatting until
  release. Window target needs none. Capture is released on listener removal.
- **Coalescing.** `getCoalescedEvents()` supplies intermediate samples. At most
  16 are read per event (evenly thinned, endpoints kept) and at most 16 stroke
  segments are queued per pointer per frame; extra samples merge into the last
  (position replaced, delta summed), so force is conserved and work is bounded
  (ADR 0079). Non-finite coordinates are dropped; finite ones are clamped to
  0.5 canvas sizes beyond each edge.
- **Pressure.** Pen only: splat force scales 0.5x-1.5x with `pressure`
  (`0.5 + pressure`; the default pen pressure 0.5 is neutral). Mouse and touch
  pressure is ignored (constant or unreliable). Radius is unchanged.
- **Hover.** `splatOnHover` applies to mouse and pen with no button pressed,
  never touch.
- **touch-action.** Set by the engine, inline on the canvas, to `none` only
  while the canvas owns pointer input (`pointerInput` true and
  `pointerTarget: 'canvas'`); the previous inline value is restored otherwise.
  Decorative canvases (`pointerInput={false}`, the `FluidReveal`/`FluidDistortion`
  default) and window-target instances (`FluidBackground`) leave touch scrolling
  alone. The static CSS rule and the `FluidBackground` override are removed.
  No new prop; a consumer's own `touch-action` is overridden while the canvas
  owns input.

## Consequences

- Pen, multi-touch and out-of-canvas drags work; fast strokes are smooth.
- Touch scrolling is no longer blocked on non-interactive canvases
  (behaviour change, minor release).
- Window-target touch no longer needs `preventDefault` games: scroll is
  never blocked, and a scroll gesture cancels the pointer (`pointercancel`).
- A touch drag on an interactive canvas still cannot scroll the page; consumers
  wanting scroll should use `pointerTarget="window"` or `pointerInput={false}`.
