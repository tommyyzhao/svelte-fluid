# ADR 0100: independent deposited thickness

**Status:** Accepted; visual treatment pending owner review
**Date:** 2026-10-02
**Supersedes:** ADR 0087's RGB-derived geometry claim only; historical record unchanged

## Context

Hue, HDR pigment and recoloring must not change deposited geometry. Black pigment
must still have thickness. Exact 0.8.0 shaded parity is not the chosen goal.

## Decision

Reuse persistent `dye.a` as passive layer thickness, measured in canvas-height
units. Every splat deposits a fixed peak dose **0.06**, independent of RGB,
velocity force, DPR or quality. Radius sets its Gaussian footprint and therefore
source volume; no normalization to fixed total volume. Continuous dye sources
supply `0.06 * rate * dt` with the existing spatial/profile weight. The local
thickness ceiling is **0.24**; saturation deliberately discards excess deposit.
These are illustrative scene constants, not calibrated material parameters.

Empty dye read/write targets clear to RGBA zero. Existing RGBA advection, decay,
sticky retention, masks, outlets and resize copy transport/remove thickness.
Dye writers fully overwrite their target; the sunrays scratch alpha is never
swapped into persistent read state. Every shared program binds its dose/height
uniforms on every use, including zero for non-dye fields.

One geometry snippet samples alpha for aspect-correct central-difference normals
and dielectric refraction/specular. Diffuse uses that true unit normal with the
same studio key as specular, ambient/key weights 0.7/0.3; the old 10000× squared
slope gain is removed, not hidden in a compatibility branch. Pigment RGB and RGB-driven reveal/display
coverage remain separate; output remains premultiplied. `readField('dye')`'s
internal fourth channel intentionally changes from padding to thickness; no new
public prop, selector or root GL type.

## Idle proof and limits

Diffuse shading multiplies pigment by `[0.7, 1]`. Before applying the RGB
invisibility bound, the first dye reduction includes the sunrays upper gain:
`max(1, 0.7 * (1 + max(weight, 0) * (1 - 0.95^16) / 0.05))`. Mask alpha is at
most one, ray decay is 0.95 for 16 taps, exposure is 0.7 and blur is convex.
Invalid raw fields are checked before weighting; overflow fails closed on float
and byte paths. Ordinary residual RGB may still settle, including black thickness. Independent specular can expose black. For the
fixed exponent 128/studio light, BRDF normalization is `130/(8*pi)`, Schlick
Fresnel is below `0.02001`, dot products are at most one, and coverage is at most
`h/0.06`. sRGB encode is at most `12.92` times linear intensity. The existing
first dye reduction therefore tests the whole-highlight bound
`RGBmax + specular * 12.92 * 130/(8*pi) * 0.02001 * h/0.06`, not only its fade.
Potentially visible thickness blocks idle conservatively; a tiny nonzero residual
may idle without truncating the physical field. No extra reduction pass/target.

Arbitrary refraction image frequency, reveal curves, tone mapping, postprocess
amplification, active glass postprocessing and contrast correction lack this bound. Where thickness is exposed
by those combinations, nonzero thickness blocks idle. Such opt-in scenes are not
universally proven to settle: half-float decay may plateau. Flow visualization's
existing unresolved convergence guard remains. Do not claim universal idle.

## Consequences

- Zero additional textures/FBOs, persistent bytes or simulation/render passes;
  replace the old four RGB/log geometry taps with four alpha taps.
- Normal/refraction changes are intentional, not automatically visually approved.
  Same-seed native-DPR before/after captures and hardware timings remain evidence,
  not GPU-budget certification.
- This is a passively transported thin-layer volume-per-area model, **not** a
  calibrated incompressible free surface. Semi-Lagrangian resampling is not
  exactly volume-conservative; wave/height coupling is not added. Sticky behavior
  is illustrative material retention/removal.
- No RGB-proxy compatibility branch; simpler representation before a new field.
