# Async-loaded WebGL textures must handle `onerror`

## Symptom

A `<FluidDistortion src="/missing.jpg" />` (or any async-loaded texture path
keyed on a URL) leaves the engine in a broken state when the source 404s:
the cached `loadedUrl` was never set, but the existing fallback texture may
have been freed or replaced, so subsequent draw calls bind a null texture
and the canvas renders garbage or stays black.

## Cause

The original `loadDistortionImage` only wired `image.onload`. On a 404 the
browser fires `image.onerror` and `onload` never runs, so:

- `distortionLoadedUrl` stays at its previous value (often `null`).
- The next `setConfig` cycle compares the same broken URL against a
  non-matching cached URL and re-fires the load — same error, same loop.
- The fallback texture (1×1 white) is not reinitialized, so the
  fragment shader samples whatever happens to be bound.

## Fix

Every async texture path must wire an `onerror` that:

1. Bails out if the engine is `disposed` or `contextLost` (same guards as
   `onload`).
2. Bails out if the URL is no longer the active one (`config.X !== url`),
   to avoid clobbering a newer in-flight load.
3. Frees the partially-uploaded texture handle, if any.
4. Resets the cache key (`loadedUrl = null`) so retries are possible.
5. Restores a valid fallback texture so draw calls have something safe
   to bind.

See `loadDistortionImage` in `src/lib/engine/FluidEngine.ts` for the
canonical implementation. The dithering texture predates this rule and
should follow the same pattern if it ever loads from a remote URL.

## Why this matters

WebGL has no "null is white" semantics — sampling an unbound texture is
undefined behavior. Any code path that uploads an external resource must
treat "load failed" as a first-class state, not as "load is still pending."
