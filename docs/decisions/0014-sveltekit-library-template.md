# ADR 0014: SvelteKit library template + demo routes (single repo)

**Status:** Accepted
**Date:** 2026-04-06

## Context

A Svelte 5 component library needs:

1. A way to package and publish reusable components and types
2. A way to develop and visually test those components
3. A way to publish prebuilt assets to npm

SvelteKit's `--template library` covers all three: `src/lib/` is the
publishable surface (processed by `@sveltejs/package`), `src/routes/`
is a SvelteKit app that doubles as a demo / playground, and the same
`package.json` handles both.

The alternatives are a monorepo with separate packages for the library
and the demo, or a library-only package with the demo published
elsewhere.

## Decision

Single SvelteKit project scaffolded with:

```sh
bunx sv@latest create svelte-fluid --template library --types ts --install bun --no-add-ons
```

- `src/lib/` — the publishable library
  - `Fluid.svelte` — the component
  - `engine/*.ts` — the framework-agnostic engine modules
  - `index.ts` — re-exports
- `src/routes/` — a SvelteKit demo app
  - `+layout.svelte` — global CSS reset
  - `+page.svelte` — multi-instance playground with controls
  - `components/Card.svelte`, `components/ControlPanel.svelte` — demo helpers
- `package.json` — single source of truth for both, with:
  - `bun run dev` → demo at localhost:5173
  - `bun run package` → builds `dist/` from `src/lib/`
  - `bun run build` → builds the SvelteKit demo as a static site
  - `bun run prepack` → `package` + `publint` (sanity check before publish)

## Consequences

**Positive:**
- One repo, one `package.json`, one lockfile.
- Demo site is the playground. Visiting localhost:5173 in dev mode
  is the fastest possible feedback loop for changes to the library.
- `@sveltejs/package` handles the dist/ generation, including
  `.d.ts` emission, automatically — no manual rollup config.
- `publint` runs as part of `prepack` and catches `exports`-field
  mistakes before publish.

**Negative:**
- The demo and the library share dev dependencies in `package.json`.
  Mostly fine; the only "weird" deps are `@sveltejs/adapter-auto`
  (only used by the demo) and `publint` (only used by prepack).
- Consumers who clone the repo to develop locally pull down the
  full SvelteKit toolchain even if they only want to fix the engine.

**Rejected alternatives:**
- *Monorepo (bun workspaces with separate `packages/svelte-fluid/`
  and `apps/demo/`):* Considered. More flexibility but significantly
  more setup. The single-package layout is the canonical
  SvelteKit-recommended approach for libraries.
- *Library only, no demo:* Smallest footprint but no playground for
  manual testing. Defeats the "fast feedback loop" benefit.
- *Storybook:* Heavyweight for a one-component library. The
  `+page.svelte` playground covers all our needs.
