# Contributing to svelte-fluid

## Prerequisites

- [bun](https://bun.com) 1.3 or newer. That's it. No npm, no node, no python.

## Local development

```sh
git clone <repo>
cd svelte-fluid
bun install            # populates node_modules + bun.lock
bun run dev            # demo playground at http://localhost:5173
```

The demo at `src/routes/+page.svelte` mounts four `<Fluid />`
instances with intentionally different configs and a fifth one wired
to a control panel. Use it to verify any change interactively.

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
│   │       └── ControlPanel.svelte
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

1. Bump the version in `package.json`.
2. Update the README's changelog or release notes.
3. `bun run prepack` — runs `svelte-package` and `publint`.
4. Inspect the generated `dist/` for sanity.
5. `bun publish` (if applicable).

## Verification checklist

Before opening a PR, run:

```sh
bun run check       # svelte-check, expect 0 errors 0 warnings
bun run package     # produces dist/
bun run build       # builds the demo
```

If you touched anything in `src/lib/engine/`, also do these manual
checks in a real browser:

- [ ] All four demo instances render fluid correctly
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
