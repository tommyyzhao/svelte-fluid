# ADR-0061: Optional features own framebuffers only while active

## Status

Accepted (2026-07-11)

## Context

Bloom and sunrays framebuffers were allocated for every engine even when their
features were disabled. Glass and flow scalar storage were already conditional,
but optional ownership did not follow one consistent transition rule. The eager
post-process buffers increased startup allocation, memory, context pressure, and
resize churn for baseline and model-lab comparisons.

## Decision

Treat bloom, sunrays, glass, and flow scalar framebuffer groups as nullable
owners synchronized from resolved config. Disabled-to-disabled transitions are
no-ops; enable allocates a fresh derived group before its display keyword is
used; disable disposes and nulls the group; re-enable allocates fresh resources.
Resolution and iteration changes while disabled allocate nothing.

Bloom and sunrays construct replacement groups in local candidates and publish
them only after complete allocation, cleaning partial candidates on failure.
Render paths assert the config/resource invariant instead of silently sampling
an absent or stale texture. Persistent dye, scalar, and velocity ownership is
unchanged; optional post-process buffers are derived and never preserved.

## Consequences

- All-effects-off engines own zero bloom, sunrays, glass, or scalar FBOs.
- Feature toggles reduce memory immediately and re-enable without stale samples.
- Resize and context restore synchronize only active optional groups.
- Dithering texture and optional shader compilation remain separate ownership
  work; this decision concerns framebuffer groups only.
