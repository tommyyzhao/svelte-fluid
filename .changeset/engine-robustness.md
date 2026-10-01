---
"svelte-fluid": minor
---

Engine robustness:

- `randomSplats(count)` is bounded: at most 64 random splats are retained and
  16 run per frame, so large or repeated requests spread over a few frames
  instead of stalling one. `initialSplatCount*` clamp to 0–64 and
  `autoSplatCount` to 0–16.
- `splat()` calls with `NaN`/`Infinity` arguments, and non-finite numeric or
  color props, are ignored with a single `console.warn` instead of corrupting
  the simulation. Previous prop values are kept.
- All Fluid instances on a page now share one `requestAnimationFrame`. If one
  instance throws during a frame it is stopped (`isPaused` becomes `true`,
  one `console.error`) while other instances keep rendering.
- Sticky-mask `blur` is now O(pixels) with at most three passes and a radius
  cap of 64. Radii up to 6 (including FluidStick's default) produce identical
  masks; larger radii are visually equivalent and no longer freeze the page.
- Flow sources with `rate: 0` or zero payload, zero-vector or zero-strength
  forces, and empty prescribed grids no longer keep an otherwise empty scene's
  solver awake.
- `FBO`, `DoubleFBO`, `ExtInfo` and `ResolvedConfig` type exports are
  deprecated; they will be removed from the public API in 1.0.
