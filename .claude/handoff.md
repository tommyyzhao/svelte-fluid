# Session Handoff — 2026-04-24 (session 17)

## Project

svelte-fluid — WebGL Navier-Stokes fluid simulation as a Svelte 5 component library. MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.

Repo: github.com/tommyyzhao/svelte-fluid · Branch: main · Latest commit: 7057c90

## Current state

- 187 tests, all passing. 0 type errors. Build + publint clean.
- 10 presets: LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora, ToroidalTempest, CircularFluid, FrameFluid, AnnularFluid, SvgPathFluid
- 5 container shapes: circle, frame, roundedRect, annulus, svgPath (mask texture)
- Glass post-processing: hemisphere dome (circles) and rim model (all others)
- FluidReveal: multiplicative dissipation, customizable cover/accent colors (ADR-0029), iridescent fringes
- FluidDistortion: velocity-driven image warping with bleed, initial chaos, auto-distort (ADR-0030)
- FluidStick: physics-level dye sticking via mask texture — velocity damping, tuned dissipation (0.98)
- FluidBackground: full-viewport fluid with DOM exclusion zones
- 30 ADRs, 6 learning docs, architecture.md, porting-notes.md, contributing.md
- ~36 demo instances on the main page (4 sticky, 4 distortion)
- Every demo card has `</>` code toggle + "Customize" button (including sticky and distortion)
- Playground with 4-tab mode toggle (Fluid/Reveal/Sticky/Distortion), accordion ControlPanel, URL hash state, `</>` code preview
- Floating `</>` button for FluidBackground code snippet
- 4 extra routes: `/background-fluid`, `/fluid-reveal/`, `/svelte-fluid`, `/svg`
- CI runs tests + type-check + publint + build on every push. GitHub Pages auto-deploys.
- Package ready for `npm publish --access public --provenance`.

## What this session built

1. **Fixed FluidStick off-mask dye too weak** — Changed `densityDissipation` default
   from 0.85 to 0.98. Multiplicative dissipation at 0.85 was 15%/frame (gone in
   ~300ms); 0.98 gives 2%/frame (~1–2s visible trails matching standard Fluid).
   On-mask retention improved from 10% to 74% after 5s.

2. **Fixed `randomSplatSwirl`/`randomSplatSpread` not reaching engine** — FluidStick
   destructured these props (removing from `...fluidProps`) but never passed them to
   `<Fluid>`. Random splats had zero velocity and minimal spread. Added
   `{randomSplatSwirl}` and `{randomSplatSpread}` to the template.

3. **Organic random splat timing** — Rate 1.5→0.4, count 5→3, swirl 150→500.
   Engine jitter widened from 0.5–1.5× to 0.3–2.0× for "water dripping from leaves"
   timing. Intervals range from 0.75s to 5.0s.

4. **4-tab Playground** — Added Sticky and Distortion tabs alongside Fluid and Reveal.
   Only the active tab's WebGL context renders (no wasted GPU). Mode switch snapshots
   fluid physics when leaving fluid mode, applies mode-specific defaults, restores
   on return.

5. **Playground Sticky tab** — Text/font inputs, SVG path textarea, maskBlur/maskPadding
   sliders, sticky physics (strength, amplify, pressure, densityDissipation), auto-
   animate speed/duration, container shape selector (Rectangle/Circle/Rounded rect)
   with glass toggle. "Restart Animation" button remounts FluidStick.

6. **Playground Distortion tab** — Image URL text input, strength/intensity sliders,
   velocityDissipation, initialSplats, auto-distort checkbox (triggers remount) with
   speed slider, container shape selector.

7. **Customize buttons on all demo cards** — 8 new: 4 sticky + 4 distortion cards now
   have "Customize" buttons that scroll to playground, switch tab, load config.

8. **Fixed `loadedPreset` not cleared on Reset** — Made `loadedPreset` `$bindable` in
   ControlPanel and clear it in `reset()`. "Loaded: X" indicator now clears properly.

9. **SVG path (`d`) takes precedence over `text`** — Flipped priority in both
   `initMaskTexture()` and `initStickyMaskTexture()`. Updated docs in types.ts,
   FluidStick.svelte, ControlPanel hint text.

10. **Deleted `/sticky-tuning` route** — Functionality folded into playground Sticky tab.

11. **`buildStickySnippet()` and `buildDistortionSnippet()`** — Code preview generates
    `<FluidStick>` and `<FluidDistortion>` component code respectively.

12. **URL hash state** — All sticky/distortion playground params serialize to URL for sharing.

## Key files

| File | Role |
|------|------|
| src/lib/engine/FluidEngine.ts (~1770 LOC) | The engine: WebGL state, physics step, render, dispose, mask texture (d takes precedence over text), glass pass, reveal path, distortion path, sticky mask (velocity damping) |
| src/lib/Fluid.svelte (~440 LOC) | Svelte wrapper: DOM, ResizeObserver, adaptive resolution, lazy/autoPause, destructures ALL FluidConfig props including 5 sticky fields |
| src/lib/FluidStick.svelte (~260 LOC) | Fluid as sticky text/path: text/font/d rasterization via stickyMask, auto-animate Lissajous with duration/color-cycling, random splats with swirl, maskPadding prop. Passes randomSplatSwirl + randomSplatSpread to Fluid. |
| src/lib/FluidDistortion.svelte (~290 LOC) | Fluid as image distortion: bleed canvas, initial chaos splats, pointer-driven dye injection |
| src/lib/FluidReveal.svelte (~300 LOC) | Fluid as opacity mask: coverColor/accentColor, manual pointer handling, auto-reveal Lissajous |
| src/lib/FluidBackground.svelte (~180 LOC) | Full-viewport fluid background with DOM exclusion via CSS selector |
| src/lib/engine/gl-utils.ts | WebGL utilities: Material class (keyword shader variants), FBO create/resize/dispose |
| src/lib/engine/shaders.ts | All GLSL: advection (uStickyMask/uStickyStrength with velocity damping branch), pressure, splat, display (REVEAL/DISTORTION branches), glass, container mask |
| src/lib/engine/types.ts | FluidConfig (with sticky* fields), StickyMask (d takes precedence), ResolvedConfig, ContainerShape, FluidHandle |
| src/lib/engine/container-shapes.ts | SDF evaluation, containerShapeEqual, stickyMaskEqual (includes padding), viewBoxEqual, maskAreaFraction |
| src/routes/+page.svelte (~1800 LOC) | Demo page: ~36 instances, FluidBackground wrapper, 4-tab playground (Fluid/Reveal/Sticky/Distortion), all Customize configs, URL hash state |
| src/routes/components/ControlPanel.svelte (~1300 LOC) | Playground sidebar: 4-tab mode toggle, Fluid accordions, Reveal controls, Sticky controls (text/font/d inputs, physics sliders, container), Distortion controls (URL input, sliders, auto-distort), snippet builders |

## What needs attention next

### Priority: User-requested for next session

1. **Iterate on reveal presets** — Review and improve the FluidReveal demo cards and playground reveal controls.
2. **Mobile friendliness audit** — Audit the demo web app for mobile responsiveness. Check touch interactions, layout breakpoints, canvas sizing, control panel accessibility on small screens.

### Planned features

1. **npm publish** — Package is ready. Run `npm publish --access public --provenance`. Create a GitHub release with tag `v0.1.0`.
2. **Test gaps** — Priority 1: dispose() cleanup, setConfig() bucket transitions, context loss/restore. Priority 2: FluidBackground DOM exclusion, glass post-processing, distortion image loading.
3. **Changesets setup** — `@changesets/cli` for automated CHANGELOG + npm publish + GitHub releases.
4. **ADR-0031** — Document FluidStick architecture decisions (sticky mask rasterization, shader modulation approach, multiplicative mode choice, velocity damping).

### Known issues

1. **~36 demo instances + background** — Exceeds browser's ~16 WebGL context limit. Lazy teardown helps but fast scrolling can briefly exceed the cap.
2. **FluidReveal/FluidDistortion/FluidStick pointer-events** — Canvas sits above content; interactive elements can't receive clicks.
3. **Multiplicative velocity dissipation** — REVEAL and STICKY modes override velocity dissipation to 0.98 (hardcoded). This means `velocityDissipation` prop is ignored in these modes.
4. **Texture unit 7** — Sticky mask uses the last guaranteed WebGL texture unit. No room for additional texture-based features without checking `MAX_COMBINED_TEXTURE_IMAGE_UNITS`.
5. **Vite HMR for engine** — FluidEngine.ts and shaders.ts changes don't hot-reload to existing instances. Full page reload + Vite cache clear required (`rm -rf node_modules/.vite .svelte-kit`).
6. **Browser automation limitation** — `document.hidden=true` when the terminal has focus prevents RAF from firing. Chrome throttles RAF to 0fps for hidden tabs. This means FluidStick auto-animate and engine rendering can't be tested via browser automation tools.

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
  - **Mask texture** (svgPath): rasterized via OffscreenCanvas at canvas aspect ratio, uploaded as R8/LUMINANCE texture. **`d` takes precedence over `text`** when both are set.
- **Sticky mask**: separate from container mask. Rasterized via same OffscreenCanvas approach, uploaded to texture unit 7 with `UNPACK_ALIGNMENT=1`. Optional blur via blurMaskData(). `padding` field controls text fill fraction (default 0.9). Physics shaders sample this mask to modulate dissipation (advection), inject pressure (pressure Jacobi), and amplify splats (splat shader). **Velocity damping**: advection shader uses negative `uStickyStrength` to dampen velocity on the mask (~80%/frame with strength=1.0). All uniforms default to 0.0 when sticky is disabled — zero overhead.
- Glass post-processing: two models. Hemisphere (circles), Rim (all others). Requires container shape.
- Reveal mode: REVEAL keyword, multiplicative dissipation, coverColor - dye output.
- Distortion mode: DISTORTION keyword, dye.r as UV offset magnitude, velocity as direction.
- Sticky mode: no display keyword (purely physics-level). Uses multiplicative dissipation for dye (0.98 default = 2%/frame off-mask). Velocity dissipation overridden to 0.98 in multiplicative mode. Velocity damped on mask via negative uStickyStrength.
- Transparent mode: `gl.clear(0,0,0,0)` replaces checkerboard.
- FluidBackground: evenodd SVG path mask. Outer rect = viewport, inner rounded-rect holes = excluded elements.
- Material class caches compiled shader variants by sorted keyword string key.
- Context loss/restore: handled via events. dispose() does NOT call loseContext(). Sticky mask texture is re-created on context restore.
- Texture unit budget: 0=dye, 1=bloom/various, 2=dithering(display), 3=sunrays, 4=containerMask, 5=distortionTexture, 6=velocity(distortion), 7=stickyMask.
- Random splat jitter: engine uses `baseInterval * (0.3 + rng() * 1.7)` for 0.3–2.0× organic timing variation.
- Playground: 4-tab mode toggle. Mode switch snapshots fluid physics when leaving fluid mode, applies mode-specific defaults when entering non-fluid modes. Only active tab's WebGL context renders. URL hash persists all state for sharing.
