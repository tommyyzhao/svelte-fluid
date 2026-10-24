# Sprint closeout — 2026-10-23

## Outcome and scope

Public disturbance forcing, passive tracers and flux-preserving outlet relaxation are integrated and opt-in.
ADRs [0121](../decisions/0121-flow-disturbance-force.md), [0122](../decisions/0122-flow-outlet-relax.md)
and [0123](../decisions/0123-flow-tracers.md) are Accepted. No preset/default migration is implied.
The laboratory two-level pressure solver remains bench-only: its timing gate failed.
The paper experiment is an honest 2D diagnostic, **not a reproduction of the 3D experiment**.
This record closes implementation/verification, not a release, publish or production-3D authorization.

## Durable findings and dispositions

| Area | Accepted result | Boundary / rejected shortcut |
|---|---|---|
| Thermal emission | Independent temperature and salt; float-capable bounded transport; opt-in no-slip ([0114](../decisions/0114-thermal-salt-emission.md)). | Reduced model, not combustion or converged CFD; physical cooling can be dominated by numerical transport. |
| Submission / pairing | Measured pressure/viscosity pairing ([0115](../decisions/0115-substep-submission-and-pressure-crossover.md)). | `gl.flush()` and paired conduction rejected by measurement; geometric multigrid missed contraction gate. |
| SVG glass | Existing SDF/glass resources produce an inside-only cover ([0116](../decisions/0116-svg-channel-glass-cover.md)). | Fixed artistic reflections, not calibrated optics; no solver change. |
| Absorption | Beer–Lambert transmission, concentrations separate from display ([0117](../decisions/0117-transmitted-dye-and-paper-valve.md)). | Legacy collocated paper-flow calibration failed conservation; appearance is not validation. |
| MAC preflight | Compatible face operators and Poiseuille verification ([0118](../decisions/0118-staggered-conservative-flow.md)). | Inlet runaway persisted with exact projection; “more pressure iterations” was not its cure. |
| Reservoir laboratory | Plenums plus flux-preserving outer relaxation stabilize the route ([0119](../decisions/0119-paper-mac-plenums.md)). | Route-local, experimental; no wholesale replacement of the public engine. |
| Laboratory tracers | Thin passive streaks without altering velocity/grid dye ([0120](../decisions/0120-paper-tracers.md)). | Finite sampling, sticking and ring deletion; neither concentration nor missing 3D folding. |
| Public disturbance | Seeded smooth forcing; uniform-only hot changes; omission parity ([0121](../decisions/0121-flow-disturbance-force.md)). | Acceleration is an input, not a guaranteed turbulence intensity. |
| Public outlet | `velocity: 'relax'`, positive `relaxRate`, default 10/s ([0122](../decisions/0122-flow-outlet-relax.md)). | Legacy `'damp'` remains default; preserving outlet flux does not fix obstruction projection. |
| Public tracers | Absorption-only optical inventory; UV-area mass; exact fractional emission ages ([0123](../decisions/0123-flow-tracers.md)). | Default capacity 262144; report-only cost; sigma contract already decided, not reopened. |

### Conservation: separate the two causes

Five-section post-projection spread is a diagnostic, not automatically mass loss: sources/sinks matter.
Controlled channel measurements isolate outlet damping from masked-contraction error:

| Scene | Mean spread |
|---|---:|
| Plain open channel | 0.0% |
| Channel with legacy damp outlet | 39.5% |
| Channel with relax outlet | **0.0%**; gate ≤2% passed |
| VENTURI with damp outlet | 127.5% |
| VENTURI without outlet | 88.9% |
| VENTURI with relax outlet | 83.4%; report-only |

Relax removes the outlet contribution, not the remaining obstruction-contraction defect.
A generic public sponge was therefore rejected as the wrong fix; no `flow.sponges` was added.
Face-aperture/cut-cell or compatible-operator work needs a separate ADR and regression budget.

### Solver work: preserve the failed gates

- Original C1: ≤0.2% spread within ≤64 equivalent fine passes; harmonic PCG missed it
  (best reported worst-capture spread 0.444% near 60 passes). A hierarchy alone proves nothing.
- A-PCG: measured six iterations reached 0.281%, but reduction/submission draws failed its frame budget.
  On ANGLE Metal, count draws before treating arithmetic-equivalent work as a performance estimate.
- Draw-neutral two-level GPU bench: GPU/CPU error **2.1e-5** passed; actual 64-draw spread
  **3.46% → 1.067%** passed its revised ≤1.15% gate.
- Timing: **3.82 / 3.38 ms = 1.128×**, failing ≤1.10×. Stop taken; Re400 step-level gate not run.
- Residual L2 rose roughly **25×** despite improved section spread. Local divergence remains a risk.
  `pressureSolver: 'two-level'` intentionally throws; do not label this an available laboratory solver.
- Any post-smoothing or slower-solver experiment is a **new pre-registered question**, not a rescued pass.
  Evidence: final two-level lane report (2026-10-23); tracked `mac/two-level.browser.test.ts` and benches.

### Paper comparison: what the numbers support

Paper: Nguyen, Abouezzi & Ristroph, *Nature Communications* 12:2884 (2021), Figs. 2–4.
Geometry uses a patent trace, not the experimental CAD: 11 units, traced mean width ≈0.837 cm
versus reported 0.9 cm; hydraulic estimate ≈0.660 versus reported 0.8 cm. Do not tune it to pass.
Diodicity **Di is reverse/forward pressure drop at matched flow**, not equal-drive flow ratio.

| Observable | Result / interpretation |
|---|---|
| Matched-Re200 Di | MAC **1.0811**, Basilisk **1.0790**; agree within 0.2%. Paper digitized **1.591**, band 1.565–1.618; not reproduced. |
| Equal-drive Qf/Qr | MAC 1.0520, Basilisk 1.0588, planar OpenFOAM 1.0398: weak rectification, not Di. |
| Reverse Re200 | Laminar in 2D; fine MAC and 3.53% inlet-noise sensitivity do not recover the paper transition. |
| Reverse Re400 | Unsteady in both 2D codes; Basilisk zero-noise shedding persists over the checked window. |
| Frequency | MAC St≈0.93, Basilisk ≈0.835; ≈9% gap exceeds the shared estimator's uncertainty. Fine MAC ≈0.899 is not a convergence proof. |
| Amplitudes | Cross-code probe positions/interpolation differ; quantitative amplitude agreement unresolved. |

Earlier MAC St≈0.22/0.11 were aliases and are withdrawn. Sample spectra at step level;
pre-register shared physical probe coordinates, interpolation and record length before comparison.
Fine-frequency tolerance was narrower than one raw bin; half-window scatter exceeded the shift.
Re200 coarse dye “onset unit 8” disappears on refinement: numerical dye diffusion, not instability.
Re400 dye onset remains resolution-sensitive. Tracers sharpen filaments but introduce visible gaps/speckle.

Re400 ships only under recorded laboratory exceptions: mean spread **0.012%**, but instantaneous
p95 spread **3.45%** and only **39%** of samples pass the amended gate (required 95%).
Last-third iterative/exact upstream SD ratios are **19.6 / 21.0 / 24.5×** at units 1–3;
exact upstream transients are still decaying. Do not substitute the withdrawn full-window “6×/35×” claims.
Downstream shedding is independently supported; upstream units 1–4 are largely projection-leak artifacts.
ADR0119 retains the detailed chronology, exceptions, transient tables and corrected claims.

Independent evidence provenance: final Basilisk cross-code report and OpenFOAM pilot report,
2026-10-23, retained in the private research archive; key numbers summarized here, not raw logs.
The planar pilot reached reverse Re200.82 versus Basilisk 200.72 after ≈2 transits.
The 3D pilot is **timing only**: 245756 cells, four concave cells unresolved, 0.73 wall s/step
on two cores at dt=.001 s. Estimated 5T/8T costs **13.7/21.9 h per direction**, before calibration
(estimated another 6–11 h/direction), mesh repair/refinement and reruns. Four-core scaling unmeasured.
Depth physics is a credible hypothesis, not a demonstrated explanation or a reason to change defaults.

## Final verification and reproducible entry points

Final combined hardware snapshot: **2026-10-23 16:03:57**, after final tracer corrections at15:23.
ANGLE Metal / Apple M2, Chrome155.0.8059.86: tracers **12/12**, outlet **8/8**, disturbance **6/6**,
MAC **7/7 + 1 optional measurement skip**, selected conservation **2/2**. Every Metal parity pin ran.
Final report-only tracer GPU medians: grid **0.110 ms**, tracers **4.219 ms**; not a frame-rate promise.
Portable behavior tests remain unconditional; captured field hashes are ANGLE-Metal-gated, not universal bytes.
Final CPU/package/build gates, reported by the integration lead after cleanup edits:
**1201 passed + 1 existing skip; svelte-check 540 files, 0 errors/warnings; prepack and build pass.**

From repository root; hardware commands require hardware Chrome and exclusive project GPU ownership:

```sh
bun run test && bun run check
bun run prepack && bun run build
bun run test:browser src/lib/engine/__benches__/flow-tracers.browser.test.ts
bun run test:browser src/lib/engine/__benches__/flow-outlet-relax.browser.test.ts
bun run test:browser src/lib/engine/__benches__/flow-disturbance.browser.test.ts
bun run test:browser src/routes/test/tesla-valve/mac/mac.browser.test.ts
SVELTE_FLUID_GPU_BENCH=1 bun run test:browser src/lib/engine/__benches__/flow-conservation.browser.test.ts -t 'CHANNEL_OPEN_OUTLET_RELAX|VENTURI_RELAX'
SVELTE_FLUID_SHOTS_EXTRA=two-level bun run test:browser src/routes/test/tesla-valve/mac/two-level.browser.test.ts
```

Two-level replay additionally needs its ignored capture/health fixtures; absence is not a measured pass.
The independent Python oracle is explicitly opt-in with `SVELTE_FLUID_PYTHON_ORACLE=1` and `uv`.
No fresh GPU run was needed to write this closeout. Raw captures remain outside Git.

## Follow-ups: engineering versus human choices

**Engineering queue, not product decisions:** optimize confirmed full-ring warm-up submission
(1048576 vertices even with few live tracers); preserve regression/ownership tests.
**Unvalidated review candidates, not established bugs:** thin-wall thermal trace tunnelling;
no-slip viscosity final-mask bypass; per-substep `thermalFields()` arrays. Reproduce before changing code.
Do not turn these candidates into claims that the accepted public features failed.

**Human choices:** (1) spend days on calibrated/refined 3D research versus browser-library priorities;
(2) retain the disclosed Re400 demo, hide it, or fund a newly gated accuracy/performance experiment;
(3) fund obstruction-conservation redesign while preserving compatibility, versus retain the visual solver;
(4) choose release timing/exposure after review. None authorizes automatic presets/default changes.
Recommended baseline: keep features opt-in, keep honest laboratory labels, defer production 3D/default migrations.

## Preservation and hygiene

Integration lead reports a byte-verified private archive of 15 known-owned sprint lanes on a trusted
secondary machine before cleanup; no GitHub push is implied. Raw logs, frozen sources and research
remain private. Six older dirty worktrees have unknown ownership: preserve them, not sprint debris.
Only retire exact owned resources after preservation and lifecycle checks; never blanket-kill or force-clean.
Commit, merge, release and publish remain separate lead-controlled actions; this document performs none.
