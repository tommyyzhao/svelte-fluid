# ADR-0080: One shared animation frame for all engines

## Status

Accepted (2026-10-01)

## Context

Each `FluidEngine` ran its own `requestAnimationFrame` loop. Pages with several
canvases (docs, galleries, background + hero) paid one browser callback per
instance, and an exception thrown inside one engine's tick escaped to the
browser and silently stopped only that loop with no signal to the engine.

## Decision

`engine/frame-scheduler.ts` owns one RAF for every engine on the page. Engines
subscribe in `startRaf()` and unsubscribe on pause, context loss and dispose;
the RAF is cancelled when the last subscriber leaves. Each callback runs in its
own `try/catch`: a throwing engine is evicted (logged once via
`console.error`), marked paused so `isPaused` is truthful and `resume()` can
retry, and its siblings keep rendering in the same frame.

The module holds callbacks only, never GL objects, so invariant #2 (no shared
GL state) is unchanged. It does not call `requestAnimationFrame` at import,
so SSR imports stay safe. Pause, visibility, lazy mounting, context loss and
paused dirty-render skipping are unchanged: they already gate subscription
or run inside the tick.

## Consequences

- One browser callback per frame regardless of instance count.
- A deterministic engine fault no longer becomes a silent dead canvas or a
  60 Hz error loop; it surfaces as `isPaused === true` plus one error log.
- Instances now tick in subscription order within a frame. No engine reads
  another's state, so ordering is not observable.
- Rejected: a per-engine try/catch around its own RAF. It contains the fault
  but keeps N callbacks per frame.
