# ADR-0089: Native DPR by default, measured by synced throughput

## Status

Accepted (2026-10-02).

## Context

1.0 promises "rendering uses the native device pixel ratio by default" within
"< 2 ms GPU per instance per frame on a laptop at native DPR, measured".
`maxPixelRatio` defaulted to 2. The GPU-budget harness timed each frame with an
`EXT_disjoint_timer_query_webgl2` TIME_ELAPSED query and reported LavaLamp at
4.5-6.3 ms, GasFlare at 5.8-6.6 ms and four more presets at 2-4.4 ms at a
1440x900 viewport on DPR 3. Its own profiler groups covered only part of that:
GasFlare's groups summed to about 2.5 ms of 6.

## Where the gap was

There was no hidden GPU work. The query was wrong. On ANGLE's Metal backend a
TIME_ELAPSED query is charged the full GPU span (`GPUEndTime - GPUStartTime`) of
every `MTLCommandBuffer` created while the query is active
(`mtl_command_buffer.mm`, `addCommandBufferToTimeElapsedEntry`). Partial
command buffers are charged in full, and command buffers that overlap on the
GPU are summed. The large canvas-sized render passes change how ANGLE splits
command buffers, so the over-count appears only at large canvases. Evidence, on
the M1 Max with hardware Chrome:

| Measurement (1440x900, DPR 3) | LavaLamp | GasFlare | Venturi |
|---|---|---|---|
| Per-frame timer query (old harness) | 4.45-6.6 | 5.5-6.3 | 2.4-4.3 |
| Synced throughput (N frames, 1-px readback) | 1.0-1.6 | 1.6-1.8 | 1.0-1.2 |
| Fence-synced throughput | 1.45 | 1.70 | - |
| Timer query, composite-only frame (solver stubbed) | 7.9 | 2.8 | 13.8 |
| Wall time, same composite-only frames | 0.71 | 0.73 | 0.08 |

A frame that takes 0.08 ms of wall time cannot cost 13.8 ms of GPU time. CPU
submit is about 0.02 ms per frame, so a back-to-back loop is GPU-bound, and
wall time per frame between two queue drains is an upper bound on GPU time.
Replaying each pass alone, saturated and with its captured arguments, gives
per-pass costs that add up to the whole frame (LavaLamp: solver 0.61 +
display 0.37 + glass 0.65 = 1.63 against 1.67 for the whole frame). Nothing
is unaccounted for. Implicit resolves, present, and an extra clear or blit
were all ruled out: there is no MSAA (`antialias: false`), present happens
outside the measured loop, and stubbing the transparent-mode clear changed
nothing.

## Decision

1. **The harness measures synced throughput.** Batches of live-loop frames are
   bracketed by a 1-px readback of the default framebuffer, and the budget
   number is the median of the per-frame times. Each pass's cost comes from a
   saturated replay of that pass alone. A `gl.flush()` between replays ends
   the render pass; otherwise Apple's hidden-surface removal culls the
   overwritten draws. The per-frame timer query is still recorded, labelled
   unreliable, to show the artefact.
2. **`maxPixelRatio` defaults to `null` (native DPR).** Every preset is under
   2 ms median at 1440x900 on DPR 3. The worst is GasFlare at 1.76 ms, and the
   worst single batch for any preset is 1.9 ms. Passing `2` restores the old
   cap.
3. **No display or glass change.** A candidate that invalidated the target
   before each full-screen display and glass draw, and folded away the
   redundant transparent clear, was pixel-identical but measured within noise
   (Δ ≤ 0.07 ms on every preset), so it was not landed. The cheaper
   architectures in the brief (glass inside display, sim-resolution masks,
   `mediump`, low-resolution display plus upscale) are not needed for the
   budget, and each one risks the look.

## Amendment — mounted DPR changes (2026-10-04)

`Fluid` rearms a `(resolution: <current DPR>dppx)` media query after each
change, then uses its existing coalesced resize path. CSS content-box observation
alone cannot guarantee a notification when CSS dimensions stay fixed. An ordinary
installed-Chrome CDP emulation probe produced only the initial
`device-pixel-content-box` notification during DPR 1→3→2; this is emulation
evidence, not a physical-screen-move measurement. The same CDP override did not
emit a resolution media-query change either; neither probe establishes physical
screen/zoom notification behavior. Mounted hardware-browser regressions inject
deterministic media callbacks, verifying resize/rearming/cleanup rather than
browser-generated screen-change events. No companion pixel observer is added.

Backing dimensions still use fractional CSS dimensions × latest actual DPR,
subject to the explicit `maxPixelRatio` cap and existing drawing-buffer limits.
The existing resize path preserves field identities when their actual resolved
dimensions stay unchanged; programs remain unchanged. Default adaptive dye or
canvas-size caps can change field dimensions, rebuilding the owning fields while
resampling their state. Flooring fractional CSS × DPR can also change integer
backing aspect despite a fixed CSS aspect. The path rerenders reduced-motion
stills and respects visibility. Unmount removes the current media listener
and cancels pending resize work; stale callbacks cannot rearm it. With `matchMedia`
absent, or resolution notifications unavailable, DPR updates remain driven by CSS
resize. This is not whole-browser legacy-listener support: the existing
reduced-motion watcher requires modern change-listener methods when `matchMedia`
is present. Tests isolate absent resolution methods while retaining those
reduced-motion methods. No polling or legacy listener shim is introduced.

## Consequences

- DPR 3 phones and laptops get crisp edges with no configuration.
- Canvas-sized work grows 2.25× from DPR 2 to DPR 3. On this GPU that is about
  0.4-0.9 ms for display and glass at a full viewport, and lower-end
  integrated GPUs will pay more. The README and changeset document
  `maxPixelRatio={2}` as the opt-out.
- Timer queries from `EngineProfiler` (`instrument: true`) keep the same
  ANGLE Metal bias at large canvases. Treat per-group GPU numbers above about
  1440x900 at DPR 2 as upper bounds, not costs.
- Rejected: keeping the cap at 2 because of the old numbers. They measured the
  query, not the GPU.
