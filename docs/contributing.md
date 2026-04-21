# Contributing to svelte-fluid

Welcome! Thanks for taking the time to contribute. This guide covers
the toolchain, the architectural rules, the common workflows, and how
to file useful issues.

If you're considering anything more than a typo fix or a tuning
tweak, please open a discussion or issue first so we can align on
direction before you write code.

## Prerequisites

- [bun](https://bun.com) 1.3 or newer. That's it. No npm, no node, no python.

## Hard rules

These are non-negotiable. They exist because previous violations
caused real bugs (see `docs/learnings/`).

1. **bun and uv only.** No npm, no pnpm, no yarn, no `node` invocations
   in scripts, no `python3` / `pip`. Helper one-shots use `bun -e`.
   See [ADR 0001](./decisions/0001-bun-and-uv-only-tooling.md).
2. **Svelte 5 runes only.** Use `$props`, `$state`, `$derived`,
   `$effect`, `$bindable`, `untrack`. Never `export let`, never `$:`,
   never Svelte 4 stores. The whole component model is built around
   the runes API.
3. **`.js` extensions on every relative TypeScript import.** This
   project uses `moduleResolution: NodeNext` which requires explicit
   extensions: write `import { X } from './foo.js'` even when `foo`
   is `foo.ts`. The single most common contribution footgun — see
   `docs/learnings/typescript-and-svelte5.md`.
4. **Engine changes require an ADR.** If your change touches anything
   in `src/lib/engine/` beyond a tuning value or a comment, write a
   new ADR in `docs/decisions/` first explaining the *why*. Use the
   existing ADRs as a template. ADR 0015 (preset components) and
   ADR 0016 (burn-in dissipation) are the most recent precedents.
5. **No new runtime dependencies.** The peer dep on `svelte ^5` is
   the only allowed runtime dep. Devtime additions are fine but flag
   them in the PR.

## Local development

```sh
git clone <repo>
cd svelte-fluid
bun install            # populates node_modules + bun.lock
bun run dev            # demo playground at http://localhost:5173
```

The demo at `src/routes/+page.svelte` mounts 21 `<Fluid />` instances:
two hero title cards, five preset cards, four configuration cards, five
container-shape cards, four container-effect cards (glass), and a
playground canvas wired to a live control panel. Use it to verify any
change interactively.

## Repository layout

```
svelte-fluid/
├── src/
│   ├── lib/                       ← the publishable library (becomes dist/)
│   │   ├── Fluid.svelte           ← thin Svelte 5 wrapper
│   │   ├── index.ts               ← public re-exports
│   │   └── engine/                ← framework-agnostic engine
│   │       ├── FluidEngine.ts     ← the class
│   │       ├── shaders.ts         ← 22 GLSL source strings
│   │       ├── gl-utils.ts        ← compileShader, FBO helpers, blit, ...
│   │       ├── dithering.ts       ← inlined LDR_LLL1_0.png
│   │       ├── rng.ts             ← mulberry32 + color helpers
│   │       ├── pointer.ts         ← Pointer type + update helpers
│   │       └── types.ts           ← FluidConfig, ResolvedConfig, FluidHandle, ...
│   ├── routes/                    ← SvelteKit demo app
│   │   ├── +layout.svelte
│   │   ├── +page.svelte
│   │   └── components/
│   │       ├── Card.svelte
│   │       ├── ControlPanel.svelte
│   │       └── ShapePreview.svelte
│   ├── app.html
│   └── app.d.ts
├── docs/                          ← contributor docs (you are here)
├── README.md                      ← user-facing docs
├── LICENSE                        ← dual MIT
├── package.json
├── svelte.config.js
├── tsconfig.json
└── vite.config.ts
```

## Common workflows

### Add a new config field

1. Add the field to `FluidConfig` in `src/lib/engine/types.ts` (camelCase).
2. Add the field to `ResolvedConfig` in the same file (SCREAMING_CASE).
3. Add a default value in `DEFAULTS` in `FluidEngine.ts`.
4. Add a line in `resolveConfig` mapping the camelCase prop to the
   SCREAMING_CASE internal name.
5. Decide which **bucket** the field belongs to (see
   [ADR 0005](./decisions/0005-hot-update-buckets.md)) and update
   `FluidEngine.setConfig` if needed.
6. Add the prop to the destructure in `Fluid.svelte` and to the
   `buildConfig()` return.
7. Add a row to the prop table in `README.md`.
8. Run `bun run check` and `bun run dev`.

### Modify a shader

1. Edit `src/lib/engine/shaders.ts`. Each shader is a tagged template
   string — keep the same precision qualifiers and varyings as the
   original or things will break.
2. Run `bun run dev` and verify the demo still renders.
3. Read [`docs/porting-notes.md`](./porting-notes.md) before changing
   anything if you haven't already.

### Touch the engine

1. Read [`docs/architecture.md`](./architecture.md) and
   [`docs/porting-notes.md`](./porting-notes.md).
2. Make changes incrementally and run `bun run check` after each one.
3. Verify the demo (especially the controls instance) still behaves
   correctly across all four hot-update buckets.
4. Verify `bun run package` produces a clean `dist/`.

### Publish a release

1. Bump the version in `package.json` following semver:
   - **patch** — bug fixes, doc fixes, internal refactors
   - **minor** — new presets, new props, additive engine features
   - **major** — breaking API changes (renaming props, removing
     exports, changing default behavior in a user-visible way)
2. Add a new entry at the top of `CHANGELOG.md` with the version,
   the date, and a short list of changes grouped by **Added**,
   **Changed**, **Fixed**, **Removed**.
3. `bun run check` — must be 0 errors, 0 warnings.
4. `bun run prepack` — runs `svelte-package` and `publint`. publint
   must report `All good!`.
5. Inspect the generated `dist/` for sanity (all 6 presets present,
   .d.ts files present, no stray files).
6. `bun publish` (if applicable).
7. Tag the release: `git tag v<version>` and `git push --tags`.

## Verification checklist

Before opening a PR, run:

```sh
bun run check       # svelte-check, expect 0 errors 0 warnings
bun run package     # produces dist/
bun run build       # builds the demo
```

If you touched anything in `src/lib/engine/`, also do these manual
checks in a real browser:

- [ ] All 21 demo instances render fluid correctly
- [ ] Drag inside each instance — pointer input is isolated
- [ ] Resize the browser window — every instance reinits with the
  same initial splat pattern
- [ ] Control panel sliders work for the playground instance
- [ ] DevTools console has no WebGL warnings or errors
- [ ] DevTools Memory snapshot doesn't grow after multiple resizes

## Code style

- TypeScript, strict mode. No `any` unless strictly necessary.
- Tabs for indentation (matches the SvelteKit scaffold).
- Prettier handles formatting (run with `bunx prettier --write .`).
- Comments explain *why*, not *what*. The shader code does enough
  *what*.
- Keep ports of `script.js` mechanical — see
  [`docs/porting-notes.md`](./porting-notes.md) for the symbol map.

## Filing issues

Useful information:

- Browser + version
- Whether `gl.getExtension('OES_texture_float_linear')` returns null
  (visible in DevTools console)
- Approximate number of `<Fluid />` instances on the page
- Whether the issue reproduces on the demo at localhost:5173
