# ADR-0085: Reduced-motion still frame and terminal frame-failure fallback

## Status

Accepted (2026-10-02)

## Context

Two lifecycle gaps remained after ADR-0080 and the accessibility defaults:

1. Under `prefers-reduced-motion: reduce`, `<Fluid>` forced `paused: true`. A
   paused engine renders the unadvected opening splats, which look like raw
   blobs rather than a finished fluid frame, so the still dropped information
   the animation carries.
2. The shared scheduler evicts a throwing frame callback. `FluidEngine` marked
   itself paused, but `Fluid.svelte` never learned: the canvas froze silently
   and every resume retried and re-logged.

## Decision

**Still frame.** `FluidEngine.settleStill()` stops the loop, advances a fixed
60 steps at a fixed 1/60 s (the density-dissipation ramp follows simulated
time during the settle, so the result is deterministic and independent of
wall-clock), renders once and stays stopped. No RAF is subscribed while still.
`resume()` is a no-op until `endStill()`; a resize or hot config change in a
still re-presents one frame (`renderOnce`); a context restore re-settles
instead of restarting the loop. `Fluid.svelte` calls `settleStill()` at
construction when reduced, disables engine pointer input while reduced, and
toggles `settleStill()`/`endStill()` live from `watchReducedMotion` without
rebuilding the engine. Wrappers: `FluidReveal` hides its cover (unchanged) and
now starts/stops auto-reveal live; `FluidDistortion` and `FluidStick`
start/stop auto-animation live and `FluidDistortion` ignores pointer motion
while reduced. `FluidBackground` and `FluidText` inherit via `<Fluid>`.

60 steps was picked by visual check: the 12-splat canvas resolves into curled
filaments rather than discs; more steps only dissipate the dye.

**Frame failure.** The engine accepts an internal `onFrameError`, called once
through `notifyHost` when the scheduler evicts it. `Fluid.svelte` records a
`render-failed` failure (new `WebGLUnavailableReason`), tears the engine down,
shows the existing fallback (snippet, poster, or backColor fill plus hidden
text) and calls the consumer `onError` once. `render-failed` is permanent: the
reconcile path never re-instantiates, so there is no retry loop.

## Consequences

- A reduced-motion canvas shows a deterministic finished frame at zero ongoing
  cost, and reacts to live preference changes.
- A runtime GL fault becomes visible to the host exactly once.
- `WebGLUnavailableReason` gains `'render-failed'`; `fallback` snippets that
  switch exhaustively on reason need a new case.
- Rejected: retrying after eviction (hides deterministic faults behind a
  60 Hz error loop); rendering the still at a different dye resolution or with
  a long step count (cost without visible gain).
