# GPU measurement blocker — 2026-10-02

**GPU compliance is UNCERTIFIED. The <2 ms per-instance, per-frame native-DPR
budget goal is not met until proved.** Shared wall throughput above 2 ms is
negative throughput evidence, not proof that GPU execution alone exceeds 2 ms.
Existing synchronous 20-frame batches await snapshot jobs; `gl-host.ts` drops
stale-sequence snapshots before `transferFromImageBitmap`. They conservatively
bound submitted batch work, not all 20 individually presented frames. All prior
numbers and unsafe-transfer crash evidence remain valid; no success is claimed.

## Verified read-only environment blocker

- `xcode-select -p`: `/Library/Developer/CommandLineTools`.
- `xcrun xctrace list templates`: utility not found. `/usr/bin/xctrace` requires
  Xcode. No Xcode/Instruments inventory available.
- `DevToolsSecurity`: developer mode disabled.
- Native Metal GPU capture is blocked. No tools installed, configuration or
  security settings changed.

Chrome **154.0.8037.95** GPU tracing is not independent corroboration of the
known ANGLE Metal timer bias. `gpu_tracer.cc:158–165` calls
`GetStartEndTimestamps`; `ui/gl/gpu_timing.cc:530–537` starts `GL_TIME_ELAPSED`,
then `570–582` fabricates end = start + elapsed. The matching ANGLE revision's
`QueryMtl.mm:104–107` leaves `queryCounter` unimplemented;
`mtl_command_buffer.mm:698,825` sums full `MTLCommandBuffer` GPU durations.
Partial-buffer overcount and overlapping-lifetime bias remain. `gpu.service` /
`GPUTask` spans are CPU evidence; `powermetrics` aggregates do not certify frames.

Source audit (Chrome DEPS pins the ANGLE revision):

- https://chromium.googlesource.com/chromium/src/+/154.0.8037.95/gpu/command_buffer/service/gpu_tracer.cc?format=TEXT
- https://chromium.googlesource.com/chromium/src/+/154.0.8037.95/ui/gl/gpu_timing.cc?format=TEXT
- https://chromium.googlesource.com/chromium/src/+/154.0.8037.95/DEPS?format=TEXT
- https://chromium.googlesource.com/angle/angle/+/802a8704ca940b633b731493ee192e0661eb8cdd/src/libANGLE/renderer/metal/QueryMtl.mm?format=TEXT
- https://chromium.googlesource.com/angle/angle/+/802a8704ca940b633b731493ee192e0661eb8cdd/src/libANGLE/renderer/metal/mtl_command_buffer.mm?format=TEXT

## Bounded resume protocol — not executed

Prerequisite: explicit approval for a full compatible Xcode/Instruments install
and authorized GPU profiling. Do not install or enable profiling implicitly.

1. Once available, run `xcrun xctrace list templates` first. Select an actually
   listed GPU-capable template; do not invent a template name.
2. Capture at most **10 seconds**: one foreground production shared-tier Karman,
   **1440×900 CSS, native DPR 3 (4320×2700)**, other instances paused. Warm
   **200 frames**. Measure **60 paced individual frames**, awaiting actual
   presentation for each; verify **60 transfers** and their display dependencies.
   Job resolution alone is insufficient. Preserve safe `createImageBitmap`
   transport, native DPR, solver quality and ordinary validation.
3. Attribute actual GPU encoder execution intervals to solver, display/copy and
   presentation, including presentation dependencies. Exclude CPU wait and vsync.
   Union overlapping execution intervals; do not sum duplicated command-buffer
   lifetimes. Record per-frame attribution, not batch total/n certification.
4. Missing GPU timestamps, incomplete attribution or unverified transfers leave
   compliance **UNCERTIFIED** and the budget goal blocked. Passing tests, favorable
   wall averages or biased Chrome query-derived spans cannot close this blocker.
