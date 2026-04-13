# WebGL Memory Management

## Context

Chrome shows "out of memory" / "Crashed" icons on canvases when too many WebGL contexts are active simultaneously. Browsers cap contexts at 8–16 per tab.

## Findings (2026-04-09)

### 1. Lazy prop is essential for dense pages

The demo page has 12 Fluid instances. Without `lazy={true}`, each instance creates a WebGL context immediately on mount.

**Before fix:** Hero background had no `lazy` prop → always created context on page load.

**After fix:** All 12 instances use `lazy={true}`. Contexts are created only when the container enters the viewport.

### 2. IntersectionObserver rootMargin matters

The `rootMargin` controls how early before viewport entry the context is created.

- `200px` (original): Creates ~4 contexts before user sees them. Good for hiding recompile pause, bad for memory.
- `50px` (current): Creates ~1-2 contexts before visibility. Balances perceived performance vs memory pressure.

### 3. Dithering texture async callback leak

The dithering texture uses an async `image.onload` callback that captures the WebGL context reference. If the engine is disposed before the image loads (which is async via base64 data URL), the callback tries to use a destroyed context.

**Fix:** Added `dispose()` method to `DitheringTexture` interface. The `image.onload` callback checks a `disposed` flag before uploading.

```typescript
// dithering.ts
export interface DitheringTexture {
  dispose(): void;  // New
  // ...
}

// In createDitheringTexture():
let disposed = false;
image.onload = () => {
  if (disposed) return;  // Skip if engine was disposed
  // ... upload texture
};

// FluidEngine.ts dispose():
if (this.ditheringTexture) {
  this.ditheringTexture.dispose();  // Mark disposed
  gl.deleteTexture(this.ditheringTexture.texture);
}
```

### 4. Window-level event listeners

`mouseup` and `touchend` listeners are attached to `window` (not canvas) for proper drag handling. If the canvas is removed from DOM without calling `dispose()`, these listeners remain attached.

**Mitigation:** The `dispose()` method properly removes all listeners via `removePointerListeners()`. The `pointerListenersInstalled` flag ensures idempotent removal.

### 5. ResizeObserver rapid-fire teardown

During window resize, the ResizeObserver fires rapidly. Each fire triggers `teardown()` → `dispose()` → `reconcile()` → new engine.

**Current mitigation:** The `reconcile()` function gates engine creation on `cssW > 0 && cssH > 0 && isVisible`. No debouncing is needed because the `disposed` flag prevents double-dispose.

### 6. autoPause and context loss recovery (2026-04-12)

**Problem:** All presets on the demo page would eventually crash — frozen canvases with no errors. Root cause: browsers silently cull WebGL contexts under GPU memory pressure, and the engine had zero handling for `webglcontextlost`/`webglcontextrestored` events. The RAF loop continued running against a dead GL context.

**Solution (three layers):**

1. **`autoPause` prop (default `true`):** Fluid.svelte now always attaches an IntersectionObserver that calls `engine.pause()` when the canvas scrolls out of view and `engine.resume()` when it returns. Also listens for `document.visibilitychange` to pause when the tab is hidden. This is lighter than `lazy` — the GL context stays alive, so there's no shader recompile pause on resume.

2. **`pause()` / `resume()` / `isPaused` API:** New public methods on FluidHandle and FluidEngine. `pause()` stops RAF (idempotent). `resume()` restarts it (no-op if context is lost). All GL-calling methods guard against `contextLost` flag.

3. **Context loss/restore handlers:** `webglcontextlost` event calls `e.preventDefault()` (signals restore intent), stops RAF, sets `contextLost` flag. `webglcontextrestored` does full reinit (shaders, programs, FBOs, dithering texture, initial splats) and resumes.

**Key insight:** The combination of `lazy` (teardown on scroll-out, freeing the context slot) and `autoPause` (RAF pause on scroll-out, keeping context alive) gives two tiers of resource management. Dense pages should use `lazy`; lighter pages get `autoPause` by default with zero configuration.

### 7. Graceful context exhaustion (2026-04-13)

**Problem:** When too many WebGL contexts are requested (beyond the browser limit), `new FluidEngine()` throws an unhandled exception from `getWebGLContext()` that silently killed the component. The canvas remained as a white rectangle with no error feedback to the user.

**Fix:** `Fluid.svelte` now wraps `new FluidEngine()` in a try-catch. The canvas element has `background: #000` CSS applied unconditionally, so if engine construction fails, the canvas shows clean black instead of white. The error is caught and logged but does not propagate -- the component remains mounted (with a black canvas) and can recover if a context becomes available later (e.g., via context loss recovery on another instance freeing a slot).

**Why this matters:** On dense pages with many fluid instances, the browser may hit its context limit even with `lazy` and `autoPause` enabled. Previously this produced a jarring white rectangle and a console error. Now it produces a clean black rectangle that blends with dark backgrounds, matching the visual intent of most presets.

## Recommendations

1. `autoPause` is on by default — off-screen engines stop their RAF loop automatically
2. Use `lazy={true}` for pages with >6 instances (frees the GL context slot entirely)
3. Keep `rootMargin` small (50px or less) for dense layouts
4. Ensure async callbacks check for disposed state
5. Context loss recovery is automatic — the engine reinitializes when the browser restores
6. Test with Chrome DevTools Memory profiler to verify no leaked contexts
