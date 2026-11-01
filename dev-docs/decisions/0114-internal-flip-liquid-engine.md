# ADR 0114: Internal free-surface PIC/FLIP liquid engine

**Status:** Accepted (internal; not exported)
**Date:** 2026-10-30
**Amended by:** ADR 0116 (exported from `svelte-fluid/experimental`)

## Context

The `/puzzles` game rebuild ("Verdigris") needs liquid with volume and weight:
it pours, pools, fills urns, presses plates and is finite. `FluidEngine` is a
single-phase smoke solver: every cell is fluid, dye is passive and weightless,
and its divergence/pressure stencils assume a filled domain
(`shaders.ts` divergence/pressure). Five earlier prototypes built on passive
dye were judged not fun because the fluid had no consequence. The owner chose
to extend the engine rather than add a dependency (LiquidFun) or a route-local
solver.

## Decision

Add `src/lib/engine/liquid/` — a sibling engine, `LiquidEngine`, implementing
grid–particle PIC/FLIP on a staggered (MAC) grid:

- Marker particles (RGBA32F position/velocity textures, species and drain
  state in a second texture) carry liquid identity, so the amount of each
  species is exact: `alive + drained == seeded + emitted`, per species.
- Each substep: particle-to-grid splat (instanced points, additive float
  blend) → liquid/air/solid classification → gravity → divergence with a
  bounded density-correction term → Jacobi pressure with air cells at p = 0
  and Neumann solid faces → projection → velocity extrapolation into air →
  grid-to-particle (FLIP/PIC blend) → RK2 advection with solid push-out.
- Terrain is a CPU-owned cell grid (stone, loam, ink, gate, vine) uploaded on
  change; markers inside newly solid cells are pushed to air, never deleted.
- Counting regions, drains and an occupancy grid are reduced on the GPU and
  read through a non-blocking PBO/fence ring, tick-tagged. No per-tick
  full-field readback.
- Three equal-density miscible species; rendering splats per-species density,
  blurs, thresholds a surface and mixes colour with the existing
  Kubelka–Munk helpers (`pigment/spectral.ts`).
- Requires WebGL2 with `EXT_color_buffer_float` and `EXT_float_blend`;
  otherwise construction throws `WebGLUnavailableError` and the game shows a
  refusal. It owns its context (one heavy engine per page) and frees every
  resource on dispose without `loseContext()`.

Not exported from `src/lib/index.ts`; no `FluidEngine`, config, preset,
default or docs change. Same-device repeatability only; no cross-GPU
determinism claim.

### Implementation notes

- Pressure uses warm-started red–black SOR (ω = 1.8), 24 full iterations per
  substep rather than Jacobi. Two 1/120 s substeps, three velocity extrapolation
  layers, gravity 300 cells/s² and the scene's 150 cells/s default speed cap.
  The PIC/FLIP blend is 30% PIC, 70% FLIP, with 0.45/s exponential marker drag.
  PIC damps local noise but cannot dissipate a spatially uniform U-tube plug-flow
  mode; the weak drag settles that macroscopic oscillation within ten seconds.
- Density correction uses a solid-aware 3×3 tent-filtered marker count,
  rest density four markers/cell, a 15% sampling-noise dead band and gain 8/s
  (clamped excess ≤3). Applying the one-sided correction to raw integer counts
  continuously inflated resting pools as random subcell marker counts changed.
- Particle textures use y-down rows directly; presentation alone flips y.
  A three-slot PBO ring snapshots CPU emission and compacted-drain totals at
  enqueue time. `compact()` retains pending snapshots, preserving tick accuracy.
- `_debugParticles()` is an internal synchronous test/diagnostic hook returning
  `{ a, b, slots, tick, epoch }`; it is not part of `LiquidSim` or root exports.
- The 64×64 linear-RGB pigment simplex preserves palette endpoints by correcting
  the reduced spectral bands' pure-colour error. A modest mixture-only chroma
  and lightness lift keeps greens fresh without changing pure endpoints.
  Rendering uses half-size
  density targets, exact-subpixel 3.5-cell Gaussian splats, a cell-scaled
  17-tap separable Gaussian, an anti-aliased threshold and premultiplied
  highlights. A short continuous upward density probe estimates optical depth
  for Beer–Lambert absorption beneath the meniscus; colour always comes from
  normalized species fractions. Light-paper and dark-teal captures exercise
  transparency. No simulation readback is needed for rendering.

## Consequences

- The game's objective can be the liquid itself, with exact accounting for
  finite supply, recipes and contamination.
- New GPU code path to maintain; it is covered by its own browser tests
  (conservation, leakage, communicating vessels, sensor exactness).
- Devices without float blending cannot run it. A half-float fallback is
  deferred until a target device needs it.
- Rejected: level-set/VOF on the existing semi-Lagrangian grid (volume drift
  and lost thin streams would break finite-supply accounting); thresholding
  dye (no volume); LiquidFun (new dependency, owner preference); falling-sand
  automata (granular look, owner preference).
- Promotion to a public `<Liquid>` component needs a new ADR and docs.
