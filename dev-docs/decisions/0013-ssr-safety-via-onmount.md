# ADR 0013: All WebGL access deferred to `onMount` for SSR safety

**Status:** Accepted
**Date:** 2026-04-06

## Context

SvelteKit renders pages on the server by default. Any code that
touches `window`, `document`, `WebGLRenderingContext`, or
`ResizeObserver` during component initialization will throw on the
server, breaking the entire page render.

The `FluidEngine` constructor:

- Calls `getWebGLContext` (touches the canvas — needs DOM)
- Calls `compileShader` (needs `gl`)
- Schedules a `requestAnimationFrame` (needs `window`)
- Adds `addEventListener` calls (needs DOM)

None of these can run server-side.

## Decision

The Svelte component does *not* construct the engine eagerly. All
construction is deferred to `onMount`:

- `engine: FluidEngine | undefined` declared at script scope
- `instantiate()` is called from inside the `ResizeObserver` callback,
  which is registered inside `onMount`
- `instantiate()` itself guards against missing `canvasEl` (the
  `bind:this` binding only fires after the DOM is real)
- The `$effect` that pipes prop updates checks `if (engine) ...` so
  it's a no-op until the first instantiation completes
- `randomSeed()` calls `Math.random()` at script-root scope. This is
  fine on the server because it's pure (no DOM access), and we want
  the seed to be reproducible across hydration anyway.

The wrapper container `<div>` and inner `<canvas>` *are* rendered on
the server (empty). The browser hydrates them, the `onMount` runs,
the `ResizeObserver` observes the now-real container, and the engine
boots.

## Consequences

**Positive:**
- The component is SSR-safe out of the box. Works under SvelteKit's
  default prerender / SSR / SSG modes with no extra config.
- The HTML emitted from SSR is small (just the empty wrapper) so
  there's no flash of "weird canvas markup".
- `onMount` cleanup function (the returned arrow) handles disposal,
  making the unmount path obvious.

**Negative:**
- The component renders nothing visible until the JS hydrates and
  the first ResizeObserver entry fires. For a brief moment after
  first paint the canvas is blank. Acceptable for a fluid sim
  (which needs a few frames to look like anything anyway).
- A consumer who explicitly wants a placeholder during SSR/hydration
  must wrap `<Fluid />` themselves with their own `<noscript>` or
  loading state.

**Rejected alternatives:**
- *Conditionally guard with `if (typeof window !== 'undefined')`
  inside script root:* Works but is uglier and bypasses Svelte's
  proper lifecycle. `onMount` is the canonical place for browser-only
  side effects.
- *Disable SSR for routes using `<Fluid />`:* Forces consumers to
  configure SSR exclusion at the route level just to use one
  component. Bad UX.
