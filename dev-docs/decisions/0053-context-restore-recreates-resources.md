# ADR-0053: Context restore recreates resources and opening state

## Status

Accepted (2026-07-11)

## Context

WebGL context loss destroys every object owned by the context. The restore path
called the normal resize-oriented `initFramebuffers()`, whose same-size fast path
retained the old dye, velocity, and scalar ping-pong handles. Those handles were
dead even though their JavaScript wrappers still existed. The path also replayed
random splats from the RNG's current position, forgot construct-only
`presetSplats`, and allocated the glass scene framebuffer twice through nested
initialization calls.

Context restoration cannot preserve live simulation fields because the browser
has already discarded them. It must instead recreate a valid, deterministic
opening scene without treating invalid GL handles as resizeable resources.

## Decision

- Snapshot `presetSplats` by value at construction and retain that private
  Bucket-D snapshot for context recovery only.
- On restoration, abandon tracked framebuffer/texture handles without issuing
  deletes, create all framebuffer groups afresh, reset the seeded RNG and opening
  clocks, then replay random initial splats followed by the preset snapshot
  exactly once.
- Keep normal `initFramebuffers()` calls state-preserving, but give context
  restoration an explicit fresh-allocation path.
- Make glass scene-FBO ownership explicit: general framebuffer initialization
  does not allocate it; construction, restore, and glass/shape transitions each
  invoke its allocator once.

## Consequences

- A restored canvas resets to the same configured opening scene instead of
  preserving user-painted state. This matches ADR-0019's accepted recovery
  policy and now includes preset splats and burn-in timing.
- External mutation of the original `presetSplats` array or color objects cannot
  alter a later restore; construct-only means value-at-construction.
- Context restoration allocates fresh GPU storage even when dimensions are
  unchanged, while ordinary resolution updates retain their existing copy path.
- Real-browser tests use `WEBGL_lose_context` and field readback because a
  lifecycle mock cannot prove that restored framebuffer handles are live.
