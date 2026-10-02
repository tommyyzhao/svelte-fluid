# ADR-0099: Settle a visible idle fluid to zero frames

## Status

Accepted (2026-10-02)

## Context

ADR 0063 skips solver work only while emptiness is provable, and its
`solverMayContainContent` never resets. A visible `<Fluid>` that has fully
decayed still ran `update()` (full solve plus render) every animation frame
forever. Goal: zero frames rendered while idle.

## Decision

1. `update()` counts frames after each presented frame. Every
   `SETTLE_CHECK_INTERVAL` (30) frames `fieldsAreQuiet()` reads `velocity` and
   `dye` back through `readFieldInner`. After `SETTLE_CHECKS` (3) consecutive
   quiet checks the loop is stopped (`settled = true`, `stopRaf()`); the last
   frame is already on screen.
2. Quiet (`isQuiet` in `engine/settle.ts`):
   - max dye < `SETTLE_EPSILON` (0.5/255): invisible, nothing left to move,
     whatever the velocity does; or
   - max |velocity| < `SETTLE_VELOCITY` (0.5) and the per-frame dissipation
     change `max(dye) * (1 - 1/(1 + DENSITY_DISSIPATION/60))` < `SETTLE_EPSILON`.
   Evidence: in a default decayed scene `|v|` stays at roughly 35-50 for
   20 s (vorticity confinement sustains it) while dye reaches exactly 0 at
   about 12 s. A velocity-only gate never settles; velocity matters only while
   visible dye remains. Fading is a visible change, so a scene settles only once
   the per-frame fade is below half an 8-bit step.
3. Never check or settle while: `PAUSED`, `autoStart` false or deterministic
   mode, pending frame input, any pointer down, or a continuous driver
   (`hasContinuousDriver`: `autoSplatRate > 0`, driving or prescribed `flow`,
   initial-dissipation ramp still running). `COLORFUL` only recolours future
   splats, so it does not block.
4. Any input wakes it (`wake()`): `splat`, `randomSplats`, `setConfig`,
   `resize` (when the size changed), pointer down, hover pointer move, context
   restore. `resume()` also clears it; explicit `pause()` clears `settled` and
   wins. `isPaused` stays true while settled on the engine;
   `Fluid.svelte`'s handle reports `isPaused && !isSettled` so the auto-reveal,
   auto-distort and auto-animate wrappers keep splatting and so wake it.
5. `settleStill()` (reduced motion) is unchanged and does not set `settled`.

## Consequences

- Settled engines cost 0 GPU and 0 rAF callbacks. Measured: default config
  settles in about 6 s; `densityDissipation: 4` in about 3 s.
- Check cost (full sim-res velocity + dye-res read, hardware Chrome, 256 px
  dye, 64 px sim): about 5 ms per check, 0.17 ms/frame averaged. Larger dye
  resolutions cost more per check; if that exceeds ~0.2 ms/frame, downsample
  dye into a small FBO before the read.
- Waking is not bit-exact against a never-stopped engine: each uses its own
  wall-clock dt sequence, and the first dt after a wake is clamped. Measured
  max |dye| difference 0.01 one second after the same splat.
- Supersedes the "detecting decay is not worth it" stance of ADR 0063.
