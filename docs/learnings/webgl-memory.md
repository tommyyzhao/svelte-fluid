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

## Recommendations

1. Always use `lazy={true}` for pages with >6 instances
2. Keep `rootMargin` small (50px or less) for dense layouts
3. Ensure async callbacks check for disposed state
4. Test with Chrome DevTools Memory profiler to verify no leaked contexts
