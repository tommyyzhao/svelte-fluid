# ADR-0088: Shared WebGL2 host for model engines

## Status

Accepted (2026-10-02). Partially accepts ADR 0082 for second-generation model
engines only. `FluidEngine` and `Fluid.svelte` remain per-context and unchanged.

## Context

Upcoming pigment and liquid-surface models need to coexist on dense pages.
Chrome's approximately 16-live-context cap makes one context per visible
instance untenable; ADR 0082 measured 8 of 24 instances lost with independent
contexts, while all 24 stayed live on one shared context. WebGL programs cannot
cross contexts, so a useful shared program cache also requires a shared context.

This lane supplies infrastructure, not model engines or a FluidEngine migration.

## Decision

`engine/gl-host.ts` is internal (not root-exported). It lazily acquires one hidden
WebGL2 context: OffscreenCanvas when it can create WebGL2, otherwise a detached
HTMLCanvasElement. Instance registrations form the reference count; duplicate
acquire/release is idempotent. The last release deletes cached programs and quad
resources, removes listeners, then explicitly loses the now-unowned context.
A later acquire creates a fresh host. This prevents context-slot accumulation
under mount churn rather than waiting for GC.

The host owns one fullscreen quad VAO and its buffers. Program names identify
vertex+fragment source pairs; sorted, deduplicated defines are part of an
unambiguous cache key. Callers must use distinct names for different sources.
Cache-owned programs are never deleted by an instance. Instances bind **every**
uniform and texture they read, even when a sibling uses the same program.
The quad position attribute is location 0.

Every instance owns its fields, FBOs, textures, uniforms, inputs, and visible
canvas with an ImageBitmapRenderingContext (`bitmaprenderer`). `run(instance,
fn)` sizes the host drawing buffer to that canvas's pixel dimensions, resets
viewport, default FBO, blend-off, program-null and shared VAO, then calls the
synchronous renderer. It returns false while lost/released. Other state
(scissor, depth, color masks, texture bindings etc.) is the renderer's
responsibility if it changes it. `blit()` rebinds the shared quad. `present()`
must follow the run immediately, before another instance runs.

**Measured presentation deviation from ADR 0082:** always use
`createImageBitmap(surface)` rather than `transferToImageBitmap()`. On this
machine (Chrome **154.0.8037.95**, macOS **27**, ANGLE Metal **Apple M1 Max**),
a transferred WebGL bitmap still displayed in bitmaprenderer caused an
intermittent renderer/page crash during forced context loss. A standalone
shader+quad repro failed 2 of the last 10 isolated transfer-path runs; the host's
combined suite failed consistently. The `createImageBitmap` variant passed 28
isolated runs, then repeated complete host suites. These observations are specific to
this Chrome/driver, not a claim about all browsers. The diagnostic is preserved
in [artifacts/0088-bitmap-loss-repro.html](./artifacts/0088-bitmap-loss-repro.html),
outside shipping `src`; `?snapshot` switches to the non-crashing path.

`createImageBitmap` snapshots at call time, then resolves asynchronously.
`present(): Promise<void>` resolves after transfer to the visible canvas; normal
frame callbacks need not await it. A per-instance sequence drops older snapshots
when calls overlap. Release or loss invalidates pending snapshots; stale bitmaps
are closed, never repainted. Pixel readback from 24 mixed-size canvases whose
snapshots all start in one task verifies snapshot-at-call before surface reuse.
The visible last frame needs no work while idle, including during context loss.
No 2D presentation fallback, extra RAF, or permanent copied backing store.

Loss clears the program cache, drops the quad, invalidates pending presents and
notifies all registered instances through `notifyHost`. Restore re-enables float
extensions, rebuilds the quad, then fans out so models rebuild their fields.
Consumer exceptions cannot stop siblings. One loss still pauses every model;
per-instance resource allocation errors remain a model responsibility.
Instances subscribe/unsubscribe through `frame-scheduler.ts` (ADR 0080); host
acquire, present and callbacks schedule no frames. Idle/offscreen instances are
responsible for unsubscribing.

JumpFlood accepts a cache-owned program factory in place of a compiled vertex
shader. Its standalone FluidEngine path stays unchanged; only cached programs
are retained on dispose. Its seeds and output ownership do not change.

### Invariant changes

CLAUDE.md #2 now permits module-level mutable GL state **only in gl-host.ts for
model engines**: context, program cache, shared quad. FluidEngine still owns its
context, buffers, programs and FBOs. Models own their fields and bind the state
they read. Stateless `gl-utils.ts`, raw `shaders.ts`, and no GL in Svelte or
root-exported declarations remain unchanged.

CLAUDE.md #6 retains `FluidEngine.dispose()`'s no-loseContext rule. The narrow
exception is the **final shared-host release** (or failed host construction)
after ownership ends; no instance disposal may lose a still-shared context.

## Consequences

- 24 models can render without hitting the page cap; programs compile once per
  name/define variant and live only until final host release.
- Independent DOM clipping, stacking, input and compositing remain native.
- The fallback snapshot adds asynchronous delivery; no transfer-path performance
  claim from ADR 0082 is inherited. Benchmark model workloads before optimizing.
- Shared context loss is shared fate. Each model must stop frames on loss,
  rebuild on restore, bind its own textures/uniforms and show fallback on failure.
- Hardware tests cover colors, alternating programs and state hygiene, loss and
  restore of all 24 instances, idle persistence, churn and cached/standalone JFA
  equivalence. Node tests cover keying, teardown, callback isolation and pending
  snapshot races.
- No FluidEngine migration, backend selectors, parallel shader compilation,
  LRU, scheduler additions, model API or changeset in this lane.
