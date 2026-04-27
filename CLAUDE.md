# svelte-fluid — Agent Instructions

## Identity

WebGL Navier-Stokes fluid simulation as a Svelte 5 component library.
MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.
Repo: github.com/tommyyzhao/svelte-fluid

## Commands

```sh
bun install              # install deps
bun run dev              # dev server at localhost:5173
bun run test             # vitest (272 tests)
bun run check            # svelte-check (0 errors expected)
bun run prepack          # svelte-package + publint (must pass before publish)
bun run build            # full demo site build
```

Always run `bun run test && bun run check` after any code change.
Run `bun run prepack` before committing to verify publint.

## Architecture invariants — never break these

1. **Engine never imports Svelte.** `FluidEngine` is framework-agnostic.
2. **No module-level mutable GL state.** Each engine instance owns its own context, buffers, programs, FBOs.
3. **gl-utils.ts is stateless.** Every helper takes `gl` as first arg.
4. **shaders.ts is GL-free.** Raw GLSL strings only; compilation happens in the engine.
5. **The Svelte component never touches WebGL directly.** It hands the canvas to the engine.
6. **dispose() does NOT call loseContext().** All resources freed explicitly via gl.delete* calls. The context object is left intact for lazy rebuild.

## setConfig 4-bucket system

When props change at runtime, `engine.setConfig()` classifies each field:

- **Bucket A** (hot scalars): written to `this.config.X`, picked up next frame.
- **Bucket B** (keyword recompile): `shading`, `bloom`, `sunrays`, `reveal`, `distortion` → `updateKeywords()` recompiles the display shader.
- **Bucket C** (FBO rebuild): `simResolution`, `dyeResolution`, `bloomResolution`, `bloomIterations`, `sunraysResolution` → `initFramebuffers()` / `initBloom()` / `initSunrays()`.
- **Bucket D** (construct-only): `seed`, `initialSplatCount*`, `presetSplats` → ignored after construction.

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
- Engine changes require an ADR in `dev-docs/decisions/`.
- No new runtime dependencies.
- Tabs, Prettier formatting.
- Comments explain "why", not "what".

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contributing guide, including
workflows for adding config fields, modifying shaders, and publishing releases.

## Further reading

| Resource | What's there |
|----------|-------------|
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Hard rules, local setup, workflows, verification checklist, code style |
| [`dev-docs/architecture.md`](dev-docs/architecture.md) | System design, module boundaries, ownership diagram, public API surface |
| [`dev-docs/porting-notes.md`](dev-docs/porting-notes.md) | Upstream `script.js` symbol map — read before modifying the engine |
| [`dev-docs/decisions/`](dev-docs/decisions/) | 31 ADRs documenting every major design choice |
| [`dev-docs/learnings/`](dev-docs/learnings/) | Gotchas with symptom/cause/fix — check before debugging |

## Session workflow

- Start: run `/resume-fluid-session`
- End: run `/end-fluid-session`
