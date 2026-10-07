---
'svelte-fluid': minor
---

Add opt-in hot `maxFps` presentation control (default `0`, present every frame; set `60` to halve presentation work on high-refresh displays). Simulation, input, automatic splats and wrapper animations keep their existing RAF cadence; only rendering and presentation are capped on faster displays. Paused invalidations, lifecycle first frames, explicit renders and the final settle image bypass the cap.
