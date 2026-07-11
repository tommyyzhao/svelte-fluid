---
"svelte-fluid": minor
---

Public `advectionScheme` config field.

Promotes the previously-internal MacCormack velocity advection switch to a
public, construct-only `FluidConfig` field:
`advectionScheme?: 'semilagrangian' | 'maccormack'` (default `'semilagrangian'`).
`'maccormack'` gives crisper second-order velocity advection for flow/structured
scenes, but can look angular or "cubey" on diffuse decorative dye, so it is
opt-in and unset by every built-in preset. Devices without linear-filtering
support are capability-gated back to `'semilagrangian'` automatically. This is
a construct-only (Bucket D) field — `setConfig()` ignores runtime changes to it.

No built-in preset changes behavior: every preset still resolves to
`'semilagrangian'`, confirmed by a registry invariant test.

Near physical solids and open edges, MacCormack now conservatively falls back
to first-order advection whenever either departure path or its limiter stencil
could cross a blocked cell. This prevents the correction pass from increasing
thin-wall leakage relative to semi-Lagrangian advection.
