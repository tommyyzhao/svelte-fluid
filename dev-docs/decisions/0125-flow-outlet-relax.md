# ADR 0125: Flux-preserving flow outlet relaxation

**Status:** Accepted
**Date:** 2026-10-23

## Context

Legacy `clearVelocity` multiplies velocity by a fixed factor, removing section flux before projection. The controlled open channel measures 0.0% section-flux spread without an outlet, 39.5% with the default outlet. Existing presets and omitted options must remain byte-identical.

## Decision

Add opt-in `FlowOutlet.velocity: 'relax'` and positive finite `relaxRate` (default 10/s), effective only with `clearVelocity`. Keep the legacy shader and batched damp path unchanged. Before velocity advection, relax normal velocity toward its mask-weighted fluid-section mean, tangential velocity toward zero, with `a = exp(-dt * relaxRate * gate²)`. Reuse the legacy smoothstep edge gate; solids remain untouched. For partial outlets, the section mean includes only fluid cells in `[from, to]`, so the updated portion preserves its own normal flux. This is an outlet-stage conservation property, not a global solver conservation guarantee.

An eight-tap reduction pyramid stores the unscaled weighted normal mean plus scaled occupancy. The first level reads velocity and the vertically flipped combined solid mask; subsequent levels combine child means with occupancy weights in high precision, then divide occupancy by eight. Zero-pad incomplete groups. Keeping the mean unscaled avoids sparse low-velocity underflow; scaling only occupancy avoids half-float count overflow. Weighted means retain half-float rounding, like the velocity field itself. Constant eight-iteration GLSL ES loops support every allocated simulation width/height, without the lab's 512-cell ceiling. Limits are the existing GL texture/viewport and simulation allocation limits; no new resolution clamp. Use existing renderable RG half-float formats (RGBA fallback on WebGL1), nearest sampling; no readback or float-extension requirement.

Allocate both orientation pyramids only while an effective relax outlet exists (Bucket C). Both keep edge/orientation/extent/rate hot (Bucket A), with no allocation/link. Rebuild on simulation resize, abandon destroyed handles on context loss, restore from config, free on last removal/dispose. Stage complete reduction chains before committing a hot config or starting its simulation resize; failed target allocation frees only staged objects, retaining previous config/chains for continued simulation and retry. Programs follow existing optional selection/cache lifecycle. Every pass explicitly binds source, mask, uniforms and output under the host scope. Dye/scalar clearing and preset defaults remain unchanged.

## Conservation evidence

Same pre-registered five sections, spin-up and sampling as the existing conservation bench; main gate mean spread ≤2%, unchanged.

| Case | Mean post-projection spread |
|---|---:|
| CHANNEL_OPEN | 0.0% (prior measurement) |
| CHANNEL_OPEN_OUTLET (damp) | 39.5% (prior measurement) |
| CHANNEL_OPEN_OUTLET_RELAX | **0.0%** (p95 0.0%; gate ≤2% PASS) |
| VENTURI (damp) | 127.5% (prior measurement) |
| VENTURI_NO_OUTLET | 88.9% (prior measurement) |
| VENTURI_RELAX | 83.4% (p95 83.7%); report-only |

Relaxing the outlet removes 44.1 percentage points of VENTURI spread (127.5% → 83.4%), landing slightly below the no-outlet case: the outlet's share of the loss is gone. The obstruction-contraction loss (VENTURI without an outlet, 88.9%) is out of scope; changing that solver/geometry behavior needs an owner decision and separate ADR.

## Verification

Node suite passes (1159 passed, 1 skipped, 68 files), including mode/rate validation, optional selection, absent-target allocation, reduction arithmetic and legacy shader SHA256 `42766f1ea10fa36302b7cd94593e1aa1e6159fad39711d8058744c46d02eaaff`. Svelte check: 539 files, zero errors/warnings. Prepack/publint/GL-neutral declarations and full build pass. Direct frozen/current hardware byte comparison passed for both legacy outlet scenes. Four field hashes are pinned below; the local frozen import/constructor path and owned `.svelte-kit/public-outlet-relax/frozen-engine/` files were removed after capture; `/tmp/public-outlet-relax-frozen` remains a local backup. Exact six stale `dist/engine/*outlet-frozen*` outputs were removed; clean packaging previously passed (`find dist -iname '*outlet-frozen*'` empty), and post-capture test/check/prepack/build plus empty snapshot-output scan pass. Shipping still requires all remaining hardware gates.

First hardware run: 6/8 tests pass, including both direct legacy parity cases, transverse damping, staged allocation failures/retry, masked >512-cell both-axis conservation and shared isolation. Two test assertions failed: first outlet presence links three programs (legacy clearing plus two relax), not two; opaque framebuffer wrappers compare deeply equal despite distinct identities. **Post-hoc assertion corrections after this run:** expect three first-presence links; compare framebuffer identity with `includes` instead of deep equality. No scene setup, conservation threshold, hot-update zero-allocation/link gate or damping threshold changed. Full repeat and real context-restore completion remain pending. Load rose above20 during runner shutdown; the guard stopped the owned runner and released its lock. Start/resume remains≤12, stop>20.

Frozen legacy field SHA256 after48 mixed-dt steps and one dye splat:

| Scene | Velocity | Dye |
|---|---|---|
| VENTURI | `826bc02f8a0c00a69a7b8c0b4639082f7ce1082aca4f2cd71cae5577ac5dac30` | `248d5c058df5371ee94465d55fc9361a8e2beb8ab9e71bc5b90e8af0e0cb4170` |
| CHANNEL_OPEN_OUTLET | `2259e9e71aec753185a08cc964fcb30eb21c0ea4781babd5d146a549182870dc` | `51d76318ce97eb34c050a919c053d424424bbfff74363c1e6067fe7b0209d7e1` |

Review corrections before hardware execution: replace scaled numerator/count storage with unscaled mean/scaled occupancy (binary16 sparse signed odd-section regression); stage allocation before config commit (texture/framebuffer failure, retry and combined enable+resize regression). These are implementation corrections, not acceptance-gate/setup changes. Channel ≤2% conservation and VENTURI report-only results remain pending. The resumed wait ended at the 14:30 local deadline: strict 60-second polling observed no tracer lock turn; fallback acquisition from14:00 remained load-blocked (lowest observed15.13, required≤12). No second GPU run occurred.

Hardware acceptance run (ANGLE Metal, Apple M2, Chrome 155.0.8059.86, host load ≤2): `flow-outlet-relax.browser.test.ts` 8/8 pass with the corrected assertions, including the four pinned legacy hashes captured on the M1 (identical across machines), hot updates with zero allocations/links, resize/real context restore/dispose and shared siblings. Transverse RMS 5.256 → 3.154. Conservation: CHANNEL_OPEN_OUTLET_RELAX 0.0% mean spread (gate ≤2%), VENTURI_RELAX 83.4% (report-only). All pre-registered gates pass; thresholds unchanged.
