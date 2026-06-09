---
'svelte-fluid': patch
---

Solver pass restructuring: container/obstruction masking folded into the
advection, viscosity, and gradient-subtract passes (no more standalone mask
blits); precomputed face-aperture neighbor texture replaces per-fragment
solid-mask probes; pressure warm-start folded into the first Jacobi
iteration; adaptive paired Jacobi (two exact iterations per pass) on
production-sized grids. Measured ~35–40% frame-time reduction across the
flow presets with no visual or API change. See ADR-0038.
