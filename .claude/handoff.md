# Session Handoff — 2026-04-24 (session 15)

## Project

svelte-fluid — WebGL Navier-Stokes fluid simulation as a Svelte 5 component library. MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.

Repo: github.com/tommyyzhao/svelte-fluid · Branch: main · Latest commit: 9804f2c

## Current state

- 187 tests, all passing. 0 type errors. Build + publint clean.
- 10 presets: LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora, ToroidalTempest, CircularFluid, FrameFluid, AnnularFluid, SvgPathFluid
- 5 container shapes: circle, frame, roundedRect, annulus, svgPath (mask texture)
- Glass post-processing: hemisphere dome (circles) and rim model (all others)
- FluidReveal: multiplicative dissipation, customizable cover/accent colors (ADR-0029), iridescent fringes
- FluidDistortion: velocity-driven image warping with bleed, initial chaos, auto-distort (ADR-0030)
- FluidStick: physics-level dye sticking via mask texture — **GPU sampling bug FIXED this session**
- FluidBackground: full-viewport fluid with DOM exclusion zones
- 30 ADRs, 6 learning docs, architecture.md, porting-notes.md, contributing.md
- ~36 demo instances on the main page (4 sticky)
- Every demo card has `</>` code toggle + "Customize" button
- Playground with Fluid/Reveal mode toggle, accordion ControlPanel, URL hash state, `</>` code preview
- Floating `</>` button for FluidBackground code snippet
- 4 extra routes: `/background-fluid`, `/fluid-reveal/`, `/svelte-fluid`, `/svg`
- CI runs tests + type-check + publint + build on every push. GitHub Pages auto-deploys.
- Package ready for `npm publish --access public --provenance`.

## What this session built

1. **Fixed sticky mask texture GPU sampling** — three targeted changes to
   `initStickyMaskTexture()` and `step()` in `FluidEngine.ts`:
   - `gl.activeTexture(gl.TEXTURE7)` before texture creation, so the mask is
     created/configured on its dedicated unit (not whatever unit happened to be active).
   - `gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)` before the single-channel R8/LUMINANCE
     upload, restored to 4 after. Handles mask widths that aren't multiples of 4.
   - Re-bind sticky mask (`bindStickyMask()` + `gl.uniform1i`) before the dye
     advection pass in `step()`, ensuring the binding survives program switches
     from `applyMask`.

2. **Verified via browser debug shader** — temporarily modified the advection shader
   to output `vec4(stickyVal, uStickyStrength, uMultiplicative*0.5, 1.0)`. The "HI"
   text was clearly visible (red inside letters, teal outside), confirming the mask
   texture is correctly sampled by the physics shader pipeline.

3. **Diagnosed autoPause false positive** — discovered that the apparent "always black"
   canvas during debugging was caused by `document.hidden = true` (Chrome in background
   while Claude Code ran in terminal). The `autoPause` feature correctly paused the
   engine, and RAF was throttled by Chrome for background tabs. This was NOT a bug —
   it was a debugging environment issue.

## Key files

| File | Role |
|------|------|
| src/lib/engine/FluidEngine.ts (~1750 LOC) | The engine: WebGL state, physics step, render, dispose, mask texture, glass pass, reveal path, distortion path, sticky mask (initStickyMaskTexture, bindStickyMask, step/splat uniform binding) |
| src/lib/Fluid.svelte (~440 LOC) | Svelte wrapper: DOM, ResizeObserver, adaptive resolution, lazy/autoPause, destructures ALL FluidConfig props including 5 sticky fields |
| src/lib/FluidStick.svelte (~230 LOC) | Fluid as sticky text/path: text/font/d rasterization via stickyMask, auto-animate Lissajous with duration/color-cycling, multiplicative dissipation defaults |
| src/lib/FluidDistortion.svelte (~290 LOC) | Fluid as image distortion: bleed canvas, initial chaos splats, pointer-driven dye injection |
| src/lib/FluidReveal.svelte (~300 LOC) | Fluid as opacity mask: coverColor/accentColor, manual pointer handling, auto-reveal Lissajous |
| src/lib/FluidBackground.svelte (~180 LOC) | Full-viewport fluid background with DOM exclusion via CSS selector |
| src/lib/engine/gl-utils.ts | WebGL utilities: Material class (keyword shader variants), FBO create/resize/dispose |
| src/lib/engine/shaders.ts | All GLSL: advection (uStickyMask/uStickyStrength), pressure (uStickyMask/uStickyPressure), splat (uStickyMask/uStickyAmplify), display (REVEAL/DISTORTION branches), glass, container mask |
| src/lib/engine/types.ts | FluidConfig (with sticky* fields), StickyMask, ResolvedConfig, ContainerShape, FluidHandle |
| src/lib/engine/container-shapes.ts | SDF evaluation, containerShapeEqual, stickyMaskEqual, viewBoxEqual, maskAreaFraction |
| src/routes/+page.svelte (~1600 LOC) | Demo page: ~36 instances, FluidBackground wrapper, playground, 4 sticky cards |
| src/routes/components/ControlPanel.svelte (~1120 LOC) | Playground controls: mode toggle, accordion sections, code generation |

## What needs attention next

### Priority 1: FluidStick tuning (IMMEDIATE)

The sticky effect now WORKS at the GPU level, but the **"Sticky text" and "Sticky + circle"** demo presets need tuning — dye isn't persisting long enough to be visually compelling. The "Lightning bolt" and "Strong pressure" presets work decently.

Tuning parameters to explore:
- `densityDissipation` (currently 0.78 in FluidStick) — this is the off-mask fade rate in multiplicative mode. Lower = slower fade. Consider different values per preset.
- `stickyStrength` (currently 1.0) — max means zero decay on mask. This should be fine.
- `stickyAmplify` (currently 0.5) — how much extra dye is deposited on the mask during splats.
- `autoAnimateDuration` (currently 3.5s) — how long the Lissajous animation runs.
- `autoAnimateSpeed` — affects how quickly the Lissajous path is traced. Faster = more passes over the text.
- `splatRadius` (currently 0.6) — larger splats deposit more dye on the mask per pass.
- `initialSplatCount` (currently 20 in FluidStick) — more initial splats = more dye on mask from the start.

The text presets may need more vigorous auto-animation (higher speed, more splats, longer duration) so enough dye accumulates on the text before animation stops.

### Planned features

1. **npm publish** — Package is ready. Run `npm publish --access public --provenance`. Create a GitHub release with tag `v0.1.0`.
2. **Test gaps** — Priority 1: dispose() cleanup, setConfig() bucket transitions, context loss/restore. Priority 2: FluidBackground DOM exclusion, glass post-processing, distortion image loading.
3. **Changesets setup** — `@changesets/cli` for automated CHANGELOG + npm publish + GitHub releases.
4. **Playground distortion mode** — Add distortion as a third playground mode.
5. **Playground sticky mode** — Add sticky as a fourth playground mode with text/font/path controls.
6. **ADR-0031** — Document FluidStick architecture decisions (sticky mask rasterization, shader modulation approach, multiplicative mode choice, velocity dissipation override).

### Known issues

1. **~36 demo instances + background** — Exceeds browser's ~16 WebGL context limit. Lazy teardown helps but fast scrolling can briefly exceed the cap.
2. **FluidReveal/FluidDistortion/FluidStick pointer-events** — Canvas sits above content; interactive elements can't receive clicks.
3. **Multiplicative velocity dissipation** — REVEAL and STICKY modes override velocity dissipation to 0.98 (hardcoded). This means `velocityDissipation` prop is ignored in these modes.
4. **Texture unit 7** — Sticky mask uses the last guaranteed WebGL texture unit. No room for additional texture-based features without checking `MAX_COMBINED_TEXTURE_IMAGE_UNITS`.
5. **Vite HMR for engine** — FluidEngine.ts and shaders.ts changes don't hot-reload to existing instances. Full page reload + Vite cache clear required (`rm -rf node_modules/.vite .svelte-kit`).

### Follow-ups

1. **Named glass presets** — `glass="crystal"`, `glass="frosted"`, `glass="orb"`.
2. **Animated specular drift** — Slow sinusoidal light direction wobble when cursor is idle.
3. **FluidReveal/FluidDistortion/FluidStick interactive content** — Proper event forwarding.
4. **Video/canvas as distortion source** — Per-frame texture updates for animated content.
5. **Distortion + glass** — Currently mutually exclusive.
6. **Sticky + image mask** — Allow a grayscale image URL as the sticky mask source.

## Architecture quick-reference

- Engine is per-instance, no module-level mutable state. Each canvas gets its own WebGL context.
- Fluid.svelte applies adaptive resolution in instantiate() before constructing the engine.
- Resize: teardown immediately (blank canvas), debounce rebuild by 150ms.
- Lazy teardown: dispose engine + loseContext() (releases browser context slot). Rebuild: restoreContext() + wait for webglcontextrestored event + create new engine.
- setConfig() has 4 buckets: A (scalars incl. splatOnHover, glass params, sticky params — picked up next frame), B (keyword recompile — shading, bloom, sunrays, reveal, distortion; sticky/stickyMask triggers mask rebuild), C (FBO rebuild), D (construct-only). Additionally, svgPath shape changes trigger mask texture rebuild, `glass` toggle triggers sceneFBO alloc/dispose, `distortionImageUrl` change triggers async image load, and `sticky`/`stickyMask` changes trigger sticky mask texture rebuild.
- Container shapes: two approaches coexist:
  - **Analytical** (circle/frame/roundedRect/annulus): SDF computed per-fragment in shaders, mirrored in TypeScript for rejection sampling.
  - **Mask texture** (svgPath): rasterized via OffscreenCanvas at canvas aspect ratio, uploaded as R8/LUMINANCE texture. Text mode uses alphabetic baseline with `(ascent - descent) / 2` offset.
- **Sticky mask**: separate from container mask. Rasterized via same OffscreenCanvas approach, uploaded to texture unit 7 with `UNPACK_ALIGNMENT=1`. Optional blur via blurMaskData(). Physics shaders sample this mask to modulate dissipation (advection), inject pressure (pressure Jacobi), and amplify splats (splat shader). All uniforms default to 0.0 when sticky is disabled — zero overhead. **GPU sampling now working (fixed session 15).**
- Glass post-processing: two models. Hemisphere (circles), Rim (all others). Requires container shape.
- Reveal mode: REVEAL keyword, multiplicative dissipation, coverColor - dye output.
- Distortion mode: DISTORTION keyword, dye.r as UV offset magnitude, velocity as direction.
- Sticky mode: no display keyword (purely physics-level). Uses multiplicative dissipation for dye. Velocity dissipation overridden to 0.98 in multiplicative mode.
- Transparent mode: `gl.clear(0,0,0,0)` replaces checkerboard.
- FluidBackground: evenodd SVG path mask. Outer rect = viewport, inner rounded-rect holes = excluded elements.
- Material class caches compiled shader variants by sorted keyword string key.
- Context loss/restore: handled via events. dispose() does NOT call loseContext(). Sticky mask texture is re-created on context restore.
- Texture unit budget: 0=dye, 1=bloom/various, 2=dithering(display), 3=sunrays, 4=containerMask, 5=distortionTexture, 6=velocity(distortion), 7=stickyMask.
