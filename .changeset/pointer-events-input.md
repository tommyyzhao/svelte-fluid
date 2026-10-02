---
"svelte-fluid": minor
---

Pointer Events input (ADR 0083).

- The engine uses Pointer Events instead of mouse/touch events: pen works
  natively, each touch is tracked per `pointerId`, and fast strokes use
  coalesced events (bounded per frame).
- A drag that starts on the canvas keeps splatting after leaving it, until
  release (pointer capture).
- Pen pressure modestly scales splat force (0.5x-1.5x); mouse/touch unchanged.
  `splatOnHover` works for mouse and pen, never touch.
- **Behaviour change:** `touch-action: none` is no longer set by the component
  stylesheet. The engine applies it only while the canvas owns pointer input
  (`pointerInput` true and `pointerTarget: 'canvas'`). Decorative canvases
  (`pointerInput={false}`) and window-target instances such as
  `FluidBackground` no longer block touch scrolling. Set your own
  `touch-action` if you need different behaviour on an interactive canvas.
