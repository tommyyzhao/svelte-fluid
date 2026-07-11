# ADR-0054: Explicit frame budget and effective governor quality

## Status

Accepted (2026-07-11)

## Context

ADR-0047 and ADR-0051 define an opt-in, sustained-load governor that sheds
pressure iterations before solver substeps. Two details made that policy behave
incorrectly across displays and under load:

1. The overload threshold was a fixed internal 22 ms. A healthy 30 Hz sequence
   therefore looked overloaded, while a 120 Hz application could miss its frame
   target substantially without shedding.
2. The governor wrote its effective substep value back into `ResolvedConfig`.
   `calcDeltaTime()` clamps accepted wall-clock delta to
   `maxTimeStep * requestedSubsteps`, so each substep shed also reduced the
   amount of time the simulation accepted. Quality degradation became visible
   time dilation.

The public `substeps` field is a minimum, not an unconditional pass count. The
engine may still raise the actual count to `ceil(dt / maxTimeStep)` to preserve
the maximum-step stability contract.

## Decision

Add the Bucket-A field `autoPerformanceTargetFrameMs`, defaulting to `1000 / 60`.
The frame-time EMA is overloaded only when it is greater than this explicit
budget. Values are finite and clamped to 1–1000 ms. Applications targeting 30,
60, or 120 Hz can use approximately 33.33, 16.67, or 8.33 ms respectively.

Separate requested configuration from effective governor quality:

- `ResolvedConfig.PRESSURE_ITERATIONS` and `ResolvedConfig.SUBSTEPS` retain the
  caller's requested values.
- Private engine fields hold the current effective pressure iterations and
  substeps. The pressure solve and minimum-substep calculation read these fields.
- `calcDeltaTime()` continues to use the requested substeps for its legacy
  catch-up clamp. A governor action therefore cannot change the accepted delta.
- `getPerformanceState()` reports effective quality plus the selected target
  frame budget.
- Explicit pressure/substep configuration resets effective quality, preserving
  the documented manual restoration path. The governor never restores it by
  itself.

The deterministic `advance()` path and all behavior with `autoPerformance=false`
remain unchanged.

## Consequences

- Synthetic frame sequences classify relative to their selected 30/60/120 Hz
  budget rather than one refresh-blind threshold.
- Substep shedding no longer slows simulation time.
- When the accepted delta itself requires multiple stable steps, lowering the
  configured minimum may not reduce the actual step count. This is intentional:
  wall-clock fidelity and the `maxTimeStep` invariant take precedence over
  forcing a pass-count reduction.
- The new public field and `PerformanceState.targetFrameMs` are additive API
  surface included in the pending governor minor changeset.
- This ADR supersedes the fixed-threshold and config-mutation details of
  ADR-0047 and complements ADR-0051's sustained-overload state machine.
