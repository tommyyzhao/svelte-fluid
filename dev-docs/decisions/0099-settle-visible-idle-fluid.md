# ADR-0099: Settle a visible idle fluid to zero frames

## Status

Accepted (2026-10-02)

## Context

ADR 0063 skips solver work only while emptiness is provable, and its
`solverMayContainContent` never resets. A visible `<Fluid>` that has fully
decayed still ran `update()` (full solve plus render) every animation frame
forever. Goal: zero frames rendered while idle.

## Decision

1. `update()` counts frames after each presented frame. Every
   `SETTLE_CHECK_INTERVAL` (30) frames `fieldsAreQuiet()` reads `velocity` and
   `dye` back through `readFieldInner`. After `SETTLE_CHECKS` (3) consecutive
   quiet checks the loop is stopped (`settled = true`, `stopRaf()`); the last
   frame is already on screen.
2. Quiet (`isQuiet` in `engine/settle.ts`):
   - max dye < `SETTLE_EPSILON` (0.5/255): invisible, nothing left to move,
     whatever the velocity does; or
   - max |velocity| < `SETTLE_VELOCITY` (0.5) and the per-frame dissipation
     change `max(dye) * (1 - 1/(1 + DENSITY_DISSIPATION/60))` < `SETTLE_EPSILON`.
   Evidence: in a default decayed scene `|v|` stays at roughly 35-50 for
   20 s (vorticity confinement sustains it) while dye reaches exactly 0 at
   about 12 s. A velocity-only gate never settles; velocity matters only while
   visible dye remains. Fading is a visible change, so a scene settles only once
   the per-frame fade is below half an 8-bit step.
3. Never check or settle while: `PAUSED`, `autoStart` false or deterministic
   mode, pending frame input, any pointer down, or a continuous driver
   (`hasContinuousDriver`: `autoSplatRate > 0`, driving or prescribed `flow`,
   initial-dissipation ramp still running). `COLORFUL` only recolours future
   splats, so it does not block.
4. Any input wakes it (`wake()`): `splat`, `randomSplats`, `setConfig`,
   `resize` (when the size changed), pointer down, hover pointer move, context
   restore. `resume()` also clears it; explicit `pause()` clears `settled` and
   wins. `isPaused` stays true while settled on the engine;
   `Fluid.svelte`'s handle reports `isPaused && !isSettled` so the auto-reveal,
   auto-distort and auto-animate wrappers keep splatting and so wake it.
5. `settleStill()` (reduced motion) is unchanged and does not set `settled`.

## Consequences

- Settled engines cost 0 GPU and 0 rAF callbacks. Measured: default config
  settles in about 6 s; `densityDissipation: 4` in about 3 s.
- Check cost (full sim-res velocity + dye-res read, hardware Chrome, 256 px
  dye, 64 px sim): about 5 ms per check, 0.17 ms/frame averaged. Larger dye
  resolutions cost more per check; if that exceeds ~0.2 ms/frame, downsample
  dye into a small FBO before the read.
- Waking is not bit-exact against a never-stopped engine: each uses its own
  wall-clock dt sequence, and the first dt after a wake is clamped. Measured
  max |dye| difference 0.01 one second after the same splat.
- Supersedes the "detecting decay is not worth it" stance of ADR 0063.

## Amendment (2026-10-02): GPU max probe, asynchronous readback

The full-field readback was too expensive at real sizes. Measured on HEAD
`db8d41a` (Apple M1 Max, hardware Chrome, 1440x900 CSS, DPR 1-3, dye
1638x1024): 19-37 ms per check, max 45 ms. That is a dropped frame every
half second, and 0.6-1.6 ms/frame amortized over the 30-frame interval.

Replacement, same `isQuiet` semantics (max |velocity|, max dye over rgb):

1. `settleMaxShader` (shaders.ts, a core program, so it uses the existing
   compile and shared-host program cache) max-pools |channel| over an 8x8
   tile per pass into an R16F target. A chain of passes (1638x1024 dye: 205x128,
   26x16, 4x2, 1x1) reduces each field to one pixel. Chains are per instance
   and rebuilt when the field size changes. The pass binds its program,
   texture, uniforms and blend state (shared tier).
2. Both 1-pixel results go into a 32-byte `PIXEL_PACK_BUFFER`, followed by
   `fenceSync`. Later frames poll the fence (`getSyncParameter`, no wait) and
   read the buffer with `getBufferSubData` once it signals. The check never
   stalls the pipeline. One probe is in flight at a time.
3. Staleness: a probe is dropped if a `splat()` happened after it was issued,
   if the config, size or pause state changed,
   or if any frame in between was ineligible (driver, pointer, pending
   input, pause). Such frames write the fields outside `splat()`.
4. Without `EXT_color_buffer_float` (or on WebGL1) no probe is issued and the
   engine never settles. The old path fell back to a byte read that could
   only see dye.

Settling now takes at least the time until the probe's fence signals, about
one frame. Time to settle is otherwise unchanged. A browser test checks that
the probe's maxima equal a full `readField` maximum on a splatted field with
odd sizes, to half-float precision. Measured cost is in
`dev-docs/benchmarks/gpu-budget.md`.

Final measured validation HEAD `b278b11`: default/GasFlare/Karman at 1440x900
CSS DPR 3 cost 0.90 ms median CPU per check, max 1.20/1.20/1.10 ms,
0.030 ms/frame amortized. Paired synced throughput puts probe workload at
0.285/0.305/0.300 ms per checked frame (~0.010 ms/frame averaged). A favorable
full matrix does not establish the 2 ms bar: earlier GasFlare checked frames
measured 2.04 ms and shared-tier Karman remains above it. GL validation/read
errors fail closed, candidate chains swap only after complete allocation.

## Amendment (2026-10-02): staged immutable snapshots

The synchronous issue frame's two complete chains plus PBO reads left too little
headroom under the strict 2 ms **per-frame**, not amortized, GPU budget.

`issueSettleProbe()` now allocates complete candidate chains transactionally and
freezes **both** first-level maxima in the same frame/epoch. These instance-owned
R16F FBOs are immutable until that probe is retired. No live ping-pong field is
retained. Later eligible frames run **at most one** remaining reduction draw,
velocity levels first, then dye levels. The following frame queues the unchanged
two-pixel PBO reads, fence and flush; later frames poll without waiting. Exact
8x8 source maxima and thresholds are unchanged; no sampling or shader change.

One probe remains in flight. Check starts remain every 30 eligible frames;
three consecutive accepted quiet snapshots still stop the loop. Splat, config,
resize, pause/resume, ineligibility, loss and dispose cancel the probe immediately
and reset its quiet streak. Shared stages rebind all consumed GL state. Failed
allocation, reduction, readback or validation cannot become a quiet verdict.
WebGL1/missing float readback remains conservative: no automatic settling.

For the measured three velocity levels and four dye levels, five tail draws plus
a readback-issue frame precede fence polling: about six extra frame intervals
(~100 ms at 60 Hz), plus driver fence latency. Other resolutions differ. This
preserves the **issue-time snapshot result**, not a mathematical proof that the
current fields are quiet: ordinary simulation evolves velocity/dye without an
external-input epoch change. That delayed-snapshot assumption already existed;
staging extends its latency honestly. No claim of current-field equivalence.

Hardware parity tests compare staged maxima against full issue-time readbacks at
odd sizes on both tiers while fields continue evolving; each later stage is
asserted to draw at most once. Cancellation is tested before and after fencing.
Independent stage measurements and remaining release blockers are recorded in
`dev-docs/benchmarks/strict-budget-followup.md`.

## Amendment (2026-10-02): byte threshold fallback and renderer limits

WebGL1 and WebGL2 without float readback now use the same staged immutable
snapshots, cadence, epoch cancellation and three-check streak. The first 8x8
reductions write exact boolean flags into NEAREST RGBA8 targets: velocity
`any(abs(rg) >= 0.5)`, dye `any(abs(rgb) >= 0.5/255)`, dye per-frame fading
`any(abs(rgb) * (1 - 1/(1 + dissipation/60)) >= 0.5/255)`, and dye nonzero.
Tail passes component-wise max/OR flags, never clamp HDR maxima into bytes.
Two 1x1 RGBA/UNSIGNED_BYTE reads transfer eight bytes synchronously. Ordinary
quiet is `!visible || (!moving && !fading)`, equivalent to the existing maxima
predicate. Initialized nonquiet sentinels, invalid flags and GL errors fail
closed. Complete candidate chains replace old chains only after validation;
capability is re-probed after restore. Float-capable WebGL2 retains PBO/fence reads.

Eight bytes do **not** prove GPU cost: synchronous readPixels may stall behind
prior GPU work. `settleCheckStats.stageMs` and `readbackMs` expose separate CPU
wall times; neither is native GPU certification. No Xcode capture is claimed.

Dye-only ordinary thresholds do not prove convergence for arbitrary renderers.
The display shader can amplify sub-epsilon dye: distortion displaces image UV by
`power * normalize(velocity) * dye.r`; reveal applies `pow(dye * sensitivity, curve)`.
These modes now require exactly zero dye on both paths, not a blanket never-idle
rule. Nonzero half-float tails can therefore prevent settling. Non-dye flow
visualization displays velocity/pressure/scalars independently of dye; its quiet
proof remains unresolved and automatic settling is conservatively disabled while
that visualization is active. Exception: driver-free flow visualization may settle
while `solverMayContainContent` is false, because initialized speed/pressure/scalar
fields stay zero and `step()` skips all writes; nonempty flow still lacks a
convergence proof. Actual contributing-field convergence probes are
outside this finite fallback change. No claim of zero-idle frames for all modes,
arbitrary gain/contrast/optical settings or calibrated image convergence.

Validation at `9c64676`: ordinary installed hardware Chrome, focused idle suite
29/29, full browser suite 279/279 across 34 files, Node 869/869, check zero
errors/warnings, build and prepack passed. Tests force WebGL1 at the existing
canvas context seam and missing float capability per instance (not by disabling
float simulation support globally). Coverage includes signed/HDR odd-edge flags,
immutable snapshots, byte errors, cancellation/restore, wake/re-settle, retained
presentation, and rendered sub-epsilon distortion/reveal counterexamples.
Separate stage/readback wall-time counters are instrumentation, not a timing
budget acceptance result; native GPU certification remains pending.

Review follow-up: velocity flags also preserve an invalid-component bit before
max reduction; ordered per-component half-float bounds reject NaN/Infinity.
Invalid dye writes all nonquiet flags. Both readback paths reject invalid internal
dissipation even for exactly empty distortion/reveal. Public config resolution
filters nonfinite input through `withoutNonFiniteConfig` but accepts negative
finite dissipation; direct test injection isolates the internal quiet-validation
boundary for both cases.
Focused hardware follow-up passed all four selected parity/flag tests.
