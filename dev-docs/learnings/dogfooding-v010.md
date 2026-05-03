# Dogfooding svelte-fluid@0.1.0

Date: 2026-04-27

A throwaway Vite + svelte-ts harness was created against the published
`svelte-fluid@0.1.0` tarball (not the local workspace) to walk the
brand-new-developer path: README → install → run.

## What worked

- Tarball installed cleanly. No peer dependency warnings, no audit findings.
- Published exports include all 6 components, all 10 presets, `FluidEngine`,
  RNG helpers, and full type declarations.
- Svelte 5.55, TypeScript 6.0, and Vite 8 all worked against the package.
- All preset, container shape, glass, sticky, reveal, and distortion paths
  rendered from the public package without console errors.
- `new FluidEngine({ canvas, config })` works directly from the public export.

## P1 findings

### npm README hero image was broken on package consumers

The README referenced `static/hero.webp` with a repo-relative path. The
published tarball only contains `README.md`, `LICENSE`, and `dist/**`, so
the image 404s on npmjs.com and any tooling that reads the README from the
package. Fix: use an absolute GitHub raw URL in the README image tag, or
add the asset to the package `files` list.

### Components docs `bind:this` example had wrong type shape

Docs showed `let handle = $state<FluidHandle>()` then `<Fluid bind:this={handle} />`,
which does not match the generated `.d.ts`. The actual exposed shape is
`{ handle: FluidHandle }`. The README and API docs already used the correct
pattern; only the components route was wrong.

## P2 findings

### README preset count contradicted itself

Intro said 10 presets; the Presets section still said "Nine" and omitted
`ToroidalTempest` from the table even though the package exported it.

### Bare `<Fluid />` looks blank in dark first-run layouts

A direct README-style `<Fluid />` settled to nearly black quickly on a
dark page. The imperative `randomSplats(10)` button worked, but splats
were subtle enough that a fresh user could think nothing happened. Presets
and shapes were always visually obvious. Fix direction: pair the minimal
snippet with a more demonstrative second example (non-black `backColor`,
`bloomIntensity={1.2}`, lower `densityDissipation`, or a `presetSplats`
seed) — or open the README with a preset, not the bare component.

### `FluidBackground` composition guidance is thin

`FluidBackground` is a page-level wrapper with a fixed full-viewport canvas
and `pointer-events: none` on slot content. In a tabbed harness it can
visually cover unrelated chrome unless the app manages stacking context.
Docs should frame it as a page wrapper, not a panel widget, and show the
expected z-index composition.

## P3 findings

- A "fresh Vite app" recipe in the README would help non-Svelte developers
  bootstrap before the install snippet.
- Multi-browser smoke testing (in-app browser + Playwright simultaneously)
  reproduced "Too many active WebGL contexts" warnings during rapid preset
  cycling. Single-tab paths did not reproduce. The existing `lazy={true}`
  guidance covers this; no code change needed.

## Lessons for future package releases

1. The published tarball is a different thing from the GitHub repo.
   Anything the README references must either ship in the tarball or use
   an absolute URL that survives npm.
2. Code examples in docs/README must match the generated `.d.ts`, not the
   author's mental model. Verify against `dist/*.d.ts` before publishing.
3. The first visual a user sees from the README must look interesting.
   "Technically working" reads as "broken" if the canvas is black.
4. Dogfooding against the published tarball — not the local workspace —
   is the only way to catch packaging-shaped bugs (missing assets,
   missing exports, wrong `bind:this` shape).
