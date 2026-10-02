---
'svelte-fluid': minor
---

Rendering now uses the native device pixel ratio by default (`maxPixelRatio` default `2` → `null`).

- DPR 3 screens (most phones, some laptops) now get crisp edges instead of an upscaled DPR 2 canvas. DPR 1 and 2 screens are unaffected.
- Cost: measured on an M1 Max, every preset stays under 2 ms per frame at a full 1440×900 viewport on DPR 3 (worst is GasFlare at 1.76 ms). See `dev-docs/benchmarks/gpu-budget.md`.
- To keep the old behaviour, pass `maxPixelRatio={2}` to `<Fluid>` or to any wrapper or preset. This is worth doing for full-bleed backgrounds on low-end integrated GPUs.
- An invalid cap (`0`, a negative number or `NaN`) now falls back to native DPR, the new default, instead of 2.
