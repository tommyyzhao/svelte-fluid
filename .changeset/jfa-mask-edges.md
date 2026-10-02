---
'svelte-fluid': patch
---

Crisper mask edges at high DPR (ADR-0084).

- Container shapes, SVG/text masks and obstructions now anti-alias over about one device pixel at any pixel ratio. Before, the soft edge was a fixed fraction of the canvas and grew to 4–18 px at DPR 3.
- SVG path, text and obstruction masks get their edges from a GPU jump-flood signed distance field (WebGL2). WebGL1 keeps the previous bilinear mask edge.
- No API or prop changes. Physics, spawning and glass are unchanged.
