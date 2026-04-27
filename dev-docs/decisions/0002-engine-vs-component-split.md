# ADR 0002: Framework-agnostic engine class + thin Svelte component

**Status:** Accepted
**Date:** 2026-04-06

## Context

The original `WebGL-Fluid-Simulation/script.js` is 1645 lines of
top-level globals. We need to expose it as a Svelte 5 component but
also want:

- Multiple instances on a page (no shared state)
- Testability without a Svelte runtime
- Clean lifecycle (construct/dispose) for resize handling
- The option of wrapping the same engine with React or Vue later

## Decision

Split into two layers:

1. **`src/lib/engine/FluidEngine.ts`** — a pure TypeScript class. Owns
   `gl`, framebuffers, programs, RNG, pointer state, and the RAF loop.
   Knows nothing about Svelte. Constructed with
   `new FluidEngine({ canvas, config? })`. Public API:
   `splat`, `randomSplats`, `setConfig`, `dispose`.

2. **`src/lib/Fluid.svelte`** — ~200 LOC Svelte 5 component. Owns the
   wrapper `<div>`, the `<canvas>`, the `ResizeObserver`, the prop
   translation, and the imperative `handle` exposed via `bind:this`.
   Calls into the engine and never touches WebGL itself.

## Consequences

**Positive:**
- The engine can be unit-tested with headless-gl.
- A future React/Vue/Solid wrapper drops in directly above
  `FluidEngine`.
- Clear separation of concerns: DOM/lifecycle bugs land in
  `Fluid.svelte`; GPU bugs land in the engine.
- The engine exposes `setConfig` and `dispose` so it's safely usable
  from non-Svelte code as well.

**Negative:**
- Two layers to keep in sync. Any new prop must be added in
  `FluidConfig`, the resolver, and (usually) the engine's hot-update
  bucket logic.
- Slightly more boilerplate than collapsing everything into one
  component.

**Rejected alternatives:**
- *Single Svelte component holding all WebGL state:* Worked for the
  Svelte 3 port (`./svelte-webgl-fluid-simulation/`) but had a memory
  leak from missing `onDestroy`, "hackish" `actions` prop, and
  couldn't be tested in isolation.
- *Functional API (no class):* Considered briefly. Classes win here
  because the relationships between fields are tight (every method
  pokes ~5 framebuffers and 3 programs) and OO scoping is the most
  natural fit.
