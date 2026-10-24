# ADR 0121: Opt-in flow disturbance force

**Status:** Accepted
**Date:** 2026-10-23

## Context

ADR 0119's route-local rig disturbance supplies controlled ambient fluctuations. Public flow scenes need the same explicit forcing without importing laboratory routes or changing existing presets. Acceleration is an input, not a promised turbulence intensity: inlet response depends on geometry, timestep, transport, projection and probe placement.

## Decision

Add `FlowForce.kind: 'disturbance'`, with finite nonnegative acceleration, positive finite correlation time and spatial scale, an optional unit-domain UV rectangle and an integer seed in 0–65535 (default 704). Region coordinates are bottom-up UV; scale is measured in canvas-height units. Port the laboratory smooth spatial value noise (independent component offset 193, factor 2.12), smoothly interpolate adjacent seeded time slices, multiply by a separable cos² rectangle envelope and acceleration × dt. This is calibrated rig noise, not turbulence synthesis; acceleration is the amplitude coefficient, not a strict bound on each normalized noise sample.

Use the engine's accumulated simulation time on both RAF and deterministic paths, never wall time. Reset on opening-scene replay/context restoration; hot changes do not reset it. Accumulate even during empty-solver skips so adding the force uses the current simulation clock. Existing wall-clock density-ramp behavior is unchanged.

A separate optional program preserves `flowForceShader` byte-for-byte. First presence compiles through the existing transactional selection path; subsequent value changes are Bucket A uniforms, with no GL allocation or link. No FBO, texture or RNG is added. Zero acceleration skips the pass entirely and does not wake an otherwise empty solver. All uniforms, source texture and output framebuffer are rebound inside the existing host scope; own-context disposal and shared-cache ownership follow existing optional-program rules.

## Consequences

- Omission leaves every legacy pass and preset unchanged; frozen pre-change hardware field hashes guard parity.
- Repeated seed/dt sequences are deterministic on the same GPU/driver, not promised bit-identical across drivers.
- Calibrate temporal inlet velocity RMS/U downstream of the forcing, subtracting an otherwise identical zero-noise baseline variance in quadrature; approximately 1% is a starting target, not a default or physical turbulence model.
- Node validation/wiring/hash guards plus hardware parity, determinism, response scaling, hot-resource and shared-sibling gates cover the contract. No automatic calibration, solver replacement or laboratory import.

## Verification

The first CHANNEL_OPEN calibration run failed: 4 s spin-up left baseline drift (baseline temporal variance 179.4958197021492); both baseline-subtracted RMS values were zero, so the doubling ratio was NaN (JSON null), not a pass. **Post-hoc setup amendment after that failure:** extend spin-up to 40 s. Force 6/12, region, 3×3 probe at x=.22, dt1/120, 8 s record, .05 s sample spacing and ratio gate [1.6, 2.4] remain unchanged. The amended six-test hardware suite passed. Final pinned repeat on ANGLE Metal / Apple M1 Max: six disturbance tests plus four selected-program lifecycle tests pass (10/10). U=166.625, baseline variance=0, RMS=.1202656226/.2054333565 for acceleration6/12, ε=.0721774%/.123291% U, ratio=1.7081635805 (gate1.6–2.4). These are a response-scaling sanity check, not a calibrated1% scene. Initial load10.985, final46.286; no performance claim. This amendment is not a pre-registered first-run success.

Pre-change snapshot field bytes compared directly before deletion; permanent CHANNEL_OPEN hashes after48 mixed-dt steps plus one dye splat: velocity `49222d95d7ed32e9e075a590b89fd31a595ff3bde98b51d41d9f007e86c5e256`, dye `8e1fe3cc552007ee3e2554246ae47a73c91ff55696c5762fd121159ad85bd155`. The final repeat passed these pins; legacy `flowForceShader` SHA256 `ad4d5cd5b4ca9463a9926396030191e25b227710266be1676adc23e5ffbb1b3c` is guarded in the node suite. Zero coefficient, seed/dt determinism, shared interleaving, transactional first link and zero hot-update GL creates/compiles/links pass.

Required CPU gates pass: node1139/1139 (66files), svelte-check530files/0errors/0warnings, prepack/publint plus strict GL-neutral consumer declarations, full static build. Packaging emits the existing `import.meta.env` warning from benchmark code (excluded from npm files); no new runtime dependency or public GL type.
