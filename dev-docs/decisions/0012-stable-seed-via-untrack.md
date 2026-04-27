# ADR 0012: Stable seed const via `untrack`, never `$state`

**Status:** Accepted
**Date:** 2026-04-06

## Context

The component must use the same seed for every teardown/rebuild cycle
(see [ADR 0003](./0003-seedable-prng-determinism.md)). Three places to
get a seed from:

1. The `seed` prop (if provided)
2. A freshly-generated `randomSeed()` (if not)
3. A previous mount (no — every mount is independent)

The seed must NOT change after mount. If it changed mid-life, every
hot prop update would generate different initial splats and the
"deterministic resize" guarantee would silently break.

## Decision

In `Fluid.svelte`'s `<script>`:

```ts
import { untrack } from 'svelte';
const stableSeed = ((untrack(() => seedProp) ?? randomSeed()) >>> 0) as number;
```

Three deliberate choices here:

1. **`const`, not `$state`.** A `$state` value would be reactive and
   would update if the parent passed a different seed prop later.
   We don't want that.
2. **`untrack(() => seedProp)`.** Reads the prop value once without
   subscribing. Without this, the Svelte 5 compiler emits a
   `state_referenced_locally` warning because reading a `$props()`
   value at the script root looks like a footgun.
3. **`>>> 0`.** Coerces to an unsigned 32-bit integer (mulberry32
   expects one). If the consumer passes a negative or non-integer
   `seed`, we still get a valid seed value.

## Consequences

**Positive:**
- The seed is fixed for the lifetime of the component instance.
- Resizes use the same seed; hot prop updates use the same seed.
- A user changing the `seed` prop after mount has no effect — they
  would need to remount the component (e.g., via a `{#key seed}`
  block in their parent) to apply a new seed.
- TypeScript and the Svelte compiler are both happy.

**Negative:**
- The "remount to change seed" semantics are slightly surprising.
  Documented in the README and the prop's JSDoc comment.

**Rejected alternatives:**
- *`let stableSeed = $state(...)`:* Becomes reactive — every prop
  change would re-evaluate and potentially change the seed mid-life.
- *Direct prop read at script root (no `untrack`):* Triggers the
  Svelte 5 `state_referenced_locally` warning. Even if we ignore the
  warning, future Svelte versions might tighten the rule.
- *Stash the seed in `$state` and re-read inside an `$effect.pre`
  on mount:* More machinery for the same outcome. Not worth it.
