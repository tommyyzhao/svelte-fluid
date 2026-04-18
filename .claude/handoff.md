# Session Handoff — 2026-04-17 (session 2)

## Project

svelte-fluid — WebGL Navier-Stokes fluid simulation as a Svelte 5 component library. MIT licensed, derived from PavelDoGreat/WebGL-Fluid-Simulation.

Repo: github.com/tommyyzhao/svelte-fluid · Branch: main · Latest commit: b98cf8a

## Current state

- 126 tests, all passing. 0 type errors. Build + publint clean.
- 9 presets: LavaLamp, Plasma, InkInWater, FrozenSwirl, Aurora, CircularFluid, FrameFluid, AnnularFluid, SvgPathFluid
- 5 container shapes: circle, frame (with inner+outer rounding), roundedRect, annulus, svgPath (mask texture)
- Glass post-processing layer with two models: hemisphere orb (circles) and rim (all others)
- 26 ADRs, 6 learning docs, architecture.md, porting-notes.md, contributing.md
- 19 demo instances on the demo page (5 presets + 4 config + 5 shapes + 4 effects + 1 playground)
- 2 extra routes: `/svelte-fluid` (fluid-filled text demo), `/svg` (SVG path test cases)
- CI runs tests + type-check + publint + build on every push.
- GitHub Pages auto-deploys the demo site.

## What this session built

1. **Glass refraction/reflection post-processing layer** (ADR-0025): new `glass` prop enables a post-processing pass after `drawDisplay`. When active, the scene renders to a `sceneFBO` (RGBA8, canvas resolution), then a `drawGlass` pass reads it with refraction + specular and writes to the final target.

2. **Hemisphere orb model for circles**: Full-surface glass dome using Snell's law via GLSL `refract()`. The hemisphere normal `vec3(pn, sqrt(1 - r²))` gives physically correct lens distortion — zero at center, increasing compression toward the rim. Fresnel (`1 - cosI` via Schlick) covers the entire surface, strongest at the rim.

3. **Rim model for non-circle shapes**: Frame, roundedRect, annulus, and svgPath use a boundary-band approach with SDF-based normals via central differences. Glass band width controlled by `glassThickness`.

4. **Chromatic aberration** (`glassChromatic` prop, 0–1): Samples R/G/B at different refraction strengths (red least, blue most — physical dispersion order). Produces prismatic rainbow fringing. Spread multiplier: 0.15 for orb, 0.5 for rim.

5. **Fluid-driven lighting**: All specular and rim glow are modulated by `fluidLight = dot(refracted, luminanceWeights)`. No fluid = no highlights. Eliminates phantom bright outlines on dark backgrounds. The glass "catches" light from the fluid itself, creating highlights that shimmer dynamically.

6. **Dual specular for fishbowl effect**: Focused (shininess 128) for the apex highlight + broad (shininess 8, rim-weighted) for the glass wall shine. Both fluid-driven.

7. **Five new config fields**: `glass` (boolean gate, triggers sceneFBO alloc), `glassThickness` (0.04), `glassRefraction` (0.4, maps to IOR 1.0–2.0), `glassReflectivity` (0.12, Fresnel F0), `glassChromatic` (0.15, chromatic aberration). All Bucket A except `glass` which triggers sceneFBO lifecycle.

8. **`setContainerShapeUniforms()` extraction**: The 40-line container shape uniform block from `drawDisplay` is now a shared helper, reused by `drawGlass` (different texture unit for mask).

9. **New "Container effects" demo section**: 4 cards showcasing different use cases — Crystal orb (heavy refraction + chromatic), Soft lens (subtle dome), Portal ring (annulus rim), Glass frame (frame rim). 19 total instances.

10. **Frame shape SDF**: The glass shader's `containerSDF()` includes proper signed distance for frame shapes: `max(-innerDist, outerDist)` using `roundedBoxSDF()`.

## Key files

| File | Role |
|------|------|
| src/lib/engine/FluidEngine.ts (~1600 LOC) | The engine: WebGL state, physics step, render, dispose, mask texture, glass pass, splatOnHover |
| src/lib/Fluid.svelte (~400 LOC) | Svelte wrapper: DOM, ResizeObserver, adaptive resolution, lazy/autoPause |
| src/lib/engine/gl-utils.ts | WebGL utilities: Material class, FBO create/resize/dispose, shader compile |
| src/lib/engine/shaders.ts | All GLSL shader sources (22 shaders + glass shader + container mask branches) |
| src/lib/engine/types.ts | FluidConfig (incl. glass + svgPath), ContainerShape (5 variants), FluidHandle |
| src/lib/engine/container-shapes.ts | TypeScript SDF mirrors, MaskContext, containerMask(), maskAreaFraction() |
| src/lib/presets/*.svelte (9 files) | Preset wrapper components (incl. SvgPathFluid) |
| src/routes/+page.svelte | Demo page with 19 instances |
| src/routes/svelte-fluid/+page.svelte | Fluid-filled "SVELTE FLUID" text demo |
| src/routes/svg/+page.svelte | SVG path test cases |
| src/routes/components/ControlPanel.svelte | Playground control panel with buildSnippet |
| docs/architecture.md | Start here for understanding the system |
| docs/decisions/README.md | Index of 26 ADRs |

## What needs attention next

### Planned features (from user)

1. **Visual tuning of glass defaults** — the effect works but the default parameter values may need iteration after visual testing across different presets and background colors. The refraction scale (0.5), chromatic spread (0.15), and rim glow intensity (0.25) were tuned analytically, not by eye.

2. **Mouse-tracked specular** — pass cursor position as a uniform so the specular highlight moves across the dome surface as you hover. Transforms the static effect into an interactive object. One uniform per frame.

3. **Glass + transparent mode** — currently unsupported (the checkerboard pass requires `target == null` which conflicts with sceneFBO routing). Could be fixed by adjusting the `render()` target logic.

### Known issues

4. **npm publish** — package is ready. Run `npm publish --access public --provenance`.
5. **19 demo instances** — approaching browser's ~16 WebGL context limit. Lazy loading mitigates but fast scrolling can still hit the cap. Consider reducing or consolidating.
6. **Black void between sections on demo** — lazy canvases tear down to black against black page background. A placeholder/skeleton for torn-down cards would fix this.
7. **`glassThickness` is unused for circles** — the hemisphere model covers the full surface. Document this clearly or repurpose the prop (e.g., glass depth that affects refraction scale).

### Follow-ups

8. **Test gaps** — no WebGL context loss tests, no engine unit tests, no splat/disposal tests. Tests only cover FluidHandle interface shape and container-shape geometry. Glass has zero automated tests (shader logic is untestable without WebGL).
9. **Playground glass controls** — ControlPanel doesn't have UI for glass props. Add sliders for refraction/chromatic/reflectivity when glass is toggled on.
10. **SDF texture upgrade** — for higher-quality svgPath glass, generate an SDF texture via EDT instead of binary mask + LINEAR filtering. Would also enable distance-based effects.
11. **Consider changesets** for automated CHANGELOG + GitHub Releases.
12. **Named glass presets** — `glass="crystal"`, `glass="frosted"`, `glass="orb"` for better DX. The boolean + 4 numeric props model works but is less approachable than named modes.
13. **Interior tint** — glass color tint that deepens toward center (longer optical path). Deferred from v1 due to RGB convention confusion.
14. **Animated specular drift** — slow sinusoidal light direction movement creates sense of environmental reflection changing. Nearly free (one sin/cos per frame).

## Lessons learned this session

- **The 2D SDF gradient is a cylinder wall normal, not a dome normal.** For circles, the SDF gradient points radially outward from the boundary — correct for a glass tube, wrong for a glass orb. The hemisphere normal `vec3(pn, sqrt(1-r²))` is needed for the dome illusion.
- **Chromatic aberration multipliers must be aggressive.** Initial value 0.04 (4% eta spread) was invisible. Needed 0.15 (15%) for visible rainbow fringing. The refraction scale similarly needed 0.5 (not 0.2) for visible lens distortion.
- **Edge fade kills the best part of the effect.** The glass band's strongest refraction is at the rim, but aggressive edge fading (smoothstep at 98%) cut it off. Since refracted UVs point inward (sampling valid fluid pixels), the fade should be minimal — just enough for AA (smoothstep at 99–100%).
- **Specular without scene content = phantom outlines.** All additive lighting (specular, rim glow) must be modulated by the scene brightness. Without an environment map, there's no external light source to justify highlights on empty glass.
- **Plan reviews with opposing perspectives catch real bugs.** The GPU engineer caught the frame SDF omission, Fresnel inversion, and RGBA16F waste. The designer caught the jargon API and the reflection being fake. Both perspectives were needed.

## Architecture quick-reference

- Engine is per-instance, no module-level mutable state. Each canvas gets its own WebGL context.
- Fluid.svelte applies adaptive resolution in instantiate() before constructing the engine — caps textures to canvas pixel size, suppresses expensive effects on small canvases.
- Resize: teardown immediately (blank canvas), debounce rebuild by 150ms.
- setConfig() has 4 buckets: A (scalars incl. splatOnHover, glass params, picked up next frame), B (keyword recompile), C (FBO rebuild), D (construct-only). Additionally, svgPath shape changes trigger mask texture rebuild, and `glass` toggle triggers sceneFBO alloc/dispose.
- Container shapes: two approaches coexist:
  - **Analytical** (circle/frame/roundedRect/annulus): SDF computed per-fragment in shaders, mirrored in TypeScript for rejection sampling.
  - **Mask texture** (svgPath): rasterized via OffscreenCanvas at canvas aspect ratio, uploaded as R8/LUMINANCE texture.
- Glass post-processing: two models coexist:
  - **Hemisphere orb** (circles): Snell's law refract() with hemisphere normal, full-surface Fresnel + chromatic aberration + fluid-driven specular.
  - **Rim** (all others): SDF boundary band, central-difference normals, chromatic rim refraction.
- Both use the same `CONTAINER_MASK` keyword for display shader compilation.
- Material class caches compiled shader variants by sorted keyword string key.
- Context loss/restore: handled via webglcontextlost/webglcontextrestored events. dispose() does NOT call loseContext().
- `splatOnHover`: handleMouseMove auto-inits pointer on first hover, handleMouseLeave resets.
- Demo page: 19 instances (5 presets + 4 config w/ splatOnHover + 5 shapes + 4 effects + 1 playground), all lazy.
