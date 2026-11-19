# ADR 0131: Selectable distortion field, pressure by default

**Status:** Accepted
**Date:** 2026-11-19

## Context

Image distortion warped the picture along the normalised velocity, scaled by dye.
That reads as the image sliding with the flow. Two other fields give distinct,
useful looks: where the flow accelerates, and where pressure builds. A lab preview
(an internal engine knob and a dev route) tried both; the owner chose to ship all
three and make pressure the main look.

## Decision

Public `FluidConfig.distortionField: 'pressure' | 'acceleration' | 'velocity'`,
default `'pressure'`. Unknown values throw `RangeError` (as the keyword helper does).
Also a `FluidDistortion` prop; no aliases.

- **velocity**: unchanged shader line, `imgUv -= power * normalize(vel) * offset`. Output is byte-identical to before; the bench pins hash `3190fa5e`.
- **acceleration**: `a = (v_now - v_prev) / dt`, with `v_prev` the velocity at the previous presented frame and `dt` the solver time between those frames. Steady flow gives `a = 0`; the first frame after allocation or a sim resize gives `a = 0`. It needs one RG half-float sim-sized target, `accelPrev`.
- **pressure**: `a = -grad p / dt` (the projection subtracts `grad p` once per step, so `p / dt` is a rate). Pressure is a NEAREST target, so the shader interpolates it bilinearly by hand. No extra state.

Both new modes warp by `power * gain * offset * a / (|a| + k)`; the soft norm keeps
near-zero `a` still instead of amplifying noise.

**setConfig bucket B**: a field change recompiles the display keyword variant
(`DISTORTION_ACCEL` / `DISTORTION_PGRAD`; velocity adds none). The `accelPrev`
target exists only while distortion is on in acceleration mode: allocated and freed
on field or `distortion` changes, rebuilt on sim resize, dropped on dispose and
re-created after context restore. It is never created for the other modes.

**Constants, not config.** `k = 60` for both new modes, and a per-mode gain
(pressure 4, acceleration 3, velocity 1) so one `distortionPower` looks comparably
strong. `distortionPower` was tuned on velocity (default 0.4, home page 0.3), and
the new fields have different magnitudes. Gain was chosen by measurement on the
home-page card (bosch-garden, power 0.3, intensity 20, 6 splats, seed 311): mean
absolute pixel difference from the undistorted image over the first 3 s, on
hardware (M1 Max, ANGLE Metal). Gain 1 gave pressure 0.45x velocity (below the
0.5-2x gate); gain 4/3 gave pressure 0.82x and acceleration 0.91x. Acceleration is
lower in steady flow by design; it is gated only as visibly non-zero (>1.0) in the
opening splats. Softness is not exposed; add `distortionSoftness` if users ask.

## Consequences

- **Visible default change.** Existing `FluidDistortion` and `distortion: true`
  users see the pressure look. `distortionField="velocity"` restores the old one.
  Shipped as a minor with a changeset note.
- The display shader gains one uniform (`uDistortionGain`) in the new-mode branch
  only; the velocity branch is unchanged.
- Cost: pressure reads the pressure target 8 times per pixel; acceleration adds one
  copy blit per presented frame and one texture. Velocity is unchanged.
- Evidence: the maintainers' measurement notes (not published).
