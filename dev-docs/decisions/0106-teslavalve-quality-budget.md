# ADR 0106: TeslaValve quality budget

**Status:** Accepted
**Date:** 2026-10-06

**Acceptance (2026-10-06):** The owner delegated the decision to the lead, stating that the <2 ms target is not critical; the real requirement is not draining laptop and phone batteries. The lead accepted the change because it cuts TeslaValve's GPU time by roughly 25–30% while the valve's flow stays clearly readable in the clips (it is only softer). Karman and GasFlare stay unchanged. Their remaining overage is small, `autoPause` (default `true`) already stops every offscreen or hidden-tab instance, and Karman's deeper candidate visibly loses its regular vortex street. The sections below keep the original proposal wording.

## Context

TeslaValve exceeds the native-DPR GPU budget. The [per-preset quality sweep](../benchmarks/gpu-budget.md#per-preset-quality-sweep) certified a lower-quality candidate on M1 Max at DPR2 under [ADR 0105](./0105-stable-gpu-budget-protocol.md): N600/R3, W200, seed5, every clean run's p95 strictly <2 ms, no pooling or favorable retries.

| Own-tier CSS size | Before p95 r1/r2/r3 (ms) | Candidate p95 r1/r2/r3 (ms) |
|---|---|---|
| 1440×900 | 2.67 / 2.38 / 2.76 | 1.879877 / 1.909086 / 1.896793 |
| 800×500 | 2.44 / 2.28 / 2.50 | 1.618707 / 1.625502 / 1.631419 |

Both candidate cases certified PASS. The next-milder setting, sim128/pressure30/dye512, screened at **2.172665 ms (FAIL)**. The original ≤1.85 ms screening margin was relaxed **post hoc** to <2 ms for certification eligibility; it was not a pre-registered change. ADR 0105's certification gate is unchanged.

## Proposal

On this unmerged proposal branch, change only TeslaValve's registry defaults:

- `simResolution`: 192 → 128.
- `pressureIterations`: 30 → 26.
- `dyeResolution`: 768 → 512.

Keep all other preset settings, engine/runtime code and native DPR unchanged. The registry-driven `/docs/presets` table and generated snippets inherit these values; no duplicate table edits are needed.

Owner acceptance or rejection remains pending. Review the synchronized baseline/candidate/next-milder clips at `/tmp/quality-sweep/clips/index.html` before accepting. Those clips are **ephemeral**, not a durable archive. Timing certification does not establish visual quality or owner approval.

## Consequences

- Lower simulation/dye detail and fewer pressure iterations buy budget headroom; visual/throughflow trade-offs require owner review.
- This is a proposal, not a merged default or a claim that the library meets the full GPU budget.
- Karman remains over budget and unchanged: shared 1440×900 p95 **2.04 / 2.04 / 2.08 ms (FAIL)**; own 1440×900 **INCOMPLETE**.
- GasFlare remains over budget and unchanged: deepest screened setting **2.23 ms (FAIL)**.
- No new GPU captures or browser review are part of preparing this change; certification is cited from the existing sweep.
