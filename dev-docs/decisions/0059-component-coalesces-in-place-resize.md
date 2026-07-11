# ADR-0059: The component coalesces in-place resize transitions

## Status

Accepted (2026-07-11; supersedes ADR-0004's teardown-on-resize decision)

## Context

ADR-0004 correctly assigned layout observation to the Svelte component, but its
teardown/reconstruction policy blanked active canvases, discarded state, and
recompiled shaders throughout continuous layout changes. ADR-0058 introduced a
state-preserving engine transition, so the component can retain layout ownership
without retaining the destructive policy.

## Decision

Keep `ResizeObserver` in `Fluid.svelte` and coalesce nonzero observations to one
`requestAnimationFrame` callback. The callback computes physical canvas pixels,
calls `FluidEngine.resize`, then applies the same size-adaptive config policy as
construction. No debounce or teardown occurs during a successful resize.

Zero-sized containers and deliberate `lazy` scroll-out continue to dispose the
engine. If an in-place transition throws, dispose the uncertain resource set and
attempt the established constructor path exactly once rather than retrying the
resize recursively.

## Consequences

- Animated and dragged layouts remain nonblank and preserve live fields.
- Resize bursts cause at most one transition per presented frame.
- Lazy context-slot release, zero-size races, and permanent WebGL fallback keep
  their previous behavior.
- The component remains the sole reader of layout and DPR; the engine remains
  free of `ResizeObserver` and DOM layout reads.
