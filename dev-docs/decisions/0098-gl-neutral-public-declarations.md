# ADR-0098: Public declarations are GL-type-neutral

## Status

Accepted (2026-10-02). 0097 is reserved by another lane.

## Context

`FBO`, `DoubleFBO`, `ExtInfo` and `ResolvedConfig` were root-exported but
only ever used by the engine, and mentioned `WebGLTexture`/`WebGLFramebuffer`.
They were deprecated in 0.8 with removal promised at 1.0. A WebGPU backend is
planned (private R&D branch), so a GL type in a root signature would pin the
public API to one backend and force consumers to load DOM WebGL typings.

## Decision

1. No root-exported declaration may name a `WebGL*` DOM type, `GPU*` type,
   `FBO`, `DoubleFBO`, `ExtInfo`, `ProgramWrap` or `ResolvedConfig`. The
   library's own `WebGLUnavailableError` / `WebGLUnavailableReason` are
   permitted: they are plain string unions and an `Error` subclass.
2. Internal GL types live in `engine/internal-types.ts` (never imported from
   `index.ts`). The availability probe and typed failure live in
   `engine/gl-support.ts`, with `isWebGLAvailable` taking a structural
   `ContextProbeAttributes` rather than `WebGLContextAttributes`.
3. Enforced twice: `scripts/check-public-declarations.mjs` (run by `prepack`)
   compiles a strict consumer against `dist/` with only the DOM lib and scans
   identifier tokens; `engine/__tests__/public-surface.test.ts` checks runtime
   exports, `index.ts`, `types.ts` and the `dist` graph reachable from the root.
4. Engine-only members that name GL types stay `@internal` (stripped by
   `stripInternal`) or private; `FluidHandle` is GL-free.

## Consequences

- Major bump; migration is "delete the import" (nothing returned these types).
- Future backends can change internals without a public type change.
- A new root export that leaks a GL type fails `prepack` and the Node suite.
- Rejected: keeping the types behind a `svelte-fluid/internal` subpath;
  nothing needs them and it would be a new supported surface.
