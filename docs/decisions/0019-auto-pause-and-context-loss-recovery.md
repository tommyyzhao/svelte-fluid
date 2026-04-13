# ADR 0019: Automatic pause on visibility loss and WebGL context loss recovery

**Status:** Accepted
**Date:** 2026-04-12

## Context

The demo page creates up to 13 WebGL contexts (hero + 4 grid cards + 7 presets + playground). Chrome limits WebGL contexts to ~8-16 per tab. When the limit is hit, older contexts are silently lost. The engine had no `webglcontextlost`/`webglcontextrestored` handlers, so the RAF loop continued running against a dead GL context — all GL calls silently no-oped, producing a frozen canvas with no error logged.

Even below the context limit, running RAF loops for off-screen canvases wastes CPU and GPU cycles. The existing `lazy` prop addressed this via full teardown/rebuild, but the shader recompile pause (~1-2ms) on re-entry was noticeable, and `lazy` defaulted to `false`.

## Decision

Three layers of defense, each addressing a different failure mode:

### 1. `autoPause` prop (default `true`)

A new prop on `<Fluid />` that automatically pauses the engine's RAF loop when the canvas is not visible. Two mechanisms:

- **IntersectionObserver:** When the canvas scrolls out of the viewport, `engine.pause()` stops the RAF loop. When it scrolls back in, `engine.resume()` restarts it. The GL context stays alive — no shader recompile needed.
- **Page Visibility API:** When the browser tab is hidden (user switches tabs, minimizes), all engines pause. Resumes only if the canvas is still in the viewport when the tab becomes visible again.

When both `lazy` and `autoPause` are set, `lazy` takes precedence for scroll visibility (full teardown), while `autoPause` handles tab-level visibility.

### 2. `pause()` / `resume()` / `isPaused` on FluidHandle

New public imperative API for manual control. `pause()` stops the RAF loop (idempotent). `resume()` restarts it (idempotent, no-op if context is lost). `isPaused` is a readonly getter.

### 3. WebGL context loss recovery

`FluidEngine` now listens for `webglcontextlost` and `webglcontextrestored` events on the canvas:

- **On loss:** Calls `e.preventDefault()` (signals to browser we intend to restore), stops RAF, sets `contextLost` flag. All GL-calling methods (`splat`, `setConfig`, `update`) guard against this flag.
- **On restore:** Full reinit — `initContext()`, `compileShaders()`, `initBuffersAndPrograms()`, `initFramebuffers()`, new dithering texture, fresh initial splats, and resume RAF.

## Consequences

**Positive:**
- Dense pages no longer crash. Off-screen engines stop consuming GPU cycles.
- Tab-switching pauses all engines — zero CPU/GPU while the tab is backgrounded.
- Context loss recovery is transparent: the canvas reinitializes automatically when the browser restores the context. No user action needed.
- `autoPause` defaults to `true`, so all consumers get the benefit without opt-in.
- The `pause()`/`resume()` API enables custom visibility strategies without framework coupling.

**Negative:**
- `autoPause` adds an IntersectionObserver per instance (even without `lazy`). Cost is negligible (~one observer callback per scroll event per visible instance).
- Context restoration replays the initial splats but not any user-generated splats from the prior session. The simulation "resets" visually after a context loss. This is acceptable — context loss is rare and the alternative (serializing simulation state) is complex.
- The `isPaused` getter on FluidHandle reflects RAF state, not the `paused` config prop. The two are independent: `config.paused` stops the physics step but keeps rendering; `engine.pause()` stops RAF entirely.

**Rejected alternatives:**
- *Shared WebGL context across instances:* Would eliminate the context limit problem entirely, but requires a fundamentally different rendering architecture (single canvas with viewport scissors, or OffscreenCanvas transfers). Too invasive for the current design.
- *`autoPause` default `false`:* Would preserve existing behavior but leave the crash-prone default in place. Since there's no valid use case for running RAF on an invisible canvas, defaulting to `true` is the right call.
