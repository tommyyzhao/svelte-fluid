# ADR 0132: TeslaValve becomes the flame-salt jet; engine-native source pulse and dye cycle

**Status:** Accepted
**Date:** 2026-11-19

## Context

The home-page TeslaValve card showed a route-side flame-salt jet (a rAF clock re-emitting `flow` every frame) while its snippet said `<TeslaValve />`, which was a different, plainer scene. The owner asked for the card and the preset to be the same thing (2026-11-19).

## Decision

1. **`FlowSource.pulse` and `FlowSource.dyeCycle`** (types `FlowPulse`, `FlowDyeCycle`), optional and opt-in.
   - `pulse` scales `velocity` by `floor + (1 - floor) * max(0, cos(2 pi t / period)) ^ sharpness`. Dye and scalars stay constant.
   - `dyeCycle` replaces `dye` with a linear, wrapping cycle through `colors`.
   - Both are clocked by `simTime` (inside `applyFlowSources`, `t = simTime - dt`, so the first step is t = 0). They pause with the solver, reset with it and repeat under `deterministicMode`.
   - Bucket A (hot): read per step from `config.FLOW`; no recompile, no FBO change. Validated in `validateThermalFlow`, so `resolveConfig` throws `RangeError` before any GPU work.
   - `flowCanDriveSolver` treats a `dyeCycle` source as active.
2. **`TESLA_VALVE_CONFIG` is the card-budget flame-salt jet.** Values derive from the lab `flame-jet` tuning: drives at the 256 grid are x2 of the 128-grid ratio, then x0.5 for the budget, net 56 for the pressure-gradient force and 240 for the inlet. Sim 128, dye 384, one substep, `maxTimeStep` 1/120, pressure 60, viscosity iterations 20, MacCormack advection, glass, bloom 256 x 6, AgX, `autoPerformance` with a floor of 24 iterations.
3. **White walls and the 3:1 letterbox live in `TeslaValve.svelte`**, described by a registry `frame` (`{ aspect: 3, wallColor: '#fff' }`). Outside the container the engine paints `backColor`, the same as the empty channel, so white walls need an SVG under a transparent canvas; the nozzle only sits on the pipe mouth at 3:1. The from-scratch scaffold snippet reproduces the frame and shares the channel path between the SVG and `<Fluid>`.
4. **Pointer defaults.** `pointerInput` and `splatOnHover` default to off, as on the shipped card: the emission overlay hides hover dye and the pulsed no-slip scene is not meant to be poked. The registry config carries both as `false` so snippets are truthful.

## Alternatives rejected

- A route or wrapper rAF clock: wall-time clock, re-emits `flow` every frame (GC, keyword-recompile risk), and cannot be a plain `FluidConfig`.
- An engine wall-colour prop or aspect-lock prop: a shader keyword and public API for one preset, and the wrapper is needed for the aspect anyway.
- Migrating the lab and benches now: they call `jetFlow()` per step, which overrides velocity absolutely, so a native pulse would double-gate; it would also change the evidence behind ADR 0117.

## Consequences

- **Look change in 1.x** (minor bump at the owner's request): new scene, white walls, 3:1 letterbox, pointer defaults off, and `class`/`style`/`width`/`height` now land on the frame, not the inner `<Fluid>` container. The changeset gives the migration.
- ADR 0106's budget (sim 128 / dye 512 / pressure 26, 2 ms p95) is superseded for TeslaValve. Earlier TeslaValve rows in the GPU-budget notes are not comparable.
- `maxTimeStep: 1/120` with one substep means the sim runs below real time at 60 Hz (dt is clamped to `maxTimeStep x substeps`). The registry "one solver step per 60 Hz frame" test exempts TeslaValve explicitly. Same as the shipped card.
- Presets now include one with tone mapping and MacCormack; the two tests that asserted none do now name TeslaValve as the exception.
- Reduced motion shows a still at about t = 1 s (the settle advances 60 x 1/60 s).
- The lab keeps the old scene as `LEGACY_TESLA_VALVE_CONFIG` (`src/routes/test/tesla-valve/legacy-config.ts`); every lab tuning and the conservation bench derive from it so earlier versions keep their settings.
- Emission needs the thermal float path; without it the scene degrades to the dye-only look through the existing fallbacks.
- GPU cost: see Evidence.

## Evidence

Frame-timing gate on Apple M1 Max, Chrome for Testing 154, ANGLE Metal, 1440x900 at DPR 2: the maintainers' measurement notes (not published). Gate: in view median <= 8.4 ms, p95 <= 17 ms, no frame over 20 ms; not worse than the previous card build by more than 0.5 ms median.

## Follow-up

Migrate the lab and benches to the native `pulse` / `dyeCycle`, then delete `jet-pulse.ts`.
