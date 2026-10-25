# ADR 0125: Crop no-slip viscosity exactly once before projection

**Status:** Accepted
**Date:** 2026-10-24

## Context

The single no-slip viscosity branch returned before multiplying by its existing
inline coverage mask. The paired no-slip shader had only binary solid-cell
rejection, with no coverage mask at all. Analytic antialiasing and SVG fractional
coverage therefore survived viscosity uncropped. Divergence and pressure read
that velocity before gradient subtraction applies its own mask; masking there
cannot repair the already-changed interior pressure. This is not sticky-specific.

## Decision

Multiply the single no-slip output by the existing inline mask. Add the same
inline mask to the paired shader's outer output only. Bind its dedicated mask
samplers on units 4 and 5, distinct from velocity/source/solid/neighbors on 0–3.
Reset its coverage gate before every loop, including shared-program reuse. Enable
it only for the final pair when no odd single remains; otherwise the existing
final-single gate owns the crop.

Never crop an inner iterate or every pair: fractional coverage would repeatedly
attenuate the iterates and change the diffusion solve. The intended invariant is
an unmasked viscosity solve followed by exactly one coverage multiplication
before projection, without a new pass, FBO, prop, dependency, or default change.
Free-slip math and zero-viscosity behavior remain unchanged.

## Verification

Node regression checks exercise actual engine orchestration through fake GL and
pin the shader output gates. Browser gates compare actual GL against a standalone
once-after-viscosity applyMask reference, including odd/even and unpaired sizes,
analytic/SVG/obstruction coverage, inactive/open masks, hot updates and shared
program state. A missing-crop negative control must exceed that tolerance.
Separate frozen GLSL fixtures from commit
`b66d623d2746294934f4119dd289233869b85886` pin SHA-256 identities and compile
real old viscosity programs. Unchanged inactive no-slip odd/even, inactive/active
free-slip and zero-viscosity paths require exact equality before/after projection.
Independent source and integration reviews passed. The combined viscosity,
thermal-transport and presentation candidate passed 109/109 selected checks in
Chrome 155.0.8059.86, 78/78 in Firefox 151.0 and 78/78 in Playwright WebKit 26.5
on the Apple M2 (2026-10-24), with no skipped tests. All nine historical-program
exact-byte cases and all fifteen crop-placement cases passed in each engine.

Candidate archive SHA-256:
`ef9d65afacd33de8430ef6ca911eeea65d4dd517557fd7cdf8912fd12c17bc83`.
All 754 source hashes remained unchanged before/after each run and the successful
final build. This is bounded desktop-engine evidence, not native Safari/mobile
or general fluid-conservation validation.

Hardware tolerance is preregistered as 0.002 relative maximum velocity error plus
0.000002 absolute error: the fused multiplication precedes a binary16 store,
whereas standalone masking adds one binary16 rounding. Inactive masks require
exact equality. Do not widen this threshold after observing results without
recording a new rationale.
