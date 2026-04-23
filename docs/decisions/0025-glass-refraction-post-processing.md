# ADR 0025: Glass refraction/reflection post-processing layer

**Status:** Accepted
**Date:** 2026-04-17

## Context

Container shapes confine fluid within geometric boundaries. The visual boundary
is currently a hard alpha edge produced by the `CONTAINER_MASK` branch of the
display shader. Users want the container to look like a glass vessel — with
Fresnel-modulated specular highlights and refraction distortion at the walls.

The effect must work for all 5 shape types (circle, frame, roundedRect, annulus,
svgPath) and compose correctly with existing post-processing (bloom, sunrays,
shading).

## Decision

Add a **separate post-processing pass** after `drawDisplay`:

1. **SceneFBO routing.** When `glass` is true and a container shape is active,
   `drawDisplay` renders to a temporary `sceneFBO` (RGBA8, canvas resolution)
   instead of the final target. A new `drawGlass` pass reads `sceneFBO`,
   applies the glass effect, and writes to the final target. When glass is
   disabled, `drawDisplay` renders directly to the target (zero overhead).

2. **Two rendering models, gated on shape type:**

   - **Hemisphere orb model** (circles, `uContainerShapeType == 0`): Models the
     container as a 3D glass dome. The surface normal at each point is the
     hemisphere normal `vec3(pn, sqrt(1 - |pn|²))`, giving a smooth dome that
     tilts from straight-up at center to horizontal at the rim. Refraction uses
     GLSL `refract()` (Snell's law) with the hemisphere normal and view
     direction `(0,0,-1)`. The effect covers the **entire surface**, not just a
     boundary band — center content shows slight magnification, rim content
     compresses inward. Fresnel, specular, and chromatic aberration all vary
     smoothly across the full dome.

   - **Rim model** (frame, roundedRect, annulus, svgPath): Models the container
     walls as glass tubes. The effect is limited to a narrow band at the
     boundary via `glassMask = 1 - smoothstep(0, thickness, abs(sdf))`. Normals
     are derived from the 2D SDF gradient via central differences. Refraction
     offsets UVs along the gradient direction. This is the correct model for
     shapes without a natural dome interpretation.

3. **Chromatic aberration.** Both models sample R, G, B channels at slightly
   different refraction strengths (red least, blue most — matching physical
   dispersion). This produces prismatic rainbow fringing that is the single
   strongest perceptual cue for glass/crystal. Controlled by `glassChromatic`
   (0–1, default 0.15).

4. **Edge luminance boost (rim glow).** An additive bright rim computed from
   `pow(1 - cosI, 3)` (orb) or `glassMask * fresnel` (rim). Models light
   concentrating at grazing edges through caustics.

5. **Correct Fresnel.** Schlick approximation using the physically correct
   angle: `cosI = N.z` for the orb model (covers entire surface, strongest at
   rim), `cosTheta = abs(sdf) / thickness` for the rim model (strongest at
   boundary center).

6. **Snell's law via `refract()`.** The orb model uses GLSL's built-in
   `refract(I, N, eta)` for physically accurate ray bending. Total internal
   reflection at the extreme rim (where `sinT² > 1`) causes `refract()` to
   return `vec3(0)`, naturally falling back to the un-refracted scene.

7. **Five config fields:**
   - `glass: boolean` (default false) — gate. Triggers sceneFBO alloc/dispose.
   - `glassThickness: number` (default 0.04) — rim model band width. Bucket A.
     Ignored by the orb model (dome covers entire surface).
   - `glassRefraction: number` (default 0.4, range 0–1) — distortion strength.
     Mapped internally to IOR 1.0–2.0. Bucket A.
   - `glassReflectivity: number` (default 0.12, range 0–1) — Fresnel F0 for
     specular intensity. Bucket A.
   - `glassChromatic: number` (default 0.15, range 0–1) — chromatic aberration
     strength. Bucket A.

8. **Fluid-driven lighting.** All additive highlights (specular, rim glow) are
   modulated by `fluidLight = dot(refracted, luminanceWeights)` — the
   perceptual brightness of the refracted fluid at that point. When no fluid
   is present, `fluidLight = 0` and the glass is invisible (pure distortion
   only). This eliminates phantom bright outlines on dark backgrounds. The
   glass "catches" light from the fluid itself, creating highlights that
   shimmer and move with the simulation. No fictional external light sources.

9. **Light direction** is a shader uniform (`vec3(0.3, 0.7, 0.6)` normalized),
   not exposed as a prop. It only affects the *distribution* of fluid-driven
   highlights across the surface, not their intensity.

10. **SceneFBO is RGBA8**, not RGBA16F. The display shader applies `linearToGamma`
    so its output is LDR gamma-space — half-float wastes 2x bandwidth.

## Consequences

**Positive:**
- Circles get a physically convincing glass dome with proper lens magnification,
  Fresnel rim brightening, focused specular, and chromatic aberration.
- Non-circle shapes get an appropriate rim-refraction model.
- Zero overhead when disabled (no FBO, no extra pass).
- Hot-updatable scalar parameters (all Bucket A).
- Composes naturally with bloom/sunrays since it reads the fully-composited scene.

**Negative:**
- One extra full-screen blit + one RGBA8 FBO at canvas resolution when enabled.
- 4 texture samples per fragment (scene + 3 chromatic channels).
- svgPath glass band width is constrained by mask texture resolution (~1-2 texels
  of gradient from LINEAR filtering), not by `glassThickness`.
- `transparent` mode + `glass` is not supported (the checkerboard pass requires
  `target == null` which conflicts with sceneFBO routing).
- `glassThickness` has no effect on circles (hemisphere covers the full surface).

**Rejected alternatives:**
- *Single rim model for all shapes:* Produces a flat disk with beveled edges on
  circles, not a convincing glass orb. The hemisphere model is essential for the
  dome illusion.
- *Integrating glass into the display Material:* Requires reading the composited
  scene to compute refraction offsets — chicken-and-egg with the display output.
- *Fake reflection via mirrored UV sampling:* Produces a smeared duplicate of
  the fluid, not a convincing reflection.
- *`glassTint` prop:* Deferred to v2. RGB convention confusion (0–255 vs 0–1).
