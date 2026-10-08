# ADR 0112 — E5 image convergence spike

Date: 2026-10-08. Baseline source: `4cc3185`.

**Status:** Accepted (pre-registered, lab only).

## Decision and scope

Compare V0 dye nudging, V1 advected reference map, V2 reference-map controller; optional V3 painterly force. No public exports, props, defaults or canonical docs change. The lab registers experimental configuration by canvas before constructing the existing FluidEngine. Engine owns every resource; shared-tier work stays inside `host.run()`. WebGL2 + linear filtering + float readback required; unsupported hardware stays on the static target. Reuse the guarded distortion-image loader with distortion rendering disabled.

V0: `C' = I + exp(-lambda*dt)*(advect(C,u)-I)`, density dissipation zero, damp velocity. V1: RG16F ping-pong reference map, advected beside dye transport, `xi' = x + exp(-lambda(t)*dt)*(xi_a-x)`; raw target-image display keyword. Seeded opening splats scramble the fields. V2 adds `u += dt*k*(grad xi)^T*(xi-x)` before the existing pressure projection. Snap the target field to identity/image, velocity to zero, render once, unsubscribe RAF only after both errors pass. Input invalidates probes, wakes RAF and re-forms. Restore rebuilds the final target rather than replaying the opening. No `loseContext()` in disposal.

## Frozen images and split

Chosen before candidate implementation/runs. Files under `static/lab/image-convergence/`, not package `dist`. JPEG/PNG, long edge <=512. Total 665706 bytes. Painting reproductions: public domain artwork (PD-old-100 / PD-Art), source pages below. NASA photograph: US federal government public domain (PD-USGov-NASA). Locally authored procedural fixtures dedicated CC0-1.0.

| ID | File | Source URL | License | Split |
|---|---|---|---|---|
| starry-night | starry-night.jpg | https://commons.wikimedia.org/wiki/File:Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg | PD-old-100 / PD-Art | train |
| great-wave | great-wave.jpg | https://commons.wikimedia.org/wiki/File:Great_Wave_off_Kanagawa2.jpg | PD-old-100 / PD-Art | train |
| water-lilies | water-lilies.jpg | https://commons.wikimedia.org/wiki/File:Claude_Monet_-_Water_Lilies_-_1906,_Ryerson.jpg | PD-old-100 / PD-Art | held-out |
| pearl-earring | pearl-earring.jpg | https://commons.wikimedia.org/wiki/File:Girl_with_a_Pearl_Earring.jpg | PD-old-100 / PD-Art | train |
| mona-lisa | mona-lisa.jpg | https://commons.wikimedia.org/wiki/File:Mona_Lisa.jpg | PD-old-100 / PD-Art | held-out |
| the-kiss | the-kiss.jpg | https://commons.wikimedia.org/wiki/File:The_Kiss_-_Gustav_Klimt_-_Google_Cultural_Institute.jpg | PD-old-100 / PD-Art | train |
| birth-of-venus | birth-of-venus.png | attempted https://commons.wikimedia.org/wiki/File:Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg | CC0-1.0 procedural replacement | held-out |
| earth | earth.jpg | https://commons.wikimedia.org/wiki/File:The_Earth_seen_from_Apollo_17.jpg | PD-USGov-NASA | train |
| fluid-text | fluid-text.png | local authored 5x7 FLUID bitmap on dark field | CC0-1.0 | train |
| flat | flat.png | local authored RGB(70,118,158) field | CC0-1.0 | held-out |

Birth-of-Venus fetch failed (404); procedural sinusoidal colour field frozen instead, not a claim about that painting. Other failed Special:FilePath downloads were repaired using direct Wikimedia originals before any candidate runs. Downscaled with macOS sips.

Fixed Fisher–Yates shuffle with repo mulberry32 seed **112**, input order `starry-night,great-wave,water-lilies,pearl-earring,mona-lisa,the-kiss,birth-of-venus,earth,fluid-text,flat`; resulting order `the-kiss,earth,fluid-text,great-wave,pearl-earring,starry-night,water-lilies,mona-lisa,flat,birth-of-venus`. First six train, final four held-out. No images exchanged after observations.

## Frozen runs and metrics

R=3 fresh engine/browser contexts per image/arm; seeds **5,11,23**. Canvas uses each image's 512-long-edge aspect, DPR1. simResolution128, dyeResolution512, pressureIterations20, curl10, velocityDissipation4, densityDissipation0, no bloom/sunrays/shading/tone mapping/continuous drivers. Initial eight seeded splats. Common schedule: 0.75s scramble (lambda=0), then lambda ramps linearly from 0.35 to 3 over 3s; thereafter lambda=3. Same parameters across images. Controller initial k=8, taper to zero as relaxation reaches 3. Tune only train; one variant change at a time; any changed parameter set is a new candidate.

- **Primary:** blind pairwise fluid-emergence score versus V0. Prompt: “Which sequence emerges like transported fluid rather than a crossfade/morph? Describe both; coherent advection, persistent swirls and colour carried by flow count; mere sharpness or layout do not. Tie if indistinguishable. Return JSON left/right/tie with evidence.” Capture whole frames at simulation times 0.5/1/2/4s; two independent sessions with swapped/randomized sides, contradictory votes tie. Candidate score 1/win, 0.5/tie, 0/loss; V0 null score 0.5. Also report time-to-convergence, not a substitute for the primary.
- **Convergence:** max absolute RGB dye error (V0) or max component `|xi-x|` (V1/2) <= **1/512**, velocity max component <= **0.05**; three quiet probes via existing max-reduction/PBO chain. Report initial and scripted re-form wall seconds, simulation seconds and frames. Timeout 30s per phase is failure, never a forced successful settle.
- **Fidelity:** settled whole canvas against target resampled to that canvas: SSIM, nonoverlapping 8x8 luminance windows (Rec.709 sRGB weights, constants C1=.01², C2=.03², population moments); mean **DeltaE76**, sRGB linearization, D65 XYZ and CIELAB. Require SSIM>=.995 and mean DeltaE76<=.5; also report byte-exactness separately. Final source image display must be unmodified (no dithering, tone mapping, colour-space remapping).
- **Work:** cheaper proxy frozen instead of xctrace: total engine draw calls and submitted pixels until settle (instrumented blit), plus wall seconds/frame count. These are work proxies, not GPU-ms/s, power or utilization.
- **Rest:** engine `isSettled && isPaused`, no scheduled engine frames, draw/frame counters unchanged over 500ms; final velocity/reference/dye snap checked. This proves zero engine GPU submission, not whole-machine GPU power.
- **Disturbance:** after rest, dispatch pointerdown at (.25,.5), 12 pointermove events to (.75,.5) over 200ms, pointerup. Require wake, nonidentical intermediate frame, successful re-form to same fidelity/rest gates.

Use real engine RAF, no manual frame driver for wall-time/work/rest runs. Record actual capture times. Filmstrip captures use simulation-clock crossings to avoid hardware cadence confusing the fluid judge; record wall times too. Retain final draw inside rendering callback before default framebuffer compositor clearing.

## Judge and deterministic fallback

Reuse `scripts/quality-eval.mjs` randomSides/unblind/pairVerdict/parseJudge and restricted CLI invocation. Alias `opus` responded **READY** in a no-tools probe before any image/candidate data. Every spawned CLI carries `--dangerously-skip-permissions`; no inherited settings/MCP, Read only, isolated blind input directory without labels/metadata. Two sessions per pair. Check alias again before each judged round. Calibration on train-only synthetic controls: identical sequences >=80% ties; advected checker fluid versus uniform crossfade >=80% fluid preferences. Failed calibration or alias makes subjective result **unusable**, not a win.

Fallback if judge unusable: deterministic spatial-transport score from mean absolute temporal change of normalized luminance gradients, divided by mean absolute luminance change plus 1/255, averaged across 0.5/1/2/4s intervals. Compare V0/candidate with the same noise/keep rule; require owner visual review before calling a fallback-kept result fluid-like. Flat-image pairs with both temporal changes below 1/255 score .5/tie. This proxy detects spatial evolution, not aesthetic quality; mark fallback verdicts explicitly. Do not switch scorer after seeing candidate votes.

## Noise, keep rule and stopping

As ADR0107: per-image relative noise `(max-min)/median` across the three seed results; zero median uses denominator 1 for counts and .5 for bounded scores. Freeze V0 noise before candidates. Also measure candidate noise; use the larger arm noise. Split headline is median of per-image paired gains; noise floor is median of per-image noises (ADR0107 Amendment6 split-level unit). Bounded judge scores are {0,.5,1} per seed, maximum relative gain 100%; a non-unanimous image cannot individually beat 2x its three-seed noise, so the frozen split median decides. Primary judge gain is candidate score minus .5, scaled by .5, and must exceed **2x noise** independently on train and held-out. Under fallback use relative transport-score improvement with same rule.

Keep only if train **and** held-out primary pass beyond 2x noise, all fidelity/rest/re-form gates pass, no per-image time/work regression larger than max(5%,2x corresponding arm noise), and no blind visual-quality loss (describe artefacts separately; E2 fluid calibration does not certify image sharpness). Record all seeds, medians, ranges, noises; no favourable-only aggregation. Run held-out **once per candidate** (one complete R3 batch), only after train passes, never tune from it. Baseline held-out may run once for comparisons without exposing it to tuning. After two non-kept rounds stop changing variants: repair the eval or switch approach with an explicit new pre-registration. Archive rejected candidate with `archive/e5-<variant>`; keep the lab experiment for inspection, never adopt into public API.

## Resource protocol

Installed headless hardware Chrome only; reject SwiftShader/software renderer. Atomic mkdir `/tmp/svelte-fluid-gpu.lock`, owner JSON lane `e5-spike` + exact PID/worktree, acquired-at epoch seconds; <=12min owned batches. Wait >=60s between busy-lock polls; strict alternation, no SOLO/bypass/unowned removal. Dev port5210 (strictPort, not5201/5202). No installs. Reuse approved read-only dependency symlink. Scratch `/tmp/e5-spike`, resume saved slots; remove owned processes/contexts/lock/scratch after durable results. Preserve unowned resources.

## Pre-data implementation note

Frozen before first V0 observations: V0 dye uses RGBA32F when OES_texture_float_linear is available, otherwise RGBA16F with a known rounding floor which may fail the unchanged epsilon (no forced successful settle). Record actual dye format per run. V1 stores displacement `d=xi-x` in RG16F, reconstructing `xi` analytically: advection gives `d_a = d(x-dt*u) - dt*u`, then `d'=exp(-lambda*dt)*d_a`. This is the same reference-map equation without half-float identity cancellation. Final identity is exactly `d=0`. Work proxies count draws/pixels, not bytes; RGBA32F bandwidth is not captured, so no bandwidth savings claim follows.

## Pre-baseline implementation fix

Train-only diagnostic probe (Kiss, seed5) finalized SSIM .999686 / mean DeltaE76 .422221, not byte-exact. This is harness bring-up, not frozen V0 R3 baseline. Shared V0/V1/V2 target upload now decodes/resamples through explicit sRGB OffscreenCanvas ImageData matching the reference; final display uses physical pixel-centre coordinates. This removes browser image-upload colour conversion / varying-coordinate sampling ambiguity without changing any metric/gate. Verify on train before freezing baseline; do not tune from held-out. Work proxy still excludes bytes. Source-download scratch deleted after frozen small assets verified.

## Results

Pending. This pre-registration is committed before implementation or candidate data.
