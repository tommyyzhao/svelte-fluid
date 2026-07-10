# ADR-0048: Public construct-only advectionScheme config

## Status

Accepted (2026-07-03)

## Context

ADR-0046 shipped velocity-only MacCormack advection as an `@internal`
`FluidEngineOptions.advectionScheme` switch for benches and browser readback tests.
That avoided a premature public surface while the MacCormack churn regression still
lacked a cheap automated net.

The grid-scale-energy browser test now covers that regression class, and the backlog
needs a public way to opt into MacCormack before any preset retune work. The API must
not change default visuals or let runtime prop updates flip a compile-time solver
choice under an existing engine.

## Decision

Promote `advectionScheme?: 'semilagrangian' | 'maccormack'` to public
`FluidConfig`, with default `'semilagrangian'`.

The field is Bucket D: it is resolved at construction and ignored by `setConfig()`.
`compileShaders()` reads the resolved `ADVECTION_SCHEME` and still capability-gates
MacCormack off when hardware linear filtering is unavailable. The existing internal
`FluidEngineOptions.advectionScheme` path remains as a bench/test override so the
readback harness can A/B schemes without mutating shared scene config.

Document the field as velocity-only and aimed at flow/structured scenes; diffuse
decorative dye can look angular or cubey with MacCormack, and dye/scalar advection
remain semi-Lagrangian.

No preset opts in as part of this decision.

## Consequences

- Default output stays unchanged: every preset still resolves to `'semilagrangian'`.
- `<Fluid advectionScheme="maccormack">` reaches engine construction through the
  normal `FluidConfig` path and is included in the published declarations.
- Runtime prop changes cannot flip the scheme, avoiding surprise shader-path changes
  and preserving the visual-QA boundary for later preset retunes.
- The public field is now semver surface; future retunes must decide per preset rather
  than changing the default.
