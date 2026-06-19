# Plan: WebGL-unsupported graceful fallback

Status: **Phase 1 implemented** — see [ADR-0041](../decisions/0041-webgl-unavailable-fallback.md).
Phase 2 (reduced-motion poster still) remains proposed.
Related: [ADR-0008](../decisions/0008-throw-on-shader-errors.md) (throw on shader
errors), [ADR-0013](../decisions/0013-ssr-safety-via-onmount.md) (onMount/SSR),
[ADR-0019](../decisions/0019-auto-pause-and-context-loss-recovery.md) (context-loss recovery).

## Context / current behavior

When WebGL is unavailable, `getGLContext` (`src/lib/engine/gl-utils.ts:48`)
throws `'svelte-fluid: WebGL is not supported in this browser'`. `Fluid.svelte`
wraps engine creation in `try/catch` (`src/lib/Fluid.svelte:368-375`) and, on
failure, sets `engine = undefined` — degrading to a **blank canvas with no
message**. The same catch also swallows *transient* failures (WebGL context
limit exceeded, half-float textures unsupported), so the two cases are
indistinguishable today.

Gap: a *blank* canvas is a poor experience and is invisible to assistive tech.
We want a **meaningful, accessible fallback** while keeping the "never crash the
host page" guarantee.

## Best practices (researched)

- **Detect by creating + validating a context**, not by sniffing
  `window.WebGLRenderingContext` (false-positives on blacklisted/disabled GPUs).
  Our engine already does real context creation (webgl2 → webgl →
  experimental-webgl), which is the right approach.
- **Don't block — fall back** to a static image/video (or a simpler render).
- **Optionally reject software rendering** via `failIfMajorPerformanceCaveat`
  (Firefox/Chrome will fail rather than silently use a slow software path).
- **Handle context loss** (`webglcontextlost`/`restored`) — already done
  (ADR-0019); keep.
- Sources: [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices),
  [Properly detecting WebGL support](https://www.xjavascript.com/blog/proper-way-to-detect-webgl-support/),
  [PixelFreeStudio: cross-browser WebGL](https://blog.pixelfreestudio.com/best-practices-for-cross-browser-compatibility-in-webgl/).

## Decisions (confirmed)

- **(a) Default fallback** = fill the container with `backColor` (preserves
  layout + color) **plus** visually-hidden a11y text ("This visual requires
  WebGL"). Richer fallback is opt-in via a `fallback` snippet and/or a `poster`
  image. ✅
- **(b) Reduced-motion** = include a `poster`-based still as a **Phase 2**
  (optional) behavior: when `prefers-reduced-motion: reduce` and a `poster` is
  supplied, show the poster instead of animating, gated by a prop. Ships after
  Phase 1.
- **(c) Software-rendering gate** = `failIfMajorPerformanceCaveat` is **off by
  default** (avoid false negatives on legitimate integrated GPUs); expose it as
  an opt-in prop `requireHardwareAcceleration?: boolean`. ✅

## Design

### Engine (framework-agnostic)
1. Add `isWebGLAvailable(): boolean` to `gl-utils.ts` — creates a throwaway
   context and reports support. Pure, unit-testable (mock `getContext`).
2. Replace the generic `throw new Error(...)` with a typed error carrying a
   `reason`: `'no-webgl' | 'no-float-textures' | 'context-limit'`, so the
   component can distinguish **permanent** (show fallback) from **transient**
   (stay blank; may recover on scroll/`lazy`).
3. Thread `requireHardwareAcceleration` into the `getContext` params
   (`failIfMajorPerformanceCaveat`).

### Component (`Fluid.svelte`)
4. New `$state` `failureReason: 'no-webgl' | … | null`, set in the catch from the
   typed error.
5. New props:
   - `fallback?: Snippet` — consumer-supplied fallback UI.
   - `poster?: string` — static image shown as fallback (and reduced-motion still in Phase 2).
   - `requireHardwareAcceleration?: boolean` (default `false`).
6. Render logic when `failureReason` is **permanent**:
   - if `fallback` → render it;
   - else if `poster` → `<img>` cover-fit it;
   - else → fill with `backColor` + a visually-hidden `<span>` message.
   Transient failures keep today's blank-but-retryable behavior.
7. Presets/components inherit this for free (they all wrap `<Fluid>`).

### Demo / docs
8. Landing hero can pass a `poster` (reuse `static/hero.webp`).
9. Document the props in `/docs/components` + `/docs/configuration` and the
   agent docs (`SKILL.md`).

## Testing

- Unit: `isWebGLAvailable()` with `getContext` mocked to null / to a context;
  typed-error `reason` classification.
- Component-level fallback rendering needs a DOM/mount test env we don't have
  yet (preset tests are source-string based) → cover via manual/e2e (deferred),
  or stand up `vitest-browser` for this one case.

## Rollout

- **Phase 1:** engine `isWebGLAvailable` + typed reason + `requireHardwareAcceleration`;
  component `fallback`/`poster`/default-`backColor`-fill; docs; unit tests.
  → ship as **ADR-0041**.
- **Phase 2:** reduced-motion poster behavior (prop-gated).

## Effort

~half a day for Phase 1 (engine reason typing + component fallback + default +
unit tests + ADR + docs). Phase 2 is ~1–2 hours.

## Open questions

- Default a11y copy wording ("This visual requires WebGL." vs softer)?
- Should `poster` also serve as the **first-paint placeholder** before the
  engine spins up (nice perceived-perf win), or only on failure?
