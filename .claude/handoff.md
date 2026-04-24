# Session Handoff — 2026-04-24 (session 16)

## Project

svelte-fluid — WebGL Navier-Stokes fluid simulation as a Svelte 5 component library. MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.

Repo: github.com/tommyyzhao/svelte-fluid · Branch: main · Latest commit: adec2e4

## Current state

- 187 tests, all passing. 0 type errors. Build + publint clean.
- 10 presets: LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora, ToroidalTempest, CircularFluid, FrameFluid, AnnularFluid, SvgPathFluid
- 5 container shapes: circle, frame, roundedRect, annulus, svgPath (mask texture)
- Glass post-processing: hemisphere dome (circles) and rim model (all others)
- FluidReveal: multiplicative dissipation, customizable cover/accent colors (ADR-0029), iridescent fringes
- FluidDistortion: velocity-driven image warping with bleed, initial chaos, auto-distort (ADR-0030)
- FluidStick: physics-level dye sticking via mask texture — velocity damping fixed this session, tuning overhauled
- FluidBackground: full-viewport fluid with DOM exclusion zones
- 30 ADRs, 6 learning docs, architecture.md, porting-notes.md, contributing.md
- ~36 demo instances on the main page (4 sticky)
- Every demo card has `</>` code toggle + "Customize" button
- Playground with Fluid/Reveal mode toggle, accordion ControlPanel, URL hash state, `</>` code preview
- Floating `</>` button for FluidBackground code snippet
- 5 extra routes: `/background-fluid`, `/fluid-reveal/`, `/svelte-fluid`, `/svg`, `/sticky-tuning`
- CI runs tests + type-check + publint + build on every push. GitHub Pages auto-deploys.
- Package ready for `npm publish --access public --provenance`.

## What this session built

1. **Fixed sticky velocity advection** — The core physics bug: velocity advection had
   `uStickyStrength=0.0`, meaning velocity was completely unmodulated by the sticky
   mask. Splat-injected velocity freely advected dye OFF the mask each frame, even
   though dye dissipation was 1.0 (no fade). The fix:
   - Modified the advection shader in `shaders.ts` to support a velocity damping
     branch when `uStickyStrength < 0`: `dissipation * max(0.0, 1.0 + stickyVal * strength)`.
   - In `FluidEngine.ts` `step()`, velocity advection now passes
     `-(STICKY_STRENGTH * 0.8)` instead of `0.0`. With strength=0.95, on-mask
     velocity decays ~76%/frame — strong enough to prevent dye advection but
     allowing some residual flow for natural look.

2. **FluidStick tuning overhaul** — Comprehensive retuning of all FluidStick defaults:
   - `amplify`: 0.5 → 2.0 (3× on-mask dye boost instead of 1.5×)
   - `autoAnimateSpeed`: 1.0 → 2.0 (more Lissajous passes over text)
   - `autoAnimateDuration`: 3.5s → 5.0s (more time for dye accumulation)
   - `densityDissipation`: 0.78 → 0.85 (slower off-mask fade, ~500ms trail)
   - `splatRadius`: 0.6 → 1.0 (wider splats cover thin text strokes)
   - `splatForce`: 10000 → 6000 (gentler pointer-driven splats)
   - `strength`: 1.0 → 0.95 (slow visible decay on mask, ~5s to 10%)
   - Auto-animate velocity multiplier: 5× → 3× (less aggressive injection)
   - Random splats: `rate=0.6`, `count=3`, `swirl=150`, `spread=2.0`
     (intermittent bursts with gentle tangential velocity, full-canvas spawn)

3. **Added `maskPadding` / `StickyMask.padding`** — New prop controlling how much
   of the mask texture the text fills (text mode only). Default 0.9. Use 0.5 to fit
   text inside a circle container. Added to `StickyMask` type, `initStickyMaskTexture()`,
   `stickyMaskEqual()`, and `FluidStick.maskPadding` prop.

4. **Fixed "Sticky + circle" demo** — "HI" text was too large (100px) and clipped by
   the circle. Changed font to 72px and added `maskPadding={0.5}` so text fits
   comfortably inside the circle. Removed `strength={1.0}` from "Strong pressure" preset.

5. **Created `/sticky-tuning` test route** — 4 FluidStick cards (FLUID, HI+circle,
   lightning bolt, strong pressure), 5 preset buttons (New defaults, Old defaults,
   High pressure, Max amplify, Gentle+long), live parameter sliders. All cards
   have `autoPause={false}` for testing.

## Key files

| File | Role |
|------|------|
| src/lib/engine/FluidEngine.ts (~1750 LOC) | The engine: WebGL state, physics step, render, dispose, mask texture, glass pass, reveal path, distortion path, sticky mask (initStickyMaskTexture, bindStickyMask, step/splat uniform binding, velocity damping) |
| src/lib/Fluid.svelte (~440 LOC) | Svelte wrapper: DOM, ResizeObserver, adaptive resolution, lazy/autoPause, destructures ALL FluidConfig props including 5 sticky fields |
| src/lib/FluidStick.svelte (~250 LOC) | Fluid as sticky text/path: text/font/d rasterization via stickyMask, auto-animate Lissajous with duration/color-cycling, random splats with swirl, maskPadding prop |
| src/lib/FluidDistortion.svelte (~290 LOC) | Fluid as image distortion: bleed canvas, initial chaos splats, pointer-driven dye injection |
| src/lib/FluidReveal.svelte (~300 LOC) | Fluid as opacity mask: coverColor/accentColor, manual pointer handling, auto-reveal Lissajous |
| src/lib/FluidBackground.svelte (~180 LOC) | Full-viewport fluid background with DOM exclusion via CSS selector |
| src/lib/engine/gl-utils.ts | WebGL utilities: Material class (keyword shader variants), FBO create/resize/dispose |
| src/lib/engine/shaders.ts | All GLSL: advection (uStickyMask/uStickyStrength with velocity damping branch), pressure (uStickyMask/uStickyPressure), splat (uStickyMask/uStickyAmplify), display (REVEAL/DISTORTION branches), glass, container mask |
| src/lib/engine/types.ts | FluidConfig (with sticky* fields), StickyMask (with padding field), ResolvedConfig, ContainerShape, FluidHandle |
| src/lib/engine/container-shapes.ts | SDF evaluation, containerShapeEqual, stickyMaskEqual (includes padding), viewBoxEqual, maskAreaFraction |
| src/routes/+page.svelte (~1600 LOC) | Demo page: ~36 instances, FluidBackground wrapper, playground, 4 sticky cards |
| src/routes/sticky-tuning/+page.svelte (~270 LOC) | Sticky tuning test page: 4 cards, 5 presets, live sliders |

## What needs attention next

### Priority 1: FluidStick off-mask dye too weak (IMMEDIATE)

Cursor-driven splats in FluidStick canvases appear much weaker than standard Fluid
instances — dye seems to almost instantly dissipate outside the sticky text. This is
likely caused by the multiplicative dissipation mode (densityDissipation=0.85 means
dye is multiplied by 0.85 each frame off-mask ≈ 15%/frame fade, gone in ~300ms).

In standard Fluid, dissipation is subtractive (`1.0 / (1.0 + dissipation * dt)`)
which fades much more slowly. The multiplicative mode (activated by STICKY/REVEAL)
is fundamentally more aggressive.

Investigation approach:
- Compare multiplicative vs subtractive dissipation math at equal config values
- Consider whether FluidStick should use a different dissipation value for
  off-mask regions, or whether a separate "off-mask dissipation" parameter is needed
- The velocity damping (-0.8 * strength) also kills velocity on/near the mask,
  which could make cursor splats feel weaker near the text
- Test with densityDissipation=0.95 to see if slightly less fade helps
- May need to increase splatForce or splatRadius for pointer splats specifically

### Planned features

1. **npm publish** — Package is ready. Run `npm publish --access public --provenance`. Create a GitHub release with tag `v0.1.0`.
2. **Test gaps** — Priority 1: dispose() cleanup, setConfig() bucket transitions, context loss/restore. Priority 2: FluidBackground DOM exclusion, glass post-processing, distortion image loading.
3. **Changesets setup** — `@changesets/cli` for automated CHANGELOG + npm publish + GitHub releases.
4. **Playground distortion mode** — Add distortion as a third playground mode.
5. **Playground sticky mode** — Add sticky as a fourth playground mode with text/font/path controls.
6. **ADR-0031** — Document FluidStick architecture decisions (sticky mask rasterization, shader modulation approach, multiplicative mode choice, velocity damping).

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
  - **Mask texture** (svgPath): rasterized via OffscreenCanvas at canvas aspect ratio, uploaded as R8/LUMINANCE texture. Text mode uses alphabetic baseline with `(ascent - descent) / 2` offset.
- **Sticky mask**: separate from container mask. Rasterized via same OffscreenCanvas approach, uploaded to texture unit 7 with `UNPACK_ALIGNMENT=1`. Optional blur via blurMaskData(). `padding` field controls text fill fraction (default 0.9). Physics shaders sample this mask to modulate dissipation (advection), inject pressure (pressure Jacobi), and amplify splats (splat shader). **Velocity damping**: advection shader uses negative `uStickyStrength` to dampen velocity on the mask (~80%/frame with strength=1.0). All uniforms default to 0.0 when sticky is disabled — zero overhead.
- Glass post-processing: two models. Hemisphere (circles), Rim (all others). Requires container shape.
- Reveal mode: REVEAL keyword, multiplicative dissipation, coverColor - dye output.
- Distortion mode: DISTORTION keyword, dye.r as UV offset magnitude, velocity as direction.
- Sticky mode: no display keyword (purely physics-level). Uses multiplicative dissipation for dye. Velocity dissipation overridden to 0.98 in multiplicative mode. Velocity damped on mask via negative uStickyStrength.
- Transparent mode: `gl.clear(0,0,0,0)` replaces checkerboard.
- FluidBackground: evenodd SVG path mask. Outer rect = viewport, inner rounded-rect holes = excluded elements.
- Material class caches compiled shader variants by sorted keyword string key.
- Context loss/restore: handled via events. dispose() does NOT call loseContext(). Sticky mask texture is re-created on context restore.
- Texture unit budget: 0=dye, 1=bloom/various, 2=dithering(display), 3=sunrays, 4=containerMask, 5=distortionTexture, 6=velocity(distortion), 7=stickyMask.
