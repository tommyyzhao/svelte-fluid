# ADR 0069: Own and bound asynchronous GPU input

**Status:** Accepted
**Date:** 2026-09-02

## Context

WebGPU executes asynchronously, while public props and imperative inputs arrive as
mutable JavaScript objects at arbitrary rates. Retaining caller-owned descriptors,
accepting non-finite values, or allowing unbounded arrays and splat bursts turns a
small visual component into an unbounded GPU allocation/work queue. A changed solid
topology also cannot safely inherit fluid that is now inside a wall.

## Decision

- Snapshot every config descriptor at the controller boundary and discard unknown
  nested metadata. Large prescribed-grid payloads retain identity and use `version`
  as their explicit mutation contract.
- Reject non-finite GPU-scale descriptor values and cap flow descriptors,
  obstruction/vector-text input, mask resolution, three packed scalar fields,
  opening splats, and queued imperative splats. The solver consumes at most 16
  splats per frame and retains at most 64; when saturated, newest input wins.
- Keep at most one structural GPU transition in flight. Config and resize input
  arriving behind it coalesces to the newest desired state before another graph
  can be allocated. A delayed CPU validation/allocation rejection reports through
  `onError` and retains the live graph; only scoped GPU failures fail closed.
- Count every persistent texture—including prescribed grids and distortion
  images—against one aggregate budget, and reject transitions whose old/new peak
  exceeds a separate bound.
- Clear the packed scalar target whenever semantic channel ownership changes;
  upload every declared prescribed scalar grid to its named channel.
- Preserve fields across extent and non-topological owner changes. Clear the
  replacement graph when solid topology changes so removed/added walls cannot leave
  ghost fluid.
- Treat synchronous candidate preparation as transactional. WebGPU validation and
  OOM scopes cover asynchronous work; a late error fails only that instance closed.

## Consequences

- Recovery and repeated `setConfig` calls use engine-owned, deterministic input.
- Work and descriptor cardinality have explicit ceilings instead of depending on
  caller restraint.
- Reactive structural churn has bounded queued ownership rather than accumulating
  one submitted resource graph per prop update.
- Callers mutating a prescribed typed array in place must increment `version`.
- Topology edits intentionally discard live simulation state; ordinary resize and
  isolated presentation-owner changes preserve it.
