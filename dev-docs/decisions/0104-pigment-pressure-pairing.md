# ADR 0104: Pigment pressure pairing

**Status:** Proposed (native after-capture and visual comparison pending)
**Date:** 2026-10-06

## Context

InkPaper held wet at 800×500 CSS on the shared host, native DPR 2, failed
[ADR 0101](0101-p95-gpu-budget.md)'s p95 <2 ms target: historical selected
median/p95/max 1.617/2.453/2.771 ms. Candidate 4 was owner-approved.
[ADR 0090](0090-pigment-model.md) requires 16 warm-started pressure iterations,
precision sufficient for evaporation, deterministic strokes and dry resists.

## Decision

Apply the existing FluidEngine/ADR 0038 warm-start fold and paired Jacobi scheme
only to pigment pressure. The first inner iteration scales previous pressure by
0.8; subsequent iterations use 1. Two nested stencil evaluations produce two
iterations per draw. Clamp each inner position to texel centers so an edge
neighbor reproduces the old intermediate texture's CLAMP_TO_EDGE behavior.
An odd remainder uses the single-iteration shader. All inputs are bound per pass.

Pressure draws fall from **17 (scale + 16 singles) to 8 pairs**, with all 16
iterations retained. Steady held-wet step+display falls from 24 to 15 draws;
input landing adds its existing MRT draws separately. No field format, solver
resolution, drying coefficient, resist, transport, optics or capture-script change.

## Parity evidence

Hardware Chrome, ordinary validation, focused pigment browser tests:

- Compare old standalone scale + single shader with the new solver at
  1/2/15/16/17 iterations, every cell including edges, fp32 and forced fp16.
  Absolute pressure tolerances: **2e-6 fp32; 0.002 fp16**, for the bounded
  |input pressure|≤0.4, |divergence|≤0.2 fixture. fp16 unit roundoff is 2^-11;
  removing scale/intermediate texture stores changes rounding, accumulated over
  ≤17 nonexpansive stencil iterations. This is a fixture bound, not a promise
  for arbitrary pressure amplitudes. Assert ceil(iterations/2) pressure draws.
- Old/new complete painting fields match within **1e-5 per cell**, wet/dry mass
  within **1e-5 relative**. Two identical new instances match exactly across
  fixed steps and resize; unrelated sibling fields remain unchanged.
- Isolated wet-to-deposited transfer and evaporation conserve total pigment
  within **1e-6 relative** through drying. Advection/diffusion are disabled in
  this conservation fixture: the existing semi-Lagrangian transport is not
  asserted globally mass-conservative.
- Resist interiors remain zero, final water/wet pigment zero. Existing DPR
  1/2/3, resize, idle, component, fallback and context-loss cases retained.
- Fixed-step context-loss replay compared per cell at **1e-6 absolute**, mass
  at **1e-6 relative** rather than the former loose ±30% aggregate check.

## Native measurement

Unchanged `scripts/gpu-capture.mjs`, seed 5, single row
`model-inkpaper@800x500:shared:2`. Shared GPU lock held for each hardware run.
200 warm-up frames; 60 fixed-step frames paced three RAFs apart. Metal execution
interval union, 60 native writes and bitmap transfers, ≥5% foreign-overlap gate,
all-clean-repeats p95 rule unchanged. No per-shader timing attribution claimed.

Baseline `76bdaa2`, `/tmp/opt-pigment/before/capture.json`: clean attempt 1,
median **1.837 ms**, p95 **2.637 ms**, max **4.208 ms**, foreign overlap 0,
60 writes/60 requested/60 delivered, zero stray bursts, alignment error 0.477 ms.
After-capture pending; no target-success claim yet.

Visual artifacts (untracked): `/tmp/opt-pigment/visual/`; same seed, CSS, native
1600×1000 backing, fixed wet stages 1/30/120 and final dry painting. Baseline
manifest `/tmp/opt-pigment/visual/before.json`; comparison pending.

## Limits

The pairing changes intermediate rounding, not field precision. No calibrated
physics or arbitrary-field bitwise parity claim. Native timing remains machine-
specific, coarse 60-frame p95; max remains reported. Large pigment grids have
not been certified by this 800×500 workload. Promotion requires measured
nondegradation, not draw-count reasoning alone.
