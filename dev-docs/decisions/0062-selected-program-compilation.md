# ADR 0062: Compile only selected engine programs

**Status:** Accepted  
**Date:** 2026-07-11

## Context

`FluidEngine` previously compiled and linked every fragment program during construction,
including MacCormack advection, bloom, sunrays, glass, and all declarative-flow paths when
their features were disabled. Dense pages paid this startup cost for programs that might
never execute. Deferring compilation until the first draw would improve startup but move an
unpredictable stall into visible interaction.

## Decision

Construction and context restoration compile a capability- and configuration-selected
program set:

- the core solver, display, copy, and imperative-splat programs remain eager;
- MacCormack is selected only when the construct-only scheme and filtering capability permit
  it;
- bloom, sunrays, and their shared blur program follow their effective feature flags;
- glass requires both glass mode and a container shape;
- source, outlet, force, prescribed-grid, and prescribed-mask programs follow the exact flow
  operations that can execute.

Runtime feature activation synchronously prewarms missing programs during `setConfig()`,
before committing the new configuration or transitioning its resources. Programs remain
cached for the lifetime of the context, so disable/re-enable does not recompile them.
Display-material keyword variants use the same rule: a variant is prepared first and
activated only after the configuration transition succeeds.

Compile and link failures continue to throw per ADR 0008. A failed candidate shader/program
is deleted, while the prior configuration, resources, and active display material remain
usable. Context loss clears optional handle caches; restoration rebuilds only the set selected
by the current effective configuration.

No render, solver, or input path compiles a shader. The legacy checkerboard program had no
call site and is no longer compiled or linked; transparent output continues to use the
existing clear-and-composite path.

## Consequences

- Baseline construction performs materially fewer compile/link operations and retains fewer
  programs.
- The first explicit feature transition may synchronously take compile time, but the following
  draw cannot encounter a compilation stall.
- Optional program fields are nullable by design; feature guards and prewarm invariants must
  stay aligned when new model modes are added.
- Context-restore tests must assert selection as well as liveness, because retaining a stale
  JavaScript handle would otherwise hide an invalid WebGL object.
