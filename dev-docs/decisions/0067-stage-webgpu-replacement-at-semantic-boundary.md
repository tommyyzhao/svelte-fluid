# ADR-0067: Stage WebGPU replacement at the semantic runtime boundary

## Status

Superseded by ADR-0068 (2026-09-02)

## Context

The route-local WebGPU/vGPU lab now reproduces the core solver closely enough to
distinguish implementation drift from expected chaotic divergence, and it shows a
meaningful advantage on some demanding workloads. It does not yet cover the
production engine's masks, flow scenes, special presentation modes, lifecycle, or
full browser/adapter matrix.

Mirroring `FluidEngine` behind a generic texture/program/framebuffer abstraction
would preserve WebGL's accidental structure, add a permanent second engine, and
prevent WebGPU-native resource and pass decisions. Shipping the lab directly would
also violate the current zero-runtime-dependency invariant and inherit vGPU 0.3.1's
GPU-scoped Effect/value-uniform lifetime.

## Decision

The end state is one WebGPU engine and no production WebGL path.

Migration happens through a narrow, temporary runtime port at the `Fluid.svelte`
boundary: construction, resize, hot configuration, disposal, splats, pause/resume,
paused state, performance state, and typed failure. GPU objects and pass concepts
are not part of that port. Shared code is limited to semantic inputs and pure
policies such as config, RNG/event tapes, pointer math, CPU mask rasterization,
timing/governor logic, scenes, and reducers.

The runtime port is introduced only with a production-owned WebGPU vertical slice,
so it cannot become an unused speculative layer. Backend selection remains internal
during qualification. After a short default/rollback window, WebGL and the port's
selection branch are deleted; WebGPU absence uses the existing accessible static
fallback model rather than a permanent WebGL fallback.

The production substrate starts with a measured native-WebGPU versus vGPU spike.
Native WebGPU is the default recommendation because it gives exact resource
ownership and preserves zero runtime dependencies. vGPU remains the laboratory and
WGSL validation tool unless it proves per-instance disposal, acceptable packed
size/dependency ownership, and lower total implementation cost in the vertical
slice.

## Consequences

- WebGPU can use a shared device and its own resource/pass graph instead of copying
  WebGL context and framebuffer architecture.
- Numerical and visual acceptance tests, not code-shape equivalence, define parity.
- There is no public `backend` prop to support forever.
- The temporary period has two implementations and therefore requires strict phase
  gates and named deletion targets.
- Complete replacement raises the runtime support floor to the project's measured
  WebGPU browser matrix; unsupported environments receive fallback/poster UI.
- The executable capability/config map lives at `/examples/webgpu/replacement` and
  fails tests when a `FluidConfig` field is unmapped.
