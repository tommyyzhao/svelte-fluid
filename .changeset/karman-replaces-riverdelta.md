---
'svelte-fluid': minor
---

Replace the `RiverDelta` preset with `Karman` — a calibrated von Kármán
vortex street: a pressure-gradient drive past a single off-center
cylinder (fit-to-canvas obstruction mask), four-edge dye drains, a
high-fidelity solver configuration (1/120 step × 2 substeps, 34 pressure
iterations, 192 sim / 1024 dye resolution), and fast multicolor tracer
packets (fresh generated hue per packet) that render successive
sheddings as distinct colored filaments. `RiverDelta` and
`RiverDeltaProps` are removed; `Karman` accepts the same wrapper props
(including `pointerInput`/`splatOnHover`, both on by default).
