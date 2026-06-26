# ADR 0042: Epic 0001 restructure, measurement harness, and planning-process fixes

## Status

Accepted (2026-06-25). Supersedes the phase roster and §4 measurement protocol of
Epic 0001 Rev 2; the epic doc is updated to Rev 3 to match.

## Context

Epic 0001 ("Engine First-Principles Upgrade") shipped Phase 1 (ADR-0038) and then
sat for two weeks while unrelated work landed (obstructionColor / preset registry /
WebGL fallback = ADRs 0039–0041). A two-pass review — a 10-agent readiness audit
followed by a 9-agent first-principles interrogation — found that the Rev 2 plan for
Phases 2–7, written *before* Phase 1 shipped, had drifted badly:

1. **Every Phase 2–7 acceptance bar is readback- or timer-based, and none of that
   infrastructure exists.** Zero `readPixels` in `src`, zero timer-query wiring, the
   test suite is 100% node/mock with no real GL, and the one dev bench page
   (`/obstruction-lab/bench`) that ADR-0038 named as "the §4 measurement harness for
   later phases" was deleted in commit `5d1377d`. The protocol was prose; the tooling
   was fiction. Even Phase 1's own −35–40 % number is no longer reproducible from the
   repo.
2. **Phase 1 shipped a structure the epic never modelled** — adaptive *paired* Jacobi
   (`pressureJacobi2Shader`, gated at 150 k texels). The pressure stencil now lives in
   three math sites across two shaders, so any later pressure-stencil change is a
   triple-copy edit that must stay bit-identical across the 150 k gate.
3. **The epic pre-reserved ADR numbers** (0039→P2 … 0044→P7). Reserving slots in a doc
   that lands months later guaranteed the collision that happened.
4. **Half the roster did not survive "earns its complexity."** Multigrid (Phase 6) is
   the heaviest lift for the narrowest audience (4 of 14 presets, desktop-only,
   default-off) and its core cost claim ("V-cycle ≈ 10 Jacobi") contradicts ADR-0038's
   *measured* finding that the pressure loop is pass-count/latency bound at production
   grids; tracers (Phase 7) bolt a whole GLSL ES 3.00 point-sprite subsystem onto an
   all-ES-1.00 engine for an aesthetic mode orthogonal to the epic's solver-physics
   theme; the variational-aperture core (Phase 3) is an off-by-default, may-"ship-dark"
   projection-operator rewrite for curved obstructions.

## Decision

### 1. Restructure the monolith into three tracks

| Track | Contents | Status |
|-------|----------|--------|
| **Epic A — Engine Quality** | Phase 0 (harness), Phase 2 (MacCormack), Phase 5 (resolution normalization) | **active** |
| **Epic B — Performance & Scale** | multigrid pressure, frame-time governor | deferred backlog |
| **Render Modes** (standalone) | Lagrangian tracers | deferred backlog |

Phase 3 (variational apertures) is **deferred**: its design is preserved in the epic
but it is not committed work. Phase 4 **dissolves** — its one genuine win (adaptive
confinement) folds into Phase 5; its speculative curl-noise force goes to backlog.

**Implementation order for Epic A:** Phase 0 unblocks measurement; Phase 2 and Phase 5
touch disjoint shaders (advection vs. viscosity + a vorticity uniform) and parallelize;
Phase 5 pins the `h` convention and retunes presets before any later phase measures
against them.

### 2. Phase 0 — measurement & validation harness (two tools, not one)

The epic conflated two things with opposite natures. They are split:

- **Deterministic readback acceptance (CI-gateable).** Physics correctness
  (divergence-L2, vortex retention, thin-wall flux, cell count) is machine-independent
  and reproducible, so it belongs in CI as tolerance *bands*. Built from:
  - `FluidEngine.readField(field, opts?)` — `@internal`, `gl.readPixels` into an
    instance-owned staging buffer, RGBA8-encode path (WebGL1/half-float) + direct
    `gl.FLOAT` path when `EXT_color_buffer_float` allows. Imports nothing from Svelte;
    zero hot-path cost (runs only when called); excluded from the published type surface.
  - Deterministic stepping — a constructor option to **not** auto-start rAF, plus
    `advance(steps, dt)` calling the private `step(dt)` a fixed number of times with
    fixed `dt`. Nothing is reproducible while the engine self-drives on wall-clock dt;
    this is the load-bearing addition.
  - `src/lib/engine/__benches__/reducers.ts` — pure-TS, GL-free reducers (`l2Norm`,
    `divergenceL2`, `trackPeakAlongPath`, `signChangeCount`, `fluxAcrossLine`,
    `fieldEnergy`, `hasNonFinite`), unit-tested in the node tier with synthetic arrays.
  - `src/lib/engine/__benches__/scenes.ts` — one importable scene registry (FluidConfig
    + deterministic splat/force schedule + threshold band), keyed `dipole`,
    `kelvinHelmholtz`, `rayleighBenard`, `thinWallTeslaValve`. **Imported by both** the
    browser tests and the dev bench route, so a scene can never again be orphaned by
    deleting a page.
  - A two-project vitest workspace: `node` (existing `src/**/*.test.ts`, every push) +
    `browser` (`src/**/*.browser.test.ts`, `@vitest/browser` + Playwright Chromium,
    real WebGL2). `bun run test` stays the **node tier only**; the browser tier runs via
    a separate script and is **not** in the default green-gate.
- **Interactive timing profiler (NOT CI-gateable).** `EXT_disjoint_timer_query_webgl2`
  results are async, GPU_DISJOINT-invalidatable, and thermal/driver-dependent — they
  cannot be synchronous `expect()`s. A restored `/examples/bench` dev route reads its
  scene from `__benches__/scenes.ts`, exposes `window.__benchResult` (with an `energy`
  field), and offers a per-pass timer path (behind a default-off `instrument` ctor flag)
  with an rAF-EMA fallback. All millisecond/fps numbers are recorded in the relevant
  ADR against a pinned Chromium + recorded GPU string — never a red/green check.
- **Liveness guard (mandatory).** A constructor throw renders a blank canvas that
  benchmarks as a fake 120 fps "win," and an all-zeros readback scores a perfect
  divergence-L2 of 0. Every acceptance test and the bench must assert
  `fieldEnergy > floor && !hasNonFinite` **before** trusting any metric.

### 3. Phase 2 — velocity-only MacCormack, no public knob

- Ship **velocity** MacCormack only (forward trace, backward trace, add half the error),
  reusing the existing `velocitySource` scratch FBO — **zero new memory, ~2 sim passes**.
  Dye MacCormack (the +15 MB dye-res scratch that doubles the frame's most expensive
  pass and contributes nothing to the velocity-field acceptance metric) is **deferred**.
- **No public `advectionScheme` field.** Shipping an enum the plan already intends to
  delete at 1.0 is pre-announced churn. Bake MacCormack on for capable devices via an
  internal capability+quality flag, compiled once like `MANUAL_FILTERING` (extend the
  existing `advectionKeywords` array — **no** runtime `Material` for a cold 2-state
  variant). Tune presets with it on. Keep an internal kill-switch for soak/A-B.
- **Load-bearing keeps:** the Selle-2008 limiter (clamp the corrected value to the
  forward back-trace's bilinear fetch stencil); first-order fallback when either trace
  touches a solid cell **or** is within 2 cells of an open boundary edge; the
  no-linear-filtering capability gate forcing semi-Lagrangian.

### 4. Phase 5 — reinterpret `viscosity`/`curl` in place (no new fields)

- **Reference-anchored gauge, not pure-physical.** Internally
  `α = viscosity·dt·N_actual·(N_actual/N_ref)` and confinement scaled by
  `(N_ref/N_actual)`, with `N_ref = default SIM_RESOLUTION (128)`. The coefficient is
  **identity at the default resolution**, so default-res feel is unchanged and there is
  nothing "silent" to burn trust over. This delivers resolution-invariance (the actual
  goal) with **no new fields, no dual-field arbitration, no 1.0 deprecation debt** — only
  the 4 resolution-overriding presets retune (vs. the Rev 2 "all flow presets, ~192×"
  table). Reverses the Rev 2 panel's D1; justified because at 0.7.x there is no API
  stability contract and the gauge preserves existing default-res output.
- **Single screen-isotropic `h = 1/min(simWidth, simHeight)`**, pinned for the whole
  epic. `getResolution` keeps sim cells square in *screen* space, so one scalar `h` is
  exact — this dissolves the per-axis/geometric-mean anisotropy hand-wringing and keeps
  the viscosity shader's `(L+R+T+B)/(1+4α)` form untouched (Phase 5 is a CPU-coefficient
  change at the `uAlpha`/curl-uniform sites only; **zero** shader edits, FBOs, recompiles).
- **Consolidation hub.** Phase 5 also lands: adaptive confinement as a single
  `uAdaptiveMix` uniform (0 = legacy/byte-identical, 1 = ε·smoothstep(|ω|) — no boolean,
  no keyword); and the confinement-by-fluid-fraction **bugfix** (confinement currently
  injects momentum into boundary-adjacent cells, fighting projection) using the existing
  binary solid texture.
- **Validatable without the harness:** resolution-invariance is a property of the
  coefficient formula, so the primary gate is an analytic/CPU node test (effective
  diffusion- and confinement-per-frame constant under N) plus 128↔256 visual QA. This
  makes Phase 5 the safest, lowest-risk phase and lets it lead.

### 5. Planning-process fixes (apply repo-wide)

- **Stop pre-reserving ADR numbers.** The epic references phases, never numbers; an ADR
  number is claimed (next-free = `ls dev-docs/decisions`) when the file is written.
- **No hardcoded counts.** Strip "31 ADRs" / "~386 tests" from CLAUDE.md and the epic
  §4 "276 tests"; acceptance is "full suite green," not "N tests pass."
- **Acceptance is within-commit, not cross-phase.** Replace "flag-off pixel-identical to
  Phase N-1 output" with "flag-off byte-identical to the same build with the flag off"
  (A/B at one commit), ideally backed by a structural proof (same program/uniforms).
- **The no-deps invariant is runtime-only.** Reworded: "no new *runtime* (shipped)
  dependencies — anything in `dependencies`; devDependencies for test/dev infra are
  unrestricted." `dist`-cleanliness is enforced by the existing publint/prepack gate.
  (`puppeteer-core` is already a devDep precedent.)
- **"Every engine *decision* gets an ADR"** (not "every change") — mechanical edits are
  exempt.

## Consequences

- Epic A is a coherent, shippable quality story; the speculative perf/scale work and the
  orthogonal render mode are honestly deferred behind demonstrated need, not buried in a
  monolith.
- `@vitest/browser` + `playwright` join devDependencies; runtime `dependencies` stays
  empty; `dist` is unchanged (publint/prepack still gate it).
- New `@internal` engine surface (`readField`, `advance`, no-autostart) exists for the
  harness; it is excluded from the published type surface and the docs routes.
- Phase 3/6/governor/tracers are documented but not implemented; reviving any requires
  the harness plus a reproduced, user-visible defect or demonstrated demand.
- Per-phase implementation ADRs (Phase 2, Phase 5, and the harness scenes if needed) are
  written at implementation time, taking the next free number.

## Rejected alternatives

- **Keep the Rev 2 roster and build all of 2–7** — rejected: half fails "earns its
  complexity," and three of six phases are unstartable without the harness anyway.
- **New `kinematicViscosity`/`vorticityConfinement` fields + legacy labels (Rev 2 D1)** —
  rejected: doubles config surface and incurs 1.0 deprecation debt to solve a problem the
  reference-anchored gauge solves with zero new surface.
- **Per-axis anisotropic viscosity coefficient** — rejected: the grid is screen-isotropic,
  so a single `h` is exact and avoids a shader edit.
- **headless-gl / software rasterizer for the acceptance tier** — rejected: WebGL1-only,
  no `EXT_color_buffer_float`/RG32F/timer-queries, and would validate different math than
  ships. Real headless Chromium is non-negotiable.
- **Per-pass timer queries as CI assertions** — rejected: async + GPU_DISJOINT + thermal
  variance make them structurally unfit for synchronous, reproducible checks.
