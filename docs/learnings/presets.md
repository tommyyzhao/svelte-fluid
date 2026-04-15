# Learnings — Preset components

## Post-mount splat injection has an unfixable timing race

**Symptom:** A "wrap `<Fluid />` and inject splats from `onMount`"
preset has the opening splats appear inconsistently — present in dev,
missing on cold reload, present on hot reload. The bug looks like it
should be fixable with `queueMicrotask` or `setTimeout(0)` but isn't.

**Cause:** The inner `<Fluid />` doesn't construct its `FluidEngine`
inside its own `onMount`. It does this:

```ts
onMount(() => {
  const ro = new ResizeObserver((entries) => {
    // …compute new size…
    instantiate(); // ← engine created here
  });
  ro.observe(container);
});
```

`ResizeObserver` callbacks fire **after the next layout pass**, which
is **after** the parent component's `onMount` has already returned.
Microtasks scheduled in the parent's `onMount` flush before the layout
pass, so when they run, `inner.handle.splat(...)` no-ops because the
underlying `engine` is still `undefined`.

`setTimeout(0)` is better but still flaky — RO callbacks and 0-ms
timers race in browsers, and the order isn't guaranteed across tabs,
priorities, or page-load conditions.

**Fix:** Don't try to inject from a wrapper. Add a construct-only
`presetSplats` field to `FluidConfig` that the engine constructor reads
right after `multipleSplats(randomSplatCount())`. The splats land in
the same code path as the random initial splats, before the first
frame is rendered. See ADR
[`0015`](../decisions/0015-preset-components.md).

**Why this matters:** When you find yourself wanting "this code should
run as soon as a child has finished initializing," consider whether the
child's initialization is itself async (most things involving
`ResizeObserver`, `MutationObserver`, `IntersectionObserver`,
`requestAnimationFrame`, or fetch are). If so, the right answer is
usually to push the work into the child's own constructor, not to
schedule it from the parent.

## `presetSplats` is intentionally absent from `ResolvedConfig`

**Symptom:** Started writing `if (input.presetSplats !== undefined)
out.PRESET_SPLATS = …` in `resolveConfig`, then noticed the field has
no purpose after construction.

**Cause:** `ResolvedConfig` is the engine's hot config — it's read by
`step()`, `applyBloom()`, `splatPointer()`, and so on. Adding a field
that's never read after construction pollutes that shape and confuses
the diffing logic in `setConfig`.

**Fix:** `presetSplats` lives only on the public `FluidConfig` type and
is read directly from `opts.config?.presetSplats` in the constructor.
`setConfig` doesn't see it, doesn't diff it, doesn't have to ignore it
explicitly — it just isn't there.

**Why this matters:** Construct-only options (Bucket D in ADR
[`0005`](../decisions/0005-hot-update-buckets.md)) don't all need to
live in `ResolvedConfig`. If a field's lifetime ends at construction,
the cleanest place for it is the constructor's parameter object — not
a long-lived state container.

## Splat color values above 1.0 are valid (and useful)

**Symptom:** Hand-picked colors like `{ r: 1, g: 0.5, b: 0.1 }` looked
flat compared to the engine's own random splats.

**Cause:** `multipleSplats` boosts `generateColor` output by 10×, so
the random initial splats are effectively in the 0–1.5 range. Splat
colors aren't clamped at 1 — they feed straight into a half-float dye
texture and bloom thresholds, so values above 1 read as HDR
highlights through the bloom pass.

**Fix:** Use values up to ~1.2 for vivid hand-crafted splats — but
*only* if you've also tuned bloom + sunrays so the brightness doesn't
runaway (see next entry). Bare splats with no bloom or sunrays can go
higher.

**Why this matters:** Coordinates are normalized but colors are
linear-light HDR. Treat the color channel as a 0–2 range (or higher
for very bright highlights), not a 0–1 sRGB triple.

## "It gets brighter as it mixes" — bloom + sunrays feedback

**Symptom:** A preset with `densityDissipation: 0` and bloom + sunrays
enabled starts looking OK but progressively brightens to white as the
fluid evolves. The dye is supposed to be conserved, so why does the
display brighten?

**Cause:** The dye texture itself doesn't get brighter — advection
preserves total dye mass. But the *display path* applies massive
multiplicative gain on top of the dye:

1. **Splats are additive** in `splatShader`: `gl_FragColor = vec4(base
   + splat, 1.0)`. With many overlapping initial splats (say 22 of
   them, each scaled to ~1.5 by the engine's `multipleSplats` 10× boost),
   the dye texture starts with values of 5–10+ in the overlap regions.
2. **Sunrays *multiply* the dye** in `displayShader`: `c *= sunrays`.
   The sunrays mask is computed by `sunraysShader` from a 16-tap radial
   blur of the dye luminance, multiplied by `weight` and `Exposure =
   0.7`. With `weight: 1.0` the mask values can easily reach 5–8 in
   bright regions.
3. **Bloom is added** afterwards: `c += bloom`. The bloom prefilter
   passes anything above `BLOOM_THRESHOLD` (default 0.6, with a soft
   knee). With dye values already in the 5–10 range, *every* pixel
   contributes to bloom.
4. **The bloom feedback is one-shot per frame** — bloom does *not*
   write back into the dye texture, only into the display target. So
   it can't grow unbounded across frames. But:
5. **Coverage grows with mixing.** Advection spreads the bright blobs
   across more of the canvas. Each new frame, *more pixels* exceed the
   bloom threshold and *more pixels* sample a high-luminance sunrays
   mask. The bloom + sunrays contribution to the *display* therefore
   grows even though the dye texture's total mass is constant.

The cycle floors at white because the display target gets clamped to
1.0 per channel.

**Fix:** Treat `densityDissipation: 0` + bloom/sunrays as a footgun.
Either:
- Use a small non-zero `densityDissipation` (~0.2–0.4) so total dye
  mass decreases over time, bounding the display brightness.
- Lower `bloomIntensity`, `sunraysWeight`, and per-splat color values.
- Raise `bloomThreshold` (~1.0–1.2) so only the genuine highlights
  bloom rather than the entire (overbright) field.
- Reduce the initial splat count and/or `splatRadius` so the opening
  frame isn't already in the runaway regime.

WX|The Plasma preset uses all four mitigations after I shipped
v0 with `densityDissipation: 0` and watched both whiteout within ~3
seconds.

**Why this matters:** When you read code that says "advection preserves
mass", remember that the displayed image isn't `dye` — it's some
nonlinear function of `dye`. Conserved quantities in the simulation
don't imply conserved quantities on screen.

## Steady-state `densityDissipation: 0` is the only "no fading" mode

**Symptom:** Tried to "compromise" between persistent dye and bounded
brightness by setting `densityDissipation: 0.18`. The result faded
visibly over time — the canvas got darker and darker as steady state
approached zero dye. The user's verdict: any nonzero dissipation will
eventually drain the canvas.

**Cause:** The advection shader applies `result / (1 + dissipation*dt)`
each frame. With `dissipation > 0` and a continuous loop, every pixel
loses (`dissipation * dt`)≈0.3% per frame for `dissipation: 0.18`. Over
a minute (~3600 frames at 60fps) that compounds to a ~1% surviving
fraction — essentially zero. The visible dye is whatever the engine has
accumulated since the most recent splat. Without continuous user input,
the canvas drains.

**Fix:** Two layers.
1. **Steady state must be `densityDissipation: 0`** if you want a
   persistent canvas. There's no middle ground.
2. **Burn-in to absorb the initial overshoot.** Set
   `initialDensityDissipation` to a higher value (1.0–2.0) and
   `initialDensityDissipationDuration` to a couple of seconds. The
   engine ramps from initial → steady-state linearly, then holds. The
   overlapping additive splats start above the linear display range,
   the burn-in eats the excess in the first couple of seconds, then
   dissipation locks at 0 and the surviving dye persists forever.

**Why this matters:** "A little bit of dissipation" sounds like a
compromise but it's really "exponential decay with a long half-life".
Either commit to zero in steady state or accept that the canvas will
eventually be black.

## Bloom + persistent dye is incompatible without coverage growth artifacts

**Symptom:** Even with `densityDissipation: 0` in steady state and a
sane (low) bloom intensity, the canvas appeared to brighten as the
opening splats spread out — even though the dye texture's total mass
is conserved.

**Cause:** Bloom doesn't write back into the dye texture so it can't
runaway frame-to-frame. But it samples the *current* dye each frame
and the bloom prefilter passes any pixel above `BLOOM_THRESHOLD`. As
advection spreads bright initial splats across more of the canvas,
*more pixels* exceed the threshold each frame, so the bloom
contribution to the *display* grows in lockstep with coverage. The
user's perception is "it's getting brighter" because the displayed
image really is getting brighter — it's just not a feedback loop, it's
a (one-shot per frame) function of the spreading dye.

**Fix:** When you want guaranteed-stable brightness with persistent
dye, **turn bloom and sunrays off**. The display brightness then
tracks the dye texture exactly, which (with `densityDissipation: 0`)
is conserved. Use bright splat colors plus 3D shading for visual
punch instead of post-process glow.

SS|The LavaLamp preset uses `bloom: false, sunrays: false`
for this reason — they want a perfectly stable steady-state with
permanent dye. Plasma is the deliberate exception: it keeps bloom
off but holds **sunrays on at a low weight (0.35, ~3.5× peak gain)**
because the radial-toward-center sunrays mask is more visually
forgiving than full-screen bloom even with `densityDissipation: 0`.
Aurora and FrozenSwirl keep both bloom and sunrays on because their
short-lived motion (Aurora) or rapid freeze-out (FrozenSwirl)
tolerate (or want) the spreading-coverage brightening.

**Why this matters:** "It can't be a feedback loop because bloom
doesn't write back to dye" is technically correct but practically
wrong. Anything that maps `dye → display` non-linearly (bloom
threshold, sunrays multiplication) will produce display-side artifacts
even without state on the bloom side, as long as the *input* is
changing.

## Sunrays mask gain has a closed-form ceiling

**Symptom:** Plasma was asked to keep sunrays *enabled* but not run away
into white. Needed to know exactly how much `sunraysWeight` is too much.

**Cause:** The sunrays shader accumulates 16 alpha samples along a
radial ray from each pixel toward the center, multiplying each sample
by `weight × 0.95^i × Exposure` where `Exposure = 0.7`. The geometric
series `Σ 0.95^i` for `i = 0..15` ≈ 11.4. So the *peak* sunrays mask
value at the canvas center, where rays sample bright dye all the way
down, is approximately:

```
peak ≈ (1 + 11.4 × weight) × 0.7
```

The display shader then does `c *= sunrays`, so this is the
multiplicative ceiling on display brightness:

| `sunraysWeight` | peak amplification |
|---|---|
| 1.0 | ~8.7× |
| 0.5 | ~4.7× |
| 0.35 | ~3.5× |
| 0.2 | ~2.3× |
| 0.1 | ~1.5× |

**Fix:** For "glow but no whiteout", `sunraysWeight ≈ 0.3–0.4` is the
sweet spot — meaningful radial brightening that fades naturally toward
the edges, without saturation.

**Why this matters:** Most engine knobs in this codebase have a
non-obvious dynamic range. When you can derive a closed-form ceiling
from the shader source (as here), do it once and write it down — it's
the difference between "I'll bisect until it stops looking white" and
"I know 0.35 is right because I did the algebra".

## Curl/vorticity is a positive feedback term

**Symptom:** LavaLamp with `curl: 50` was whipping its slow buoyant
blobs into tight spinning vortices that homogenized the warm dye in
seconds. Lowering velocity dissipation made it worse, not better.

**Cause:** The vorticity shader is *positive feedback* on rotation:

```glsl
force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
force /= length(force) + 0.0001;
force *= curl * C;  // C is the local curl value
velocity += force * dt;
```

It computes the local curl `C` from the velocity field, then *adds
force in the direction that increases* `|C|`. Any small rotational
component in the velocity field (e.g., from the random pressure
solution near a splat boundary) gets amplified. With `curl: 50` the
amplification is so aggressive that even a barely-rotational initial
state becomes a tight vortex within a few frames.

**Fix:** For aesthetics dominated by translation (rising blobs, falling
ink, drifting bands), keep `curl` very low — `0` to `~10`. Vorticity
confinement is the right tool for "turbulent fluid" looks (default
`30`, the original Pavel Dobryakov demo) but the wrong tool for
"lazy laminar motion".

**Why this matters:** Vorticity confinement was added to numerical
fluid sims to *fight* numerical viscosity that destroys vortices. Used
on a low-energy simulation that doesn't have vortices to preserve, it
*creates* them out of numerical noise.

## Pressure has a memory coefficient

**Symptom:** LavaLamp at `pressure: 0.95` had rotational structures
that kept reinforcing themselves frame after frame, even after curl
was reduced.

**Cause:** Each frame the engine does:

```ts
this.clearProgram.bind();
gl.uniform1i(this.clearProgram.uniforms.uTexture, this.pressure.read.attach(0));
gl.uniform1f(this.clearProgram.uniforms.value, this.config.PRESSURE);
this.blit(this.pressure.write);
```

The `clearShader` writes `texture * value` — i.e., it doesn't actually
clear the pressure field, it scales it. With `value = 0.95`, last
frame's pressure carries forward at 95%. With `value = 0.1`, only 10%
carries forward. This is a *memory coefficient* on the pressure field,
not a "pressure strength" knob despite the name.

**Fix:** For smoother, less self-reinforcing motion, use the engine
default `pressure: 0.8` or lower. Higher values (0.9+) create
persistent pressure patterns that interact unpredictably with curl
and dissipation.

**Why this matters:** The name `pressure` makes it sound like a
material property. It isn't — it's how aggressively the pressure
solver remembers its previous state. The misleading name has trapped
me twice; documenting it here so it traps me one fewer time next time.

## The "self-reinforcing positive feedback" meta-pattern

Three different LavaLamp bugs (whiteout, fast spinning, homogenization)
all had the same underlying shape: a simulation term that *amplifies
its own output*, with no countervailing damping.

| Symptom | Feedback term | Damping |
|---|---|---|
| Whiteout | bloom + sunrays multiplication on dye coverage | none unless `densityDissipation > 0` |
| Fast spinning | vorticity confinement on rotational velocity | only `velocityDissipation` |
| Homogenization (rotational) | pressure memory coefficient on pressure field | only the `1 - clearValue` decay each frame |

In every case the "fix" was the same: **either reduce the feedback gain
or add damping**. There's no third option — a positive-feedback term
with zero damping always runs away to its ceiling (for bounded
quantities, "white" or "max velocity") or infinity (for unbounded
quantities, "NaN").

When tuning a preset and something is "running away" or "pulsing
brighter" or "spinning faster than it should", the question to ask is:
**"what term in the simulation is being amplified by its own previous
output?"** Find that term and either lower its gain or add damping.

## Velocity dissipation isn't a mixing speed knob

**Symptom:** Two presets (LavaLamp, InkInWater) with high
`velocityDissipation` and large splats were collapsing into a uniform
warm/blue wash within seconds. Intuition said "raise the dissipation
to slow things down" — but raising it made it worse.

**Cause:** `velocityDissipation` decays the velocity field over time
(`result / (1 + dissipation*dt)` in `advectionShader`). High values
*kill the velocity quickly* — but only after the initial impulse has
already moved the dye where it's going. The dye then *sits in place*,
homogenized, with no motion to maintain visible features.

**Fix:** Use *low* velocity dissipation when you want sustained, lazy
motion that keeps the dye visually distinct. Reduce `splatRadius` and
`splatForce` to control the *initial* spread instead. The lava lamp
went from `velocityDissipation: 0.05, splatRadius: 0.6, splatForce:
4000` (homogeneous warm fog after 5s) to `velocityDissipation: 0.005,
splatRadius: 0.22, splatForce: 2200` (discrete blobs sway indefinitely).

**Why this matters:** "Dissipation" is a damping term in the
simulation, not a UI speed slider. If you want gentler motion, lower
the *force*. If you want longer-lasting motion, lower the *dissipation*.
The two knobs are independent and the names make it easy to confuse them.

## Continuous random splats: `randomSplatRate` and friends

**What it is:** Six new config fields (`randomSplatRate`, `randomSplatCount`, `randomSplatColor`, `randomSplatDx`, `randomSplatDy`, `randomSplatSpawnY`) that make the engine emit splats continuously at a configurable rate.

**Design decisions worth preserving:**

- The timer accumulates delta time in `accumulateRandomSplatTimer()`, called from `update()` before `step()`. This keeps timing in the engine's single RAF loop rather than splitting it across a Svelte `$effect` + `setInterval`.
- Accumulation happens even while paused (timer keeps running). The splats are still queued via `splatStack` and consumed by `applyInputs()` on the next unpaused frame. This means re-enabling after pause doesn't produce a burst — the timer ran ahead but `applyInputs()` only fires when `!PAUSED`.
- When `randomSplatColor` is set, the same 10× HDR multiplier applied to `generateColor` output is applied to the fixed color. See the HDR splat colors entry above for why.
- Velocity fields (`randomSplatDx`, `randomSplatDy`) are passed directly to `splat()` raw — they are NOT scaled by `splatForce`. This is consistent with `PresetSplat.dx/dy` semantics.
- All six fields are Bucket A: hot-updatable without teardown. Setting `randomSplatRate = 0` stops generation and resets the timer.

**Why this matters:** Previously, continuous effects required imperative calls to `handle.randomSplats()`. Now presets like `InkInWater` can declaratively specify a "drops in water" look. The `randomSplatColor` + `randomSplatDx/Dy` fields allow fixed color+velocity matching the initial preset splats, rather than the fully-random `multipleSplats()` behavior.

## Galaxy preset was removed

The `Galaxy` preset was removed from the library. Its visual effect (spiral arms with bloom-lit core) was too similar to `Plasma` and didn't offer a distinct enough aesthetic. The preset component file (`Galaxy.svelte`), its export from `index.ts`, its demo card, and all documentation references were deleted. The preset count went from six to five.

`CircularFluid` was subsequently added (see below), returning the count to six.

## Shaped containers: inline SDF mask penalisation

`CircularFluid` is the first preset to use the `containerShape` prop, which enforces a physical boundary via mask penalisation rather than naive alpha clipping.

**How it works:**

After every velocity and dye write in `step()`, the engine blits the target DoubleFBO through `applyMaskShader`, which multiplies each texel by a circle SDF computed inline from uniforms. Cells outside the domain receive 0.0; cells inside receive 1.0 (with a thin smoothstep feather at the boundary). Because the velocity is zeroed outside the domain, the divergence there is also zero. The pressure Jacobi solver sees nothing to correct, so it produces correct no-penetration boundary pressure implicitly — without any physics shader changes.

The SDF is aspect-ratio-corrected inside the shader:

```glsl
vec2 p = vec2((vUv.x - uCx) * uAspect, vUv.y - uCy);
float inside = 1.0 - smoothstep(uRadius - 0.005, uRadius + 0.005, length(p));
gl_FragColor = val * inside;
```

where `uAspect = drawingBufferWidth / drawingBufferHeight` and `uRadius` is normalised by canvas height. This makes the circle geometrically round on any aspect ratio.

The display shader also clips outside the circle analytically via `#ifdef CONTAINER_MASK` so pixels outside show only `backColor` with zero alpha.

**Hot-update bucket:** `containerShape` is Bucket B only (keyword recompile). No FBO rebuild needed because the mask is computed inline from uniforms.

**`ContainerShape` type (4 variants):**

```typescript
export type ContainerShape =
  | { type: 'circle'; cx: number; cy: number; radius: number }
  | { type: 'frame'; cx: number; cy: number; halfW: number; halfH: number;
      innerCornerRadius?: number; outerHalfW?: number; outerHalfH?: number;
      outerCornerRadius?: number }
  | { type: 'roundedRect'; cx: number; cy: number; halfW: number;
      halfH: number; cornerRadius: number }
  | { type: 'annulus'; cx: number; cy: number; innerRadius: number;
      outerRadius: number };
```

Each variant has a corresponding SDF branch in both `applyMaskShader` and the display `CONTAINER_MASK` block, plus a TypeScript mirror in `container-shapes.ts`.

**Known limitation:** The mask boundary resolution is the sim resolution (128px). There is an inherent one-texel diffuse zone at the edge — roughly 1/128th of canvas height. This is visible under magnification but acceptable for the intended preset use cases.

## GL program rebind after inserted blit passes (CRITICAL)

**Rule:** When inserting a new blit pass (like `applyMask`) between two existing passes that share a GL program, the shared program must be explicitly re-bound after the inserted pass.

**What happened:** The velocity-advection and dye-advection passes share `advectionProgram`. The original code bound it once for velocity advection and relied on it staying bound for dye advection. Inserting `applyMask(velocity)` between them switched the active program to `applyMaskProgram`. The dye advection then:

1. Set uniforms for `advectionProgram` → `INVALID_OPERATION` (wrong active program)
2. Called `blit(dye.write)` → executed the **mask shader** instead of the **advection shader**
3. The mask shader's `uTarget` was still bound to velocity from the prior mask call → wrote velocity XY as RGB into the dye buffer
4. Result: flat red/yellow/green/black (velocity components as color)

**Diagnosis was difficult** because:
- WebGL `INVALID_OPERATION` errors don't throw — they set a flag checked by `gl.getError()`
- The symptom (flat primary colors) suggested HDR saturation, not a program-binding bug
- Static analysis of 1000+ lines of GL calls couldn't spot the implicit program-reuse assumption
- The fix was ultimately found by adding `gl.getError()` logging inside `applyMask`

**The fix:** One line — `this.advectionProgram.bind()` after the velocity mask call, before the dye advection uniforms.

**General pattern to watch for in `step()`:** Any pair of consecutive blits that reuse a program without an explicit `.bind()` between them. Currently the only such pair is velocity→dye advection. If future features insert passes between ANY two blits in `step()`, check whether the subsequent blit assumes a program is still bound.

## Preset splat positioning for circular containers

Jets must be positioned in UV space accounting for the canvas aspect ratio. The circle's UV-space horizontal extent is `radius / aspect`, which shrinks on wider canvases. For CircularFluid (radius 0.45):

- Physical distance from center: ~0.35 (78% of radius, inside with margin)
- UV positions computed assuming aspect ~1.8 (16:9-ish)
- Safe for aspect ratios up to ~2.3:1
- On ultra-wide canvases, horizontal jets may land outside and get zeroed by the mask — acceptable

## Dye concentration in confined containers

The engine's random-splat path applies a **10× HDR multiplier** to all random splat colors (both `generateColor()` and `randomSplatColor`). On a full canvas, this creates vivid bloom highlights. In a confined container (~35% of canvas area), the same energy concentrates into fewer pixels, quickly oversaturating the dye.

Mitigations for `CircularFluid`:
- Preset splat colors use moderate values (0.5–1.1) instead of Plasma's HDR (1.5–2.2)
- `densityDissipation: 0.4` (vs Plasma's 0.1) — faster fade prevents accumulation
- `bloomThreshold: 0.6` — lower threshold lets bloom activate on moderate values

This is now handled by `hdrMultiplier()` in `FluidEngine.ts`, which scales the 10× base by `sqrt(areaFraction)` where `areaFraction` is the container's area relative to the full canvas. Each shape variant computes its own area approximation.

## Frame shape: rectangular inner cutout via box SDF

**What it is:** A second `ContainerShape` variant: `{ type: 'frame'; cx; cy; halfW; halfH }`. Fluid flows everywhere except inside a rectangular cutout — like a picture frame. This is the inverse of `circle` where fluid is confined inside.

**SDF math:** Chebyshev box distance in UV space. `d = max(abs(x-cx)-halfW, abs(y-cy)-halfH)`. Inside the box d<0 (mask=0, no fluid); outside d>0 (mask=1, fluid flows). No aspect correction needed because the rectangle is specified in UV coordinates.

**Shader approach:** The `applyMaskShader` was refactored from a single circle SDF to support multiple shapes via `uniform int uShapeType`. Circle is type 0, frame is type 1. Both share `uCx`/`uCy`; circle uses `uRadius`/`uAspect`; frame uses `uHalfW`/`uHalfH`. The display shader's `CONTAINER_MASK` block uses the same branching.

**Testing:** SDF math was extracted to a pure TypeScript module (`container-shapes.ts`) with functions that mirror the GLSL. 33 vitest tests cover both shapes' SDF evaluation, `containerShapeEqual`, and edge cases. This is the first test infrastructure in the project.

**FrameFluid preset:** 8 jets (4 edge + 4 corner) in clockwise circulation around the frame border. Colors and forces tuned for the narrower flow region.

## Randomized burst timing

Fixed-interval spawning of random splat bursts creates a metronome effect that looks artificial. Jittering the interval by +/-50% via `baseInterval * (0.5 + rng())` makes the bursts feel organic. The RNG is seeded, so the jitter pattern is still deterministic for a given seed -- the "randomness" is in the timing rhythm, not the reproducibility.

## Tangential velocity via randomSplatSwirl

For container-confined presets, per-splat tangential velocity creates natural rotational flow that prevents the fluid from pooling at the center. The formula is `dx = -(y - cy) * swirl`, `dy = (x - cx) * swirl`, where `(cx, cy)` is the container center. Positive swirl = CCW, negative = CW.

CircularFluid uses `swirl: 500` (aggressive, drives a visible vortex), FrameFluid uses `swirl: 300` (gentler -- complex geometry with corners needs less force to maintain visual motion).

## Full-canvas scatter with randomSplatSpread

The `randomSplatSpread` config controls vertical jitter range for random splat spawn positions (default 0.1 = +/-0.05). For frame shapes, the default narrow spawn band often falls inside the masked-out cutout, so splats are immediately zeroed by the mask and produce no visible effect.

Setting `spread: 2.0` scatters splats across the entire canvas. The container mask naturally discards any splats that land outside the fluid domain, so only the in-bounds ones contribute. This is wasteful (many splats are discarded) but simple and correct.

## Frame inner + outer corner radius

The frame shape supports rounded corners on both the inner cutout (`innerCornerRadius`) and the outer boundary (`outerCornerRadius`). The SDF computes `innerMask * outerMask` — the intersection of being outside the inner rounded-rect AND inside the outer rounded-rect. When outer params are omitted, defaults (`outerHalfW=0.5, outerHalfH=0.5, outerCornerRadius=0`) cover the full canvas, preserving backward compatibility. The rename from `cornerRadius` to `innerCornerRadius` was a deliberate breaking change for API clarity once outer params existed. Exposed as `<FrameFluid innerCornerRadius={0.06} />`.

## Rejection sampling for shape-aware splat spawning

Random splats now use rejection sampling (up to 10 attempts) against `containerMask()` before splatting. This avoids wasting GPU work on splats that land outside the fluid domain. For a 50%x50% frame cutout, ~75% of the canvas is valid, giving ~5.6% drop rate at 10 attempts — acceptable for organic visuals. When `evenSpacing` is true, only `y` is re-sampled (the x column is deterministic), so shapes that don't intersect that column will drop those splats silently.

## SVG shape preview coordinate gotchas

The SVG overlay for the playground must use `cr * Math.min(w, h)` for corner radii, not separate `rx`/`ry`, because the GLSL SDF applies corner radius isotropically in UV space. Using separate pixel-space radii would produce elliptical corners on non-square canvases while the actual fluid boundary has circular corners. Circle/annulus shapes use `radius * height` as the SVG radius since the SDF normalizes by canvas height with aspect correction.

## Annulus (circular ring) container shape

The annulus confines fluid between two concentric circles. The SDF `max(d - outerR, innerR - d)` elegantly combines two distance checks into one signed distance field: negative inside the band (fluid allowed), positive outside (fluid zeroed). This is simpler than the two-smoothstep approach (`smoothstep(inner) * (1 - smoothstep(outer))`) and gives correct antialiased edges with a single smoothstep call.

Aspect correction matches the circle shape exactly: `px = (uvX - cx) * aspect`. Both radii are in height-normalized space, so the ring appears circular on any aspect ratio. The degenerate case (innerR >= outerR) naturally produces sdf >= 0 everywhere, so the mask is zero with no special-case code needed.

The AnnularFluid preset uses 8 tangential jets at the midpoint radius to establish a ring-vortex pattern. High `randomSplatSwirl: 600` sustains the orbital motion. Like CircularFluid, moderate `spread: 0.8` scatters random splats broadly; the mask discards out-of-band ones.
