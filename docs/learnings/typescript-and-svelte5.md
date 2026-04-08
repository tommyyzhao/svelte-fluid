# Learnings — TypeScript and Svelte 5

## TS `node16`/`nodenext` module resolution requires `.js` on every relative import

**Symptom:** `bun run check` errored on every `from './types'` import:

```
Relative import paths need explicit file extensions in ECMAScript imports
when '--moduleResolution' is 'node16' or 'nodenext'. Did you mean
'./types.js'?
```

**Cause:** SvelteKit's library template ships with `moduleResolution: node16`
in `tsconfig.json`. Under that mode, even `.ts` files must be imported
with the `.js` extension because that's what they'll resolve to after
the TypeScript compiler runs.

**Fix:** Append `.js` to every relative import across all files in
`src/lib/engine/`. This was four edits.

**Why this matters:** Don't write `import { X } from './foo'` in a
SvelteKit library — always `import { X } from './foo.js'`. Same goes
for type-only imports: `import type { X } from './foo.js'`.

## Svelte 5 errors on duplicate identifier across `<script module>` and `<script>`

**Symptom:**

```
Duplicate identifier 'FluidHandle'.
```

**Cause:** I had `import type { FluidHandle } from './engine/types.js'`
in both the `<script module>` block (where I used it inside `FluidProps`)
and the regular `<script lang="ts">` block (where I used it for the
exported `handle` constant). The Svelte 5 compiler treats these as the
same scope for type identifiers and complains.

**Fix:** Only import `FluidHandle` in the regular `<script>`. The
`<script module>` block doesn't actually need it because `FluidProps`
extends `FluidConfig`, not `FluidHandle`.

**Why this matters:** `<script module>` and `<script>` share types, so
import each type from exactly one place. If both blocks need the same
type, import it in `<script module>` and re-use it from `<script>`.

## Svelte 5 warns when reading a prop at the script root

**Symptom:**

```
This reference only captures the initial value of `seedProp`. Did you
mean to reference it inside a closure instead?
```

triggered by `const stableSeed = (seedProp ?? randomSeed()) >>> 0`.

**Cause:** In Svelte 5 runes mode, props from `$props()` are reactive
proxies under the hood. Reading `seedProp` at the top of `<script>`
gives you the initial value but Svelte's compiler can't tell whether
that's intentional or a bug.

**Fix:** Wrap with `untrack` to make the intent explicit:

```ts
import { untrack } from 'svelte';
const stableSeed = ((untrack(() => seedProp) ?? randomSeed()) >>> 0) as number;
```

`untrack` reads the prop without subscribing to it.

**Why this matters:** When you intentionally want a "snapshot at mount"
of a reactive value, use `untrack`. Doing it implicitly will get you a
warning at best and a wrong-on-rerender bug at worst. The warning is
your friend.

## Svelte 5 instance exports need to live in plain `<script>`, not `<script module>`

**Symptom:** I initially wanted to put `FluidHandle`-related stuff in
`<script module>`. Setting it up that way means the export becomes a
*module-level* export shared by every instance, not a per-instance
property accessible via `bind:this`.

**Cause:** `<script module>` runs once per *module*, regardless of how
many components are mounted. `<script>` runs once per *component
instance*. Per-instance state (like `engine`) and per-instance methods
(like `handle.splat`) must live in the latter.

**Fix:**

```svelte
<script lang="ts">
  // ...
  export const handle: FluidHandle = {
    splat: (x, y, dx, dy, color) => engine?.splat(x, y, dx, dy, color),
    randomSplats: (count) => engine?.randomSplats(count)
  };
</script>
```

Then a parent does:

```svelte
<Fluid bind:this={ref} />
<button onclick={() => ref?.handle.randomSplats(10)}>Splat</button>
```

**Why this matters:** This is the modern Svelte 5 idiom for exposing
instance methods. The Svelte 4 pattern of `bind:this` returning the
class instance with `$set`/`$on`/`$destroy` is gone — only
`export const`/`export function` from the regular `<script>` shows up
on the `bind:this` reference.

## Importing a `.svelte` file from bun gives you a string, not a function

**Symptom:** During the smoke test:

```
console.log('Fluid:', typeof Fluid);  // → "string"
```

**Cause:** `svelte-package` leaves `.svelte` files in `dist/` as `.svelte`
files (not pre-compiled to JS). When you `import './Fluid.svelte'` from a
runtime that doesn't know how to compile Svelte (like raw bun), the
loader resolves it as text content.

**Fix:** No fix needed — actual Svelte consumers go through Vite or
another Svelte-aware bundler that compiles the `.svelte` file. The smoke
test is only checking that the JS exports load. If you want to test the
component itself, render it via the dev server or a Vitest config with
the Svelte plugin.

**Why this matters:** Don't be alarmed by `typeof Fluid === 'string'` in a
plain Node smoke test. The component is fine; the test environment just
isn't Svelte-aware.

## `$effect` re-runs on every tracked dependency change

**Symptom:** None yet, but a foreseeable issue: `$effect(() => { engine.setConfig(buildConfig()) })`
re-runs every time *any* tracked prop changes.

**Mitigation already in place:** `engine.setConfig` cheaply diffs the
new config against the old one and only does expensive work (recompile,
FBO rebuild) when relevant fields actually change. So even though the
effect fires on every prop change, the expensive paths only fire when
they should.

**Why this matters:** When you have an effect that consolidates many
reactive inputs into one downstream call, push the diffing into the
downstream so the upstream stays simple.
