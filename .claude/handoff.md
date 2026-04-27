# Session Handoff — 2026-04-27 (session 24)

## Project

svelte-fluid — WebGL Navier-Stokes fluid simulation as a Svelte 5 component library. MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.

Repo: github.com/tommyyzhao/svelte-fluid · Branch: main · Latest commit: 2ffb4a1

## Current state

- 276 tests, all passing. 0 type errors. Build + publint clean.
- 10 presets: LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora, ToroidalTempest, CircularFluid, FrameFluid, AnnularFluid, SvgPathFluid
- 6 components: Fluid, FluidBackground, FluidReveal, FluidDistortion, FluidStick, FluidText
- 5 container shapes: circle, frame, roundedRect, annulus, svgPath (mask texture)
- Glass post-processing: hemisphere dome (circles) and rim model (all others)
- 6 docs pages at `/docs` (canonical): Getting Started, Components, Configuration, Shapes, Presets, API Reference
- SKILLS.md route at `/skills.md` (LLM-friendly API reference)
- CopyPageButton component on 4 pages (main demo, background-fluid, fluid-reveal, svelte-fluid)
- 31 ADRs, 6 learning docs (incl. new "uniform must be set" entry), architecture.md, porting-notes.md, contributing.md
- ~38 demo instances on the main page
- Playground with 4-tab mode toggle (Fluid/Reveal/Sticky/Distortion)
- Internal docs at `dev-docs/` (not consumer-visible)
- CI runs tests + type-check + publint + build on every push. GitHub Pages auto-deploys.
- @changesets/cli configured for automated CHANGELOG + npm publish + GitHub releases.
- Session skills treat docs routes as canonical — end-fluid-session requires updating them inline with API changes.

## What this session built

1. **Frame/roundedRect border-radius aspect correction** — rounded corners on frame and roundedRect container shapes now appear circular in physical space (like CSS border-radius). Applied `* uContainerAspect` to all rounded-box SDF computations in display shader, applyMask shader, glass shader (7 GLSL sites), and TypeScript mirrors (`frameMask`, `roundedRectSDF`). Fixed missing `uContainerAspect`/`uAspect` uniform for frame and roundedRect in `FluidEngine.ts` (both `setContainerShapeUniforms` and `applyMask`). 4 new tests (276 total).

2. **Docs site** — 6-page Mintlify-inspired documentation at `/docs` with dark-theme sidebar navigation. Layout at `src/routes/docs/+layout.svelte`, responsive (sidebar collapses on mobile). Pages: Getting Started (`+page.svelte`), Components, Configuration (full 70+ prop reference in 12 sections), Container Shapes (all 5 types with field tables), Presets (all 10 with pinned prop tables), API Reference (FluidHandle, RGB, PresetSplat, FluidEngine).

3. **SKILLS.md route** — LLM-friendly API reference at `/skills.md` (628 lines). All components, props, shapes, presets, types, and usage examples in a single `<pre>` block.

4. **CopyPageButton component** — `src/routes/components/CopyPageButton.svelte`. Copies page content as clean markdown to clipboard. Accepts optional `content` prop or falls back to DOM extraction. Integrated into main demo, background-fluid, fluid-reveal, and svelte-fluid pages.

5. **Dead link fixes** — header nav "Docs" link changed from deleted `github.com/.../docs` to `/docs`. "Contribute" link updated to root `CONTRIBUTING.md`. Same fixes in the pageMarkdown copy-page content.

6. **Session skills + CLAUDE.md updates** — `end-fluid-session` now has a docs routes table (step 3) requiring inline updates when API changes. `CLAUDE.md` gained "Docs routes (canonical)" section. Test count updated 272→276.

7. **Learning doc** — added "New shader uniforms must be set in every engine code path" entry to `dev-docs/learnings/webgl-refactoring.md`. Documents the uContainerAspect/HMR failure mode.

## Key files

| File | Role |
|------|------|
| src/lib/engine/FluidEngine.ts (~1810 LOC) | The engine: WebGL state, physics step, render, dispose, mask texture, glass pass, reveal path, distortion path, sticky mask, fallback texture, pointerTarget listener management. |
| src/lib/engine/shaders.ts | All GLSL: advection, pressure, splat, display (REVEAL/DISTORTION branches), glass, container mask. Aspect-corrected rounded-box SDF. |
| src/lib/engine/types.ts | FluidConfig, ResolvedConfig, ContainerShape, FluidHandle |
| src/lib/engine/gl-utils.ts | WebGL utilities: Material class (keyword shader variants), FBO create/resize/dispose |
| src/lib/engine/container-shapes.ts | TypeScript SDF mirrors, containerMask, containerShapeEqual. Aspect-corrected frameMask/roundedRectSDF. |
| src/lib/Fluid.svelte (~445 LOC) | Svelte wrapper: DOM, ResizeObserver, adaptive resolution, lazy/autoPause. |
| src/lib/FluidText.svelte (~105 LOC) | Fluid inside text letterforms: auto-aspect-ratio from measureText(). |
| src/lib/FluidReveal.svelte (~310 LOC) | Fluid as opacity mask: coverColor/fringeColor/accentColor, pixel-based pointer velocity. |
| src/lib/FluidStick.svelte (~260 LOC) | Fluid as sticky text/path: auto-animate Lissajous, container-sized velocity scaling. |
| src/lib/FluidDistortion.svelte (~290 LOC) | Fluid as image distortion: bleed canvas, pixel-based pointer velocity, initial chaos splats. |
| src/lib/FluidBackground.svelte (~200 LOC) | Full-viewport fluid: DOM exclusion via CSS selector, pointerTarget='window'. |
| src/routes/docs/+layout.svelte | Docs sidebar layout: 6-page nav, responsive, Mintlify-inspired dark theme. |
| src/routes/docs/configuration/+page.svelte | Full FluidConfig prop reference (70+ props in 12 sections + hot-update buckets). |
| src/routes/+page.svelte (~2230 LOC) | Demo page: ~38 instances, FluidText hero, 4-tab playground, CopyPageButton. |
| src/routes/components/CopyPageButton.svelte | Reusable "Copy page" button: explicit content or DOM extraction. |

## What needs attention next

### Planned features (from user)

1. **npm publish** — package is ready. Run `npm publish --access public --provenance`. Create GitHub release with tag `v0.1.0`. Do a final review of all prep first.
2. **"Prod dev" testing** — comprehensive manual testing of the deployed site before publish.

### Known issues

1. **~38 demo instances + background** — exceeds browser's ~16 WebGL context limit. Lazy teardown helps but fast scrolling can briefly exceed the cap.
2. **FluidReveal/FluidDistortion/FluidStick pointer-events** — canvas sits above content; interactive elements can't receive clicks. Documented as intentional in JSDoc.
3. **Stale `/fluid-reveal/` route** — cosmetically stale but functional.
4. **Vite HMR for engine** — fundamental limitation of stateful WebGL, not fixable. Shader source hot-reloads but engine constructor doesn't re-run. Documented in learnings.

### Follow-ups

1. **Named glass presets** — `glass="crystal"`, `glass="frosted"`, `glass="orb"`.
2. **FluidReveal/Distortion/Stick interactive content** — proper event forwarding.
3. **Video/canvas as distortion source** — per-frame texture updates.
4. **Additional test gaps** — FluidText aspect ratio, pointerTarget switching, distortion fallback texture.
5. **Docs route generation** — Configuration and API pages are currently hardcoded. Could be auto-generated from types.ts at build time to prevent drift.

## Architecture quick-reference

- Engine is per-instance, no module-level mutable state. Each canvas gets its own WebGL context.
- Fluid.svelte applies adaptive resolution in instantiate() before constructing the engine.
- Resize: teardown immediately (blank canvas), debounce rebuild by 150ms.
- Lazy teardown: dispose engine + loseContext() (releases browser context slot). Rebuild: restoreContext() + wait for webglcontextrestored event + create new engine.
- setConfig() has 4 buckets: A (scalars — picked up next frame), B (keyword recompile — shading, bloom, sunrays, reveal, distortion), C (FBO rebuild — resolutions), D (construct-only — seed, initialSplatCount, presetSplats).
- Special triggers: svgPath shape → mask rebuild, glass toggle → sceneFBO alloc/dispose, sticky/stickyMask → sticky mask rebuild, distortionImageUrl → async image load, pointerTarget change → listener reinstall.
- Container shapes: analytical (SDF in GLSL + TypeScript mirror, aspect-corrected for rounded corners) and mask texture (svgPath, rasterized via OffscreenCanvas).
- `openBoundary` changes container semantics: `true` = visual crop (applyMask skipped), `false` = physical wall.
- Reveal mode: REVEAL keyword, multiplicative dissipation, smoothstep sharpening, two-tone fringe.
- Distortion mode: DISTORTION keyword, 1×1 white fallback texture until real image loads.
- Pointer events: `pointerTarget='canvas'` (default) attaches to canvas element; `'window'` attaches to window with passive touch listeners.
- FluidText: measures text via OffscreenCanvas.measureText(), sets aspect-ratio on container div.
- Texture unit budget: 0=dye, 1=bloom, 2=dithering, 3=sunrays, 4=containerMask, 5=distortionTexture, 6=velocity(distortion), 7=stickyMask.
- Context loss/restore: handled via events. dispose() does NOT call loseContext(). Distortion fallback texture recreated on restore.
- Docs routes at `/docs` are canonical documentation — updated inline with API changes per end-fluid-session step 3.
