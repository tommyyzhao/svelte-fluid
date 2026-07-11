# ADR-0057: Profile whole-frame ownership groups with inert opt-in instrumentation

## Status

Accepted (2026-07-11)

## Context

The original benchmark timer wrapped selected solver passes only. It could not
explain post-processing or presentation cost, used incompatible WebGL1/WebGL2
timer APIs as though they were one API, and exposed no allocation, environment,
draw, pixel, or texture-footprint context. Per-pass GPU timings also risked
measuring a synthetic query-heavy workload rather than the shipping frame.

Epic 0002 needs comparable evidence before resource, fidelity, and material-mode
changes. Shipping instances must not pay a branch in every draw when profiling
is disabled, and invalid GPU timings must never be reported as valid evidence.

## Decision

Use one internal, opt-in profiler with non-overlapping ownership groups:
`solver`, `bloom`, `sunrays`, `display`, and `glass`. Normalize WebGL2
`EXT_disjoint_timer_query_webgl2` and WebGL1 `EXT_disjoint_timer_query` behind a
small adapter; fall back explicitly to CPU submission time when neither is
available. Reject entire pending samples on disjoint, context-loss, timer-error,
or blank-frame conditions.

Record compile/link/allocation/reconfigure/resize/restore lifecycle phases,
environment and effective-resolution metadata, draw count and submitted pixels,
and an estimated texture byte footprint. Install a counting blit closure only
for instrumented engines; ordinary instances retain the original raw blit
closure and do not enter profiler code in the frame path.

## Consequences

- Bench results can attribute the whole submitted frame and carry enough context
  to compare devices and resource strategies.
- GPU timings remain asynchronous and represent elapsed GPU work; CPU fallback
  is labeled submission time rather than presented as GPU time.
- Texture bytes are an allocation estimate, not driver-resident memory.
- The profiler is internal and excluded from the package API; it supports the
  private evaluation program without creating a compatibility promise.
