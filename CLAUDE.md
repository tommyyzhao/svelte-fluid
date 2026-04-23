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

- **Bucket A** (hot scalars): written to `this.config.X`, picked up next frame. Includes all physics scalars, `pointerInput`, `splatOnHover`, `randomSplat*`, `containerShape`, `glassThickness`, `glassRefraction`, `glassReflectivity`, `glassChromatic`, `revealSensitivity`, `revealCurve`.
- **Bucket B** (keyword recompile): `shading`, `bloom`, `sunrays`, `reveal` → `updateKeywords()` recompiles the display shader.
- **Bucket C** (FBO rebuild): `simResolution`, `dyeResolution`, `bloomResolution`, `bloomIterations`, `sunraysResolution` → `initFramebuffers()` / `initBloom()` / `initSunrays()`.
- **Bucket D** (construct-only): `seed`, `initialSplatCount*`, `presetSplats` → ignored after construction.

When adding a new prop, decide which bucket it belongs to and wire it accordingly.

Additionally, `containerShape` with `type: 'svgPath'` triggers a **mask texture rebuild** (re-rasterize + texture re-upload + keyword toggle). This is a separate operation from the 4 buckets above.

The `glass` boolean triggers **sceneFBO alloc/dispose** via `initGlassFramebuffer()`. When glass is on, `drawDisplay` renders to `sceneFBO` (RGBA8, canvas resolution) and a `drawGlass` post-processing pass reads it with refraction + specular.

The `reveal` boolean triggers a **`REVEAL` keyword** in the display shader. When active, the shader outputs `vec4(1.0 - c, alpha)` — inverted dye color with non-premultiplied alpha, matching the Ascend-Fluid reference. This produces iridescent fringes at reveal edges. The advection shader switches to multiplicative dissipation (`result *= dissipation`). `render()` skips backColor, checkerboard, and glass when REVEAL is active. See ADR-0027/0028.

## Container shapes

Two approaches coexist:

**Analytical shapes** (circle, frame, roundedRect, annulus): SDFs are computed per-fragment in GLSL (`shaders.ts`) and mirrored in TypeScript (`container-shapes.ts`) for rejection sampling during random splat spawning. When adding a new analytical shape:
1. Add the variant to `ContainerShape` union in `types.ts`
2. Add GLSL SDF in `shaders.ts` (inside `containerSDF` function)
3. Add TypeScript SDF mirror in `container-shapes.ts`
4. Update `containerShapeEqual` for the new variant
5. Update `resolveConfig` in `FluidEngine.ts`

**SVG path shapes** (`svgPath`): Rasterized to a mask texture via `OffscreenCanvas` + `Path2D` (ADR-0024). Uses a separate `applyMaskTextureProgram` and `CONTAINER_MASK_TEXTURE` keyword. CPU-side mask data is stored in `maskData` for rejection sampling. See `initMaskTexture()` in `FluidEngine.ts`.

## Demo page structure

27 instances across 8 sections:
- **Background** (1): `<FluidBackground>` wrapping the entire page, cursor-only splats
- **Hero title** (2): Fluid-filled "SVELTE" + "FLUID" text (svgPath containers, vigorous random splats)
- **Presets** (5): LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora — all lazy
- **Configuration** (4): Default, Flat+soft, Bold splats, Slow+transparent — all have `splatOnHover`, lazy
- **Container shapes** (6): Circle, Frame, Annulus, Rounded rect, Rounded frame, SVG path — all lazy, `splatOnHover`
- **Container effects** (4): Glass orb, Subtle lens, Glass ring, Diamond frame — all use `glass` prop, lazy
- **Reveal** (4): Scratch-to-reveal, Permanent reveal, Auto-reveal, Soft reveal — all use `<FluidReveal>`
- **Playground** (1): interactive with ControlPanel (includes glass controls)

All grids use `repeat(2, 1fr)`.
Extra routes: `/background-fluid`, `/fluid-reveal/`, `/svelte-fluid`, `/svg`

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
