---
"svelte-fluid": minor
---

Reduced-motion still frame and visible frame failures.

- Under `prefers-reduced-motion: reduce` every component now advances the
  opening scene a fixed 60 steps, renders one finished frame and stays still
  (no animation loop, no pointer response) instead of freezing raw splats. The
  preference is followed live in both directions.
- A frame that throws at runtime now calls `onError` once and shows the
  existing fallback with the new `WebGLUnavailableReason` `'render-failed'`; it
  is not retried. `fallback` snippets that switch on `reason` should handle it.
