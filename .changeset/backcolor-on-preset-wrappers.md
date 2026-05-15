---
'svelte-fluid': minor
---

Expose `backColor` as an optional override on every preset wrapper —
the six stylistic ones (`LavaLamp`, `Plasma`, `InkInWater`,
`FrozenSwirl`, `Aurora`, `ToroidalTempest`) and the three shape ones
(`CircularFluid`, `FrameFluid`, `AnnularFluid`). Each wrapper still
ships its authored default; passing `backColor={{ r, g, b }}` (0–255)
overrides only the empty-canvas substrate so the preset adapts to its
host page. The preset's splat palette, dissipation, and dye dynamics
are unchanged. Additive: omitting the prop preserves prior behavior.
See ADR-0033.
