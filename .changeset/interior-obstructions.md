---
"svelte-fluid": minor
---

Add interior obstructions — arbitrary SVG-path/text obstacles the fluid flows
around, orthogonal to `containerShape`. New `obstructions: Obstruction[]` config
field; all obstructions union into one combined mask and the allowed fluid
region becomes `container × (1 − obstruction)`. Each `Obstruction` supports
`offset`/`scale` placement and a `fit: 'contain' | 'fill'` mode (`'fill'`
stretches geometry to span the canvas at any aspect — for maze/nozzle channels).
Obstruction physics stays active even under `openBoundary` (a solid obstacle
blocks flow regardless of the canvas edges). See ADR-0034.
