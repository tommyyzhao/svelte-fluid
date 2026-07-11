# ADR-0064: Render paused scenes only after invalidation

## Status

Accepted (2026-07-11)

## Context

The declarative `paused` setting stopped solver integration but retained the
request-animation-frame loop and submitted the full presentation pipeline every
frame. Static paused demos therefore consumed GPU time without changing pixels.
Imperative `pause()` has a different contract: it owns RAF scheduling and must
stop the loop entirely.

## Decision

Track one presentation-dirty bit. Construction, splats, resize, relevant config
changes, context replay, and asynchronous texture uploads set it. While
declaratively paused, stable RAF ticks update CPU time/color state but create no
profiler frame and submit no GL work. A dirty tick presents once and clears the
bit only after a successful render. Live simulation continues rendering every
frame; imperative pause/resume retains ownership of RAF scheduling.

## Consequences

- Stable declaratively paused scenes submit zero draws.
- Input and display changes become visible on the next RAF without restarting it.
- Failed renders stay dirty and retry rather than silently accepting stale pixels.
- Async dithering/distortion completion explicitly invalidates presentation.
- No public invalidation method is introduced; the optimization remains internal.
