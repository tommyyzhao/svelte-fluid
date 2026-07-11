# ADR-0058: Resize the engine in place and preserve persistent fields

## Status

Accepted (2026-07-11)

## Context

The Svelte wrapper historically disposed the engine immediately on every
ResizeObserver event and rebuilt it after a 150 ms debounce. A drag therefore
blanked the canvas, discarded live fluid state, recompiled all shaders, and
churned the WebGL context even though most resource sizes are determined by
configured grid resolution and aspect ratio rather than canvas pixel count.

## Decision

Add an internal `FluidEngine.resize(width, height)` transition. Exact-size
requests are no-ops. Same-aspect scale changes retain simulation, dye, scalar,
mask, and post-process resources and rebuild only canvas-sized presentation
resources. Aspect changes resample persistent dye/scalar and velocity fields,
recreate transient solver and post-process targets, and rebuild aspect-derived
masks and solid fields without compiling or linking programs.

When the WebGL context is lost, resizing updates only the canvas dimensions;
the existing restore path reconstructs every GL resource against the retained
size. Resize work is a first-class profiler lifecycle phase.

## Consequences

- Continuous layout changes can preserve visible state and shader programs.
- Aspect changes still require bounded framebuffer churn and field resampling.
- Pressure and other transient solver targets intentionally restart after an
  aspect change; velocity and transported material remain continuous.
- The method is engine-internal until a later API decision; component adoption
  and DPR policy are separate stories.
