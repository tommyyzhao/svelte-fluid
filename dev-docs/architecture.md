# Architecture

## One-line summary

A framework-agnostic `FluidEngine` class owns all WebGL state for a single
canvas; a thin Svelte 5 component (`Fluid.svelte`) owns the DOM, the
`ResizeObserver`, and the imperative API surface.

## Component diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Consumer Svelte app                                             │
│                                                                 │
│   <Fluid bind:this={ref} curl={20} bloom={false} seed={42} />   │
│                          │                                      │
│                          │ props ($props)                       │
│                          ▼                                      │
│   ┌─────────────────────────────────────────────────────┐       │
│   │ src/lib/Fluid.svelte         (Svelte 5, ~390 LOC)   │       │
│   │  ─ stableSeed: const         (untrack’d once)       │       │
│   │  ─ container: HTMLDivElement                         │      │
│   │  ─ canvasEl: HTMLCanvasElement                       │      │
│   │  ─ ResizeObserver(container)                         │      │
│   │      → teardown() → debounce 150ms → reconcile()     │      │
│   │  ─ $effect → engine.setConfig(buildConfig())         │      │
│   │  ─ IntersectionObserver  (autoPause + lazy)           │      │
│   │  ─ visibilitychange      (autoPause)                 │      │
│   │  ─ export const handle = { splat, randomSplats,      │      │
│   │                             pause, resume, isPaused } │      │
│   └────────────────────────┬─────────────────────────────┘      │
│                            │ canvas + config                    │
└────────────────────────────┼────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ src/lib/engine/FluidEngine.ts             (TS class, ~1400 LOC) │
│                                                                 │
│  Owned state (per instance, never shared):                      │
│   • gl, ext (WebGL2 or WebGL1)                                  │
│   • ResolvedConfig                                              │
│   • Rng (mulberry32, seeded)                                    │
│   • vertex/index buffers + blit closure                         │
│   • 18 ProgramWrap + Material (display)                         │
│   • dye / velocity / pressure DoubleFBOs                        │
│   • divergence / curlFBO single FBOs                            │
│   • bloom + bloomFramebuffers + sunrays + sunraysTemp           │
│   • DitheringTexture                                            │
│   • pointers[], splatStack[]                                    │
│   • rafId, lastUpdateTime, engineStartTime                      │
│                                                                 │
│  Public API:                                                    │
│   • new FluidEngine({ canvas, config? })                        │
│   • splat(x, y, dx, dy, color)                                  │
│   • randomSplats(count)                                         │
│   • pause() / resume() / isPaused  ← RAF control               │
│   • setConfig(partial)        ← 4-bucket hot update             │
│   •   includes autoSplatCenterX/Y, autoSplatBandWidth/Height,      │
│   •   autoSplatSwirl, autoSplatEvenX (Bucket A)                    │
│   • dispose()                 ← removes everything              │
│                                                                 │
│  Private (ports of script.js):                                  │
│   update / step / render / drawColor / drawDisplay              │
│   applyBloom / applySunrays / blur / multipleSplats             │
│   initDye/Simulation/PostprocessFramebuffers / updateKeywords   │
│   handleMouseDown/Move/Up/Leave / handleTouchStart/Move/End           │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Engine support modules (all framework-agnostic)                 │
│                                                                 │
│  shaders.ts          22 verbatim shader source strings          │
│  gl-utils.ts         compileShader, makeProgram, Material,      │
│                      createFBO, createDoubleFBO, resizeFBO,     │
│                      disposeFBO/disposeDoubleFBO,               │
│                      createBlit, getResolution, helpers         │
│  dithering.ts        DITHERING_PNG_BASE64 + createDithering…    │
│  rng.ts              mulberry32, randomSeed, generateColor,     │
│                      HSVtoRGB, normalizeColor                   │
│  pointer.ts          Pointer, createPointer, update*Data,       │
│                      correctDeltaX/Y                            │
│  container-shapes.ts containerShapeEqual, containerMask (SDF),  │
│                      roundedRectSDF, frameMask (inner+outer),   │
│                      annulusMask, svgPathMask, maskAreaFraction,│
│                      MaskContext, glslSmoothstep (TS↔GLSL)     │
│  types.ts            FluidConfig, ResolvedConfig, FluidHandle,  │
│                      ContainerShape (circle | frame |           │
│                      roundedRect | annulus | svgPath),          │
│                      FBO, DoubleFBO, ExtInfo                    │
│                      frame: innerCornerRadius, outerHalfW/H,    │
│                      outerCornerRadius (all optional)           │
└─────────────────────────────────────────────────────────────────┘
```

## Module boundaries

- **Engine never imports Svelte.** It is constructible from any framework
  or vanilla JS.
- **`gl-utils.ts` never holds module-level GL state.** Every helper takes
  the WebGL context as its first argument so the same module can serve
  multiple `FluidEngine` instances.
- **`shaders.ts` is GL-free.** It exports raw GLSL source strings;
  compilation happens in the engine.
- **The Svelte component never touches WebGL directly.** It hands the
  canvas to the engine and lets the engine do everything.

## Lifecycle

### Construction (per instance)

1. Component mounts → `onMount` runs.
2. `ResizeObserver` is created on the wrapper container.
3. RO callback fires once with the initial container size.
4. `cssW`/`cssH` updated; `teardown()` (no-op on first mount); `instantiate()` called.
5. `instantiate()` writes `canvas.width = cssW * dpr`, `canvas.height = cssH * dpr`.
6. `new FluidEngine({ canvas, config: buildConfig() })` runs:
   1. Resolve config from camelCase props into SCREAMING_CASE `ResolvedConfig`.
   2. Create RNG from `config.SEED`.
   3. `getWebGLContext` → store `gl`, `ext`. Apply non-linear-filtering fallback.
   4. Compile all shader stages (2 vertex + 18 fragment).
   5. Create vertex/index buffers + `blit` closure.
   6. Link all 18 programs + display `Material`.
   7. Create dithering texture (1x1 placeholder, async PNG decode).
   8. `updateKeywords()` selects display shader variant.
   9. The explicit resource groups allocate dye/scalar, simulation, and
      post-process framebuffers fresh; mask-derived solver textures and the glass
      presentation target follow in dependency order (ADR
      [`0055`](./decisions/0055-framebuffer-resource-ownership.md)).
   10. `replayOpeningScene()` resets the seeded RNG and opening clocks, paints
       the random initial scene, then replays the private value snapshot of
       `opts.config?.presetSplats` (see ADRs
       [`0015`](./decisions/0015-preset-components.md) and
       [`0053`](./decisions/0053-context-restore-recreates-resources.md)).
   11. Install pointer listeners (mouse on canvas, mouseup/touchend on `window`).
   12. Schedule the first `requestAnimationFrame(this.tick)`; the opening clocks
       captured by `replayOpeningScene()` make `currentDensityDissipation()`
       measure elapsed time from the completed opening scene.
7. The RAF loop runs every frame: `update()` → `calcDeltaTime` → `updateColors` → `applyInputs` → `step` (if not paused) → `render(null)` → reschedule. The dye advection inside `step()` calls `currentDensityDissipation()` for the dissipation uniform (see ADR [`0016`](./decisions/0016-burn-in-density-dissipation.md)) so a burn-in ramp from `INITIAL_DENSITY_DISSIPATION` toward `DENSITY_DISSIPATION` is applied automatically without per-frame setConfig calls. When `glass` is enabled, `render()` routes `drawDisplay` through a `sceneFBO` and adds a `drawGlass` post-processing pass with Snell's law refraction (hemisphere model for circles, rim model for other shapes). See ADR [`0025`](./decisions/0025-glass-refraction-post-processing.md). When `distortion` is enabled, `render()` disables blending and returns early after `drawDisplay()` (no background, no glass). The display shader's `DISTORTION` branch reads `dye.r` as distortion intensity and `velocity.xy` as direction, offsets image UVs, and samples a pre-loaded distortion texture. See ADR [`0030`](./decisions/0030-fluid-distortion-component.md).

### Resize

1. `ResizeObserver` callback fires with new dimensions.
2. Component compares against `cssW`/`cssH`; bails out if unchanged.
3. `teardown()` runs immediately — `engine.dispose()` cancels RAF, removes
   listeners, deletes all GL resources (FBOs, textures, programs, shaders,
   buffers). The canvas is blank during the drag.
4. `reconcile()` is **debounced by 150 ms** — only fires after the last
   resize event settles. This prevents GPU spikes from repeated shader
   recompilation during continuous window drag.
5. `instantiate()` runs inside `reconcile()`. It applies **adaptive
   resolution capping** before constructing the engine:
   - `dyeResolution`, `bloomResolution`, `sunraysResolution` are capped
     to `max(canvas.width, canvas.height)` so textures never exceed the
     canvas's actual pixel dimensions.
   - Bloom and sunrays are auto-suppressed on canvases under 600 px
     (max dimension) when the user hasn't explicitly opted in.
   - `bloomIterations` is capped to 4 (< 512 px) or 5 (< 768 px).
   - `pressureIterations` is reduced to 10 on small canvases, 6 on
     tiny sim grids (≤ 64).
6. `new FluidEngine` is created with the **same `stableSeed`**.
7. The deterministic RNG produces the same initial splat pattern.

### Context restoration

Context loss destroys every GL object even though JavaScript can still hold its
wrapper. Restoration therefore abandons stale framebuffer/texture handles
without deleting them, recompiles programs, allocates all framebuffer groups
afresh, rebuilds textures, and calls `replayOpeningScene()`. It never uses the
normal same-size resize path.
Random and configured preset splats return exactly once, with the burn-in clock
restarted; user-painted state is intentionally not preserved. See ADR
[`0053`](./decisions/0053-context-restore-recreates-resources.md).

### Hot prop update

1. Any tracked prop changes → `$effect` re-runs.
2. `buildConfig()` collects current values.
3. `engine.setConfig(cfg)` walks the four buckets:
   - **A** scalars/booleans → write to `this.config.X`, picked up next frame.
     Includes `autoSplatCenterX`, `autoSplatCenterY`, `autoSplatBandWidth`,
     `autoSplatBandHeight`, `autoSplatSwirl`, `autoSplatEvenX`,
     `revealSensitivity`, `revealCurve`, `revealCoverColor`, `revealFringeColor`,
     `revealAccentColor`.
   - **B** SHADING/BLOOM/SUNRAYS/REVEAL/DISTORTION → `updateKeywords()` recompiles display shader.
     `sticky` toggle and `stickyMask` change trigger `initStickyMaskTexture()` rebuild.
   - **C** SIM/DYE/BLOOM/SUNRAYS resolution → only the owning framebuffer
     group transitions; combined changes visit each group once (ADR
     [`0055`](./decisions/0055-framebuffer-resource-ownership.md)).
   - **A** also includes `stickyStrength`, `stickyPressure`, `stickyAmplify`.
   - **A** also includes `pointerInput` (installs/removes canvas+window
     event listeners on transition), `splatOnHover` (cursor movement
     over the canvas creates splats without requiring a click), and
     `openBoundary` (toggles divergence BCs + container shape mask enforcement).
   - **D** seed / initialSplatCount* / presetSplats → ignored after construction

### Unmount

1. Component teardown function runs (returned from `onMount`).
2. `ResizeObserver.disconnect()`.
3. `engine.dispose()` (idempotent — sets `this.disposed = true` and bails out on re-entry).

## Determinism contract

The "same seed → same initial splats after resize" guarantee depends on
**every** randomness call site routing through `this.rng`:

- `multipleSplats()` — x, y, dx, dy, color
- `updateColors()` — `generateColor` for each pointer when colorful timer trips
- `handleMouseDown` / `handleTouchStart` — `generateColor` for the new pointer

`presetSplats` (ADR [`0015`](./decisions/0015-preset-components.md)) is
applied immediately after `multipleSplats()` and uses no randomness, so
it doesn't affect this contract. The Svelte component snapshots
`presetSplats` via `untrack` into `stablePresetSplats` so the same
array is replayed across every resize-driven rebuild — exactly like
`stableSeed`. The engine additionally snapshots every splat and nested color by
value, then replays that snapshot after context restoration (ADR
[`0053`](./decisions/0053-context-restore-recreates-resources.md)).

User input is non-deterministic, so the contract only holds **before any
interaction**. Touch a canvas and the pattern thereafter depends on input
order — that's expected and acceptable.

The burn-in dissipation ramp (ADR [`0016`](./decisions/0016-burn-in-density-dissipation.md))
uses `performance.now()` and isn't seed-dependent. After resize the
clock starts over (because the engine is reconstructed), so the burn-in
plays from the beginning each time — same shape, just shifted in
wall-clock time. Context restoration also restarts this opening clock because
the simulation fields have necessarily been reset.

## Why split engine and component?

| Reason | Benefit |
| --- | --- |
| Testability | The engine can be unit-tested with [headless-gl](https://github.com/stackgl/headless-gl) without needing a Svelte runtime. |
| Reusability | A future React/Vue/Solid wrapper can reuse `FluidEngine` verbatim. |
| Concern separation | DOM and lifecycle concerns live in `Fluid.svelte`; GPU concerns in the engine. Bugs land in obvious places. |
| Disposability | The component can hold a reference, throw it away, build a new one. The engine is fully tear-down/re-instantiate safe. |

## Trade-offs and known limitations

- **WebGL context limit.** Browsers cap simultaneous contexts at ~8–16 per tab.
  Beyond that the oldest context is silently lost. Mitigated by three layers:
  `autoPause` (default on, stops RAF when off-screen), `lazy` (full teardown on
  scroll-out with `loseContext()` to release the context slot, restored via
  `WEBGL_lose_context.restoreContext()` + `webglcontextrestored` event on
  rebuild), and context loss/restore handlers (automatic reinit). See ADR
  [`0019`](./decisions/0019-auto-pause-and-context-loss-recovery.md).
- **No live state preservation across resize.** Resizing means brand-new fluid;
  the old simulation state is gone. The seed makes the *initial* splats stable
  but any user-painted state is lost. (See ADR
  [`0004`](./decisions/0004-resize-via-component-resize-observer.md) for the
  rejected alternative of in-place resize.)
- **DPR change between monitors.** If the user drags the window from a 1× to a
  2× monitor without changing CSS dimensions, ResizeObserver may not fire.
  Known limitation; fix only if reported.
- **The dithering PNG inflates the bundle by ~9 KB.** Acceptable; gzips well.
