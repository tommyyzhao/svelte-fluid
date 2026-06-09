# ADR-0038: Solver Pass Restructuring (Epic 0001, Phase 1)

## Status

Accepted

## Context

Epic 0001 Phase 1 targets ≥25% measured frame-time reduction on flow presets
with zero behavior change. The plan (rev 2, panel-reviewed) called for: folding
mask multiplies into producing passes (1a), a face-aperture boundary texture
(1b), a divergence/warm-start merge via RG pressure packing (1c), and optional
full-float pressure (1d).

**Profiling overturned half the plan.** A pressure-iteration sweep on the
dev-only benchmark page (`/obstruction-lab/bench`, Apple-Silicon Mac, Chrome
ANGLE/Metal, 120 Hz display) showed ~41 µs per Jacobi blit at a 910×512 grid —
the loop is **pass-count/latency bound** (render-pass encoder overhead per
ping-pong), not bandwidth bound. Per the epic's own measurement protocol, every
claim below is tied to interleaved A/B numbers, not the fill-rate model.

## Decision

### Shipped

1. **Inline container/obstruction masking (1a).** `applyMaskShader`'s mask
   computation is duplicated into a shared `inlineMaskGLSL` chunk injected into
   the advection, viscosity, and gradient-subtract shaders, gated by
   `uApplyInlineMask`. The step loop's standalone `applyMask` ping-pong blits
   (3×/substep on velocity, 1×/substep at dye resolution) are gone. The mask
   multiply count per substep is unchanged (advect, last viscosity iteration,
   gradient subtract), so AA-fringe attenuation matches the old behavior. The
   standalone program remains for the prescribed-mode path.
2. **Face-aperture neighbor texture (1b).** `bakeSolidNeighborData()`
   (container-shapes.ts, unit-tested against a GLSL-faithful reference) bakes
   per-cell (L, R, T, B) neighbor solidity into a sim-resolution RGBA8 texture,
   rebuilt on solid-mask and `simResolution` changes. Divergence, pressure, and
   gradient-subtract/viscosity do 2 fetches (apertures + center) instead of 5
   dependent probes. Binary-valued now; the format is forward-compatible with
   Phase 3 fractional apertures. Wall friction keeps its own probes (2-ring
   kernel, runs once per substep).
3. **Warm-start fold (1c, revised).** The standalone clear pass is gone: Jacobi
   reads the previous iterate only through neighbor fetches, so iteration 0
   scales them by `PRESSURE` (`uPressureScale`), reproducing the old
   `clearProgram` blit exactly. `pressureIterations: 0` keeps the old clear
   pass so stored pressure still decays.
4. **Adaptive paired Jacobi.** `pressureJacobi2Shader` computes two exact
   Jacobi iterations per pass (inner iterate evaluated at center + 4 neighbors;
   positions clamped to texel centers so CLAMP_TO_EDGE behavior is identical;
   sticky pressure applied at both levels; warm-start fold on the first pair's
   inner level). Used only when the sim grid is ≤ `PAIRED_JACOBI_MAX_TEXELS`
   (150k texels), because the win/loss flips with grid size (below).

### Measured (interleaved A/B on the same hardware/session)

| Workload | Old | New | Δ |
|---|---|---|---|
| Production lab page (7 presets, sim 128–192) | 28.6 ms | **17.0–18.6 ms** | **−35–40%** |
| High-res mix (sim 768, pairs auto-disabled) | 24.0 ms | 18.7–19.2 ms | −20% |
| Folds only, production lab (pairs off) | 28.6 ms | 25.5 ms | −11% |

### Rejected by measurement

- **RG pressure packing (divergence in G):** every neighbor fetch in the hot
  loop drags the extra channel along — measured no better than baseline.
  Pressure stays R16F with a separate divergence texture.
- **RG32F pressure (1d):** ~3% slower on the stressed bench (4× bandwidth in
  the dominant loop). Removed entirely; revisit only if Phase 6 multigrid needs
  the precision at coarse levels.
- **Unconditional paired Jacobi:** at 768-class grids the ~33-fetch inner
  stencil makes passes fragment-bound and pairs measured *slower* (25–30 ms vs
  19 ms). Hence the texel-count gate. The crossover between 192- and 768-class
  grids is unmeasured; the threshold is conservative. The Phase 7 governor can
  revisit.
- (Pre-declared in the epic, confirmed unnecessary: gradient-subtract fusion,
  curl+vorticity fusion.)

## Hard-won correctness notes

- **Uniform precision must match across stages.** `texelSize` declared under
  `precision mediump float` in a fragment shader link-fails against the highp
  vertex declaration on ANGLE — and a constructor throw renders a blank canvas
  that *benchmarks as a 120 fps "win"*. Never trust a perf number without
  visually confirming the sim renders.
- **Sampler units must never go stale.** ANGLE flags a framebuffer feedback
  loop whenever a sampler's unit holds the render target, regardless of dynamic
  branching. The speed-visualization display pass leaves `velocity.read` on
  unit 5; a viscosity iteration whose `uObstructionMask` sampler still pointed
  there (from a previous frame's bind) tripped GL_INVALID_OPERATION every
  frame. `bindInlineMaskUniforms` / `bindSolidMaskUniforms` now always bind
  every sampler they own to its dedicated unit (real texture or the 1×1
  fallback), active or not.

## Consequences

- Production flow presets get a ~35–40% frame-time cut with no API change and
  no visual change (full preset visual QA + zero console warnings verified).
- Texture-unit map for solver passes: advection 0–3 + 7; viscosity 0–5;
  gradient subtract 0–5; divergence/pressure 0–3 + 7. All ≤ 8.
- The dev-only benchmark page (`/obstruction-lab/bench`, URL-tunable via
  `?pi=&sub=&vi=&sim=&dye=&vis=&curl=`) is the epic §4 measurement harness for
  later phases.
- Phase 2 (MacCormack) inherits the lesson: assume pass-bound at production
  grids, fragment-bound at high grids; measure both regimes before committing.
