# Learnings — the deterministic-stepping harness (`advance()`)

## `advance()` steps the physics but never composites to the visible canvas

**Symptom:** While researching a golden-image (screenshot-diff) test
design, tracing `advance(steps, dt)` end-to-end showed it only calls the
private `step(dt)` in a loop. `step()` runs the full physics pipeline
(advection, viscosity, projection, dye/scalar advection) but never calls
the private `render(target)` method that composites bloom/sunrays/shading/
glass/color/obstruction-fill/container-masking onto the canvas.
`render(null)` has exactly one call site in `FluidEngine.ts`, inside the
private RAF tick (`update()`), which `advance()`-driven (`autoStart:
false`) harnesses never run.

**Cause:** `advance()` was built (Phase 0, ADR-0042) purely to make the
*internal simulation fields* (`readField('velocity' | 'dye' | ...)`)
deterministic for numeric acceptance tests (divergence, energy,
grid-scale-churn). Nothing in that harness ever needed the display
pipeline to run, so it was never wired up.

**Consequence:** any future test or tool that wants a deterministic,
reproducible *screenshot* of what a preset actually looks like (not just
its internal field values) cannot just call `advance()` and grab the
canvas — the canvas will be blank or stale. It would need a new
`@internal` entry point that also triggers a single deterministic
composite pass (e.g. an `advance()` option, or a sibling method), which
does not exist today.

**Why this matters:** all of the engine's existing regression nets
(`divergenceL2`, `gridScaleEnergyFraction`, energy/liveness bands,
resolution-invariance) read raw internal fields via `readField()` — none
of them ever exercise the display/composite shader path. That path
(bloom, sunrays, shading, glass, color grading, obstruction fill,
container masking) currently has **zero** automated coverage of any
kind, numeric or visual. This was the deciding fact behind ADR-0050
(declining CI golden-image testing rather than building it) — the gap is
real, but closing it isn't free, and manual real-browser QA was judged
cheaper than standing up the missing harness plumbing plus a
cross-renderer-jitter-tolerant CI job.
