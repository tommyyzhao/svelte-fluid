# svelte-fluid — Claude Code project instructions

## Identity

WebGL Navier-Stokes fluid simulation as a Svelte 5 component library.
MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.
Repo: github.com/tommyyzhao/svelte-fluid

## Commands

```sh
bun install              # install deps
bun run dev              # dev server at localhost:5173
bun run test             # vitest (106 tests)
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

- **Bucket A** (hot scalars): written to `this.config.X`, picked up next frame. Includes all physics scalars, `pointerInput`, `splatOnHover`, `randomSplat*`, `containerShape`.
- **Bucket B** (keyword recompile): `shading`, `bloom`, `sunrays` → `updateKeywords()` recompiles the display shader.
- **Bucket C** (FBO rebuild): `simResolution`, `dyeResolution`, `bloomResolution`, `bloomIterations`, `sunraysResolution` → `initFramebuffers()` / `initBloom()` / `initSunrays()`.
- **Bucket D** (construct-only): `seed`, `initialSplatCount*`, `presetSplats` → ignored after construction.

When adding a new prop, decide which bucket it belongs to and wire it accordingly.

## Container shapes

SDFs are computed per-fragment in GLSL (`shaders.ts`) and mirrored in TypeScript (`container-shapes.ts`) for rejection sampling during random splat spawning. When adding a new shape type:
1. Add the variant to `ContainerShape` union in `types.ts`
2. Add GLSL SDF in `shaders.ts` (inside `containerSDF` function)
3. Add TypeScript SDF mirror in `container-shapes.ts`
4. Update `containerShapeEqual` for the new variant
5. Update `resolveConfig` in `FluidEngine.ts`

## Demo page structure

14 instances across 4 sections, all lazy:
- **Presets** (5): LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora
- **Configuration** (4): Default, Flat+soft, Bold splats, Slow+transparent — all have `splatOnHover`
- **Container shapes** (4): Circle, Frame, Annulus, Rounded frame
- **Playground** (1): interactive with ControlPanel

All grids use `repeat(2, 1fr)`. Presets has 5 cards (2+2+1 is acceptable).

## Conventions

- Bun only (no npm/yarn for dev). `.npmrc` has `engine-strict=true`.
- Svelte 5 runes only (no Svelte 4 syntax).
- `.js` extensions in all TypeScript imports.
- Engine changes require an ADR in `docs/decisions/`.
- No new runtime dependencies.
- Tabs, Prettier formatting.
- Comments explain "why", not "what".

## Session workflow

- Start: run `/resume-fluid-session`
- End: run `/end-fluid-session`
- The living handoff lives at `.claude/handoff.md`
