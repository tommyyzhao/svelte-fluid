# ADR 0003: Seedable mulberry32 PRNG for deterministic resize

**Status:** Accepted
**Date:** 2026-04-06

## Context

User requirement: "resizing would reinstantiate the component w/ the
initial random splat conditions". The intended behavior is that
resizing the window or container produces the *same* initial splat
pattern, not new randoms.

The original `script.js` calls `Math.random()` directly in
`multipleSplats`, `generateColor`, and `updatePointerDownData`. There
is no notion of a seed.

## Decision

- Add a seedable PRNG (`mulberry32`) in `src/lib/engine/rng.ts`. Inline,
  ~5 lines, no dependencies.
- The engine constructor instantiates exactly one `Rng` from
  `config.SEED`.
- Every randomness call site routes through `this.rng`:
  - `multipleSplats` (initial splats — x, y, dx, dy, color)
  - `updateColors` (color rotation when COLORFUL is on)
  - `handleMouseDown`, `handleTouchStart` (pointer-down color)
- The Svelte component generates a stable `seed` once per mount via
  `(untrack(() => seedProp) ?? randomSeed()) >>> 0` and reuses it
  across every teardown/rebuild cycle.
- `randomSeed()` returns a fresh 32-bit unsigned int from
  `Math.floor(Math.random() * 2^32)` — used only when no `seed` prop
  was provided.

## Consequences

**Positive:**
- Same seed → same initial splats, regardless of how many times the
  engine is torn down and rebuilt. Resize is visually stable.
- Fully testable: pass a fixed seed and assert on the FBO contents.
- Power users can pin a seed in their app code for screenshot
  regression tests.

**Negative:**
- "Determinism" only holds *before* user input. Once a pointer drag
  starts, the runtime is non-deterministic by design (mouse events are
  unordered with respect to RAF). This is fine — the user contract is
  about initial state, not perpetuity.
- Routing pointer-down color through the seeded RNG means the *N*th
  drag in a fresh tab always picks the same color sequence. Considered
  a feature (reproducible behavior) rather than a bug.

**Rejected alternatives:**
- *Use `Math.random()` and accept fresh splats on resize:* Violates
  the user requirement.
- *Snapshot the FBO contents on resize and copy them into the new
  FBO:* Considered but rejected. Would preserve in-progress
  simulation state across resize, which the user did not ask for, and
  is fragile (different aspect ratios produce stretched fluid).
- *Heavier PRNG (xoroshiro128+, PCG):* Overkill for visual jitter.
  Mulberry32 is deterministic and has good enough statistical
  properties for non-cryptographic visuals.
