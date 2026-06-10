---
'svelte-fluid': patch
---

RiverDelta preset retune: the current is slowed to ~120 px/s (inlet,
startup jets, and tracer packets all halved from 260) so the braiding
stays legible, and the tracer packets now spawn more often (rate 2.6,
count 3) with a fresh generated hue per packet (`autoSplatColor: null`)
instead of a single muted teal.
