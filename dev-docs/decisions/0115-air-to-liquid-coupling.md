# ADR 0115: One-way air-to-liquid coupling

**Status:** Accepted (internal)
**Date:** 2026-10-30
**Amended by:** ADR 0116 (exported from `svelte-fluid/experimental`)

## Context

Verdigris v2 stirs cursor-driven air/mist with `FluidEngine`; falling markers
belong to `LiquidEngine` in a different WebGL2 context. Air should deflect a
pour without bulldozing a supported pool or compromising exact species counts.

## Decision

- Internal `FluidEngine.queueVelocitySnapshot(tick, width, height): boolean`
  and `pollVelocitySnapshot(): { tick, epoch, width, height, data } | null`.
  Not added to `FluidHandle`, root exports or user docs. Requires WebGL2 plus
  `EXT_color_buffer_float`; otherwise enqueue returns false. Dimensions 1..96
  by 1..60, nonnegative safe-integer ticks.
- GPU exact area/box average of signed velocity texels (piecewise constant,
  fractional-edge weights; explicit `texelFetch`, no hardware linear filtering)
  into an instance-owned RGBA32F target. Average each axis before division by
  its simulation texture dimension: the advection trace is
  `uv - dt * velocity * simTexelSize`, so snapshot `ux = vx / simWidth`,
  `uy = vy / simHeight`. Values are normalized-domain units/s, x right/y up,
  interleaved xy, **bottom row first**.
- The game converts to a liquid grid W×H: for top-down wind cell (x,y), read
  snapshot offset `2 * ((snapshot.height - 1 - y) * snapshot.width + x)`;
  set `vx = W * ux`, `vy = -H * uy`. For Verdigris W=192, `vx = 192 * ux`;
  use the actual level height for `vy`. Scale both components together by
  `min(1, 400 / hypot(vx,vy))` (zero vector stays zero). Wind samples cover the
  entire liquid domain; the liquid shader manually bilinearly interpolates
  cell-centred values with edge clamping. Wind rows are top first, y down.
- Three instance-owned PBO/fence slots, FIFO issue order, zero-wait fence
  polling. Full ring refuses enqueue, never blocks or overwrites a pending
  sample. Poll returns one completed sample. Verdigris buffers by issue tick:
  snapshot t is consumed only at liquid tick t+2, sensor t is observed immediately
  before planning t+2. The first two ticks have no wind. A missing exact frame
  suspends simulation, yielding with `setTimeout(0)` until that fence signals;
  no newest-ready substitution, skipped ticks, extrapolation or synchronous spin.
  After a 50 ms wait, pause with a visible message, preserving the target for
  resume. Pause, visibility loss, restart and context loss cancel owned retries.
  Resize waits until all issued air snapshots are retained on the CPU before
  invalidating their engine epoch. Determinism covers identical inputs, seed and
  GPU implementation, not bitwise equality across devices.
- Rebuild, simulation-resolution transition, resize, opening replay and
  context loss invalidate pending samples and advance the epoch. Changing
  snapshot dimensions also starts a new epoch. All GL operations enter the
  existing `withGl()`/shared-host scope. Targets, buffers and fences belong
  to the engine instance; its lazy program belongs to the shared cache on
  shared tier, otherwise to the instance. Dispose deletes all owned handles;
  context loss forgets invalid handles, restoration rebuilds lazily.
- `LiquidTick.wind` is validated before tick mutation: integer dimensions,
  exact Float32Array length, finite vectors, Euclidean magnitude ≤400 cells/s.
  The instance owns an RG32F/NEAREST texture, uploads a new wind object or
  changed contents only (retains reference plus a value copy to detect in-place
  mutation). Omission disables wind via a uniform, not a stale texture.
- Approximate airborne fraction, not surface reconstruction: solid-aware 3×3
  tent-filtered marker density rho, rest density 4 markers/cell;
  `falling = smoothstep(15,40,gridVyDown)`;
  `a = max(falling, 1 - smoothstep(.25,.9,rho/4)) * (1-support)`.
  Support is one when the cell immediately below is solid, or contains ≥3
  markers **and** its cell-centre grid vy is <15 cells/s downward. Falling
  liquid cannot support a falling column. Tent weights
  `(2-|dx|)*(2-|dy|)` normalize over non-solid cells. This shields slow resting
  pools without shielding dense falling pours; sparse spray still responds.
  It is not aerodynamic two-phase pressure.
- After PIC/FLIP mixing and existing physical damping, apply exponential
  drag `v += (wind-v) * (1-exp(-6*a*dt))`, k=6/s. Apply the same correction to
  the midpoint transport sample, at the midpoint, so displacement responds
  during the current substep rather than waiting for the next grid splat.
  Preserve speed cap, swept collisions, drain accounting and marker identity.

## Consequences / rejected alternatives

One-way coupling only: liquid does not displace or feed momentum back into air.
A low-resolution transfer and asynchronous latency trade fidelity for bounded
CPU traffic (at most 92,160 GPU-readback bytes per 96×60 sample, 46,080-byte xy
result; three PBOs). Box reduction costs O(simulation texels) texture fetches.
Wind adds CPU validation O(wind cells), an upload only on change, plus local
marker shader samples; supported markers skip density/wind sampling early.

Hardware regression (Apple M1 Max), after the falling-velocity correction:
actual 6.4-marker/tick, 4×4-cell, 20-cells/s pour falling ~70 cells, +60 cells/s
wind shifts the first-landing centroid 83.005 cells (28.554 → 111.559; gate ≥25),
all 1152 markers conserved. Sparse 2-marker/tick regression shifts 86.890 cells
(gate ≥8). Supported 3840-marker pool holds level exactly, centroid drift
<0.000001 cells over three seconds. Sloshing dam-break body rises only
0.126 cells relative to the no-wind reference; high spray decreases 38 → 4.

## Airborne ribbon rendering

Fast vertical freefall exposed an existing renderer failure: a valid pour's
markers separate by 2–3 cells and vanish below the density threshold. Changing
physics or increasing emitted volume to hide this would break the game contract.

Only airborne markers get a velocity-aligned capsule footprint, stretched by
one tick (`velocity / 60`) in image pixels. Its cross-stream radius is 35% of
the original broad pool Gaussian radius, preventing the coverage floor from
turning a four-cell emitter into a ten-cell pipe. The point sprite bounds the
capsule; the fragment computes
nearest distance to its segment using true subpixel coordinates. Slow supported
markers retain the original footprint exactly. Density shader support uses the
current measured cells and terrain (bound explicitly); solids always support,
dense liquid below supports when marker vy is <15 cells/s. Falling or sparse
unsupported markers receive the display-only coverage channel.

The additive density alpha channel keeps its original speed signal plus an
airborne-only excess (8 times the kernel for isolated spray, 3 times when its
cell has ≥2 markers). The composite's ordinary density
threshold is unchanged; `smoothstep(.15,.4,max(alpha-totalDensity,0))` adds
coverage only where airborne excess exists. The speed highlight clamps to
original density so the excess does not become an energy/colour boost. No
simulation fields, species counts, pooled-density colour, optical depth or
rest-density threshold change. This is a motion/coverage approximation, not
extra simulated liquid or temporal accumulation.

GPU tests render the same settled pool and dam-break state through legacy and
new passes, compare opaque body pixels, and save before/after PNGs. Real-pour
beauty captures check every row between source and landing for continuous
coverage, with and without wind. At 5 pixels/cell, the no-wind four-cell
emitter measures 5.4 / 5.0 / 5.2 cells at source / middle / landing (alpha>100);
the midpoint gate is ≤5 cells. Sparse-drop diagnostic PNGs remain explicitly
labelled marker overlays.

## Render-only connected-body pigment mixing

Discrete marker species must remain discrete: recipes, sensors, drains and finite
supply require exact integer accounting. PIC/FLIP does not diffuse identity, so
layered dew and sap otherwise remain blue/gold indefinitely. Mixing their display
colour is a presentation decision, not a change to transport or sensor semantics.

A separate instance-owned grid-resolution RGB/count field seeds from the existing
measured per-species cells using a solid-aware 3×3 tent. Liquid needs at least
0.25 markers/cell, so a slow meniscus shares the body's colour rather than
retaining an unmixed rim. Unsupported flow fades out over 15–35 cells/s;
support from solid or dense slow liquid below fades in continuously, avoiding
grid-shaped speed-cutoff seams inside the submerged plume.
Four alternating horizontal/vertical radius-24 box passes average species
fractions weighted by local density, retaining the seed density as the immutable
eligibility mask in alpha; each tap walks every intervening cell, stopping at
solid, air or fast-liquid masks. Thus a four-cell wall cannot be jumped by a wide tap.
Two half-float targets ping-pong; repeated renders at the same simulation tick
reuse the mixture (the benchmark explicitly invalidates this cache to charge
playback cost). Linear-filtered sampling smooths the grid field. The composite
normalizes the resulting fractions and blends toward them at local eligible
densities of 0.1–0.8 markers/cell before the unchanged KM palette lookup.
Fast falling ribbons retain their local species; settled pools mix immediately
once slow/dense, within the settling interval, without temporal history or stale
colour following terrain edits. Coverage, thickness, meniscus, optical depth and
all simulation targets remain unchanged. No readback or Svelte dependency.

GPU regressions compare several layered-pool hues with the palette's equal KM
mixture, sample opposite sides of a four-cell wall, preserve gold above a blue
pool, compare pure-pool pixels with the previous composite, and compare every
marker plus exact sensor counts against an unrendered simulation. Before/after
captures live under `/tmp/verdigris-mix/`. Existing opt-in render budget remains
2 ms at 50,000 markers and 1280×800; no unconditional timing assertion.

Rejected synchronous `readField`: stalls the animation thread on unfinished
GPU work. Rejected sharing textures: WebGL objects cannot cross contexts.
Rejected shared-context migration and feedback pressure: disproportionate
ownership/lifecycle changes, unnecessary for this one-way game mechanic.
