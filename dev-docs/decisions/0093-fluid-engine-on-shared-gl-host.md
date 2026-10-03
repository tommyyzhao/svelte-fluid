# ADR-0093: FluidEngine context tiers: own contexts, then the shared host

## Status

Accepted (2026-10-02). Accepts [ADR 0082](./0082-shared-gl-context.md) option A
for `FluidEngine` as a hybrid, on the host from
[ADR 0088](./0088-shared-gl-host-for-model-engines.md). Records where it departs
from 0082.

## Decision

This records the owner's delegated choice to retain the measured hybrid, not a
claim that every engine shares compiled programs. WebGL2 engines in the first
8 slots compile in their own contexts; compatible shared-host-tier engines and
model engines use the host program cache. WebGL1 and
`requireHardwareAcceleration` engines stay on their own contexts. No universal
program-cache rewrite is implied.

A new WebGL2 `FluidEngine` gets its **own context** while fewer than
`OWN_CONTEXT_LIMIT` (K = 8) engines on the page hold one. Otherwise it goes on
the **shared host** (`gl-host.ts`, the context the pigment and surface models
use). K is a module constant in `FluidEngine.ts`, not a public option. 8 leaves
headroom under Chrome's ~16-context cap for the model-engine host context and
for third-party WebGL on the page.

- **The tier belongs to the canvas.** A canvas's first engine picks the tier
  by the count. Every later engine on that canvas (lazy scroll-in,
  resize-failure rebuild) inherits it. A shared canvas is a
  `bitmaprenderer` and can never take a WebGL context; an own canvas already
  holds one.
- The count covers live own-context engines only. `dispose()` frees the slot
  (so does a failed construction), and a `lazy` scroll-out disposes. An own
  canvas rebuilt while all slots are taken stays own and may push the count
  past K, because it holds that context anyway. A shared canvas rebuilt while
  a slot is free stays shared.
- WebGL1 engines and `requireHardwareAcceleration` always take their own
  context. The one shared context cannot carry `failIfMajorPerformanceCaveat`
  per instance. A canvas that already holds a context also falls back to its
  own.
- Test hook only: `_setContextTier('own' | 'shared' | 'auto')`.
- `ponytail:` the fixed K is a simplification. Upgrade path: adapt K to measured
  headroom, or drop the tiers if `transferToImageBitmap` is proven crash-free on
  a current Chrome (ADR 0088), which would make shared present zero-copy.

Own-context engines are unchanged. They compile per context, present by
swap-chain flip, and keep the ADR 0053 loss/restore path and `lazy`
`loseContext()`. The shared program cache serves shared-tier and model
engines only.

Shared-tier engines keep their own fields, textures, masks and uniforms, and
present to their own canvas. The seven canvas-as-surface assumptions in 0082
are resolved like this:

| 0082 assumption | Resolution |
|---|---|
| `initContext` writes `canvas.width` | Still sizes the **visible** canvas, now only on a real change. The host sizes its hidden surface from it in every `run()`. |
| `getResolution` reads `drawingBufferWidth` | Takes the size explicitly. The engine passes `bufferWidth()/bufferHeight()`: the canvas size on the host, the drawing buffer on an own context. Every other `drawingBuffer*` read goes through the same helpers. |
| `blit(null)` binds the default FB | Every GL entry point runs inside `host.run()`: frame, splat, advance, setConfig, resize, readField, restore and the async image uploads. `run()` sizes the surface to this instance and resets FBO, viewport, blend, program and VAO. A screen render then calls `host.present()`. |
| Splat aspect reads `canvas.width` | Unchanged: the visible canvas is the source of truth for the instance size. |
| Context-loss listeners on the canvas | Own tier only. On the host, loss/restore arrive through `GlHostInstance` callbacks, fanned out and restored one instance at a time. |
| Pointer listeners, `getBoundingClientRect` | Stay on the visible canvas. |
| `createBlit` attribute 0 without a VAO | The engine blits through `host.blit()`, which rebinds the host quad VAO on every draw. |

Shared programs come from the host cache, keyed `fluid:<pass>` plus defines.
The display `Material` takes a cache factory and never deletes cached
variants. `run()` resets the clear colour, because `createFBO` clears with it
and a model sibling may change it. Because programs are shared, samplers that
were bound only conditionally now always bind a texture (`applyMask`'s
obstruction unit).

### Departures from 0082

- **Hybrid instead of all-shared**, for the present cost measured below.
- **Present** uses `createImageBitmap(surface, { colorSpaceConversion: 'none' })`,
  never `transferToImageBitmap` (ADR 0088 crash). Surface and canvas are both
  sRGB, so the default conversion only added a full-frame pass. No size
  sorting: instances render in scheduler order.
- **Per-instance error scope.** WebGL has no error scopes. Each shared-tier
  resource transition (resize, Bucket B/C reconfigure, restore, construction)
  drains `getError()` first and checks it after. A GL error or OOM fails only
  that instance: it stops, ignores further work and reports through
  `onFrameError`. `Fluid.svelte` then shows the terminal `render-failed`
  fallback (ADR 0085) and disposes it, and siblings keep rendering.
  Own-context engines keep the existing scheduler eviction and do not pay for
  `getError`.
- **Construction during a shared loss** registers with the host and builds
  nothing; the instance allocates in the host's restore fan-out. Any other
  construction failure releases the host registration or own slot.
- **After `dispose()`**, every public method is a no-op. A shared engine never
  touches the context outside `run()`.
- **Buffer size.** Inside `run()` the engine reads the real surface
  `drawingBufferWidth/Height`. Outside it, it reads the canvas size, which
  `initContext`/`resize` already fit to `MAX_VIEWPORT_DIMS`.
- **Program cache keys** include an id per exact vertex/fragment source, so an
  edited shader (HMR) never reuses a stale program.
- **`lazy`** on the shared tier disposes the engine, freeing its fields and host
  reference, instead of calling `loseContext()`. The last release frees the
  host's slot (ADR 0088). `Fluid.svelte` never calls `getContext('webgl*')` on a
  shared canvas, and never loses a context that is still shared.

## Measurements

Hardware Chrome, Apple M1 Max. Suites: `shared-context.browser.test.ts`, plus
opt-in `shared-present.browser.test.ts` and `gpu-budget.browser.test.ts`
(`SVELTE_FLUID_GPU_BENCH=1`).

- **Pixel parity, own vs shared tier**, same seed, 30 fixed steps: all 14
  presets plus transparent, transparent+glass, reveal and transparent+contrast.
  0 differing pixels in both the engine output and the visible canvas, with
  `colorSpaceConversion: 'none'`.
- **Startup**, 1600×1000, default config, constructor median of instances
  2..n. n=8: 29.6 ms own vs 7.0 ms shared (totals 237 vs 137 ms). n=24:
  31.6 vs 6.5 ms (totals 763 vs 260 ms). The first shared instance pays the
  compile (88–109 ms). Own-context engines past the first still compile per
  context.
- **Context limit.** 24 own contexts lost 8. With the tiers, 24 visible
  `<Fluid>` (8 own + 16 shared) all render with zero `webglcontextlost`.
- **GPU per instance per frame**, 800×500 CSS, all canvases in the DOM.
  Back-to-back frames with presents fired but not awaited, then one 1-px
  readback per context. Total / (frames × n), median ms, own / shared:

  | preset | DPR | n=1 | n=2 | n=4 | n=8 |
  |---|---|---|---|---|---|
  | default | 2 | 1.54 / 2.00 | 1.52 / 1.98 | 1.48 / 1.99 | 1.47 / 1.97 |
  | Karman | 2 | 1.70 / 2.13 | 1.68 / 2.12 | 1.65 / 2.13 | 1.63 / 2.15 |
  | default | 3 | 1.50 / 2.25 | 1.49 / 2.19 | 1.49 / 2.22 | 1.50 / 2.20 |
  | Karman | 3 | 1.65 / 2.37 | 1.64 / 2.28 | 1.64 / 2.33 | 1.63 / 2.37 |

  - **Stubbed-present proof:** with `present()` stubbed, a shared engine costs
    the same as an own one (1.52 vs 1.54, 1.70 vs 1.70, 1.51 vs 1.50,
    1.66 vs 1.65). The whole delta is the snapshot copy: +0.45 ms at DPR 2 and
    +0.7 ms at DPR 3, flat in n.
  - Awaiting every present changes the figures by ≤ 0.04 ms, so this is GPU
    work, not async latency.
  - The 0082 spike's 1.3–1.6× cheaper shared frames at n=8 do not reproduce
    for `FluidEngine`.
  - A 2d `drawImage` present and an `HTMLCanvasElement` surface cost the same
    as the snapshot.
  - Real rAF intervals stay at vsync (16.7 ms) up to n=8 on both tiers.

## Consequences

- **Below K, nothing changes.** Per-instance cost is the same as before
  and within the < 2 ms budget (1.47–1.70 ms above).
- **Past K, shared instances cost +0.45 ms (DPR 2) / +0.7 ms (DPR 3)** and can
  exceed 2 ms by up to about 0.4 ms. This is accepted. Past roughly 16
  instances the alternative is context loss, which leaves a blank canvas.
- Shared-tier startup is about 7 ms per extra instance. Own-tier startup is
  unchanged (about 30 ms).
- A loss of the shared context pauses every shared-tier instance, and they
  restore one after another. Own-tier losses stay per canvas.
- Shared correctness depends on every engine binding the state it reads. The
  parity tests and the alternating bloom+sunrays+glass / transparent test guard
  this.
- `getError()` after each shared-tier resource transition costs one sync per
  transition, not per frame.
