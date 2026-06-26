# ADR 0043: Screen-isotropic resolution gauge for `viscosity` and `curl` (Phase 5)

## Status

Accepted (in-task).

## Context

In `viscosity` and `vorticity` passes, coefficient math was tied to `max(simWidth, simHeight)`
without compensating for the simulation’s screen-space cell scale `h = 1/min(simWidth, simHeight)`.
That made the same `viscosity` and `curl` values feel softer or stronger as `simResolution` changed.

Epic 4.2’s tracker calls for a resolution-invariant interpretation with zero public API churn:
`viscosity` and `curl` are reinterpreted in-place, no new fields, and shader source stays unchanged.

## Decision

Introduce gauge helpers in `src/lib/engine/FluidEngine.ts`:

- `viscosityAlpha(viscosity, dt, w, h, nRef)` = `viscosity * dt * max(w, h) * (min(w, h) / nRef)`
- `curlScale(curl, w, h, nRef)` = `curl * (nRef / min(w, h))`
- `N_ref` is anchored to `DEFAULTS.SIM_RESOLUTION` (`128`).

`viscosityAlpha` is used at `uAlpha` in `applyViscosity`.
`curl` is scaled with `curlScale` at the `uCurl` transfer to `vorticityProgram`.

No GLSL math changes were made:

- `viscosityShader` keeps `(L + R + T + B) / (1 + 4 * uAlpha)`.
- vorticity compute/shader form in `vorticityShader` is unchanged.

## Retunes (4 presets with explicit resolution overrides only)

The preset overrides (`GasFlare`, `Venturi`, `Karman`, `TeslaValve`) were retuned so
perceived feel matches the pre-change calibration at their fixed `simResolution`:

- `GasFlare`: `curl` `16 → 20`
- `Venturi`: `viscosity` `0.016 → 0.020`
- `Karman`: `curl` `10 → 15`, `viscosity` `0.014 → 0.021`
- `TeslaValve`: `curl` `10 → 15`, `viscosity` `0.040 → 0.060`

Only these four resolution-overriding flow presets were changed.

## Tests

- New pure helper tests in `src/lib/engine/__tests__/resolution-gauge.test.ts` assert:
  - Legacy `viscosityAlpha` identity when `min(w, h) = N_ref`.
  - O(N²) scaling under fixed-aspect doubling of `N_actual`.
  - `curlScale` = 1 at `N_ref` and `N_ref / N` at `N`.

