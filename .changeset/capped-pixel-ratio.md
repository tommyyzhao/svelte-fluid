---
"svelte-fluid": minor
---

Add `maxPixelRatio` to `<Fluid>` and wrapper component props. Physical canvas
DPR now defaults to a maximum of 2 to reduce high-DPR framebuffer memory and
fill rate; pass `maxPixelRatio={null}` to retain native device DPR. Small-canvas
quality tiers now depend on CSS size rather than physical DPR, so the same
layout selects consistent effects and iteration defaults across displays.
