# Porting notes

This document maps the original `WebGL-Fluid-Simulation/script.js`
(1645 lines, vanilla JS, single global canvas) onto the refactored
class/module structure under `src/lib/`. It also calls out every
intentional behavioral difference.

The reference file lives at
`../WebGL-Fluid-Simulation/script.js` relative to the project root and
is read-only — never edit it.

## Symbol map

### Top-level globals → instance fields

| `script.js` symbol | Lines | Now lives at |
| --- | --- | --- |
| `canvas` | 56 | `FluidEngine.canvas` |
| `config` | 59–85 | `FluidEngine.config` (`ResolvedConfig` shape) |
| `pointers` | 100 | `FluidEngine.pointers` |
| `splatStack` | 102 | `FluidEngine.splatStack` |
| `gl`, `ext` | 104 | `FluidEngine.gl`, `FluidEngine.ext` |
| `dye`, `velocity`, `divergence`, `curl`, `pressure`, `bloom`, `bloomFramebuffers`, `sunrays`, `sunraysTemp` | 950–958 | Same names on `FluidEngine`. `curl` was renamed to `curlFBO` to avoid collision with the `config.CURL` getter. |
| `ditheringTexture` | 960 | `FluidEngine.ditheringTexture` |
| `lastUpdateTime`, `colorUpdateTimer` | 1172–1173 | Same names on `FluidEngine`. |

### Programs (lines 962–978)

All became `ProgramWrap` fields on `FluidEngine` with the same names
(`blurProgram`, `copyProgram`, `clearProgram`, `colorProgram`,
`checkerboardProgram`, `bloomPrefilterProgram`, `bloomBlurProgram`,
`bloomFinalProgram`, `sunraysMaskProgram`, `sunraysProgram`,
`splatProgram`, `advectionProgram`, `divergenceProgram`, `curlProgram`,
`vorticityProgram`, `pressureProgram`, `gradientSubtractProgram`).

The original's typo `gradienSubtractProgram` (missing `t`) was corrected.

`displayMaterial` (line 980) is now a `Material` instance owned by the engine.

### Functions

| `script.js` function | Lines | Now lives at |
| --- | --- | --- |
| `getWebGLContext` | 118–168 | `gl-utils.ts:getWebGLContext` |
| `getSupportedFormat` | 170–189 | `gl-utils.ts:getSupportedFormat` |
| `supportRenderTextureFormat` | 191–206 | `gl-utils.ts:supportRenderTextureFormat` (also tidies the probe artifacts to avoid leaks) |
| `class Material` | 351–382 | `gl-utils.ts:Material` (uses `Map<number, WebGLProgram>` instead of sparse array) |
| `class Program` | 384–394 | `gl-utils.ts:makeProgram` returns a `ProgramWrap` |
| `createProgram` | 396–406 | `gl-utils.ts:createProgram` (throws on link failure) |
| `getUniforms` | 408–416 | `gl-utils.ts:getUniforms` |
| `compileShader` | 418–429 | `gl-utils.ts:compileShader` (throws on compile failure) |
| `addKeywords` | 431–438 | `gl-utils.ts:addKeywords` (private) |
| All 22 inline shader strings | 440–913 | `shaders.ts` as `export const` |
| `blit` IIFE | 915–942 | `gl-utils.ts:createBlit` factory; vertex/index buffers now passed in so the engine can dispose them |
| `CHECK_FRAMEBUFFER_STATUS` | 944–948 | Dropped (was already commented out in the original) |
| `initFramebuffers` | 982–1010 | `FluidEngine.initFramebuffers` (also disposes old single-buffer FBOs before recreating) |
| `initBloomFramebuffers` | 1012–1032 | `FluidEngine.initBloomFramebuffers` |
| `initSunraysFramebuffers` | 1034–1043 | `FluidEngine.initSunraysFramebuffers` |
| `createFBO` | 1045–1077 | `gl-utils.ts:createFBO` |
| `createDoubleFBO` | 1079–1106 | `gl-utils.ts:createDoubleFBO` |
| `resizeFBO` | 1108–1114 | `gl-utils.ts:resizeFBO` (also deletes the old texture/FBO to avoid leaks) |
| `resizeDoubleFBO` | 1116–1126 | `gl-utils.ts:resizeDoubleFBO` |
| `createTextureAsync` | 1128–1158 | `dithering.ts:createDitheringTexture` (URL replaced with base64 data URL) |
| `updateKeywords` | 1160–1166 | `FluidEngine.updateKeywords` |
| `update` | 1176–1186 | `FluidEngine.update` (no longer calls `resizeCanvas` — see below) |
| `calcDeltaTime` | 1188–1194 | `FluidEngine.calcDeltaTime` (now uses `performance.now()`) |
| `resizeCanvas` | 1196–1205 | **Removed entirely.** Sizing is owned by the Svelte component. |
| `updateColors` | 1207–1217 | `FluidEngine.updateColors` (uses `this.rng`) |
| `applyInputs` | 1219–1229 | `FluidEngine.applyInputs` |
| `step` | 1231–1294 | `FluidEngine.step` |
| `render` | 1296–1317 | `FluidEngine.render` |
| `drawColor` | 1319–1323 | `FluidEngine.drawColor` |
| `drawCheckerboard` | 1325–1329 | `FluidEngine.drawCheckerboard` |
| `drawDisplay` | 1331–1348 | `FluidEngine.drawDisplay` |
| `applyBloom` | 1350–1394 | `FluidEngine.applyBloom` |
| `applySunrays` | 1396–1406 | `FluidEngine.applySunrays` |
| `blur` | 1408–1419 | `FluidEngine.blur` |
| `splatPointer` | 1421–1425 | `FluidEngine.splatPointer` |
| `multipleSplats` | 1427–1439 | `FluidEngine.multipleSplats` (uses `this.rng`) |
| `splat` | 1441–1455 | `FluidEngine.splat` (public method) |
| `correctRadius` | 1457–1462 | `gl-utils.ts:correctRadius` (takes `aspectRatio` as a parameter) |
| Mouse listeners | 1464–1483 | `FluidEngine.handleMouseDown/Move/Up` |
| Touch listeners | 1485–1517 | `FluidEngine.handleTouchStart/Move/End` |
| Keyboard listener | 1519–1524 | **Removed.** No keyboard input in the library; consumers can call `randomSplats(n)` themselves. |
| `updatePointerDownData` | 1526–1537 | `pointer.ts:updatePointerDownData` (canvas dims passed as args) |
| `updatePointerMoveData` | 1539–1547 | `pointer.ts:updatePointerMoveData` |
| `updatePointerUpData` | 1549–1551 | `pointer.ts:updatePointerUpData` |
| `correctDeltaX` / `correctDeltaY` | 1553–1563 | `pointer.ts:correctDeltaX` / `correctDeltaY` (take `aspectRatio` as a parameter) |
| `generateColor` | 1565–1571 | `rng.ts:generateColor(rng)` |
| `HSVtoRGB` | 1573–1595 | `rng.ts:HSVtoRGB` |
| `normalizeColor` | 1597–1604 | `rng.ts:normalizeColor` |
| `wrap` | 1606–1610 | `gl-utils.ts:wrap` |
| `getResolution` | 1612–1624 | `gl-utils.ts:getResolution` (takes `gl` as a parameter) |
| `getTextureScale` | 1626–1631 | `gl-utils.ts:getTextureScale` |
| `scaleByPixelRatio` | 1633–1636 | `gl-utils.ts:scaleByPixelRatio` (guarded for SSR — `typeof window`) |
| `hashCode` | 1638–1645 | `gl-utils.ts:hashCode` |

### Removed entirely (out of scope)

- `pointerPrototype` (line 87) — replaced by `Pointer` interface in `pointer.ts`
- `startGUI` and the entire `dat.GUI` integration (lines 116, 208–281)
- `isMobile` mobile detection (line 283) — handled by capability detection only
- `captureScreenshot` and helpers (lines 287–349)
- `framebufferToTexture`, `normalizeTexture`, `clamp01`, `textureToCanvas`, `downloadURI` (lines 301–349)
- Google Analytics calls (`ga(...)`) throughout
- The mobile-promo popup (lines 27–52)

## Behavioral differences from the original

These are intentional changes, not bugs.

### 1. The engine never resizes itself
**Original:** `update()` called `resizeCanvas()` every frame; if dimensions
changed it called `initFramebuffers()` mid-loop.
**Port:** The Svelte component owns sizing entirely. On resize the component
disposes the engine and constructs a new one. The engine reads
`canvas.width` / `canvas.height` once at construction and never re-checks.
Justification: cleaner ownership, simpler hot loop, deterministic re-seeding.
See [ADR 0004](./decisions/0004-resize-via-component-resize-observer.md).

### 2. All randomness is deterministic
**Original:** `Math.random()` everywhere.
**Port:** Every randomness call site uses `this.rng` (mulberry32 seeded
from `config.SEED`). Same seed → same initial splats. See
[ADR 0003](./decisions/0003-seedable-prng-determinism.md).

### 3. Pointer coordinates are rect-relative
**Original:** Mouse uses `e.offsetX`/`offsetY`; touch uses `e.pageX`/`pageY`.
**Port:** Both use `e.clientX/Y - rect.left/top` from
`canvas.getBoundingClientRect()`. Justification: `offsetX` only works for
fullscreen canvases, and `pageX` breaks inside scrolled containers. The
old Svelte 3 port (`./svelte-webgl-fluid-simulation/`) inherited the
`pageX` bug; we don't.
See [ADR 0009](./decisions/0009-pointer-coordinates-via-bounding-rect.md).

### 4. Compile/link errors throw
**Original:** Silent `console.trace` and proceed with a broken program → blank canvas.
**Port:** Throws with the shader source and info log included. Library
consumers get a real error message.
See [ADR 0008](./decisions/0008-throw-on-shader-errors.md).

### 5. Non-linear-filtering fallback only relaxes features
**Original:** When `!ext.supportLinearFiltering`, hard-disables SHADING /
BLOOM / SUNRAYS regardless of user intent.
**Port:** Same downgrades, but applied via plain assignment that still
respects an explicit user `false`. The semantics happen to be identical
(can't enable a feature that wasn't already enabled), but the intent is
spelled out and a future "respect user opt-in" change is one line away.

### 6. Single-buffer FBO disposal in `initFramebuffers`
**Original:** Reassigning `divergence`, `curl`, and `pressure` on each
`initFramebuffers()` call left the old textures and framebuffers
orphaned. Acceptable for a single page-lifetime canvas; unacceptable for
a library where consumers may call `setConfig({ simResolution: 256 })`
hundreds of times.
**Port:** `disposeFBO` / `disposeDoubleFBO` are called for the previous
allocations before creating new ones.

### 7. `Material.programs` is a `Map`, not a sparse array
**Original:** `this.programs[hash] = program` (sparse JS array).
**Port:** `Map<number, WebGLProgram>`. Same semantics, clearer typing.

### 8. `WEBGL_lose_context` on dispose
**Original:** No dispose path; resources leak when the page unloads.
**Port:** `dispose()` calls `gl.getExtension('WEBGL_lose_context').loseContext()`
to force the GPU driver to release texture memory immediately rather than
waiting for V8 to garbage-collect the context.

### 9. `calcDeltaTime` uses `performance.now()`
**Original:** `Date.now()`.
**Port:** `performance.now()`. Higher resolution, monotonic, immune to
system clock changes. The 16.666 ms cap is preserved.

### 10. The dithering texture is base64-inlined
**Original:** Loaded `LDR_LLL1_0.png` from a relative URL.
**Port:** Inlined as a TS string constant in `dithering.ts`. Zero
asset/bundler dependencies for consumers.
See [ADR 0007](./decisions/0007-dithering-inline-base64.md).

### 11. The engine implements `FluidHandle`
The class has `splat` and `randomSplats` as public methods, so the engine
itself satisfies the same shape that the Svelte component's `handle`
exposes. Useful if you bypass the component and use `FluidEngine` directly.

## Library-only additions (not in script.js)

The following features exist in `svelte-fluid` but have no counterpart
in the upstream `script.js`. Don't try to find them in the original
source — they were added during the port to serve library use cases
that the single-page demo didn't have.

- **`presetSplats`** field on `FluidConfig`. Construct-only array of
  hand-crafted opening splats applied immediately after the random
  `multipleSplats()`. Drives the preset wrapper components in
  `src/lib/presets/`. See ADR
  [`0015`](./decisions/0015-preset-components.md).
- **`initialDensityDissipation` + `initialDensityDissipationDuration`**
  fields on `FluidConfig`. Linear ramp from initial → steady-state
  dissipation over a duration in seconds, applied automatically by
  `currentDensityDissipation()` inside `step()`. Lets a preset combine
  "vivid persistent canvas" (`densityDissipation: 0`) with "no opening
  whiteout" by burning off the additive overshoot in the first second
  or two. See ADR
  [`0016`](./decisions/0016-burn-in-density-dissipation.md).
- **`engineStartTime`** runtime field. Set when the constructor
  finishes (right before the first RAF). Used by the burn-in clock.
- **`FluidHandle.splat` / `FluidHandle.randomSplats`** as a public
  imperative API exposed via `<Fluid bind:this={ref} />`. The
  upstream demo only had keyboard input and mouse drag; the library
  needed a programmatic surface. See ADR
  [`0006`](./decisions/0006-imperative-api-via-bind-this.md).
- **`pointerInput: false`** to suppress the mouse/touch listeners
  entirely for non-interactive backdrops.
- **The seven preset components** (`LavaLamp`, `Plasma`, `InkInWater`,
  `FrozenSwirl`, `Aurora`, `Galaxy`) in `src/lib/presets/`. Each is
  ~50 LOC of declarative `<Fluid />` props plus a `presetSplats[]`
  literal. See `docs/learnings/presets.md` for the tuning rationale.

## Recovering shader source

If you need to compare a shader against the upstream version, the
authoritative source is `script.js` lines 440–913. The corresponding
strings in `shaders.ts` are byte-identical (whitespace and all).
