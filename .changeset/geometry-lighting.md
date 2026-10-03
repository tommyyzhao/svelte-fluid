---
'svelte-fluid': minor
---

Lighting from independently deposited thickness (ADR-0100 supersedes ADR-0087's geometry claim).

- `shading` now uses the same thickness-derived unit normal as specular/refraction. Pigment RGB, including black, does not determine height. The passive thin layer is not a calibrated free-surface solve. Shaded presets intentionally differ from 0.8.0; no parity or RGB-proxy mode is retained.
- New opt-in `specular` (0–1): a Fresnel highlight from a studio key light.
- New opt-in `refraction` (0–1): refracts the distortion image, or the fluid under `glass`.
- Both default to 0, are hot-updatable, and allocate no extra textures.
