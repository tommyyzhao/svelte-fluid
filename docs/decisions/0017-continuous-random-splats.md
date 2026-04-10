# ADR 0017: Continuous random splat generation via config fields

**Status:** Accepted
**Date:** 2026-04-09

## Context

Some presets (notably `InkInWater`) want a "drops in water" effect where
random splats appear continuously over time. Without this, presets must
choose between a static initial scene or requiring the user to call
`handle.randomSplats()` imperatively. The hand-crafted `presetSplats`
array is consumed once at construction and cannot simulate ongoing
random events.

Users also want to control this behavior declaratively (e.g.,
`randomSplatRate={0.5}` for one drop every 2 seconds) without touching
the imperative API.

Furthermore, presets like `InkInWater` need continuous splats to match
the initial splats' color and velocity, not fully random values. The
framework must allow specifying fixed color and velocity for continuous
splats.

## Decision

Add six new config fields to `FluidConfig` / `ResolvedConfig`:

| camelCase | SCREAMING_CASE | Type | Default | Meaning |
| --- | --- | --- | --- | --- |
| `randomSplatRate` | `RANDOM_SPLAT_RATE` | `number` | `0` | Splats per second. 0 = disabled. |
| `randomSplatCount` | `RANDOM_SPLAT_COUNT` | `number` | `1` | Number of splats per burst. |
| `randomSplatColor` | `RANDOM_SPLAT_COLOR` | `RGB \| null` | `null` | Fixed color for continuous splats. Null = random. |
| `randomSplatDx` | `RANDOM_SPLAT_DX` | `number` | `0` | X velocity for continuous splats. |
| `randomSplatDy` | `RANDOM_SPLAT_DY` | `number` | `0` | Y velocity for continuous splats. |
| `randomSplatSpawnY` | `RANDOM_SPLAT_SPAWN_Y` | `number` | `0.5` | Normalized Y position (0–1, clamped) for continuous splats. |

Implementation lives entirely inside `FluidEngine` — a private method
`accumulateRandomSplatTimer(dt)` is called from `update()`. It
accumulates delta time; when the accumulated time exceeds
`1 / RANDOM_SPLAT_RATE`, it creates `RANDOM_SPLAT_COUNT` splats at
random x/y positions with the configured color and velocity.

When `RANDOM_SPLAT_COLOR` is `null`, the color is randomly generated
via `generateColor(rng)` (matching `multipleSplats()`). When set, the
provided RGB is used directly (with the same 10× HDR multiplier applied
to `generateColor` output).

Velocity fields (`RANDOM_SPLAT_DX`, `RANDOM_SPLAT_DY`) are passed
directly to `splat()`, same as `PresetSplat.dx/dy` — not scaled by
`splatForce`.

All six fields are **Bucket A** (hot-updatable scalar). Rate changes
take effect next frame. Setting `randomSplatRate = 0` at runtime stops
continuous generation and resets the timer.

The timer respects:
- `PAUSED` — accumulation continues (so re-enabling doesn't burst),
  but splats are still queued and consumed by `applyInputs()`.
- `lazy` — engine doesn't tick when off-screen (already handled by
  teardown/reconcile).

## Consequences

**Positive:**
- Presets like `InkInWater` can declaratively enable "drops in water"
  with matching color and velocity: `randomSplatColor={{ r: 0.05, g: 0.09, b: 0.53 }}`, `randomSplatDy={-320}`.
- Hot-updatable: users can bind `randomSplatRate` to a slider and
  change density at runtime.
- Zero cost when disabled (rate = 0): the timer path is a single
  `if` check.
- Color and velocity decoupling allows full creative control.

**Negative:**
- Six extra fields in the config surface. The config already has ~30
  fields; this is a modest increase.
- Timer accumulation is frame-coupled (not perfectly precise
  real-time). Acceptable for a visual effect.

**Rejected alternatives:**
- *`randomSplatInterval` (ms) instead of rate:* Less intuitive for
  "drops per second" UX. Rate is more natural for visual effects.
- *Timer in Svelte `$effect` with `setInterval`:* Adds GC pressure
  from interval handles and duplicates logic outside the engine's
  single source of truth.
- *Color range (min/max) per channel:* Over-engineered for a visual
  effect. A single fixed color is simpler and sufficient.
- *Random velocity within a range:* Same — users who want variation
  can call `handle.splat()` imperatively.
