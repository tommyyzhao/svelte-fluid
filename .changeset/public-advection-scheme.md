---
"svelte-fluid": minor
---

Public `advectionScheme` config field.

Promotes the previously-internal MacCormack velocity advection switch to a
public, hot-updatable `FluidConfig` field:
`advectionScheme?: 'semilagrangian' | 'maccormack'` (default `'semilagrangian'`).
`'maccormack'` gives crisper second-order velocity advection for flow/structured
scenes, but can look angular or "cubey" on diffuse decorative dye, so it is
opt-in and unset by every built-in preset. Both native WebGPU pipelines are
prepared during startup, so `setConfig()` can switch schemes without clearing
fields or compiling at interaction time.

No built-in preset changes behavior: every preset still resolves to
`'semilagrangian'`, confirmed by a registry invariant test.

Near physical solids and open edges, MacCormack now conservatively falls back
to first-order advection whenever either departure path or its limiter stencil
could cross a blocked cell. This prevents the correction pass from increasing
thin-wall leakage relative to semi-Lagrangian advection.
