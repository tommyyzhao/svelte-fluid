# Session Handoff — 2026-04-24 (session 13)

## Project

svelte-fluid — WebGL Navier-Stokes fluid simulation as a Svelte 5 component library. MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.

Repo: github.com/tommyyzhao/svelte-fluid · Branch: main · Latest commit: 6cb9e95

## Current state

- 187 tests, all passing. 0 type errors. Build + publint clean.
- 10 presets: LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora, ToroidalTempest, CircularFluid, FrameFluid, AnnularFluid, SvgPathFluid
- 5 container shapes: circle, frame, roundedRect, annulus, svgPath (mask texture)
- Glass post-processing: hemisphere dome (circles) and rim model (all others)
- FluidReveal: multiplicative dissipation, customizable cover/accent colors (ADR-0029), iridescent fringes
- FluidDistortion: velocity-driven image warping with bleed, initial chaos, auto-distort (ADR-0030)
- FluidStick: physics-level dye sticking via mask texture (NEW — needs visual tuning)
- FluidBackground: full-viewport fluid with DOM exclusion zones
- 30 ADRs, 6 learning docs, architecture.md, porting-notes.md, contributing.md
- ~36 demo instances on the main page (previous + 4 sticky)
- Every demo card has `</>` code toggle + "Customize" button
- Playground with Fluid/Reveal mode toggle, accordion ControlPanel, URL hash state, `</>` code preview
- Floating `</>` button for FluidBackground code snippet
- 4 extra routes: `/background-fluid`, `/fluid-reveal/`, `/svelte-fluid`, `/svg`
- CI runs tests + type-check + publint + build on every push. GitHub Pages auto-deploys.
- Package ready for `npm publish --access public --provenance`.

## What this session built

1. **FluidStick component** (`src/lib/FluidStick.svelte`, ~210 LOC):
   - Wraps `<Fluid>` with `sticky={true}` and sticky-specific props
   - Props: `text`, `font`, `d`, `maskViewBox`, `maskFillRule`, `maskResolution`, `maskBlur`, `strength`, `stickyPressureAmount`, `amplify`, `autoAnimate`, `autoAnimateSpeed`
   - Auto-animate: Lissajous cursor animation deposits dye before user interaction
   - Sticky-tuned defaults: multiplicative dissipation 0.85, no random splats, no bloom, splatOnHover

2. **StickyMask type** (`types.ts`):
   - `{ text?, font?, d?, viewBox?, fillRule?, maskResolution?, blur? }`
   - Same rasterization approach as `ContainerShape.svgPath` text mode

3. **Sticky shader uniforms** — always-present, default to 0.0 (identity when disabled):
   - `advectionShader`: `uStickyMask` (sampler2D), `uStickyStrength` (float) — modulate dissipation per-pixel. On-mask: dissipation → 1.0 (no fade). Off-mask: normal fade.
   - `pressureShader`: `uStickyMask`, `uStickyPressure` — inject artificial positive pressure on mask, pushing fluid around the shape
   - `splatShader`: `uStickyMask`, `uStickyAmplify` — boost splat intensity on mask (`splat *= 1.0 + mask * amplify`)

4. **Engine changes** (`FluidEngine.ts`):
   - `stickyMaskTexture` + `stickyFallbackTexture` (1x1 black) fields
   - `initStickyMaskTexture()` — OffscreenCanvas rasterization, optional blur, R8/LUMINANCE upload to texture unit 7
   - `blurMaskData()` — multi-pass separable box blur on Uint8Array
   - `bindStickyMask()` — binds mask or fallback to TEXTURE7
   - `step()`: binds sticky uniforms before pressure loop, velocity advection (strength=0), dye advection (strength=config)
   - `splat()`: amplify=0 for velocity splats, amplify=config for dye splats
   - Multiplicative velocity dissipation override: uses 0.98 when REVEAL/STICKY is active (VELOCITY_DISSIPATION=0.2 would kill velocity at 80%/frame in multiplicative mode)
   - `setConfig()`: `stickyMaskEqual` change detection triggers `initStickyMaskTexture` rebuild
   - `dispose()`: cleans up both sticky textures
   - `handleContextRestored()`: recreates sticky mask texture

5. **Types** (`types.ts`):
   - `StickyMask` interface
   - FluidConfig: `sticky`, `stickyMask`, `stickyStrength`, `stickyPressure`, `stickyAmplify`
   - ResolvedConfig: `STICKY`, `STICKY_MASK`, `STICKY_STRENGTH`, `STICKY_PRESSURE`, `STICKY_AMPLIFY`

6. **Container shapes** (`container-shapes.ts`):
   - Added `stickyMaskEqual()` for deep comparison
   - Exported `viewBoxEqual()` (was private)

7. **Demo: Sticky section** (`+page.svelte`):
   - 4 cards: Sticky text, Lightning bolt, Sticky + circle, Strong pressure
   - Lightning bolt and Strong pressure demos work well visually
   - Sticky text demo needs visual tuning (see known issues)

8. **Tests** (`sticky.test.ts`, 34 new tests):
   - Advection dissipation modulation (7 tests): identity when disabled, full/partial sticky, multiplicative/additive modes
   - Pressure injection (4 tests): identity, positive pressure, partial mask
   - Splat amplification (5 tests): identity, full/partial mask, large amplify
   - StickyMask equality (9 tests): null, text, path, font, blur, defaults
   - ViewBox equality (4 tests): undefined, default, same, different
   - Config type validation (4 tests)

## Key files

| File | Role |
|------|------|
| src/lib/engine/FluidEngine.ts (~1750 LOC) | The engine: WebGL state, physics step, render, dispose, mask texture, glass pass, reveal path, distortion path, sticky mask (initStickyMaskTexture, bindStickyMask, step/splat uniform binding) |
| src/lib/Fluid.svelte (~440 LOC) | Svelte wrapper: DOM, ResizeObserver, adaptive resolution, lazy/autoPause, destructures ALL FluidConfig props including 5 sticky fields |
| src/lib/FluidStick.svelte (~210 LOC) | Fluid as sticky text/path: text/font/d rasterization via stickyMask, auto-animate Lissajous, multiplicative dissipation defaults |
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

### Priority 1: FluidStick visual tuning (CRITICAL)

The sticky physics pipeline is complete and verified (mask on GPU, shader math tested, pressure/splat/advection all wired). But the **text-mode demo** doesn't show a clearly visible text shape yet. The SVG path demos (lightning bolt, triangle) work better because the path shapes are larger/bolder.

Root causes identified:
- **Dissipation balance**: `densityDissipation=0.85` in multiplicative mode means off-mask dye fades 15%/frame. With auto-animate continuously injecting dye, the steady-state dye level is high everywhere, reducing contrast between on-mask (persists) and off-mask (fades).
- **Auto-animate intensity**: The Lissajous cursor injects `{r:0.3, g:0.15, b:0.3}` at 60fps. This is enough to keep the canvas bright along the cursor trail, masking the sticking effect.
- **Vite HMR limitation**: Engine module changes don't hot-reload to running instances. Full page reload needed after engine changes — use `cmd+shift+r` or kill/restart the dev server.

Suggested fixes to try next session:
1. **Stop auto-animate after N seconds** so dye fades everywhere except on-mask, revealing the text shape
2. **Use `initialDensityDissipation` ramp** — start with low dissipation (0.5) for 2 seconds so initial splats burn the text in, then ramp to 0.85 for steady-state
3. **Increase dissipation to 0.8** (20%/frame off-mask) — dye trails fade in <0.5s, giving immediate contrast
4. **Lower auto-animate color** to `{r:0.1, g:0.1, b:0.1}` — minimal injection, let accumulation reveal the shape
5. Consider adding an `invertDisplay` option (like the codepen's `1-C`) for a white-background aesthetic where dark dye sticks

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
3. **Multiplicative velocity dissipation** — REVEAL and STICKY modes override velocity dissipation to 0.98 (hardcoded). This means `velocityDissipation` prop is ignored in these modes. Should be configurable or documented.
4. **Texture unit 7** — Sticky mask uses the last guaranteed WebGL texture unit. No room for additional texture-based features without checking `MAX_COMBINED_TEXTURE_IMAGE_UNITS`.
5. **Vite HMR for engine** — FluidEngine.ts changes don't hot-reload to existing instances. Full page reload required. This made debugging difficult this session.

### Follow-ups

1. **Named glass presets** — `glass="crystal"`, `glass="frosted"`, `glass="orb"`.
2. **Animated specular drift** — Slow sinusoidal light direction wobble when cursor is idle.
3. **FluidReveal/FluidDistortion/FluidStick interactive content** — Proper event forwarding.
4. **Video/canvas as distortion source** — Per-frame texture updates for animated content.
5. **Distortion + glass** — Currently mutually exclusive.
6. **Sticky + image mask** — Allow a grayscale image URL as the sticky mask source (in addition to text/path).

## Architecture quick-reference

- Engine is per-instance, no module-level mutable state. Each canvas gets its own WebGL context.
- Fluid.svelte applies adaptive resolution in instantiate() before constructing the engine.
- Resize: teardown immediately (blank canvas), debounce rebuild by 150ms.
- Lazy teardown: dispose engine + loseContext() (releases browser context slot). Rebuild: restoreContext() + wait for webglcontextrestored event + create new engine.
- setConfig() has 4 buckets: A (scalars incl. splatOnHover, glass params, sticky params — picked up next frame), B (keyword recompile — shading, bloom, sunrays, reveal, distortion; sticky/stickyMask triggers mask rebuild), C (FBO rebuild), D (construct-only). Additionally, svgPath shape changes trigger mask texture rebuild, `glass` toggle triggers sceneFBO alloc/dispose, `distortionImageUrl` change triggers async image load, and `sticky`/`stickyMask` changes trigger sticky mask texture rebuild.
- Container shapes: two approaches coexist:
  - **Analytical** (circle/frame/roundedRect/annulus): SDF computed per-fragment in shaders, mirrored in TypeScript for rejection sampling.
  - **Mask texture** (svgPath): rasterized via OffscreenCanvas at canvas aspect ratio, uploaded as R8/LUMINANCE texture. Text mode uses alphabetic baseline with `(ascent - descent) / 2` offset.
- **Sticky mask**: separate from container mask. Rasterized via same OffscreenCanvas approach, uploaded to texture unit 7. Optional blur via blurMaskData(). Physics shaders sample this mask to modulate dissipation (advection), inject pressure (pressure Jacobi), and amplify splats (splat shader). All uniforms default to 0.0 when sticky is disabled — zero overhead.
- Glass post-processing: two models. Hemisphere (circles), Rim (all others). Requires container shape.
- Reveal mode: REVEAL keyword, multiplicative dissipation, coverColor - dye output.
- Distortion mode: DISTORTION keyword, dye.r as UV offset magnitude, velocity as direction.
- Sticky mode: no display keyword (purely physics-level). Uses multiplicative dissipation for dye. Velocity dissipation overridden to 0.98 in multiplicative mode.
- Transparent mode: `gl.clear(0,0,0,0)` replaces checkerboard.
- FluidBackground: evenodd SVG path mask. Outer rect = viewport, inner rounded-rect holes = excluded elements.
- Material class caches compiled shader variants by sorted keyword string key.
- Context loss/restore: handled via events. dispose() does NOT call loseContext(). Sticky mask texture is re-created on context restore.
- Texture unit budget: 0=dye, 1=bloom/various, 2=various, 3=sunrays, 4=containerMask, 5=distortionTexture, 6=velocity(distortion), 7=stickyMask.
