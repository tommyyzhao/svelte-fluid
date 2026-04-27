# Session Handoff — 2026-04-26 (session 23)

## Project

svelte-fluid — WebGL Navier-Stokes fluid simulation as a Svelte 5 component library. MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.

Repo: github.com/tommyyzhao/svelte-fluid · Branch: main · Latest commit: 5868c75

## Current state

- 272 tests, all passing. 0 type errors. Build + publint clean.
- 10 presets: LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora, ToroidalTempest, CircularFluid, FrameFluid, AnnularFluid, SvgPathFluid
- 6 components: Fluid, FluidBackground, FluidReveal, FluidDistortion, FluidStick, FluidText
- 5 container shapes: circle, frame, roundedRect, annulus, svgPath (mask texture)
- Glass post-processing: hemisphere dome (circles) and rim model (all others)
- FluidReveal: smoothstep-sharpened reveal with two-tone fringe, multiplicative dissipation
- FluidDistortion: velocity-driven image warping with bleed, initial chaos, auto-distort, fallback texture
- FluidStick: physics-level dye sticking via mask texture
- FluidText: fluid confined inside text letterforms, auto-computed aspect ratio from measureText()
- FluidBackground: full-viewport fluid with DOM exclusion zones, pointerTarget='window' default
- 31 ADRs, 6 learning docs, architecture.md, porting-notes.md, contributing.md
- ~38 demo instances on the main page
- Playground with 4-tab mode toggle (Fluid/Reveal/Sticky/Distortion)
- Internal docs moved from `docs/` to `dev-docs/` (not consumer-visible)
- `AGENTS.md` at root redirects all LLM agents to `CLAUDE.md`
- CI runs tests + type-check + publint + build on every push. GitHub Pages auto-deploys.
- @changesets/cli configured for automated CHANGELOG + npm publish + GitHub releases.

## What this session built

1. **FluidText component** — new `<FluidText>` wraps `<Fluid>` with text-mode svgPath container shape. Auto-computes aspect ratio via `OffscreenCanvas.measureText()` so font appears the same visual size regardless of text length. Props: `text`, `font`, `height`, `maskResolution`, + all FluidConfig. Exported from index.ts.

2. **`pointerTarget` prop** — new `FluidConfig.pointerTarget?: 'canvas' | 'window'` (default `'canvas'`). Controls where pointer event listeners attach. Window mode enables background fluid to respond to pointer activity anywhere on the page. Touch listeners registered as passive in window mode. Bucket A (hot-updatable, reinstalls listeners on change).

3. **FluidBackground pointer fix** — defaults `pointerTarget='window'` and `splatOnHover=true`. Background fluid now responds to pointer activity over card headers, text, and other content elements that previously blocked events.

4. **FluidStick auto-animate fix** — replaced `window.innerWidth/Height` with `containerW/containerH` via `bind:clientWidth/clientHeight`. Velocity now scales by actual canvas size.

5. **Mobile glass auto-disable** — added `this.config.GLASS = false` when `!ext.supportLinearFiltering`. Prevents black-box on iOS WebGL 1.

6. **Distortion fallback texture** — `initDistortionFallback()` creates 1×1 white pixel at construction. Distortion shader never samples unbound texture. Guard `this.distortionTexture` null check removed from `drawDisplay`. Fallback recreated on context restore.

7. **Code preview button redesign** — `</>` → "View code"/"Hide code" labeled toggle. Styled to match "Customize" button (`background: #1c2a3a`, `border: #2a4a6a`, `color: #8bc`). 180ms `slide` transition on code panel. FluidBackground button also updated.

8. **Hero title → FluidText** — replaced manual `<Fluid>` + `wordShape()` with two `<FluidText>` instances. Equal font height. Vigorous splat tuning (`splatRadius` 0.6, `splatForce` 8000, `initialSplatCount` 20, `randomSplatRate` 6, `randomSplatCount` 4, `randomSplatSwirl` 300). "View code" button added below hero title.

9. **Rounded frame fix** — now rounds both inner (`innerCornerRadius: 0.06`) and outer (`outerCornerRadius: 0.06`) corners. `FrameFluid` preset gained `outerCornerRadius` prop. Frame demo description updated to emphasize sharp edges.

10. **Docs restructuring** — `docs/` → `dev-docs/` via `git mv`. `docs/contributing.md` content moved to root `CONTRIBUTING.md`. `CLAUDE.md` rewritten as non-redundant agent guide with "Further reading" table. All cross-references updated.

## Key files

| File | Role |
|------|------|
| src/lib/engine/FluidEngine.ts (~1800 LOC) | The engine: WebGL state, physics step, render, dispose, mask texture, glass pass, reveal path, distortion path, sticky mask, fallback texture, pointerTarget listener management. |
| src/lib/engine/shaders.ts | All GLSL: advection, pressure, splat, display (REVEAL/DISTORTION branches), glass, container mask. |
| src/lib/engine/types.ts | FluidConfig (`pointerTarget` at line ~225), ResolvedConfig, ContainerShape, FluidHandle |
| src/lib/engine/gl-utils.ts | WebGL utilities: Material class (keyword shader variants), FBO create/resize/dispose |
| src/lib/Fluid.svelte (~445 LOC) | Svelte wrapper: DOM, ResizeObserver, adaptive resolution, lazy/autoPause. |
| src/lib/FluidText.svelte (~105 LOC) | Fluid inside text letterforms: auto-aspect-ratio from measureText(), transparent default. |
| src/lib/FluidReveal.svelte (~310 LOC) | Fluid as opacity mask: coverColor/fringeColor/accentColor, pixel-based pointer velocity. |
| src/lib/FluidStick.svelte (~260 LOC) | Fluid as sticky text/path: auto-animate Lissajous, container-sized velocity scaling. |
| src/lib/FluidDistortion.svelte (~290 LOC) | Fluid as image distortion: bleed canvas, pixel-based pointer velocity, initial chaos splats. |
| src/lib/FluidBackground.svelte (~200 LOC) | Full-viewport fluid: DOM exclusion via CSS selector, pointerTarget='window', splatOnHover=true. |
| src/routes/+page.svelte (~1960 LOC) | Demo page: ~38 instances, FluidText hero, 4-tab playground, "View code"/"Hide code" buttons. |
| src/routes/components/Card.svelte (~190 LOC) | Demo card: "View code"/"Hide code" toggle with slide transition, copy button. |

## What needs attention next

### Planned features (from user)

1. **Frame border-radius asymmetry** — the rectangle border rounding is "longer" in the width direction than the vertical direction. Not visually symmetrical like CSS border-radius. The SDF in `shaders.ts` (`containerSDF` function) likely needs aspect-ratio correction so rounded corners are circular, not elliptical.
2. **SKILLS.md route** — a page on the GitHub Pages site serving as an LLM-friendly reference (similar to moltbook.com/skill.md). Curated API surface, prop tables, usage patterns.
3. **"Copy page" button** — copies the current page as markdown for LLMs (similar to docs.z.ai pattern). Should appear on the Get Started page and all docs pages.
4. **npm publish** — package is ready. Run `npm publish --access public --provenance`. Create GitHub release with tag `v0.1.0`.

### Known issues

1. **~38 demo instances + background** — exceeds browser's ~16 WebGL context limit. Lazy teardown helps but fast scrolling can briefly exceed the cap.
2. **FluidReveal/FluidDistortion/FluidStick pointer-events** — canvas sits above content; interactive elements can't receive clicks. Documented as intentional in JSDoc.
3. **Stale `/fluid-reveal/` route** — cosmetically stale but functional.
4. **Vite HMR for engine** — fundamental limitation of stateful WebGL, not fixable.

### Follow-ups

1. **Named glass presets** — `glass="crystal"`, `glass="frosted"`, `glass="orb"`.
2. **FluidReveal/Distortion/Stick interactive content** — proper event forwarding.
3. **Video/canvas as distortion source** — per-frame texture updates.
4. **Additional test gaps** — FluidText aspect ratio, pointerTarget switching, distortion fallback texture.

## Architecture quick-reference

- Engine is per-instance, no module-level mutable state. Each canvas gets its own WebGL context.
- Fluid.svelte applies adaptive resolution in instantiate() before constructing the engine.
- Resize: teardown immediately (blank canvas), debounce rebuild by 150ms.
- Lazy teardown: dispose engine + loseContext() (releases browser context slot). Rebuild: restoreContext() + wait for webglcontextrestored event + create new engine.
- setConfig() has 4 buckets: A (scalars — picked up next frame), B (keyword recompile — shading, bloom, sunrays, reveal, distortion), C (FBO rebuild — resolutions), D (construct-only — seed, initialSplatCount, presetSplats).
- Special triggers: svgPath shape → mask rebuild, glass toggle → sceneFBO alloc/dispose, sticky/stickyMask → sticky mask rebuild, distortionImageUrl → async image load, pointerTarget change → listener reinstall.
- Container shapes: analytical (SDF in GLSL + TypeScript mirror) and mask texture (svgPath, rasterized via OffscreenCanvas).
- `openBoundary` changes container semantics: `true` = visual crop (applyMask skipped), `false` = physical wall.
- Reveal mode: REVEAL keyword, multiplicative dissipation, smoothstep sharpening, two-tone fringe.
- Distortion mode: DISTORTION keyword, 1×1 white fallback texture until real image loads.
- Pointer events: `pointerTarget='canvas'` (default) attaches to canvas element; `'window'` attaches to window with passive touch listeners.
- FluidText: measures text via OffscreenCanvas.measureText(), sets aspect-ratio on container div so font height is consistent regardless of text length.
- Texture unit budget: 0=dye, 1=bloom, 2=dithering, 3=sunrays, 4=containerMask, 5=distortionTexture, 6=velocity(distortion), 7=stickyMask.
- Context loss/restore: handled via events. dispose() does NOT call loseContext(). Distortion fallback texture recreated on restore.
- Ascend-Fluid reference: `/Users/admin/Projects/personal-archive/fluid-project/Ascend-Fluid`.
