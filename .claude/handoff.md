# Session Handoff — 2026-04-17

## Project

svelte-fluid — WebGL Navier-Stokes fluid simulation as a Svelte 5 component library. MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.

Repo: github.com/tommyyzhao/svelte-fluid · Branch: main · Latest commit: 330ed53

## Current state

- 126 tests, all passing. 0 type errors. Build + publint clean.
- 9 presets: LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora, CircularFluid, FrameFluid, AnnularFluid, SvgPathFluid
- 5 container shapes: circle, frame (with inner+outer rounding), roundedRect, annulus, svgPath (mask texture)
- 25 ADRs, 6 learning docs, architecture.md, porting-notes.md, contributing.md
- 15 demo instances on the demo page (5 presets + 4 config + 5 shapes + 1 playground)
- 2 extra routes: `/svelte-fluid` (fluid-filled text demo), `/svg` (SVG path test cases)
- Docs are open-source ready. No internal handoff files in the repo.
- CI runs tests + type-check + publint + build on every push.
- GitHub Pages auto-deploys the demo site.

## What this session built

1. **SVG path container shapes** (ADR-0024): new `{ type: 'svgPath' }` variant for `ContainerShape` that confines fluid to arbitrary shapes via mask texture rasterization. Uses `OffscreenCanvas` + `Path2D` for SVG paths, or `ctx.fillText()` for text mode.
2. **Text mode**: `text` + `font` fields on svgPath type render text directly via Canvas 2D without needing SVG path data. Auto-scales via `measureText`.
3. **Aspect-ratio-correct mask rasterization**: mask texture now rasterized at the canvas's actual aspect ratio (not always square), fixing vertical squish on non-square canvases.
4. **SvgPathFluid preset**: star shape with colorful splats and random splat maintenance.
5. **`/svelte-fluid` route**: "SVELTE FLUID" as fluid-filled text with `splatOnHover` interaction.
6. **`/svg` test route**: 4 SVG path test cases (star, heart, rect, evenodd).
7. **20 new tests**: svgPath equality, CPU mask sampling, maskAreaFraction (126 total).
8. **hdrMultiplier aspect correction**: circle/annulus `pi*r^2` now divided by aspect ratio.
9. **Bloom suppress unconditional**: small canvas guard (<600px) applies even when preset explicitly sets `bloom={true}`.
10. **buildSnippet completeness**: added `randomSplat*`, `initialDensity*`, `splatOnHover` fields to playground snippet generator.
11. **ShapePreview inset**: 3px translate+scale `<g>` wrapper prevents outer boundary clipping at canvas edge.
12. **Architecture simplification**: eliminated separate `applyMaskTextureProgram` — SVG path uses existing `applyMaskProgram` with `uShapeType==4` branch and `CONTAINER_MASK` keyword.

## Key files

| File | Role |
|------|------|
| src/lib/engine/FluidEngine.ts (~1500 LOC) | The engine: WebGL state, physics step, render, dispose, mask texture, splatOnHover |
| src/lib/Fluid.svelte (~395 LOC) | Svelte wrapper: DOM, ResizeObserver, adaptive resolution, lazy/autoPause |
| src/lib/engine/gl-utils.ts | WebGL utilities: Material class, FBO create/resize/dispose, shader compile |
| src/lib/engine/shaders.ts | All GLSL shader source strings (22 shaders + type 4 mask branches) |
| src/lib/engine/types.ts | FluidConfig (incl. svgPath), ContainerShape (5 variants), FluidHandle |
| src/lib/engine/container-shapes.ts | TypeScript SDF mirrors, MaskContext, containerMask(), maskAreaFraction() |
| src/lib/presets/*.svelte (9 files) | Preset wrapper components (incl. SvgPathFluid) |
| src/routes/+page.svelte | Demo page with 15 instances |
| src/routes/svelte-fluid/+page.svelte | Fluid-filled "SVELTE FLUID" text demo |
| src/routes/svg/+page.svelte | SVG path test cases |
| src/routes/components/ControlPanel.svelte | Playground control panel with buildSnippet |
| docs/architecture.md | Start here for understanding the system |
| docs/decisions/README.md | Index of 25 ADRs |

## What needs attention next

### Planned features (from user)

1. **Glass refraction/reflection layer.** A post-processing pass that simulates a glass container over the fluid with realistic lighting:
   - Implementation approach: a fragment shader pass that runs after `drawDisplay`, sampling the fluid output as the "background" and applying Fresnel-based reflection + refraction distortion from a normal map derived from the container SDF gradient.
   - For analytical shapes, SDF gradient is trivially computable. For svgPath, derive normals from the mask texture gradient (finite differences on the mask).
   - Parameters: `glassEnabled: boolean`, `glassThickness`, `glassRefractiveIndex` (IOR), `glassReflectivity`, `glassTint: RGB`.
   - Could add specular highlights based on a configurable light position.
   - Pure rendering addition — no physics changes. The glass pass would be an additional `blit` call after `drawDisplay`.
   - Key files to modify: `shaders.ts` (new glass shader), `FluidEngine.ts` (new pass in `render()`), `types.ts` (new config fields).
   - Bucket: B (keyword recompile via a `GLASS` keyword on the display material, or a separate glass material).
   - ADR needed.

### Known issues

2. **npm publish** — package is ready. Run `npm publish --access public --provenance`.
3. **Black void between sections on demo** — lazy canvases tear down to black against black page background. A placeholder/skeleton for torn-down cards would fix this.
4. **Hero GIF quality** — current is 5 frames / 1.8MB. Consider re-recording with more frames or converting to WebM.
5. **WebGL context limit on /svg route** — 4 simultaneous svgPath instances + dev tools contexts can hit the browser's ~16 context limit, causing silent failures. Consider using lazy loading or reducing test instances.

### Follow-ups

6. **Test gaps** — no WebGL context loss tests, no engine unit tests, no splat/disposal tests. Tests only cover FluidHandle interface shape and container-shape geometry.
7. **Consider changesets** for automated CHANGELOG + GitHub Releases.
8. **Playground shape preview UX** — svgPath shapes have no ShapePreview overlay (only analytical shapes do).
9. **Playground svgPath support** — ControlPanel doesn't have UI for configuring svgPath container shapes.
10. **SDF texture upgrade** — for higher-quality boundaries on complex SVG paths, could generate an SDF texture via Felzenszwalb EDT (`bitmap-sdf` npm package) or GPU Jump Flood Algorithm instead of binary mask + LINEAR filtering. Would also enable distance-based effects for the glass layer.

## Lessons learned this session

- **Separate shader programs are fragile.** When we initially created a separate `applyMaskTextureProgram`, removing the shader export from `shaders.ts` without removing the compile call in `FluidEngine.ts` caused `compileShader(gl, gl.FRAGMENT_SHADER, undefined)` — a silent crash caught by the `try/catch` in `Fluid.svelte`. Always prefer extending existing shaders with new branches over creating separate programs.
- **The `Fluid.svelte` try/catch swallows engine construction errors silently.** This made debugging extremely difficult — black canvases with no console errors. Consider logging caught errors in dev mode.
- **The `CONTAINER_MASK_TEXTURE` keyword approach failed mysteriously** — the keyword was correctly pushed but the shader block never executed. Root cause was never fully diagnosed (may have been the undefined shader crash masking it). Reusing the existing `CONTAINER_MASK` keyword with a new `uShapeType == 4` branch worked immediately.
- **Mask texture must match canvas aspect ratio.** A square mask on a non-square canvas stretches the shape. Fix: rasterize at `(baseDim, baseDim/aspect)` or `(baseDim*aspect, baseDim)` based on which dimension is larger.
- **Y-axis convention for mask textures:** Canvas2D is Y-down, WebGL textures are Y-up (row 0 = bottom without UNPACK_FLIP_Y). Rasterize in Canvas2D native coords (no flip), sample in GLSL at `vec2(vUv.x, 1.0 - vUv.y)`, and in CPU at `py = (1 - uvY) * (height - 1)`.
- **OffscreenCanvas supports fillText** — no need for SVG path data for text shapes. `measureText` + `setTransform` for auto-scaling works well.
- **Browser WebGL context limit (~16 per page)** causes silent failures when too many Fluid instances exist. The `lazy` prop and IntersectionObserver mitigate this but dev/test routes with many instances can still hit it.

## Architecture quick-reference

- Engine is per-instance, no module-level mutable state. Each canvas gets its own WebGL context.
- Fluid.svelte applies adaptive resolution in instantiate() before constructing the engine — caps textures to canvas pixel size, suppresses expensive effects on small canvases.
- Resize: teardown immediately (blank canvas), debounce rebuild by 150ms.
- setConfig() has 4 buckets: A (scalars incl. splatOnHover, picked up next frame), B (keyword recompile), C (FBO rebuild), D (construct-only). Additionally, svgPath shape changes trigger mask texture rebuild (initMaskTexture + updateKeywords).
- Container shapes: two approaches coexist:
  - **Analytical** (circle/frame/roundedRect/annulus): SDF computed per-fragment in shaders, mirrored in TypeScript for rejection sampling.
  - **Mask texture** (svgPath): rasterized via OffscreenCanvas at canvas aspect ratio, uploaded as R8/LUMINANCE texture, sampled in applyMaskShader type 4 and display shader type 4 branches.
- Both analytical and svgPath use the same CONTAINER_MASK keyword for display shader compilation.
- Material class caches compiled shader variants by sorted keyword string key.
- Context loss/restore: handled via webglcontextlost/webglcontextrestored events. dispose() does NOT call loseContext() — all resources freed explicitly.
- `splatOnHover`: handleMouseMove auto-inits pointer on first hover when SPLAT_ON_HOVER is true, handleMouseLeave resets pointer on exit.
- Demo page: 15 instances (5 presets + 4 config w/ splatOnHover + 5 shapes + 1 playground), all lazy.
