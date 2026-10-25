# ADR 0126: Conservative thermal mask-space segment traversal

**Status:** Accepted
**Date:** 2026-10-24

## Context

Thermal/concentration advection sampled characteristics every half scalar texel,
although the solid raster may be much finer (mask512/dye32). A one-mask-pixel wall
could fall between forward probes, reverse correction probes, or a donor endpoint
and its midpoint. The 256-probe travel cap did not establish collision safety.

## Decision

Only the opt-in thermal advection shader receives the actual solid-mask dimensions.
Traverse every touched mask cell with a conservative supercover DDA, flipping UV y
to the top-down solid raster. Check both sides of gridline-aligned paths, corner
contacts, and inclusive domain endpoints (including UV=1). Recompute crossing times
from the original point and current integer boundary: accumulated Float32 increments
missed an exact corner after 120 cells. A near-corner tie may reject an extra cell
rather than miss a contact; its fixed tolerance is not a formal GPU error proof.
No mask means no raster traversal.

Apply this same predicate to the capped forward characteristic, reverse
characteristic, and participating interpolation donors. Cache forward donor results.
A blocked or unresolved forward path uses the current-cell source; blocked donors
have zero weight; a blocked reverse path disables correction. Preserve the existing
128-scalar-cell travel cap and disable correction for capped travel. No new pass,
FBO, dependency, public type, default, or ordinary-advection change.

Each traversal has a fixed 256-iteration budget; exhaustion rejects, even without a
wall. This is deliberately more diffusive for long paths/fine masks, never permission
to tunnel. Upgrade only with measured need, using tiled characteristic tracing rather
than silently growing the loop. A first-order pass has at most five traversals; the
corrected pass at most ten, plus five in its forward prepass: fifteen per step. Each
traversal has at most eight endpoint fetches and three mask fetches per iteration:
776 mask fetches, 11,640 for fifteen traversals (plus the existing center test).
Zero-weight donors skip traversal. No-mask checks return before mask fetches/loops.

## Verification

Node tests execute the shader's extracted scalar GLSL traversal body through a
small source translation, plus exact forward/reverse/donor/cap counterexamples,
non-square masks, y flip, corners, gridlines, zero length, endpoint1, exhaustion,
no-mask source parity, binding checks, and unaffected shader hashes.
Browser gates call the actual engine thermal program for scalar and absorption
first-order/MacCormack transport. They read back the actual solid raster before
asserting zero leak. A report-only A/B timing gate compares old/new shader programs;
no performance threshold is inferred from the measurements.

Hardware validation passed 62/62 tests on ANGLE Metal / Apple M2, Chrome
155.0.8059.86, Bun 1.3.14 (2026-10-24): eleven new wall tests plus thermal,
absorption, disturbance, outlet and conservation-diagnostic suites. The wall tests
establish zero leakage for the tested one-pixel walls, exact no-mask baseline bytes,
and rejection of the reverse/capped and Float32 corner counterexamples. Candidate
archive SHA-256: `b34ae2eea64e4c1866d105ec4a48888def889d6f23954f3d310c865b988e3232`.

This is one hardware/backend result, not a proof for every geometry or device.
Forty timing rows measured 0–0.1 ms for twenty steps, at the timer floor; no speed
or cost conclusion is supported. Conservation diagnostics are report-only:
ten of twelve scenes still exceed 2% section-flux spread, and GAS_FLARE remains
unestablished. Passing those diagnostics does not establish general conservation.
