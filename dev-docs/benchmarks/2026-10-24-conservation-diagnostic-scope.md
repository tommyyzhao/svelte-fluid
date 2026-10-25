# Section-spread diagnostic scope — 2026-10-24

Interpretation-only correction; no new simulation, tuning, sampling, or threshold changes.
Retained hardware run: 2026-10-24, Google Chrome 155.0.8059.86, Bun 1.3.14.
Source archive SHA-256: `b34ae2eea64e4c1866d105ec4a48888def889d6f23954f3d310c865b988e3232`;
base `b66d623d2746294934f4119dd289233869b85886`, staged 2026-10-24T09:32:07.336Z.
Evidence: retained `thermal-wall-hardware` receipt and `results/browser.stdout.log` `FLOWCONS` rows.
Correction baseline archive SHA-256: `b2340e4a2bbc607f4c6853fa6162e9ea1cb6de2d77204c04b531b22b67745a8e`.

## What was measured

[Benchmark source](../../src/lib/engine/__benches__/flow-conservation.browser.test.ts)
sums signed cell-center velocity at five sections, skipping binary solid cells.
Each sample's spread is `(max(section sums) - min(section sums)) / abs(mean(section sums))`;
`meanSpread` is the mean of those instantaneous relative spreads, not spread of time-mean sums.
This is not a full face-flux/density mass budget, mass-conservation proof, or causal test.
`established` means one adjacent pair of **global** 1.2 s window means changed <1%,
after at least three windows (maximum 25); it does not establish per-section stationarity.
Raw measurements remain reported when unestablished; those rows cannot yield a steady throughflow verdict.

## Retained 12-row diagnostic (2026-10-24)

Values below are exact `meanSpread` / `p95Spread` fractions, not percentages.
“Eligible” means only eligible for the limited steady-throughflow section-spread diagnostic;
no row proves mass conservation. “Global” is the retained `established` flag.

| Scene | Mean spread | p95 spread | Global | Eligibility / scope |
| --- | ---: | ---: | --- | --- |
| VENTURI | 1.275 | 1.28488 | true | Eligible; section-spread only |
| GAS_FLARE | 4.7625 | 12.68897 | false | Ineligible; unestablished, transverse open-boundary flow missing |
| KARMAN | 0.57399 | 0.59481 | true | Ineligible; transverse open-boundary flow missing |
| TESLA_VALVE | 0.51822 | 0.54325 | true | Eligible; section-spread only |
| CHANNEL_OPEN | 0 | 0 | true | Eligible; matched plain-channel control |
| CHANNEL_OPEN_OUTLET | 0.39527 | 0.39573 | true | Eligible; matched legacy-damping control |
| CHANNEL_OPEN_OUTLET_RELAX | 0 | 0 | true | Eligible; existing ≤2% mean-spread gate |
| VENTURI_RELAX | 0.83375 | 0.83725 | true | Eligible; section-spread only |
| VENTURI_NO_OUTLET | 0.88914 | 0.89741 | true | Eligible; section-spread only |
| VENTURI_p8x | 1.11498 | 1.17521 | true | Eligible; iteration sensitivity only |
| TESLA_VALVE_p8x | 0.69193 | 0.70584 | true | Eligible; iteration sensitivity only |
| flame-jet | 0.45986 | 0.66482 | true | Ineligible; pulsed drive, not steady |

10/12 mean spreads exceed 2%: a diagnostic count, **not ten conservation failures**,
and not evidence that any scene requires a sponge.
GAS_FLARE exhausted 25 windows / 30 s; last relative change `2.0677` versus `<0.01`.
Its failure to meet the global criterion has unknown cause; these rows do not diagnose it.
[GAS_FLARE and KARMAN configurations](../../src/lib/presets/registry.ts) leave transverse
open-boundary flow unaccounted by the sampled axial sections. Unequal axial sums alone
cannot close their slab balance.

[Flame drive](../../src/routes/test/tesla-valve/jet-pulse.ts) is pulsed, not steady.
Scalar/dye sources are not volume injection; pulsing alone does not excuse an incompressible
slab imbalance. Global-window agreement does not establish steady per-section flow.
Historical [tunings](../../src/routes/test/tesla-valve/tunings.ts) file hash differs from the
correction baseline. Exact archived-source comparison found presentation-only label/description
changes: historical numeric tuning is unchanged despite label hash drift. Current config alone
is not proof of historical configuration; this comparison, not a rerun, resolves that drift.

## Useful controls, limited claims

The matched plain channel `0`, legacy damping `0.39527`, relaxed outlet `0` comparison
remains useful. The relaxed-channel gate stays `meanSpread <= 0.02`, now explicitly requiring
`established`; other rows assert finite spread, not a conservation threshold.
[Outlet relaxation test](../../src/lib/engine/__benches__/flow-outlet-relax.browser.test.ts)
has a separate `<0.002` (0.2%) masked interval-flux gate around the outlet stage only,
not a system-wide conservation guarantee; see [ADR 0122](../decisions/0122-flow-outlet-relax.md).

Extra Jacobi sweeps are sensitivity data, not separation of convergence error from boundary
leakage. [ADR 0118, corrected verdict](../decisions/0118-staggered-conservative-flow.md#independent-review-correction-and-boundary-hotspot-repeat)
(line 259) records exact-pressure reproduction of the growing inlet runaway; specific
energy/backflow mechanism remains unproven. No promise that extra sweeps fix it.
Operator certification is separate; this note neither supplies nor replaces it.
