# ADR 0127: Bound tracer splats during ring warmup

**Status:** Accepted
**Date:** 2026-10-24

## Context

Tracer accumulation submits capacity instances even before any slots have been
initialized. Until the ring fills, initialized slots form a prefix. The emission
serial wraps at 786432 independently of capacity, so it cannot bound that prefix.

## Decision

Keep an independent initialized-slot high-water mark, initially zero. After each
successful advance, add the existing emitted count, saturating at capacity. Submit
only that prefix to the splat draw. Keep the full update viewport, every advance,
all shaders and the per-accumulation depth clear unchanged. Dead initialized slots
remain included; this is not live-particle compaction.

A new inventory (capacity replacement or context restoration) starts at zero;
depth-only resize retains the bound. Failed allocation staging never mutates the
existing inventory.

## Consequences

- Empty and warming inventories submit fewer splat instances; defaults unchanged.
- Saturated rings submit exactly the previous capacity, including after serial wrap.
- Fake-GL tests cover bounds and failed staging. Browser gates compare state,
  depth and canvas bytes against capacity draws during warmup and overflow; timing
  is report-only. Hardware validation passed 13/13 on ANGLE Metal / Apple M2,
  Chrome 155.0.8059.86 (2026-10-24). Initialized counts 0, 1, 511, 512, 513,
  1024 and overflow retained exact state/depth/canvas parity; all Metal pins ran.
  Translation drift 0.000045935 cell; mass error 0.412689%, both within unchanged gates.
- No update-pass optimization, compaction, shader changes or speed claim.
