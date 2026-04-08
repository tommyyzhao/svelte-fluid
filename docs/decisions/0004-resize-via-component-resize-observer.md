# ADR 0004: Resize handled by component ResizeObserver, not engine

**Status:** Accepted
**Date:** 2026-04-06

## Context

The original `script.js` checks `canvas.clientWidth/clientHeight`
inside `update()` *every frame*. If they changed, it calls
`initFramebuffers()` mid-loop. This works fine for a single fullscreen
canvas but is wrong for a library:

- Multiple per-frame DOM reads (one per instance) when the layout
  hasn't changed
- The engine takes responsibility for layout, which couples it to the
  DOM
- Mid-loop FBO recreation is a footgun for hot-update logic
- Doesn't fit the "deterministic re-seed on resize" model

## Decision

- Remove the `resizeCanvas()` call from `FluidEngine.update()` entirely.
- The Svelte component owns sizing:
  1. A wrapper `<div>` carries either `width:100%/height:100%` or the
     explicit `width`/`height` props as inline style.
  2. A `ResizeObserver` watches the wrapper.
  3. On size change: write `canvas.width = cssW * dpr`,
     `canvas.height = cssH * dpr`, then `engine.dispose()` followed by
     `new FluidEngine(...)` with the same `stableSeed`.
- The engine reads `canvas.width`/`canvas.height` once at construction
  and never re-checks.
- The RO callback debounces no-op events (`if (w === cssW && h === cssH) continue`)
  so animated parents don't trigger a teardown storm.

## Consequences

**Positive:**
- Single source of truth for sizing: the component.
- The hot loop is shorter (no DOM read per frame).
- Resize naturally produces deterministic re-seeding because the
  rebuild path is the same as the construct path.
- The engine becomes trivially mockable for tests — just construct it
  with a canvas of any size.

**Negative:**
- Resizing destroys the in-progress simulation. The dye and velocity
  fields are gone; only the deterministic initial splats reappear.
  This is acceptable per the user requirement and arguably preferable
  ("predictable resize behavior").
- A user JS-animating the container width would teardown+rebuild on
  every animation frame. Documented as "don't do that"; could be
  mitigated with a `resizeDebounce` prop later if it becomes a real
  problem.

**Rejected alternatives:**
- *In-place FBO resize (preserve state):* Considered. The
  `resizeFBO` helper actually copies dye contents into the new
  texture, so it's technically possible. Rejected because:
  - The user explicitly asked for "reinstantiate with initial random
    splat conditions" — preserving state contradicts that.
  - The aspect ratio of the velocity/dye fields is encoded in their
    pixel ratio; copying across resolutions produces stretched fluid
    that looks worse than a clean reset.
  - The "deterministic seed" feature only works if every resize takes
    the same code path the initial mount does.
- *Per-frame canvas size polling (the original approach):* Slightly
  cheaper than ResizeObserver in absolute terms but couples the
  engine to layout and breaks "DOM-free engine" testability.
