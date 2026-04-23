# ADR-0028: Multiplicative dissipation for reveal mode

## Status

Accepted

## Context

The FluidReveal component uses FluidEngine's advection shader to dissipate dye over time.
The engine's original dissipation formula is divisor-based:

```glsl
float decay = 1.0 + dissipation * dt;
gl_FragColor = result / decay;
```

The reference implementation (Ascend-Fluid) uses multiplicative dissipation:

```glsl
gl_FragColor = dissipation * result;
```

These produce fundamentally different dye accumulation dynamics. The reference's
multiplicative approach (0.995 density, 0.9 velocity) produces clean, laminar reveals.
The divisor approach required aggressive parameter tuning that never quite matched.

## Decision

Add a `uniform float uMultiplicative` to the advection shader. When `REVEAL` mode is
active, the engine sets this to 1.0, switching to `dissipation * result`. Non-reveal
instances use the original divisor formula (uMultiplicative = 0.0).

Additionally:
- Skip curl/vorticity compute passes when `CURL === 0` (saves 2 draw calls/frame)
- FluidReveal defaults updated to match reference: `velocityDissipation: 0.9`,
  `densityDissipation: 0.995` (fadeBack) / `1.0` (permanent), `sensitivity: 0.1`
- Fixed y-coordinate inversion in FluidReveal's manual pointer handler

## Consequences

- Reveal physics now match the reference exactly (multiplicative dissipation, no curl)
- Non-reveal Fluid instances are completely unaffected (uniform branch, not keyword)
- One extra uniform per advection bind — negligible cost
- The `fadeSpeed` / `fadeBack` props now control multiplicative dissipation (1.0 = no fade,
  0.995 = slow fade) instead of divisor dissipation (0 = no fade, 0.97 = slow fade)
- The `/ascend-fluid` standalone route is removed — FluidReveal now serves as the
  canonical implementation
