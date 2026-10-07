---
'svelte-fluid': minor
---

Add hot `maxFps` presentation control (default 60; `0`/`null` presents every frame). Simulation, input, automatic splats and wrapper animations keep their existing RAF cadence; only rendering and presentation are capped on faster displays. Paused invalidations, lifecycle first frames, explicit renders and the final settle image bypass the cap. Candidate pending energy/quality evals and owner motion review.
