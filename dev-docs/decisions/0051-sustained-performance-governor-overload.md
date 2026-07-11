# ADR-0051: Sustained performance-governor overload

## Status

Accepted (2026-07-11)

## Context

ADR-0047 introduced the opt-in Bucket-A frame-time governor. The original
implementation used one timer, `msSinceLastChange`, for both "how long since the
last shed" and "how long the frame-time EMA has been over budget." That meant
short overload spikes could accumulate across recovery frames and eventually shed
quality even though the overload was never sustained.

The pull diagnostics also exposed `lastAction`, but the live sampler cleared it to
`'none'` on every no-op frame. Consumers polling `getPerformanceState()` could
miss the most recent action unless they happened to read on the exact shedding
frame.

## Decision

Keep the ADR-0047 public surface and Bucket-A-only ladder, but split the timers:

- `continuousOverloadMs` accumulates only while the frame-time EMA is above the
  internal budget and resets to zero once the EMA returns below budget.
- `msSinceLastChange` remains the post-action cooldown and observable diagnostic.
- Shedding requires both timers to satisfy the hysteresis interval.
- A single frame contributes at most 250 ms to the EMA/timers, so tab
  suspension, a debugger pause, or one long GC stall cannot impersonate three
  seconds of continuous device overload.
- Imperative pause and declarative paused-state transitions reset the governor;
  work separated by a paused discontinuity is never one overload streak.
- `lastAction` records the most recent shed action until the governor is reset by
  explicit config changes or disabled state, instead of acting like a one-frame
  event.

The deterministic `advance()` path remains outside the sampler. The governor still
never auto-restores pressure iterations or substeps.

## Consequences

- Intermittent spikes separated by recovery frames do not shed quality.
- Continuous overload waits the full interval for the first shed, and another full
  post-action interval before any later shed.
- A real recovery breaks the sustained-overload interval even when the cooldown
  timer has already exceeded the interval.
- Invalid/non-positive timing samples contribute nothing and cannot poison the
  state with `NaN`.
- Existing diagnostics keep the same shape; only `lastAction` becomes stable
  enough for pull-based UI.
