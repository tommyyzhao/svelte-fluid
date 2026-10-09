# ADR 0108: dv2 engine contract closure

**Status:** Accepted (scope/contract); lighting appearance approved 2026-10-09 (lead, under owner-delegated decision; Bead 9yj)
**Date:** 2026-10-07

## Context

The dv2 audit identified fallback idle, compiled-cache scope and RGB-derived
lighting geometry gaps. This records their bounded disposition, not universal
zero-idle convergence, all-instance compilation sharing or owner taste approval.
Evidence baseline: `1006e8f`; added hardware tests and review packet accompany this ADR.
Focused installed hardware Chrome run: idle/shared-context **2 files / 88 tests
passed**, ordinary validation. Node **52 files / 864 tests passed**; check **471
files / zero errors or warnings**; prepack/publint/public declarations passed.
Existing dependency-scan diagnostic persists; browser command exited zero.

## Sub-decisions

### Fallback idle

Fallback ordinary scenes support threshold settling; amplified modes require exact
emptiness or the documented inert fixed point. Nonempty flow and other unproven
renderer combinations remain conservatively active. Universal zero-idle convergence
remains unresolved (energy for driver-present scenes is addressed by the frame-rate
cap under ADR 0109, not by settling).

[ADR 0099](./0099-settle-visible-idle-fluid.md) defines RGBA8 threshold flags,
staged snapshots, cancellation, wake and fail-closed errors. Hardware coverage in
`src/lib/engine/__benches__/idle.browser.test.ts` includes:

- Forced WebGL1 / WebGL2 byte fallback settling, preserved final images, wake/re-settle,
  odd-edge signed/HDR flags, restore and lifecycle cancellation.
- Delayed real image decoding callbacks: reveal dither readiness and distortion
  dither/image readiness each wake an already-settled fallback renderer, then
  re-settle with zero subscribers/RAF. Distortion readback verifies the uploaded image.
- Shared byte settle-probe exception and silent GL validation error fail only the
  owning engine; its sibling still advances/renders and subsequently settles.
- Amplified reveal/distortion sub-epsilon counterexamples, empty-flow stopping,
  nonempty-flow exclusion, inert float/byte/manual-WebGL1/MacCormack fixed points,
  retained black thickness and rectangular shared HDR presentation.

The readiness test defers load notification after ordinary browser decoding; it
proves asynchronous callback handling, not network throughput. These tests certify
neither every renderer combination nor native GPU/energy budgets.

### Compiled cache

Requested cache scope satisfied by the accepted hybrid contract
([ADR 0093](./0093-fluid-engine-on-shared-gl-host.md)), not all-instance shared
compilation; cross-context WebGLProgram sharing is impossible.

The first eight own-context slots compile locally. Compatible shared-tier/model
engines share the host's exact-source/define-keyed cache. WebGL1 and hardware-required
engines retain own contexts. `gl-host.test.ts` covers cache keys, lifetime and
source changes; `shared-context.browser.test.ts` now asserts identical program
objects and zero second-engine compile/link calls on the shared tier, distinct
valid context-local programs on the own tier. Existing tests cover tier assignment,
pixel parity, loss/restore, state isolation and 24 live components.

### Independent geometry lighting

Implementation complete under
[ADR 0100](./0100-independent-deposited-thickness.md): persistent dye alpha stores
independent deposited thickness; RGB is pigment, never the normal/height proxy.
`lighting.test.ts` and `lighting.browser.test.ts` cover hue-independent black/HDR
geometry, source deposition/transport, normals/optics, shared uniform isolation,
resize and target-allocation lifecycle. The representation adds no texture,
framebuffer or persistent bytes. Passing lifecycle tests is not budget certification;
[goal verification](../benchmarks/2026-10-03-goal-verification.md) retains timing and
appearance evidence limits.

**Owner appearance approval pending.** The durable
[review packet](../benchmarks/owner-review/lighting/README.md) contains all ten
registry-shaded presets, seed 5, native DPR 2, 1440×900 CSS, about five seconds after
component readiness. It is current-look evidence, not a paired historical comparison,
calibrated geometry or approval.

## Consequences

The audit's implementable contract gaps have explicit tests and scope. Closing dv2
as this bounded implementation/contract audit does not close owner appearance review,
universal idle convergence or unmeasured renderer/budget decisions. Keep those
unresolved decisions open; no production algorithm or public API change is required.
