---
'svelte-fluid': minor
---

Add opt-in `FlowOutlet.velocity: 'relax'` with positive `relaxRate` (default 10/s). Relax normal velocity toward its mask-weighted fluid-section mean while damping tangential motion, preserving outlet-pass flux. Default `damp` mode, dye/scalar clearing and all preset defaults remain unchanged.
