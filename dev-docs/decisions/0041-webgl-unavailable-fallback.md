# ADR 0041: Graceful, accessible WebGL-unavailable fallback

## Status

Accepted (Phase 1). Reduced-motion poster behavior deferred to Phase 2.

## Context

When a browser cannot provide WebGL — old hardware, a blacklisted/disabled GPU,
WebGL turned off, or too many live contexts on the page — `getWebGLContext`
threw a generic `Error` and `Fluid.svelte`'s `try/catch` set `engine = undefined`,
degrading to a **blank canvas with no message**, invisible to assistive tech.

Two problems:

1. A silent blank box is a poor experience and announces nothing to screen
   readers.
2. The single `catch` could not distinguish a **permanent** failure (no WebGL at
   all → a fallback should show) from a **transient** one (the page hit the
   browser's ~8–16 live-context cap on a dense `lazy` layout → the canvas should
   stay blank and simply retry when a sibling scrolls away and frees a slot).
   Showing a big fallback panel on every transient miss would flicker as the user
   scrolls.

We want a meaningful, accessible fallback while preserving the existing
"never crash the host page" guarantee (ADR-0008 throws on shader errors;
ADR-0013 defers all GL to `onMount`; ADR-0019 handles context-loss recovery —
all kept).

Decisions confirmed with the maintainer up front: (a) default fallback =
`backColor` fill + visually-hidden a11y text, with opt-in `fallback` snippet /
`poster`; (b) reduced-motion still = Phase 2; (c) a software-rendering gate as an
**opt-in** prop, off by default to avoid false negatives on legitimate
integrated GPUs.

## Decision

**Engine (framework-agnostic).** In `gl-utils.ts`:

- Add `WebGLUnavailableError extends Error` carrying a typed
  `reason: 'no-webgl' | 'no-float-textures' | 'context-limit'`, replacing the two
  generic throws in `getWebGLContext`.
- Classify a null context by **probing**: if a fresh throwaway context can be
  created right now (`isWebGLAvailable()`), this canvas's failure was situational
  → `context-limit` (**transient**); otherwise WebGL is genuinely unavailable →
  `no-webgl` (**permanent**). A missing half-float format → `no-float-textures`
  (**permanent**). The probe is **memoized** (keyed by hardware-acceleration
  requirement) so classification creates at most one probe context per key per
  page — not one per failure — bounding both the sibling-eviction risk and the
  `WEBGL_lose_context`-absent slot leak to ≤1. Only **positive** results are
  cached: a one-off transient `false` must not become a permanent page-wide
  "no WebGL" verdict, and the component's permanent-failure short-circuit already
  prevents re-probing a genuine `no-webgl`.
- Add `isWebGLAvailable(attributes?)`: creates a detached probe context and
  releases it immediately via `WEBGL_lose_context`. SSR-safe (returns `false`
  when `document` is undefined). This is real context creation, not
  `window.WebGLRenderingContext` sniffing (which false-positives on disabled
  GPUs). Exported publicly so consumers can gate rendering themselves.
- Add `requireHardwareAcceleration` → `failIfMajorPerformanceCaveat` on the
  context attributes (and on the classification probe, so the probe's verdict
  matches). A new `REQUIRE_HARDWARE_ACCELERATION` resolved-config field, default
  `false`, construct-only (Bucket D).

**Component (`Fluid.svelte`).**

- The catch records the raw typed error in `lastError` (`$state`); the displayed
  `failureReason` is a `$derived` of it, so toggling `reveal`/mode props at runtime
  re-evaluates the overlay without waiting for a reconcile. Only **permanent**
  reasons surface; `context-limit` derives to `null` (blank, retryable) except in
  reveal mode (masks on any failure). A **non-`WebGLUnavailableError`** (e.g. a
  shader-compile failure per ADR-0008) is NOT shown as a WebGL fallback — that
  would misdiagnose a real bug as an unsupported browser; it stays blank and is
  `console.error`-surfaced.
- New props: `fallback?: Snippet<[{ reason }]>`, `poster?: string`,
  `posterAlt?: string` (default `''` — decorative), `fallbackText?: string`.
  (`requireHardwareAcceleration` rides in via `FluidConfig`.)
- Render, in order of preference, when `failureReason` is set: the `fallback`
  snippet → a cover-fit `poster` `<img>` → a fill-color box plus a
  visually-hidden `<span>` carrying `fallbackText`. The overlay is absolutely
  positioned over the (still-mounted) canvas; the dead canvas is `aria-hidden`,
  and the non-snippet overlay is `pointer-events: none` so it never intercepts
  input meant for content behind a full-bleed instance.
- The default fill is **mode-aware**: `transparent` mode stays see-through;
  **reveal** mode fills with `revealCoverColor` (not `backColor`) AND masks on
  *any* failure (incl. transient), because the reveal canvas is transparent and a
  blank box would expose the content the reveal is meant to cover; otherwise it
  fills `backColor`.
- A permanent failure short-circuits re-instantiation on later reconciles (no
  repeated probes / doomed engine inits on resize/scroll).
- a11y posture is deliberately **quiet**: the message is discoverable
  (visually-hidden text) but NOT wrapped in an `aria-live`/`role="alert"` region —
  a page of decorative background fluids must not blast "requires WebGL" at
  screen-reader users. Consumers who need an announcement own that via `fallback`.
- The six components and fourteen presets inherit this for free — they all wrap
  `<Fluid>`.

Exported from `src/lib/index.ts`: `isWebGLAvailable`, `WebGLUnavailableError`,
`WebGLUnavailableReason`, `GetContextOptions`.

## Consequences

- WebGL-less browsers get an accessible, layout-preserving fallback instead of a
  silent blank; the host page still never crashes.
- The transient/permanent split keeps dense `lazy` pages flicker-free: a
  context-limit miss stays blank and recovers on the next reconcile, exactly as
  before, while a true no-WebGL browser shows the fallback.
- The classification probe creates an extra throwaway **context** only on the
  failure path, and at most once per page (only a *positive* probe creates a
  context, and that result is memoized). A *negative* probe's `getContext` returns
  `null` — no context, no slot, no eviction — so re-probing a genuine `no-webgl`
  (which the positive-only cache does not memoize) is effectively free, and the
  permanent-failure short-circuit stops it after the first attempt per instance
  anyway. The net effect: the memo prevents the per-failure eviction *storm* an
  unbounded probe would cause on a dense page, with no sticky false-negative.
- **Known limitation:** a browser that hard-caps contexts *without* LRU eviction
  (Firefox-class) makes the probe also fail at the cap, so `context-limit` is
  misclassified as `no-webgl` there — a dense page may show the fallback while
  waiting for a slot instead of staying blank. Accepted; the alternative
  (a shared live-context counter) was rejected as cross-instance coupling that the
  no-module-GL-state invariant discourages.
- `requireHardwareAcceleration` is opt-in: default behavior is unchanged, and
  integrated-GPU users are never misclassified unless the consumer asks for it.
- Tested at the unit level (`webgl-fallback.test.ts`): `isWebGLAvailable`
  SSR/attribute/release behavior, reason classification, and the resolved-config
  field. Component-level fallback rendering still has no mount-based test env
  (preset tests are source-string based); that gap is unchanged by this ADR.

### Rejected / deferred

- **Sniffing `window.WebGLRenderingContext`** — false-positives on disabled GPUs;
  rejected in favor of real context creation.
- **`failIfMajorPerformanceCaveat` on by default** — would blank legitimate
  integrated GPUs; made opt-in.
- **Reduced-motion poster still (Phase 2)** — show the `poster` instead of
  animating when `prefers-reduced-motion: reduce`. Deferred; prop-gated when it
  lands.
- **`poster` as a first-paint placeholder** (before the engine spins up) — a nice
  perceived-perf win, but orthogonal to availability; not in this change.
