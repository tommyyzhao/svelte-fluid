# ADR-0066: Normalize adaptive vorticity before gating

## Status

Accepted (2026-07-11)

## Context

The curl texture stores an unscaled centered difference, so the same continuous
vortex produces a sample proportional to grid spacing. Vorticity confinement's
gain was already resolution-normalized, but the optional adaptive threshold
still compared raw samples against fixed constants. Changing simulation
resolution could therefore move an equivalent vortex between the off,
transition, and full-confinement regions.

## Decision

Multiply the shader's local `2 * abs(curlSample)` magnitude by
`min(gridWidth, gridHeight) / 128` before applying the existing smoothstep band.
Use the same pure normalization and cubic-Hermite function in CPU mirrors. The
reference 128 grid remains exactly scale 1; the legacy path at adaptive mix 0
is unaffected.

A deterministic Chromium dipole sweep at 64, 96, 128, 192, and 256 measured
normalized weighted-gate means between 0.999800 and 0.999811. All velocity and
curl readbacks remained finite and live. The representative liveness and
grid-scale suites also passed (12 cases).

## Consequences

- Adaptive thresholds now describe a reference-grid physical gauge.
- Existing 128-resolution presets retain their prior threshold behavior.
- Non-reference scenes may change only when `vorticityAdaptive` is nonzero;
  this is the intended correction and is included in the existing solver-field
  changeset.
- No new pass, texture, program, or public control is introduced.
