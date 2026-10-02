---
'svelte-fluid': patch
---

`Karman` preset GPU cost cut from ~4-11 ms to under 2 ms per frame (M1 Max, DPR 1-3). It now runs one 1/60 s solver step per frame instead of two 1/120 s substeps; outlet clearing, wall friction and the pressure-gradient drive are retuned so the inflow speed, streak brightness and vortex street look the same.
