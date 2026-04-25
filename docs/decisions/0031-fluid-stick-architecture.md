# ADR 0031: FluidStick — physics-level dye sticking via mask texture

**Status:** Accepted
**Date:** 2026-04-25

## Context

The library has container shapes that *confine* fluid (circle, frame,
etc.) and FluidReveal/FluidDistortion that *repurpose* the dye field.
A missing mode is where dye *sticks* to a shape — fluid flows freely
everywhere, but dye accumulates and persists on a mask region, forming
visible text or paths from the natural simulation.

Unlike CSS masking or post-processing, this requires physics-level
intervention: the simulation shaders themselves must behave differently
inside vs. outside the mask.

## Decision

### Sticky mask texture

The mask is rasterized to an R8/LUMINANCE texture via `OffscreenCanvas`
at a configurable resolution (default 512), using the same pipeline as
`svgPath` container shapes. Two rasterization modes:

- **Text mode** (`text` + `font`): `ctx.fillText()` centered in the
  texture, with a `padding` parameter controlling fill fraction.
- **Path mode** (`d` + `viewBox`): `Path2D(d)` with viewBox mapping.
  `d` takes precedence when both are set.

An optional `blur` parameter softens mask edges via `blurMaskData()`.

The texture is uploaded to **texture unit 7** (the last guaranteed
WebGL unit). `UNPACK_ALIGNMENT` is set to 1 for the R8 format.
The mask data is stored in `maskData` for potential CPU-side sampling.

### Three-shader modulation approach

Rather than adding a display keyword (like REVEAL or DISTORTION),
sticky operates purely at the physics level. Three shaders sample the
mask texture and modulate their behavior:

**1. Advection shader (`uStickyMask`, `uStickyStrength`)**

Two roles via the sign of `uStickyStrength`:

- **Dye advection** (`uStickyStrength >= 0`): Multiplicative dissipation
  where `adjDissipation = mix(dissipation, 1.0, stickyVal * strength)`.
  On the mask, dissipation approaches 1.0 (no fade). Off the mask,
  dissipation stays at the configured value (0.98 default = 2%/frame).

- **Velocity advection** (`uStickyStrength < 0`): Velocity damping
  where `adjDissipation = dissipation * max(0, 1 + stickyVal * strength)`.
  With strength -1.0, velocity on the mask is damped by ~80%/frame.
  This prevents dye from being swept off the mask by momentum.

The engine calls advection twice per step (once for velocity, once for
dye) with the sign flipped, so both behaviors share one uniform.

**2. Pressure Jacobi solver (`uStickyMask`, `uStickyPressure`)**

Adds artificial positive pressure on the mask:
`pressure += stickyVal * uStickyPressure`. This creates a high-pressure
zone that deflects incoming velocity around the shape. Default 0.15.

**3. Splat shader (`uStickyMask`, `uStickyAmplify`)**

Amplifies splat intensity on the mask:
`splat *= 1.0 + stickyVal * uStickyAmplify`. More dye is deposited
where the mask is active, accelerating the "filling in" of the shape.
Default 2.0 in FluidStick (0.3 in raw engine config).

### Multiplicative dissipation mode

Sticky uses multiplicative dissipation (same as REVEAL mode):
`result *= dissipation` instead of `result / (1 + dissipation * dt)`.
The multiplicative approach gives exponential decay with predictable
per-frame behavior, making the on-mask/off-mask contrast controllable.

The engine activates multiplicative mode by setting `uMultiplicative`
to 1.0 when `STICKY` or `REVEAL` is enabled. Velocity dissipation is
overridden to 0.98 in this mode (known limitation — the
`velocityDissipation` prop is ignored).

### Zero-overhead when disabled

All sticky uniforms default to 0.0 when sticky mode is off. The mask
texture samples return 0.0. Each shader branch multiplies by the
uniform value, so the code paths are effectively no-ops: `mix(d, 1, 0)
= d`, `pressure += 0`, `splat *= 1 + 0`. No preprocessor guard or
keyword recompile is needed — the GPU cost is negligible.

### Config bucket classification

| Field | Bucket | Behavior |
|-------|--------|----------|
| `sticky` | Special | Triggers mask texture rebuild |
| `stickyMask` | Special | Triggers mask texture rebuild (equality check via `stickyMaskEqual`) |
| `stickyStrength` | A | Hot scalar |
| `stickyPressure` | A | Hot scalar |
| `stickyAmplify` | A | Hot scalar |

### FluidStick.svelte component

Wraps `<Fluid>` with `sticky={true}` and tuned defaults:

| Prop | FluidStick default | Engine default | Rationale |
|------|-------------------|----------------|-----------|
| `densityDissipation` | 0.98 | 1.0 | 2%/frame off-mask fade |
| `curl` | 20 | 30 | Visible swirl, not overwhelming |
| `splatRadius` | 1.0 | 0.25 | Large splats cover mask area |
| `stickyStrength` | 0.95 | 0.9 | Strong persistence |
| `stickyAmplify` | 2.0 | 0.3 | Aggressive mask filling |
| `randomSplatRate` | 0.4 | 0 | Continuous dye supply |
| `randomSplatCount` | 3 | 1 | Multiple per burst |
| `randomSplatSwirl` | 500 | 0 | Tangential velocity |
| `randomSplatSpread` | 2.0 | 0.1 | Full-canvas coverage |
| `splatOnHover` | true | false | Interactive by default |
| `bloom` / `sunrays` | false | true | Clean text appearance |

Auto-animation (Lissajous curve) runs for a configurable duration
(default 5s), depositing color-cycling dye. Once the animation stops,
off-mask dye fades via multiplicative dissipation while on-mask dye
persists, gradually revealing the sticky shape. User interaction
cancels the auto-animation immediately.

### Texture unit budget

Sticky mask uses unit 7. The full budget:
0=dye, 1=bloom/various, 2=dithering, 3=sunrays, 4=containerMask,
5=distortionTexture, 6=velocity(distortion), 7=stickyMask. All 8
guaranteed units are allocated.

## Consequences

**Positive:**
- Physics-level sticking looks organic — dye genuinely accumulates
  rather than being post-processed
- Composable with container shapes, bloom, sunrays, and glass
- Zero overhead when disabled (no keyword recompile, negligible GPU cost)
- Same mask rasterization infrastructure as svgPath containers

**Negative:**
- Velocity dissipation override (0.98 hardcoded in multiplicative mode)
  means the `velocityDissipation` prop is silently ignored
- Texture unit 7 is the last guaranteed slot — no room for additional
  texture-based features without checking `MAX_COMBINED_TEXTURE_IMAGE_UNITS`
- Mutually exclusive with REVEAL and DISTORTION display modes
  (sticky has no display keyword, but shares multiplicative dissipation)

**Rejected alternatives:**
- *Display shader approach:* A `STICKY` display keyword that composites
  the mask in the fragment shader. Rejected because sticking is a physics
  behavior, not a visual effect — the dye should genuinely persist, not
  just be rendered differently.
- *Separate FBO for mask:* Rendering the mask as an FBO and blending
  during the display pass. Rejected because it doesn't give the organic
  accumulation behavior and wastes a texture unit + memory.
- *Post-processing mask clip:* Applying the mask as a final alpha clip.
  Rejected because it's visually flat — the fluid doesn't interact with
  the shape at all.
