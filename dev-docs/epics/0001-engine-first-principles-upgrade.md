# Epic 0001 — Engine First-Principles Upgrade

**Status:** Rev 2 (revised after 4-reviewer panel: Sonnet, Opus, Gemini 3.1 Pro,
GPT-5.5 — all blocking findings from rev 1 addressed; see §8)
**Phase 1: ✅ shipped** (ADR-0038). Measured −35–40% frame time on the
production lab page (target was ≥25%). Outcome deltas vs plan: profiling
showed the Jacobi loop is pass-count bound at production grids, so 1c's RG
packing and 1d's RG32F pressure were rejected by measurement; an adaptive
paired-Jacobi pass (two exact iterations per blit, gated by grid size) was
added instead. Phase 2 planning must use the two-regime cost model
(pass-bound ≤192-class grids, fragment-bound ≥768-class).
**Scope:** `src/lib/engine/` only, plus the minimum config-field and preset
surface needed to exercise each engine change. Large-scale framework updates
are out of scope (next session).
**Owner:** engine
**Created:** 2026-06-09

---

## 1. Motivation (first-principles diagnosis)

The engine is a faithful Stam *Stable Fluids* operator-splitting solver
(semi-Lagrangian advection → optional implicit viscosity → wall friction →
Chorin projection via Jacobi) with half-float FBOs and the ADR-0037
advect-before-project ordering. Three places lose physics, and they explain
every visual compromise the presets currently tune around:

1. **First-order advection** — semi-Lagrangian back-trace + bilinear sampling
   is an aggressive low-pass filter. Vortices die in tens of frames; vorticity
   confinement papers over it with positive-feedback "curl donuts".
2. **Jacobi pressure under-convergence** — Jacobi removes only high-frequency
   divergence. Public empirical comparisons (vassvik) show ~1000 Jacobi
   iterations ≈ one multigrid V-cycle ≈ the cost of ~10 Jacobi iterations.
   Karman spends 34 iterations × 2 substeps and still carries low-frequency
   divergence (dye "compression", apparent leakage near obstacles).
3. **Binary solid masks staircase curved boundaries** — solver passes branch on
   `solidAt(uv) > 0.5`; curved obstructions (Airfoil, Venturi throat) pin
   spurious vortices to mask steps. The anti-aliased coverage the SVG
   rasterizer produces is thresholded away before the solver sees it.

**Cost budget (Karman, heaviest preset), exact per-substep pass table:**

| Pass | Count | Resolution |
|------|-------|------------|
| curl | 1 | sim (192) |
| vorticity | 1 | sim |
| advect velocity | 1 | sim |
| applyMask velocity | 1 | sim |
| viscosity source copy | 1 | sim |
| viscosity Jacobi | 8 | sim |
| applyMask velocity | 1 | sim |
| wall friction | 1 | sim |
| divergence | 1 | sim |
| pressure clear (warm start) | 1 | sim |
| pressure Jacobi | 34 | sim |
| gradient subtract | 1 | sim |
| applyMask velocity | 1 | sim |
| **sim-res subtotal** | **53** | |
| advect dye | 1 | dye (1024) |
| applyMask dye | 1 | dye |
| outlets (dye) | 1 | dye |

× 2 substeps, + bloom/sunrays/display. Pressure Jacobi alone is 34/53 ≈ 64%
of sim-res passes. One dye-res pass ≈ (1024/192)² ≈ 28 sim-res passes of
fill, so the dye-res `applyMask` is the single most expensive solver pass in
the frame. (When a scalar field is active, add advect+mask+outlet at dye res.)
These counts are derived from `step()`; the Phase 1 improvement target is
judged against **measured** baseline timings, not this table (§4).

**Dimensional-consistency findings** (resolution-coupled behavior, currently
undocumented):

- Viscosity Jacobi α is `ν·dt·max(w,h)` (`FluidEngine.ts:2467`). The
  physically consistent implicit-diffusion coefficient is `ν·dt/h²` — and the
  grid is **anisotropic** (`getResolution` produces width ≠ height;
  `texelSize.x ≠ texelSize.y`), so there is no single `N²`. The same
  `viscosity` value behaves differently at different `simResolution`.
- Vorticity confinement ε is not grid-spacing-scaled (Fedkiw's ε·h), so
  `curl: 18` feels different across resolutions.
- The divergence (`0.5·(R−L+T−B)`) and pressure (`0.25` factor) stencils
  assume uniform grid spacing, which the anisotropic grid violates today.
  This is a pre-existing approximation that Phase 3's variational work will
  expose; it is acknowledged there explicitly.
- The curl/vorticity passes are solid-mask-blind: confinement injects
  momentum into boundary-adjacent cells, fighting the projection exactly
  where staircasing already hurts.

## 2. Goals / non-goals

**Goals**

- Reduce measured per-frame GPU cost of flow presets by ≥25% with zero visual
  change (Phase 1), creating headroom for quality features.
- Second-order advection as an opt-in scheme (Phase 2).
- De-staircase curved obstructions via variational face apertures behind an
  experimental flag (Phase 3).
- Cheap liveliness (curl-noise, adaptive confinement) for low-res mobile
  (Phase 4).
- Resolution-normalized solver fields as a precondition for the governor
  (Phase 5).
- Multigrid pressure as a quality tier for CFD-flavored presets (Phase 6).
- Tracer-particle render mode + frame-time governor (Phase 7).

**Non-goals**

- WebGPU backend (revisit in 12–18 months; keep GL boundary clean).
- LBM engine, FFT pressure, BiMocq/IVOCK/full wavelet turbulence,
  advection-reflection (deferred; see research survey rationale).
- Free-surface / liquid effects (out of reach for a single-phase grid solver).
- Component/docs-site restructuring beyond what each phase's testing needs.

**Invariants that must hold throughout** (CLAUDE.md): engine never imports
Svelte; no module-level GL state; gl-utils stateless; shaders.ts GL-free;
dispose() frees everything explicitly (including any new FBO pyramids and
scratch targets); every new config field is classified into the 4-bucket
`setConfig` system; engine changes get an ADR; no new runtime dependencies;
`bun run test && bun run check` after every change, `bun run prepack` before
every commit.

---

## 3. Phases

Phases land in order; 6 hard-depends on 3, and 7's governor hard-depends on 5
(normalization). Each phase is independently shippable and testable.

### Phase 1 — Cost reduction (no algorithm change, no visual change)

The point: every later phase spends GPU; this phase buys the budget.
**Hard acceptance bar: visually indistinguishable output** (pixel-diff QA on
all presets) — anything that changes solver feel is out of this phase.

**1a. Fold mask multiplication into producing passes.**
Advection, gradient-subtract, and viscosity already write the target field;
multiply by the container/obstruction mask inside those shaders (shared GLSL
helper extracted from `applyMaskShader`) and delete the separate `applyMask`
ping-pong passes in the step loop (3×/substep on velocity, 1×/substep at dye
resolution — the latter is the most expensive solver pass in the frame).
The standalone `applyMask` program stays for non-step uses until all call
sites migrate.
*Files:* `shaders.ts` (advection, gradientSubtract, viscosity), `FluidEngine.ts`
(`step()`, `advectDye`, `advectScalar`, uniform plumbing).
*Precondition (hard gate before coding):* per-pass texture-unit map written
into ADR-0038. Solver passes currently bind ≤4 units; the display pass's 0–7
exhaustion is a separate, already-handled concern. Each fused pass is audited
individually against the WebGL minimum of 8 units.
*Risk:* the analytic-shape smoothstep SDF must produce identical masks in its
new inline location; svgPath path binds the mask texture in the new passes.

**1b. Face-aperture boundary texture (format forward-compatible with Phase 3).**
Precompute one **RGBA8 texture at sim resolution** holding the four
face apertures (L, R, T, B ∈ [0,1]; **binary-valued 0/255 in this phase**),
plus the existing R8 center-solidity mask. Divergence, pressure (×N),
gradient-subtract, and viscosity then do **2 fetches (apertures + center)
instead of 5** dependent `solidAt` probes. Rebuilt on the existing solid-mask
trigger *and* on `simResolution` change (extend Bucket C).
Phase 3 later writes fractional values into the *same* texture — no format
rewrite. Wall friction (9 probes at `wallFrictionWidth: 2`) keeps its own
sampling: it runs once per substep, not 34×, and its 2-ring kernel doesn't fit
the face-aperture encoding; it is explicitly out of scope of the fetch-count
claim.
*Files:* `FluidEngine.ts` (`initSolidMaskTexture` → also emit aperture
texture), `shaders.ts` (aperture decode helper replacing neighbor probes).

**1c. Divergence/clear merge via pressure packing.**
Pressure becomes an RG16F double-FBO: R = pressure, G = divergence. One merged
pass computes divergence from velocity *and* applies the warm-start scaling
(`pressure_old × PRESSURE`) into R — eliminating both the standalone
divergence FBO/pass and the separate clear pass. Each Jacobi iteration reads
RG of one texture (center G = divergence) and passes G through.
**Dropped from rev 1 after review:** fusing gradient-subtract into the last
Jacobi iteration (needs *updated* neighbor pressures — not expressible in one
fragment pass — and would lose the final iterate for next frame's warm start),
and fusing curl+vorticity (the fused stencil needs ~13 unique velocity fetches
vs 10 across the two passes; the only win is one draw call, and mobile texture
cache behavior makes it a measure-first experiment, not a planned change).

**1d. Pressure precision.**
Where `EXT_color_buffer_float` exists, allocate the pressure RG target as
RG32F (pressure uses NEAREST, so non-filterable float is fine); keep the
half-float fallback. Removes FP16 pressure banding on long iteration runs.

**Acceptance:** full vitest suite green (plus new unit tests for aperture
encode/decode and the merged divergence/warm-start pass); svelte-check clean;
pixel-level visual QA on all presets shows no regression; **measured** frame
time on Karman/TeslaValve/Venturi improves ≥25% vs the §4 baseline; `prepack`
passes.
**ADR:** 0038 — solver pass restructuring and face-aperture boundary masks.

### Phase 2 — MacCormack advection (opt-in scheme)

Opt-in second-order advection: forward semi-Lagrangian trace, backward trace
of the result, add half the error to the forward result.

- New config field `advectionScheme: 'semilagrangian' | 'maccormack'`
  (default `'semilagrangian'`).
- **Program management (explicit, per review):** `advectionProgram` becomes an
  `advectionMaterial: Material` with runtime `setKeywords()` (today only the
  display shader is a Material; `MANUAL_FILTERING` is compiled once from
  hardware capability and is *not* runtime-switchable). `updateKeywords()`
  composes `['MACCORMACK'] + ['MANUAL_FILTERING']` as applicable; `setConfig`
  treats `advectionScheme` as Bucket B.
- **Scratch FBO (explicit, per review):** MacCormack needs the original field,
  the forward result, and the correction target simultaneously — a DoubleFBO
  is insufficient. Velocity reuses the existing `velocitySource` scratch FBO
  (sim res). Dye opt-in allocates one extra dye-res FBO (~15 MB RGBA16F at
  1024 on a 16:9 canvas) — allocated only while `advectionScheme` is
  `'maccormack'` *and* dye participation is enabled; freed in `dispose()` and
  on scheme switch-off.
- **Limiter (mandatory):** clamp the corrected value to the min/max of the
  **forward back-trace's bilinear fetch stencil** (the 4 texels sampled when
  fetching φⁿ at the back-traced position — Selle et al. 2008). This
  suppresses new extrema; it does **not** make the scheme unconditionally
  stable in this engine's environment (sources, masks, clamps, sticky
  pressure, outlets) — the existing ±1000 velocity clamp and NaN soak tests
  remain the backstop.
- **Fallback guards:** revert to plain semi-Lagrangian per-texel when
  *either* trace's fetch stencil touches a solid cell, **or** within 2 cells
  of any open boundary edge (open-edge back-traces sample clamped UVs and are
  the most probable overshoot site — Karman has open inflow/outflow).
- **Capability gate:** on no-linear-filtering devices (`MANUAL_FILTERING`
  path), `advectionScheme` is forced to `'semilagrangian'` — the manual-bilerp
  + limiter + guard combination exceeds practical mobile fragment budgets.
- Cost: ~2 extra sim-res passes (velocity); ~2 dye-res passes if dye opted in.

**Validation scenes (obstruction lab; public presets are a later decision):**
- Kelvin–Helmholtz: two opposing horizontal line-source streams with a dye
  interface.
- Dipole benchmark: paired splats launching self-propelled dipoles.

**Acceptance (quantified):** scheme off → pixel-identical to Phase 1 output;
scheme on → in the dipole scene at simResolution 128 with fixed seed, a dipole
launched at x=0.1 retains a tracked vorticity peak ≥30% of its initial
magnitude at x=0.9 (readback-based test harness measurement; with
semi-Lagrangian it falls below 10%); 5-minute NaN/Inf soak at max
`SPLAT_FORCE` with open boundaries passes; config plumbing + Material
recompile tests; ADR 0039.

### Phase 3 — Variational face apertures (experimental flag) + boundary normals

**Decision settled in review (was D2):** the production solver path keeps
**binary** classification everywhere it exists today — the `applyMaskShader`
field clip stays strictly binary (`> 0.5`), the per-cell solid early-exits
stay binary, and the display/solver threshold agreement from ADR-0037 is
preserved. What changes: the divergence and pressure-gradient **stencil
weights** may become fractional, behind an experimental flag. (Rev 1
mischaracterized this as reversing the prior binary decision; the prior
decision was about the field-multiply clip, which is untouched.)

- `experimentalFractionalBoundaries: boolean` (default false; Bucket B-ish —
  triggers aperture-texture re-bake + keyword).
- **Aperture computation:** per-face fluid fractions sampled at **sim
  resolution** during the existing CPU mask rebuild — supersample the
  combined mask along each cell face (not the 512-raster alpha coverage,
  which is cell-area coverage, not face aperture). Written into the Phase 1b
  RGBA8 texture.
- **Discretization (per review — the math that makes it sound):**
  - Divergence: `div = Σ_faces aperture_f · u_f · s_f` (face-weighted).
  - Pressure Jacobi: denominator becomes the **per-cell sum of fluid face
    apertures** (the matrix diagonal), not the constant 4; cells with
    aperture sum < floor are treated fully solid (thin-wall floor).
  - Gradient subtract uses the **same face weights** (the discrete gradient
    must be the adjoint of the discrete divergence, or projection does not
    remove divergence).
  - Anisotropy: face weights incorporate dx/dy spacing factors, fixing the
    pre-existing uniform-spacing assumption on non-square grids as part of
    the same rediscretization.
- **Boundary normals:** Sobel of the fractional mask → normal texture (rebuilt
  with the mask). Used only for the slip/friction force: free-slip
  **preserves the tangential component and removes the normal component**
  near boundaries, replacing part of the wall-friction damping hack.
- Mask the vorticity-confinement force by fluid fraction (fixes
  confinement-vs-projection fighting at obstacle edges) — this part ships
  regardless of the flag (it is a pure bugfix).

**Acceptance (quantified, per review — visual QA alone is insufficient):**
- Thin-wall leakage test: dye flux through a 1-cell TeslaValve wall over a
  60 s fixed-seed run, measured by readback, ≤ the binary baseline.
- Post-projection divergence L2 (readback harness) with apertures ≤ binary
  baseline on Airfoil/Venturi at simResolution 128–192.
- Visual QA: no diagonal stair artifacts on Airfoil at 128; no seam noise
  regression on any preset with the flag off (flag-off must be pixel-identical
  to Phase 2 output).
- If leakage or seam criteria fail, the flag ships dark/undocumented and
  Phase 6 is re-scoped (see Phase 6 dependency note); ADR 0040.

### Phase 4 — Turbulence seasoning (cheap liveliness)

- `turbulence: { strength, scale }` (Bucket A): curl-of-noise force as **its
  own small pass** called from `step()` alongside vorticity confinement, gated
  on `strength > 0` — *not* folded into `applyFlowForces`, which early-returns
  when no `flow` config exists and must keep working for plain `<Fluid />`.
  Noise via in-shader hash (no new dependencies); randomness seeded from the
  engine `Rng` (determinism invariant).
- **Honesty note (per review):** curl-of-noise is solenoidal analytically, but
  (a) the discrete curl/divergence stencils are not exact adjoints here, and
  (b) scaling it by dye density breaks solenoidality wherever the weight has a
  gradient. The force is *approximately* divergence-free; the projection
  removes the residual. Keep the density weight smooth, and document that
  this term mildly loads the pressure solve.
- Adaptive confinement: modulate ε by `smoothstep` of |ω| so confinement
  amplifies existing structures instead of uniform donuts. Internal change;
  presets needing legacy behavior get `curlAdaptive: false`.
- **Validation scene:** Rayleigh–Bénard (hot bottom line source, top cooling
  drain, buoyancy) in the obstruction lab.

**Acceptance (quantified):** Bénard at fixed seed/config forms ≥3 distinct
counter-rotating cells (vorticity sign changes along the midline, readback)
within 30 s and maintains bounded max |v| over a 5-minute soak with no
NaN/Inf; turbulence off → pixel-identical to Phase 3; ADR 0041.

### Phase 5 — Resolution-normalized solver fields

(Was Phase 1e; pulled out per unanimous review — bundling a behavior change
into the "zero visual change" phase contradicted Phase 1's own acceptance bar,
and silently reinterpreting published fields burns trust.)

- New fields `kinematicViscosity` and `vorticityConfinement` defined with
  grid-spacing-aware coefficients (`α = ν·dt/h²` per axis with the actual
  texel sizes; ε·h with h = geometric mean of dx,dy — pick once, document in
  the ADR). Existing `viscosity`/`curl` are untouched legacy tuning knobs
  (documented as resolution-coupled); using both is a config error resolved
  in favor of the normalized field.
- Migrate the 5 flow presets to the normalized fields (expect ~2 orders of
  magnitude numeric change: current `viscosity 0.014` at N=192 ≈ normalized
  α scale ×192 — the retune table goes in the ADR with before/after
  screenshots).
- Plan of record: legacy fields deprecated at 1.0.
- This phase is a **hard precondition for the Phase 7 governor** (runtime
  `simResolution` changes must not change solver feel).

**Acceptance:** presets on normalized fields are visually indistinguishable
from their legacy-field tuning (side-by-side QA); changing `simResolution`
128↔256 with normalized fields preserves qualitative behavior (dipole
benchmark decay rate within 2× across resolutions vs ~192× coupling today);
changeset documents the addition; ADR 0042.

### Phase 6 — Multigrid pressure (quality tier) — **hard-depends on Phase 3**

V-cycle Poisson solver as `pressureSolver: 'jacobi' | 'multigrid'`
(default `'jacobi'`).

- **Dependency (explicit):** the coarse-grid machinery requires Phase 3's
  variational apertures — coarsening restricts the **fluid fractions** and
  **rebuilds the variational stencil per level from the restricted
  fractions** (Galerkin-flavored rediscretization), *not* a fixed 5-point
  Laplacian with a binary-ish mask, which adds low-frequency error and leaks
  through thin walls. If Phase 3's flag fails its leakage acceptance, this
  phase is re-scoped (binary wall-preserving coarsening is a research task,
  not a plan of record).
- Pyramid of R/RG float FBOs from sim res down to ~8×8 (≈1.33× one pressure
  texture extra memory). Smooth (2–3 Jacobi) → restrict residual → recurse →
  prolongate+correct → smooth. ~25 small draw calls/cycle ≈ cost of ~10
  Jacobi iterations; draw-call overhead is the mobile risk — measure
  on-device early; tier stays opt-in.
- Must specify and test: warm-start interaction (the `PRESSURE` memory
  coefficient), sticky-pressure term, open-boundary edges at coarse levels.
- Lifecycle: `multigridFBOs: FBO[]` freed in `dispose()` and rebuilt on
  Bucket C triggers (`simResolution`, mask change) — CLAUDE.md invariant 6.

**Acceptance (quantified):** post-projection divergence L2 (readback) with
1 V-cycle ≤ Jacobi-200-iteration level, at measured cost ≤ Jacobi-15; no
leakage regression on TeslaValve; tier off → pixel-identical to Phase 5;
ADR 0043.

### Phase 7 — Tracer render mode + frame-time governor

- **Tracers (WebGL2-only, per review):** Lagrangian tracer points in a small
  RGBA position texture, advected by one fragment pass, rendered as point
  sprites (vertex `texelFetch` + `gl_VertexID`) into the dye buffer.
  `tracers: { count, color, fade }` config group. **Silently no-ops on WebGL1
  contexts** (`ext.isWebGL2` check) — the mobile-floor rule is satisfied by
  graceful degrade, not parity. Seeded from the engine `Rng`.
- **Governor:** opt-in `autoPerformance` — EMA frame time; shed
  `pressureIterations` first, then `dyeResolution`, then `simResolution`,
  with ≥3 s hysteresis (mobile drivers stall on FBO rebuilds). State exposed
  via a **pull-based `getPerformanceState()` getter** (mirrors the `isPaused`
  pattern); no event-emitter/callback surface — that design belongs to the
  framework epic. Requires Phase 5 (normalized fields) so resolution shifts
  don't change solver feel.

**Acceptance (quantified):** tracer advection+render adds ≤1 ms/frame at
10k points on the reference desktop GPU (§4); governor under a synthetic
4× CPU-throttle load converges to a stable tier within 15 s and does not
oscillate (no more than one resolution rebuild per 10 s window); ADR 0044.

---

## 4. Cross-cutting engineering rules

- **One phase per PR/commit-series**; each ends with the full verification
  suite: `bun run test && bun run check && bun run prepack && bun run build`,
  plus browser visual QA of all 14 presets + obstruction lab.
- **Measurement protocol (before Phase 1, then per phase):** a dev-only
  benchmark page in the obstruction lab records (a) per-pass GPU timings via
  `EXT_disjoint_timer_query_webgl2` where available, else (b) frame-time EMA
  over 600 frames, for Karman/TeslaValve/Venturi at a fixed canvas size.
  Reference hardware: this dev machine (note GPU in the ADR) + one real
  mobile device when available, else Chrome 4× CPU throttle as a stated
  proxy. Every performance claim in an ADR cites these numbers. Test-count
  claims are never baked into acceptance criteria ("full suite green");
  CLAUDE.md's stale "276 tests" is fixed alongside this epic.
- **Shader program hygiene:** runtime-switchable compile-time variants go
  through the `Material` keyword system (display today, advection from
  Phase 2); capability-derived variants (e.g. `MANUAL_FILTERING`) stay
  compile-once. Never runtime-uniform branches for per-frame-constant
  decisions in hot loops; audit combined keyword count.
- **Mobile floor:** the WebGL1 / no-linear-filtering path must keep compiling
  and running in every phase, with explicit per-phase capability gates
  (MacCormack: forced off; tracers: no-op; multigrid: requires WebGL2 float
  color buffers). Degrade, don't break.
- **Determinism:** seeded-RNG reproducibility must survive: tracers and
  turbulence noise take randomness from the engine `Rng`.

## 5. Decisions settled by the review panel

- **D1 (resolution normalization)** → new normalized fields in their own
  phase (Phase 5), legacy fields untouched until 1.0; pulled out of Phase 1
  entirely. (Unanimous direction across reviewers; formula corrected to
  per-axis `ν·dt/h²`.)
- **D2 (fractional vs binary masks)** → not a reversal of the prior binary
  decision: the binary field clip and cell classification stay; fractional
  values enter only as variational stencil weights behind an experimental
  flag with quantitative leakage acceptance. (Unanimous.)
- **D3 (MacCormack default)** → opt-in now, stays opt-in for at least one
  release cycle; plan of record is to make it the unconditional baseline at
  1.0 and *remove* the config knob rather than flip a default. (Unanimous.)

No open strategic decisions remain that block Phase 1. The one item flagged
for human awareness: Phase 5 adds two public config fields and a documented
"legacy" label on `viscosity`/`curl` — surfaced in that phase's changeset.

## 6. Risks

| Risk | Phase | Mitigation |
|------|-------|-----------|
| Inlined mask differs subtly from `applyMask` (AA seam shift) | 1a | Shared GLSL helper, pixel-diff QA, old path behind debug flag |
| Aperture texture mis-encodes at sim-res/mask-res boundary | 1b | Unit tests on encode/decode; TeslaValve canary |
| MacCormack ringing at splat fronts / open edges | 2 | Stencil min/max limiter; first-order fallback near solids AND open edges; NaN soak test |
| Dye-res MacCormack memory (+~15 MB) surprises mobile | 2 | Allocated only when enabled; freed on switch-off; documented |
| Fractional apertures leak through thin walls | 3/6 | Aperture-sum floor; quantitative TeslaValve flux test gates the flag |
| Variational stencil breaks projection (gradient not adjoint of divergence) | 3 | Same face weights in both operators; divergence-L2 readback test |
| Multigrid draw-call overhead erodes win on mobile | 6 | Measure on-device early; tier stays opt-in |
| Governor oscillation / FBO rebuild stalls | 7 | ≥3 s hysteresis, shed iterations before resolutions |
| Preset feel drift from normalization | 5 | Retune table + before/after screenshots in ADR; own phase, never bundled |

## 7. Out-of-scope follow-ups (next session / framework epic)

- Public docs-site pages for new fields (beyond minimal canonical-route
  updates that CLAUDE.md mandates per API change).
- KelvinHelmholtz / RayleighBenard as polished public preset components with
  homepage cards (validation versions live in the obstruction lab first).
- Governor state display / event surface for hosts.
- WebGPU backend evaluation checkpoint (target: 2027 H1).

## 8. Review log (rev 1 → rev 2)

Panel: Claude Sonnet (PASS WITH REVISIONS), Claude Opus (PASS WITH
REVISIONS), Gemini 3.1 Pro (FAIL), GPT-5.5 via Codex (FAIL). Antigravity was
quota-blocked; Codex substituted. All blocking findings addressed:

- Dropped invalid gradient-subtract fusion and the curl+vorticity fusion
  (fetch-count math was wrong; fused stencil needs ~13 unique fetches).
  Replaced with divergence/warm-start merge via RG pressure packing.
- 1b redesigned from 5-bit binary packing (dead end vs Phase 3) to RGBA8
  face apertures, binary-valued initially; wall-friction excluded from the
  fetch claim (it uses 9 probes at width 2).
- Phase 2: advection becomes a runtime `Material`; third-FBO requirement and
  memory cost stated; limiter correctly framed as overshoot suppression (not
  unconditional stability) and pinned to the forward-trace stencil; guards
  extended to both traces and open edges; capability gate added.
- Phase 3 reframed: binary clip/classification retained (not a reversal of
  the prior ADR decision); fractional only as variational stencil weights
  behind a flag; Jacobi diagonal = aperture sum; gradient adjoint to
  divergence; anisotropic spacing fixed in the same rediscretization;
  free-slip terminology corrected; quantitative leakage/divergence
  acceptance replaces visual-only QA.
- Normalization pulled out of Phase 1 into Phase 5 with new fields (no
  silent reinterpretation); ~192× retune magnitude quantified.
- Phase 6→3 hard dependency declared; per-level variational rediscretization
  specified; pyramid dispose() lifecycle named.
- Turbulence decoupled from FLOW machinery; "divergence-free by construction"
  weakened to "approximately; projection removes the residual".
- Tracers declared WebGL2-only with silent degrade; governor state exposed
  via pull-based getter only.
- Karman pass arithmetic replaced with an exact table; all performance
  targets tied to the §4 measured-baseline protocol; vague acceptance
  criteria ("visibly lively", "dipoles survive") replaced with readback-based
  quantitative tests.
