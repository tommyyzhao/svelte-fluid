---
'svelte-fluid': minor
---

New `obstructionColor` config: paint obstruction footprints in a solid
color in the display pass (0–255 RGB, `backColor` convention; `null`
keeps the legacy background-colored silhouette). Anti-aliased edges come
free from the rasterized mask. See ADR-0039.

Karman preset reworked to genuine flow: the autosplat tracer packets are
replaced by a rake of six persistent streakline point sources (one hue
each, injecting dye and velocity every frame — the classic wind-tunnel
smoke-rake), and the cylinder is now painted slate via
`obstructionColor` so the bluff body is clearly visible against the
scene background.
