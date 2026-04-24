# Session Handoff — 2026-04-24 (session 14)

## Project

svelte-fluid — WebGL Navier-Stokes fluid simulation as a Svelte 5 component library. MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.

Repo: github.com/tommyyzhao/svelte-fluid · Branch: main · Latest commit: (see git log)

## Current state

- 187 tests, all passing. 0 type errors. Build + publint clean.
- 10 presets: LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora, ToroidalTempest, CircularFluid, FrameFluid, AnnularFluid, SvgPathFluid
- 5 container shapes: circle, frame, roundedRect, annulus, svgPath (mask texture)
- Glass post-processing: hemisphere dome (circles) and rim model (all others)
- FluidReveal: multiplicative dissipation, customizable cover/accent colors (ADR-0029), iridescent fringes
- FluidDistortion: velocity-driven image warping with bleed, initial chaos, auto-distort (ADR-0030)
- FluidStick: physics-level dye sticking via mask texture — **mask texture GPU sampling bug** (see below)
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

1. **`autoAnimateDuration` prop** on `FluidStick` — new prop (default 3.5s) that stops
   the auto-animation after N seconds. Once stopped, off-mask dye fades, revealing
   the sticky shape. Set to 0 for indefinite.

2. **Color-cycling auto-animate** — replaced the fixed purple `{r:0.3, g:0.15, b:0.3}`
   with rainbow HSV cycling at 1.5× HDR intensity. Produces vivid accumulated dye.

3. **FluidStick default tuning** — `splatRadius` 0.25→0.6, `splatForce` 6000→10000,
   `densityDissipation` 0.85→0.78, `amplify` 0.3→0.5.

4. **Auto-animate timing fixes** — deferred `animStartTime` (set on first available
   frame, not mount time) so lazy-loaded cards get the full duration. Fixed Lissajous
   to use `t` variable (`autoAnimateSpeed` was previously ignored). Wider vertical sweep.

5. **Demo text card update** — "STICKY" bold 80px → "FLUID" 900-weight 120px for bolder letterforms.

6. **Extensive GPU debugging of sticky mask** — discovered and documented a texture
   sampler binding bug (see Priority 1 below).

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

### Priority 1: Fix sticky mask texture GPU sampling bug (CRITICAL)

**The bug**: `texture2D(uStickyMask, uv).r` always returns 0 in the advection shader, despite the mask texture containing correct data.

**What we know for certain** (all verified this session):
- Mask texture IS created with correct data (`initStickyMaskTexture` confirmed 44k+ non-zero pixels via console log)
- Mask texture IS on the GPU with correct values (readback via framebuffer attachment showed R=255 for text center pixel)
- Engine config IS correct: `STICKY=true`, `STICKY_STRENGTH=1.0`, `STICKY_MASK.text="HI"`
- Advection program HAS the `uStickyMask` uniform (verified via `Object.keys(advectionProgram.uniforms)`)
- A **hardcoded mask** (`step(0.3, vUv.x) * (1.0 - step(0.7, vUv.x))`) in the shader DOES WORK — dye persists in the center stripe, fades on edges. This proves the dissipation modulation logic is 100% correct.
- The GPU has 16 fragment texture units (verified `MAX_TEXTURE_IMAGE_UNITS=16`)

**What to investigate next session**:
1. **Check if `gl.uniform1i(uniforms.uStickyMask, 7)` is actually being called with a valid non-null location**. The uniform location exists in the JS object, but verify it's a valid `WebGLUniformLocation`, not just a falsy value. Print `typeof` and the value.
2. **Verify texture unit 7 binding persists until draw time**. Add `gl.getParameter(gl.TEXTURE_BINDING_2D)` checks right before the dye advection `blit()` call with TEXTURE7 active, to see if the mask texture is still bound.
3. **Check if `setConfig()` is inadvertently calling `initStickyMaskTexture()` which disposes the mask**. Add a counter to track how many times `initStickyMaskTexture` is called — if >1, setConfig is re-initing and potentially clearing the mask.
4. **Try using `gl.UNPACK_ALIGNMENT = 1`** before the mask texture upload. The mask width might not be a multiple of 4 at certain aspect ratios (though 512 is fine).
5. **Try binding the mask texture inline** in `step()` (before the dye blit), instead of relying on the earlier `bindStickyMask()` call persisting through the velocity advection pass.

**Key constraint**: Vite HMR does NOT hot-reload FluidEngine.ts or shaders.ts changes to running instances. You MUST kill the dev server, `rm -rf node_modules/.vite .svelte-kit`, and restart `bun run dev` after ANY engine/shader change. A browser hard-reload (cmd+shift+r) alone is NOT sufficient — the Vite module transform cache must be cleared.

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
5. **Vite HMR for engine** — FluidEngine.ts and shaders.ts changes don't hot-reload to existing instances. Full page reload + Vite cache clear required.

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
- **Sticky mask**: separate from container mask. Rasterized via same OffscreenCanvas approach, uploaded to texture unit 7. Optional blur via blurMaskData(). Physics shaders sample this mask to modulate dissipation (advection), inject pressure (pressure Jacobi), and amplify splats (splat shader). All uniforms default to 0.0 when sticky is disabled — zero overhead. **GPU sampling currently broken (see Priority 1).**
- Glass post-processing: two models. Hemisphere (circles), Rim (all others). Requires container shape.
- Reveal mode: REVEAL keyword, multiplicative dissipation, coverColor - dye output.
- Distortion mode: DISTORTION keyword, dye.r as UV offset magnitude, velocity as direction.
- Sticky mode: no display keyword (purely physics-level). Uses multiplicative dissipation for dye. Velocity dissipation overridden to 0.98 in multiplicative mode.
- Transparent mode: `gl.clear(0,0,0,0)` replaces checkerboard.
- FluidBackground: evenodd SVG path mask. Outer rect = viewport, inner rounded-rect holes = excluded elements.
- Material class caches compiled shader variants by sorted keyword string key.
- Context loss/restore: handled via events. dispose() does NOT call loseContext(). Sticky mask texture is re-created on context restore.
- Texture unit budget: 0=dye, 1=bloom/various, 2=dithering(display), 3=sunrays, 4=containerMask, 5=distortionTexture, 6=velocity(distortion), 7=stickyMask.
