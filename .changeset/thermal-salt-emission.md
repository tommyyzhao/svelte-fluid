---
'svelte-fluid': minor
---

Add opt-in fixed-composition inflows, scalar thermal diffusion and net radiation, no-slip viscous walls, and temperature-driven linear-light salt emission feeding bloom. Single-channel conduction uses full-precision R32F scratch targets to avoid repeatedly transporting inactive channels. Raise the measured pressure-pair crossover to 330,672 simulation texels (M1 Max measurement; conservative margin for other GPUs); affected large-aspect grids retain the same iterations with different intermediate rounding. Pair no-slip viscosity iterations on the same bounded grid band. The flame test route halves dye resolution and paces two unchanged 1/240-second substeps per frame, preserving its physical fade while leaving compositor headroom. Other legacy transport/display defaults remain unchanged.
