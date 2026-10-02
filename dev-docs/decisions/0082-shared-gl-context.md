# ADR-0082: One shared WebGL context and program cache for all instances

## Status

Accepted (2026-10-02). Model engines: [ADR 0088](./0088-shared-gl-host-for-model-engines.md). `FluidEngine`: accepted as a hybrid by [ADR 0093](./0093-fluid-engine-on-shared-gl-host.md) (own contexts for the first 8, shared host past that).

## Context

Every `<Fluid>` owns a WebGL context and compiles its own programs (invariant
#2). Browsers cap live contexts per page (Chrome: 16) and silently lose the
oldest beyond that. `lazy` works around the cap by calling `loseContext()` on
scroll-out (`Fluid.svelte` `teardown()`/`instantiate()`), which only helps when
fewer than ~16 instances are visible at once. The 1.0 goal asks for shared
device-level infrastructure: one frame scheduler (done, ADR 0080) and a cache
of compiled programs shared across instances. WebGL programs cannot cross
contexts, so a shared cache implies one context.

## Spike method

Throwaway harness outside the repo (`/tmp/glspike`): the real `FluidEngine`
from `ac676b0`, bundled with `bun build`, driven by Playwright in installed
hardware Chrome (ANGLE Metal, Apple M1 Max), `deviceScaleFactor: 2`, every
instance 800×500 CSS = 1600×1000 device px, default config (`dyeResolution:
1024`). Frames were driven manually and synchronised with a 1-px `readPixels`
per frame, so frame time includes GPU work. Shared mode handed every engine the
same `OffscreenCanvas`, so `getContext('webgl2')` returned one context, then
presented each instance to its own visible canvas. The program cache was
simulated by memoising `compileFragmentShader`/`linkCompiledProgram` per
context. Single runs; startup numbers on a fresh browser profile vary with the
driver shader cache (a cold first instance measured 248–2746 ms), so compare
medians of instances 2..n.

## Measurements

| Variant | n | Startup total (ms) | Ctor median (ms) | Live contexts | Synced frame (ms) | fps |
|---|---|---|---|---|---|---|
| Today: context per canvas | 8 | 309 | 36 | 8/8 | 27.0 | 36 |
| Today: context per canvas | 24 | 898 | 36 | **16/24 (8 lost)** | 48.1 (16 live) | 20 |
| A: shared ctx, `drawImage` present | 1 | 48 | 48 | 1 | 3.3 | 60 |
| A: shared ctx, `drawImage` present | 8 | 273 | 32 | 1 | 16.5 | 58 |
| A: shared ctx, `drawImage` present | 24 | 759 | 31 | 1, **24/24 live** | 46.7 | 21 |
| A: shared ctx, `transferToImageBitmap` | 8 | 282 | 33 | 1 | 20.9 | 49 |
| A: shared ctx, `transferToImageBitmap` | 24 | 782 | 32 | 1, 24/24 live | 57.9 | 17 |
| A + shared program cache | 8 | **106** | **7.9** | 1 | 16.1 | — |
| A + shared program cache | 24 | **238** | **8.0** | 1, 24/24 live | 46.3 | — |

Other measurements:

- **Constructor phases** (per-canvas, warm): compile 21–24 ms, link 3–13 ms,
  allocation 3.5–5 ms of a 33–52 ms constructor. Compiling is the cost that
  the cache removes.
- **Present cost** per instance, 1600×1000 (300 presents batched, minus a
  no-present loop): 0.5–1.0 ms (bitmaprenderer), 0.3–2.0 ms (2d `drawImage`).
  Too noisy to separate the two paths. Present is small next to the solver.
- **Alpha correctness:** a paused `transparent` scene rendered on its own
  context against the same scene on the shared context, after a sibling with
  bloom and sunrays had rendered first. Both present paths: max channel
  difference 0, 0% differing pixels, with 90% of pixels partially transparent.
  Premultiplied output survives either present path, and no GL state leaked
  between these two configurations.
- **Mixed sizes:** resizing the shared backbuffer between instances costs about
  0.35 ms per switch (1.56 against 1.21 ms per clear+transfer).
- **Context loss (shared, n=8):** one `loseContext()` marked all 8 engines lost.
  `restoreContext()` brought all 8 back live in 254 ms, sequentially through the
  existing ADR 0053 restore path.
- **Option C:** `WebGL2RenderingContext.getProgramBinary` is `undefined`, so
  program binaries cannot be shared. `KHR_parallel_shader_compile` is present.
  For the 13 core+display programs, blocking compile+link took 8.9–10.5 ms of
  main thread. Parallel compile took 0.4–0.5 ms of main thread but 12.5 ms wall
  time.

## Options

**A. One hidden context, per-instance present.** All 24 instances stay live
instead of 16. At 8 instances, frames are 1.3–1.6× cheaper because there is
one context and one flush instead of eight. With the program cache, startup
falls 3–4× and each further instance costs about 8 ms. Output is pixel-exact.
The costs:
- A single context loss stops every instance at once. Restore is proportional
  to n (about 32 ms per instance).
- A GL error or OOM in one instance can now kill its siblings.
- The engine must stop treating its canvas as its GL surface. Seven spots
  assume that today:
  - `initContext` writes `canvas.width`.
  - `getResolution` reads `drawingBufferWidth`.
  - `blit(null)` binds the default framebuffer.
  - Splat aspect reads `canvas.width`.
  - Context-loss listeners attach to the canvas.
  - Pointer listeners and `getBoundingClientRect` use the canvas.
  - `createBlit` sets the attribute-0 pointer once at construction, with no
    VAO.

  The spike only worked because every instance had the same size and the
  same quad.

**B. One full-viewport overlay canvas with a scissor per instance (three.js
"View").** Rejected without a prototype; it contradicts shipped behaviour:
- One canvas has one z-index. `FluidBackground` sits behind content
  (`position: fixed; z-index: 0`). `FluidReveal` and `FluidDistortion` paint
  over their content (`z-index: 1`, `pointer-events: auto`). A single overlay
  cannot be both.
- An overlay ignores ancestor `overflow: hidden`, `border-radius`, CSS
  transforms, filters, `mix-blend-mode`, and scroll containers.
- Scrolling runs on the compositor while RAF runs on the main thread, so the
  rects lag by a frame during scroll.
- Hit-testing and focus would have to be re-implemented, and the accessible
  fallback would lose its canvas.

  These limits are acceptable for a full-page scene graph but disqualify a
  component library.

**C. Keep per-canvas contexts and share or speed up compilation.** Binary
sharing is impossible (see above). A source cache is a no-op: sources are
already module constants, and every context must still compile. Parallel
compile removes about 10 ms of main-thread blocking per instance. It needs an
async "ready" phase, which conflicts with the synchronous constructor and with
ADR 0062's "no draw compiles" rule. An LRU context pool through `lazy` is what
exists today: it cannot help once more than 16 instances are visible, and every
eviction pays a full recompile. C reduces jank but does not fix the context
limit.

## Decision (proposed)

Adopt **A** as the default. An internal module, `engine/gl-host.ts`, would own:
- one `OffscreenCanvas` WebGL2 context, with a hidden `HTMLCanvasElement` as
  fallback;
- a reference count;
- one program cache keyed by fragment name plus sorted keywords, including
  display `Material` variants;
- one shared quad VAO/buffers;
- context loss and restore fan-out.

Each engine keeps its own visible canvas, its FBOs, textures, masks and
uniforms. It renders its final pass into the host backbuffer sized to that
instance (sort by size to reduce resizes), then presents through
`ImageBitmapRenderingContext.transferFromImageBitmap`. Bitmaprenderer is
chosen because it is zero-copy, holds no second backing store, and keeps the
last frame visible while paused. `drawImage` into a 2d canvas is the fallback
when `OffscreenCanvas` WebGL is unavailable. Adopt C's
`KHR_parallel_shader_compile` only later, as an optional prewarm of the shared
cache at the first mount.

## Invariant changes implied

- **CLAUDE.md #2** becomes: "Module-level GL state lives only in
  `gl-host.ts`: one context, the program cache, and shared quad buffers. Each
  engine owns its FBOs, textures and uniforms, and must bind every piece of GL
  state it reads; it never assumes state left by a sibling."
- **CLAUDE.md #6** stays true (`dispose()` never loses the context). The
  `lazy` `loseContext()`/`restoreContext()` dance in `Fluid.svelte` is removed:
  lazy becomes dispose-and-free, because there is no per-canvas slot to
  release.
- **CLAUDE.md #5** is unchanged: the component still hands over a canvas.
- **architecture.md** needs updates in these places:
  - lifecycle step 6.3: acquire the host, not a context;
  - "Context restoration": fan-out to every engine;
  - the "WebGL context limit" trade-off becomes "one loss pauses all
    instances";
  - the ADR 0080 note that the scheduler "holds no GL state".

## Staged implementation and tests

1. **Surface seam (no behaviour change).** Route the seven canvas/default-
   framebuffer assumptions through a per-engine `surface` (size, bind target,
   present, loss events). Use a VAO or rebind attribute 0 on every blit. Keep
   the per-canvas host as the default. Existing Node and browser suites must
   pass unchanged.
2. **`gl-host.ts` behind an internal option.** Add the shared context, the
   refcounted program cache, and loss fan-out. Node tests cover cache keying,
   refcount release to zero, and clearing the cache on loss. Hardware browser
   tests cover:
   - 24 instances with zero `webglcontextlost` events;
   - pixel equality between shared and own context for transparent, reveal,
     distortion, glass and bloom siblings in alternating order (state-leak
     guard);
   - mixed sizes and DPR;
   - one `loseContext()` restoring every instance and replaying its opening
     scene;
   - dispose in arbitrary order;
   - a throwing sibling not stopping others (ADR 0080).
3. **`Fluid.svelte` opts in by default.** Delete the lazy lose/restore path.
   Browser tests for lazy scroll-out/in and for zero frames while idle or
   offscreen.
4. **Remove the per-canvas host** once a release has shipped without
   regressions. Update the invariants and architecture.md in the same change.

## Consequences

- Context-limit failures disappear for any number of instances, and startup
  per extra instance drops from about 33 to 8 ms.
- One context loss or driver fault pauses every instance at once. Recovery is
  serial, and the fallback UI must cover all of them together.
- Correctness now depends on each engine binding all the GL state it reads. A
  missed bind shows up only when certain configurations sit next to each
  other, so the state-leak browser test is mandatory.
- Rejected: B (it breaks DOM layering, clipping and transforms) and C alone
  (it cannot beat the 16-context cap).

## Implementation

`FluidEngine` shipped as a hybrid in [ADR 0093](./0093-fluid-engine-on-shared-gl-host.md).
The first 8 live engines keep their own context, and later ones share the
host. Reason: the shared `createImageBitmap` present costs +0.45/+0.7 ms per
instance at DPR 2/3, and the frame savings measured above did not reproduce.
WebGL1 and `requireHardwareAcceleration` always keep their own context.
Presentation uses `createImageBitmap` only (ADR 0088). There is no size
sorting. GL errors are scoped per resource transition, so a failure stops
only its instance. All seven canvas-as-surface assumptions are resolved in
0093.
