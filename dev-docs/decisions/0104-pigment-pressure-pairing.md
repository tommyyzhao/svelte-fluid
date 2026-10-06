# ADR 0104: Pigment pressure pairing

**Status:** Accepted (cost reduction; p95 budget still FAIL)
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
Two clean after invocations (same runtime pressure diff, separate directories):

| Capture | Median ms | p95 ms | Max ms | Verdict |
|---|---:|---:|---:|---|
| `/tmp/opt-pigment/after/`, attempt 1 | 1.631124 | 2.278959 | 2.745042 | FAIL |
| `/tmp/opt-pigment/after-repeat2/`, attempt 1 | 1.601794 | 2.236915 | 4.021416 | FAIL |

Both have zero foreign overlap, zero stray bursts, 60 native writes and 60/60
transfers. Alignment errors 0.286375/0.521292 ms respectively. Every clean after
repeat improves p95 against the same-seed baseline 2.636584 ms (13.6–15.2%);
none meets **p95 <2 ms**. All-repeats verdict **FAIL**, worst after-p95 gap
**0.278959 ms (13.95% above 2 ms)**. Preserve both repeats and their max tails;
this change reduces cost, does not close ADR 0101's goal. Capture script supports
the individual model row without changes. Raw trace/frame metadata and export
SHA256 hashes remain in each directory's `capture.json`.

Visual artifacts (untracked): `/tmp/opt-pigment/visual/`; same seed, CSS, native
1600×1000 backing, fixed wet stages 1/30/120 and final dry painting. Baseline
and after manifests combined in `/tmp/opt-pigment/visual/manifest.json` with
SHA256s and per-stage differences. Wet stages 1/30/120 are pixel-identical.
Final dry painting changes **3 of 1,600,000 pixels by 1 RGB LSB**, mean absolute
RGB error **6.25e-7 LSB**. Before/after dry frames visually inspected: same grain,
rim and resist outline. No visible appearance degradation.

Checks: `bun run test` (863/863), `bun run check` (0 errors/warnings), focused
hardware pigment suite (14/14), `bun run prepack`, `git diff --check` passed.
Prepack retains the existing import.meta.env packaging advisory; publint and
strict public-declaration consumer pass. Vite dependency-scan advisory for the
base's missing SplashCursor route import did not affect model capture/tests.
Owned Chrome/xctrace/Vite handles closed; GPU locks released after each run.
No tracker writes, installs, push or merge. Worktree and dependency symlink kept
untracked; artifacts remain `/tmp` only.

## Limits

The pairing changes intermediate rounding, not field precision. No calibrated
physics or arbitrary-field bitwise parity claim. Native timing remains machine-
specific, coarse 60-frame p95; max remains reported. Large pigment grids have
not been certified by this 800×500 workload. Promotion requires measured
nondegradation, not draw-count reasoning alone.
