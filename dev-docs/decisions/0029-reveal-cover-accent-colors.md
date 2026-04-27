# ADR-0029: Reveal cover and accent color customization

**Status:** Accepted
**Date:** 2026-04-23

## Context

The REVEAL display shader hardcoded `vec4(1.0 - c, alpha)` — white cover,
blue-ish iridescent fringes from the inverted warm dye color
`{0.95, 0.84, 0.68}`. Users wanted to customize both the cover color
(the solid layer before scratching) and the accent/fringe color at
scratch edges.

## Decision

### Cover color — engine-level uniform

Added `revealCoverColor: RGB` to `FluidConfig` (Bucket A). The shader
now uses `max(uRevealCoverColor - c, vec3(0.0))` instead of `1.0 - c`.
Default `{r:1, g:1, b:1}` preserves identical behavior.

### Accent color — FluidReveal-level derived dye

The accent color does NOT need an engine uniform. The display shader
already outputs `coverColor - dyeColor` at the fringes. By computing
`dyeColor = coverColor - accentColor` in FluidReveal, the shader
naturally produces the desired accent at full dye intensity.

`FluidReveal` gains `coverColor` and `accentColor` props. The dye
injection color is derived: `max(cover - accent, 0)` per channel.
Default accent `{0.05, 0.16, 0.32}` produces dye `{0.95, 0.84, 0.68}`
— the original `REVEAL_DYE` constant.

## Why not a shader-level accent uniform?

An earlier iteration used `mix(coverColor, accentColor, revealAmount)`
in the shader. This produced soft, featureless blends and lost the
crisp per-channel iridescence of `coverColor - c`. The subtraction
formula preserves the original visual quality because each RGB channel
of the dye fades independently, creating natural color variation at
the fringe.

## Consequences

- Default behavior is pixel-identical to pre-change.
- `Fluid.svelte` must destructure and forward `revealCoverColor` in
  both the props and `buildConfig()`.
- Accent colors brighter than the cover in any channel produce zero
  dye in that channel (clamped). This is acceptable; the user can't
  create fringes brighter than the cover in a given channel.
