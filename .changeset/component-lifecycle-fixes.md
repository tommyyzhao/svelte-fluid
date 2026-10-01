---
"svelte-fluid": minor
---

Component lifecycle and quality-policy fixes.

- `<Fluid>` gains `onReady` (engine constructed, first frame scheduled) and
  `onError` (engine construction failed; receives the `WebGLUnavailableError`
  or other init error). Consumer callbacks that throw are caught and logged
  instead of breaking startup.
- `fallback`, `poster`, `posterAlt`, `fallbackText`, `onReady` and `onError` are
  now typed and forwarded by `FluidBackground`, `FluidDistortion`, `FluidReveal`,
  `FluidStick` and `FluidText`. `FluidDistortion` defaults `poster` to `src`.
- Fix: bloom, sunrays, `bloomIterations` and `pressureIterations` no longer stay
  forced off/reduced after a small canvas grows past the 600 CSS px threshold.
- `FluidDistortion`: opening splats are seeded from `seed` (reproducible, capped
  at 64); `autoDistort` waits for the engine, no longer jumps after pause/resume,
  and now honours `autoDistortSpeed`.
- `autoPause` now keeps a `<Fluid>` created in an already-hidden tab paused until
  the tab becomes visible.
