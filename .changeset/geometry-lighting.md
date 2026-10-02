---
'svelte-fluid': minor
---

Lighting from real dye geometry (ADR-0087).

- `shading` now lights a surface derived from the dye's optical depth instead of treating colour brightness as height. Presets look the same as 0.8.0 (within 0.4/255 on every preset).
- New opt-in `specular` (0–1): a Fresnel highlight from a studio key light.
- New opt-in `refraction` (0–1): refracts the distortion image, or the fluid under `glass`.
- Both default to 0, are hot-updatable, and allocate no extra textures.
