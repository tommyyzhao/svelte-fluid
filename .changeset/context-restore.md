---
"svelte-fluid": patch
---

Fix WebGL context restoration so every GPU resource is freshly recreated and
the seeded random plus configured preset opening splats replay exactly once.
Also avoid allocating the glass scene framebuffer twice during construction and
restoration.
