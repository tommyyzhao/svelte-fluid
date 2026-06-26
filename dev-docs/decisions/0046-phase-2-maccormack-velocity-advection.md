# ADR 0046: Opt-in velocity-only MacCormack advection (Epic 0001 Phase 2)

## Status

In-task

## Context

Semi-Lagrangian (SL) advection with bilinear sampling is unconditionally stable
but heavily diffusive: it smears small-scale vorticity, so dipoles and shear
layers lose structure faster than the configured dissipation alone would cause.
Epic 0001 Phase 2 wants a higher-order option that preserves more structure,
without changing any existing behavior or public surface, and without a visual-QA
pass on the 14 presets.

Constraints carried from the architecture invariants and the epic:

- The shared `advectionShader` SL path (used by dye, scalar, and SL velocity)
  must stay byte-identical so default output never changes.
- No new public `FluidConfig` field; no new runtime dependency.
- The no-linear-filtering path (manual bilerp) is too expensive for a two-pass
  scheme, so it must be excluded — decided once at construction like
  `MANUAL_FILTERING`.

## Decision

Add **opt-in, velocity-only MacCormack advection** behind an `@internal`
constructor option `advectionScheme?: 'semilagrangian' | 'maccormack'` on
`FluidEngineOptions` (default `'semilagrangian'`, stripped from dist types via
`stripInternal`). It is construct-only (Bucket-D-like; no `setConfig` handling)
and capability-gated: `useMacCormack = advectionScheme === 'maccormack' &&
ext.supportLinearFiltering`, recomputed in `compileShaders` so a context restore
re-derives it.

When enabled, `advectVelocity` runs two passes (dye/scalar are untouched):

1. **Forward** — the shared `advectionProgram` SL-advects velocity into the
   `velocitySource` scratch FBO with dissipation / sticky / mask all neutralized,
   yielding the raw `phi_hat`. `velocitySource` is borrowed transiently;
   `applyViscosity` repopulates it after advection (advect precedes viscosity in
   `step()`), so the reuse is safe.
2. **Correct** — a new dedicated `advectionMacCormackShader` /
   `advectionMacCormackProgram` reads `phi^n` (`velocity.read`) and `phi_hat`
   (`velocitySource`), forms `phi_hat + 0.5*(phi^n - phi_bar)`, applies the
   Selle 2008 limiter (clamp to the four-texel `phi^n` bilinear-stencil range),
   and falls back to first-order `phi_hat` near solids (`inlineMaskValue < 0.5`)
   and within two texels of an open boundary (`uOpenEdges`, same convention as
   `divergenceShader`). It then applies the *same* dissipation / sticky /
   inline-mask compositing and ±1000 clamp as the SL velocity branch, so
   MacCormack-on vs SL is apples-to-apples. Velocity is swapped after pass B.

The MacCormack shader assumes hardware bilinear for `uVelocity` (a LINEAR FBO);
`velocitySource` is NEAREST scratch, so the one off-grid reverse sample is
reconstructed with an in-shader `bilerp`, leaving the shared FBO config untouched.

## Consequences

- **Easier:** structure-preserving velocity advection is available to
  benches/harnesses today and to a future public toggle later, with the SL path
  provably unchanged (a browser test asserts the default run is byte-identical to
  explicit `'semilagrangian'`).
- **Cost:** velocity advection becomes two passes plus a dedicated program when
  enabled; on no-linear-filtering hardware it silently stays SL.
- **Rejected:** adding a MACCORMACK `#ifdef` to the shared `advectionShader`
  (would risk perturbing the dye/scalar path) and a public config field (premature
  surface area, and would force preset visual-QA). Both deferred.

## Acceptance

- `maccormack-dipole.browser.test.ts`: free-decay dipole at simResolution 128,
  MacCormack vs SL. Measured late/early retention — peak velocity
  mac=0.61 vs sl=0.47, field energy mac=0.62 vs sl=0.57 — MacCormack retains
  materially more, and the default (no option) run is byte-identical to SL.
- `maccormack-soak.browser.test.ts`: 600 high-force steps with open boundaries
  stay finite (no NaN/Inf).
- `maccormack.test.ts` (node): SL `#else` branch byte-identical; default scheme
  is semi-Lagrangian; the gate forces SL without linear filtering.
