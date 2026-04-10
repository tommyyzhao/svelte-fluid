# ADR 0015: Preset wrapper components + construct-only `presetSplats` field

**Status:** Accepted
**Date:** 2026-04-07

## Context

Consumers asked for ready-to-use "themed" fluid components — a lava
lamp, a plasma field, an ink-in-water swirl, etc. — that they can drop
into a page without learning the ~25-prop physics surface. Each preset
needs:

1. A pinned `<Fluid />` configuration (curl, dissipations, splat
   radius, bloom, palette-driven `backColor`, etc).
2. A hand-crafted set of opening splats that paint a deterministic
   scene the moment the canvas mounts. This is the part that gives the
   preset its visual identity — random splats produce random looks.

Two architectures were evaluated:

### Option A — Pure wrapper components, post-mount splat injection
A preset is a Svelte component that renders `<Fluid />` and, after both
have mounted, walks `inner.handle.splat(...)` for each preset splat.

**Problem:** there's a real timing race. The inner `<Fluid />`
constructs its `FluidEngine` from inside its own `onMount` →
`ResizeObserver` callback. RO callbacks fire **after** the next layout,
which is **after** the parent's `onMount` has already returned. Neither
`queueMicrotask` nor `setTimeout(0)` is reliably late enough — both
fire before the RO callback in some browsers — and `inner.handle.splat`
silently no-ops while `engine` is still `undefined`. The resulting bug
("the preset works in dev but the opening splats are missing every
~3rd page load") would be a nightmare to debug.

We could expose an `onready` callback prop on `<Fluid />` to break the
race, but that expands the public component API for a single use case.

### Option B — Engine-level `presetSplats` field
Add `presetSplats?: ReadonlyArray<PresetSplat>` to `FluidConfig`. The
engine's constructor consumes it once, immediately after the random
initial splats, and never references it again. The Svelte component
forwards the prop and snapshots it via `untrack` (matching the existing
`stableSeed` pattern) so resize re-creates the same opening scene.

## Decision

Adopted Option B.

- New `PresetSplat` interface in `engine/types.ts` (also exported from
  the library entry point).
- New `presetSplats?: ReadonlyArray<PresetSplat>` field on
  `FluidConfig`. Intentionally **absent from `ResolvedConfig`** — the
  field has no meaning after construction, so it stays out of the
  internal config shape.
- `FluidEngine` constructor reads `opts.config?.presetSplats` directly
  after `multipleSplats(randomSplatCount())` and calls `this.splat()`
  for each entry.
- `Fluid.svelte` accepts a `presetSplats` prop and snapshots it once
  via `untrack` into `stablePresetSplats`, mirroring the
  `stableSeed` pattern from ADR
  [`0012`](./0012-stable-seed-via-untrack.md).
- `setConfig` does not touch `presetSplats`. It's **Bucket D**
  (construct-only) per the taxonomy in ADR
  [`0005`](./0005-hot-update-buckets.md). Hot-updating it is
  semantically nonsense — the splats already happened.
QK|- Five preset components (`LavaLamp`, `Plasma`, `InkInWater`,
  NN|  `FrozenSwirl`, `Aurora`) live in `src/lib/presets/` and
  re-export from `src/lib/index.ts`. Each one accepts only `width`,
  `height`, `class`, `style`, and `seed`; everything else is fixed.

## Consequences

**Positive:**
- Zero timing races. Preset splats land in the same code path as the
  random initial splats — they exist before the first frame is rendered.
- Same field is also useful to consumers writing their own custom
  preset, without forcing them to wrap `<Fluid />` themselves.
- Resize works for free: the snapshotted `presetSplats` array is reused
  on rebuild, so the opening scene is reproducible across resizes (just
  like the seeded random splats).
- Each preset is ~50 lines of declarative props + a `PresetSplat[]`
  literal. Adding a new preset is a copy-paste exercise.
- The engine API expansion is one optional field. No new methods, no
  new lifecycle, no new bucket.

**Negative:**
- Slightly larger public API surface on `FluidConfig`. Consumers
  scanning the prop table will see one more entry. Mitigated by
  documenting it as construct-only and pointing at the Presets section.
- Preset wrappers can't dynamically rebuild their opening scene without
  forcing a remount (e.g., by changing `seed`). This is consistent with
  every other Bucket D field and is the intended behavior — presets
  are for opening scenes, not animated state.

**Rejected alternatives:**
- *Option A (post-mount injection):* Race condition described above.
  Even with a deferred call, no guarantee the engine exists yet.
- *`onready` callback prop on `<Fluid />`:* Expands the public Fluid
  component API for a single use case; couples preset internals to a
  child lifecycle event. The engine field is the more local change.
- *`PresetSplats` in `ResolvedConfig`:* Pollutes the internal config
  shape with a field that has no post-construction meaning.
- *Constructor-time `engine.applyPresetSplats(arr)` instance method:*
  Same effect, but two calls instead of one (`new` then method) and
  the wrapper component would need to expose its own `oncreate` event.
- *Polling `$effect` that retries until `engine` exists:* Brittle and
  hides the race instead of removing it.
