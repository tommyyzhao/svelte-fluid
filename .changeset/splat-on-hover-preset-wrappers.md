---
'svelte-fluid': minor
---

Expose `splatOnHover` on all six stylistic preset wrappers — `LavaLamp`,
`Plasma`, `InkInWater`, `FrozenSwirl`, `Aurora`, `ToroidalTempest` — so
they match the shape preset wrappers (`CircularFluid`, `FrameFluid`,
`AnnularFluid`, `SvgPathFluid`) which already accept the prop. Additive:
omitting it preserves the existing default behavior (no hover splatting).
See ADR-0032.
