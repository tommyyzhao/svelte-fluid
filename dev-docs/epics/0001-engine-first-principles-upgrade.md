# Epic 0001 — Engine First-Principles Upgrade

**Status:** Rev 3 (restructured 2026-06-25 after a 10-agent readiness audit + a
9-agent first-principles interrogation; see §8). Rev 2's six-phase monolith is
split into a tight quality epic, a deferred perf/scale epic, and a standalone
render-modes feature. **Phase 1: ✅ shipped** (ADR-0038, −35–40 % frame time on
the production lab page). The restructure, the Phase 0 harness architecture, and
the planning-process fixes are recorded in **ADR-0042** — read it for the *why*
behind every decision summarized here.

**Scope:** `src/lib/engine/` plus the minimum config/preset surface and the
dev-only test/bench harness needed to exercise and validate each change.

**Owner:** engine · **Created:** 2026-06-09 · **Restructured:** 2026-06-25

---

## 1. Motivation (first-principles diagnosis — unchanged from Rev 2)

The engine is a faithful Stam *Stable Fluids* operator-splitting solver
(semi-Lagrangian advection → optional implicit viscosity → wall friction →
Chorin projection via Jacobi) with half-float FBOs and the ADR-0037
advect-before-project ordering. Three places lose physics, and they explain
the visual compromises the presets tune around:

1. **First-order advection** — semi-Lagrangian back-trace + bilinear sampling is
   an aggressive low-pass filter. Vortices die in tens of frames; vorticity
   confinement papers over it with positive-feedback "curl donuts". → **Phase 2.**
2. **Jacobi pressure under-convergence** — Jacobi removes only high-frequency
   divergence; low-frequency divergence persists (dye "compression", apparent
   leakage near obstacles). Phase 1's adaptive paired-Jacobi already bought most
   of the recoverable budget here. → residual addressed (if ever) in **Epic B**.
3. **Binary solid masks staircase curved boundaries** — curved obstructions pin
   spurious vortices to mask steps. → **deferred Phase 3** (variational apertures).

**Resolution-coupling findings** (undocumented behavior the gauge in Phase 5 fixes):
the viscosity Jacobi α (`ν·dt·max(w,h)`) and the vorticity-confinement ε are not
grid-spacing-normalized, so the same `viscosity`/`curl` values behave differently
at different `simResolution`. The divergence/pressure stencils assume uniform grid
spacing — which holds in *screen* space because `getResolution` keeps sim cells
square (see Phase 5).

**What Phase 1 actually shipped (ADR-0038), which Rev 2 predates:** mask multiply
folded into producing passes; a binary face-aperture/neighbor-solidity RGBA8
texture; a warm-start fold; and **adaptive paired Jacobi** (`pressureJacobi2Shader`,
two exact iterations per blit, gated below `PAIRED_JACOBI_MAX_TEXELS` = 150 k).
RG-pressure-packing (1c) and RG32F pressure (1d) were **rejected by measurement**.
Consequence carried through this epic: **the pressure stencil now lives in three
math sites across two shaders** (`pressureShader` + `pressureJacobi2Shader` inner
and outer), so any pressure-stencil change is a triple-copy edit that must stay
bit-identical across the 150 k gate, tested at both a sub- and super-threshold grid.

## 2. Goals / non-goals

**Goals (Epic A — Engine Quality):**
- A real measurement & validation harness so quality claims are testable (Phase 0).
- Second-order advection for genuine vortex longevity (Phase 2, velocity-only).
- Resolution-invariant solver feel via an in-place reference-anchored gauge,
  plus adaptive confinement and the confinement-boundary bugfix (Phase 5).

**Deferred (Epic B — Performance & Scale; Render Modes):**
- Multigrid pressure tier — gated on Phase 3 shipping *enabled* and a reproduced,
  measured under-convergence complaint that the cheap convergence ladder
  (more iterations → Chebyshev/red-black Jacobi → two-grid) cannot fix.
- Frame-time governor — rescoped to a Bucket-A-first shed ladder; the
  `simResolution` tier (its only Phase-5 hard-dep) is deferred from v1.
- Lagrangian tracers — a standalone render-modes feature owning the GLSL ES 3.00
  dialect decision; not part of this solver-physics epic.

**Non-goals:** WebGPU backend; LBM/FFT/BiMocq/IVOCK/wavelet turbulence;
free-surface/liquid; component/docs restructuring beyond what each phase needs.

**Invariants that must hold throughout** (CLAUDE.md): engine never imports Svelte;
no module-level GL state; gl-utils stateless; shaders.ts GL-free; `dispose()` frees
everything explicitly; every new config field is classified into the 4-bucket
`setConfig` system; every engine **decision** gets an ADR (mechanical edits exempt);
**no new *runtime* dependencies** (`dependencies`; devDeps for test/dev infra are
unrestricted — see ADR-0042); `bun run test && bun run check` after every change,
`bun run prepack` before every commit.

---

## 3. Phases (Epic A)

Order: **Phase 0 → { Phase 2 ∥ Phase 5 } → (deferred Phase 3)**. Each phase is one
PR/commit-series ending in the full verification suite. ADR numbers are assigned at
write time (next free = `ls dev-docs/decisions`), **never pre-reserved**.

### Phase 0 — Measurement & validation harness (blocking prerequisite)

Two tools with opposite natures (ADR-0042 §2):

- **Deterministic readback acceptance (CI-gateable).** `FluidEngine.readField()`
  (`@internal`, `gl.readPixels` + RGBA8/FLOAT decode); a no-autostart constructor
  option + `advance(steps, dt)` for synchronous fixed-dt stepping; pure-TS reducers
  (`__benches__/reducers.ts`: l2Norm, divergenceL2, trackPeakAlongPath,
  signChangeCount, fluxAcrossLine, fieldEnergy, hasNonFinite) unit-tested in the node
  tier; a shared scene registry (`__benches__/scenes.ts`: dipole, kelvinHelmholtz,
  rayleighBenard, thinWallTeslaValve) imported by both tests and the bench route; a
  two-project vitest workspace (`node` default + `browser` via `@vitest/browser` +
  Playwright). `bun run test` stays node-only.
- **Interactive timing profiler (not CI-gateable).** A restored `/examples/bench`
  route reading the shared scenes, `EXT_disjoint_timer_query_webgl2` (behind a
  default-off `instrument` ctor flag) with rAF-EMA fallback, `window.__benchResult`
  including `energy`. All ms/fps numbers go in ADRs against a pinned Chromium, never CI.
- **Liveness guard (mandatory):** assert `fieldEnergy > floor && !hasNonFinite` before
  trusting any metric.

**Acceptance:** node tier green (reducers + scene configs + workspace split); the
browser tier runs a dipole/energy smoke scene; the bench route renders a live scene
with a non-zero `energy` readout. ADR at write time.

### Phase 2 — Velocity-only MacCormack advection

Velocity-only second-order advection reusing `velocitySource` (zero new memory).
**No public `advectionScheme`** — internal capability+quality flag compiled once like
`MANUAL_FILTERING` (extend `advectionKeywords`, no runtime Material). Mandatory
limiter (clamp to the forward back-trace's bilinear stencil); first-order fallback
near solids and within 2 cells of an open edge; forced off on no-linear-filtering
devices. Presets retuned with it on. Dye MacCormack **deferred**.

**Acceptance:** node — SL `#else` path byte-identical to pre-change (shader-string
assertion) + a TS mirror of the limiter math (sticky.test.ts pattern). Harness —
dipole vorticity retention ≥ 30 % of initial at x=0.9 @ simRes 128 (SL < 10 %); a
scripted NaN/Inf soak at max `SPLAT_FORCE` with open boundaries. ADR at write time.

### Phase 5 — Resolution normalization + adaptive confinement (consolidation hub)

Reinterpret `viscosity`/`curl` **in place** via the reference-anchored gauge
(`N_ref = 128`, identity at default res); single screen-isotropic
`h = 1/min(simWidth, simHeight)` pinned epic-wide; viscosity shader form untouched
(CPU-coefficient change only). Land adaptive confinement as a `uAdaptiveMix` uniform
(0 = byte-identical legacy) and the confinement-by-fluid-fraction bugfix (existing
binary solid texture). Retune only the 4 resolution-overriding presets.

**Acceptance:** node — analytic resolution-invariance test (effective diffusion- and
confinement-per-frame constant under N for fixed config) + `uAdaptiveMix=0` byte-
identical. Manual — 128↔256 and default-res preset visual QA. Documented minor-bump
changeset listing the 4 retuned presets. ADR at write time.

### Phase 3 — Variational face apertures (DEFERRED; design preserved)

Not committed work. Revive only with the harness present and a reproduced
staircasing/leakage complaint the cheaper phases don't fix. If revived: **program-swap**
mechanism (self-contained variational variant shaders, lazily compiled — *not* a
hot-loop uniform branch, *not* Material-keyword infra across 4 programs); a new
**face-supersampled fractional** bake (inverted fluid-fraction polarity — the Phase-1b
texture is format-compatible only); face-weighted divergence + aperture-sum pressure
diagonal + adjoint gradient applied identically across all **three** pressure-stencil
sites; thin-wall aperture-sum floor. **Boundary normals / free-slip is cut** (orthogonal
physics, muddies the leakage gate). The confinement-boundary bugfix it used to carry
ships in Phase 5 instead.

---

## 4. Cross-cutting engineering rules

- **One phase per PR/commit-series**, ending with `bun run test && bun run check &&
  bun run prepack && bun run build` and the harness's deterministic readback checks.
- **Measurement = Phase 0**, not prose. Deterministic physics metrics gate CI as
  tolerance *bands*; all timing numbers are ADR-recorded against a pinned Chromium +
  recorded `WEBGL_debug_renderer_info`, never a red/green check. Liveness guard before
  any number is trusted (ADR-0038: a blank canvas benchmarks as a fake 120 fps win).
- **Acceptance is within-commit:** "flag-off is byte-identical to the same build with
  the flag off," not "pixel-identical to Phase N-1 output."
- **Shader hygiene:** runtime-switchable variants go through `Material`;
  capability/quality variants (MANUAL_FILTERING, MacCormack) compile once. No runtime
  uniform branch for a per-frame-constant decision in a hot loop.
- **Mobile floor:** the WebGL1 / no-linear-filtering path keeps compiling and running
  every phase, with explicit per-phase capability gates. Degrade, don't break.
- **Determinism:** seeded-RNG reproducibility survives; the new `advance(steps, dt)`
  makes scenes reproducible by decoupling stepping from rAF.

## 5. Decisions (see ADR-0042 for full rationale)

- **Restructure** into Epic A {0,2,5(+deferred 3)} / Epic B {multigrid, governor} /
  Render Modes {tracers}.
- **Phase 5 reverses Rev 2's D1:** reinterpret `viscosity`/`curl` in place with a
  reference-anchored gauge — no new fields, no deprecation debt (pre-1.0).
- **Phase 2 reverses Rev 2's D3 surface:** no public scheme knob; bake on for capable
  devices.
- **Process:** ADR numbers assigned at write time; counts never hardcoded; no-deps
  invariant is runtime-only.

## 6. Risks

| Risk | Phase | Mitigation |
|------|-------|-----------|
| Browser test tier can't run in a restricted/headless env | 0 | Node tier carries the green-gate; browser tier is separate + CI/dev-run only |
| MacCormack ringing at splat fronts / open edges | 2 | Forward-stencil limiter; first-order fallback near solids AND open edges; NaN soak |
| Velocity `velocitySource` reuse clobbered by a future step reorder | 2 | Assert advection-before-viscosity ordering in a comment |
| Reference-anchored gauge drifts a res-override preset's feel | 5 | Identity at N_ref; before/after QA on the 4 res-override presets only |
| Pressure-stencil change diverges single vs paired path | 3 (deferred) | Triple-copy contract; A/B test at sub- and super-150 k grids |
| Reviving deferred work without demonstrated need | 3/B | Hard gate: harness + reproduced user-visible defect/demand |

## 7. Deferred / out-of-scope (Epic B, Render Modes, backlog)

- **Multigrid pressure** — gated on Phase 3 enabled + measured residual complaint;
  prefer the cheap convergence ladder first; if ever built, a single two-grid level,
  not a recursive pyramid; re-derive cost against ADR-0038's pass-bound model.
- **Frame-time governor** — Bucket-A-first ladder (pressureIterations + SUBSTEPS →
  dyeResolution → simResolution), config floors, EMA reset on any Bucket-C rebuild,
  pull-based `getPerformanceState()`. simResolution tier (Phase-5-dep) deferred from v1.
- **Curl-noise turbulence force** — redundant with MacCormack + adaptive confinement,
  taxes the pressure solve; revisit only on real demand, time-evolving, own flag.
- **Lagrangian tracers** — standalone render-modes feature; owns the ES 3.00 decision.
- ~~CI golden-image visual-regression over all presets at fixed seed~~ — declined,
  not deferred; see ADR-0050 (cross-renderer jitter risk + maintenance cost not
  worth it for a decorative, degrade-not-break product; manual visual QA covers
  compositing-pipeline changes instead).

## 8. Review log

- **Rev 1 → Rev 2** (2026-06-09): 4-model panel (Sonnet, Opus, Gemini 3.1 Pro,
  GPT-5.5). Caught wrong fetch-count math, an invalid gradient-subtract fusion, a
  non-adjoint stencil, the ~192× retune magnitude. (Full log retained in git history.)
- **Rev 2 → Rev 3** (2026-06-25): a 10-agent readiness audit + a 9-agent
  first-principles interrogation. Findings: every Phase 2–7 acceptance bar was
  readback/timer-based with **no harness** (the named bench page was deleted in
  `5d1377d`); ADR numbers 0039–0041 collided with shipped work; Phase 1's paired-Jacobi
  triple-copy tax was unmodelled; Phase 1b's texture is format- not semantics-
  compatible with Phase 3. Outcome: harness promoted to a blocking Phase 0; multigrid
  and tracers deferred out of the epic; Phase 3 deferred; Phase 4 dissolved into Phase 5;
  Phase 2 cut to velocity-only with no public knob; Phase 5 switched to an in-place
  reference-anchored gauge; ADR-number pre-reservation and hardcoded counts removed.
  Recorded in ADR-0042.
