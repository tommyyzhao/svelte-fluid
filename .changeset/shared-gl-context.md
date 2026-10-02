---
'svelte-fluid': minor
---

Pages with many fluid instances no longer lose WebGL contexts: beyond 8 live instances, new ones share one context.

- The first 8 live WebGL2 instances on a page keep their own context and render exactly as before.
- Each further instance renders on one shared hidden context with a shared compiled-program cache, and presents to its own canvas. Output is pixel-identical, including transparent and reveal. Measured on an M1 Max: shared instances construct in about 7 ms instead of about 30 ms, and 24 visible instances all stay live (8 were lost before).
- A shared instance costs about 0.45 ms more GPU per frame at DPR 2 (0.7 ms at DPR 3) to present. A context loss on the shared context pauses all shared instances at once, and they restore automatically.
- WebGL1 browsers and `requireHardwareAcceleration` always keep a context per canvas.
