# svelte-fluid — Agent Instructions

## Identity

WebGL Navier-Stokes fluid simulation as a Svelte 5 component library.
MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.
Repo: github.com/tommyyzhao/svelte-fluid

## Commands

```sh
bun install              # install deps
bun run dev              # dev server at localhost:5173
bun run test             # vitest (full node suite)
bun run check            # svelte-check (0 errors expected)
bun run prepack          # svelte-package + publint (must pass before publish)
bun run build            # full demo site build
```

Always run `bun run test && bun run check` after any code change.
Run `bun run prepack` before committing to verify publint.

## Architecture invariants — never break these

1. **Engine never imports Svelte.** `FluidEngine` is framework-agnostic.
2. **Module-level mutable GL state lives only in `gl-host.ts`** (ADRs 0088, 0093): one WebGL2 context, program cache and shared quad for model engines and shared-tier `FluidEngine`s. A new `FluidEngine` owns its context while fewer than 8 do (`OWN_CONTEXT_LIMIT`, a slot count, not GL state); later ones go shared. The tier belongs to the canvas: every later engine on it (lazy rebuild) keeps its first tier. A shared-tier engine owns its fields/FBOs/textures/uniforms, does all GL work inside `host.run()`, and binds every piece of state it reads; never assume state a sibling left. WebGL1 / `requireHardwareAcceleration` engines always own their context.
3. **gl-utils.ts is stateless.** Every helper takes `gl` as first arg.
4. **shaders.ts is GL-free.** Raw GLSL strings only; compilation happens in the engine.
5. **The Svelte component never touches WebGL directly.** It hands the canvas to the engine.
6. **Engine dispose() does NOT call loseContext().** All resources freed explicitly via gl.delete* calls. A shared-tier `FluidEngine` frees only its fields and releases its host reference (cached programs stay); its `lazy` scroll-out is dispose-and-release, not loseContext. Own-tier dispose frees its context slot count; `lazy` on own-tier still releases the context with loseContext in `Fluid.svelte`. Narrow exception (ADR 0088): the final shared-host release or failed host construction frees its unowned context slot; never lose a still-shared context.

## setConfig 4-bucket system

When props change at runtime, `engine.setConfig()` classifies each field:

- **Bucket A** (hot scalars): written to `this.config.X`, picked up next frame.
- **Bucket B** (keyword recompile): `shading`, `bloom`, `sunrays`, `toneMapping`, `reveal`, `distortion`, `obstructionColor` presence → `updateKeywords()` recompiles the display shader.
- **Bucket C** (owned FBO transition): `simResolution`, `dyeResolution`, `bloomResolution`, `bloomIterations`, `sunraysResolution` → transition only the owning simulation, dye/scalar, bloom, or sunrays group.
- **Bucket D** (construct-only): `seed`, `initialSplatCount*`, `presetSplats`, `requireHardwareAcceleration` → ignored after construction.

When adding a new prop, decide which bucket it belongs to and wire it accordingly. See [ADR 0005](dev-docs/decisions/0005-hot-update-buckets.md) for rationale.

Special triggers beyond the 4 buckets:
- `containerShape` with `type: 'svgPath'` → mask texture rebuild
- `glass` boolean → sceneFBO alloc/dispose via `initGlassFramebuffer()`
- `sticky`/`stickyMask` → sticky mask texture rebuild
- `distortionImageUrl` → async image load

## Container shapes — adding a new one

Two approaches coexist: **analytical** (SDF in GLSL + TypeScript mirror) and **mask texture** (svgPath, rasterized via OffscreenCanvas). For a new analytical shape:

1. Add the variant to `ContainerShape` union in `types.ts`
2. Add GLSL SDF in `shaders.ts` (inside `containerSDF` function)
3. Add TypeScript SDF mirror in `container-shapes.ts`
4. Update `containerShapeEqual` for the new variant
5. Update `resolveConfig` in `FluidEngine.ts`

See [ADR 0024](dev-docs/decisions/0024-svg-path-container-shape.md) for the mask texture approach.

## Conventions

- Bun only (no npm/yarn for dev). `.npmrc` has `engine-strict=true`.
- Svelte 5 runes only (no Svelte 4 syntax).
- `.js` extensions in all TypeScript imports.
- Engine *decisions* (new algorithm, changed field semantics, stencil/scheme change, lifecycle change) require an ADR in `dev-docs/decisions/`. Mechanical edits (renames, count fixes, one-line guards) are exempt. ADR numbers are claimed at write time (next free = `ls dev-docs/decisions`), never pre-reserved in a plan.
- No new *runtime* dependencies — the `dependencies` map (currently empty; only `dist` ships). devDependencies for test/dev/build infra are unrestricted (`publint`/`prepack` guard `dist`).
- Tabs, Prettier formatting.
- Comments explain "why", not "what".

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contributing guide, including
workflows for adding config fields, modifying shaders, and publishing releases.

## Docs routes (canonical)

The `/docs` site routes are the **canonical documentation**. When you change
the public API (props, types, components, presets), update the corresponding
route as part of the same change — not as a follow-up.

| Route | Content |
|-------|---------|
| `src/routes/docs/+page.svelte` | Getting Started |
| `src/routes/docs/components/+page.svelte` | All 12 components (6 fluid, 6 interface primitives) with props and live examples |
| `src/routes/docs/configuration/+page.svelte` | Full FluidConfig prop reference (70+ props) |
| `src/routes/docs/shapes/+page.svelte` | ContainerShape variants and fields |
| `src/routes/docs/presets/+page.svelte` | All 14 presets (registry-driven tables via `PresetReference`) |
| `src/routes/docs/api/+page.svelte` | FluidHandle imperative API, RGB, PresetSplat |
| `src/routes/for-agents/+page.svelte` | "For Agents" hub linking the generated agent docs |
| `src/routes/agent-docs.ts` | Generates `/llms.txt`, `/llms-full.txt`, `/SKILL.md` from the preset registry |

## Further reading (internal)

| Resource | What's there |
|----------|-------------|
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Hard rules, local setup, workflows, verification checklist, code style |
| [`dev-docs/architecture.md`](dev-docs/architecture.md) | System design, module boundaries, ownership diagram, public API surface |
| [`dev-docs/porting-notes.md`](dev-docs/porting-notes.md) | Upstream `script.js` symbol map — read before modifying the engine |
| [`dev-docs/decisions/`](dev-docs/decisions/) | ADRs documenting every major design choice |
| [`dev-docs/learnings/`](dev-docs/learnings/) | Gotchas with symptom/cause/fix — check before debugging |
