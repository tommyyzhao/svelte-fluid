# ADR 0006: Imperative API via `export const handle` + `bind:this`

**Status:** Accepted
**Date:** 2026-04-06

## Context

Consumers need to trigger `splat` and `randomSplats` from outside the
component (e.g., a "Random Splats" button in a parent). The Svelte 5
runes mode breaks the Svelte 4 pattern where `bind:this` returned a
class instance with all instance properties on it: in runes mode,
properties are *not* accessible from `bind:this` references.

The user explicitly limited the imperative API to `splat` and
`randomSplats`. Pause/resume, reset, and screenshot are out of scope.

## Decision

Define the API shape as a `FluidHandle` interface in
`engine/types.ts`:

```ts
export interface FluidHandle {
  splat(x: number, y: number, dx: number, dy: number, color: RGB): void;
  randomSplats(count: number): void;
}
```

In `Fluid.svelte`'s plain `<script lang="ts">` block (NOT
`<script module>`), declare:

```ts
export const handle: FluidHandle = {
  splat: (x, y, dx, dy, color) => engine?.splat(x, y, dx, dy, color),
  randomSplats: (count) => engine?.randomSplats(count)
};
```

Consumers use it via:

```svelte
<Fluid bind:this={ref} />
<button onclick={() => ref?.handle.randomSplats(10)}>Splat</button>
```

## Consequences

**Positive:**
- Works in Svelte 5 runes mode (verified — see the generated
  `dist/Fluid.svelte.d.ts`, which exposes `handle: FluidHandle` in
  the `Component` exports generic).
- The handle is type-safe — TypeScript users get autocomplete and
  errors on misuse.
- The handle is null-safe — methods are no-ops if `engine` is
  `undefined` (e.g., during the initial mount race or after dispose).
- The same `FluidHandle` type doubles as a documentation contract
  for consumers.

**Negative:**
- Slight indirection — consumers call `ref.handle.randomSplats(10)`
  rather than `ref.randomSplats(10)`. Could be eliminated by
  spreading the methods directly as top-level exports, but grouping
  under a `handle` namespace makes the imperative surface visually
  obvious in calling code.

**Rejected alternatives:**
- *`$bindable()` prop pattern:* `let { handle = $bindable() } = $props()`.
  Awkward because the component needs to *create* the handle, not
  receive one. Would force consumers to declare a `let` variable
  just to pass it in and read it back.
- *Exporting individual methods (`export function splat(...)`,
  `export function randomSplats(...)`):* Works, but pollutes the
  bind:this reference with everything at the top level. Grouping
  under `handle` is cleaner.
- *Custom event dispatchers (`createEventDispatcher`):* Wrong
  direction — events are for "child notifies parent", not "parent
  invokes child".
