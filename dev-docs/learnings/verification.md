# Learnings — verification

## Run `bun run check` after every file

**What worked:** After each new module (`types.ts`, `rng.ts`, `shaders.ts`,
`gl-utils.ts`, …) I ran `bun run check` immediately. The first run after
adding `gl-utils.ts` caught all four `.js`-extension errors at once.
Adding `FluidEngine.ts` (1000 lines in one go) compiled cleanly because
all the modules it depended on were already proven correct.

**Lesson:** When porting a large file, build the dependency tree
bottom-up and `check` after each module. The cost of a check is
~milliseconds; the cost of a 1000-line file with cascading errors is
much higher.

## Round-trip-verify any embedded binary data

**What worked:** After programmatically writing the base64 dithering
constant, I re-read the file and re-encoded the source PNG to confirm
they matched byte-for-byte. This caught both the typo and the
truncation that the manual approach left behind.

**Lesson:** "I wrote it, so it must be right" is not a valid assumption
for binary-encoded blobs. Always verify the encoding round-trips.

## SSR-render the demo to confirm component shape

**What worked:** With the dev server running, `curl http://localhost:5191/`
returned a 200 with the rendered HTML. Grepping for
`svelte-fluid-container` confirmed all 6 instances rendered server-side.
The Chrome browser extension wasn't connected during this session, so
this was the only way to verify the component compiles and renders at
all without manual browser interaction.

**Lesson:** SSR is a free smoke test for any SvelteKit component. If
the component throws during SSR, the SSR HTML response will be a 500.
If it renders, you at least know the script and template parse, the
runes work, and `onMount` doesn't run server-side.

## Check the generated `.d.ts` after `bun run package`

**What worked:** Inspecting `dist/Fluid.svelte.d.ts` revealed:

```ts
declare const Fluid: import("svelte").Component<FluidProps, {
    /** Imperative API exposed to parents via `bind:this`. */ handle: FluidHandle;
}, "">;
```

That second generic parameter is the "exports" type — the value you get
back via `bind:this`. Seeing `handle: FluidHandle` there confirmed that
the `export const handle` pattern actually works for downstream
TypeScript consumers, not just at the JS level.

**Lesson:** When you build a typed library, look at the generated
`.d.ts` files. They're the actual contract your users see. If the type
they need isn't there, your runtime code might still "work" but
TypeScript users will yell at you.

## `publint` is the cheapest packaging sanity check

**What worked:** `bun run prepack` runs `publint` automatically.
First-time run after adding the engine reported "All good!", which
confirmed:

- `exports` field is correct
- `types` field points at a real file
- `svelte` condition is set
- `peerDependencies` are declared

**Lesson:** Add `publint` to your `prepack` script (or pre-publish
hook). It catches the boring problems before they reach npm.

## Smoke-test imports from a fresh runtime

**What worked:** After `bun run package`, ran a quick `bun -e` script
that imported `FluidEngine`, `mulberry32`, and `generateColor` from
`./dist/index.js`. Confirmed:

- All exports load (no circular dependency or missing import errors)
- `mulberry32(seed)` returns a function
- `generateColor(rng)` returns a sensible-looking color object

This caught zero bugs but proved the dist actually loads from a runtime
that's *not* the dev server. If something's wrong with the build
output it usually shows up here.

**Lesson:** After packaging, import the package from a separate
process. Don't trust that what works in the dev server works in the
distributable.

## What I didn't have time to do (you should)

These are the verification steps from the plan that need a real
browser to confirm. Run these manually when you have a Chrome window
handy:

1. Drag inside each demo instance — pointer input is isolated to that
   instance only.
2. Resize the browser window — every instance reinitializes with the
   *same* initial splat pattern (proves seed determinism).
3. Tweak the control panel sliders — Bucket A scalars (curl,
   splatRadius) update immediately, Bucket B booleans (shading, bloom,
   sunrays) recompile cleanly, Bucket C dyeResolution causes a brief
   flicker as FBOs rebuild.
4. Click "Random Splats" — `ref.handle.randomSplats(10)` injects 10
   splats into the playground instance.
5. DevTools → Memory → take a snapshot, resize 10 times, take another
   snapshot — engine instance count should not grow.
6. DevTools → Console — should be free of WebGL warnings or unhandled
   promise rejections.
7. DevTools → Performance → record 10s — should be steady at the
   monitor's refresh rate.
