# ADR 0030: FluidDistortion — velocity-driven image warping

**Status:** Accepted
**Date:** 2026-04-23

## Context

The library has FluidReveal (ADR-0027) which uses the dye field as an
opacity mask. A common creative-coding effect is to use the fluid
*velocity* field to distort an underlying image — cursor interaction
creates ripples that warp the image like liquid glass.

Ksenia Kondrashova's "Liquid Distortion Effect (WebGL)" CodePen
demonstrates this technique on top of the same Navier-Stokes
simulation. We want to bring this as a first-class component.

## Decision

### New display mode: `DISTORTION`

Add a `DISTORTION` keyword to the display shader, mutually exclusive
with `REVEAL` via `#ifdef DISTORTION / #elif defined(REVEAL) / #else`.

The distortion shader:
1. Reads `dye.r` as a scalar distortion intensity (not color)
2. Reads `velocity.xy` as the distortion direction
3. Offsets image UV coordinates by `normalize(velocity) * dye.r * power`
4. Samples the distortion image texture at the offset UVs
5. Applies soft edge fadeout and container mask

### Image texture management

The engine loads an image from a URL asynchronously (like the dithering
texture pattern). The `distortionImageUrl` config field triggers
`loadDistortionImage()` which creates an `Image`, sets `crossOrigin`,
and uploads to a GL texture on load. Stale loads are discarded if the
URL changes while loading. The texture is re-created on context restore.

### Image fit modes

Two fit modes handle aspect ratio mismatch:
- **cover** (default): image fills the canvas, cropping if needed
- **contain**: full image visible, may have empty borders

A `distortionScale` uniform allows zooming in/out. Values > 1 zoom out
(useful to prevent edge smearing during distortion).

### Config bucket classification

| Field | Bucket | Behavior |
|-------|--------|----------|
| `distortion` | B | Keyword recompile |
| `distortionPower` | A | Hot scalar |
| `distortionFit` | A | Hot scalar (uniform) |
| `distortionScale` | A | Hot scalar |
| `distortionImageUrl` | Special | Async image load + texture upload |

### FluidDistortion.svelte component

Follows the FluidReveal pattern:
- Wraps `<Fluid>` with `distortion={true}`
- Handles pointer events manually (like FluidReveal)
- Injects scalar dye `{ r: intensity * 0.001, g: 0, b: 0 }` per interaction
- Supports auto-distort animation (Lissajous curve, stops on interaction)
- Tuned defaults: `curl: 0`, `bloom: false`, `densityDissipation: 0.98`

### Render path

Like REVEAL, distortion returns early from `render()` — no background
color, no glass, no checkerboard. The canvas shows only the distorted
image (with alpha at edges for CSS compositing).

## Consequences

**Positive:**
- New creative component with clean API matching existing patterns
- Reuses 100% of existing engine infrastructure (velocity + dye fields)
- No new FBOs required — dye buffer repurposed as distortion intensity
- Container shapes work naturally (cmask clips the distorted image)

**Negative:**
- DISTORTION and REVEAL are mutually exclusive
- Image loading is async — first frame may render before image is ready
- Glass post-processing not supported in distortion mode (v1)

**Rejected alternatives:**
- *Separate engine for distortion:* Too much duplication. The existing
  engine already computes the velocity field we need.
- *Video/canvas as distortion source:* Deferred to future work. Would
  require per-frame texture updates.
