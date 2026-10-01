# ADR-0079: Bound imperative input and reject non-finite values

## Status

Accepted (2026-10-01)

## Context

`randomSplats(count)` pushed every request onto an unbounded stack and ran
one whole entry per frame, so `randomSplats(1e6)` became a single frame of two
million blits and a 60 Hz caller grew the stack forever. `splat()` and hot
config numbers accepted `NaN`/`Infinity`, which permanently poison
half-float fields. The WebGPU R&D branch (its ADR 0069) bounded the same input.

## Decision

- Random splats are a counter, not a stack: at most 64 retained, at most 16
  run per frame (32 blits; under ~1 ms on integrated GPUs). Saturated
  requests are dropped. Counts are floored; negative/non-finite add nothing.
- `initialSplatCount*` clamp to 0–64 and `autoSplatCount` to 0–16 integers.
- `splat()` ignores any non-finite argument. `resolveConfig` treats a
  non-finite top-level number or RGB channel as "not supplied", keeping the
  previous resolved value.
- Invalid input never throws into consumer code; each kind logs one
  `console.warn` per page. Throwing would break reactive `$effect` chains for
  a value the engine can simply decline, and `main` already clamps rather
  than rejects out-of-range hot scalars.

## Consequences

- Work per frame and queued input have explicit ceilings.
- Large `randomSplats` bursts now spread over several frames and cap at 64.
- Nested descriptors (shapes, obstructions, flow) are not scanned for
  non-finite values; add per-descriptor validation if they prove a source.
