---
'svelte-fluid': minor
---

Add a graceful, accessible fallback when WebGL is unavailable (ADR-0041).
Previously a browser without usable WebGL degraded to a silent blank canvas.
`<Fluid>` (and every component/preset that wraps it) now renders, in order of
preference, a `fallback` snippet, a `poster` image, or a `backColor`-filled box
with a visually-hidden message — and never crashes the host page. New props:
`fallback`, `poster`, `posterAlt`, `fallbackText`, and `requireHardwareAcceleration`
(opt-in; rejects a software-only renderer via `failIfMajorPerformanceCaveat`).

Permanent failures (no WebGL / no half-float textures) show the fallback;
transient ones (hitting the browser's live-context cap on a dense `lazy` page)
stay blank and retry on the next reconcile. New public exports: `isWebGLAvailable()`,
`WebGLUnavailableError`, `WebGLUnavailableReason`, and `GetContextOptions`.
`getWebGLContext` now throws a typed `WebGLUnavailableError` instead of a generic
`Error`.
