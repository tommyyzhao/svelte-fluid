# ADR 0016: Burn-in density dissipation via linear ramp

**Status:** Accepted
**Date:** 2026-04-08

## Context

KM|The persistent-canvas presets (LavaLamp, Plasma) have a hard
constraint: in steady state, dye must never fade. Any
`densityDissipation > 0` is exponential decay with a long half-life,
so the canvas eventually drains to black — see the "Steady-state
`densityDissipation: 0` is the only 'no fading' mode" entry in
`docs/learnings/presets.md`.

But `densityDissipation: 0` from frame zero is a footgun. With the
splat shader being additive (`gl_FragColor = vec4(base + splat, 1.0)`),
overlapping initial splats produce dye texture pixels well above the
linear display range. Without any dissipation to bleed off the
overshoot, the canvas opens at near-saturation and stays there
forever — exactly what the user complained about ("permanently
bright, practically all white").

The naive workarounds — lowering the steady-state dissipation, raising
the bloom threshold, dimming the splat colors — all either trade
brightness for stability or trade persistence for stability. The user
explicitly wanted **bright AND persistent**.

## Decision

Add two new fields to `FluidConfig` (and `ResolvedConfig`):

```ts
initialDensityDissipation?: number;
initialDensityDissipationDuration?: number;
```

Semantics: when `initialDensityDissipationDuration > 0`, the engine
linearly interpolates the dye advection's dissipation uniform from
`initialDensityDissipation` toward `densityDissipation` over the
duration in seconds. After the duration elapses, the dissipation locks
at the steady-state value (`densityDissipation`) forever.

The engine tracks the elapsed time via a new `engineStartTime` field,
set when the constructor finishes (right before the first
`requestAnimationFrame`). The advection step calls a new private
`currentDensityDissipation()` method that does the interpolation:

```ts
private currentDensityDissipation(): number {
  const duration = this.config.INITIAL_DENSITY_DISSIPATION_DURATION;
  if (duration <= 0) return this.config.DENSITY_DISSIPATION;
  const elapsed = (performance.now() - this.engineStartTime) / 1000;
  if (elapsed >= duration) return this.config.DENSITY_DISSIPATION;
  const t = elapsed / duration;
  return (
    this.config.INITIAL_DENSITY_DISSIPATION * (1 - t) +
    this.config.DENSITY_DISSIPATION * t
  );
}
```

This is a Bucket A field (hot scalar; no FBO rebuild, no shader
recompile — see ADR
[`0005`](./0005-hot-update-buckets.md)). `setConfig` writes to
`this.config` as normal and the next frame picks it up.

`resolveConfig` defaults `INITIAL_DENSITY_DISSIPATION` to match
`DENSITY_DISSIPATION` whenever the latter is set without the former,
so existing consumers see *zero* behavior change.

## Consequences

**Positive:**
- The "bright AND persistent" combination is now achievable. The three
  BP|  presets that need it (LavaLamp, Plasma) each use a brief
  burn-in (0.25–0.3 initial, 1.0s duration) that bleeds 12–15% of the
  initial dye, then locks at zero dissipation forever.
- The math is *predictable*. Per-frame survival is
  `1/(1 + dissipation*dt)`. Average dissipation over a linear ramp
  from `i` to `0` over `D` seconds is `i/2`, applied across `D*60`
  frames at 60fps. Surviving fraction is approximately
  `(1/(1 + (i/2)/60))^(D*60)`. The presets use this formula in their
  docstrings to justify the chosen burn-in values.
- The engine clock starts at construction-end, not `setConfig`-time,
  so the burn-in survives prop changes and matches the user's
  perception of "since the canvas appeared".
- One field, one method, ~15 lines of engine code total. No new
  shader, no new framebuffer, no new bucket.

**Negative:**
- Adds two more entries to the FluidConfig surface — consumers reading
  the prop table see two more knobs. Mitigated by README documentation
  and a clear "(default = `densityDissipation`)" note.
- Linear ramp is the simplest reasonable curve but not the best one.
  An ease-out (or piecewise: hold at initial then decay fast) would
  bleed more energy from the bright opening frame and less during the
  later mid-energy phase. Not implemented because linear is good
  enough and easier to reason about; can be revisited if needed.
- The `engineStartTime` clock doesn't account for `paused` time. If a
  consumer pauses for 5 seconds during the burn-in, the burn-in still
  ends at the wall-clock duration, not the simulation duration. Edge
  case; not currently a problem.

**Rejected alternatives:**
- *Time-varying via `setConfig` from JS:* Would require consumers to
  schedule a `setTimeout`/RAF loop to step `densityDissipation` down
  manually. Brittle, intrusive, and the timing is wrong (would be
  driven by JS clock, not engine clock).
- *Easing-curve API (`densityDissipationCurve: (t: number) => number`):*
  More flexible but harder to use; consumers can't reason about
  total surviving fraction without doing calculus. Linear is
  predictable.
- *Step function ("dissipation = X for first N seconds, then 0"):*
  Visible discontinuity at the transition. Linear ramp is smoother
  and produces the same effective surviving fraction.
- *A new `presetMode: 'burn-in'` magic flag with hard-coded values:*
  Inflexible and pollutes the API with use-case-specific options.
  The two-field linear ramp is general enough to serve every
  conceivable use case.
