# ADR 0008: Throw on shader compile/link failures

**Status:** Accepted
**Date:** 2026-04-06

## Context

The original `compileShader` and `createProgram` (script.js:418–429,
396–406) `console.trace` on failure and proceed with the broken
program. The result is a blank canvas and a confused user staring at
silently-broken WebGL.

For a hand-rolled single-page demo this is fine — the developer
controls the shaders and any compile failure is a typo they'll fix
immediately. For a library, the compile errors land in *consumers'*
code, where the developer can't easily inspect them and the symptom is
"the canvas is blank, your library is broken".

## Decision

`gl-utils.ts:compileShader` and `gl-utils.ts:createProgram` both throw
a JavaScript `Error` with:

- A clear `svelte-fluid:` prefix so consumers can grep for it
- The shader/program info log
- For shaders, the full preprocessed source so the line numbers in
  the error message line up

```ts
throw new Error(
  `svelte-fluid: shader compile failed:\n${log}\n\nSource:\n${finalSource}`
);
```

The engine constructor doesn't catch these — they propagate up to the
Svelte component's `instantiate()` and ultimately surface as an
unhandled error in the consumer's app, which is exactly the right
place for a library bug or a driver-specific compatibility issue to
land.

## Consequences

**Positive:**
- Library bugs become loud and debuggable. A consumer reporting
  "it's not working" gets a stack trace pointing at the actual
  problem.
- Driver compatibility issues are no longer silently catastrophic.
- The thrown error contains everything needed to file a useful bug
  report.

**Negative:**
- An exception during the engine constructor leaves the canvas
  black and the rest of the consumer's app intact. The component
  doesn't catch + display a fallback. For a graceful-degradation
  use case, the consumer can wrap `<Fluid />` in their own error
  boundary.

**Rejected alternatives:**
- *Match the original (silent `console.trace`):* Worst of both
  worlds — silent failure plus a noisy console. No.
- *Catch and render a fallback in the component:* Adds complexity
  for a rare path. Consumers can do this themselves with their own
  error boundary if they want it.
