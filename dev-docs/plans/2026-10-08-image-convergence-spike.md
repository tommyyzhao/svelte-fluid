# Spike plan: fluid that converges to an image (2026-10-08)

Status: plan only. Nothing in this plan is implemented yet.

**Goal:** given any image, the fluid and dye visibly flow and settle into that image. The scene then stops (0 GPU at rest), and pointer input disturbs the image, which then re-forms by itself.

## First principle

Incompressible advection only rearranges colour; it can never create it. The joint RGB histogram is conserved, and dissipation and semi-Lagrangian blur only destroy information. So **initial splats alone cannot converge to an arbitrary image**: the target has to be injected into the simulation. The design question is *where* it enters.

## Candidates (ranked, from the literature survey)

| # | Approach | Mechanism | Notes |
|---|---|---|---|
| 1 | **Reference map (advected UV)**: Neyret 2003; Kamrin 2012 | Advect the material-coordinate field ξ (RG16F) instead of colour, and display `I(ξ(x))` from the sharp source image. | Exact and blur-free. The colour stays at native resolution while ξ can be coarse (128–256), which suits dye 512. Interpolation error builds up in ξ, not in colour. |
| 2 | Painterly forcing (ETF, Kang 2007; structure tensor, Kyprianidis 2008) | Force along the minor eigenvector of the image's smoothed structure tensor, tapered over time. | Brush-stroke swirls (the Van Gogh feel). Cosmetic only; it does not converge by itself. |
| 3 | Dye nudging (Hoke–Anthes 1976) | `C' = I + e^{-λΔt}(advect(C,u) − I)` | A trivial baseline that reads as a crossfade, so it is the bar to beat. |
| 4 | Target-driven smoke (Fattal–Lischinski 2004) | `f = α ρ̃ ∇log(ρ̃* + ε) − β u` plus gathering | Smoky silhouettes, but RGB is not exact. |
| 5 | Offline Gaussian fit (GaussianImage 2024) | Bake N splats per image | GaussianImage reports ~107 s on a V100. In-browser fitting is not viable; offline only. |
| 6–7 | Optimal transport; differentiable-fluid bake | Offline | OT velocity is compressible and projection breaks it. Too costly for a spike. |

## Spike design (variants behind one lab flag; one change at a time)

**State:** `ξ` RG16F ping-pong. Display keyword `TARGET_IMAGE` samples `I(ξ)`, with an optional mix `w(t)` against the live dye so the splat colours "morph" into the painting.

**Phases** (one timeline with tapered weights):
1. **Scramble:** seeded splats stir ξ (ξ starts at identity, or at a seeded scramble map). The image is unrecognisable.
2. **Converge:**
   - Velocity controller `u += k·P[(∇ξ)ᵀ(ξ − x)]`. This is gradient descent on `E = ½∫|ξ − x|²`, and the fluid itself carries the paint home.
   - Projection can leave stationary error, so also apply direct relaxation `ξ' = x + e^{-λ(t)Δt}(ξ_a − x)`, with λ ramping up.
3. **Finalise:** when `max|ξ − x| < ε` and `max|u| <` the settle threshold, snap `ξ = x, u = 0`, draw once and stop the RAF loop. At rest, the scene is just the image.

**Variants (train set first):**
- **V0 baseline:** dye nudging (#3).
- **V1:** reference map with direct relaxation only.
- **V2:** V1 plus the gradient controller.
- **V3:** V2 plus ETF painterly forcing during phase 2.

## Engine hooks (code map 2026-10-08)

- **Image load:** reuse the `distortionImageUrl` loader (`FluidEngine.ts:2557–2642`: CORS, stale/dispose guards, restore). It is an async resource trigger, like distortion.
- **ξ allocation:** like velocity (`:2406`). Advect it beside dye transport (`:4330`). The controller force goes in the persistent-forces slot before curl (`:4589`).
- **Display keyword:** via `:3318` (`prepareKeywords`). Shared tier: all GL inside `host.run()`, bind every dependency, respect the WebGL1 sampler budget.
- **Settle:** `settle.ts` has no target-error metric. Add `|ξ − x|` to the existing max-reduction chain (`:3389`). Density dissipation must be 0.
- **Lazy rebuild** loses fields, so a rebuild snaps to the finalised image (no replay).
- **Config:**
  - `targetImageUrl`: async trigger.
  - `targetStiffness` and `targetRelax`: bucket A.
  - Keyword: bucket B.
  - Opening scramble: bucket D.
- **ADR 0112** is required before merge: a new field semantic and a lifecycle change.

## Eval (pre-register as ADR before any candidate data; frozen held-out split)

- **Image set:** 10 images (paintings, photos, logo, text, a flat colour field), split by image 6 train / 4 held-out.
- **Metrics:**
  - time to ε;
  - SSIM/ΔE between the settled frame and the target (V1–V3 should be ≈ exact);
  - GPU-ms/s while converging, and 0 at rest (E1 harness);
  - **blind pairwise judge:** "emerges like fluid vs crossfade/morph", which is the real differentiator.
- **Keep rule:** follows ADR 0107/0111: train and held-out both beat noise, and E2/E4 are no worse.

## Risks

- ξ folding or aliasing under strong stirring. Mitigation: cap scramble energy, mip-sample `I` using `|∇ξ|`.
- Stationary error under projection. Mitigation: direct relaxation (V1) bounds it.
- A crossfade look. That is what V2/V3 and the judge exist to beat.
- CORS-tainted images: fail closed to the existing white fallback.
