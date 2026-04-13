# ADR 0020: Random splat enhancements — swirl, spread, even spacing, jittered timing

**Status:** Accepted
**Date:** 2026-04-13

## Context

Presets with container shapes (CircularFluid, FrameFluid) needed richer continuous animation than the existing `randomSplatRate` + `randomSplatCount` system could provide. Three gaps:

1. **Directionless splats.** Random splats had random velocity, causing fluid to pool in the center of confined containers instead of circulating. Container presets needed per-splat tangential velocity to drive rotational flow.

2. **Narrow spawn band.** The default spawn distribution clustered splats around the canvas vertical center. For frame shapes, this band fell inside the masked cutout, so most random splats were immediately zeroed by the mask and produced no visible effect.

3. **Metronome timing.** Fixed-interval burst spawning sounded artificial and created visible pulsing patterns, especially in confined containers where the fluid response to each burst was more concentrated.

Additionally, the 10x HDR color multiplier applied to all random splats caused oversaturation in confined containers where the same energy concentrated into fewer pixels.

## Decision

Four new Bucket A config parameters, plus an HDR scaling function:

- **`randomSplatSwirl`** (number, default 0): Per-splat tangential velocity relative to container/canvas center. `dx = -(y - cy) * swirl`, `dy = (x - cx) * swirl`. Positive = CCW, negative = CW.

- **`randomSplatSpread`** (number, default 0.1): Controls vertical jitter range for spawn positions. `y = 0.5 + (rng() - 0.5) * spread`. Set to 2.0 for full-canvas scatter.

- **`randomSplatEvenSpacing`** (boolean, default false): When true, distributes splats evenly across the x-axis: `x = (i + 0.5) / count` instead of random x positions.

- **Jittered timing**: The interval between random splat bursts is now `baseInterval * (0.5 + rng())`, giving +/-50% jitter for organic rhythm. Uses the seeded RNG so timing is still deterministic per seed.

- **`hdrMultiplier()` method**: Scales the 10x HDR base by `sqrt(containerArea)` for each shape type, clamped at 3x minimum. Prevents oversaturation in confined containers (e.g., circle at radius 0.45 has area ~0.35 of canvas, so multiplier is ~5.9x instead of 10x).

All four config params are Bucket A (hot-updatable, picked up next frame). No shader recompile or FBO rebuild needed.

## Consequences

**Positive:**
- CircularFluid and FrameFluid presets now have rich, continuous rotational animation without any engine-level animation code or imperative splat calls.
- The swirl + spread system is composable: any future container shape preset can use the same params.
- Jittered timing eliminates visible pulsing artifacts across all presets that use `randomSplatRate`.
- HDR area scaling is automatic per container shape; preset authors don't need to manually compensate color values.

**Negative:**
- Four more config fields to document and maintain. All have sensible defaults (0 / 0.1 / false) that preserve existing behavior.
- Full-canvas scatter (`spread: 2.0`) wastes splats in frame presets: many land inside the cutout and are immediately masked. This is acceptable -- the alternative (shape-aware spawn positioning) adds complexity for minimal benefit.

**Rejected alternatives:**
- *Shape-aware spawn regions:* Would place splats only inside the valid fluid domain. Rejected because it couples the random splat system to every shape type and adds significant complexity. The mask-and-discard approach is simpler and works generically.
- *Per-preset animation loops:* Would give each preset component its own `setInterval` or RAF-driven splat injection. Rejected because it duplicates timing logic across presets and breaks the declarative config model.
