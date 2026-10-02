---
'svelte-fluid': major
---

Remove the internal WebGL types from the public API so every root-exported declaration is GL-type-neutral, and remove the deprecated `ToroidalTempest` alias.

**Removed** from the `svelte-fluid` root: the types `FBO`, `DoubleFBO`, `ExtInfo` and `ResolvedConfig`. They exposed WebGL handles (`WebGLTexture`, `WebGLFramebuffer`) and the engine's internal SCREAMING_CASE config; they were marked `@deprecated` in 0.8 and no public API returned or accepted them. **Replacement: none.**

**Migration:** most consumers need no change. Only code that imported these four names (type-only) must drop the import; if you need a config shape, use `FluidConfig` (the camelCase input type, unchanged) and `FluidHandle`.

**Also removed:** the `ToroidalTempest` component and `ToroidalTempestProps` type (aliases deprecated since 0.4.0). Use `Toroidal` and `ToroidalProps`; they are the same component and type.

**Signature changes:** `isWebGLAvailable(attributes?)` now takes `{ failIfMajorPerformanceCaveat?: boolean }` instead of `WebGLContextAttributes`. This is wider-compatible for existing callers that passed only that field; a caller that passed a full `WebGLContextAttributes` object literal with other keys now gets an excess-property error (pass only `failIfMajorPerformanceCaveat`). `WebGLUnavailableError`, `WebGLUnavailableReason` and `GetContextOptions` are unchanged and now live in a GL-free module. No runtime behaviour changes.

`bun run prepack` now compiles a strict consumer against `dist/` and fails if any declaration names a `WebGL*`, `GPU*`, `FBO`, `DoubleFBO`, `ExtInfo`, `ProgramWrap` or `ResolvedConfig` identifier.
