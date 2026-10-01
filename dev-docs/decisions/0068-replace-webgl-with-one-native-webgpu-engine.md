# ADR 0068: Replace WebGL with one native WebGPU engine

**Status:** Accepted
**Date:** 2026-09-02

## Context

The production WebGL engine accumulated per-canvas contexts, backend-specific
fallback behavior, shader variants, and lifecycle machinery. The WebGPU R&D slice
showed close short-horizon simulation behavior and higher demanding-workload
throughput on the tested Chrome/Metal system. vGPU was valuable for exploration,
but production use would add a runtime dependency without solving this library's
instance-level resource ownership needs.

A dual backend would double the most failure-prone code, make public behavior the
intersection of two APIs, and preserve WebGL indefinitely. Exact long-horizon
pixels are also the wrong parity test for a chaotic solver.

## Decision

Ship one native WebGPU engine and delete the WebGL implementation, runtime
selector, vGPU lab/dependency, and duplicated comparison routes.

- `FluidEngine` is an asynchronous, GPU-neutral controller; native GPU types stay
  below `engine/webgpu/` and do not leak into package declarations.
- All instances lease one shared device and exact-source module/pipeline cache.
  Simulation fields, masks, uniforms, bind groups, and input remain per instance.
- One always-mask-capable WGSL graph serves all scenes. Unshaped scenes bind a 1×1
  all-fluid mask. We reject a mask/no-mask specialization because its extra cold
  graph and asynchronous hot-config transition cost more correctness complexity
  than the identity sample justifies.
- Structural resource changes are prepared off-side and memory-preflighted.
  Synchronous failures retain the old graph; late WebGPU validation/OOM failures
  are scoped and fail only that instance closed because the public update API is
  synchronous. Resize preserves live fields and does not rebuild when computed
  extents stay the same. Device loss reconstructs every affected controller on the
  next generation.
- Unsupported/software-only environments use the existing accessible
  fallback/poster policy. There is no hidden WebGL backend.
- Numerical parity means finite/liveness checks, short-horizon field envelopes,
  and long-horizon aggregate/visual agreement—not pixel identity.
- Presentation preserves public intent rather than old pass topology. Glass is a
  single-pass, fluid-gated refraction/highlight model instead of a canvas-sized
  scene FBO. `pressureIterations: 0` genuinely disables projection;
  `pressure` controls first-iteration warm-start retention.

## Consequences

- The package keeps zero runtime dependencies and has one solver, lifecycle, and
  coordinate model to maintain.
- A page uses one shared GPU device instead of consuming one WebGL context per
  component. Optional per-instance targets still consume GPU memory, so `lazy` and
  `autoPause` remain useful.
- Initial construction is asynchronous. `<Fluid>` and wrappers gate ready-time
  animations; direct callers may await `engine.ready` or use `FluidEngine.create`.
- Public prescribed grids remain y-up and bottom-row-first; upload reverses rows at
  the WebGPU boundary.
- Browser support is capability based: adapter acquisition is the gate. Browsers
  without usable WebGPU receive fallback UI and are not supported by a slower
  simulation backend.
- Historical WebGL ADRs and learnings remain as history. Current architecture,
  API, contributor, and generated agent docs must describe WebGPU only.
