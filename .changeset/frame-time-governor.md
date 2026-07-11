---
"svelte-fluid": minor
---

Opt-in frame-time governor (`autoPerformance`).

New `autoPerformance` config field (default `false`). When enabled, an EMA of
real RAF frame time drives a hysteretic quality shed above the explicit
`autoPerformanceTargetFrameMs` budget (default `1000 / 60`) under sustained load:
pressure iterations first, then solver substeps, bounded by
`autoPerformanceMinPressureIterations` (default 8) and
`autoPerformanceMinSubsteps` (default 1). It never auto-restores quality once
shed — call `setConfig()` explicitly to raise it again — and it is ignored
during deterministic `advance()` harness runs, so seeded/readback tests stay
byte-identical regardless of this setting.

Requested pressure iterations and substeps remain distinct from the governor's
effective shed values. As a result, shedding substeps no longer reduces the
accepted wall-clock simulation delta and cannot slow simulation time.

New pull-based `FluidHandle.getPerformanceState(): PerformanceState` (mirrors
`isPaused`; no events). New exported types `PerformanceState`,
`PerformanceTier`, `PerformanceAction`.
