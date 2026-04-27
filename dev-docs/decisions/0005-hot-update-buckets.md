# ADR 0005: 4-bucket hot-update strategy in `setConfig`

**Status:** Accepted
**Date:** 2026-04-06

## Context

Consumers will set values like `<Fluid curl={20} />` and bind them to
sliders. We need prop changes to take effect without tearing down the
engine, but some changes (resolution, shader keywords) genuinely
require expensive work.

A naive `$effect → engine.dispose() + new FluidEngine(...)` on every
prop change works but flickers visibly and burns GPU memory unnecessarily.

The original `script.js` matched the right shape implicitly: the
dat.GUI controls used `onFinishChange: initFramebuffers` for
quality/resolution, `onFinishChange: updateKeywords` for SHADING/BLOOM/
SUNRAYS, and plain live bindings for everything else.

## Decision

`engine.setConfig(patch)` classifies every config field into one of
four buckets and acts accordingly:

| Bucket | Fields | Action |
| --- | --- | --- |
| **A** Hot scalar | `densityDissipation`, `initialDensityDissipation`, `initialDensityDissipationDuration`, `velocityDissipation`, `pressure`, `pressureIterations`, `curl`, `splatRadius`, `splatForce`, `colorful`, `colorUpdateSpeed`, `paused`, `backColor`, `transparent`, `bloomIntensity`, `bloomThreshold`, `bloomSoftKnee`, `sunraysWeight`, `pointerInput`, `randomSplatRate`, `randomSplatCount`, `randomSplatColor`, `randomSplatDx`, `randomSplatDy` | Just write to `this.config.X`. The next frame's `step()` reads the new value. `pointerInput` additionally installs/removes the canvas + window event listeners on transition (see `installPointerListeners`/`removePointerListeners`). |
| **B** Keyword recompile | `shading`, `bloom`, `sunrays` | Call `updateKeywords()` → `displayMaterial.setKeywords([...])`. Recompiles the display fragment shader (~1–2 ms). |
| **C** FBO rebuild | `simResolution`, `dyeResolution`, `bloomIterations`, `bloomResolution`, `sunraysResolution` | Call `initFramebuffers()` / `initBloomFramebuffers()` / `initSunraysFramebuffers()`. The dye texture's contents are copied via `resizeDoubleFBO`. |
| **D** Construct-only | `seed`, `initialSplatCount`, `initialSplatCountMin`, `initialSplatCountMax`, `presetSplats` | Ignored after construction. `seed` is captured at construction time and only matters for the first random splats; `initialSplatCount*` only affects the random initial splats; `presetSplats` is intentionally absent from `ResolvedConfig` entirely. |

The implementation is a single diff against `this.config` followed by
conditional method calls — see `FluidEngine.setConfig`.

## Consequences

**Positive:**
- Most hot prop changes (sliders) are essentially free.
- Visual feature toggles work without flicker.
- Resolution changes still work, but only when the user actually
  changes them (not on every prop tick).
- The bucket structure is documented in the README prop table so
  consumers know what to expect from each field.

**Negative:**
- Easy to forget when adding a new config field. Mitigation: the
  `setConfig` method is short and the bucket logic is plainly
  visible. A reviewer should always ask "which bucket?" for any new
  field.
- Bucket D fields silently ignored after mount could surprise users.
  Documented in README and ADR.

**Rejected alternatives:**
- *Full reinit on every prop change:* Visible flicker on every
  slider tick. Unacceptable UX.
- *Snapshot-only at mount (no hot updates):* Forces consumers to
  remount the component to change anything. Defeats the purpose of
  reactive props.
- *More fine-grained tracking (per-prop effects):* Would require
  ~24 separate `$effect` blocks. The diff approach in `setConfig` is
  simpler and equally efficient.
